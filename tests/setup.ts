import '@testing-library/jest-dom';

const storageMock = (() => {
  let store: Record<string, unknown> = {};
  return {
    get: (keys: string | string[]) => {
      if (typeof keys === 'string') return Promise.resolve({ [keys]: store[keys] });
      const result: Record<string, unknown> = {};
      (Array.isArray(keys) ? keys : [keys]).forEach((k) => { result[k] = store[k]; });
      return Promise.resolve(result);
    },
    set: (items: Record<string, unknown>) => {
      Object.assign(store, items);
      return Promise.resolve();
    },
    clear: () => { store = {}; return Promise.resolve(); },
  };
})();

global.chrome = {
  storage: { sync: storageMock, local: storageMock },
  runtime: {
    sendMessage: vi.fn(),
    onMessage: { addListener: vi.fn(), removeListener: vi.fn() },
  },
  contextMenus: { create: vi.fn(), onClicked: { addListener: vi.fn() } },
  commands: { onCommand: { addListener: vi.fn() } },
  tabs: { query: vi.fn(), sendMessage: vi.fn() },
} as unknown as typeof chrome;
