# Runtime gaps after P0 stabilization

The project now compiles and its current automated smoke checks pass, but the
following areas are still prototypes or intentionally non-persistent.

- Dashboard assets, profit figures, strategy performance, recent activity, and
  several system metrics are generated or hard-coded demonstration values.
- Legacy market-data routes still contain generated sample/history helpers.
  Tushare daily history is real; unsupported Tushare real-time modes fail
  explicitly instead of returning generated success data.
- Risk alerts and trading configuration overrides are runtime-only because the
  checked-in Prisma schema has no `RiskAlert` or `TradingConfig` model. They do
  not survive a backend restart.
- The real-time exchange subscription API is now wired through the exchange
  service, but Bybit WebSocket market-data subscriptions are explicitly
  unsupported by the current adapter.
- Backtesting has typed persistence and route contracts, but strategy execution,
  fill modelling, slippage, attribution, and production-grade performance
  analysis still need dedicated implementation and verification.
- Live-order execution and risk controls are not production-ready. Before real
  capital is enabled, add exchange sandbox integration tests, idempotent order
  handling, reconciliation, durable risk configuration, and audited secrets
  management.
- Frontend production build succeeds, but Rollup reports a circular chunk
  dependency through `src/api/index.ts`, and the charts/UI chunks exceed 1 MB.
  These are performance and execution-order risks to address in a later tranche.

