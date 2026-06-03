# 代码注释与架构文档 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为 HalfTrans 项目全部核心源文件添加中文注释（文件头 + 函数级 + 关键逻辑行内），并编写架构概览文档。

**Architecture:** 纯文档/注释任务，不修改任何业务逻辑。按模块分层执行：先 shared 层 → core 层 → content 层 → background 层，最后编写架构文档。每完成一层提交一次。

**Tech Stack:** TypeScript, Chrome Extension API

---

## File Structure

本任务不创建新源文件，仅修改现有文件并新增一份文档：

| 操作 | 文件 | 说明 |
|------|------|------|
| Modify | `src/shared/types.ts` | 文件头注释 |
| Modify | `src/shared/storage.ts` | 文件头 + 函数注释 |
| Modify | `src/shared/messaging.ts` | 文件头 + 函数注释 |
| Modify | `src/core/provider.ts` | 文件头注释 |
| Modify | `src/core/strong-terms.ts` | 文件头 + 函数注释 |
| Modify | `src/core/prompt.ts` | 文件头 + 函数注释 + 关键逻辑注释 |
| Modify | `src/core/direct-api.ts` | 文件头 + 函数注释 + 关键逻辑注释 |
| Modify | `src/content/detector.ts` | 文件头 + 函数注释 + 关键逻辑注释 |
| Modify | `src/content/context-builder.ts` | 文件头 + 函数注释 + 关键逻辑注释 |
| Modify | `src/content/renderer.ts` | 文件头 + 函数注释 + 关键逻辑注释 |
| Modify | `src/content/translator.ts` | 文件头 + 函数注释 + 关键逻辑注释 |
| Modify | `src/content/index.ts` | 文件头 + 关键逻辑注释 |
| Modify | `src/content/floating-btn.ts` | 文件头 + 函数注释 |
| Modify | `src/content/selection-popup.ts` | 文件头 + 函数注释 |
| Modify | `src/background/index.ts` | 文件头 + 函数注释 + 关键逻辑注释 |
| Create | `docs/architecture.md` | 架构概览文档 |

---

### Task 1: shared 层注释

**Files:**
- Modify: `halftrans/src/shared/types.ts`
- Modify: `halftrans/src/shared/storage.ts`
- Modify: `halftrans/src/shared/messaging.ts`

- [ ] **Step 1: 为 `types.ts` 添加文件头注释**

在文件第 1 行之前插入：

```ts
/**
 * 核心类型定义
 * 定义翻译请求/响应、用户设置、消息协议等全局共享类型
 * 被所有模块引用，是系统的类型契约层
 */
```

- [ ] **Step 2: 为 `storage.ts` 添加注释**

在文件第 1 行之前插入文件头：

```ts
/**
 * Chrome Storage 封装
 * 提供用户设置和术语表的持久化读写
 * 被 background 和 options 页面调用
 */
```

在每个导出函数上方添加：

```ts
/** 从 chrome.storage.sync 读取用户设置，无数据时返回默认值 */
export async function getSettings(): Promise<UserSettings> {

/** 将用户设置写入 chrome.storage.sync */
export async function saveSettings(settings: UserSettings): Promise<void> {

/** 从 chrome.storage.sync 读取用户术语表 */
export async function getTerminology(): Promise<TermEntry[]> {

/** 将用户术语表写入 chrome.storage.sync */
export async function saveTerminology(terms: TermEntry[]): Promise<void> {
```

- [ ] **Step 3: 为 `messaging.ts` 添加注释**

在文件第 1 行之前插入文件头：

```ts
/**
 * 消息通信封装
 * 封装 chrome.runtime 消息 API，提供类型安全的发送和监听接口
 * content script 用 sendToBackground 发消息，background 用 sendToTab 回传结果
 */
```

在每个导出函数上方添加：

```ts
/** 从 content script 向 background service worker 发送消息 */
export async function sendToBackground(message: MessageType): Promise<void> {

/** 从 background 向指定 tab 的 content script 发送消息 */
export async function sendToTab(tabId: number, message: MessageType): Promise<void> {

/** 注册消息监听器，content script 和 background 各自调用以处理不同消息类型 */
export function onMessage(handler: MessageHandler): void {
```

- [ ] **Step 4: 运行 TypeScript 编译验证无语法错误**

Run: `cd halftrans && npx tsc --noEmit`
Expected: 无报错输出

- [ ] **Step 5: 提交**

```bash
git add halftrans/src/shared/
git commit -m "docs: 为 shared 层添加中文注释"
```

---

### Task 2: core 层注释

**Files:**
- Modify: `halftrans/src/core/provider.ts`
- Modify: `halftrans/src/core/strong-terms.ts`
- Modify: `halftrans/src/core/prompt.ts`
- Modify: `halftrans/src/core/direct-api.ts`

- [ ] **Step 1: 为 `provider.ts` 添加文件头注释**

```ts
/**
 * 翻译提供者接口
 * 定义翻译服务的统一契约，当前唯一实现为 DirectAPIProvider
 */
```

- [ ] **Step 2: 为 `strong-terms.ts` 添加注释**

文件头：

```ts
/**
 * 强保留术语表
 * 维护一份在技术语境中通常不翻译的英文术语列表
 * 被 prompt.ts 引用，作为 system prompt 的一部分发送给 LLM
 */
```

函数注释：

```ts
/** 将术语列表拼接为逗号分隔的字符串，用于嵌入 system prompt */
export function getStrongTermsList(): string {
```

- [ ] **Step 3: 为 `prompt.ts` 添加注释**

文件头：

```ts
/**
 * Prompt 构建器
 * 构造发送给 LLM 的 system prompt 和 user prompt
 * 核心设计：system prompt 定义翻译规则和术语，user prompt 用 XML 标签分隔上下文和待翻译文本
 */
```

函数注释和关键逻辑：

```ts
/** 构建 system prompt：包含翻译硬规则、强保留术语、用户词库、风格指令和输出格式 */
export function buildSystemPrompt(
  style: TranslationStyle,
  keepTerms: string[],
  translateTerms: string[]
): string {
  const styleText = style === 'colloquial'
    ? '口语化，自然流畅，像同事之间交流'
    : '书面化，正式专业，适合文档阅读';

  const strongTerms = getStrongTermsList();

  // 用户词库优先级高于强保留术语表，单独成段以示强调
  let userDict = '';
```

```ts
/** 构建单条翻译的 user prompt：用 <context> 包裹上下文，<translate> 包裹待翻译文本 */
export function buildUserPrompt(text: string, context: TranslationContext): string {
```

```ts
/** 构建批量翻译的 user prompt：多段文本用 [SEP] 分隔，共享同一份上下文 */
export function buildBatchUserPrompt(texts: string[], context: TranslationContext): string {
```

- [ ] **Step 4: 为 `direct-api.ts` 添加注释**

文件头：

```ts
/**
 * 直连 API 翻译提供者
 * 通过 OpenAI 兼容的 /chat/completions 接口调用 LLM 完成翻译
 * 支持单条翻译和批量翻译，批量翻译失败时自动降级为逐条翻译
 */
```

函数注释和关键逻辑：

```ts
  /** 单条翻译：构造 prompt → 调用 API → 返回翻译结果 */
  async translate(request: TranslationRequest): Promise<TranslationResult> {
```

```ts
  /** 批量翻译：将多段文本合并为一次 API 调用，解析失败时降级为逐条翻译 */
  async translateBatch(request: BatchTranslationRequest): Promise<BatchTranslationResult> {
```

在 `parseBatchResponse` 方法内添加行内注释：

```ts
  /**
   * 解析批量翻译响应：尝试按 [SEP] 分割，数量不匹配时 fallback 到双换行分割
   * 两种策略都失败则返回空数组，触发调用方降级为逐条翻译
   */
  private parseBatchResponse(content: string, expectedCount: number): string[] {
    // 优先策略：按 [SEP] 标记分割（prompt 中要求 LLM 用此标记分隔各段翻译）
    const parts = content.split(/\[SEP\]/i).map((s) => s.trim()).filter((s) => s.length > 0);
    if (parts.length === expectedCount) {
      return parts;
    }
    // 降级策略：部分 LLM 会忽略 [SEP] 指令，改用双换行分隔段落
    const byNewlines = content.split(/\n{2,}/).map((s) => s.trim()).filter((s) => s.length > 0);
    if (byNewlines.length === expectedCount) {
      return byNewlines;
    }
    // 两种策略都无法正确分割，返回空数组让调用方降级为逐条翻译
    return [];
  }
```

在 `translateBatch` 中 fallback 逻辑处添加行内注释：

```ts
    // 批量解析成功：将结果按顺序映射回各段落
    if (parsed.length === paragraphs.length) {
      return {
        results: paragraphs.map((p, i) => ({
          paragraphId: p.id,
          original: p.text,
          translated: parsed[i],
        })),
      };
    }

    // 批量解析失败：降级为逐条翻译，牺牲性能换取正确性
    const results = await Promise.all(
```

- [ ] **Step 5: 运行 TypeScript 编译验证无语法错误**

Run: `cd halftrans && npx tsc --noEmit`
Expected: 无报错输出

- [ ] **Step 6: 提交**

```bash
git add halftrans/src/core/
git commit -m "docs: 为 core 层添加中文注释"
```

---

### Task 3: content 层注释 — detector 和 context-builder

**Files:**
- Modify: `halftrans/src/content/detector.ts`
- Modify: `halftrans/src/content/context-builder.ts`

- [ ] **Step 1: 为 `detector.ts` 添加注释**

文件头：

```ts
/**
 * 段落检测器
 * 扫描当前视口中可见的、未翻译的纯英文段落
 * 同时提供 MutationObserver 监听 DOM 变化以发现新增段落
 */
```

常量注释：

```ts
// 目标翻译元素的 CSS 选择器：段落、标题、列表项、表格单元格、引用、图注
const TRANSLATABLE_SELECTORS = 'p, h1, h2, h3, h4, h5, h6, li, td, th, blockquote, figcaption';
// 自定义属性：标记元素的唯一 ID
const ATTR_ID = 'data-halftrans-id';
// 自定义属性：标记元素已被处理（值为 'done' 或 'error'）
const ATTR_DONE = 'data-halftrans';
```

函数注释：

```ts
/** 为元素分配或获取已有的 halftrans ID */
function getOrAssignId(el: Element): string {

/** 检测当前视口内所有未翻译的纯英文段落，返回其 ID、文本和 DOM 元素 */
export function detectVisibleParagraphs(): Array<{ id: string; text: string; element: Element }> {
```

`getOwnText` 关键逻辑：

```ts
/**
 * 提取元素自身的文本内容（排除子翻译结果和嵌套段落）
 * 使用 TreeWalker 而非 innerText，因为 innerText 会包含已注入的翻译文本
 */
function getOwnText(el: Element): string {
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      const parent = node.parentElement;
      if (!parent) return NodeFilter.FILTER_REJECT;
      // 排除已注入的翻译结果和加载指示器
      if (parent.hasAttribute('data-halftrans-result') || parent.hasAttribute('data-halftrans-loading')) {
        return NodeFilter.FILTER_REJECT;
      }
      // 排除嵌套的可翻译元素（它们会被单独处理）
      if (parent !== el && parent.matches(TRANSLATABLE_SELECTORS)) {
        return NodeFilter.FILTER_REJECT;
      }
      return NodeFilter.FILTER_ACCEPT;
    },
  });
```

`isFullyEnglish` 关键逻辑：

```ts
/** 判断文本是否为纯英文（不含中日韩字符），含 CJK 字符的段落跳过不翻译 */
function isFullyEnglish(text: string): boolean {
  const letters = text.replace(/\s/g, '');
  if (letters.length === 0) return false;
  // 匹配 CJK 统一汉字基本区 (U+4E00-9FFF) 和扩展 A 区 (U+3400-4DBF)
  return !/[一-鿿㐀-䶿]/.test(text);
}
```

```ts
/** 监听 DOM 变化（新增节点、文本变化、属性变化），触发回调重新检测段落 */
export function observeNewParagraphs(callback: () => void): MutationObserver {
```

- [ ] **Step 2: 为 `context-builder.ts` 添加注释**

文件头：

```ts
/**
 * 翻译上下文构建器
 * 收集页面标题、章节标题、前后文段落、邻近代码块等上下文信息
 * 这些上下文帮助 LLM 理解语境，提高翻译准确性（尤其是多义词和术语判断）
 */
```

常量注释：

```ts
const MAX_HEADINGS = 8;       // 页面级上下文最多收集的标题数
const MAX_SURROUNDING = 2;    // 前后文各取的段落数
const MAX_CODE_LENGTH = 300;  // 邻近代码块截取的最大字符数
const MAX_PARAGRAPH_LENGTH = 200; // 单段前后文截取的最大字符数
```

函数注释：

```ts
/** 收集页面级上下文：标题 + 前几个 h1/h2/h3 组成的导航路径。结果被缓存，同页面只查询一次 */
export function collectPageContext(): string {

/** 清除页面上下文缓存（整页翻译开始时调用，因为用户可能在 SPA 中导航到新页面） */
export function resetPageContextCache(): void {

/** 收集单个段落的局部上下文：所属章节标题、前后文段落、邻近代码块 */
export function collectParagraphContext(element: Element): Omit<TranslationContext, 'pageContext'> {

/** 构建单个元素的完整翻译上下文（页面级 + 段落级） */
export function buildFullContext(element: Element): TranslationContext {

/** 构建批量翻译的共享上下文：取首元素的章节标题，首尾元素范围内的前后文 */
export function buildBatchContext(elements: Element[]): TranslationContext {
```

关键私有函数注释：

```ts
/** 获取元素的纯文本（移除已注入的翻译结果节点后再取 textContent） */
function getCleanText(el: Element): string {

/** 向上查找最近的 h1-h3 标题作为章节上下文 */
function findSectionHeading(element: Element): string {

/** 查找目标元素前后各 MAX_SURROUNDING 段的文本作为语境 */
function findSurroundingText(element: Element): string {

/** 查找目标元素附近的 <pre> 代码块（向上找 5 个兄弟，向下找 3 个兄弟） */
function findNearestCode(element: Element): string {
```

- [ ] **Step 3: 运行 TypeScript 编译验证无语法错误**

Run: `cd halftrans && npx tsc --noEmit`
Expected: 无报错输出

- [ ] **Step 4: 提交**

```bash
git add halftrans/src/content/detector.ts halftrans/src/content/context-builder.ts
git commit -m "docs: 为 detector 和 context-builder 添加中文注释"
```

---

### Task 4: content 层注释 — renderer、translator、index

**Files:**
- Modify: `halftrans/src/content/renderer.ts`
- Modify: `halftrans/src/content/translator.ts`
- Modify: `halftrans/src/content/index.ts`

- [ ] **Step 1: 为 `renderer.ts` 添加注释**

文件头：

```ts
/**
 * 翻译结果渲染器
 * 负责将翻译结果注入 DOM、显示加载状态和错误状态
 * 通过 data-halftrans-* 属性系统管理元素状态，避免重复渲染
 */
```

函数注释：

```ts
/** 将翻译结果注入到原始段落下方，如已存在则更新文本内容 */
export function renderTranslation(paragraphId: string, translatedText: string): void {

/** 在段落末尾显示"翻译中..."加载指示器 */
export function renderLoading(paragraphId: string): void {

/** 显示翻译错误信息和重试按钮 */
export function renderError(paragraphId: string, error: string): void {

/** 移除指定段落的翻译结果，恢复原始状态 */
export function removeTranslation(paragraphId: string): void {

/** 切换所有翻译结果的显示/隐藏状态，返回是否有结果被处理 */
export function toggleAllTranslations(): boolean {

/** 标记段落为已处理但不显示翻译（翻译结果与原文相同时使用） */
export function markSkipped(paragraphId: string): void {
```

- [ ] **Step 2: 为 `translator.ts` 添加注释**

文件头：

```ts
/**
 * 翻译编排器
 * 协调翻译请求的发送和结果处理，管理待处理队列
 * 区分两种翻译模式：页面批量翻译（translateParagraphs）和选区翻译（translateSelection）
 */
```

关键逻辑注释：

```ts
export class TranslationOrchestrator {
  // 待处理队列：paragraphId → 原始文本，用于去重和结果比对
  private pending = new Map<string, string>();
  // 选区翻译的 ID 集合，用于区分结果回调时走弹窗还是 DOM 注入
  private selectionIds = new Set<string>();
  private selectionCounter = 0;

  /** 批量翻译页面段落：去重 → 显示加载态 → 收集上下文 → 发送至 background */
  translateParagraphs(paragraphs: Array<{ id: string; text: string; element: Element }>): void {
    // 过滤已在队列中的段落，避免重复请求
    const newParagraphs = paragraphs.filter((p) => !this.pending.has(p.id));
```

```ts
  /** 选区翻译：生成临时 ID，收集页面上下文后发送，结果通过弹窗展示 */
  translateSelection(text: string): void {
```

```ts
  /** 处理翻译结果：选区翻译走弹窗，页面翻译走 DOM 注入；翻译结果与原文相同时标记跳过 */
  handleResult(paragraphId: string, translated: string): void {
    // 选区翻译和右键菜单翻译（ctx- 前缀）的结果通过弹窗展示
    if (this.selectionIds.has(paragraphId) || paragraphId.startsWith('ctx-')) {
```

```ts
    // 翻译结果与原文相同说明该段无需翻译（如纯代码段），标记跳过
    if (!translated || translated.trim() === original.trim()) {
```

- [ ] **Step 3: 为 `index.ts` 添加注释**

文件头：

```ts
/**
 * Content Script 入口
 * 协调检测→翻译→渲染的主流程，处理用户触发和自动发现
 * 监听 background 消息（翻译结果/错误/触发指令）并分发给对应模块
 */
```

关键逻辑注释：

```ts
let pageTranslateActive = false;  // 是否已激活整页翻译
let translationsVisible = false;  // 翻译结果当前是否可见（用于 toggle）

/** 扫描视口内段落并送入翻译队列 */
function translateVisibleParagraphs(): void {

/** 处理整页翻译触发：首次调用启动翻译，再次调用切换显示/隐藏 */
function handlePageTranslate(): void {
  if (pageTranslateActive) {
    // 已激活时再次触发 = 切换翻译结果的可见性
    translationsVisible = !translationsVisible;
```

```ts
// 初始化选区翻译浮动按钮
initFloatingButton((text) => {

// 监听 DOM 变化，整页翻译激活时自动翻译新出现的段落（节流 150ms）
let mutationTimeout: ReturnType<typeof setTimeout>;
observeNewParagraphs(() => {
```

```ts
  // 滚动时延迟 200ms 后检测新进入视口的段落（节流，避免滚动期间频繁触发）
  let scrollTimeout: ReturnType<typeof setTimeout>;
  window.addEventListener('scroll', () => {
    if (!translationsVisible) return;
    clearTimeout(scrollTimeout);
    scrollTimeout = setTimeout(translateVisibleParagraphs, 200);
  });
```

- [ ] **Step 4: 运行 TypeScript 编译验证无语法错误**

Run: `cd halftrans && npx tsc --noEmit`
Expected: 无报错输出

- [ ] **Step 5: 提交**

```bash
git add halftrans/src/content/renderer.ts halftrans/src/content/translator.ts halftrans/src/content/index.ts
git commit -m "docs: 为 renderer、translator、content/index 添加中文注释"
```

---

### Task 5: content 层注释 — floating-btn 和 selection-popup

**Files:**
- Modify: `halftrans/src/content/floating-btn.ts`
- Modify: `halftrans/src/content/selection-popup.ts`

- [ ] **Step 1: 为 `floating-btn.ts` 添加注释**

文件头：

```ts
/**
 * 选区翻译浮动按钮
 * 当用户选中文本时，在选区上方显示一个"译"按钮
 * 点击后触发选区翻译，结果通过 selection-popup 展示
 */
```

函数注释：

```ts
/** 初始化浮动按钮：注册 selectionchange 监听器 */
export function initFloatingButton(onTranslate: (text: string) => void): void {

/** 销毁浮动按钮：移除监听器和 DOM 元素 */
export function destroyFloatingButton(): void {

/** 选区变化时判断是否显示按钮（无选中文本则移除） */
function handleSelectionChange(): void {

/** 在选区上方创建并定位浮动按钮 */
function showButton(selection: Selection): void {
```

在 `showButton` 中 z-index 处：

```ts
    // z-index 设为最大值确保按钮不被页面任何元素遮挡
    z-index: 2147483647;
```

mousedown 事件处：

```ts
  // 使用 mousedown 而非 click，因为 click 会导致选区先消失再触发事件
  floatBtn.addEventListener('mousedown', (e) => {
    e.preventDefault();   // 阻止默认行为以保持选区
    e.stopPropagation();  // 阻止冒泡避免触发页面其他监听
```

- [ ] **Step 2: 为 `selection-popup.ts` 添加注释**

文件头：

```ts
/**
 * 选区翻译结果弹窗
 * 在选区附近显示翻译结果，支持点击外部关闭
 * 当无法获取选区位置时（如右键菜单翻译），退化为屏幕居中展示
 */
```

函数注释：

```ts
/** 在选区下方显示翻译结果弹窗，无选区时居中显示 */
export function showSelectionPopup(text: string): void {

/** 无法定位选区时的退化方案：在屏幕正中显示弹窗 */
function showAtCenter(text: string): void {

/** 点击弹窗外部时关闭弹窗 */
function handleOutsideClick(e: MouseEvent): void {

/** 移除弹窗并清理事件监听 */
function removeSelectionPopup(): void {
```

在定位逻辑处：

```ts
  // 弹窗默认显示在选区正下方，超出视口底部时翻转到选区上方
  let top = rect.bottom + 6;
  let left = rect.left + rect.width / 2 - popupRect.width / 2;

  if (top + popupRect.height > window.innerHeight) {
    top = rect.top - popupRect.height - 6;
  }
  // 确保弹窗不超出视口左右边界
  if (left < 4) left = 4;
  if (left + popupRect.width > window.innerWidth - 4) {
    left = window.innerWidth - popupRect.width - 4;
  }
```

- [ ] **Step 3: 运行 TypeScript 编译验证无语法错误**

Run: `cd halftrans && npx tsc --noEmit`
Expected: 无报错输出

- [ ] **Step 4: 提交**

```bash
git add halftrans/src/content/floating-btn.ts halftrans/src/content/selection-popup.ts
git commit -m "docs: 为 floating-btn 和 selection-popup 添加中文注释"
```

---

### Task 6: background 层注释

**Files:**
- Modify: `halftrans/src/background/index.ts`

- [ ] **Step 1: 为 `background/index.ts` 添加注释**

文件头：

```ts
/**
 * Background Service Worker
 * Chrome 扩展的后台入口，负责：
 * 1. 注册右键菜单和快捷键
 * 2. 接收 content script 的翻译请求
 * 3. 批量调度 API 调用（分批 + 并发控制）
 * 4. 将翻译结果/错误回传给 content script
 */
```

常量注释：

```ts
// 每批发送给 API 的段落数（平衡单次请求大小和 token 限制）
const BATCH_SIZE = 12;
// 同时并发的批次数（避免触发 API 速率限制）
const MAX_CONCURRENT = 3;
```

函数注释：

```ts
/** 通用数组分块工具：将数组按指定大小切分为二维数组 */
function chunk<T>(arr: T[], size: number): T[][] {

/** 从用户术语表中分离"保留英文"和"强制翻译"两类术语 */
async function getUserTerms(): Promise<{ keepTerms: string[]; translateTerms: string[] }> {
```

`translateBatch` 注释：

```ts
/**
 * 批量翻译调度：将段落分批（BATCH_SIZE）后按并发限制（MAX_CONCURRENT）发送
 * 采用滑动窗口并发：每次最多 MAX_CONCURRENT 个批次同时请求，全部完成后处理下一组
 */
async function translateBatch(
  tabId: number,
  paragraphs: Array<{ id: string; text: string }>,
  context: TranslationContext
): Promise<void> {
```

在并发处理处：

```ts
    // 滑动窗口并发：按 MAX_CONCURRENT 分组，组内并行，组间串行
    for (let i = 0; i < batches.length; i += MAX_CONCURRENT) {
      const concurrentBatches = batches.slice(i, i + MAX_CONCURRENT);
      await Promise.all(concurrentBatches.map(processBatch));
    }
```

```ts
/** 单条翻译：用于选区翻译和右键菜单翻译 */
async function translateSingle(
```

- [ ] **Step 2: 运行 TypeScript 编译验证无语法错误**

Run: `cd halftrans && npx tsc --noEmit`
Expected: 无报错输出

- [ ] **Step 3: 提交**

```bash
git add halftrans/src/background/
git commit -m "docs: 为 background 层添加中文注释"
```

---

### Task 7: 编写架构概览文档

**Files:**
- Create: `docs/architecture.md`

- [ ] **Step 1: 编写 `docs/architecture.md`**

```markdown
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
```

- [ ] **Step 2: 提交**

```bash
git add docs/architecture.md
git commit -m "docs: 添加架构概览文档"
```

---

### Task 8: 最终验证

- [ ] **Step 1: 全量 TypeScript 编译验证**

Run: `cd halftrans && npx tsc --noEmit`
Expected: 无报错

- [ ] **Step 2: 运行测试确认无回归**

Run: `cd halftrans && npx vitest run`
Expected: 所有测试通过

- [ ] **Step 3: 浏览确认注释效果**

打开任意核心文件确认：
- 文件头注释存在且格式正确
- 导出函数上方有注释
- 关键逻辑处有行内注释
- 注释全部为中文
- 无遗漏文件
