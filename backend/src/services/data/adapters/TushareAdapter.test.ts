import { describe, expect, it, vi } from "vitest";
import { TushareAdapter } from "./TushareAdapter";

const response = (data: unknown) => ({ data });

describe("TushareAdapter", () => {
  it("tests connectivity through the supported daily data endpoint", async () => {
    const post = vi.fn().mockResolvedValue(
      response({ code: 0, msg: null, data: { fields: [], items: [] } }),
    );
    const adapter = new TushareAdapter("secret-token", { post });

    await expect(adapter.connect()).resolves.toBe(true);
    expect(post).toHaveBeenCalledWith(
      "http://api.tushare.pro",
      expect.objectContaining({
        api_name: "daily",
        params: expect.objectContaining({ ts_code: "000001.SZ" }),
      }),
      expect.objectContaining({ timeout: 10000 }),
    );
  });

  it("normalizes and sorts daily OHLCV rows", async () => {
    const post = vi.fn().mockResolvedValue(
      response({
        code: 0,
        msg: null,
        data: {
          fields: ["ts_code", "trade_date", "open", "high", "low", "close", "vol"],
          items: [
            ["000001.SZ", "20260710", 10, 11, 9.8, 10.5, 1200],
            ["000001.SZ", "20260709", 9.7, 10.2, 9.5, 10, 900],
          ],
        },
      }),
    );
    const adapter = new TushareAdapter("secret-token", { post });

    const rows = await adapter.fetchHistoricalData({
      symbol: "000001.SZ",
      startTime: new Date("2026-07-01T00:00:00Z"),
      endTime: new Date("2026-07-12T00:00:00Z"),
      interval: "1d",
    });

    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      symbol: "000001.SZ",
      open: 9.7,
      high: 10.2,
      low: 9.5,
      close: 10,
      volume: 900,
      source: "Tushare Pro",
    });
    expect(rows[0].timestamp.toISOString()).toBe("2026-07-09T00:00:00.000Z");
    expect(post).toHaveBeenCalledWith(
      "http://api.tushare.pro",
      expect.objectContaining({ api_name: "daily", token: "secret-token" }),
      expect.objectContaining({ timeout: 10000 }),
    );
  });

  it("returns an empty list for a successful empty response", async () => {
    const adapter = new TushareAdapter("secret-token", {
      post: vi.fn().mockResolvedValue(
        response({ code: 0, msg: null, data: { fields: [], items: [] } }),
      ),
    });

    await expect(
      adapter.fetchHistoricalData({
        symbol: "000001.SZ",
        startTime: new Date("2026-07-01T00:00:00Z"),
        endTime: new Date("2026-07-12T00:00:00Z"),
        interval: "1d",
      }),
    ).resolves.toEqual([]);
  });

  it("sanitizes upstream errors and never exposes the token", async () => {
    const adapter = new TushareAdapter("secret-token", {
      post: vi.fn().mockResolvedValue(
        response({ code: -2001, msg: "抱歉，您没有访问该接口的权限", data: null }),
      ),
    });

    await expect(adapter.connect()).rejects.toThrow("没有访问该接口的权限");
    await expect(adapter.connect()).rejects.not.toThrow("secret-token");
  });

  it("rejects unsupported intraday and real-time requests explicitly", async () => {
    const adapter = new TushareAdapter("secret-token", { post: vi.fn() });

    await expect(
      adapter.fetchHistoricalData({
        symbol: "000001.SZ",
        startTime: new Date(),
        endTime: new Date(),
        interval: "1h",
      }),
    ).rejects.toThrow("daily intervals");
    await expect(adapter.fetchRealTimeData(["000001.SZ"])).rejects.toThrow(
      "real-time",
    );
  });
});
