# Programmer Cognitive Translation Strategy v1.0

## Product Goal

目标不是语言翻译。

目标是：

将技术内容转换为程序员最容易理解的表达形式。

优化目标：

1. 保持技术心智模型（Mental Model）
2. 降低认知成本（Cognitive Load）
3. 保证术语一致性（Terminology Consistency）
4. 保持原文语义准确性（Semantic Accuracy）

优先级：

```text
理解效率
>
术语准确
>
语言自然
>
语法规范
```

---

# Core Principle

不要执行：

```text
English
↓
Chinese
```

而执行：

```text
English
↓
Understand Meaning
↓
Rewrite For Developers
↓
Output
```

---

# Translation Decision Flow

每个词都必须经过以下决策流程：

```text
Term Detection
      ↓
Concept Classification
      ↓
Translation Decision
      ↓
Rewrite
```

---

# Rule 1

优先理解语义。

禁止逐词翻译。

错误：

"The runtime schedules tasks."

↓

"运行时调度任务。"

正确：

"runtime 会把 tasks 调度执行。"

---

# Rule 2

保留标准技术概念。

如果一个词属于行业内公认技术概念：

保留英文。

Examples:

event loop
callback
promise
closure
runtime
fiber
hook
virtual DOM
transformer
embedding
token

Output:

event loop
callback
promise

不要翻译：

事件循环
回调函数
承诺对象

---

# Rule 3

普通技术词默认翻译。

以下词不是技术概念。

仅仅是技术场景下常见词汇。

Examples:

server
request
response
issue
problem
service
process
environment
configuration
dependency

默认翻译：

server → 服务
request → 请求
response → 响应
issue → 问题
service → 服务

禁止无理由保留英文。

---

# Rule 4

固定搭配优先。

如果词属于固定行业表达：

整体保留。

Examples:

HTTP request
Pull Request
Event Loop
Render Props
Dependency Injection
Message Queue

保留整体概念。

不要拆开翻译。

---

# Rule 5

代码相关内容不翻译。

以下内容必须保留：

变量名

函数名

类名

接口名

文件名

包名

模块名

命令

Examples:

useState
setState
ReactNode
docker-compose.yml
npm install
kubectl apply

全部保留。

---

# Rule 6

API 字段不翻译。

Examples:

userId
createdAt
updatedAt
isEnabled

必须保持原样。

---

# Rule 7

代码块不翻译。

Code Block:

```js
const count = useState(0)
```

保持原样。

---

# Rule 8

日志内容不翻译。

Examples:

Connection timeout
Access denied
File not found

保持原样。

---

# Rule 9

配置内容不翻译。

Examples:

docker-compose.yaml

package.json

tsconfig.json

.env

保持原样。

---

# Rule 10

认知优先于语言规范。

错误：

"事件循环负责处理任务队列中的回调函数。"

正确：

"event loop 会处理 task queue 里的 callbacks。"

程序员能更快理解。

---

# Rule 11

上下文优先于词典。

同一个词在不同上下文可以有不同处理。

Example:

request

Case 1:

HTTP request

↓

HTTP request

Case 2:

Customer requests

↓

客户请求

禁止全局固定翻译。

必须结合上下文判断。

---

# Rule 12

保持术语一致性。

页面内第一次出现：

event loop

后续所有位置：

event loop

禁止：

event loop

↓

事件循环

↓

event loop

↓

循环机制

混用。

---

# Rule 13

输出长度控制。

翻译结果长度：

≤ 原文长度 1.3 倍

避免解释型翻译。

目标：

快速阅读。

不是教学。

---

# Rule 14

禁止扩展解释。

原文：

"The runtime executes tasks."

允许：

"runtime 执行 tasks。"

禁止：

"runtime 是程序运行时环境，它负责..."

不要补课。

只翻译。

---

# Rule 15

程序员模式输出格式

优先使用：

英文术语
+
中文行为描述

Examples:

event loop 会处理 callbacks

runtime 会调度 tasks

React hook 可以访问 state

promise 会在 future resolve

目标：

40% 中文
+
60% 技术英文

而不是：

100% 中文
或
100% 英文

```

---

# Final Objective

输出结果应该满足：

程序员阅读翻译版的速度

≥

阅读原文速度

否则翻译失败。
```
