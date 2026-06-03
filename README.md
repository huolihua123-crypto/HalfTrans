# HalfTrans

面向互联网从业者的 Chrome 翻译插件，将英文内容转化为"最小认知成本的中英混合表达"。

> 基于 AI 大语言模型驱动翻译，非传统机器翻译。需自行配置 API Key（支持 OpenAI、DeepSeek 等任何兼容接口）。

---

## 为什么做这个插件？

作为互联网从业者，我们每天都在阅读英文技术文档、博客、GitHub Issue。但现有翻译工具总让人不满意：

- **全翻译**（Google 翻译、有道等）：专业术语被强行翻译，读起来反而更累
  - "事件循环负责处理异步回调" — 你得在脑中把"事件循环"翻译回 event loop 才能理解
- **不翻译**：整段英文读下来，认知负荷大，效率低
- **沉浸式翻译**：双语对照占版面，且术语处理不够智能

实际上，互联网从业者日常沟通就是中英混合的：

> "这个 bug 是 race condition 导致的，在 event loop 的 next tick 才 resolve"

HalfTrans 就是把这种最自然的阅读方式带到翻译中 — 不是全翻译，而是保留你已经熟悉的专业术语原文，只翻译连接性文字，让阅读英文内容像读中文一样轻松。

## 翻译效果对比

原文：
> The event loop is responsible for handling asynchronous callbacks in Node.js runtime.

| 翻译方式 | 结果 |
|----------|------|
| Google 翻译 | 事件循环负责处理 Node.js 运行时中的异步回调。 |
| **HalfTrans** | **event loop 负责处理 Node.js runtime 中的 asynchronous callbacks。** |

HalfTrans 保留了你已经熟悉的术语原文，只翻译连接性文字，降低认知切换成本。

## 核心功能

- **全文翻译** — 可视区域优先，逐段渐进式翻译，滚动时自动继续
- **选中翻译** — 选中文本后通过浮动按钮或右键菜单触发
- **术语保留** — 用户自定义术语表 + AI 自动判断，全文保持一致
- **翻译风格** — 偏口语化 / 偏书面化，自由切换
- **保留强度** — 保守（多保留英文）/ 激进（尽量翻译）
- **多模型支持** — 兼容任何 OpenAI API 格式的模型（OpenAI、DeepSeek、本地模型等）
- **快捷键** — `Ctrl+Shift+T`（Mac: `Cmd+Shift+T`）一键翻译当前页面

## 安装使用

### 从源码构建

```bash
# 克隆仓库
git clone https://github.com/your-username/HalfTrans.git
cd HalfTrans

# 安装依赖
npm install

# 构建生产版本
npm run build
```

### 加载到 Chrome

1. 打开 Chrome，进入 `chrome://extensions/`
2. 开启右上角「开发者模式」
3. 点击「加载已解压的扩展程序」，选择项目 `dist` 目录

### 配置

首次使用需在插件设置页配置：

- **API 地址** — 支持任何 OpenAI 兼容接口（OpenAI、DeepSeek、本地 Ollama 等）
- **API Key** — 你自己的密钥
- **模型名称** — 如 `gpt-4o`、`deepseek-chat` 等

## 开发

```bash
# 启动开发模式（热更新）
npm run dev

# 构建生产版本
npm run build

# 运行测试
npm run test
```

### 技术栈

- React 18 + TypeScript
- Vite + @crxjs/vite-plugin（Chrome Extension 构建）
- Tailwind CSS
- Vitest（测试）
- Chrome Extension Manifest V3

### 项目结构

```
src/
├── background/        # Service Worker（后台脚本）
├── content/           # Content Script（页面注入）
│   ├── detector.ts        # 视口段落检测
│   ├── renderer.ts        # 翻译结果渲染
│   ├── translator.ts      # 翻译调度
│   ├── floating-btn.ts    # 选中文本浮动按钮
│   └── selection-popup.ts # 选中翻译弹窗
├── core/              # 核心翻译逻辑
│   ├── provider.ts        # TranslationProvider 接口
│   ├── direct-api.ts      # 直连 API 实现
│   ├── prompt.ts          # Prompt 构建
│   └── strong-terms.ts    # 术语管理
├── popup/             # 弹出窗口 UI
├── options/           # 设置页面 UI
└── shared/            # 共享模块（类型、存储、消息通信）
```

## 后续规划

- 支持更多语言（英译日、英译韩等）
- 行业术语库（金融、医疗、法律等）
- 付费托管服务（免配 API Key，开箱即用）

## License

MIT
