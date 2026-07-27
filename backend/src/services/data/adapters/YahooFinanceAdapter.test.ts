import { describe, expect, it, vi } from "vitest";
import { YahooFinanceAdapter } from "./YahooFinanceAdapter";

describe("YahooFinanceAdapter", () => {
  it("connects through a direct health request instead of guarded data fetching", async () => {
    const get = vi.fn().mockResolvedValue({
      data: {
        chart: {
          result: [{ meta: { symbol: "AAPL" } }],
          error: null,
        },
      },
    });
    const adapter = new YahooFinanceAdapter(
      {
        name: "Yahoo Finance",
        type: "rest",
        rateLimit: 100,
        timeout: 1000,
        enabled: true,
      },
      { get },
    );
    adapter.on("error", () => undefined);
    const guardedFetch = vi.spyOn(adapter, "fetchHistoricalData");

    await expect(adapter.connect()).resolves.toBe(true);
    expect(adapter.isConnected()).toBe(true);
    expect(guardedFetch).not.toHaveBeenCalled();
    expect(get).toHaveBeenCalledOnce();
    expect(get.mock.calls[0][0]).toContain(
      "query1.finance.yahoo.com/v8/finance/chart/AAPL",
    );
  });
});
