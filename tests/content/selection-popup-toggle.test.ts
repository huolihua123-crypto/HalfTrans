import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { saveSettings } from '@shared/storage';
import { DEFAULT_SETTINGS } from '@shared/types';

// 我们要测试的是 src/content/index.ts 的副作用：根据设置 mount/unmount 浮动按钮。
// 通过 vi.mock 把 floating-btn 的 init/destroy 替换成 spy。
const initFloatingButton = vi.fn();
const destroyFloatingButton = vi.fn();

vi.mock('@content/floating-btn', () => ({
  initFloatingButton: (cb: (text: string) => void) => initFloatingButton(cb),
  destroyFloatingButton: () => destroyFloatingButton(),
}));

// 同时 mock 其它模块，避免 content/index.ts 启动时的副作用
vi.mock('@content/detector', () => ({
  detectVisibleParagraphs: vi.fn().mockReturnValue([]),
  observeNewParagraphs: vi.fn(),
}));
vi.mock('@content/context-builder', () => ({ resetPageContextCache: vi.fn() }));
vi.mock('@content/renderer', () => ({ toggleAllTranslations: vi.fn() }));
vi.mock('@content/translator', () => ({
  TranslationOrchestrator: class {
    translateParagraphs = vi.fn();
    translateSelection = vi.fn();
    handleResult = vi.fn();
    handleError = vi.fn();
  },
}));
vi.mock('@shared/messaging', () => ({ onMessage: vi.fn() }));

describe('content script — selection popup toggle', () => {
  beforeEach(async () => {
    initFloatingButton.mockClear();
    destroyFloatingButton.mockClear();
    await chrome.storage.sync.clear();
    vi.resetModules();   // 关键：每个用例都重新加载 content/index 以触发初始化
  });

  afterEach(() => {
    vi.resetModules();
  });

  it('mounts the floating button by default (no settings saved)', async () => {
    await import('@content/index');
    // 等微任务执行 getSettings().then(...)
    await Promise.resolve(); await Promise.resolve();
    expect(initFloatingButton).toHaveBeenCalledTimes(1);
    expect(destroyFloatingButton).not.toHaveBeenCalled();
  });

  it('does not mount the floating button when selectionPopupEnabled=false', async () => {
    await saveSettings({ ...DEFAULT_SETTINGS, selectionPopupEnabled: false });
    await import('@content/index');
    await Promise.resolve(); await Promise.resolve();
    expect(initFloatingButton).not.toHaveBeenCalled();
  });

  it('unmounts when setting flips to false at runtime', async () => {
    // 启动时启用
    await saveSettings({ ...DEFAULT_SETTINGS, selectionPopupEnabled: true });
    await import('@content/index');
    await Promise.resolve(); await Promise.resolve();
    expect(initFloatingButton).toHaveBeenCalledTimes(1);

    // 关闭设置 → 应触发 destroy
    await saveSettings({ ...DEFAULT_SETTINGS, selectionPopupEnabled: false });
    await Promise.resolve(); await Promise.resolve();
    expect(destroyFloatingButton).toHaveBeenCalledTimes(1);
  });

  it('mounts when setting flips to true at runtime', async () => {
    await saveSettings({ ...DEFAULT_SETTINGS, selectionPopupEnabled: false });
    await import('@content/index');
    await Promise.resolve(); await Promise.resolve();
    expect(initFloatingButton).not.toHaveBeenCalled();

    await saveSettings({ ...DEFAULT_SETTINGS, selectionPopupEnabled: true });
    await Promise.resolve(); await Promise.resolve();
    expect(initFloatingButton).toHaveBeenCalledTimes(1);
  });

  it('treats missing selectionPopupEnabled field as enabled (old user upgrade)', async () => {
    // 模拟老版本数据：settings 已存在但没有该字段
    const legacy = { ...DEFAULT_SETTINGS } as Record<string, unknown>;
    delete legacy.selectionPopupEnabled;
    await chrome.storage.sync.set({ settings: legacy });

    await import('@content/index');
    await Promise.resolve(); await Promise.resolve();
    expect(initFloatingButton).toHaveBeenCalledTimes(1);
  });

  it('does not double-mount if setting saved twice with same value', async () => {
    await saveSettings({ ...DEFAULT_SETTINGS, selectionPopupEnabled: true });
    await import('@content/index');
    await Promise.resolve(); await Promise.resolve();
    expect(initFloatingButton).toHaveBeenCalledTimes(1);

    // 再保存一次同值的设置
    await saveSettings({ ...DEFAULT_SETTINGS, selectionPopupEnabled: true });
    await Promise.resolve(); await Promise.resolve();
    expect(initFloatingButton).toHaveBeenCalledTimes(1);  // 仍然只调用了 1 次
    expect(destroyFloatingButton).not.toHaveBeenCalled();
  });
});
