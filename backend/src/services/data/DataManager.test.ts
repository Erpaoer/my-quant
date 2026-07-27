import { beforeEach, describe, expect, it } from "vitest";
import { BaseDataSourceAdapter } from "./adapters/BaseAdapter";
import { initDataCache } from "./cache/DataCache";
import { DataManager } from "./DataManager";
import {
  DataSourceConfig,
  HistoricalDataRequest,
  MarketData,
  RealTimeData,
} from "./types";

class TestAdapter extends BaseDataSourceAdapter {
  constructor(private readonly rows: MarketData[]) {
    const config: DataSourceConfig = {
      name: "test",
      type: "rest",
      rateLimit: 0,
      timeout: 1000,
      enabled: true,
    };
    super(config);
  }

  async connect(): Promise<boolean> {
    this.connected = true;
    return true;
  }

  async disconnect(): Promise<boolean> {
    this.connected = false;
    return true;
  }

  async fetchHistoricalData(
    _request: HistoricalDataRequest,
  ): Promise<MarketData[]> {
    return this.rows;
  }

  async fetchRealTimeData(_symbols: string[]): Promise<RealTimeData[]> {
    return [];
  }

  async subscribe(
    _symbols: string[],
    _callback: (data: RealTimeData) => void,
  ): Promise<void> {}

  async unsubscribe(_symbols: string[]): Promise<void> {}
}

describe("DataManager", () => {
  beforeEach(() => {
    initDataCache({ enabled: false, ttl: 60, maxSize: 10 });
  });

  it("awaits historical data before producing a quality report", async () => {
    const row: MarketData = {
      symbol: "000001.SZ",
      timestamp: new Date("2026-07-25T00:00:00.000Z"),
      open: 10,
      high: 11,
      low: 9,
      close: 10.5,
      volume: 1000,
      source: "test",
    };
    const manager = new DataManager();
    manager.registerAdapter(new TestAdapter([row]));
    await manager.initialize();

    const report = await manager.getDataQualityReport(["000001.SZ"]);

    expect(report).toEqual([
      expect.objectContaining({
        symbol: "000001.SZ",
        totalRecords: 1,
        validRecords: 1,
      }),
    ]);
  });
});
