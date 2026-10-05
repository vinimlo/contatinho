import { vi, type Mock } from 'vitest';

type AnyFn = (...args: any[]) => any;
type Store = Record<string, unknown>;

export interface ChromeRaw {
  storage: {
    local: { get: Mock<AnyFn>; set: Mock<AnyFn>; remove: Mock<AnyFn> };
    onChanged: { addListener: Mock<AnyFn>; removeListener: Mock<AnyFn> };
  };
  runtime: {
    sendMessage: Mock<AnyFn>;
    onMessage: { addListener: Mock<AnyFn>; removeListener: Mock<AnyFn> };
  };
  tabs: {
    query: Mock<AnyFn>;
    update: Mock<AnyFn>;
    create: Mock<AnyFn>;
    sendMessage: Mock<AnyFn>;
    onActivated: { addListener: Mock<AnyFn>; removeListener: Mock<AnyFn> };
    onUpdated: { addListener: Mock<AnyFn>; removeListener: Mock<AnyFn> };
  };
  sidePanel: { setPanelBehavior: Mock<AnyFn> };
}

export interface ChromeMock {
  store: Store;
  raw: ChromeRaw;
  emitRuntimeMessage(message: unknown, sender?: { tab?: { id?: number } }): void;
  emitTabActivated(tabId: number): void;
  emitTabUpdated(tabId: number, info: { status?: string; url?: string }): void;
}

function listenerSet() {
  const listeners = new Set<AnyFn>();
  return {
    listeners,
    api: {
      addListener: vi.fn((fn: AnyFn) => void listeners.add(fn)),
      removeListener: vi.fn((fn: AnyFn) => void listeners.delete(fn)),
    },
  };
}

const copy = <T>(value: T): T => (value === undefined ? value : structuredClone(value));

export function installChromeMock(): ChromeMock {
  const store: Store = {};
  const storageChanged = listenerSet();
  const runtimeMessage = listenerSet();
  const tabActivated = listenerSet();
  const tabUpdated = listenerSet();

  const raw: ChromeRaw = {
    storage: {
      local: {
        get: vi.fn(async (keys?: string | string[] | null) => {
          const list = keys == null ? Object.keys(store) : Array.isArray(keys) ? keys : [keys];
          const out: Store = {};
          for (const key of list) if (key in store) out[key] = copy(store[key]);
          return out;
        }),
        set: vi.fn(async (items: Store) => {
          const changes: Record<string, { oldValue?: unknown; newValue?: unknown }> = {};
          for (const [key, value] of Object.entries(items)) {
            changes[key] = { oldValue: copy(store[key]), newValue: copy(value) };
            store[key] = copy(value);
          }
          storageChanged.listeners.forEach((fn) => fn(changes, 'local'));
        }),
        remove: vi.fn(async (keys: string | string[]) => {
          for (const key of [keys].flat()) delete store[key];
        }),
      },
      onChanged: storageChanged.api,
    },
    runtime: {
      sendMessage: vi.fn(async () => undefined),
      onMessage: runtimeMessage.api,
    },
    tabs: {
      query: vi.fn(async () => [{ id: 7, windowId: 1, active: true, url: 'https://www.instagram.com/' }]),
      update: vi.fn(async () => ({})),
      create: vi.fn(async () => ({})),
      sendMessage: vi.fn(async () => undefined),
      onActivated: tabActivated.api,
      onUpdated: tabUpdated.api,
    },
    sidePanel: { setPanelBehavior: vi.fn(async () => undefined) },
  };

  (globalThis as unknown as { chrome: ChromeRaw }).chrome = raw;

  return {
    store,
    raw,
    emitRuntimeMessage: (message, sender = { tab: { id: 7 } }) =>
      runtimeMessage.listeners.forEach((fn) => fn(message, sender, () => undefined)),
    emitTabActivated: (tabId) => tabActivated.listeners.forEach((fn) => fn({ tabId, windowId: 1 })),
    emitTabUpdated: (tabId, info) => tabUpdated.listeners.forEach((fn) => fn(tabId, info, {})),
  };
}
