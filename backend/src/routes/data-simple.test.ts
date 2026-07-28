import express from "express";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it, vi } from "vitest";
import axios from "axios";
import router from "./data-simple";

vi.mock("axios", () => ({
  default: {
    get: vi.fn(),
  },
}));

const mockedGet = vi.mocked(axios.get);

async function post(path: string, body: unknown, authorization?: string) {
  const app = express();
  app.use(express.json());
  app.use(router);

  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const { port } = server.address() as AddressInfo;

  try {
    const response = await fetch(`http://127.0.0.1:${port}${path}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(authorization ? { authorization } : {}),
      },
      body: JSON.stringify(body),
    });

    return {
      status: response.status,
      body: await response.json(),
    };
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
}

function yahooForbidden() {
  return Object.assign(new Error("Request failed with status code 403"), {
    response: { status: 403 },
  });
}

function upstreamFailure(status: number) {
  return Object.assign(new Error(`Request failed with status code ${status}`), {
    response: { status },
  });
}

afterEach(() => {
  vi.restoreAllMocks();
  mockedGet.mockReset();
});

describe("Yahoo routes", () => {
  it("returns an explicit 503 when Yahoo blocks the connection test", async () => {
    mockedGet.mockRejectedValueOnce(yahooForbidden());

    const response = await post("/test-connection", {
      source: "yahoo",
      type: "REST API",
    });

    expect(response.status).toBe(503);
    expect(response.body).toMatchObject({
      success: false,
      code: "SOURCE_AUTH_FAILED",
      message: "Yahoo Finance is unavailable from the current network",
      source: "yahoo",
      retryable: false,
      upstreamStatus: 403,
    });
    expect(response.body).not.toHaveProperty("data");
  });

  it("does not report random fallback sample data as a success", async () => {
    mockedGet.mockRejectedValueOnce(new Error("socket timeout"));

    const response = await post("/sample", {
      source: "yahoo",
      symbol: "AAPL",
      limit: 5,
    });

    expect(response.status).toBe(502);
    expect(response.body).toMatchObject({
      success: false,
      code: "SOURCE_UNREACHABLE",
      message: "Failed to retrieve Yahoo Finance sample data",
      source: "yahoo",
      retryable: true,
    });
    expect(response.body).not.toHaveProperty("data");
  });

  it("maps a Yahoo 403 sample response to the same explicit 503", async () => {
    mockedGet.mockRejectedValueOnce(yahooForbidden());

    const response = await post("/sample", {
      source: "yahoo",
      symbol: "AAPL",
      limit: 5,
    });

    expect(response.status).toBe(503);
    expect(response.body).toMatchObject({
      success: false,
      code: "SOURCE_AUTH_FAILED",
      message: "Yahoo Finance is unavailable from the current network",
      source: "yahoo",
      retryable: false,
      upstreamStatus: 403,
    });
    expect(response.body).not.toHaveProperty("data");
  });

  it("classifies malformed Yahoo sample records as no data", async () => {
    mockedGet.mockResolvedValueOnce({
      status: 200,
      statusText: "OK",
      headers: {},
      data: {
        chart: {
          result: [
            {
              timestamp: ["not-a-timestamp"],
              indicators: { quote: [{}] },
            },
          ],
          error: null,
        },
      },
    });

    const response = await post("/sample", {
      source: "yahoo",
      symbol: "AAPL",
      limit: 5,
    });

    expect(response.status).toBe(502);
    expect(response.body).toMatchObject({
      success: false,
      code: "NO_DATA",
      source: "yahoo",
      retryable: false,
    });
    expect(response.body).not.toHaveProperty("data");
  });

  it("rejects Yahoo timestamps without a usable quote", async () => {
    mockedGet.mockResolvedValueOnce({
      status: 200,
      statusText: "OK",
      headers: {},
      data: {
        chart: {
          result: [
            {
              timestamp: [1_700_000_000],
              indicators: { quote: [{}] },
            },
          ],
          error: null,
        },
      },
    });

    const response = await post("/sample", {
      source: "yahoo",
      symbol: "AAPL",
      limit: 5,
    });

    expect(response.status).toBe(502);
    expect(response.body).toMatchObject({
      success: false,
      code: "NO_DATA",
      source: "yahoo",
    });
    expect(response.body).not.toHaveProperty("data");
  });

  it.each([
    [
      "sample",
      "/sample",
      { source: "yahoo", symbol: "MSFT", limit: 5 },
    ],
    [
      "market API",
      "/test-api",
      {
        source: "yahoo",
        apiType: "market",
        symbol: "MSFT",
        interval: "1d",
      },
    ],
    [
      "historical API",
      "/test-api",
      {
        source: "yahoo",
        apiType: "historical",
        symbol: "MSFT",
        interval: "1d",
      },
    ],
    [
      "realtime API",
      "/test-api",
      {
        source: "yahoo",
        apiType: "realtime",
        symbol: "MSFT",
        interval: "1m",
      },
    ],
  ])("requests the selected Yahoo symbol for %s", async (_name, path, body) => {
    mockedGet.mockRejectedValueOnce(new Error("socket timeout"));

    await post(path, body);

    expect(mockedGet).toHaveBeenCalledOnce();
    expect(mockedGet.mock.calls[0][0]).toBe(
      "https://query1.finance.yahoo.com/v8/finance/chart/MSFT",
    );
  });

  it("never logs the incoming Authorization header", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    mockedGet.mockResolvedValueOnce({
      status: 200,
      statusText: "OK",
      headers: {},
      data: { chart: { result: [{}], error: null } },
    });

    const response = await post(
      "/test-connection",
      { source: "yahoo", type: "REST API" },
      "Bearer top-secret",
    );

    expect(response.status).toBe(200);
    expect(JSON.stringify(log.mock.calls)).not.toContain("top-secret");
  });
});

describe("source validation", () => {
  it("rejects a missing source before making an upstream request", async () => {
    const response = await post("/sample", {
      symbol: "BTCUSDT",
      limit: 5,
    });

    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({
      success: false,
      code: "INVALID_REQUEST",
    });
    expect(response.body).not.toHaveProperty("data");
    expect(mockedGet).not.toHaveBeenCalled();
  });

  it("rejects an unknown source before making an upstream request", async () => {
    const random = vi.spyOn(Math, "random");

    const response = await post("/sample", {
      source: "mystery-provider",
      symbol: "BTCUSDT",
      limit: 5,
    });

    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({
      success: false,
      code: "INVALID_SOURCE",
      source: "mystery-provider",
    });
    expect(response.body).not.toHaveProperty("data");
    expect(mockedGet).not.toHaveBeenCalled();
    expect(random).not.toHaveBeenCalled();
  });

  it.each(["okx", "huobi", "bybit", "binance-websocket"])(
    "returns 501 for the known but unimplemented %s sample source",
    async (source) => {
      const random = vi.spyOn(Math, "random");

      const response = await post("/sample", {
        source,
        symbol: "BTCUSDT",
        limit: 5,
      });

      expect(response.status).toBe(501);
      expect(response.body).toMatchObject({
        success: false,
        code: "SOURCE_NOT_IMPLEMENTED",
        source,
      });
      expect(response.body).not.toHaveProperty("data");
      expect(mockedGet).not.toHaveBeenCalled();
      expect(random).not.toHaveBeenCalled();
    },
  );

  it("normalizes source before routing", async () => {
    mockedGet.mockRejectedValueOnce(new Error("socket timeout"));

    const response = await post("/sample", {
      source: "  BiNaNcE  ",
      symbol: "BTCUSDT",
      limit: 5,
    });

    expect(response.status).toBe(502);
    expect(response.body).toMatchObject({
      success: false,
      code: "SOURCE_UNREACHABLE",
      source: "binance",
    });
    expect(mockedGet).toHaveBeenCalledOnce();
  });
});

describe("Binance routes", () => {
  it("does not turn a sample timeout into generated success data", async () => {
    const random = vi.spyOn(Math, "random");
    mockedGet.mockRejectedValueOnce(new Error("socket timeout"));

    const response = await post("/sample", {
      source: "binance",
      symbol: "BTCUSDT",
      limit: 5,
    });

    expect(response.status).toBe(502);
    expect(response.body).toMatchObject({
      success: false,
      code: "SOURCE_UNREACHABLE",
      source: "binance",
      retryable: true,
    });
    expect(response.body).not.toHaveProperty("data");
    expect(random).not.toHaveBeenCalled();
  });

  it.each([
    [403, 503, "SOURCE_AUTH_FAILED", false],
    [429, 503, "SOURCE_RATE_LIMITED", true],
    [500, 502, "SOURCE_UNREACHABLE", true],
  ])(
    "maps a sample upstream %i without fallback data",
    async (upstreamStatus, expectedStatus, code, retryable) => {
      const random = vi.spyOn(Math, "random");
      mockedGet.mockRejectedValueOnce(upstreamFailure(upstreamStatus));

      const response = await post("/sample", {
        source: "binance",
        symbol: "BTCUSDT",
        limit: 5,
      });

      expect(response.status).toBe(expectedStatus);
      expect(response.body).toMatchObject({
        success: false,
        code,
        source: "binance",
        retryable,
        upstreamStatus,
      });
      expect(response.body).not.toHaveProperty("data");
      expect(random).not.toHaveBeenCalled();
    },
  );

  it("rejects a Binance sample row with no usable values", async () => {
    mockedGet.mockResolvedValueOnce({
      status: 200,
      statusText: "OK",
      headers: {},
      data: [[null, null, null, null, null, null]],
    });

    const response = await post("/sample", {
      source: "binance",
      symbol: "BTCUSDT",
      limit: 5,
    });

    expect(response.status).toBe(502);
    expect(response.body).toMatchObject({
      success: false,
      code: "NO_DATA",
      source: "binance",
    });
    expect(response.body).not.toHaveProperty("data");
  });

  it.each(["market", "historical", "realtime"])(
    "returns an operational error for a %s API upstream failure",
    async (apiType) => {
      const random = vi.spyOn(Math, "random");
      mockedGet.mockRejectedValueOnce(new Error("socket timeout"));

      const response = await post("/test-api", {
        source: "binance",
        apiType,
        symbol: "BTCUSDT",
        interval: "1d",
      });

      expect(response.status).toBe(502);
      expect(response.body).toMatchObject({
        success: false,
        code: "SOURCE_UNREACHABLE",
        source: "binance",
        retryable: true,
      });
      expect(response.body).not.toHaveProperty("data");
      expect(random).not.toHaveBeenCalled();
    },
  );

  it("rejects an invalid API type before making an upstream request", async () => {
    const random = vi.spyOn(Math, "random");

    const response = await post("/test-api", {
      source: "binance",
      apiType: "fundamentals",
      symbol: "BTCUSDT",
      interval: "1d",
    });

    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({
      success: false,
      code: "INVALID_API_TYPE",
      source: "binance",
    });
    expect(response.body).not.toHaveProperty("data");
    expect(mockedGet).not.toHaveBeenCalled();
    expect(random).not.toHaveBeenCalled();
  });

  it("maps a connection upstream failure without generated state", async () => {
    const random = vi.spyOn(Math, "random");
    mockedGet.mockRejectedValueOnce(upstreamFailure(403));

    const response = await post("/test-connection", {
      source: "binance",
      type: "REST API",
    });

    expect(response.status).toBe(503);
    expect(response.body).toMatchObject({
      success: false,
      code: "SOURCE_AUTH_FAILED",
      source: "binance",
      retryable: false,
      upstreamStatus: 403,
    });
    expect(response.body).not.toHaveProperty("data");
    expect(random).not.toHaveBeenCalled();
  });

  it("returns 501 for an unimplemented connection without randomness", async () => {
    const random = vi.spyOn(Math, "random");

    const response = await post("/test-connection", {
      source: "okx",
      type: "REST API",
    });

    expect(response.status).toBe(501);
    expect(response.body).toMatchObject({
      success: false,
      code: "SOURCE_NOT_IMPLEMENTED",
      source: "okx",
    });
    expect(response.body).not.toHaveProperty("data");
    expect(random).not.toHaveBeenCalled();
  });
});

describe("Tushare API test route", () => {
  it("rejects real-time mode instead of returning generated success data", async () => {
    const response = await post("/test-api", {
      source: "tushare",
      apiType: "realtime",
      symbol: "000001.SZ",
      interval: "1d",
    });

    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({
      success: false,
      code: "INVALID_API_TYPE",
      message: "Tushare Pro supports historical daily data only",
      source: "tushare",
    });
    expect(response.body).not.toHaveProperty("data");
  });
});
