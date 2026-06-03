# 选区翻译弹窗加载态设计

## 问题

当前选区翻译流程中，用户点击"译"按钮后，弹窗仅在 API 返回翻译结果后才出现。等待期间无任何视觉反馈，用户感知不到翻译正在进行。

## 目标

用户点击"译"后**立即**弹出弹窗，显示加载状态（spinner + "翻译中..."），翻译完成后替换为结果文本。

## 交互流程

1. 用户选中文本 → 浮动"译"按钮出现（不变）
2. 用户点击"译" → **立即弹出弹窗，显示 spinner + "翻译中..."**
3. API 返回结果 → 弹窗内容直接替换为翻译结果文本
4. API 返回错误 → 弹窗内容替换为"翻译失败：xxx"

弹窗位置在步骤 2 时计算并固定，后续内容更新不改变位置。用户随时可以点击外部或关闭按钮关闭弹窗（包括加载中时）。

## 设计决策

- 加载态展示形式：CSS spinner 旋转动画 + "翻译中..."文字
- 结果切换方式：直接替换内容，无过渡动画
- 错误展示：弹窗内直接显示错误信息，无重试按钮（与现有行为一致）

## 实现方案

采用方案 A：修改 `selection-popup.ts` 支持两阶段显示。

### `selection-popup.ts` 改动

- 新增 `showSelectionPopupLoading()` 函数：创建弹窗并定位，内容为 spinner + "翻译中..."
- 修改 `showSelectionPopup(text)` 函数：若弹窗已存在（loading 态），仅更新内容文本并移除 loading 元素；若弹窗不存在，按现有逻辑创建（兼容右键菜单翻译等直接收到结果的场景）
- Spinner 用纯 CSS 实现，不引入外部依赖

### `translator.ts` 改动

- `translateSelection` 方法：发送请求前调用 `showSelectionPopupLoading()`
- `handleResult` 对选区翻译的处理保持调用 `showSelectionPopup(translated)`
- `handleError` 同理，调用 `showSelectionPopup("翻译失败：xxx")`

### `content.css` 改动

新增样式：
- `.halftrans-sel-popup-loading`：loading 容器，flex 布局，垂直居中对齐 spinner 和文字
- `.halftrans-spinner`：CSS-only 旋转圆环动画（border + border-top 着色 + rotate keyframe）

### 不变的部分

- `floating-btn.ts`：浮动按钮逻辑不变
- `renderer.ts`：页面翻译加载态是独立逻辑，不受影响
- `background/index.ts`：消息流不变
- 消息类型定义：无需新增消息类型

## 兼容性考虑

- 右键菜单翻译（`ctx-` 前缀 ID）：不经过 `translateSelection`，直接收到结果时 `showSelectionPopup` 发现弹窗不存在会从零创建，行为不变
- 用户快速连续点击：`showSelectionPopupLoading()` 开头调用 `removeSelectionPopup()` 清除上一个弹窗，避免残留
