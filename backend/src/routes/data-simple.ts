import axios from "axios";
import { Router, type Response } from "express";
import config from "../config";
import { TushareAdapter } from "../services/data/adapters/TushareAdapter";
import {
  sendOperationalDataError,
  sendUpstreamDataError,
} from "./operational-data-errors";

const router = Router();

const REAL_SOURCES = new Set(["binance", "yahoo", "tushare"]);
const UNIMPLEMENTED_SOURCES = new Set([
  "okx",
  "huobi",
  "bybit",
  "binance-websocket",
]);
const API_TYPES = new Set(["market", "historical", "realtime"]);
const YAHOO_CHART_URL =
  "https://query1.finance.yahoo.com/v8/finance/chart/AAPL";
const YAHOO_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
};

function normalizeSource(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const source = value.trim().toLowerCase();
  return source || undefined;
}

function validateSource(res: Response, value: unknown): string | undefined {
  const source = normalizeSource(value);
  if (!source) {
    sendOperationalDataError(
      res,
      400,
      "INVALID_REQUEST",
      "Data source is required",
    );
    return undefined;
  }

  if (UNIMPLEMENTED_SOURCES.has(source)) {
    sendOperationalDataError(
      res,
      501,
      "SOURCE_NOT_IMPLEMENTED",
      `Data source ${source} is not implemented`,
      { source },
    );
    return undefined;
  }

  if (!REAL_SOURCES.has(source)) {
    sendOperationalDataError(
      res,
      400,
      "INVALID_SOURCE",
      `Unknown data source: ${source}`,
      { source },
    );
    return undefined;
  }

  return source;
}

function upstreamStatus(error: unknown): number | undefined {
  if (!error || typeof error !== "object") return undefined;
  const response = (error as { response?: { status?: unknown } }).response;
  return typeof response?.status === "number" ? response.status : undefined;
}

function unexpectedStatus(status: number, source: string) {
  return Object.assign(
    new Error(`${source} upstream returned status ${status}`),
    { response: { status } },
  );
}

function sendNoData(res: Response, source: string, message: string) {
  return sendOperationalDataError(res, 502, "NO_DATA", message, {
    source,
    retryable: false,
  });
}

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
  const message =
    upstreamStatus(error) === 403
      ? "Yahoo Finance is unavailable from the current network"
      : messages[operation];

  return sendUpstreamDataError(res, "yahoo", error, message);
}

function finiteNumber(value: unknown): number | undefined {
  if (
    (typeof value !== "number" && typeof value !== "string") ||
    (typeof value === "string" && value.trim() === "")
  ) {
    return undefined;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function isUsableKline(value: unknown): value is unknown[] {
  if (!Array.isArray(value) || value.length < 6) return false;
  return (
    finiteNumber(value[0]) !== undefined &&
    [value[1], value[2], value[3], value[4], value[5]].every(
      (item) => finiteNumber(item) !== undefined,
    )
  );
}

function mapKline(kline: unknown[]) {
  return {
    timestamp: new Date(Number(kline[0])).toISOString(),
    open: Number(kline[1]),
    high: Number(kline[2]),
    low: Number(kline[3]),
    close: Number(kline[4]),
    volume: Number(kline[5]),
  };
}

function yahooTimestamp(value: unknown): string | undefined {
  const seconds = finiteNumber(value);
  if (seconds === undefined) return undefined;
  const date = new Date(seconds * 1000);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

function limitFrom(value: unknown, defaultLimit = 5): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 1) return defaultLimit;
  return Math.min(Math.trunc(parsed), 1000);
}

router.post("/test-connection", async (req, res) => {
  const source = validateSource(res, req.body?.source);
  if (!source) return;

  const type = req.body?.type;
  const startTime = Date.now();

  if (source === "binance") {
    try {
      const response = await axios.get(
        "https://api.binance.com/api/v3/ping",
        { timeout: 5000 },
      );
      if (response.status !== 200) {
        throw unexpectedStatus(response.status, "Binance");
      }
      if (
        response.data &&
        typeof response.data === "object" &&
        "connected" in response.data &&
        response.data.connected === false
      ) {
        return sendNoData(
          res,
          source,
          "Binance did not report a connected state",
        );
      }

      return res.json({
        success: true,
        message: "Binance API connection successful",
        data: {
          source,
          type,
          connected: true,
          latency: Date.now() - startTime,
          timestamp: new Date().toISOString(),
        },
      });
    } catch (error) {
      return sendUpstreamDataError(
        res,
        source,
        error,
        "Binance API connection failed",
      );
    }
  }

  if (source === "yahoo") {
    try {
      const response = await axios.get(YAHOO_CHART_URL, {
        timeout: 5000,
        headers: YAHOO_HEADERS,
      });
      if (response.status !== 200) {
        throw unexpectedStatus(response.status, "Yahoo Finance");
      }
      if (!response.data?.chart?.result?.[0]) {
        return sendNoData(
          res,
          source,
          "Yahoo Finance returned no usable connection data",
        );
      }

      return res.json({
        success: true,
        message: "Yahoo Finance connection successful",
        data: {
          source,
          type,
          connected: true,
          latency: Date.now() - startTime,
          timestamp: new Date().toISOString(),
        },
      });
    } catch (error) {
      return sendYahooFailure(res, error, "connection");
    }
  }

  try {
    const adapter = new TushareAdapter(config.TUSHARE_TOKEN);
    const connected = await adapter.connect();
    if (!connected) {
      return sendOperationalDataError(
        res,
        502,
        "SOURCE_UNREACHABLE",
        "Tushare Pro did not report a connected state",
        { source, retryable: true },
      );
    }

    return res.json({
      success: true,
      message: "Tushare Pro connection successful",
      data: {
        source,
        type: "REST API",
        connected: true,
        latency: Date.now() - startTime,
        timestamp: new Date().toISOString(),
      },
    });
  } catch (error) {
    return sendUpstreamDataError(
      res,
      source,
      error,
      "Failed to connect to Tushare Pro",
    );
  }
});

router.post("/sample", async (req, res) => {
  const source = validateSource(res, req.body?.source);
  if (!source) return;

  const symbol = req.body?.symbol;
  const limit = limitFrom(req.body?.limit);

  if (source === "binance") {
    try {
      const response = await axios.get(
        "https://api.binance.com/api/v3/klines",
        {
          params: { symbol, interval: "1d", limit },
          timeout: 10000,
        },
      );
      if (response.status !== 200) {
        throw unexpectedStatus(response.status, "Binance");
      }

      const klines = Array.isArray(response.data)
        ? response.data.filter(isUsableKline)
        : [];
      if (klines.length === 0) {
        return sendNoData(
          res,
          source,
          "Binance returned no usable sample data",
        );
      }

      return res.json({
        success: true,
        message: "Sample data retrieved successfully",
        data: klines.map((kline) => ({
          symbol,
          ...mapKline(kline),
          source,
        })),
      });
    } catch (error) {
      return sendUpstreamDataError(
        res,
        source,
        error,
        "Failed to retrieve Binance sample data",
      );
    }
  }

  if (source === "yahoo") {
    try {
      const response = await axios.get(YAHOO_CHART_URL, {
        params: { interval: "1d", range: `${limit}d` },
        timeout: 10000,
        headers: YAHOO_HEADERS,
      });
      if (response.status !== 200) {
        throw unexpectedStatus(response.status, "Yahoo Finance");
      }

      const result = response.data?.chart?.result?.[0];
      const timestamps = Array.isArray(result?.timestamp)
        ? result.timestamp
        : [];
      const quotes = result?.indicators?.quote?.[0] || {};
      const sampleData = timestamps
        .slice(-limit)
        .flatMap((timestamp: unknown, index: number) => {
          const normalizedTimestamp = yahooTimestamp(timestamp);
          if (
            !normalizedTimestamp ||
            finiteNumber(quotes.close?.[index]) === undefined
          ) {
            return [];
          }
          return [
            {
              symbol,
              timestamp: normalizedTimestamp,
              open: quotes.open?.[index] || 0,
              high: quotes.high?.[index] || 0,
              low: quotes.low?.[index] || 0,
              close: quotes.close?.[index] || 0,
              volume: quotes.volume?.[index] || 0,
              source,
              qualityScore: 0.95,
            },
          ];
        });

      if (sampleData.length === 0) {
        return sendNoData(
          res,
          source,
          "Yahoo Finance returned no usable sample data",
        );
      }

      return res.json({
        success: true,
        message: "Sample data retrieved successfully",
        data: sampleData,
      });
    } catch (error) {
      return sendYahooFailure(res, error, "sample");
    }
  }

  try {
    const adapter = new TushareAdapter(config.TUSHARE_TOKEN);
    const endTime = new Date();
    const startTime = new Date(
      endTime.getTime() - 45 * 24 * 60 * 60 * 1000,
    );
    const sampleData = await adapter.fetchHistoricalData({
      symbol: symbol || "000001.SZ",
      startTime,
      endTime,
      interval: "1d",
    });
    const selected = sampleData.slice(-Math.max(1, Math.min(limit, 20)));
    if (selected.length === 0) {
      return sendNoData(
        res,
        source,
        "Tushare Pro returned no usable sample data",
      );
    }

    return res.json({
      success: true,
      message: "Real Tushare Pro daily data retrieved successfully",
      data: selected,
    });
  } catch (error) {
    return sendUpstreamDataError(
      res,
      source,
      error,
      "Failed to retrieve Tushare Pro sample data",
    );
  }
});

router.post("/test-api", async (req, res) => {
  const source = validateSource(res, req.body?.source);
  if (!source) return;

  const apiType = req.body?.apiType;
  if (typeof apiType !== "string" || !API_TYPES.has(apiType)) {
    return sendOperationalDataError(
      res,
      400,
      "INVALID_API_TYPE",
      "API type must be market, historical, or realtime",
      { source },
    );
  }

  const symbol = req.body?.symbol;
  const interval = req.body?.interval;

  if (source === "binance") {
    try {
      let testData: unknown;

      if (apiType === "market") {
        const response = await axios.get(
          "https://api.binance.com/api/v3/ticker/24hr",
          { params: { symbol }, timeout: 10000 },
        );
        if (response.status !== 200) {
          throw unexpectedStatus(response.status, "Binance");
        }

        const data = response.data;
        const price = finiteNumber(data?.lastPrice);
        if (price !== undefined) {
          testData = {
            symbol,
            price,
            change24h: Number(data.priceChange),
            changePercent24h: Number(data.priceChangePercent),
            volume24h: Number(data.volume),
            high24h: Number(data.highPrice),
            low24h: Number(data.lowPrice),
            timestamp: new Date().toISOString(),
            source: "binance-api",
          };
        }
      } else if (apiType === "historical") {
        const intervalMap: Record<string, string> = {
          "1m": "1m",
          "5m": "5m",
          "1h": "1h",
          "1d": "1d",
        };
        const response = await axios.get(
          "https://api.binance.com/api/v3/klines",
          {
            params: {
              symbol,
              interval: intervalMap[interval] || "1h",
              limit: 10,
            },
            timeout: 10000,
          },
        );
        if (response.status !== 200) {
          throw unexpectedStatus(response.status, "Binance");
        }

        const data = Array.isArray(response.data)
          ? response.data.filter(isUsableKline).map(mapKline)
          : [];
        if (data.length > 0) {
          testData = { symbol, interval, data, count: data.length };
        }
      } else {
        const response = await axios.get(
          "https://api.binance.com/api/v3/ticker/price",
          { params: { symbol }, timeout: 10000 },
        );
        if (response.status !== 200) {
          throw unexpectedStatus(response.status, "Binance");
        }

        const price = finiteNumber(response.data?.price);
        if (price !== undefined) {
          testData = {
            symbol,
            price,
            timestamp: new Date().toISOString(),
            source: "binance-api",
          };
        }
      }

      if (testData === undefined) {
        return sendNoData(
          res,
          source,
          "Binance returned no usable API data",
        );
      }

      return res.json({
        success: true,
        message: "API test successful",
        data: testData,
      });
    } catch (error) {
      return sendUpstreamDataError(
        res,
        source,
        error,
        "Binance API test failed",
      );
    }
  }

  if (source === "yahoo") {
    try {
      let testData: unknown;

      if (apiType === "market") {
        const response = await axios.get(YAHOO_CHART_URL, {
          params: { interval: "1d", range: "1d" },
          timeout: 10000,
          headers: YAHOO_HEADERS,
        });
        if (response.status !== 200) {
          throw unexpectedStatus(response.status, "Yahoo Finance");
        }

        const meta = response.data?.chart?.result?.[0]?.meta;
        const price = finiteNumber(meta?.regularMarketPrice);
        if (price !== undefined) {
          testData = {
            symbol,
            price,
            change24h: Number(meta.regularMarketChange || 0),
            changePercent24h: Number(meta.regularMarketChangePercent || 0),
            volume24h: Number(meta.regularMarketVolume || 0),
            high24h: Number(meta.dayHigh || 0),
            low24h: Number(meta.dayLow || 0),
            timestamp: new Date().toISOString(),
            source: "yahoo-finance-api",
          };
        }
      } else if (apiType === "historical") {
        const response = await axios.get(YAHOO_CHART_URL, {
          params: { interval: "1d", range: "5d" },
          timeout: 10000,
          headers: YAHOO_HEADERS,
        });
        if (response.status !== 200) {
          throw unexpectedStatus(response.status, "Yahoo Finance");
        }

        const result = response.data?.chart?.result?.[0];
        const timestamps = Array.isArray(result?.timestamp)
          ? result.timestamp
          : [];
        const quotes = result?.indicators?.quote?.[0] || {};
        const data = timestamps.flatMap(
          (timestamp: unknown, index: number) => {
            const normalizedTimestamp = yahooTimestamp(timestamp);
            if (
              !normalizedTimestamp ||
              finiteNumber(quotes.close?.[index]) === undefined
            ) {
              return [];
            }
            return [
              {
                timestamp: normalizedTimestamp,
                open: quotes.open?.[index] || 0,
                high: quotes.high?.[index] || 0,
                low: quotes.low?.[index] || 0,
                close: quotes.close?.[index] || 0,
                volume: quotes.volume?.[index] || 0,
              },
            ];
          },
        );
        if (data.length > 0) {
          testData = { symbol, interval, data, count: data.length };
        }
      } else {
        const response = await axios.get(YAHOO_CHART_URL, {
          params: { interval: "1m", range: "1d" },
          timeout: 10000,
          headers: YAHOO_HEADERS,
        });
        if (response.status !== 200) {
          throw unexpectedStatus(response.status, "Yahoo Finance");
        }

        const price = finiteNumber(
          response.data?.chart?.result?.[0]?.meta?.regularMarketPrice,
        );
        if (price !== undefined) {
          testData = {
            symbol,
            price,
            timestamp: new Date().toISOString(),
            source: "yahoo-finance-api",
          };
        }
      }

      if (testData === undefined) {
        return sendNoData(
          res,
          source,
          "Yahoo Finance returned no usable API data",
        );
      }

      return res.json({
        success: true,
        message: "API test successful",
        data: testData,
      });
    } catch (error) {
      return sendYahooFailure(res, error, "api");
    }
  }

  if (apiType !== "historical" || interval !== "1d") {
    return sendOperationalDataError(
      res,
      400,
      "INVALID_API_TYPE",
      "Tushare Pro supports historical daily data only",
      { source },
    );
  }

  try {
    const adapter = new TushareAdapter(config.TUSHARE_TOKEN);
    const endTime = new Date();
    const startTime = new Date(endTime);
    startTime.setUTCDate(startTime.getUTCDate() - 30);
    const data = await adapter.fetchHistoricalData({
      symbol: symbol || "000001.SZ",
      interval: "1d",
      startTime,
      endTime,
    });
    if (data.length === 0) {
      return sendNoData(
        res,
        source,
        "Tushare Pro returned no usable historical data",
      );
    }

    return res.json({
      success: true,
      message: "Real Tushare Pro daily data retrieved successfully",
      data,
    });
  } catch (error) {
    return sendUpstreamDataError(
      res,
      source,
      error,
      "Tushare Pro API test failed",
    );
  }
});

export default router;
