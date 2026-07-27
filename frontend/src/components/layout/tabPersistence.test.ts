import { describe, expect, it } from "vitest";
import {
  addStaticTab,
  closeStaticTab,
  loadTabState,
  saveTabState,
  type PersistedTabState,
} from "./tabPersistence";

class MemoryStorage implements Pick<Storage, "getItem" | "setItem"> {
  private values = new Map<string, string>();

  getItem(key: string) {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string) {
    this.values.set(key, value);
  }
}

const validIds = new Set(["dashboard", "strategies", "data-source-test"]);

describe("tab persistence", () => {
  it("restores valid unique tabs and active tab", () => {
    const storage = new MemoryStorage();
    storage.setItem(
      "quant-dashboard-tabs",
      JSON.stringify({
        openTabIds: ["dashboard", "strategies", "strategies"],
        activeTabId: "strategies",
      }),
    );

    expect(loadTabState(storage, validIds)).toEqual({
      openTabIds: ["dashboard", "strategies"],
      activeTabId: "strategies",
    });
  });

  it.each(["not json", JSON.stringify({ openTabIds: 1 })])(
    "falls back to dashboard for invalid state: %s",
    (stored) => {
      const storage = new MemoryStorage();
      storage.setItem("quant-dashboard-tabs", stored);

      expect(loadTabState(storage, validIds)).toEqual({
        openTabIds: ["dashboard"],
        activeTabId: "dashboard",
      });
    },
  );

  it("drops unknown tabs and adds the active tab when needed", () => {
    const storage = new MemoryStorage();
    storage.setItem(
      "quant-dashboard-tabs",
      JSON.stringify({
        openTabIds: ["removed-module", "dashboard"],
        activeTabId: "data-source-test",
      }),
    );

    expect(loadTabState(storage, validIds)).toEqual({
      openTabIds: ["dashboard", "data-source-test"],
      activeTabId: "data-source-test",
    });
  });

  it("saves only serializable state", () => {
    const storage = new MemoryStorage();
    const state: PersistedTabState = {
      openTabIds: ["dashboard", "strategies"],
      activeTabId: "strategies",
    };

    saveTabState(storage, state);

    expect(loadTabState(storage, validIds)).toEqual(state);
  });
});

describe("static tab state changes", () => {
  it("adds a tab immutably and selects it", () => {
    const original: PersistedTabState = {
      openTabIds: ["dashboard"],
      activeTabId: "dashboard",
    };

    const next = addStaticTab(original, "strategies");

    expect(next).toEqual({
      openTabIds: ["dashboard", "strategies"],
      activeTabId: "strategies",
    });
    expect(original.openTabIds).toEqual(["dashboard"]);
  });

  it("selects the nearest remaining tab after closing the active tab", () => {
    const next = closeStaticTab(
      {
        openTabIds: ["dashboard", "strategies", "data-source-test"],
        activeTabId: "strategies",
      },
      "strategies",
    );

    expect(next).toEqual({
      openTabIds: ["dashboard", "data-source-test"],
      activeTabId: "data-source-test",
    });
  });
});
