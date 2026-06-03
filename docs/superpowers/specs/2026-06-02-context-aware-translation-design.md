# 上下文感知术语标注翻译方案设计

## 问题概述

当前翻译架构在页面级生成自由文本策略，把"哪些词属于术语"的判断交给翻译模型。模型倾向过度保留英文，导致 server、issue、request 等常见词不被翻译，产出不自然的半中半英文本。

## 设计目标

1. 将术语识别与翻译职责分离
2. 实现 Occurrence Level 的术语判断——同一词在不同段落中可有不同处理
3. 准确度优先，延迟次之，成本最后

## 整体流程

```
页面内容
    ↓
页面上下文提取（title、headings、sample paragraphs）
    ↓
LLM 术语抽取（结构化 JSON，持久化缓存 24h）
    ↓
批量翻译（prompt 内含上下文标注逻辑）
    ↓
结果渲染
```

## 模块设计

### 1. 术语抽取器（替换 `strategy.ts`）

**文件：** `halftrans/src/core/term-extractor.ts`

**职责：** 调用 LLM，根据页面上下文提取当前页面的技术术语列表。

**输入：** 序列化后的页面上下文（title、URL、headings、sample paragraphs）

**输出：**

```typescript
interface ExtractedTerms {
  domain: string;        // 页面所属领域，如 "backend", "frontend", "devops"
  terms: string[];       // 应保留英文的技术术语列表
}
```

**Prompt 设计：**

```
根据以下网页信息，提取当前页面中作为专有技术概念使用的术语。

规则：
1. 只提取在当前技术领域中作为专有概念的词（如 runtime、Event Loop、Virtual DOM）
2. 不要包含有明确中文对应的通用词（如 server→服务器、request→请求、issue→问题）
3. 框架名、库名、专有 API 名应包含
4. 只输出 JSON，不要解释

网页信息：
{contextText}

输出格式：
{"domain": "...", "terms": ["...", "..."]}
```

**容错：** JSON.parse 失败时返回 `{ domain: "", terms: [] }`，翻译流程继续。

### 2. 术语缓存（替换 `strategy-cache.ts`）

**文件：** `halftrans/src/core/term-cache.ts`

**职责：** 将术语抽取结果持久化到 `chrome.storage.local`，按 URL 索引，24 小时过期。

**接口：**

```typescript
interface CachedTermEntry {
  domain: string;
  terms: string[];
  timestamp: number;     // 写入时间戳（Date.now()）
}

class TermCache {
  async get(url: string): Promise<ExtractedTerms | null>;   // 过期返回 null
  async set(url: string, data: ExtractedTerms): Promise<void>;
  async clear(): Promise<void>;                              // 手动清除全部缓存
}
```

**过期策略：** `Date.now() - entry.timestamp > 24 * 60 * 60 * 1000` 则视为过期。

**存储 key 格式：** `term-cache::{normalizedUrl}`

**清理策略：** 每次 `set` 时顺带清理已过期的条目，防止存储膨胀。

### 3. 翻译 Prompt 重构（修改 `prompt.ts`）

**核心变更：** 移除 `pageStrategy` 参数和 `intensity` 参数，引入 `extractedTerms` 参数。

**新的 `buildSystemPrompt` 签名：**

```typescript
function buildSystemPrompt(
  style: TranslationStyle,
  contextTerms: TermRecord[],      // 用户手动配置的术语
  extractedTerms?: string[]         // LLM 抽取的术语列表
): string
```

**新的 System Prompt 结构：**

```
你是一个专业的技术内容翻译助手。将英文翻译为中文，目标是最小化读者的认知成本。

规则：
1. {styleInstruction}
2. 对于每个段落，根据上下文判断术语的使用方式：
   - 如果术语在当前句子中作为技术概念使用（如 "the runtime executes futures"），保留英文
   - 如果术语在当前句子中作为普通含义使用（如 "if you encounter an issue"），翻译为中文
3. 以下术语是当前页面的技术术语，但请根据每句话的具体语境决定是否保留：
   {extractedTerms.join(', ')}
4. {用户强制保留术语指令}
5. {用户强制翻译术语指令}
6. 未被标记为术语的英文词汇，默认翻译为中文。
7. 只输出翻译结果，不要解释或添加额外内容。
```

**关键设计决策：**

- 移除 `intensity`（conservative/aggressive）全局控制保留强度——改由模型逐句判断
- 用户术语表中 `keep=true` 的词无条件保留，`keep=false` 的词无条件翻译
- LLM 抽取的术语列表仅作为参考上下文，模型仍需逐句判断是否保留

### 4. 优先级规则

```
用户手动标记（TermEntry, keep=true）  → 无条件保留英文
用户手动标记（TermEntry, keep=false） → 无条件翻译为中文
LLM 抽取的术语                        → 模型根据当前句子上下文判断
未出现在任何列表中的词                 → 默认翻译为中文
```

### 5. Background Script 调整（修改 `background/index.ts`）

**流程变更：**

```typescript
async function translateBatch(tabId, paragraphs, pageContext?) {
  const settings = await getSettings();
  const terminology = await getTerminology();

  // 1. 获取或抽取术语
  let extractedTerms: ExtractedTerms | null = null;
  if (pageContext) {
    const url = pageContext.url;
    extractedTerms = await termCache.get(url);
    if (!extractedTerms) {
      const contextText = serializeContext(pageContext);
      extractedTerms = await extractTerms(contextText, settings);
      await termCache.set(url, extractedTerms);
    }
  }

  // 2. 构建术语上下文（用户术语优先）
  const userTerms = buildTermContext(terminology, /* all batch text */);

  // 3. 批量翻译
  const batches = chunk(toTranslate, BATCH_SIZE);
  for (const batch of batches) {
    const result = await provider.translateBatch({
      paragraphs: batch,
      settings,
      terminology,
      contextTerms: userTerms,
      extractedTerms: extractedTerms?.terms ?? [],
    });
    // 逐段返回结果...
  }
}
```

### 6. DirectAPIProvider 调整（修改 `direct-api.ts`）

`translateBatch` 方法适配新接口：

- 接收 `extractedTerms: string[]` 替代 `pageStrategy: string`
- 调用新的 `buildSystemPrompt` 签名

### 7. 类型变更（修改 `shared/types.ts`）

**新增：**

```typescript
interface ExtractedTerms {
  domain: string;
  terms: string[];
}

interface CachedTermEntry {
  domain: string;
  terms: string[];
  timestamp: number;
}
```

**修改：**

```typescript
// BatchTranslationRequest: 移除 pageStrategy，新增 extractedTerms
interface BatchTranslationRequest {
  paragraphs: Array<{ id: string; text: string }>;
  settings: UserSettings;
  terminology: TermEntry[];
  contextTerms: TermRecord[];
  extractedTerms: string[];        // 替换 pageStrategy
}
```

**移除：**

- `RetentionIntensity` 类型
- `UserSettings.intensity` 字段

### 8. 删除的模块

| 文件 | 原因 |
|------|------|
| `core/strategy.ts` | 被 `term-extractor.ts` 替代 |
| `core/strategy-cache.ts` | 被 `term-cache.ts` 替代 |

### 9. 新增的模块

| 文件 | 职责 |
|------|------|
| `core/term-extractor.ts` | LLM 术语抽取，返回结构化 JSON |
| `core/term-cache.ts` | `chrome.storage.local` 持久化缓存 |

## 数据流示例

**页面：** "Building a Web Server in Rust with Tokio"

**Step 1 — 术语抽取结果（缓存 24h）：**

```json
{
  "domain": "backend",
  "terms": ["Tokio", "runtime", "future", "executor", "async", "await"]
}
```

**Step 2 — 翻译输入（批次中的两个段落）：**

```
段落 1: "The runtime executes futures concurrently."
段落 2: "If you encounter an issue, restart the server."
```

**Step 3 — 模型判断 + 翻译输出：**

```
段落 1: "runtime 并发执行 futures。"
   → runtime/futures 在此是技术概念，保留

段落 2: "如果遇到问题，重启服务器。"
   → issue/server 在此是普通含义，翻译
```

## 选中文本翻译

选中文本翻译（`translateSingle`）也使用当前页面已缓存的术语列表（如果有的话）。流程：

1. 从缓存中查找当前 tab URL 对应的术语列表
2. 如果缓存存在，将术语列表注入翻译 prompt
3. 如果缓存不存在（用户未先触发全页翻译），按无术语列表处理

不为选中文本翻译单独触发术语抽取调用（避免延迟）。

## 不变的部分

- 页面上下文提取逻辑（`context-extractor.ts`）
- 上下文序列化（`context-serializer.ts`）
- 用户术语表存储和管理
- `TranslationOrchestrator`（content script 侧）
- 批量翻译的 `[SEP]` 分隔格式

## 关于 `intensity` 的移除

当前 `UserSettings` 中的 `intensity: 'conservative' | 'aggressive'` 是一个全局开关，控制术语保留的激进程度。在新方案中，术语保留由 LLM 抽取 + 逐句上下文判断决定，不再需要用户手动选择保留强度。

**影响：**
- Options 页面移除 intensity 选项
- `DEFAULT_SETTINGS` 中移除 `intensity` 字段
- 已存储的用户设置中的 `intensity` 字段被忽略（向后兼容，不需迁移）

## 风险与缓解

| 风险 | 缓解措施 |
|------|---------|
| LLM 术语抽取返回非法 JSON | JSON.parse 失败时 fallback 为空术语列表，翻译正常进行 |
| 术语抽取超时或 API 失败 | 失败时使用空列表继续翻译（graceful degradation） |
| 缓存数据占用过多 storage | 每次 set 时清理已过期条目 |
| 模型仍然过度保留英文 | prompt 中明确兜底规则："未被标记为术语的词默认翻译为中文" |
| 移除 intensity 影响已有用户偏好 | 新的逐句判断机制本质上提供了更精确的控制，无需全局开关 |
