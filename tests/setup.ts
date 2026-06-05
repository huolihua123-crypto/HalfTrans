import '@testing-library/jest-dom';
import { beforeEach } from 'vitest';

type StorageListener = (
  changes: Record<string, { oldValue?: unknown; newValue?: unknown }>,
  areaName: string,
) => void;

const onChangedListeners: StorageListener[] = [];

const createStorageMock = (areaName: string) => {
  let store: Record<string, unknown> = {};
  return {
    get: (keys: string | string[]) => {
      if (typeof keys === 'string') return Promise.resolve({ [keys]: store[keys] });
      const result: Record<string, unknown> = {};
      (Array.isArray(keys) ? keys : [keys]).forEach((k) => { result[k] = store[k]; });
      return Promise.resolve(result);
    },
    set: (items: Record<string, unknown>) => {
      const changes: Record<string, { oldValue?: unknown; newValue?: unknown }> = {};
      Object.entries(items).forEach(([k, v]) => {
        changes[k] = { oldValue: store[k], newValue: v };
      });
      Object.assign(store, items);
      // 异步派发，更贴近真实 Chrome 行为
      Promise.resolve().then(() => onChangedListeners.forEach((l) => l(changes, areaName)));
      return Promise.resolve();
    },
    clear: () => {
      store = {};
      return Promise.resolve();
    },
  };
};

const syncStorage = createStorageMock('sync');
const localStorage = createStorageMock('local');

global.chrome = {
  storage: {
    sync: syncStorage,
    local: localStorage,
    onChanged: {
      addListener: (listener: StorageListener) => { onChangedListeners.push(listener); },
      removeListener: (listener: StorageListener) => {
        const idx = onChangedListeners.indexOf(listener);
        if (idx >= 0) onChangedListeners.splice(idx, 1);
      },
    },
  },
  runtime: {
    sendMessage: vi.fn(),
    onMessage: { addListener: vi.fn(), removeListener: vi.fn() },
  },
  contextMenus: { create: vi.fn(), onClicked: { addListener: vi.fn() } },
  commands: { onCommand: { addListener: vi.fn() } },
  tabs: { query: vi.fn(), sendMessage: vi.fn() },
} as unknown as typeof chrome;

// 每个测试前重置监听器数组与存储，避免跨测试状态泄漏
beforeEach(() => {
  onChangedListeners.length = 0;
  syncStorage.clear();
  localStorage.clear();
});
