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
      message: "Yahoo Finance is unavailable from the current network",
      upstreamStatus: 403,
    });
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
      message: "Failed to retrieve Yahoo Finance sample data",
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
      message: "Yahoo Finance is unavailable from the current network",
      upstreamStatus: 403,
    });
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
      message: "Tushare Pro supports historical daily data only",
    });
    expect(response.body).not.toHaveProperty("data");
  });
});
