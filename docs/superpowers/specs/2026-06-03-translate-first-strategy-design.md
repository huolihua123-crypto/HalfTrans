# 全译优先翻译策略设计

## 概述

将翻译系统的默认行为从"模型自行判断术语保留"翻转为"全部翻译为中文，仅白名单专有名词保留英文"。核心目标是消除假阳性（非术语被错误保留为英文），提升翻译自然度。

## 问题定义

当前系统让模型"根据语境判断是否保留术语"，但模型在不确定时倾向保留英文（安全选择），导致：
- server、request、issue、process 等有标准中文对应的词被保留
- 翻译结果半中半英，读起来像机翻而非人写的中文技术文章

## 核心原则

| 维度 | 当前策略 | 新策略 |
|------|---------|--------|
| 默认行为 | 模型自行判断是否保留 | 全部翻译为中文 |
| 术语处理 | 给出术语列表，"根据语境决定" | 给出极短白名单，"只有这些保留" |
| 不确定时 | 倾向保留英文（假阳性） | 倾向翻译为中文（假阴性） |

白名单入选标准（必须同时满足）：
1. 专有名词 — 是某个具体产品/框架/协议的名称
2. 无公认中文翻译 — 在中文技术社区中没有稳定的中文叫法
3. 翻译会造成歧义 — 翻译成中文后读者无法识别原指什么

白名单示例：React, Vue, Kubernetes, Docker, gRPC, Tokio, WebSocket, GraphQL

明确排除：server, request, response, issue, process, thread, service, function, class, object

## 架构

```
页面加载
    ↓
检测可见英文段落（不变）
    ↓
提取页面上下文：标题 + 标题列表 + 样本段落（不变）
    ↓
LLM 调用 1：专有名词抽取（新 prompt，输出极短白名单）
    ↓
合并白名单 = 抽取结果 + 用户自定义保留词
    ↓
LLM 调用 2：批量翻译（新 prompt，"全部翻译，只有白名单保留"）
    ↓
渲染翻译结果（不变）
```

LLM 调用次数与当前一致（2 次），延迟不增加。

## 术语抽取 Prompt

```
根据以下网页信息，提取需要保留英文原文的专有名词。

入选标准（必须同时满足）：
1. 是某个具体产品、框架、库、协议或工具的名称
2. 在中文技术社区中没有通用的中文叫法
3. 翻译为中文后读者无法识别其所指

符合的例子：React, Kubernetes, Docker, gRPC, WebSocket, Nginx
不符合的例子：server（服务器）, request（请求）, runtime（运行时）, thread（线程）, function（函数）

网页信息：
{contextText}

输出格式：
{"terms": ["...", "..."]}
```

关键改动：
- 去掉 domain 字段，领域信息对翻译无实际指导作用
- 用正例和反例明确边界
- 标准从"技术术语"收紧为"专有名词"

## 翻译 Prompt

```
你是一个专业的中文技术内容翻译助手。

核心规则：
1. 将所有英文内容翻译为自然流畅的中文。
2. 只有以下专有名词保留英文原文不翻译：{白名单}
3. 除上述列表外，所有英文词汇都必须翻译为中文，包括 server、request、issue 等常见技术词汇。
4. 翻译风格：{口语化/书面化}
5. 只输出翻译结果。
```

关键改动：
- 无条件指令："所有英文翻译为中文"，没有"根据语境判断"
- 白名单是封闭集："只有以下词保留"，不给模型扩展空间
- 显式列出反例：主动提到高频误保留词必须翻译
- 去掉 contextTerms/TermRecord 机制

## 用户自定义术语

用户在设置中手动添加的术语仍然生效：
- `keep=true` 的词：合并进白名单
- `keep=false` 的词：加入 prompt 的反例中（强制翻译）

## 需要删除/简化的模块

| 模块 | 处理方式 |
|------|---------|
| `TermRecord` 全局累积机制 | 删除 |
| `buildTermContext()` | 删除 |
| `contextTerms` 参数 | 删除 |
| `mergeTermRecords()` | 删除 |
| `ExtractedTerms.domain` 字段 | 删除 |

## 保留不变的模块

| 模块 | 原因 |
|------|------|
| `detector.ts` | 段落检测逻辑无关 |
| `context-extractor.ts` | 页面上下文提取仍需要 |
| `renderer.ts` | 渲染逻辑无关 |
| `term-cache.ts` | 缓存仍有价值，缓存内容变为更短的白名单 |
| 用户 `TermEntry` 设置 | 用户自定义术语仍生效 |
| 批量翻译 + `[SEP]` 分隔机制 | 保留，只是 prompt 变了 |

## 简化后的类型

```typescript
interface ExtractedTerms {
  terms: string[];  // 去掉 domain
}

interface BatchTranslationRequest {
  paragraphs: Array<{ id: string; text: string }>;
  settings: UserSettings;
  keepTerms: string[];  // 合并后的白名单（抽取 + 用户自定义）
}
```

## 预期效果

输入："The server receives requests. If you encounter an issue, restart the server."

当前输出："server 接收 requests。如果遇到 issue，重启 server。"

新策略输出："服务器接收请求。如果遇到问题，重启服务器。"

输入："The Tokio runtime executes futures."

新策略输出："Tokio 运行时执行 futures。"（Tokio 和 futures 作为 Rust 专有概念在白名单中保留）

## 风险与缓解

| 风险 | 缓解措施 |
|------|---------|
| 假阴性：该保留的术语被翻译 | 1. 用户可手动将术语加入保留列表；2. 抽取 prompt 的正例覆盖常见框架名 |
| 白名单抽取不稳定 | 缓存机制（term-cache）保证同一页面不重复抽取 |
| 少数边界情况（如 API, HTTP） | 这类缩写词通常不会被翻译为中文，模型即使在"全译"指令下也会保留，因为它们没有中文形式 |
