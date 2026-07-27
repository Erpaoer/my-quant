import { describe, expect, it } from "vitest";
import {
  createComponentResolver,
  resolveTabSelection,
  selectRenderedTabs,
} from "./tabRendering";

describe("tab rendering", () => {
  it("renders only the active tab body", () => {
    const tabs = [
      { id: "dashboard", component: "DashboardOverview" },
      { id: "strategies", component: "StrategyList" },
      { id: "market-data", component: "MarketData" },
    ];

    expect(selectRenderedTabs(tabs, "strategies")).toEqual([tabs[1]]);
    expect(selectRenderedTabs(tabs, "missing")).toEqual([]);
  });

  it("reuses the same async component wrapper for the same loader", () => {
    const resolveComponent = createComponentResolver({});
    const loader = () => Promise.resolve({ default: {} });

    expect(resolveComponent(loader)).toBe(resolveComponent(loader));
  });

  it("resolves registered string components without wrapping them", () => {
    const registered = { name: "RegisteredComponent" };
    const resolveComponent = createComponentResolver({
      StrategyList: registered,
    });

    expect(resolveComponent("StrategyList")).toBe(registered);
    expect(resolveComponent("UnknownComponent")).toBe("UnknownComponent");
  });

  it("can select a newly emitted tab before parent props update", () => {
    const existingTabs = [{ id: "dashboard" }];
    const pendingTab = { id: "strategies" };

    expect(
      resolveTabSelection(existingTabs, "strategies", pendingTab),
    ).toBe(pendingTab);
    expect(resolveTabSelection(existingTabs, "missing")).toBeUndefined();
  });
});
