import {
  defineAsyncComponent,
  type AsyncComponentLoader,
  type Component,
} from "vue";

type TabLike = {
  id: string;
};

export function selectRenderedTabs<T extends TabLike>(
  tabs: readonly T[],
  activeTabId: string,
): T[] {
  const activeTab = tabs.find((tab) => tab.id === activeTabId);
  return activeTab ? [activeTab] : [];
}

export function resolveTabSelection<T extends TabLike>(
  tabs: readonly T[],
  tabId: string,
  pendingTab?: T,
): T | undefined {
  return (
    tabs.find((tab) => tab.id === tabId) ||
    (pendingTab?.id === tabId ? pendingTab : undefined)
  );
}

export function createComponentResolver(
  componentMap: Record<string, Component>,
) {
  const asyncComponentCache = new WeakMap<
    AsyncComponentLoader,
    Component
  >();

  return (component: unknown): Component | string | unknown => {
    if (typeof component === "string") {
      return componentMap[component] || component;
    }

    if (typeof component === "function") {
      const loader = component as AsyncComponentLoader;
      const cached = asyncComponentCache.get(loader);
      if (cached) {
        return cached;
      }

      const wrapped = defineAsyncComponent(loader);
      asyncComponentCache.set(loader, wrapped);
      return wrapped;
    }

    return component;
  };
}
