# Runtime gaps after P0 stabilization

The project now compiles and its current automated smoke checks pass.

## Resolved in truthful market-data tranche

- The active `/data-test/{test-connection,sample,test-api}` routes now return
  only real Binance, Yahoo, or Tushare results, or stable operational errors.
- Primary `/data/market`, `/data/market/:symbol`, `/data/overview`, and
  `/data/historical` responses now come only from DataManager adapters or the
  database. Empty external market-data results return `NO_DATA`.
- Legacy `/data/{test-connection,sample,test-api}` routes now return `410`, and
  the active market-data routes no longer contain generated-data helpers.

## Open gaps

- Dashboard assets, profit figures, strategy performance, recent activity, and
  monitoring/system metrics are generated or hard-coded demonstration values.
- `frontend/src/views/market/MarketData.vue` still uses `Math.random` to build
  price cards when its batch market-data request fails. The next tranche must
  replace this with an empty/error state; frontend mocks are not market data.
- Risk alerts and trading configuration overrides are runtime-only because the
  checked-in Prisma schema has no `RiskAlert` or `TradingConfig` model. They do
  not survive a backend restart.
- The real-time exchange subscription API is now wired through the exchange
  service, but Bybit WebSocket market-data subscriptions are explicitly
  unsupported by the current adapter.
- Backtesting has typed persistence and route contracts, but its current
  endpoints still return randomly generated demonstration market data, trades,
  and performance results and cannot be used for strategy evaluation. A real
  strategy-execution loop, fill/slippage modelling, attribution, and
  production-grade performance analysis remain unimplemented and unverified.
- Live-order execution and risk controls are not production-ready. Before real
  capital is enabled, add exchange sandbox integration tests, idempotent order
  handling, reconciliation, durable risk configuration, and audited secrets
  management.
- Frontend production build succeeds, but Rollup reports a circular chunk
  dependency through `src/api/index.ts`, and the charts/UI chunks exceed 1 MB.
  These are performance and execution-order risks to address in a later tranche.
