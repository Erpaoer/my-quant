# Truthful Market Data Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ensure every mounted operational market-data route returns only real upstream or persisted data, or a stable explicit error, with no generated-success fallback.

**Architecture:** Add one small route-error module shared by the two mounted data routers. Harden the active `/data-test` handlers first, then replace generated responses in `/data`, preserve real database rows with completeness metadata, reject empty adapter results, and deprecate duplicate legacy test handlers. Keep the existing DataManager, Yahoo Finance, Tushare, and Binance integrations intact.

**Tech Stack:** TypeScript, Express, Prisma, Axios, Vitest, Vue frontend smoke tests.

---

## File map

- Create `backend/src/routes/operational-data-errors.ts`: stable error response builder and upstream status classifier shared by both routers.
- Create `backend/src/routes/operational-data-errors.test.ts`: focused classification and response-shape tests.
- Modify `backend/src/routes/data-simple.test.ts`: regression coverage for connection, sample, and API-test fake-success paths.
- Modify `backend/src/routes/data-simple.ts`: input validation, real-source-only behavior, and removal of fallback generators.
- Create `backend/src/routes/data.test.ts`: mounted `/data` route tests with mocked Prisma and DataManager.
- Modify `backend/src/routes/data.ts`: real market/overview responses, truthful historical completeness, explicit empty-source failures, and legacy endpoint deprecation.
- Modify `docs/audits/2026-07-27-runtime-gaps.md`: mark the operational market-data mock gap resolved and retain dashboard/monitoring work as the next gap.

### Task 1: Stable operational data errors

**Files:**

- Create: `backend/src/routes/operational-data-errors.test.ts`
- Create: `backend/src/routes/operational-data-errors.ts`

- [ ] **Step 1: Write the failing classification tests**

Create tests that define the exact public contract:

```ts
import type { Response } from "express";
import { describe, expect, it, vi } from "vitest";
import {
  classifyUpstreamFailure,
  sendOperationalDataError,
} from "./operational-data-errors";

describe("classifyUpstreamFailure", () => {
  it.each([
    [403, 503, "SOURCE_AUTH_FAILED", false],
    [429, 503, "SOURCE_RATE_LIMITED", true],
    [500, 502, "SOURCE_UNREACHABLE", true],
  ])(
    "maps upstream status %i",
    (upstreamStatus, status, code, retryable) => {
      const error = Object.assign(new Error("upstream failed"), {
        response: { status: upstreamStatus },
      });

      expect(classifyUpstreamFailure(error)).toEqual({
        status,
        code,
        retryable,
        upstreamStatus,
      });
    },
  );

  it("maps network failures without an upstream status", () => {
    expect(classifyUpstreamFailure(new Error("socket timeout"))).toEqual({
      status: 502,
      code: "SOURCE_UNREACHABLE",
      retryable: true,
    });
  });
});

describe("sendOperationalDataError", () => {
  it("sends the stable failure shape without a data property", () => {
    const json = vi.fn();
    const status = vi.fn(() => ({ json }));
    const response = { status } as unknown as Response;

    sendOperationalDataError(
      response,
      502,
      "NO_DATA",
      "No usable market data was returned",
      { source: "database", retryable: false },
    );

    expect(status).toHaveBeenCalledWith(502);
    expect(json).toHaveBeenCalledWith({
      success: false,
      code: "NO_DATA",
      message: "No usable market data was returned",
      source: "database",
      retryable: false,
    });
    expect(json.mock.calls[0][0]).not.toHaveProperty("data");
  });
});
```

- [ ] **Step 2: Run the new tests and verify RED**

Run from the repository root:

```powershell
npm --prefix backend test -- --run src/routes/operational-data-errors.test.ts
```

Expected: FAIL because `./operational-data-errors` does not exist.

- [ ] **Step 3: Implement the minimal shared helper**

Create `backend/src/routes/operational-data-errors.ts`:

```ts
import type { Response } from "express";

export type OperationalDataErrorCode =
  | "INVALID_REQUEST"
  | "INVALID_SOURCE"
  | "INVALID_API_TYPE"
  | "LEGACY_ENDPOINT_DEPRECATED"
  | "SOURCE_NOT_IMPLEMENTED"
  | "SOURCE_UNREACHABLE"
  | "SOURCE_AUTH_FAILED"
  | "SOURCE_RATE_LIMITED"
  | "NO_DATA"
  | "INTERNAL_ERROR";

interface ErrorDetails {
  source?: string;
  retryable?: boolean;
  upstreamStatus?: number;
  successor?: string;
}

interface ClassifiedFailure {
  status: number;
  code:
    | "SOURCE_UNREACHABLE"
    | "SOURCE_AUTH_FAILED"
    | "SOURCE_RATE_LIMITED";
  retryable: boolean;
  upstreamStatus?: number;
}

function upstreamStatus(error: unknown): number | undefined {
  if (!error || typeof error !== "object") return undefined;
  const response = (error as { response?: { status?: unknown } }).response;
  return typeof response?.status === "number" ? response.status : undefined;
}

export function classifyUpstreamFailure(error: unknown): ClassifiedFailure {
  const status = upstreamStatus(error);
  if (status === 401 || status === 403) {
    return {
      status: 503,
      code: "SOURCE_AUTH_FAILED",
      retryable: false,
      upstreamStatus: status,
    };
  }
  if (status === 429) {
    return {
      status: 503,
      code: "SOURCE_RATE_LIMITED",
      retryable: true,
      upstreamStatus: status,
    };
  }
  return {
    status: 502,
    code: "SOURCE_UNREACHABLE",
    retryable: true,
    ...(status === undefined ? {} : { upstreamStatus: status }),
  };
}

export function sendOperationalDataError(
  res: Response,
  status: number,
  code: OperationalDataErrorCode,
  message: string,
  details: ErrorDetails = {},
) {
  return res.status(status).json({
    success: false,
    code,
    message,
    ...details,
  });
}

export function sendUpstreamDataError(
  res: Response,
  source: string,
  error: unknown,
  message: string,
) {
  const failure = classifyUpstreamFailure(error);
  return sendOperationalDataError(
    res,
    failure.status,
    failure.code,
    message,
    {
      source,
      retryable: failure.retryable,
      ...(failure.upstreamStatus === undefined
        ? {}
        : { upstreamStatus: failure.upstreamStatus }),
    },
  );
}
```

- [ ] **Step 4: Run focused tests and verify GREEN**

```powershell
npm --prefix backend test -- --run src/routes/operational-data-errors.test.ts
```

Expected: 1 file passes with all classification and response tests green.

- [ ] **Step 5: Commit**

```powershell
git add -- backend/src/routes/operational-data-errors.ts backend/src/routes/operational-data-errors.test.ts
git commit -m "fix: define operational data error contract"
```

### Task 2: Remove fake success from active data-source tests

**Files:**

- Modify: `backend/src/routes/data-simple.test.ts`
- Modify: `backend/src/routes/data-simple.ts`

- [ ] **Step 1: Add failing active-route regressions**

Extend the existing test file with these behaviors:

```ts
describe("truthful data-source routes", () => {
  it("returns an explicit failure when Binance sample retrieval times out", async () => {
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
    [403, 503, "SOURCE_AUTH_FAILED"],
    [429, 503, "SOURCE_RATE_LIMITED"],
    [500, 502, "SOURCE_UNREACHABLE"],
  ])(
    "maps Binance sample upstream status %i without fallback data",
    async (upstreamStatus, status, code) => {
      const random = vi.spyOn(Math, "random");
      mockedGet.mockRejectedValueOnce(
        Object.assign(new Error(`upstream ${upstreamStatus}`), {
          response: { status: upstreamStatus },
        }),
      );

      const response = await post("/sample", {
        source: "binance",
        symbol: "BTCUSDT",
        limit: 5,
      });

      expect(response.status).toBe(status);
      expect(response.body).toMatchObject({
        success: false,
        code,
        source: "binance",
        upstreamStatus,
      });
      expect(response.body).not.toHaveProperty("data");
      expect(random).not.toHaveBeenCalled();
    },
  );

  it.each(["okx", "huobi", "binance-websocket"])(
    "rejects unimplemented %s sample data",
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
      expect(random).not.toHaveBeenCalled();
    },
  );

  it("rejects an unknown source before making an upstream request", async () => {
    const response = await post("/sample", {
      source: "made-up-source",
      symbol: "BTCUSDT",
    });

    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({
      success: false,
      code: "INVALID_SOURCE",
      source: "made-up-source",
    });
    expect(mockedGet).not.toHaveBeenCalled();
  });

  it.each(["market", "historical", "realtime"])(
    "does not fall back when Binance %s API retrieval fails",
    async (apiType) => {
      const random = vi.spyOn(Math, "random");
      mockedGet.mockRejectedValueOnce(new Error("socket timeout"));

      const response = await post("/test-api", {
        source: "binance",
        apiType,
        symbol: "BTCUSDT",
        interval: "1h",
      });

      expect(response.status).toBe(502);
      expect(response.body).toMatchObject({
        success: false,
        code: "SOURCE_UNREACHABLE",
        source: "binance",
      });
      expect(response.body).not.toHaveProperty("data");
      expect(random).not.toHaveBeenCalled();
    },
  );

  it("rejects an invalid API type before making an upstream request", async () => {
    const response = await post("/test-api", {
      source: "binance",
      apiType: "candles-and-news",
      symbol: "BTCUSDT",
      interval: "1h",
    });

    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({
      success: false,
      code: "INVALID_API_TYPE",
      source: "binance",
    });
    expect(mockedGet).not.toHaveBeenCalled();
  });

  it("rejects an unimplemented connection test without random status", async () => {
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
    expect(random).not.toHaveBeenCalled();
  });
});
```

Also strengthen the existing Tushare real-time rejection to assert:

```ts
expect(response.body).toMatchObject({
  success: false,
  code: "INVALID_API_TYPE",
  source: "tushare",
});
```

- [ ] **Step 2: Run focused tests and verify RED**

```powershell
npm --prefix backend test -- --run src/routes/data-simple.test.ts
```

Expected: new Binance, unsupported-source, and invalid-type tests fail because current handlers return generated 200 responses or generic errors.

- [ ] **Step 3: Add source validation and stable failure helpers**

Import the shared helpers and replace the local upstream-status implementation:

```ts
import {
  sendOperationalDataError,
  sendUpstreamDataError,
} from "./operational-data-errors";

const REAL_SOURCES = new Set(["binance", "yahoo", "tushare"]);
const KNOWN_UNIMPLEMENTED_SOURCES = new Set([
  "okx",
  "huobi",
  "bybit",
  "binance-websocket",
]);
const API_TYPES = new Set(["market", "historical", "realtime"]);

function sourceId(value: unknown): string | undefined {
  return typeof value === "string" && value.trim()
    ? value.trim().toLowerCase()
    : undefined;
}

function rejectUnavailableSource(res: Response, source: string | undefined) {
  if (!source) {
    return sendOperationalDataError(
      res,
      400,
      "INVALID_REQUEST",
      "Data source is required",
      { retryable: false },
    );
  }
  if (KNOWN_UNIMPLEMENTED_SOURCES.has(source)) {
    return sendOperationalDataError(
      res,
      501,
      "SOURCE_NOT_IMPLEMENTED",
      `Real ${source} data is not implemented`,
      { source, retryable: false },
    );
  }
  if (!REAL_SOURCES.has(source)) {
    return sendOperationalDataError(
      res,
      400,
      "INVALID_SOURCE",
      "Unknown data source",
      { source, retryable: false },
    );
  }
  return undefined;
}
```

Keep the existing Yahoo-specific safe wording through this wrapper:

```ts
function sendYahooFailure(
  res: Response,
  error: unknown,
  operation: "connection" | "sample" | "api",
) {
  const messages = {
    connection: "Failed to connect to Yahoo Finance",
    sample: "Failed to retrieve Yahoo Finance sample data",
    api: "Yahoo Finance API test failed",
  };
  const status = (error as { response?: { status?: number } })?.response?.status;
  return sendUpstreamDataError(
    res,
    "yahoo",
    error,
    status === 403
      ? "Yahoo Finance is unavailable from the current network"
      : messages[operation],
  );
}
```

- [ ] **Step 4: Replace generated branches with real failures**

At the start of all three handlers, normalize and validate `source`:

```ts
const source = sourceId(req.body.source);
const sourceError = rejectUnavailableSource(res, source);
if (sourceError || !source) return sourceError;
```

At the start of `/test-api`, validate `apiType` before any HTTP call:

```ts
const { apiType, symbol, interval } = req.body;
if (typeof apiType !== "string" || !API_TYPES.has(apiType)) {
  return sendOperationalDataError(
    res,
    400,
    "INVALID_API_TYPE",
    "Unknown API type",
    { source, retryable: false },
  );
}
```

Replace Binance catch blocks with operation-specific real failures:

```ts
return sendUpstreamDataError(
  res,
  "binance",
  error,
  "Failed to retrieve data from Binance",
);
```

For Tushare unsupported modes, return:

```ts
return sendOperationalDataError(
  res,
  400,
  "INVALID_API_TYPE",
  "Tushare Pro supports historical daily data only",
  { source: "tushare", retryable: false },
);
```

When a real Binance, Yahoo, or Tushare response produces no records, return:

```ts
return sendOperationalDataError(
  res,
  502,
  "NO_DATA",
  `No usable data was returned by ${source}`,
  { source, retryable: true },
);
```

Delete the connection simulation, sample fallback, API fallback, artificial delays, and now-unreferenced `generate*SampleData` helpers from `data-simple.ts`. Preserve the real Binance, Yahoo, and Tushare request and normalization code.

- [ ] **Step 5: Run focused tests and verify GREEN**

```powershell
npm --prefix backend test -- --run src/routes/operational-data-errors.test.ts src/routes/data-simple.test.ts
```

Expected: both files pass; no operational failure test observes `data` or a `Math.random` call.

- [ ] **Step 6: Commit**

```powershell
git add -- backend/src/routes/data-simple.ts backend/src/routes/data-simple.test.ts
git commit -m "fix: remove data source test fallbacks"
```

### Task 3: Replace primary market, overview, and historical mocks

**Files:**

- Create: `backend/src/routes/data.test.ts`
- Modify: `backend/src/routes/data.ts`

- [ ] **Step 1: Create a router harness with hoisted dependencies**

Create `data.test.ts` using the existing temporary HTTP-server pattern. Hoist:

```ts
const mocks = vi.hoisted(() => {
  const findMany = vi.fn();
  const fetchRealTimeData = vi.fn();
  const fetchHistoricalData = vi.fn();
  const manager = {
    registerAdapter: vi.fn(),
    initialize: vi.fn().mockResolvedValue(undefined),
    fetchRealTimeData,
    fetchHistoricalData,
    getAdapterStatuses: vi.fn().mockReturnValue([]),
    getDataQualityReport: vi.fn().mockResolvedValue([]),
  };
  return { findMany, fetchRealTimeData, fetchHistoricalData, manager };
});

vi.mock("@prisma/client", () => ({
  PrismaClient: class {
    marketData = { findMany: mocks.findMany };
  },
}));

vi.mock("../services/data", () => ({
  initDataManager: () => mocks.manager,
  getDataManager: () => mocks.manager,
  YahooFinanceAdapter: class {
    static POPULAR_STOCKS: string[] = [];
    static POPULAR_CRYPTO: string[] = [];
    static INDICES: string[] = [];
  },
  TushareAdapter: class {},
}));

vi.mock("../middleware/auth", () => ({
  optionalAuth: (_req: unknown, _res: unknown, next: () => void) => next(),
  authenticate: (_req: unknown, _res: unknown, next: () => void) => next(),
}));
```

Mount the imported router at `/data`, and provide `request(path, init?)` that starts a server on `127.0.0.1`, calls native `fetch`, parses JSON, and always closes the server.

- [ ] **Step 2: Add failing primary-route tests**

Cover these exact assertions:

```ts
it("returns a real adapter record for one market symbol", async () => {
  mocks.fetchRealTimeData.mockResolvedValueOnce([{
    symbol: "BTCUSDT",
    timestamp: new Date("2026-07-28T00:00:00.000Z"),
    open: 100,
    high: 110,
    low: 90,
    close: 105,
    volume: 1234,
    source: "Yahoo Finance",
  }]);

  const response = await request("/data/market/BTCUSDT");

  expect(response.status).toBe(200);
  expect(response.body.data).toMatchObject({
    symbol: "BTCUSDT",
    price: 105,
    source: "Yahoo Finance",
  });
});

it("fails instead of generating a market record when adapters return nothing", async () => {
  const random = vi.spyOn(Math, "random");
  mocks.fetchRealTimeData.mockResolvedValueOnce([]);

  const response = await request("/data/market/BTCUSDT");

  expect(response.status).toBe(502);
  expect(response.body).toMatchObject({
    success: false,
    code: "NO_DATA",
  });
  expect(response.body).not.toHaveProperty("data");
  expect(random).not.toHaveBeenCalled();
});

it("returns a partial real overview without generated missing symbols", async () => {
  mocks.fetchRealTimeData.mockResolvedValueOnce([{
    symbol: "BTCUSDT",
    timestamp: new Date("2026-07-28T00:00:00.000Z"),
    open: 100,
    high: 110,
    low: 90,
    close: 105,
    volume: 1234,
    source: "Yahoo Finance",
  }]);

  const response = await request("/data/overview");

  expect(response.status).toBe(200);
  expect(response.body.meta).toMatchObject({
    returned: 1,
    partial: true,
  });
  expect(Object.keys(response.body.data)).toEqual(["BTCUSDT"]);
});

it("preserves short database history and marks it partial", async () => {
  mocks.findMany.mockResolvedValueOnce([{
    id: "row-1",
    symbol: "BTCUSDT",
    interval: "1h",
    timestamp: new Date("2026-07-28T00:00:00.000Z"),
    open: 100,
    high: 110,
    low: 90,
    close: 105,
    volume: 1234,
    source: "database-import",
  }]);

  const response = await request(
    "/data/historical?symbol=BTCUSDT&interval=1h&limit=3",
  );

  expect(response.status).toBe(200);
  expect(response.body.data).toMatchObject({
    requested: 3,
    returned: 1,
    count: 1,
    source: "database",
    partial: true,
  });
  expect(response.body.data.data).toHaveLength(1);
  expect(mocks.findMany).toHaveBeenCalledWith(
    expect.objectContaining({ take: 3 }),
  );
});

it("returns NO_DATA when database history is empty", async () => {
  mocks.findMany.mockResolvedValueOnce([]);

  const response = await request(
    "/data/historical?symbol=BTCUSDT&interval=1h&limit=3",
  );

  expect(response.status).toBe(502);
  expect(response.body).toMatchObject({
    success: false,
    code: "NO_DATA",
    source: "database",
  });
  expect(response.body).not.toHaveProperty("data");
});
```

- [ ] **Step 3: Run primary-route tests and verify RED**

```powershell
npm --prefix backend test -- --run src/routes/data.test.ts
```

Expected: failures show current random market/overview responses and historical fallback replacement.

- [ ] **Step 4: Implement real market formatting and no-data behavior**

Import shared errors and add:

```ts
import { Router, type Response } from "express";
import {
  sendOperationalDataError,
  sendUpstreamDataError,
} from "./operational-data-errors";
import type { RealTimeData } from "../services/data";

function marketResponseRecord(row: RealTimeData, interval?: string) {
  const metadata = supportedSymbols[row.symbol as keyof typeof supportedSymbols];
  return {
    ...row,
    ...(metadata || {}),
    price: row.close,
    prevClose: row.open,
    high24h: row.high,
    low24h: row.low,
    ...(interval ? { interval } : {}),
  };
}

function marketResponseMap(rows: RealTimeData[], interval?: string) {
  return Object.fromEntries(
    rows.map((row) => [row.symbol, marketResponseRecord(row, interval)]),
  );
}
```

For both market handlers:

1. Preserve existing request validation and supported-symbol validation.
2. Call `await ensureDataManagerInitialized()`.
3. Call `getDataManager().fetchRealTimeData(requestedSymbols)`.
4. Return `502 NO_DATA` with `source: "configured-adapters"` when the result is empty.
5. Return the real normalized record(s); never calculate prices or volumes.
6. Map thrown adapter/initialization errors through `sendUpstreamDataError`.

For `/overview`, request all `supportedSymbols`, build the keyed real record map, return `502 NO_DATA` when empty, and include:

```ts
meta: {
  requested: requestedSymbols.length,
  returned: rows.length,
  partial: rows.length < requestedSymbols.length,
}
```

- [ ] **Step 5: Implement truthful historical completeness**

Convert the query limit once:

```ts
const requestedLimit = Number(limit);
```

Pass `requestedLimit` to Prisma. If the returned array is empty:

```ts
return sendOperationalDataError(
  res,
  502,
  "NO_DATA",
  "No persisted historical data was found",
  { source: "database", retryable: false },
);
```

Otherwise return the existing nested data shape plus:

```ts
requested: requestedLimit,
returned: dbData.length,
source: "database",
partial: dbData.length < requestedLimit,
```

Do not call `generateMockHistoricalData`.

- [ ] **Step 6: Run focused tests and verify GREEN**

```powershell
npm --prefix backend test -- --run src/routes/data.test.ts src/services/data/DataManager.test.ts
```

Expected: primary route tests and DataManager regression pass.

- [ ] **Step 7: Commit**

```powershell
git add -- backend/src/routes/data.ts backend/src/routes/data.test.ts
git commit -m "fix: serve truthful primary market data"
```

### Task 4: Harden empty external results and retire legacy generators

**Files:**

- Modify: `backend/src/routes/data.test.ts`
- Modify: `backend/src/routes/data.ts`

- [ ] **Step 1: Add failing external and legacy tests**

Add table-driven empty-result coverage:

```ts
it.each([
  ["GET", "/data/external/realtime?symbols=AAPL"],
  ["POST", "/data/external/historical", {
    symbol: "AAPL",
    startTime: "2026-07-01T00:00:00.000Z",
    endTime: "2026-07-28T00:00:00.000Z",
    interval: "1d",
  }],
  ["GET", "/data/external/quick/AAPL?days=5&interval=1d"],
])("returns NO_DATA for an empty real source: %s %s", async (method, path, body) => {
  mocks.fetchRealTimeData.mockResolvedValueOnce([]);
  mocks.fetchHistoricalData.mockResolvedValueOnce([]);

  const response = await request(path, {
    method,
    ...(body ? {
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    } : {}),
  });

  expect(response.status).toBe(502);
  expect(response.body).toMatchObject({
    success: false,
    code: "NO_DATA",
  });
  expect(response.body).not.toHaveProperty("data");
});
```

Add exact legacy successor coverage:

```ts
it.each([
  ["/data/test-connection", "/data-test/test-connection"],
  ["/data/sample", "/data-test/sample"],
  ["/data/test-api", "/data-test/test-api"],
])("deprecates legacy endpoint %s", async (path, successor) => {
  const random = vi.spyOn(Math, "random");
  const response = await request(path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ source: "binance" }),
  });

  expect(response.status).toBe(410);
  expect(response.body).toMatchObject({
    success: false,
    code: "LEGACY_ENDPOINT_DEPRECATED",
    successor,
  });
  expect(response.body).not.toHaveProperty("data");
  expect(random).not.toHaveBeenCalled();
});
```

- [ ] **Step 2: Run the expanded route tests and verify RED**

```powershell
npm --prefix backend test -- --run src/routes/data.test.ts
```

Expected: external routes return successful empty data and legacy handlers still simulate/generated success.

- [ ] **Step 3: Return explicit errors for empty real external data**

After `fetchRealTimeData` in `/external/realtime`, add:

```ts
if (realTimeData.length === 0) {
  return sendOperationalDataError(
    res,
    502,
    "NO_DATA",
    "No usable data was returned by configured adapters",
    { source: "configured-adapters", retryable: true },
  );
}
```

After `fetchHistoricalData` in `/external/historical`, add:

```ts
if (historicalData.length === 0) {
  return sendOperationalDataError(
    res,
    502,
    "NO_DATA",
    "No usable historical data was returned by configured adapters",
    { source: "configured-adapters", retryable: true },
  );
}
```

After `fetchHistoricalData` in `/external/quick/:symbol`, add:

```ts
if (historicalData.length === 0) {
  return sendOperationalDataError(
    res,
    502,
    "NO_DATA",
    "No usable quick-fetch data was returned by configured adapters",
    { source: "configured-adapters", retryable: true },
  );
}
```

Preserve the current non-empty response data and quick-summary calculations.

- [ ] **Step 4: Replace duplicate legacy handlers with deprecations**

Add one local helper:

```ts
function sendLegacyDataTestEndpoint(res: Response, successor: string) {
  return sendOperationalDataError(
    res,
    410,
    "LEGACY_ENDPOINT_DEPRECATED",
    "Use the active data-source test endpoint",
    { successor, retryable: false },
  );
}
```

Replace the three duplicate handlers with:

```ts
router.post("/test-connection", optionalAuth, async (_req, res) =>
  sendLegacyDataTestEndpoint(res, "/data-test/test-connection"),
);

router.post("/sample", optionalAuth, async (_req, res) =>
  sendLegacyDataTestEndpoint(res, "/data-test/sample"),
);

router.post("/test-api", optionalAuth, async (_req, res) =>
  sendLegacyDataTestEndpoint(res, "/data-test/test-api"),
);
```

Remove their delays, random branches, and generated payloads.

Delete now-unreferenced market generator helpers from `data.ts`:

- `getBasePrice`
- `generateMockHistoricalData`
- `getIntervalMs`
- `generateExchangeSampleData`
- `generateYahooSampleData`
- `generateGenericSampleData`
- `generateMarketDataSample`
- `generateHistoricalDataSample`
- `generateRealtimeDataSample`

Keep the unrelated `Math.random` use that creates unique upload filenames; it is not market data and is outside these handlers.

- [ ] **Step 5: Run focused tests and TypeScript build**

```powershell
npm --prefix backend test -- --run src/routes/data.test.ts src/routes/data-simple.test.ts src/routes/operational-data-errors.test.ts
npm --prefix backend run build
```

Expected: all focused tests pass and TypeScript exits 0.

- [ ] **Step 6: Commit**

```powershell
git add -- backend/src/routes/data.ts backend/src/routes/data.test.ts
git commit -m "fix: reject empty and legacy market responses"
```

### Task 5: Update gap audit and perform complete verification

**Files:**

- Modify: `docs/audits/2026-07-27-runtime-gaps.md`

- [ ] **Step 1: Update the audit**

Mark the mounted operational data-route fallback gap resolved, listing the real/error contract and legacy `410` behavior. Keep dashboard, asset-curve, monitoring, backtest, and live-trading limitations open.

- [ ] **Step 2: Run the full backend verification**

```powershell
npm --prefix backend test -- --run
npm --prefix backend run build
```

Expected: all backend test files pass with zero failures; TypeScript exits 0.

- [ ] **Step 3: Run frontend regression verification**

```powershell
npm --prefix frontend test -- --run
npm --prefix frontend run build
```

Expected: frontend tests pass and the production build exits 0. Existing chunk-size/circular-chunk warnings may remain documented, but no new errors are accepted.

- [ ] **Step 4: Restart services using the existing local deployment method**

Inspect the currently running backend/frontend process or compose service, stop only the specifically identified service process, and restart:

```powershell
npm --prefix backend run dev
npm --prefix frontend run dev -- --host 0.0.0.0
```

Run them through the repository's existing background-service method rather than opening visible windows. Do not delete any directory or perform a recursive cleanup.

- [ ] **Step 5: Perform read-only smoke requests**

Verify:

- Tushare connection and daily sample still return real data.
- An unsupported OKX test returns `501` and never displays connected.
- A deliberately invalid source returns `400`.
- A database history miss returns `502 NO_DATA`, not generated candles.
- The active frontend data-source page renders the returned error rather than marking the source connected.

- [ ] **Step 6: Commit the audit**

```powershell
git add -- docs/audits/2026-07-27-runtime-gaps.md
git commit -m "docs: record truthful market data status"
```

- [ ] **Step 7: Final diff and requirements review**

Run:

```powershell
git diff --check HEAD~5..HEAD
git status --short
```

Expected: no whitespace errors; only the pre-existing untracked `.playwright-cli/` remains outside committed work.
