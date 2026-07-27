# Navigation Persistence and Tushare Data Source Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep dashboard module tabs active across renders and refreshes, and add a real read-only Tushare Pro data source.

**Architecture:** `V3Layout` owns tab state and persists serializable static tab IDs through a focused helper; `TabSystem` becomes a controlled renderer. The backend adds a server-only Tushare HTTP client/adapter and explicit test routes that never fall back to generated data, while the existing data-source test screen exposes Tushare safely.

**Tech Stack:** Vue 3, Pinia/Vue Router, Vitest, TypeScript, Express, Axios, Tushare Pro HTTP API.

---

## File map

- Create `frontend/src/components/layout/tabRegistry.ts`: static module-to-tab definitions and lookup helpers.
- Create `frontend/src/components/layout/tabPersistence.ts`: validate, load, and save serializable tab state.
- Create `frontend/src/components/layout/tabPersistence.test.ts`: restoration regression coverage.
- Modify `frontend/src/components/layout/V3Layout.vue`: canonical open/active state and persistence.
- Modify `frontend/src/components/layout/TabSystem.vue`: controlled immutable updates and component-load error boundary.
- Create `backend/src/services/data/adapters/TushareAdapter.ts`: Tushare request, response validation, and OHLCV normalization.
- Create `backend/src/services/data/adapters/TushareAdapter.test.ts`: adapter red/green tests with injected Axios client.
- Modify `backend/src/routes/data-simple.ts`: explicit real Tushare connection/sample branches.
- Modify `backend/src/routes/data.ts`: register configured Tushare adapter.
- Modify `frontend/src/views/market/DataSourceTest.vue`: Tushare source, A-share defaults, and real errors.
- Modify `backend/.env`: local-only token configuration; never staged.

### Task 1: Tab persistence contract

- [ ] Create `tabPersistence.test.ts` with tests asserting valid IDs restore, corrupt JSON falls back to `dashboard`, unknown IDs are discarded, and the active ID is always present in the restored list.
- [ ] Run `npm test -- --run src/components/layout/tabPersistence.test.ts` in `frontend`; expect failure because `loadTabState` does not exist.
- [ ] Create `tabPersistence.ts` exporting `loadTabState(storage, validIds)` and `saveTabState(storage, state)` with schema `{ openTabIds: string[]; activeTabId: string }`, deduplication, validation, and dashboard fallback.
- [ ] Re-run the focused test; expect all persistence tests to pass.

### Task 2: Controlled tab state regression

- [ ] Add tests to `tabPersistence.test.ts` for immutable add/close helpers so adding a tab returns a new array and closing the active tab selects the nearest remaining tab.
- [ ] Run the focused test and observe failures for missing helpers.
- [ ] Add pure `addStaticTab` and `closeStaticTab` helpers to `tabPersistence.ts`.
- [ ] Modify `V3Layout.vue` to own the canonical `tabs` and `activeTab`, restore static IDs on mount, persist after changes, and use `tabRegistry.ts` to rebuild component definitions.
- [ ] Modify `TabSystem.vue` to render `props.tabs` directly and emit new arrays rather than maintaining a divergent `internalTabs` copy.
- [ ] Re-run focused tests and `npm run build` in `frontend`.

### Task 3: Tushare adapter parsing and failures

- [ ] Create `TushareAdapter.test.ts` with an injected fake HTTP client. Assert a `daily` response with fields `ts_code,trade_date,open,high,low,close,vol` maps to common market data, newest-first rows are sorted chronologically, API code failures throw sanitized errors, empty rows return an empty array, and the token never appears in thrown messages.
- [ ] Run `npm test -- --run src/services/data/adapters/TushareAdapter.test.ts` in `backend`; expect failure because the adapter does not exist.
- [ ] Create `TushareAdapter.ts` with `connect`, `fetchHistoricalData`, `fetchStockList`, `fetchTradeCalendar`, unsupported real-time methods that return explicit errors, a bounded Axios client, and Tushare response validation.
- [ ] Re-run the adapter tests; expect all focused tests to pass.

### Task 4: Register and expose Tushare without fallback

- [ ] Add route-level tests or an exported handler test asserting `source=tushare` returns adapter data and converts adapter errors to non-200 responses without generated fallback rows.
- [ ] Run the route-focused test and observe failure before the Tushare branch exists.
- [ ] Register `TushareAdapter` in `routes/data.ts` only when `config.TUSHARE_TOKEN` is non-empty.
- [ ] Add explicit `tushare` branches in `routes/data-simple.ts` for connection and sample requests, using `000001.SZ` and recent daily dates by default; omit request-body/header logging that could disclose secrets.
- [ ] Re-run backend focused tests and call `/data/sources/status`, `/data-test/test-connection`, and `/data-test/sample` locally.

### Task 5: Tushare UI

- [ ] Add a focused component/helper test asserting Tushare uses source value `tushare`, default symbol `000001.SZ`, and displays backend error text rather than declaring a generic success.
- [ ] Run the focused frontend test and observe failure.
- [ ] Modify `DataSourceTest.vue` to add a Tushare card and selector option, derive source-specific default symbols, call `/api/data-test/...` consistently, and label samples as real Tushare daily data.
- [ ] Re-run the focused test and frontend build.

### Task 6: Local secret and live verification

- [ ] Add or replace exactly one `TUSHARE_TOKEN=` line in `backend/.env` without printing the token and verify `.env` remains ignored.
- [ ] Restart the backend development process and wait for `/health` to return 200.
- [ ] Run all newly added tests, frontend production build, and backend build/type check; record any pre-existing failures separately from introduced failures.
- [ ] Perform a read-only live Tushare connection test and fetch up to five daily rows for `000001.SZ`; verify every row reports source `Tushare Pro` and no response contains the token.
- [ ] Use a browser smoke test to open a non-dashboard static module, refresh, and verify the same tab remains active.
- [ ] Inspect `git diff --check`, `git status --short`, and all diffs; keep the user's existing `frontend/components.d.ts` change untouched unless the build modifies it further.
