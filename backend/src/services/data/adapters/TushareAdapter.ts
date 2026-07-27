import axios from "axios";
import { BaseDataSourceAdapter } from "./BaseAdapter";
import type {
  HistoricalDataRequest,
  MarketData,
  RealTimeData,
} from "../types";

interface HttpClient {
  post(
    url: string,
    data: unknown,
    config: { timeout: number },
  ): Promise<{ data: unknown }>;
}

interface TushareResponse {
  code: number;
  msg?: string | null;
  data?: {
    fields?: string[];
    items?: unknown[][];
  } | null;
}

export interface TushareTable {
  fields: string[];
  items: unknown[][];
}

export class TushareAdapter extends BaseDataSourceAdapter {
  private readonly token: string;
  private readonly client: HttpClient;
  private readonly endpoint = "http://api.tushare.pro";

  constructor(token: string, client: HttpClient = axios) {
    super({
      name: "Tushare Pro",
      type: "rest",
      baseUrl: "http://api.tushare.pro",
      rateLimit: 200,
      timeout: 10000,
      enabled: Boolean(token),
    });
    this.token = token;
    this.client = client;
  }

  public async connect(): Promise<boolean> {
    if (!this.token) throw new Error("Tushare token is not configured");

    const endTime = new Date();
    const startTime = new Date(endTime);
    startTime.setUTCDate(startTime.getUTCDate() - 10);
    try {
      await this.request(
        "daily",
        {
          ts_code: "000001.SZ",
          start_date: this.formatDate(startTime),
          end_date: this.formatDate(endTime),
        },
        "ts_code,trade_date,close",
      );
      this.connected = true;
      this.connectionTime = new Date();
      this.lastError = null;
      return true;
    } catch (error) {
      this.connected = false;
      this.lastError = error instanceof Error ? error : new Error(String(error));
      this.errorCount++;
      throw this.lastError;
    }
  }

  public async disconnect(): Promise<boolean> {
    this.connected = false;
    return true;
  }

  public async fetchHistoricalData(
    request: HistoricalDataRequest,
  ): Promise<MarketData[]> {
    if (request.interval !== "1d") {
      throw new Error("Tushare Pro currently supports daily intervals only");
    }
    if (!this.validateSymbol(request.symbol)) throw new Error("Invalid symbol");

    const table = await this.request(
      "daily",
      {
        ts_code: request.symbol.toUpperCase(),
        start_date: this.formatDate(request.startTime),
        end_date: this.formatDate(request.endTime),
      },
      "ts_code,trade_date,open,high,low,close,vol",
    );

    return this.rows(table)
      .map((row) => ({
        symbol: String(row.ts_code),
        timestamp: this.parseTradeDate(String(row.trade_date)),
        open: Number(row.open),
        high: Number(row.high),
        low: Number(row.low),
        close: Number(row.close),
        volume: Number(row.vol || 0),
        source: "Tushare Pro",
        qualityScore: 0.98,
      }))
      .sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
  }

  public async fetchStockList(): Promise<Record<string, unknown>[]> {
    const table = await this.request(
      "stock_basic",
      { exchange: "", list_status: "L" },
      "ts_code,symbol,name,area,industry,market,list_date",
    );
    return this.rows(table);
  }

  public async fetchTradeCalendar(
    startTime: Date,
    endTime: Date,
  ): Promise<Record<string, unknown>[]> {
    const table = await this.request(
      "trade_cal",
      {
        exchange: "SSE",
        start_date: this.formatDate(startTime),
        end_date: this.formatDate(endTime),
      },
      "exchange,cal_date,is_open,pretrade_date",
    );
    return this.rows(table);
  }

  public async fetchRealTimeData(_symbols: string[]): Promise<RealTimeData[]> {
    throw new Error("Tushare Pro adapter does not provide real-time quotes");
  }

  public async subscribe(
    _symbols: string[],
    _callback: (data: RealTimeData) => void,
  ): Promise<void> {
    throw new Error("Tushare Pro adapter does not provide real-time subscriptions");
  }

  public async unsubscribe(_symbols: string[]): Promise<void> {
    return;
  }

  private async request(
    apiName: string,
    params: Record<string, unknown>,
    fields: string,
  ): Promise<TushareTable> {
    const started = Date.now();
    try {
      const response = await this.client.post(
        this.endpoint,
        { api_name: apiName, token: this.token, params, fields },
        { timeout: this.config.timeout },
      );
      const payload = response.data as TushareResponse;
      if (!payload || payload.code !== 0) {
        throw new Error(payload?.msg || `Tushare API error ${payload?.code ?? "unknown"}`);
      }
      this.updateMetrics(Date.now() - started);
      return {
        fields: payload.data?.fields || [],
        items: payload.data?.items || [],
      };
    } catch (error) {
      this.lastResponseTime = Date.now() - started;
      this.requestCount++;
      this.errorCount++;
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(this.sanitize(message));
    }
  }

  private rows(table: TushareTable): Record<string, unknown>[] {
    return table.items.map((item) =>
      Object.fromEntries(table.fields.map((field, index) => [field, item[index]])),
    );
  }

  private formatDate(date: Date): string {
    return date.toISOString().slice(0, 10).replace(/-/g, "");
  }

  private parseTradeDate(value: string): Date {
    const match = /^(\d{4})(\d{2})(\d{2})$/.exec(value);
    if (!match) throw new Error("Invalid Tushare trade date");
    return new Date(`${match[1]}-${match[2]}-${match[3]}T00:00:00.000Z`);
  }

  private sanitize(message: string): string {
    return this.token ? message.split(this.token).join("[redacted]") : message;
  }
}
