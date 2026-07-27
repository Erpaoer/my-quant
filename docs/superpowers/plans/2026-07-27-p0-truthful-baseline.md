# P0 Truthful Baseline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Finish the in-progress Tushare and tab-persistence work as a truthful, tested baseline: Tushare API tests must never fall back to generated success data, static navigation must survive refresh in a real browser, and the default test command must not treat a manual database script as a Vitest suite.

**Architecture:** Keep real Tushare calls behind the existing backend adapter and make `/data-test/test-api` dispatch explicitly by source and capability. Keep source-specific UI capabilities in the pure `dataSourceConfig.ts` helper so they are unit-testable. Repair the existing navigation browser test against the real application rather than replacing it with synthetic HTML.

**Tech Stack:** TypeScript, Express, Axios, Vue 3, Vitest, Playwright, Tushare Pro.

---

## File map

- Modify `backend/src/routes/data-simple.test.ts`: add Tushare truthfulness regressions.
- Modify `backend/src/routes/data-simple.ts`: route Tushare historical tests through `TushareAdapter` and reject unsupported modes.
- Modify `frontend/src/views/market/dataSourceConfig.test.ts`: define the Tushare UI capability contract.
- Modify `frontend/src/views/market/dataSourceConfig.ts`: expose source-specific API test modes.
- Modify `frontend/src/views/market/DataSourceTest.vue`: show only valid Tushare modes and preserve explicit backend errors.
- Modify `frontend/e2e/navigation.spec.ts`: make authentication interception match the actual API contract and retain the real refresh test.
- Move `backend/src/test/backtest-engine.test.ts` to `backend/scripts/manual-backtest-engine.ts`: keep the manual database script out of Vitest discovery.
- Update `docs/superpowers/plans/2026-07-12-navigation-tushare-implementation.md`: mark verified tasks complete and record pre-existing build failures.

### Task 1: Reject fake Tushare API success

- [ ] **Step 1: Add a failing route test for unsupported real-time mode**

Append this case to `backend/src/routes/data-simple.test.ts`:

```ts
describe("Tushare API test route", () => {
  it("rejects real-time mode instead of returning generated success data", async () => {
    const response = await post("/test-api", {
      source: "tushare",
      apiType: "realtime",
      symbol: "000001.SZ",
      interval: "1d",
    });

    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({
      success: false,
      message: "Tushare Pro supports historical daily data only",
    });
    expect(response.body).not.toHaveProperty("data");
  });
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```powershell
cd backend
npm test -- --run src/routes/data-simple.test.ts
```

Expected: the new case fails because the current catch-all branch returns HTTP 200 with generated data.

- [ ] **Step 3: Add the minimal explicit Tushare branch**

In `backend/src/routes/data-simple.ts`, before the generic generated-data branch, add:

```ts
    } else if (source.toLowerCase() === "tushare") {
      if (apiType !== "historical" || interval !== "1d") {
        return res.status(400).json({
          success: false,
          message: "Tushare Pro supports historical daily data only",
        });
      }

      const adapter = new TushareAdapter(config.TUSHARE_TOKEN);
      const endTime = new Date();
      const startTime = new Date(endTime);
      startTime.setUTCDate(startTime.getUTCDate() - 30);
      const data = await adapter.fetchHistoricalData({
        symbol: symbol || "000001.SZ",
        interval: "1d",
        startTime,
        endTime,
      });

      return res.json({
        success: true,
        message: "Real Tushare Pro daily data retrieved successfully",
        data,
      });
```

Do not retain any generated fallback for `source=tushare`.

- [ ] **Step 4: Run the focused route test and verify GREEN**

Run:

```powershell
cd backend
npm test -- --run src/routes/data-simple.test.ts
```

Expected: all route cases pass.

### Task 2: Restrict the Tushare UI to truthful capabilities

- [ ] **Step 1: Add a failing pure-helper test**

Add this import and test to `frontend/src/views/market/dataSourceConfig.test.ts`:

```ts
import { apiTypesForSource } from "./dataSourceConfig";

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
```

- [ ] **Step 2: Run the helper test and verify RED**

Run:

```powershell
cd frontend
npm test -- --run src/views/market/dataSourceConfig.test.ts
```

Expected: failure because `apiTypesForSource` is not exported.

- [ ] **Step 3: Implement the source capability helper**

Add to `frontend/src/views/market/dataSourceConfig.ts`:

```ts
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
```

- [ ] **Step 4: Bind `DataSourceTest.vue` to the capability helper**

Import `apiTypesForSource`, derive a computed option list from `apiTestForm.source`, render the API-type options with `v-for`, and reset Tushare to `historical`/`1d` when its source is selected. Preserve non-2xx backend messages as failures; do not synthesize success in the component.

- [ ] **Step 5: Run the focused tests and frontend build**

Run:

```powershell
cd frontend
npm test -- --run src/views/market/dataSourceConfig.test.ts
npm run build
```

Expected: helper tests pass and Vite exits 0.

### Task 3: Repair the real navigation refresh test

- [ ] **Step 1: Re-run the existing browser test and preserve the failure evidence**

Run:

```powershell
cd frontend
npx playwright test e2e/navigation.spec.ts --reporter=line
```

Expected initial state: timeout waiting for `.nav-content .nav-item`.

- [ ] **Step 2: Restrict interception to the backend API path**

The current `**/api/**` glob also matches Vite's frontend source module
`/src/api/index.ts`. The test fulfils that JavaScript module with JSON, so Vue never
mounts and `#app` remains empty. Replace the glob with an origin-anchored regular
expression that matches only backend requests:

```ts
  await page.route(/^http:\/\/localhost:3001\/api\//, async (route) => {
    // existing backend API mocks
  });
```

Then wait for the actual root class rendered by `V3Layout.vue` before clicking:

```ts
  await page.goto("http://localhost:3001/");
  await expect(page.locator(".v3-layout")).toBeVisible();
  const strategyItem = page.locator(".nav-content .nav-item").nth(1);
  await expect(strategyItem).toBeVisible();
  await strategyItem.click();
```

- [ ] **Step 3: Verify refresh persistence GREEN**

Run:

```powershell
cd frontend
npx playwright test e2e/navigation.spec.ts --reporter=line
```

Expected: one browser test passes, the active tab remains `strategies` after reload, and exactly one tab is active.

### Task 4: Remove the manual database script from Vitest discovery

- [ ] **Step 1: Confirm the current suite failure**

Run:

```powershell
cd backend
npm test -- --run
```

Expected initial state: 18 assertions pass but the command exits 1 because `src/test/backtest-engine.test.ts` contains no test suite.

- [ ] **Step 2: Move the script without changing its behavior**

Move exactly one file:

```text
backend/src/test/backtest-engine.test.ts
  -> backend/scripts/manual-backtest-engine.ts
```

Do not execute the script automatically because it writes test records to the configured database.

- [ ] **Step 3: Verify the default backend test command**

Run:

```powershell
cd backend
npm test -- --run
```

Expected: all discovered test files and assertions pass with exit code 0.

### Task 5: Verify and checkpoint the completed baseline

- [ ] **Step 1: Run focused and aggregate verification**

Run:

```powershell
cd backend
npm test -- --run
cd ../frontend
npm test -- --run
npm run build
npx playwright test e2e/navigation.spec.ts --reporter=line
```

Expected: backend tests exit 0, frontend 25 or more tests pass, frontend build exits 0, and navigation E2E passes.

- [ ] **Step 2: Perform read-only live Tushare verification**

Call `/data-test/test-connection`, `/data-test/sample`, and `/data-test/test-api` with `source=tushare`, `symbol=000001.SZ`, `apiType=historical`, and `interval=1d`. Verify:

```text
success = true
source = Tushare Pro
record count > 0
```

Call `/data-test/test-api` with `apiType=realtime` and verify HTTP 400 with no `data` property.

- [ ] **Step 3: Record the separate backend build blocker**

Run:

```powershell
cd backend
npm run build
```

Expected for this tranche: the pre-existing TypeScript build remains red. Record the fresh error count; do not claim P0 build stabilization is complete. The next plan starts with schema/type alignment and removes that blocker.

- [ ] **Step 4: Inspect the exact change set**

Run:

```powershell
git diff --check
git status --short
git diff -- backend/src/routes/data-simple.ts backend/src/routes/data-simple.test.ts frontend/src/views/market/dataSourceConfig.ts frontend/src/views/market/dataSourceConfig.test.ts frontend/src/views/market/DataSourceTest.vue frontend/e2e/navigation.spec.ts
```

Expected: no whitespace errors, no `.env` file staged, and no unrelated user changes overwritten.

- [ ] **Step 5: Commit only the verified baseline files**

Stage the existing navigation/Tushare implementation, its tests, this plan, and the single manual-script move. Do not stage `backend/.env`, logs, screenshots, `dist`, or unrelated files. Commit with:

```text
feat: finalize truthful tushare and tab baseline
```

### Task 6: Prepare the next P0 build-stabilization plan

- [ ] **Step 1: Capture build errors by subsystem**

Group the fresh TypeScript errors into:

```text
schema and Prisma drift
exchange contracts
data manager contracts
backtest contracts
risk and real-time trading contracts
Express/JWT typing
```

- [ ] **Step 2: Write the next plan**

Create `docs/superpowers/plans/2026-07-27-p0-backend-build.md` with test-first tasks that make `npm run build` exit 0 without weakening TypeScript strictness or excluding reachable production modules.
