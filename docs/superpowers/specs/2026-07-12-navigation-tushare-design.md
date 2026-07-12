# Navigation persistence and Tushare data source design

Date: 2026-07-12

## Goal

Fix the dashboard tab navigation so module selections survive component re-renders and browser refreshes. Add Tushare Pro as a real, server-side data source without exposing its token or presenting fallback data as live market data.

## Scope

### Dashboard tab navigation

- Keep the existing dashboard-style multi-tab interface.
- Make the parent layout the single source of truth for the open tabs and active tab.
- Make `TabSystem` emit immutable tab-list updates instead of mutating an internal copy that can diverge from its parent.
- Persist only serializable tab identifiers and the active tab identifier in browser local storage.
- Rebuild tab definitions from a fixed registry during application startup; do not serialize Vue component objects.
- Restore the last active valid tab after refresh. If persisted state is invalid or references a removed module, discard that entry and open the dashboard overview.
- Show an explicit component-load error state when a module fails to load. A load failure must not silently reset navigation to the dashboard.

Dynamic detail and edit tabs are outside the refresh-restoration scope for this iteration because their component props may contain non-serializable or stale data. Static sidebar modules are restored; dynamic tabs can still work during the current browser session.

### Tushare Pro adapter

- Add a `TushareAdapter` that follows the existing `BaseDataSourceAdapter` contract.
- Read `TUSHARE_TOKEN` only from the backend environment. The token must never be returned by an API, stored in frontend state, included in source control, or logged.
- Call the official Tushare Pro HTTP API from the backend with bounded timeouts and structured error handling.
- Initial supported operations:
  - connection and permission validation through a small read-only request;
  - A-share instrument list through `stock_basic`;
  - trading calendar through `trade_cal`;
  - daily OHLCV history through `daily`.
- Normalize Tushare symbols such as `000001.SZ` and daily fields into the project's common market-data types.
- Treat Tushare daily data as historical end-of-day data. The adapter will not claim to provide streaming or real-time quotes.
- Return clear errors for missing tokens, invalid tokens, insufficient points or endpoint permissions, rate limits, malformed responses, and upstream timeouts.
- Register the adapter only when a token is configured. Its status must appear in the existing data-source status endpoint.

### Data-source test UI

- Add Tushare to the selectable data sources.
- Use backend endpoints for connection tests and sample daily-data requests.
- Clearly label returned records as real Tushare data and show their source and date.
- Never convert a failed Tushare request into generated fallback market data.

## Architecture and data flow

Navigation flow:

1. The sidebar emits a module identifier.
2. `V3Layout` resolves the identifier through a static tab registry.
3. `V3Layout` updates the canonical tab list and active tab.
4. `TabSystem` renders the provided state and emits user actions back to the layout.
5. A small persistence helper stores static tab identifiers and restores valid entries at startup.

Tushare flow:

1. The frontend sends a source name, symbol, and date range to an existing backend data route.
2. The backend selects the registered Tushare adapter.
3. The adapter sends a server-side HTTPS request to Tushare Pro using the environment token.
4. The adapter validates the Tushare response code and schema, normalizes rows, and returns common market-data objects.
5. The route returns real records or an explicit error. It does not synthesize fallback values.

## Error handling

- Corrupt navigation persistence is ignored safely and replaced with the dashboard tab.
- Unknown tab identifiers are excluded during restoration.
- Async component import failures remain visible in the affected tab and are logged without exposing secrets.
- Tushare errors are translated to concise user-facing messages while retaining safe diagnostic context on the backend.
- HTTP logs must not include request bodies containing the Tushare token.

## Testing strategy

Development follows red-green-refactor:

- Navigation tests first demonstrate the current loss of parent tab state and refresh restoration failure.
- Persistence tests cover valid state, corrupt JSON, unknown modules, and dashboard fallback.
- Tushare adapter tests cover request construction without token exposure, response normalization, empty data, API error codes, insufficient permissions, and timeouts.
- Route tests verify that Tushare failures are returned as failures and never as fallback samples.
- UI tests verify selecting Tushare and rendering success and failure states.
- Final verification includes focused tests, existing test suites where runnable, frontend production build, backend type check/build status, live backend restart, read-only Tushare connection test, and manual navigation refresh smoke tests.

## Security and operational constraints

- The supplied token is written only to the existing Git-ignored backend `.env` during implementation.
- No trading, order placement, or exchange-account operation is part of this work.
- Tushare requests are read-only and limited to the minimum records needed for verification.
- Because the token was shared in chat, rotating it after setup remains recommended.

## Acceptance criteria

- Clicking any static sidebar module opens and keeps the corresponding tab active.
- Refreshing the browser restores the last active static tab instead of returning to overview.
- Closing and switching tabs remains consistent between `V3Layout` and `TabSystem`.
- Tushare appears in data-source status when configured and passes a real read-only connection test.
- A daily-data request for a valid A-share symbol returns normalized real records with source `Tushare Pro`.
- Invalid credentials or insufficient permissions produce an explicit failure with no generated market data.
- The token is absent from tracked files, browser data, API responses, and logs.
