import { describe, expect, it, vi } from "vitest";
import type { ExchangeConfig } from "../types";
import { BybitAdapter } from "./BybitAdapter";

const config: ExchangeConfig = {
  id: "bybit",
  name: "Bybit",
  apiKey: "test-key",
  apiSecret: "test-secret",
  testnet: true,
  enableRateLimit: true,
};

function createAdapter(): BybitAdapter {
  return new BybitAdapter(config);
}

describe("BybitAdapter contract", () => {
  it("reports truthful exchange capabilities", async () => {
    const adapter = createAdapter();

    expect(typeof adapter.getExchangeInfo).toBe("function");
    await expect(adapter.getExchangeInfo()).resolves.toMatchObject({
      id: "bybit",
      name: "Bybit",
      features: {
        fetchMyTrades: true,
      },
      apiStandards: {
        rest: true,
        websocket: false,
      },
    });
  });

  it("implements personal trade history through the normalized trade path", async () => {
    const adapter = createAdapter();
    const fetchMyTrades = vi.fn().mockResolvedValue([
      {
        id: "trade-1",
        symbol: "BTC/USDT",
        side: "buy",
        amount: 0.1,
        price: 50000,
        datetime: "2026-07-27T00:00:00.000Z",
        fee: { cost: 0.5, currency: "USDT" },
      },
    ]);
    (
      adapter as unknown as {
        exchange: { fetchMyTrades: typeof fetchMyTrades };
      }
    ).exchange = { fetchMyTrades };

    expect(typeof adapter.getMyTrades).toBe("function");
    await expect(adapter.getMyTrades("BTC/USDT", 10)).resolves.toMatchObject([
      {
        exchangeId: "trade-1",
        symbol: "BTC/USDT",
        quantity: 0.1,
        fee: 0.5,
      },
    ]);
  });

  it("rejects WebSocket subscriptions instead of pretending they work", async () => {
    const adapter = createAdapter();

    await expect(
      adapter.subscribeMarketData(["BTC/USDT"]),
    ).rejects.toThrow("Bybit WebSocket market data is not implemented");
  });

  it("maps CCXT position fields to the exchange position contract", async () => {
    const adapter = createAdapter();
    (
      adapter as unknown as {
        exchange: { fetchPositions: () => Promise<unknown[]> };
      }
    ).exchange = {
      fetchPositions: vi.fn().mockResolvedValue([
        {
          id: "position-1",
          symbol: "BTC/USDT",
          side: "long",
          contracts: 2,
          entryPrice: 49000,
          markPrice: 50000,
          unrealizedPnl: 2000,
          percentage: 4.08,
          leverage: 2,
          initialMargin: 25000,
          liquidationPrice: 25000,
        },
      ]),
    };

    await expect(adapter.getPositions()).resolves.toMatchObject([
      {
        size: 2,
        pnl: 2000,
        margin: 25000,
        status: "open",
      },
    ]);
  });

  it("uses CCXT baseVolume for ticker volume", async () => {
    const adapter = createAdapter();
    (
      adapter as unknown as {
        exchange: { fetchTicker: () => Promise<Record<string, unknown>> };
      }
    ).exchange = {
      fetchTicker: vi.fn().mockResolvedValue({
        symbol: "BTC/USDT",
        bid: 49999,
        ask: 50001,
        last: 50000,
        high: 51000,
        low: 48000,
        baseVolume: 12,
        datetime: "2026-07-27T00:00:00.000Z",
      }),
    };

    await expect(adapter.getTicker("BTC/USDT")).resolves.toMatchObject({
      symbol: "BTC/USDT",
      volume: 12,
    });
  });
});
