import express from "express";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

const mocks = vi.hoisted(() => {
  const findMany = vi.fn();
  const fetchRealTimeData = vi.fn();
  const fetchHistoricalData = vi.fn();
  const getAdapterStatuses = vi.fn();
  const getDataQualityReport = vi.fn();
  const registerAdapter = vi.fn();
  const initialize = vi.fn();
  const yahooAdapterConstructor = vi.fn();
  const tushareAdapterConstructor = vi.fn();
  const prismaClient = vi.fn();

  const manager = {
    fetchRealTimeData,
    fetchHistoricalData,
    getAdapterStatuses,
    getDataQualityReport,
    registerAdapter,
    initialize,
  };

  return {
    findMany,
    fetchRealTimeData,
    fetchHistoricalData,
    getAdapterStatuses,
    getDataQualityReport,
    registerAdapter,
    initialize,
    yahooAdapterConstructor,
    tushareAdapterConstructor,
    prismaClient,
    manager,
    initDataManager: vi.fn(() => manager),
    getDataManager: vi.fn(() => manager),
  };
});

vi.mock("@prisma/client", () => ({
  PrismaClient: mocks.prismaClient,
}));

vi.mock("../middleware/auth", () => ({
  optionalAuth: (
    _req: unknown,
    _res: unknown,
    next: () => void,
  ) => next(),
  authenticate: (
    _req: unknown,
    _res: unknown,
    next: () => void,
  ) => next(),
}));

vi.mock("../services/data", () => {
  class YahooFinanceAdapter {
    static POPULAR_STOCKS: string[] = [];
    static POPULAR_CRYPTO: string[] = [];
    static INDICES: string[] = [];

    constructor(config: unknown) {
      mocks.yahooAdapterConstructor(config);
    }
  }

  class TushareAdapter {
    constructor(token: string) {
      mocks.tushareAdapterConstructor(token);
    }
  }

  return {
    initDataManager: mocks.initDataManager,
    getDataManager: mocks.getDataManager,
    YahooFinanceAdapter,
    TushareAdapter,
  };
});

vi.mock("../config", () => ({
  default: {
    TUSHARE_TOKEN: "",
  },
}));

type JsonBody = Record<string, any>;

const supportedSymbols = [
  "BTCUSDT",
  "ETHUSDT",
  "BNBUSDT",
  "ADAUSDT",
  "SOLUSDT",
  "DOTUSDT",
  "000001.SH",
  "399001.SZ",
  "399006.SZ",
];

function marketRow(symbol: string, overrides: Record<string, unknown> = {}) {
  return {
    symbol,
    timestamp: new Date("2026-07-28T02:03:04.000Z"),
    open: 100,
    high: 110,
    low: 90,
    close: 105,
    volume: 1234,
    source: "yahoo",
    ...overrides,
  };
}

describe("primary market data routes", () => {
  let server: Server | undefined;
  let baseUrl = "";

  beforeEach(async () => {
    vi.resetModules();
    vi.clearAllMocks();
    mocks.findMany.mockReset();
    mocks.fetchRealTimeData.mockReset();
    mocks.fetchHistoricalData.mockReset();
    mocks.initialize.mockReset();
    mocks.registerAdapter.mockReset();
    mocks.prismaClient.mockReset();
    mocks.prismaClient.mockImplementation(() => ({
      marketData: {
        findMany: mocks.findMany,
      },
      dataImport: {
        create: vi.fn(),
        findMany: vi.fn(),
        count: vi.fn(),
        findUnique: vi.fn(),
        delete: vi.fn(),
      },
    }));
    mocks.initDataManager.mockImplementation(() => mocks.manager);
    mocks.getDataManager.mockImplementation(() => mocks.manager);
    mocks.findMany.mockResolvedValue([]);
    mocks.fetchRealTimeData.mockResolvedValue([]);
    mocks.fetchHistoricalData.mockResolvedValue([]);
    mocks.initialize.mockResolvedValue(undefined);
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    const { default: router } = await import("./data");
    const app = express();
    app.use(express.json());
    app.use("/data", router);

    await new Promise<void>((resolve) => {
      server = app.listen(0, "127.0.0.1", resolve);
    });
    const address = server.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  afterEach(async () => {
    if (server) {
      await new Promise<void>((resolve, reject) => {
        server?.close((error) => (error ? reject(error) : resolve()));
      });
    }
    vi.restoreAllMocks();
  });

  async function get(path: string) {
    const response = await fetch(`${baseUrl}${path}`);
    const body = (await response.json()) as JsonBody;
    return { response, body };
  }

  async function post(path: string, json: JsonBody) {
    const response = await fetch(`${baseUrl}${path}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify(json),
    });
    const body = (await response.json()) as JsonBody;
    return { response, body };
  }

  it("maps a matching real row without inventing market fields", async () => {
    const row = marketRow("BTCUSDT");
    mocks.fetchRealTimeData.mockResolvedValue([row]);

    const { response, body } = await get(
      "/data/market/BTCUSDT?interval=5m",
    );

    expect(response.status).toBe(200);
    expect(mocks.initDataManager).toHaveBeenCalledTimes(1);
    expect(mocks.registerAdapter).toHaveBeenCalledTimes(1);
    expect(mocks.initialize).toHaveBeenCalledTimes(1);
    expect(mocks.getDataManager).toHaveBeenCalledTimes(1);
    expect(mocks.fetchRealTimeData).toHaveBeenCalledWith(["BTCUSDT"]);
    expect(body.data).toMatchObject({
      symbol: "BTCUSDT",
      name: "Bitcoin",
      base: "BTC",
      quote: "USDT",
      precision: 2,
      timestamp: "2026-07-28T02:03:04.000Z",
      open: 100,
      high: 110,
      low: 90,
      close: 105,
      volume: 1234,
      source: "yahoo",
      price: 105,
      high24h: 110,
      low24h: 90,
      interval: "5m",
    });
    expect(body.data).not.toHaveProperty("prevClose");
    expect(body.data).not.toHaveProperty("change");
    expect(body.data).not.toHaveProperty("changePercent");
    expect(body.data).not.toHaveProperty("marketCap");
  });

  it("returns NO_DATA without using randomness when the adapter is empty", async () => {
    const random = vi.spyOn(Math, "random");

    const { response, body } = await get("/data/market/BTCUSDT");

    expect(response.status).toBe(502);
    expect(body).toMatchObject({
      success: false,
      code: "NO_DATA",
      source: "configured-adapters",
    });
    expect(body).not.toHaveProperty("data");
    expect(random).not.toHaveBeenCalled();
  });

  it("rejects a non-matching adapter row as NO_DATA", async () => {
    mocks.fetchRealTimeData.mockResolvedValue([marketRow("ETHUSDT")]);

    const { response, body } = await get("/data/market/BTCUSDT");

    expect(response.status).toBe(502);
    expect(body).toMatchObject({
      success: false,
      code: "NO_DATA",
      source: "configured-adapters",
    });
    expect(body).not.toHaveProperty("data");
  });

  it.each([
    ["NaN OHLCV", { close: Number.NaN }],
    ["an invalid timestamp", { timestamp: new Date("invalid") }],
    ["a blank source", { source: "   " }],
  ])("rejects a matching row with %s as NO_DATA", async (_label, overrides) => {
    mocks.fetchRealTimeData.mockResolvedValue([
      marketRow("BTCUSDT", overrides),
    ]);

    const { response, body } = await get("/data/market/BTCUSDT");

    expect(response.status).toBe(502);
    expect(body).toMatchObject({
      success: false,
      code: "NO_DATA",
      source: "configured-adapters",
    });
    expect(body).not.toHaveProperty("data");
  });

  it("filters unusable rows from a batch and reports a real partial result", async () => {
    mocks.fetchRealTimeData.mockResolvedValue([
      marketRow("BTCUSDT"),
      marketRow("ETHUSDT", { close: Number.NaN }),
      marketRow("SOLUSDT", { source: " " }),
    ]);

    const { response, body } = await get(
      "/data/market?symbols=BTCUSDT,ETHUSDT,SOLUSDT",
    );

    expect(response.status).toBe(200);
    expect(Object.keys(body.data)).toEqual(["BTCUSDT"]);
    expect(body.meta).toEqual({
      requested: 3,
      returned: 1,
      partial: true,
    });
  });

  it("filters unusable rows from the overview and reports a real partial result", async () => {
    mocks.fetchRealTimeData.mockResolvedValue([
      marketRow("BTCUSDT"),
      marketRow("ETHUSDT", { timestamp: new Date("invalid") }),
      marketRow("BNBUSDT", { source: " " }),
    ]);

    const { response, body } = await get("/data/overview");

    expect(response.status).toBe(200);
    expect(Object.keys(body.data)).toEqual(["BTCUSDT"]);
    expect(body.meta).toEqual({
      requested: supportedSymbols.length,
      returned: 1,
      partial: true,
    });
  });

  it("uses the shared safe upstream error contract for manager failures", async () => {
    mocks.fetchRealTimeData.mockRejectedValue(
      new Error("secret upstream credential"),
    );

    const { response, body } = await get("/data/market/BTCUSDT");

    expect(response.status).toBe(502);
    expect(body).toMatchObject({
      success: false,
      code: "SOURCE_UNREACHABLE",
      source: "configured-adapters",
      retryable: true,
    });
    expect(JSON.stringify(body)).not.toContain("secret upstream credential");
  });

  it("trims and filters batch symbols, returning only requested real rows", async () => {
    mocks.fetchRealTimeData.mockResolvedValue([
      marketRow("BTCUSDT"),
      marketRow("ETHUSDT", {
        open: 200,
        close: 205,
        high: 210,
        low: 190,
      }),
      marketRow("BNBUSDT"),
    ]);

    const { response, body } = await get(
      "/data/market?symbols=%20BTCUSDT%20,%20NOPE%20,ETHUSDT,SOLUSDT&interval=15m",
    );

    expect(response.status).toBe(200);
    expect(mocks.fetchRealTimeData).toHaveBeenCalledWith([
      "BTCUSDT",
      "ETHUSDT",
      "SOLUSDT",
    ]);
    expect(Object.keys(body.data)).toEqual(["BTCUSDT", "ETHUSDT"]);
    expect(body.data.BTCUSDT).toMatchObject({
      symbol: "BTCUSDT",
      close: 105,
      price: 105,
      interval: "15m",
      source: "yahoo",
    });
    expect(body.data.ETHUSDT).toMatchObject({
      symbol: "ETHUSDT",
      close: 205,
      price: 205,
      interval: "15m",
      source: "yahoo",
    });
    expect(body.data).not.toHaveProperty("BNBUSDT");
    expect(body.data).not.toHaveProperty("SOLUSDT");
    expect(body.meta).toEqual({
      requested: 3,
      returned: 2,
      partial: true,
    });
  });

  it("returns INVALID_REQUEST when a batch has no supported symbols", async () => {
    const { response, body } = await get(
      "/data/market?symbols=%20NOPE%20,ALSO-NOPE",
    );

    expect(response.status).toBe(400);
    expect(body).toMatchObject({
      success: false,
      code: "INVALID_REQUEST",
    });
    expect(mocks.fetchRealTimeData).not.toHaveBeenCalled();
  });

  it("returns NO_DATA when a supported batch has no real rows", async () => {
    const { response, body } = await get(
      "/data/market?symbols=BTCUSDT,ETHUSDT",
    );

    expect(response.status).toBe(502);
    expect(body).toMatchObject({
      success: false,
      code: "NO_DATA",
      source: "configured-adapters",
    });
    expect(body).not.toHaveProperty("data");
  });

  it("deduplicates repeated batch symbols before fetching and reporting meta", async () => {
    mocks.fetchRealTimeData.mockResolvedValue([marketRow("BTCUSDT")]);

    const { response, body } = await get(
      "/data/market?symbols=BTCUSDT,BTCUSDT",
    );

    expect(response.status).toBe(200);
    expect.soft(mocks.fetchRealTimeData).toHaveBeenCalledWith(["BTCUSDT"]);
    expect.soft(body.meta).toEqual({
      requested: 1,
      returned: 1,
      partial: false,
    });
  });

  it("returns a partial overview made only from real rows", async () => {
    mocks.fetchRealTimeData.mockResolvedValue([
      marketRow("BTCUSDT"),
      marketRow("NOT-SUPPORTED"),
    ]);

    const { response, body } = await get("/data/overview");

    expect(response.status).toBe(200);
    expect(mocks.fetchRealTimeData).toHaveBeenCalledWith(supportedSymbols);
    expect(Object.keys(body.data)).toEqual(["BTCUSDT"]);
    expect(body.data.BTCUSDT).toMatchObject({
      symbol: "BTCUSDT",
      name: "Bitcoin",
      timestamp: "2026-07-28T02:03:04.000Z",
      open: 100,
      high: 110,
      low: 90,
      close: 105,
      volume: 1234,
      source: "yahoo",
    });
    expect(body.data.BTCUSDT).not.toHaveProperty("change");
    expect(body.data.BTCUSDT).not.toHaveProperty("changePercent");
    expect(body.data.BTCUSDT).not.toHaveProperty("marketCap");
    expect(body.meta).toEqual({
      requested: supportedSymbols.length,
      returned: 1,
      partial: true,
    });
  });

  it("adds overview aliases only from the real close, high, and low", async () => {
    mocks.fetchRealTimeData.mockResolvedValue([
      marketRow("BTCUSDT", {
        close: 104,
        high: 112,
        low: 88,
      }),
    ]);

    const { response, body } = await get("/data/overview");

    expect(response.status).toBe(200);
    expect(body.data.BTCUSDT).toMatchObject({
      close: 104,
      high: 112,
      low: 88,
      price: 104,
      high24h: 112,
      low24h: 88,
    });
    expect(body.data.BTCUSDT).not.toHaveProperty("change");
    expect(body.data.BTCUSDT).not.toHaveProperty("marketCap");
  });

  it("returns NO_DATA when the overview has no real rows", async () => {
    const { response, body } = await get("/data/overview");

    expect(response.status).toBe(502);
    expect(body).toMatchObject({
      success: false,
      code: "NO_DATA",
      source: "configured-adapters",
    });
    expect(body).not.toHaveProperty("data");
  });

  it("preserves a short database history and passes a numeric take", async () => {
    const rows = [
      {
        id: "row-2",
        ...marketRow("BTCUSDT", {
          timestamp: new Date("2026-07-28T02:00:00.000Z"),
          interval: "1h",
          source: "database",
        }),
      },
      {
        id: "row-1",
        ...marketRow("BTCUSDT", {
          timestamp: new Date("2026-07-28T01:00:00.000Z"),
          interval: "1h",
          source: "database",
        }),
      },
    ];
    mocks.findMany.mockResolvedValue(rows);
    const random = vi.spyOn(Math, "random");

    const { response, body } = await get(
      "/data/historical?symbol=BTCUSDT&interval=1h&limit=5",
    );

    expect(response.status).toBe(200);
    expect(mocks.findMany).toHaveBeenCalledWith({
      where: {
        symbol: "BTCUSDT",
        interval: "1h",
      },
      orderBy: {
        timestamp: "desc",
      },
      take: 5,
    });
    expect(body.data).toMatchObject({
      symbol: "BTCUSDT",
      interval: "1h",
      count: 2,
      requested: 5,
      returned: 2,
      source: "database",
      partial: true,
    });
    expect(body.data.data).toEqual(
      rows.map((row) => ({
        ...row,
        timestamp: row.timestamp.toISOString(),
      })),
    );
    expect(random).not.toHaveBeenCalled();
  });

  it("returns non-retryable database NO_DATA for an empty history", async () => {
    const { response, body } = await get(
      "/data/historical?symbol=BTCUSDT&limit=5",
    );

    expect(response.status).toBe(502);
    expect(body).toMatchObject({
      success: false,
      code: "NO_DATA",
      source: "database",
      retryable: false,
    });
    expect(body).not.toHaveProperty("data");
  });

  it("does not expose Prisma failure details", async () => {
    mocks.findMany.mockRejectedValue(
      new Error("postgres password and private host"),
    );

    const { response, body } = await get(
      "/data/historical?symbol=BTCUSDT&limit=5",
    );

    expect(response.status).toBe(500);
    expect(body).toMatchObject({
      success: false,
      code: "INTERNAL_ERROR",
      source: "database",
      retryable: false,
    });
    expect(JSON.stringify(body)).not.toContain(
      "postgres password and private host",
    );
  });

  it("returns external real-time rows from all configured adapters when source is omitted", async () => {
    mocks.fetchRealTimeData.mockResolvedValue([
      marketRow("BTCUSDT", { source: "Yahoo Finance" }),
      marketRow("ETHUSDT", { source: "Another Configured Adapter" }),
    ]);

    const { response, body } = await get(
      "/data/external/realtime?symbols=BTCUSDT,ETHUSDT",
    );

    expect(response.status).toBe(200);
    expect(mocks.fetchRealTimeData).toHaveBeenCalledWith([
      "BTCUSDT",
      "ETHUSDT",
    ]);
    expect(body).toMatchObject({
      success: true,
      count: 2,
      data: [
        {
          symbol: "BTCUSDT",
          source: "Yahoo Finance",
          close: 105,
        },
        {
          symbol: "ETHUSDT",
          source: "Another Configured Adapter",
          close: 105,
        },
      ],
    });
  });

  it("returns NO_DATA for an empty external real-time response", async () => {
    const { response, body } = await get(
      "/data/external/realtime?symbols=BTCUSDT",
    );

    expect(response.status).toBe(502);
    expect(body).toMatchObject({
      success: false,
      code: "NO_DATA",
      source: "configured-adapters",
      retryable: true,
    });
    expect(body).not.toHaveProperty("data");
  });

  it("returns NO_DATA when every external real-time row is unusable", async () => {
    mocks.fetchRealTimeData.mockResolvedValue([
      marketRow("BTCUSDT", { close: Number.NaN }),
      marketRow("ETHUSDT", { source: " " }),
    ]);

    const { response, body } = await get(
      "/data/external/realtime?symbols=BTCUSDT,ETHUSDT",
    );

    expect(response.status).toBe(502);
    expect(body).toMatchObject({
      success: false,
      code: "NO_DATA",
      source: "configured-adapters",
      retryable: true,
    });
    expect(body).not.toHaveProperty("data");
  });

  it("filters external real-time rows to Yahoo Finance when source=yahoo", async () => {
    mocks.fetchRealTimeData.mockResolvedValue([
      marketRow("BTCUSDT", { source: "Yahoo Finance" }),
      marketRow("ETHUSDT", { source: "Another Configured Adapter" }),
    ]);

    const { response, body } = await get(
      "/data/external/realtime?symbols=BTCUSDT,ETHUSDT&source=yahoo",
    );

    expect(response.status).toBe(200);
    expect(mocks.fetchRealTimeData).toHaveBeenCalledWith([
      "BTCUSDT",
      "ETHUSDT",
    ]);
    expect(body.data).toEqual([
      expect.objectContaining({
        symbol: "BTCUSDT",
        source: "Yahoo Finance",
      }),
    ]);
    expect(body.count).toBe(1);
  });

  it.each(["binance", "alpha_vantage"])(
    "rejects unimplemented external real-time source %s before calling the manager",
    async (source) => {
      const { response, body } = await get(
        `/data/external/realtime?symbols=BTCUSDT&source=${source}`,
      );

      expect(response.status).toBe(501);
      expect(body).toMatchObject({
        success: false,
        code: "SOURCE_NOT_IMPLEMENTED",
        source,
        retryable: false,
      });
      expect(body).not.toHaveProperty("data");
      expect(mocks.initDataManager).not.toHaveBeenCalled();
      expect(mocks.getDataManager).not.toHaveBeenCalled();
      expect(mocks.fetchRealTimeData).not.toHaveBeenCalled();
    },
  );

  it("keeps external real-time manager failures on the safe upstream contract", async () => {
    mocks.fetchRealTimeData.mockRejectedValue(
      new Error("private real-time provider details"),
    );

    const { response, body } = await get(
      "/data/external/realtime?symbols=BTCUSDT",
    );

    expect(response.status).toBe(502);
    expect(body).toMatchObject({
      success: false,
      code: "SOURCE_UNREACHABLE",
      source: "configured-adapters",
      retryable: true,
    });
    expect(body).not.toHaveProperty("data");
    expect(JSON.stringify(body)).not.toContain(
      "private real-time provider details",
    );
  });

  it("preserves a non-empty external historical response", async () => {
    const row = marketRow("BTCUSDT", { source: "Yahoo Finance" });
    mocks.fetchHistoricalData.mockResolvedValue([row]);

    const { response, body } = await post("/data/external/historical", {
      symbol: "BTCUSDT",
      startTime: "2026-07-01T00:00:00.000Z",
      endTime: "2026-07-28T00:00:00.000Z",
      interval: "1d",
    });

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      success: true,
      data: {
        symbol: "BTCUSDT",
        interval: "1d",
        count: 1,
        data: [
          {
            symbol: "BTCUSDT",
            timestamp: "2026-07-28T02:03:04.000Z",
            close: 105,
            source: "Yahoo Finance",
          },
        ],
      },
    });
  });

  it("returns NO_DATA for an empty external historical response", async () => {
    const { response, body } = await post("/data/external/historical", {
      symbol: "BTCUSDT",
      startTime: "2026-07-01T00:00:00.000Z",
      endTime: "2026-07-28T00:00:00.000Z",
      interval: "1d",
    });

    expect(response.status).toBe(502);
    expect(body).toMatchObject({
      success: false,
      code: "NO_DATA",
      source: "configured-adapters",
      retryable: true,
    });
    expect(body).not.toHaveProperty("data");
  });

  it("keeps external historical manager failures on the safe upstream contract", async () => {
    mocks.fetchHistoricalData.mockRejectedValue(
      new Error("private historical provider details"),
    );

    const { response, body } = await post("/data/external/historical", {
      symbol: "BTCUSDT",
      startTime: "2026-07-01T00:00:00.000Z",
      endTime: "2026-07-28T00:00:00.000Z",
      interval: "1d",
    });

    expect(response.status).toBe(502);
    expect(body).toMatchObject({
      success: false,
      code: "SOURCE_UNREACHABLE",
      source: "configured-adapters",
      retryable: true,
    });
    expect(body).not.toHaveProperty("data");
    expect(JSON.stringify(body)).not.toContain(
      "private historical provider details",
    );
  });

  it("preserves the non-empty external quick summary", async () => {
    mocks.fetchHistoricalData.mockResolvedValue([
      marketRow("BTCUSDT", { close: 100 }),
      marketRow("BTCUSDT", { close: 110 }),
    ]);

    const { response, body } = await get(
      "/data/external/quick/BTCUSDT?days=7&interval=1d",
    );

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      success: true,
      data: {
        symbol: "BTCUSDT",
        interval: "1d",
        days: 7,
        summary: {
          currentPrice: 110,
          change: 10,
          changePercent: 10,
          minPrice: 100,
          maxPrice: 110,
          dataPoints: 2,
        },
      },
    });
    expect(body.data.historicalData).toHaveLength(2);
  });

  it("returns NO_DATA for an empty external quick response", async () => {
    const { response, body } = await get(
      "/data/external/quick/BTCUSDT?days=7&interval=1d",
    );

    expect(response.status).toBe(502);
    expect(body).toMatchObject({
      success: false,
      code: "NO_DATA",
      source: "configured-adapters",
      retryable: true,
    });
    expect(body).not.toHaveProperty("data");
  });

  it("keeps external quick manager failures on the safe upstream contract", async () => {
    mocks.fetchHistoricalData.mockRejectedValue(
      new Error("private quick provider details"),
    );

    const { response, body } = await get(
      "/data/external/quick/BTCUSDT?days=7&interval=1d",
    );

    expect(response.status).toBe(502);
    expect(body).toMatchObject({
      success: false,
      code: "SOURCE_UNREACHABLE",
      source: "configured-adapters",
      retryable: true,
    });
    expect(body).not.toHaveProperty("data");
    expect(JSON.stringify(body)).not.toContain(
      "private quick provider details",
    );
  });

  it.each([
    [
      "/data/test-connection",
      { source: "yahoo", type: "rest" },
      "/data-test/test-connection",
    ],
    [
      "/data/sample",
      { source: "yahoo", symbol: "BTCUSDT", limit: 2 },
      "/data-test/sample",
    ],
    [
      "/data/test-api",
      {
        source: "yahoo",
        apiType: "market",
        symbol: "BTCUSDT",
        interval: "1d",
      },
      "/data-test/test-api",
    ],
  ])(
    "deprecates legacy endpoint %s without generating market data",
    async (path, json, successor) => {
      const random = vi.spyOn(Math, "random");

      const { response, body } = await post(path, json);

      expect(response.status).toBe(410);
      expect(body).toMatchObject({
        success: false,
        code: "LEGACY_ENDPOINT_DEPRECATED",
        successor,
        retryable: false,
      });
      expect(body).not.toHaveProperty("data");
      expect(random).not.toHaveBeenCalled();
    },
  );
});
