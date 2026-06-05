# 划词翻译图标显隐开关 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 新增用户设置项 `selectionPopupEnabled`，控制选中文本后是否显示浮动「译」按钮；设置在已打开页面实时生效。

**Architecture:** 在 `UserSettings` 加 `selectionPopupEnabled: boolean`（默认 `true`）。Content script 启动时按设置决定是否 `initFloatingButton`，并订阅 `chrome.storage.onChanged` 在变更时动态 mount/unmount。Options 页在「翻译设置」section 新增一行 checkbox 开关，写入即时落盘。

**Tech Stack:** TypeScript / React 18 / Vite / Vitest / Chrome Extension Manifest V3 / Tailwind CSS

**Spec:** [docs/superpowers/specs/2026-06-05-toggle-selection-popup-design.md](../specs/2026-06-05-toggle-selection-popup-design.md)

---

## File Structure

**Modify:**
- `src/shared/types.ts` — `UserSettings` 接口与 `DEFAULT_SETTINGS` 加 `selectionPopupEnabled`
- `src/content/index.ts` — 替换顶层 `initFloatingButton` 调用为按设置 mount/unmount + 订阅 storage 变化
- `src/options/App.tsx` — 「翻译设置」section 新增开关行
- `tests/setup.ts` — `chrome.storage.onChanged` mock（供新测试用）

**Create:**
- `tests/content/selection-popup-toggle.test.ts` — 新增 mount/unmount 逻辑的单元测试

**Zero changes:** `src/content/floating-btn.ts`（复用现有 `initFloatingButton`/`destroyFloatingButton`）

---

## Task 1: 扩展 UserSettings 类型与默认值

**Files:**
- Modify: `src/shared/types.ts:24-29` (UserSettings interface)、`src/shared/types.ts:84-89` (DEFAULT_SETTINGS)
- Test: `tests/shared/storage.test.ts`

- [ ] **Step 1: 在 storage.test.ts 末尾追加测试 — DEFAULT_SETTINGS 默认启用划词图标**

在 `tests/shared/storage.test.ts` 的 `describe('storage', () => { ... })` 内、最后一个 `describe` 块之后追加：

```ts
  describe('selectionPopupEnabled default', () => {
    it('defaults to true so existing users keep seeing the floating button', () => {
      expect(DEFAULT_SETTINGS.selectionPopupEnabled).toBe(true);
    });

    it('returns selectionPopupEnabled=true from getSettings on fresh install', async () => {
      const settings = await getSettings();
      expect(settings.selectionPopupEnabled).toBe(true);
    });
  });
```

- [ ] **Step 2: 运行测试，确认失败**

Run: `npm run test:run -- tests/shared/storage.test.ts`
Expected: FAIL — `expect(undefined).toBe(true)` 或 TypeScript 编译错误，因为字段尚未定义。

- [ ] **Step 3: 在 `UserSettings` 接口中加字段**

修改 `src/shared/types.ts`，把 `UserSettings` 接口从

```ts
export interface UserSettings {
  apiConfigs: ApiConfig[];
  activeConfigId: string;
  style: TranslationStyle;
  shortcut: string;
}
```

改为

```ts
export interface UserSettings {
  apiConfigs: ApiConfig[];
  activeConfigId: string;
  style: TranslationStyle;
  shortcut: string;
  /** 是否在选中文本时显示浮动"译"按钮 */
  selectionPopupEnabled: boolean;
}
```

- [ ] **Step 4: 在 `DEFAULT_SETTINGS` 中加默认值**

把 `src/shared/types.ts` 末尾的 `DEFAULT_SETTINGS` 从

```ts
export const DEFAULT_SETTINGS: UserSettings = {
  apiConfigs: [],
  activeConfigId: '',
  style: 'colloquial',
  shortcut: 'Ctrl+Shift+T',
};
```

改为

```ts
export const DEFAULT_SETTINGS: UserSettings = {
  apiConfigs: [],
  activeConfigId: '',
  style: 'colloquial',
  shortcut: 'Ctrl+Shift+T',
  selectionPopupEnabled: true,
};
```

- [ ] **Step 5: 运行测试确认通过**

Run: `npm run test:run -- tests/shared/storage.test.ts`
Expected: PASS — 所有 storage 测试通过，包含新的 `selectionPopupEnabled default` 块。

- [ ] **Step 6: 全量构建检查类型**

Run: `npx tsc --noEmit`
Expected: 无错误。新字段是非可选 `boolean`，所有构造 `UserSettings` 的地方编译期会强制要求；但因 `DEFAULT_SETTINGS` 已包含，且其它处大多通过 `...DEFAULT_SETTINGS`/`...settings` 展开构造，预期无报错。如有报错，按提示补充字段即可（不要省略）。

- [ ] **Step 7: Commit**

```bash
git add src/shared/types.ts tests/shared/storage.test.ts
git commit -m "feat(types): add selectionPopupEnabled field to UserSettings"
```

---

## Task 2: 扩展测试 setup 增加 storage.onChanged mock

**Files:**
- Modify: `tests/setup.ts`

后续 Task 3 的测试需要触发 `chrome.storage.onChanged`，当前 setup 没有该 mock。先一次性补齐。

- [ ] **Step 1: 修改 `tests/setup.ts`，把 storageMock 改为可触发 onChanged 的版本**

把整个 `tests/setup.ts` 替换为以下内容：

```ts
import '@testing-library/jest-dom';

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
```

注意：
- 顶层 `onChangedListeners` 数组在所有 sync/local 写入上都派发，符合真实 Chrome 行为。
- 现有测试只用了 `chrome.storage.sync.get/set/clear`，行为保持不变。

- [ ] **Step 2: 运行所有现有测试，确认未回退**

Run: `npm run test:run`
Expected: 所有现有测试 PASS，无回退。

- [ ] **Step 3: Commit**

```bash
git add tests/setup.ts
git commit -m "test: add chrome.storage.onChanged mock to test setup"
```

---

## Task 3: Content script 按设置 mount/unmount 浮动按钮

**Files:**
- Modify: `src/content/index.ts` (整体逻辑调整)
- Create: `tests/content/selection-popup-toggle.test.ts`

### 3.1 写失败的测试

- [ ] **Step 1: 创建 `tests/content/selection-popup-toggle.test.ts`**

完整内容：

```ts
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
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npm run test:run -- tests/content/selection-popup-toggle.test.ts`
Expected: FAIL — 当前 `src/content/index.ts` 在模块顶层无条件调用 `initFloatingButton`，没有响应 storage 变化的逻辑。"does not mount...when false" 与 "unmounts when setting flips to false" 等用例会失败。

### 3.2 实现 mount/unmount 逻辑

- [ ] **Step 3: 修改 `src/content/index.ts`**

把整个 `src/content/index.ts` 替换为：

```ts
/**
 * Content Script 入口
 * 协调检测→翻译→渲染的主流程，处理用户触发和自动发现
 * 监听 background 消息（翻译结果/错误/触发指令）并分发给对应模块
 */

import { onMessage } from '@shared/messaging';
import { getSettings } from '@shared/storage';
import { detectVisibleParagraphs, observeNewParagraphs } from './detector';
import { resetPageContextCache } from './context-builder';
import { initFloatingButton, destroyFloatingButton } from './floating-btn';
import { toggleAllTranslations } from './renderer';
import { TranslationOrchestrator } from './translator';
import type { MessageType, UserSettings } from '@shared/types';
import './styles/content.css';

const orchestrator = new TranslationOrchestrator();
let pageTranslateActive = false;   // 是否已激活整页翻译
let translationsVisible = false;   // 翻译结果当前是否可见（用于 toggle）
let floatingBtnMounted = false;    // 浮动按钮当前是否已挂载（守卫位，避免重复 init/destroy）

/** 扫描视口内段落并送入翻译队列 */
function translateVisibleParagraphs(): void {
  const paragraphs = detectVisibleParagraphs();
  if (paragraphs.length > 0) {
    orchestrator.translateParagraphs(paragraphs);
  }
}

/** 处理整页翻译触发：首次调用启动翻译，再次调用切换显示/隐藏 */
function handlePageTranslate(): void {
  if (pageTranslateActive) {
    // 已激活时再次触发 = 切换翻译结果的可见性
    translationsVisible = !translationsVisible;
    toggleAllTranslations();
    return;
  }

  pageTranslateActive = true;
  translationsVisible = true;
  resetPageContextCache();

  translateVisibleParagraphs();

  // 滚动时延迟 200ms 后检测新进入视口的段落（节流，避免滚动期间频繁触发）
  let scrollTimeout: ReturnType<typeof setTimeout>;
  window.addEventListener('scroll', () => {
    if (!translationsVisible) return;
    clearTimeout(scrollTimeout);
    scrollTimeout = setTimeout(translateVisibleParagraphs, 200);
  });
}

/**
 * 根据用户设置挂载或卸载浮动按钮。
 * 用 floatingBtnMounted 守卫位避免重复 init/destroy。
 */
function applyFloatingBtnSetting(enabled: boolean): void {
  if (enabled && !floatingBtnMounted) {
    initFloatingButton((text) => {
      orchestrator.translateSelection(text);
    });
    floatingBtnMounted = true;
  } else if (!enabled && floatingBtnMounted) {
    destroyFloatingButton();
    floatingBtnMounted = false;
  }
}

// 启动时按设置决定是否挂载浮动按钮
// 老用户升级场景下 selectionPopupEnabled 字段可能缺失，?? true 兜底保证默认开启
getSettings().then((s) => {
  applyFloatingBtnSetting(s.selectionPopupEnabled ?? true);
});

// 实时响应设置变化：设置页修改后，已打开的页面立刻 mount/unmount
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'sync' || !changes.settings) return;
  const newSettings = changes.settings.newValue as UserSettings | undefined;
  if (!newSettings) return;   // 清除场景：忽略
  applyFloatingBtnSetting(newSettings.selectionPopupEnabled ?? true);
});

// 监听 DOM 变化，整页翻译激活时自动翻译新出现的段落（节流 150ms）
let mutationTimeout: ReturnType<typeof setTimeout>;
observeNewParagraphs(() => {
  if (pageTranslateActive && translationsVisible) {
    clearTimeout(mutationTimeout);
    mutationTimeout = setTimeout(translateVisibleParagraphs, 150);
  }
});

onMessage((message: MessageType) => {
  switch (message.type) {
    case 'TRIGGER_PAGE_TRANSLATE':
      handlePageTranslate();
      break;
    case 'TRANSLATION_RESULT':
      orchestrator.handleResult(message.payload.paragraphId, message.payload.translated);
      break;
    case 'TRANSLATION_ERROR':
      orchestrator.handleError(message.payload.paragraphId, message.payload.error);
      break;
  }
});
```

主要变化：
1. 引入 `getSettings` 与 `destroyFloatingButton`、`UserSettings` 类型
2. 新增模块级守卫位 `floatingBtnMounted`
3. 新增 `applyFloatingBtnSetting` 函数
4. 原来顶层那行 `initFloatingButton(...)` 被替换为 `getSettings().then(...)`
5. 新增 `chrome.storage.onChanged.addListener` 用于实时响应

保留所有原有注释。

- [ ] **Step 4: 运行新测试确认通过**

Run: `npm run test:run -- tests/content/selection-popup-toggle.test.ts`
Expected: 6 个测试全部 PASS。

- [ ] **Step 5: 运行全量测试确认无回归**

Run: `npm run test:run`
Expected: 所有测试 PASS，包含 floating-btn / detector / renderer / translator / storage 等既有用例。

- [ ] **Step 6: 类型检查**

Run: `npx tsc --noEmit`
Expected: 无错误。

- [ ] **Step 7: Commit**

```bash
git add src/content/index.ts tests/content/selection-popup-toggle.test.ts
git commit -m "feat(content): mount floating button only when selectionPopupEnabled, react to storage changes"
```

---

## Task 4: Options 页新增「划词翻译图标」开关

**Files:**
- Modify: `src/options/App.tsx:246-261` (翻译设置 section)

`options/App.tsx` 是纯 UI 组件，目前没有单元测试覆盖。开关行为很简单（一个 controlled checkbox 直接调 `immediatelySave`），不引入新的测试基建；通过 Task 3 已经覆盖了"设置变化触发 mount/unmount"的端到端契约。

- [ ] **Step 1: 修改 `src/options/App.tsx` 的「翻译设置」section**

定位文件中以下片段（约 246-261 行）：

```tsx
      <section className="space-y-4">
        <h2 className="text-lg font-semibold border-b pb-2">翻译设置</h2>
        <div className="grid grid-cols-2 gap-4">
          <label className="block">
            <span className="text-sm text-gray-600">翻译风格</span>
            <select
              value={settings.style}
              onChange={(e) => immediatelySave({ ...settings, style: e.target.value as UserSettings['style'] })}
              className="mt-1 block w-full border rounded px-3 py-2"
            >
              <option value="colloquial">口语化</option>
              <option value="formal">书面化</option>
            </select>
          </label>
        </div>
      </section>
```

替换为（在 `</div>` 与 `</section>` 之间新增一个开关行）：

```tsx
      <section className="space-y-4">
        <h2 className="text-lg font-semibold border-b pb-2">翻译设置</h2>
        <div className="grid grid-cols-2 gap-4">
          <label className="block">
            <span className="text-sm text-gray-600">翻译风格</span>
            <select
              value={settings.style}
              onChange={(e) => immediatelySave({ ...settings, style: e.target.value as UserSettings['style'] })}
              className="mt-1 block w-full border rounded px-3 py-2"
            >
              <option value="colloquial">口语化</option>
              <option value="formal">书面化</option>
            </select>
          </label>
        </div>

        {/* 划词翻译图标开关：关闭后选中文本不再显示浮动「译」按钮 */}
        <label className="flex items-center justify-between py-2 cursor-pointer">
          <div>
            <div className="text-sm text-gray-700">划词翻译图标</div>
            <div className="text-xs text-gray-400 mt-0.5">选中文本后显示浮动「译」按钮（不影响整页翻译）</div>
          </div>
          <input
            type="checkbox"
            checked={settings.selectionPopupEnabled}
            onChange={(e) => immediatelySave({ ...settings, selectionPopupEnabled: e.target.checked })}
            className="w-4 h-4"
          />
        </label>
      </section>
```

要点：
- 使用 `immediatelySave`（与 `style` 切换一致），开关类设置即时落盘
- `checked={settings.selectionPopupEnabled}` —— Task 1 已保证该字段必存在（`DEFAULT_SETTINGS` 兜底），无需 `?? true`
- 复用现有 Tailwind 工具类，不引入新组件

- [ ] **Step 2: 类型检查**

Run: `npx tsc --noEmit`
Expected: 无错误。

- [ ] **Step 3: 运行全量测试**

Run: `npm run test:run`
Expected: 所有测试 PASS。

- [ ] **Step 4: 构建产物自检**

Run: `npm run build`
Expected: 构建成功，无报错。

- [ ] **Step 5: Commit**

```bash
git add src/options/App.tsx
git commit -m "feat(options): add toggle for floating selection translate button"
```

---

## Task 5: 手动验证（按 spec 测试方案）

**Files:** 无文件改动，纯手动验证。

按 spec 中的「测试方案（手动）」逐项验证：

- [ ] **Step 1: 构建并加载**

```bash
npm run build
```

打开 Chrome `chrome://extensions/` → 移除旧的 HalfTrans → 「加载已解压的扩展程序」选择 `dist/` 目录。

- [ ] **Step 2: 验证默认开启**

打开任意英文页面（如 https://nodejs.org/api/）→ 选中一段文本 → 应看到「译」浮动按钮。

- [ ] **Step 3: 验证关闭实时生效**

打开扩展设置页 → 「翻译设置」section → 关闭「划词翻译图标」开关。

切回刚才的页面（**不要刷新**）→ 选中文本 → 不应出现「译」按钮。

- [ ] **Step 4: 验证重新开启**

回到设置页打开开关 → 切回页面（不刷新）→ 选中文本 → 应立刻出现「译」按钮。

- [ ] **Step 5: 验证整页翻译不受影响**

关闭开关 → 用快捷键 `Ctrl+Shift+T`（Mac: `Cmd+Shift+T`）触发整页翻译 → 整页翻译仍应正常工作。

- [ ] **Step 6: 验证老用户升级兼容**

打开 DevTools → Console（在扩展设置页内）→ 运行：

```js
chrome.storage.sync.get('settings').then(r => {
  const s = { ...r.settings };
  delete s.selectionPopupEnabled;
  return chrome.storage.sync.set({ settings: s });
});
```

刷新一个新的页面 → 选中文本 → 应看到「译」按钮（即字段缺失时按开启处理）。

- [ ] **Step 7: 验证多标签同步**

打开两个英文页面 A 和 B → 选中文本，两边都能出现按钮 → 在设置页关闭开关 → A 和 B 两边都应立刻不再出现按钮。

- [ ] **Step 8: 全部通过后记录验证结论**

若所有步骤都通过，可以进入下一步交付/合并；任一步未通过，回到对应 Task 排查。

---

## 完成检查

- [ ] 所有自动化测试通过（`npm run test:run`）
- [ ] 类型检查通过（`npx tsc --noEmit`）
- [ ] 构建成功（`npm run build`）
- [ ] 手动验证 Task 5 的 7 个场景全部通过
- [ ] 所有提交已 push（如适用）
