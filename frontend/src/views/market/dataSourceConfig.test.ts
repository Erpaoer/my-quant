import { describe, expect, it } from "vitest";
import {
  apiTypesForSource,
  defaultSymbolFor,
  normalizeSourceId,
} from "./dataSourceConfig";
import * as dataSourceConfig from "./dataSourceConfig";

describe("data source UI configuration", () => {
  it("maps Tushare Pro to the backend source id", () => {
    expect(normalizeSourceId({ name: "Tushare Pro", id: "tushare" })).toBe(
      "tushare",
    );
  });

  it("uses an A-share symbol for Tushare samples", () => {
    expect(defaultSymbolFor("tushare")).toBe("000001.SZ");
    expect(defaultSymbolFor("binance")).toBe("BTCUSDT");
  });

  it("defaults the API test form to Tushare daily data", () => {
    expect(dataSourceConfig).toHaveProperty("createDefaultApiTestForm");

    const createDefaultApiTestForm = (
      dataSourceConfig as typeof dataSourceConfig & {
        createDefaultApiTestForm: () => Record<string, string>;
      }
    ).createDefaultApiTestForm;

    expect(createDefaultApiTestForm()).toEqual({
      source: "tushare",
      apiType: "historical",
      symbol: "000001.SZ",
      interval: "1d",
    });
  });

  it("does not present Yahoo as connected before a real test", () => {
    expect(dataSourceConfig).toHaveProperty("createDefaultDataSources");

    const createDefaultDataSources = (
      dataSourceConfig as typeof dataSourceConfig & {
        createDefaultDataSources: () => Array<{
          id?: string;
          connected: boolean;
        }>;
      }
    ).createDefaultDataSources;

    const yahoo = createDefaultDataSources().find(
      (source) => source.id === "yahoo",
    );
    expect(yahoo?.connected).toBe(false);
  });

  it("does not automatically probe any source when the page mounts", () => {
    expect(dataSourceConfig).toHaveProperty("startupSourceIds");
    expect(
      (
        dataSourceConfig as typeof dataSourceConfig & {
          startupSourceIds: readonly string[];
        }
      ).startupSourceIds,
    ).toEqual([]);
  });

  it("offers historical daily tests only for Tushare", () => {
    expect(apiTypesForSource("tushare")).toEqual([
      { label: "Historical daily data", value: "historical" },
    ]);
    expect(apiTypesForSource("yahoo").map((option) => option.value)).toEqual([
      "market",
      "historical",
      "realtime",
    ]);
  });
});
