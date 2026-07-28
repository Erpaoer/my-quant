# Truthful operational market-data design

Date: 2026-07-28

## Goal

Make every mounted operational market-data endpoint truthful: it must return data obtained from a real upstream source or persisted database records, or return an explicit failure. Generated and random market data must never be presented as a successful operational response.

## Scope

This iteration covers the currently mounted routes that still synthesize successful market data:

- `GET /data/market/:symbol`
- `GET /data/market`
- `GET /data/historical`
- `POST /data-test/sample`
- `POST /data-test/test-api`

Dashboard asset, profit, activity, and system-monitoring mocks are recorded as the immediately following iteration. They are excluded here so the data-route contract can be changed and tested as one bounded unit.

## Chosen approach

Apply a focused route hardening change while preserving the existing public route shapes and adapter architecture.

- Reuse `DataManager` for operational real-time market requests.
- Keep real database rows returned by the historical route.
- Keep the existing real Binance, Yahoo Finance, and Tushare request implementations in the data-source test routes.
- Remove all generated-success fallbacks from these mounted handlers.
- Reject unsupported operations explicitly instead of pretending that an adapter exists.

A full adapter-registry rewrite is deferred because it would mix architectural migration with correctness fixes. Disabling all incomplete routes is also rejected because real Yahoo Finance, Tushare, and Binance functionality is already useful.

## Route behavior

### Real-time market routes

`GET /data/market/:symbol` and `GET /data/market` initialize and query the existing `DataManager`.

- Successful responses contain only normalized records returned by connected adapters.
- Responses identify the returned source through the normalized record metadata.
- If no connected adapter returns a usable record, the route returns an explicit non-2xx `NO_DATA` or upstream failure response.
- These handlers do not call random-number or market-data generator helpers.

### Historical route

`GET /data/historical` continues to query persisted `marketData` records.

- Existing real rows are never discarded because fewer than the requested limit were found.
- A non-empty short result is returned with metadata including `requested`, `returned`, `source: "database"`, and `partial: true`.
- A complete result uses `partial: false`.
- No persisted rows results in a non-2xx `NO_DATA` response.
- No random OHLCV series is generated.

This iteration does not silently choose an upstream provider to fill a database shortfall. Provider selection must be explicit in a later ingestion design.

### Data-source sample and API-test routes

`POST /data-test/sample` and `POST /data-test/test-api` retain only real implementations.

- Binance uses its real public HTTP endpoints.
- Yahoo Finance uses its real adapter/request path.
- Tushare uses the server-side token and real adapter.
- A recognized source whose requested operation is not implemented returns `501 SOURCE_NOT_IMPLEMENTED`.
- An unknown source or invalid API type returns `400 INVALID_SOURCE` or `400 INVALID_API_TYPE`.
- Upstream failures never fall back to generated samples.

## Error contract

Operational failures use a stable JSON shape:

```json
{
  "success": false,
  "code": "SOURCE_UNREACHABLE",
  "message": "Unable to retrieve data from Binance",
  "source": "binance",
  "retryable": true
}
```

The `data` property is omitted on failures. Responses and logs never include configured credentials.

Error classification:

- `400 INVALID_REQUEST`, `INVALID_SOURCE`, or `INVALID_API_TYPE`: malformed or unknown input.
- `501 SOURCE_NOT_IMPLEMENTED`: known source or operation without a real implementation.
- `502 SOURCE_UNREACHABLE` or `NO_DATA`: timeout, invalid upstream response, or no usable result.
- `503 SOURCE_AUTH_FAILED` or `SOURCE_RATE_LIMITED`: upstream permission, availability, or throttling problem.
- `500 INTERNAL_ERROR`: unexpected local failures only.

Existing source-specific mappings may retain more precise safe messages, but must follow this success/failure rule.

## Testing strategy

Development follows red-green-refactor.

- Add route tests before implementation changes.
- Verify real adapter success is returned unchanged and includes real source metadata.
- Verify empty real-time results are non-2xx and contain no generated data.
- Verify historical database rows are preserved when fewer than requested and are marked partial.
- Verify an empty historical query returns `NO_DATA`.
- Verify Binance timeout, `403`, `429`, and `5xx` paths never return successful fallback samples.
- Verify unsupported OKX/Huobi operations return `501`.
- Verify unknown sources and invalid API types return `400`.
- Spy on `Math.random` in operational-route regressions and verify it is never called.

Final verification includes focused route tests, the complete backend test suite, backend TypeScript build, frontend tests and production build, service restart, and read-only smoke requests against real configured data sources.

## Follow-up

The next iteration removes mock values from the active dashboard and monitoring paths:

- dashboard totals, PnL, strategies, and activities;
- asset and profit-distribution charts;
- layout health and account summaries;
- monitoring service status, CPU/load, alerts, logs, and unsupported disk/network metrics.

Until a real historical asset-snapshot model exists, charts without defensible records must show an honest empty or unsupported state rather than generated values.
