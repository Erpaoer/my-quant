export interface DataSourceIdentity {
  name: string;
  id?: string;
}

export interface DataSourceState extends DataSourceIdentity {
  type: string;
  connected: boolean;
  latency: number;
  errorCount: number;
}

export interface ApiTestForm {
  source: string;
  apiType: string;
  symbol: string;
  interval: string;
}

export interface ApiTypeOption {
  label: string;
  value: "market" | "historical" | "realtime";
}

const defaultApiTypes: ApiTypeOption[] = [
  { label: "Market snapshot", value: "market" },
  { label: "Historical data", value: "historical" },
  { label: "Real-time data", value: "realtime" },
];

export function apiTypesForSource(sourceId: string): ApiTypeOption[] {
  return sourceId === "tushare"
    ? [{ label: "Historical daily data", value: "historical" }]
    : defaultApiTypes.map((option) => ({ ...option }));
}

export function normalizeSourceId(source: DataSourceIdentity): string {
  return source.id || source.name.toLowerCase().replace(/\s+/g, "-");
}

export function defaultSymbolFor(sourceId: string): string {
  return sourceId === "tushare" ? "000001.SZ" : "BTCUSDT";
}

export function createDefaultApiTestForm(): ApiTestForm {
  return {
    source: "tushare",
    apiType: "historical",
    symbol: "000001.SZ",
    interval: "1d",
  };
}

export function createDefaultDataSources(): DataSourceState[] {
  return [
    {
      name: "Binance",
      type: "REST API",
      connected: false,
      latency: 0,
      errorCount: 0,
    },
    {
      name: "OKX",
      type: "REST API",
      connected: false,
      latency: 0,
      errorCount: 0,
    },
    {
      name: "Yahoo Finance",
      id: "yahoo",
      type: "REST API",
      connected: false,
      latency: 0,
      errorCount: 0,
    },
    {
      name: "Tushare Pro",
      id: "tushare",
      type: "REST API (daily)",
      connected: false,
      latency: 0,
      errorCount: 0,
    },
    {
      name: "Binance WebSocket",
      type: "WebSocket",
      connected: false,
      latency: 0,
      errorCount: 0,
    },
  ];
}

export const startupSourceIds: readonly string[] = [];
