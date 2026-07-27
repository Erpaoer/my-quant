# Backend TypeScript Stabilization Implementation Plan

> Execute this plan in small commits. Do not weaken `strict`, `strictNullChecks`,
> or `noImplicitReturns` to make the compiler green.

**Goal:** Reduce the backend's 257 TypeScript errors to zero while preserving the
verified authentication, navigation, Tushare, Yahoo failure, and test behavior.

**Baseline:** `npm run build` fails with 257 diagnostics. The largest groups are
Bybit (39), risk management (32), trading routes (30), backtest controller (24),
data routes (19), and real-time trading (15). Backend tests currently pass 20/20.

### Task 1: Repair module boundaries that create cascading failures

- [x] Fix `BaseAdapter.ts` and `BaseExchange.ts` imports so they resolve their
  domain `types.ts` files.
- [x] Fix logger imports in the backtest service and controller.
- [x] Replace ambiguous data barrel exports with explicit type/class exports.
- [x] Run `npm test -- --run` and recount compiler diagnostics.
- [x] Commit only this root-cause tranche.

### Task 2: Make the exchange abstraction internally consistent

- [x] Add compile-focused tests for symbol formatting and adapter construction.
- [x] Align `formatSymbol` visibility across `BaseExchange`, Binance, and OKX.
- [x] Implement or explicitly mark unsupported abstract Bybit operations without
  returning fabricated success.
- [x] Replace unsafe `unknown` exchange payload access with narrow response types.
- [x] Run exchange tests, the backend suite, and recount diagnostics.

### Task 3: Reconcile Prisma schema and runtime service assumptions

- [x] Run `prisma validate` and regenerate the client from the checked-in schema.
- [x] Inventory every missing Prisma model/field diagnostic by service.
- [x] Treat the checked-in schema as the persistence contract; adapt unfinished
  services to existing fields unless a field is required by a verified workflow.
- [ ] Add repository/service tests before each schema-affecting behavior change.
- [x] Run `prisma validate`, tests, and compile after each domain.

### Task 4: Repair route and service type safety by domain

- [x] Backtest controllers and routes: return paths, error narrowing, typed arrays.
- [x] Data routes and manager: request query narrowing, awaited promises, typed
  indicator and market-data arrays.
- [x] Trading routes, logs, and sockets: nullable account identifiers, order model
  fields, response payload narrowing.
- [x] Risk management: rule discriminants, nullable violations, JSON serialization,
  and missing-variable defects.
- [ ] Keep each domain in a separate commit with focused tests.

### Task 5: Establish the production compile gate

- [x] Make `npm run build` exit 0 without reducing compiler strictness.
- [ ] Run backend and frontend unit suites, frontend production build, and browser
  navigation E2E.
- [ ] Re-run live read-only Tushare connection/sample/history checks.
- [ ] Document remaining runtime mocks separately from compiler completion.
