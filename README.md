# HalfTrans

面向互联网从业者的 Chrome 翻译插件，将英文内容转化为"最小认知成本的中英混合表达"。

不是全翻译，而是保留专业术语原文，让用户用最低的切换成本理解内容。

## 核心功能

- **全文翻译** — 可视区域优先，逐段渐进式翻译，滚动时继续翻译新内容
- **选中翻译** — 选中文本后通过浮动按钮或右键菜单触发
- **术语保留** — 用户自定义术语表 + AI 自动判断，保持全文一致性
- **翻译风格** — 支持偏口语化 / 偏书面化
- **保留强度** — 保守（多保留英文）/ 激进（尽量翻译）
- **多模型支持** — 兼容任何 OpenAI API 格式的模型
- **快捷键** — `Ctrl+Shift+T`（Mac: `Cmd+Shift+T`）触发全文翻译

## 技术栈

- React 18 + TypeScript
- Vite + @crxjs/vite-plugin（Chrome Extension 构建）
- Tailwind CSS
- Vitest（测试）
- Chrome Extension Manifest V3

## 开发

```bash
# 安装依赖
npm install

# 启动开发模式
npm run dev

# 构建生产版本
npm run build

# 运行测试
npm run test
```

## 安装使用

1. 运行 `npm run build` 构建插件
2. 打开 Chrome，进入 `chrome://extensions/`
3. 开启「开发者模式」
4. 点击「加载已解压的扩展程序」，选择 `dist` 目录
5. 在插件设置页面配置 API 地址和密钥

## 项目结构

```
src/
├── background/      # Service Worker（后台脚本）
├── content/         # Content Script（页面注入）
│   ├── detector.ts      # 段落检测
│   ├── context-builder.ts # 上下文构建
│   ├── renderer.ts      # 翻译结果渲染
│   ├── translator.ts    # 翻译调度
│   ├── floating-btn.ts  # 浮动翻译按钮
│   └── selection-popup.ts # 选中翻译弹窗
├── core/            # 核心逻辑
│   ├── provider.ts      # API 调用
│   ├── direct-api.ts    # 直连 API
│   ├── prompt.ts        # Prompt 构建
│   └── strong-terms.ts  # 术语管理
├── popup/           # 弹出窗口 UI
├── options/         # 设置页面 UI
└── shared/          # 共享模块（类型、存储、消息）
```

## 目标用户

互联网从业者 — 开发、产品、设计、运营等需要频繁阅读英文技术内容的人。

## License

MIT
