# 划词翻译图标显隐开关 — 设计文档

**日期**：2026-06-05
**作者**：huolihua（与 Claude 协作）
**状态**：草案

## 背景

当前选中页面文本后，会在选区上方弹出一个浮动"译"按钮（[floating-btn.ts](../../../src/content/floating-btn.ts)）。该按钮始终启用，没有用户控制开关。部分用户在某些场景下（如阅读已熟悉的内容、需要频繁选中文字做其他操作）希望关闭这个图标，避免视觉干扰。

## 目标

在插件设置页新增一个开关，控制选中文本后是否显示浮动"译"按钮。功能关闭时，该按钮不再出现；整页翻译功能（快捷键、popup 触发）**不受影响**。

## 非目标

- 不调整快捷键或 popup 整页翻译入口
- 不引入"右键菜单"或其他选中翻译入口（未来若有，再单独决定是否与该开关联动）
- 不持久化"按域名启用/禁用"的细粒度配置

## 设计

### 架构

```
┌─────────────────┐  保存 settings   ┌──────────────────┐
│  options/App    │ ───────────────▶ │ chrome.storage   │
│  (新开关 UI)    │                   │     .sync        │
└─────────────────┘                   └────────┬─────────┘
                                               │ onChanged
                                               ▼
                                      ┌──────────────────┐
                                      │ content/index.ts │
                                      │  - 启动时读设置  │
                                      │  - 监听变化      │
                                      │  - mount/unmount │
                                      └────────┬─────────┘
                                               │ init/destroy
                                               ▼
                                      ┌──────────────────┐
                                      │ floating-btn.ts  │
                                      │ (复用现有 API)   │
                                      └──────────────────┘
```

### 改动清单

| 文件 | 改动 |
|------|------|
| [src/shared/types.ts](../../../src/shared/types.ts) | `UserSettings` 新增 `selectionPopupEnabled: boolean`；`DEFAULT_SETTINGS` 加默认 `true` |
| [src/content/index.ts](../../../src/content/index.ts) | 启动时读设置决定是否 `initFloatingButton`；订阅 `chrome.storage.onChanged` 做 mount/unmount |
| [src/options/App.tsx](../../../src/options/App.tsx) | 「翻译设置」section 在「翻译风格」下方新增一行开关 |

[src/content/floating-btn.ts](../../../src/content/floating-btn.ts) **零改动** — 现有 `initFloatingButton` / `destroyFloatingButton` 已对应 "挂载/卸载" 语义。

### 类型定义改动

```ts
// src/shared/types.ts
export interface UserSettings {
  apiConfigs: ApiConfig[];
  activeConfigId: string;
  style: TranslationStyle;
  shortcut: string;
  selectionPopupEnabled: boolean;  // 新增
}

export const DEFAULT_SETTINGS: UserSettings = {
  apiConfigs: [],
  activeConfigId: '',
  style: 'colloquial',
  shortcut: 'Ctrl+Shift+T',
  selectionPopupEnabled: true,     // 新增，默认开启
};
```

### content/index.ts 关键逻辑

```ts
import { getSettings } from '@shared/storage';
import type { UserSettings } from '@shared/types';

let floatingBtnMounted = false;

function applyFloatingBtnSetting(enabled: boolean): void {
  if (enabled && !floatingBtnMounted) {
    initFloatingButton((text) => orchestrator.translateSelection(text));
    floatingBtnMounted = true;
  } else if (!enabled && floatingBtnMounted) {
    destroyFloatingButton();
    floatingBtnMounted = false;
  }
}

// 启动时根据设置决定是否挂载（旧版本无该字段时按 true 处理）
getSettings().then(s => applyFloatingBtnSetting(s.selectionPopupEnabled ?? true));

// 实时响应设置变化（设置页修改后已打开的页面立刻生效）
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'sync' || !changes.settings) return;
  const newSettings = changes.settings.newValue as UserSettings | undefined;
  if (!newSettings) return;
  applyFloatingBtnSetting(newSettings.selectionPopupEnabled ?? true);
});
```

要点：
- `floatingBtnMounted` 守卫位防止重复 init / destroy
- `?? true` 兜底，保证未持久化字段的老用户行为不变
- 现有的 `initFloatingButton((text) => orchestrator.translateSelection(text))` 这一行调用从模块顶层移入 `applyFloatingBtnSetting` 内

### options/App.tsx UI 改动

在「翻译设置」section 的「翻译风格」下方新增一行开关。位置示意：

```
─── 翻译设置 ────────────────────
[ 翻译风格:   口语化 / 书面化 ]
[ 划词翻译图标       ⬤——⬤    ]   ← 新增
─────────────────────────────────
```

实现：

```tsx
<section className="space-y-4">
  <h2 className="text-lg font-semibold border-b pb-2">翻译设置</h2>
  <div className="grid grid-cols-2 gap-4">
    <label className="block">
      <span className="text-sm text-gray-600">翻译风格</span>
      <select ... />
    </label>
  </div>

  {/* 新增：划词翻译图标开关 */}
  <label className="flex items-center justify-between py-2">
    <div>
      <div className="text-sm text-gray-700">划词翻译图标</div>
      <div className="text-xs text-gray-400 mt-0.5">选中文本后是否显示浮动「译」按钮</div>
    </div>
    <input
      type="checkbox"
      checked={settings.selectionPopupEnabled}
      onChange={(e) => immediatelySave({ ...settings, selectionPopupEnabled: e.target.checked })}
      className="..."
    />
  </label>
</section>
```

使用 `immediatelySave` 而非 `debouncedSave` — 与 `style` 切换保持一致，开关类设置即时落盘。

### 兼容性

- **老用户升级**：旧 `chrome.storage.sync` 里 `selectionPopupEnabled` 字段缺失。`?? true` 兜底使行为不变；用户首次修改任何设置时该字段才真正写入。
- **首次安装（无 settings）**：`getSettings()` 返回 `DEFAULT_SETTINGS`，含 `selectionPopupEnabled: true`。
- **storage 清除场景**：`changes.settings.newValue` 可能为 `undefined`，直接 return。
- **关闭瞬间选区按钮正显示**：`destroyFloatingButton` 已包含 `removeButton()`，DOM 立刻消失。

## 测试方案（手动）

1. 默认安装 → 选中文本 → 看到"译"按钮 ✓
2. 设置页关闭开关 → 当前页面立刻不再出现按钮（无需刷新）✓
3. 重新打开开关 → 立刻恢复 ✓
4. 关闭状态下用快捷键触发整页翻译 → 整页翻译仍正常 ✓
5. 模拟老用户（清空 `selectionPopupEnabled` 字段）→ 默认表现为开启 ✓
6. 多个标签页同时打开 → 一处修改，其他标签页同步生效 ✓

## 风险与取舍

- **极小性能开销**：`chrome.storage.onChanged` 是 Chrome 原生事件，无明显成本。
- **未来扩展**：若后续新增右键菜单 / 其他划词入口，需要决定是否与同一开关联动；当前命名 `selectionPopupEnabled` 已偏"图标显隐"语义，将来扩展时可能要重命名为更通用的 `selectionTranslateEnabled` — 本次先按当前命名落地，到那时再处理。
