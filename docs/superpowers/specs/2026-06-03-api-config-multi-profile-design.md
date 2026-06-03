# API 多配置管理设计文档

## 概述

在插件设置页的 API 配置区域增加预设示例和多配置切换能力，让用户可以保存多套 API 配置并快捷切换。

## 需求

1. 支持保存多套 API 配置（名称、Base URL、API Key、模型）
2. 提供预设模板快捷创建配置（OpenAI、DeepSeek、Claude 中转、Ollama）
3. 输入框下方显示示例提示文字
4. 设置页通过下拉选择器管理和切换配置
5. Popup 面板支持快捷切换当前使用的 API 配置
6. 不做旧数据迁移，用户需重新配置

## 数据结构

### 新增 `ApiConfig` 类型

```ts
interface ApiConfig {
  id: string;       // crypto.randomUUID()
  name: string;     // 用户可编辑的配置名，如 "OpenAI"、"我的DeepSeek"
  baseUrl: string;
  apiKey: string;
  model: string;
}
```

### 修改 `UserSettings`

```ts
interface UserSettings {
  apiConfigs: ApiConfig[];   // 替代原来的 apiBaseUrl/apiKey/model
  activeConfigId: string;    // 当前使用的配置 ID
  style: TranslationStyle;
  shortcut: string;
}
```

### 预设模板常量

```ts
const API_PRESETS: Omit<ApiConfig, 'id' | 'apiKey'>[] = [
  { name: 'OpenAI', baseUrl: 'https://api.openai.com/v1', model: 'gpt-4o-mini' },
  { name: 'DeepSeek', baseUrl: 'https://api.deepseek.com/v1', model: 'deepseek-chat' },
  { name: 'Claude (中转)', baseUrl: 'https://api.openrouter.ai/api/v1', model: 'anthropic/claude-3.5-sonnet' },
  { name: 'Ollama (本地)', baseUrl: 'http://localhost:11434/v1', model: 'qwen2.5' },
];
```

### DEFAULT_SETTINGS

```ts
const DEFAULT_SETTINGS: UserSettings = {
  apiConfigs: [],
  activeConfigId: '',
  style: 'colloquial',
  shortcut: 'Ctrl+Shift+T',
};
```

## 设置页 UI

### 布局

```
┌─────────────────────────────────────────┐
│  API 配置                                │
├─────────────────────────────────────────┤
│  当前配置: [ ▼ OpenAI        ] [+ 新增] [🗑 删除] │
├─────────────────────────────────────────┤
│  配置名称:  [OpenAI________________]     │
│  API Base URL: [https://api.openai.com/v1]│
│    💡 示例：https://api.deepseek.com/v1  │
│  API Key:  [sk-•••••••••••••]            │
│    💡 格式：sk-... 或对应平台的密钥格式    │
│  模型:     [gpt-4o-mini_____________]    │
│    💡 示例：gpt-4o-mini, deepseek-chat   │
└─────────────────────────────────────────┘
```

### 交互逻辑

1. **下拉选择器** — 显示所有已保存配置的名称，切换时表单内容跟着变
2. **新增按钮** — 点击后弹出预设选择列表（OpenAI / DeepSeek / Claude / Ollama / 自定义空白），选择后创建配置并自动填充 URL + 模型，切换到该配置的编辑状态
3. **删除按钮** — 删除当前选中配置（至少保留一个，最后一个不可删）
4. **输入框下方提示** — 每个输入框下有灰色小字说明示例值
5. **自动保存** — 切换配置时立即保存；编辑字段时使用 500ms 防抖保存，避免频繁写入 storage

### 首次使用（无配置时）

直接显示预设选择界面，引导用户选一个预设开始配置。

## Popup 快捷切换

### 布局

```
┌─────────────────────────┐
│  HalfTrans              │
├─────────────────────────┤
│  [▶ 翻译当前页]         │
├─────────────────────────┤
│  API: [ ▼ OpenAI      ] │
├─────────────────────────┤
│  翻译风格：口语化 / 书面化  │
│  保留强度：保守 / 激进      │
├─────────────────────────┤
│  术语表：已有 12 条 [编辑→] │
├─────────────────────────┤
│  ⚙ 设置                  │
└─────────────────────────┘
```

### 交互

- 翻译按钮下方新增一行下拉选择器，显示当前活跃配置名称
- 切换即生效，立即更新 `activeConfigId`
- 无配置时显示"未配置 API → 去设置"链接

## 核心层适配

### 影响文件

| 文件 | 变更 |
|------|------|
| `src/shared/types.ts` | 新增 `ApiConfig`，修改 `UserSettings`，新增 `API_PRESETS`，更新 `DEFAULT_SETTINGS` |
| `src/shared/storage.ts` | 新增 `getActiveApiConfig()` 辅助函数 |
| `src/background/index.ts` | 用 `getActiveApiConfig()` 取当前配置传给 provider |
| `src/core/direct-api.ts` | 无改动 |
| `src/options/App.tsx` | API 配置区域重写为多配置管理 UI |
| `src/popup/App.tsx` | 新增 API 配置下拉选择器 |

### 翻译请求构造

background 层负责从 `apiConfigs` 中根据 `activeConfigId` 解析出当前配置，构造 `TranslationRequest` 时把 `apiBaseUrl`/`apiKey`/`model` 平铺传入。`TranslationRequest` 接口不变，`DirectAPIProvider` 完全无感知。

### `getActiveApiConfig` 辅助函数

```ts
export async function getActiveApiConfig(): Promise<ApiConfig | null> {
  const settings = await getSettings();
  if (!settings.apiConfigs.length) return null;
  return settings.apiConfigs.find(c => c.id === settings.activeConfigId) ?? settings.apiConfigs[0];
}
```
