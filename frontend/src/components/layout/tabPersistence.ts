export const TAB_STORAGE_KEY = "quant-dashboard-tabs";

export interface PersistedTabState {
  openTabIds: string[];
  activeTabId: string;
}

type StorageLike = Pick<Storage, "getItem" | "setItem">;

const dashboardState = (): PersistedTabState => ({
  openTabIds: ["dashboard"],
  activeTabId: "dashboard",
});

export function loadTabState(
  storage: StorageLike,
  validIds: ReadonlySet<string>,
): PersistedTabState {
  try {
    const raw = storage.getItem(TAB_STORAGE_KEY);
    if (!raw) return dashboardState();

    const parsed = JSON.parse(raw) as Partial<PersistedTabState>;
    if (!Array.isArray(parsed.openTabIds)) return dashboardState();

    const openTabIds = [...new Set(parsed.openTabIds)].filter(
      (id): id is string => typeof id === "string" && validIds.has(id),
    );
    const activeTabId =
      typeof parsed.activeTabId === "string" && validIds.has(parsed.activeTabId)
        ? parsed.activeTabId
        : openTabIds.at(-1) || "dashboard";

    if (!openTabIds.includes(activeTabId)) openTabIds.push(activeTabId);
    if (openTabIds.length === 0) return dashboardState();

    return { openTabIds, activeTabId };
  } catch {
    return dashboardState();
  }
}

export function saveTabState(
  storage: StorageLike,
  state: PersistedTabState,
): void {
  storage.setItem(TAB_STORAGE_KEY, JSON.stringify(state));
}

export function addStaticTab(
  state: PersistedTabState,
  tabId: string,
): PersistedTabState {
  return {
    openTabIds: state.openTabIds.includes(tabId)
      ? [...state.openTabIds]
      : [...state.openTabIds, tabId],
    activeTabId: tabId,
  };
}

export function closeStaticTab(
  state: PersistedTabState,
  tabId: string,
): PersistedTabState {
  const index = state.openTabIds.indexOf(tabId);
  if (index === -1 || tabId === "dashboard") return { ...state };

  const openTabIds = state.openTabIds.filter((id) => id !== tabId);
  const activeTabId =
    state.activeTabId === tabId
      ? openTabIds[Math.min(index, openTabIds.length - 1)] || "dashboard"
      : state.activeTabId;

  return { openTabIds, activeTabId };
}
