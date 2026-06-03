# HalfTrans 架构概览

## 核心理念

半翻译 = 保留技术术语英文原文 + 将普通文字翻译为中文。目标不是语言翻译，而是将英文技术内容转换为程序员最容易理解的表达形式。

## 数据流

```
用户触发（快捷键/右键菜单/浮动按钮）
        │
        ▼
┌─────────────────────────────────────────────────────┐
│  Content Script (content/)                          │
│                                                     │
│  index.ts ─→ detector.ts ─→ context-builder.ts     │
│     │              │               │                │
│     │         检测视口内          收集页面标题       │
│     │         纯英文段落         章节/前后文/代码    │
│     │              │               │                │
│     │              ▼               ▼                │
│     │        translator.ts                          │
│     │         (编排请求)                            │
│     │              │                                │
└─────────────────── │ ───────────────────────────────┘
                     │ chrome.runtime.sendMessage
                     ▼
┌─────────────────────────────────────────────────────┐
│  Background Service Worker (background/)            │
│                                                     │
│  index.ts                                           │
│   ├─ 分批 (BATCH_SIZE=12)                          │
│   ├─ 并发控制 (MAX_CONCURRENT=3)                   │
│   └─→ core/direct-api.ts                           │
│          ├─ 构造 prompt (core/prompt.ts)            │
│          ├─ 调用 LLM API                           │
│          └─ 解析响应 ([SEP] 或双换行分割)          │
│                                                     │
└─────────────────── │ ───────────────────────────────┘
                     │ chrome.tabs.sendMessage
                     ▼
┌─────────────────────────────────────────────────────┐
│  Content Script (content/)                          │
│                                                     │
│  translator.ts ─→ renderer.ts                       │
│   (结果路由)      (DOM 注入翻译结果)                │
│                                                     │
└─────────────────────────────────────────────────────┘
```

## 模块职责表

| 文件 | 职责 | 输入 | 输出 |
|------|------|------|------|
| `content/index.ts` | 入口协调 | 用户触发/消息 | 调用 detector、translator |
| `content/detector.ts` | 段落检测 | DOM | 可翻译段落列表 |
| `content/context-builder.ts` | 上下文收集 | DOM 元素 | TranslationContext |
| `content/translator.ts` | 请求编排 | 段落+上下文 | 发送消息/处理结果 |
| `content/renderer.ts` | DOM 渲染 | 翻译结果 | 注入/更新 DOM 元素 |
| `content/floating-btn.ts` | 浮动按钮 | 用户选区 | 触发选区翻译 |
| `content/selection-popup.ts` | 结果弹窗 | 翻译文本 | 浮动弹窗 |
| `background/index.ts` | 批量调度 | 翻译请求 | API 调用+结果分发 |
| `core/direct-api.ts` | API 调用 | prompt | 翻译结果 |
| `core/prompt.ts` | Prompt 构建 | 设置+上下文+文本 | system/user prompt |
| `core/strong-terms.ts` | 术语表 | — | 强保留术语列表 |
| `shared/types.ts` | 类型定义 | — | TypeScript 类型 |
| `shared/storage.ts` | 持久化 | — | 用户设置/术语表 |
| `shared/messaging.ts` | 消息通信 | — | 类型安全的消息 API |

## 关键设计决策

### 批量翻译 + [SEP] 分隔

**为什么：** 减少 API 调用次数。12 段文本合并为一次请求，比逐条调用快 10 倍以上。

**怎么做：** prompt 要求 LLM 用 `[SEP]` 分隔各段翻译结果。解析时先按 `[SEP]` 分割，数量不匹配时 fallback 到双换行分割，仍失败则降级为逐条翻译。

### Fallback 降级策略

**为什么：** LLM 输出格式不完全可控，部分模型会忽略 [SEP] 指令或合并短句。

**怎么做：** `parseBatchResponse` 尝试两种分割策略，都失败后 `translateBatch` 自动降级为 `Promise.all` 逐条翻译。牺牲性能换取正确性。

### TreeWalker 而非 innerText

**为什么：** 翻译结果被注入为原始段落的子元素。如果用 `innerText`/`textContent` 取文本，会把已有的翻译结果也包含进去。

**怎么做：** `getOwnText` 使用 TreeWalker 遍历文本节点，过滤掉 `data-halftrans-result` 和 `data-halftrans-loading` 子树。

### 页面上下文缓存

**为什么：** 同一页面的标题和主要标题不会变化，每次段落翻译都重新查询浪费性能。

**怎么做：** `collectPageContext` 首次调用后缓存结果，`resetPageContextCache` 在整页翻译开始时清除（应对 SPA 页面切换）。

### 并发控制

**为什么：** 一次性发送过多 API 请求会触发速率限制（429 错误）。

**怎么做：** 先按 `BATCH_SIZE=12` 分批，再按 `MAX_CONCURRENT=3` 分组并发。每组内 3 个批次并行请求，组间串行等待。最大吞吐 = 12 × 3 = 36 段/轮。

## 消息协议

Content Script 和 Background 通过 `chrome.runtime.sendMessage` 通信，消息类型定义在 `shared/types.ts`：

| 消息类型 | 方向 | 用途 |
|---------|------|------|
| `TRANSLATE_PARAGRAPHS` | content → background | 请求批量翻译 |
| `TRANSLATE_SELECTION` | content → background | 请求选区翻译 |
| `TRANSLATION_RESULT` | background → content | 返回单段翻译结果 |
| `TRANSLATION_ERROR` | background → content | 返回翻译错误 |
| `TRIGGER_PAGE_TRANSLATE` | background → content | 通知 content script 开始整页翻译 |
