# 代码注释与架构文档设计

## 目标

为 HalfTrans 项目添加全中文注释，方便个人日后维护时快速回忆代码逻辑。同时编写一份架构概览文档，描述模块间关系和关键设计决策。

## 范围

- 所有 `src/` 下的 TypeScript 源文件（约 10 个核心文件 + 若干辅助文件）
- 新增 `docs/architecture.md` 架构概览文档

## 注释规范

### 文件头注释

每个 `.ts` 文件顶部（import 语句之前）添加块注释：

```ts
/**
 * [模块名称，2-4 字]
 * [一句话说明职责]
 * [在系统中的位置/被谁调用/调用谁]
 */
```

### 导出函数注释

每个 `export` 函数上方一行简述：

```ts
/** 检测当前视口内所有未翻译的纯英文段落，返回其 ID、文本和 DOM 元素 */
export function detectVisibleParagraphs(): ...
```

- 私有函数仅在逻辑不直观时添加注释
- 不使用 JSDoc `@param` / `@returns` 标签（TypeScript 类型已足够）

### 关键逻辑行内注释

用 `//` 注释解释以下类型的代码：

| 类型 | 示例 |
|------|------|
| 正则表达式 | `isFullyEnglish` 中 CJK Unicode 范围的含义 |
| Fallback/降级逻辑 | `parseBatchResponse` 先 [SEP] 分割，失败后双换行分割的原因 |
| 魔法数字/常量 | `MAX_SURROUNDING = 2` 表示前后各取 2 段上下文 |
| 非直觉过滤条件 | TreeWalker 为什么排除已翻译节点和嵌套段落元素 |
| 并发控制 | `BATCH_SIZE=12` 和 `MAX_CONCURRENT=3` 的协作关系 |
| 缓存策略 | `cachedPageContext` 为什么存在、何时失效 |

### 语言

全部使用中文。

### 原则

- 简洁：文件头不超过 3 行，函数注释不超过 1-2 行
- 解释"为什么"而不是"做了什么"（代码本身已说明 what）
- 不重复类型信息（TypeScript 已标注）
- 行内注释紧贴目标代码，不另起段落

## 架构概览文档 (`docs/architecture.md`)

### 内容结构

1. **核心理念** — 一句话：半翻译 = 保留技术术语英文 + 翻译普通文字为中文
2. **数据流** — 从用户触发到 DOM 注入的完整链路（文字 + ASCII 流程图）
3. **模块职责表** — 每个模块一行：文件路径 | 职责 | 输入/输出
4. **关键设计决策** — 解释重要的 why：
   - 批量翻译 + [SEP] 分隔（减少 API 调用次数）
   - Fallback 到单条翻译（batch 解析失败时的降级保障）
   - TreeWalker 而非 innerText（避免取到已注入的翻译结果文本）
   - pageContext 缓存（同页面上下文不变，避免重复 DOM 查询）
   - 并发控制策略（BATCH_SIZE × MAX_CONCURRENT 的吞吐平衡）
5. **消息协议** — 5 种 MessageType 的含义及流向（content ↔ background）

### 约束

- 总量 200 行以内
- 不重复代码中的实现细节
- 用 ASCII 流程图，不依赖外部渲染工具

## 需要添加注释的文件清单

| 文件 | 注释重点 |
|------|----------|
| `src/content/index.ts` | 入口协调流程、滚动节流、mutation 监听策略 |
| `src/content/detector.ts` | 选择器策略、TreeWalker 过滤逻辑、视口判断、英文检测正则 |
| `src/content/renderer.ts` | DOM 注入方式、状态属性系统 (`data-halftrans-*`) |
| `src/content/translator.ts` | 编排逻辑、选区翻译 vs 页面翻译的分流、跳过相同翻译 |
| `src/content/context-builder.ts` | 上下文收集策略、缓存机制、前后文/代码块的查找范围 |
| `src/content/floating-btn.ts` | 悬浮按钮交互 |
| `src/content/selection-popup.ts` | 选区弹窗逻辑 |
| `src/background/index.ts` | 批量调度、并发控制、错误广播 |
| `src/core/direct-api.ts` | API 请求构造、batch 响应解析与 fallback |
| `src/core/prompt.ts` | prompt 结构设计、术语优先级、上下文注入格式 |
| `src/core/strong-terms.ts` | 强保留术语表的维护逻辑 |
| `src/shared/types.ts` | 核心类型定义（类型本身即文档，仅需极少注释） |
| `src/shared/storage.ts` | Chrome storage 封装 |
| `src/shared/messaging.ts` | 消息通信封装 |

## 不在范围内

- 不修改任何业务逻辑
- 不重构代码结构
- 不添加 JSDoc `@param` / `@returns` 等标签
- 不为 UI 组件（popup/options）添加注释（非核心逻辑，代码简单）
