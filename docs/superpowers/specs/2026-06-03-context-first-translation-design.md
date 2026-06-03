# 上下文优先翻译架构设计

## 概述

将翻译系统从"AI 术语提取 → 翻译"双步架构，重构为"上下文收集 → 单次翻译"架构。核心思想：不让 AI 决定"什么是术语"，只让 AI 在完整上下文下做"理解与认知改写"。

## 设计原则

1. **删除 AI 决策系统** — 术语提取、领域分类、全局术语状态全部删除
2. **三大核心输入** — Page Context + Strong Terms + User Dictionary
3. **单次 LLM 调用** — one request → one response，禁止 multi-step pipeline

## 问题定义

当前架构用第 1 次 LLM 调用提取"页面术语"，再传给第 2 次翻译调用。问题：

- AI 术语提取实际价值极低 — 模型识别出的"技术词"不等于"应该保留英文的词"
- 导致 server、request、issue 被错误保留
- 真正决定翻译质量的是**上下文质量**，不是术语列表
- 多步 pipeline 增加延迟和复杂度

## 架构

```
Page Load
    ↓
Context Builder（静态提取，缓存）
    ↓
Cache page-level context

User Trigger Translation
    ↓
Per-batch: collect surrounding text + code block
    ↓
Build Prompt:
    Page Context (text blocks)
    + Surrounding Text
    + Code Context
    + Strong Terms
    + User Dictionary
    + Batch Text
    ↓
Single LLM Call
    ↓
Render Result
```

## 删除的模块

| 模块 | 文件 | 原因 |
|------|------|------|
| AI 术语提取 | `term-extractor.ts` | 价值极低，上下文已能解决 |
| 全局术语状态 | background `globalTermRecords` | 不再需要跨 batch 累积 |
| 术语合并 | `terminology.ts` `mergeTermRecords()` | 删除 |
| 术语上下文构建 | `terminology.ts` `buildTermContext()` | 删除 |
| 术语提取调用 | background `getOrExtractTerms()` | 删除 |
| context-serializer | `context-serializer.ts` | 替换为新 context-builder |

## 新增/改造的模块

### context-builder.ts（新）

职责：收集翻译所需的上下文信息。仅做静态 DOM 提取，不做智能分析。

**页面级上下文（加载时收集一次，缓存）：**

- `document.title`
- H1（通常 1 个）
- 前 5-8 个 H2/H3

**段落级上下文（每批翻译时动态收集）：**

- 当前段落所属的最近 section heading
- 前后相邻段落（动态 token 窗口）
- 最近的代码块（`<pre>/<code>`，截断）

**动态 token 窗口策略：**

总上下文预算：~800-1200 tokens

优先级分配：
1. 当前 section heading
2. 前后邻近段落（各 1-2 段）
3. 最近代码块（截断到 ~300 字符）
4. 页面标题 / H1

超出预算时按优先级逆序截断。

### strong-terms.ts（新）

静态术语表，约 50-100 个高价值技术概念。

```typescript
interface StrongTerm {
  term: string;
  allowOverride?: boolean; // default true
}
```

`allowOverride = true`（默认）表示：如果上下文表明该词不是作为技术概念使用，模型可以翻译它。例如 "hook" 在 React 语境保留英文，在 "fishing hook" 语境翻译为中文。

术语表分类存放（分类仅用于维护可读性，不参与运行时逻辑）：

- 编程范式：event loop, callback, promise, closure, runtime, fiber, coroutine, goroutine, async/await
- 前端：virtual DOM, reconciliation, hydration, SSR, SSG, hook, render props
- AI/ML：transformer, embedding, token, attention, fine-tuning, inference, RAG
- 云原生：pod, deployment, ingress, service mesh, sidecar, operator
- 通用：middleware, framework, library, API, SDK, CLI, IDE

不包含复杂结构（无 domain、无 priority、无 scoring）。

### prompt.ts（改造）

三层规则结构：

**Layer 1 — Hard rules（绝对规则）：**
- 代码标识符（变量名、函数名、类名、命令）永不翻译
- 代码块内容保持原样
- API 字段、日志内容保持原样

**Layer 2 — Strong terms（强术语引导）：**
- 注入术语列表
- 告知模型"这些术语在技术语境中通常保留英文"
- 但允许上下文覆盖

**Layer 3 — Soft heuristics（软性倾向）：**
- 翻译风格（口语化/书面化）
- 长度控制（≤ 原文 1.3 倍）
- 一致性要求

Prompt 中不写确定性翻译规则（如 "server → 服务器"），改为 soft guidance：模型根据上下文自行判断普通技术词的翻译。

### direct-api.ts（简化）

去掉 `contextTerms`、`extractedTerms`、`terminology` 参数。接收：
- `context: TranslationContext` — context-builder 输出的结构化上下文（由 prompt.ts 序列化为文本块）
- `keepTerms: string[]` — 用户词库 keep=true
- `translateTerms: string[]` — 用户词库 keep=false

## 上下文在 Prompt 中的格式

使用纯文本块，不使用 JSON 结构（LLM 对文本块的 attention 更集中）：

```
=== PAGE ===
Title: Understanding React Hooks

=== SECTION ===
State Management > Using useState

=== CODE ===
const [count, setCount] = useState(0)

=== CONTEXT ===
[前文] React provides several built-in hooks for managing state...
[前文] The most common hook is useState, which lets you add state to function components...

=== TRANSLATE ===
[SEP]
The hook can access state.
[SEP]
You can also create custom hooks.
[SEP]
```

## System Prompt 模板

```
你是程序员认知翻译助手。目标不是语言翻译，而是将英文技术内容转换为程序员最容易理解的表达形式。

=== HARD RULES ===
- 代码标识符（变量名、函数名、类名、包名、命令）永不翻译
- 代码块、日志内容、配置文件内容保持原样
- API 字段（userId, createdAt 等）保持原样
- 固定搭配保持整体：HTTP request, Pull Request, Dependency Injection

=== STRONG TERMS ===
以下术语在技术语境中通常保留英文原文：
{strongTerms}
（如果上下文表明某词不是作为技术概念使用，仍可翻译）

=== GUIDANCE ===
- 优先理解语义，禁止逐词翻译
- 普通技术词默认翻译为中文（如 server, request, response 等有明确中文对应的词）
- 同一概念全文保持一致
- 输出长度 ≤ 原文 1.3 倍，禁止扩展解释
- {口语化/书面化}风格
- 只输出翻译结果

{用户词库注入}
```

## 用户词库注入方式

```
=== USER DICTIONARY ===
始终保留英文：{keepTerms}
始终翻译为中文：{translateTerms}
（用户词库优先级高于其他规则）
```

## 保留不变的模块

| 模块 | 原因 |
|------|------|
| `detector.ts` | 段落检测逻辑无关 |
| `renderer.ts` | 渲染逻辑无关 |
| `term-cache.ts` | 复用为页面上下文缓存 |
| 批量翻译 + `[SEP]` 分隔 | 保留，只是 prompt 变了 |
| 用户词库（storage 中的 terminology） | 仍然生效 |
| `floating-btn.ts` | UI 无关 |

## 简化后的类型

```typescript
// 删除
// - TermRecord
// - ExtractedTerms（或简化为仅 string[]）
// - contextTerms 参数

// 新增/修改
interface TranslationContext {
  pageContext: string;      // 页面标题 + headings 的文本块
  sectionContext: string;   // 当前 section heading
  surroundingText: string;  // 前后段落
  codeContext: string;      // 最近代码块
}

interface BatchTranslationRequest {
  paragraphs: Array<{ id: string; text: string }>;
  settings: UserSettings;
  context: TranslationContext;
  keepTerms: string[];      // 用户词库 keep=true
  translateTerms: string[]; // 用户词库 keep=false
}

// TranslationResult 简化
interface TranslationResult {
  paragraphId: string;
  original: string;
  translated: string;
  // 删除 termsUsed 字段
}
```

## 预期效果

输入："The server receives requests. If you encounter an issue, restart the server."

上下文："Title: Node.js Deployment Guide / Section: Troubleshooting"

输出："服务器接收请求。如果遇到问题，重启服务器。"

---

输入："The hook can access state."

上下文："Title: Understanding React Hooks / Code: `const [count, setCount] = useState(0)`"

输出："hook 可以访问 state。"（模型在 React 上下文中正确保留 hook 和 state）

---

输入："The event loop processes callbacks from the task queue."

输出："event loop 处理 task queue 中的 callbacks。"（强术语表 + 上下文共同作用）

## 风险与缓解

| 风险 | 缓解 |
|------|------|
| 无术语提取后模型可能翻译不该翻译的词 | Strong terms 兜底 + 用户词库自定义 |
| 上下文窗口不够导致误判 | 动态 token 窗口按优先级分配，保证最关键信息在内 |
| 不同 batch 之间术语不一致 | 页面级上下文（标题/heading）在所有 batch 中共享 |
| 强术语表需要维护 | 列表只有 50-100 项，变动频率极低，用户可通过词库覆盖 |

## 优先级排序

| 优先级 | 内容 |
|--------|------|
| P0 | Page Context Builder + 前后段落窗口 + 代码块提取 + 单次 LLM 调用 |
| P1 | 用户词库注入 |
| P2 | Strong Terms 静态表 |
| P3 | 批量翻译优化 |

## 成功标准

翻译结果满足：程序员阅读翻译版的速度 ≥ 阅读原文速度。

具体指标：
- 普通技术词（server, request, issue）被正确翻译为中文
- 专有技术概念（event loop, virtual DOM, hook）在技术语境中保留英文
- 相同概念在页面内保持一致
- 单次 LLM 调用完成，延迟比当前减少约 50%
