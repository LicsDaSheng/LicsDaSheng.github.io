---
title: "第二章：Pi AI 模型接口层——调用大模型只是一个 REST 请求，为什么还要单独分层？"
published: 2026-10-21
description: "对照 Anthropic Messages 与 OpenAI Responses，解释 Pi AI 如何把不同服务的模型交互转换为 Agent 可依赖的统一消息、流式事件与结束状态。"
tags: [pi, pi-ai, llm, 源码剖析]
category: Pi 教程
series: pi-tutorial
seriesOrder: 2
seriesStage: 1
draft: false
---

> 阶段：源码级剖析。适用版本：`@earendil-works/pi-ai` `1.3.0`；参考本地仓库 `~/workspace/github/pi`，固定提交 `530015d93a40d157b5f7e3ddf4713abf14fa9616`。仓库及核查范围见 [源码与验证记录](#附录源码与验证记录)。
>
> 本文代码均为局部源码或明确标注的教学片段，不是可直接运行的完整项目。源码行为只针对上述提交，不泛指其他 Pi 发行版。

[第一章](/posts/pi-tutorial/01-agent-loop/)介绍了 Agent 循环：请求模型、执行工具、把结果交回模型，再决定是否继续。本章展开其中看起来最简单的一步：**请求模型。**

一个自然的问题是：大模型调用不就是向一个 REST API 发请求吗？为什么 Pi 要为它建立独立的 `packages/ai` 模块？

先给出结论：**如果只调用一个固定服务、发送文本并取得文本，直接请求完全可以。Pi AI 的价值不在于让 HTTP 请求成为可能，而在于把不同服务的模型交互转换成 Agent 可以依赖的消息、事件和状态约定。**

独立模块不是所有 Agent 的必要条件。但无论代码放在哪里，这些转换和判断总要有人负责。

## 阅读目标与准备

读完后，你应能解释模型接口层的职责，追踪一次请求的转换过程，并说明为什么“收到了响应”不等于“可以执行工具”。

只需掌握函数、数组、对象和条件判断。本文使用的几个概念如下：

- **HTTP 请求**：客户端向服务发送数据并接收响应。REST 是一种接口设计风格，不代表各服务使用相同的数据结构。
- **提供商（provider）**：提供模型服务的来源；**API** 在本文还用于区分具体协议形态，例如 Anthropic Messages 和 OpenAI Responses。
- **流式响应**：结果分批到达。SSE 是通过 HTTP 持续推送事件的一种机制；流式输出不必等到全部生成结束才交给客户端。
- **类型约定**：TypeScript 用类型描述数据形态。`A | B` 表示数据可能是其中一种；它不会自动验证远程数据，更不会自动完成协议转换。
- **异步迭代**：`for await` 按到达顺序消费异步事件；`await` 等待某个异步结果。

本章继续以“读取已授权资料并提取要点”为教学场景，暂不实现完整助手，也不确定知识卡片格式及存储方案。

## 1. 先承认：一个请求确实可以解决简单问题

假设程序只需要把一句话发送给固定模型，再显示回答，完全可以直接编写请求。

下面是**概念伪代码**，字段及地址不对应具体提供商：

```ts
const response = await fetch("模型服务地址", {
  method: "POST",
  headers: { Authorization: "服务要求的认证信息" },
  body: JSON.stringify({ input: "解释什么是递归" }),
});
const data = await response.json();
show(data.answer);
```

这里隐藏了认证、错误处理和具体响应格式，但并不意味着必须引入一个大型框架。对于一次性脚本，直接使用提供商 SDK 也很合理。SDK 是服务方提供的客户端库，可以代替我们处理部分请求和协议细节。

问题出在需求变化以后：

| 新要求 | 除了发请求，还要解决什么 |
| --- | --- |
| 切换提供商 | 不同请求字段、内容块、认证和响应结构 |
| 逐步显示输出 | 识别事件类型、累积内容、处理流中断 |
| 调用工具 | 识别调用名称、关联标识及参数，回传执行结果 |
| 继续多轮对话 | 把历史消息重新转换成服务接受的格式 |
| 判断是否继续 | 区分正常结束、输出截断、错误与取消 |

底层仍可能是 HTTP，但“发送字节”只是其中一个环节。**传输协议相同，不代表业务语义相同。**

而且，本版本的 `Transport` 类型还包含 WebSocket 等选项。因此，不能把整个模型接口层定义为“REST 请求的简单封装”；本文只选两条具体 API 实现讲解。

## 2. 从聊天调用到 Agent：返回值开始影响程序动作

考虑这样一次交互：

<!-- pi-diagram:pi-read:start -->
<figure class="pi-diagram">
<div class="pi-diagram-scroll" tabindex="0" role="region" aria-label="06 · 读取资料：两次模型请求的协作，窄屏可横向滚动">
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 720 625" width="720" height="625" role="img" aria-labelledby="pi-read-title pi-read-desc">
<title id="pi-read-title">06 · 读取资料：两次模型请求的协作</title><desc id="pi-read-desc">流程的完整文字版本位于图后的可展开说明。</desc>
<defs><pattern id="pi-read-hatch" width="9" height="9" patternUnits="userSpaceOnUse"><path d="M-2 9 9-2M5 12 12 5" stroke="#80775f" stroke-width=".65" opacity=".13"/></pattern><marker id="pi-read-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M1 1 8 5 1 9" fill="none" stroke="#4a4a42" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></marker></defs>
<rect x="3" y="3" width="714" height="619" rx="17" fill="#fffaf0" stroke="#8da4ad" stroke-width="1.8"/><rect x="6" y="5" width="708" height="614" rx="15" fill="none" stroke="#8da4ad" stroke-opacity=".3"/>
<g fill="#302d28" font-family="LXGW WenKai, Kaiti SC, KaiTi, serif"><text x="35" y="40" text-anchor="start" font-size="23">06 · 读取资料：两次模型请求的协作</text><path d="M107 66 Q360.0 63 613 65 Q626 65 625 78 L624 129 Q625 142 612 141 Q360.0 143 107 140 Q94 141 95 128 L96 77 Q95 65 107 66Z" fill="#dcebf0" stroke="#494940" stroke-width="1.8"/><path d="M107 66 Q360.0 63 613 65 Q626 65 625 78 L624 129 Q625 142 612 141 Q360.0 143 107 140 Q94 141 95 128 L96 77 Q95 65 107 66Z" fill="url(#pi-read-hatch)" stroke="#77735f" stroke-opacity=".25" transform="translate(1.8,1.4)"/><text x="360.0" y="95.5" text-anchor="middle" font-size="19">用户输入</text><text x="360.0" y="122.5" text-anchor="middle" font-size="19">读取已授权资料，提取三个要点</text><path d="M360 144 Q358 157 360 169" fill="none" stroke="#4a4a42" stroke-width="2" stroke-linecap="round" marker-end="url(#pi-read-arrow)"/><path d="M107 176 Q360.0 173 613 175 Q626 175 625 188 L624 239 Q625 252 612 251 Q360.0 253 107 250 Q94 251 95 238 L96 187 Q95 175 107 176Z" fill="#e9e0f0" stroke="#494940" stroke-width="1.8"/><path d="M107 176 Q360.0 173 613 175 Q626 175 625 188 L624 239 Q625 252 612 251 Q360.0 253 107 250 Q94 251 95 238 L96 187 Q95 175 107 176Z" fill="url(#pi-read-hatch)" stroke="#77735f" stroke-opacity=".25" transform="translate(1.8,1.4)"/><text x="360.0" y="205.5" text-anchor="middle" font-size="19">第一次模型响应</text><text x="360.0" y="232.5" text-anchor="middle" font-size="19">请求调用 read_material</text><path d="M360 254 Q358 267 360 279" fill="none" stroke="#4a4a42" stroke-width="2" stroke-linecap="round" marker-end="url(#pi-read-arrow)"/><path d="M107 286 Q360.0 283 613 285 Q626 285 625 298 L624 349 Q625 362 612 361 Q360.0 363 107 360 Q94 361 95 348 L96 297 Q95 285 107 286Z" fill="#edf0d2" stroke="#494940" stroke-width="1.8"/><path d="M107 286 Q360.0 283 613 285 Q626 285 625 298 L624 349 Q625 362 612 361 Q360.0 363 107 360 Q94 361 95 348 L96 297 Q95 285 107 286Z" fill="url(#pi-read-hatch)" stroke="#77735f" stroke-opacity=".25" transform="translate(1.8,1.4)"/><text x="360.0" y="315.5" text-anchor="middle" font-size="19">程序检查参数与授权</text><text x="360.0" y="342.5" text-anchor="middle" font-size="19">执行读取</text><path d="M360 364 Q358 377 360 389" fill="none" stroke="#4a4a42" stroke-width="2" stroke-linecap="round" marker-end="url(#pi-read-arrow)"/><path d="M107 396 Q360.0 393 613 395 Q626 395 625 408 L624 459 Q625 472 612 471 Q360.0 473 107 470 Q94 471 95 458 L96 407 Q95 395 107 396Z" fill="#f3dedb" stroke="#494940" stroke-width="1.8"/><path d="M107 396 Q360.0 393 613 395 Q626 395 625 408 L624 459 Q625 472 612 471 Q360.0 473 107 470 Q94 471 95 458 L96 407 Q95 395 107 396Z" fill="url(#pi-read-hatch)" stroke="#77735f" stroke-opacity=".25" transform="translate(1.8,1.4)"/><text x="360.0" y="439.0" text-anchor="middle" font-size="19">工具结果进入消息历史</text><path d="M360 474 Q358 487 360 499" fill="none" stroke="#4a4a42" stroke-width="2" stroke-linecap="round" marker-end="url(#pi-read-arrow)"/><path d="M107 506 Q360.0 503 613 505 Q626 505 625 518 L624 569 Q625 582 612 581 Q360.0 583 107 580 Q94 581 95 568 L96 517 Q95 505 107 506Z" fill="#faedb9" stroke="#494940" stroke-width="1.8"/><path d="M107 506 Q360.0 503 613 505 Q626 505 625 518 L624 569 Q625 582 612 581 Q360.0 583 107 580 Q94 581 95 568 L96 517 Q95 505 107 506Z" fill="url(#pi-read-hatch)" stroke="#77735f" stroke-opacity=".25" transform="translate(1.8,1.4)"/><text x="360.0" y="535.5" text-anchor="middle" font-size="19">第二次模型响应</text><text x="360.0" y="562.5" text-anchor="middle" font-size="19">根据资料生成要点</text></g>
</svg>
</div>
<figcaption>06 · 读取资料：两次模型请求的协作</figcaption>
</figure>

<details class="pi-diagram-source">
<summary>展开文字链路（可复制）</summary>

```text
用户：读取已授权资料，提取三个要点
  ↓
第一次模型响应：请求调用 read_material
  ↓
程序检查参数与授权，执行读取
  ↓
工具结果进入消息历史
  ↓
第二次模型响应：根据资料生成要点
```

</details>
<!-- pi-diagram:pi-read:end -->

对于只显示聊天内容的程序，一段不完整的文本可能只是显示问题；对于 Agent，一段不完整的工具参数可能改变程序接下来访问的文件。

下面是**省略必要字段的教学数据**，不是完整 Pi 消息：

```ts
const call = {
  type: "toolCall",
  id: "call_1",
  name: "read_material",
  arguments: { path: "已授权资料路径" },
};

const result = {
  role: "toolResult",
  toolCallId: "call_1",
  toolName: "read_material",
  content: [{ type: "text", text: "资料正文……" }],
  isError: false,
};
```

这两份数据包含不同职责：

- `name` 告诉程序模型请求哪个工具，但不表示模型已经执行它。
- `arguments` 是结构化参数，不应通过随意截取自然语言获得。
- `id` 与 `toolCallId` 将调用和结果对应起来。同一工具可能被调用多次，仅靠名称不够。
- `isError` 让模型知道工具返回的是成功结果还是失败信息。

下一次请求还必须把调用和结果一起放回历史，并保持服务要求的格式和关系。丢掉这些信息，只留下“读到了资料”这句话，并不等价于完整的工具交互。

**因此，模型响应不仅是给人看的内容，也是 Agent 控制流的输入。**这正是模型接口层的重要性来源，而不只是“未来可能换个模型”。

## 3. Pi AI 的核心：对上提供稳定约定，对下适配具体协议

### 3.1 先看边界，而不是先看网络代码

本版本的低层流函数类型位于 `packages/ai/src/types.ts:390–394`：

```ts
export type StreamFunction<TApi extends Api = Api, TOptions extends StreamOptions = StreamOptions> = (
  model: Model<TApi>,
  context: TranscriptContext,
  options?: TOptions,
) => AssistantMessageEventStream;
```

这是**局部源码**。泛型参数用于关联 API 类型及对应选项，不必先掌握泛型全部细节；先读出这个接口的含义：

1. `model`：调用哪个模型，以及它所属的提供商和 API。
2. `context`：已经规范化的消息历史。
3. `options`：本次调用选项，例如取消信号与认证信息。
4. 返回值：统一的模型响应事件流，而不是原始 HTTP 响应。

网络客户端回答的是“服务返回了什么”；这个接口需要进一步回答“这部分内容在一次模型响应中意味着什么”。

### 3.2 统一消息不是一串文本

`AssistantMessage` 的 `content` 类型是：

```ts
content: (TextContent | ThinkingContent | ToolCall)[];
```

这是 `types.ts:572` 的**局部源码**。同一条模型消息可以由多个内容块组成，既有文本，也可能包含服务提供的推理相关内容和工具调用。

消息还包含 `provider`、`api`、`model`、`usage`、`stopReason` 等字段：

| 信息 | 上层为何需要它 |
| --- | --- |
| 内容块 | 区分要展示的文字与请求执行的工具 |
| 模型与服务标识 | 记录响应来源，并为后续历史转换提供依据 |
| 用量 | 记录输入、输出及缓存等统计；不等同于服务商最终账单 |
| 结束原因 | 区分正常完成、截断、错误、取消等情况 |
| 原始结束原因等可选字段 | 在统一状态之外保留诊断信息 |

统一并不意味着删除所有服务差异。例如 `ThinkingContent` 保留 `thinkingSignature`，源码说明它可用于提供商特定的历史重放。某些信息虽然不直接展示，继续对话时却可能仍有用途。

这也意味着：**不能承诺把任意服务的历史原封不动搬到另一服务后，效果和语义完全不变。**

### 3.3 上下文规范化也属于接口工作

本版本还有一个容易受旧教程影响的细节：低层函数接收的是 `TranscriptContext`，不是把系统提示与工具列表各自挂在顶层的任意对象。

`utils/transcript.ts:30–34` 的**局部源码**：

```ts
export function normalizeContext(context: Context): TranscriptContext {
  const initialMessage = createInitialSystemMessage(context.systemPrompt, context.tools);
  const messages = initialMessage ? [initialMessage, ...context.messages] : context.messages;
  return { messages } as TranscriptContext;
}
```

如果传入了顶层系统提示或工具列表，`createInitialSystemMessage` 会把它们折叠到开头的系统消息中。工具变更还能通过系统消息的 `toolsAdded` / `toolsRemoved` 表达。

但外部 API 不一定接受这种形式。随后，具体实现会根据兼容性设置处理系统消息，再生成服务要求的请求。

所以这里存在两个不同步骤：

<!-- pi-diagram:pi-boundary:start -->
<figure class="pi-diagram">
<div class="pi-diagram-scroll" tabindex="0" role="region" aria-label="07 · 消息转换的三层边界，窄屏可横向滚动">
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 720 405" width="720" height="405" role="img" aria-labelledby="pi-boundary-title pi-boundary-desc">
<title id="pi-boundary-title">07 · 消息转换的三层边界</title><desc id="pi-boundary-desc">流程的完整文字版本位于图后的可展开说明。</desc>
<defs><pattern id="pi-boundary-hatch" width="9" height="9" patternUnits="userSpaceOnUse"><path d="M-2 9 9-2M5 12 12 5" stroke="#80775f" stroke-width=".65" opacity=".13"/></pattern><marker id="pi-boundary-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M1 1 8 5 1 9" fill="none" stroke="#4a4a42" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></marker></defs>
<rect x="3" y="3" width="714" height="399" rx="17" fill="#fffaf0" stroke="#8da4ad" stroke-width="1.8"/><rect x="6" y="5" width="708" height="394" rx="15" fill="none" stroke="#8da4ad" stroke-opacity=".3"/>
<g fill="#302d28" font-family="LXGW WenKai, Kaiti SC, KaiTi, serif"><text x="35" y="40" text-anchor="start" font-size="23">07 · 消息转换的三层边界</text><path d="M107 66 Q360.0 63 613 65 Q626 65 625 78 L624 129 Q625 142 612 141 Q360.0 143 107 140 Q94 141 95 128 L96 77 Q95 65 107 66Z" fill="#dcebf0" stroke="#494940" stroke-width="1.8"/><path d="M107 66 Q360.0 63 613 65 Q626 65 625 78 L624 129 Q625 142 612 141 Q360.0 143 107 140 Q94 141 95 128 L96 77 Q95 65 107 66Z" fill="url(#pi-boundary-hatch)" stroke="#77735f" stroke-opacity=".25" transform="translate(1.8,1.4)"/><text x="360.0" y="109.0" text-anchor="middle" font-size="19">应用数据</text><path d="M360 144 Q358 157 360 169" fill="none" stroke="#4a4a42" stroke-width="2" stroke-linecap="round" marker-end="url(#pi-boundary-arrow)"/><path d="M107 176 Q360.0 173 613 175 Q626 175 625 188 L624 239 Q625 252 612 251 Q360.0 253 107 250 Q94 251 95 238 L96 187 Q95 175 107 176Z" fill="#e9e0f0" stroke="#494940" stroke-width="1.8"/><path d="M107 176 Q360.0 173 613 175 Q626 175 625 188 L624 239 Q625 252 612 251 Q360.0 253 107 250 Q94 251 95 238 L96 187 Q95 175 107 176Z" fill="url(#pi-boundary-hatch)" stroke="#77735f" stroke-opacity=".25" transform="translate(1.8,1.4)"/><text x="360.0" y="219.0" text-anchor="middle" font-size="19">Pi 规范化消息</text><path d="M360 254 Q358 267 360 279" fill="none" stroke="#4a4a42" stroke-width="2" stroke-linecap="round" marker-end="url(#pi-boundary-arrow)"/><path d="M107 286 Q360.0 283 613 285 Q626 285 625 298 L624 349 Q625 362 612 361 Q360.0 363 107 360 Q94 361 95 348 L96 297 Q95 285 107 286Z" fill="#edf0d2" stroke="#494940" stroke-width="1.8"/><path d="M107 286 Q360.0 283 613 285 Q626 285 625 298 L624 349 Q625 362 612 361 Q360.0 363 107 360 Q94 361 95 348 L96 297 Q95 285 107 286Z" fill="url(#pi-boundary-hatch)" stroke="#77735f" stroke-opacity=".25" transform="translate(1.8,1.4)"/><text x="360.0" y="329.0" text-anchor="middle" font-size="19">提供商请求数据</text></g>
</svg>
</div>
<figcaption>07 · 消息转换的三层边界</figcaption>
</figure>

<details class="pi-diagram-source">
<summary>展开文字链路（可复制）</summary>

```text
应用数据 → Pi 规范化消息 → 提供商请求数据
```

</details>
<!-- pi-diagram:pi-boundary:end -->

前一步建立内部约定，后一步适配外部协议，不能混为一谈。

## 4. 沿源码走完一次调用

### 4.1 从第一章的循环接上来

`agent/src/agent-loop.ts:403–407` 的**局部源码**：

```ts
const response = await streamFunction(config.model, llmContext, {
  ...config,
  apiKey: resolvedApiKey,
  signal,
});
```

循环依赖的是传入的流函数，而不是在这里直接创建某一家 SDK 客户端。它已经先完成应用消息到模型消息的转换，并规范化上下文。

在 coding agent 的 SDK 接线中，`sdk.ts:420–430` 注入的 `streamFn` 最终调用 `modelRuntime.streamSimple(...)`。对普通、非虚拟聊天模型，本版本的实际主链是：

<!-- pi-diagram:pi-provider:start -->
<figure class="pi-diagram">
<div class="pi-diagram-scroll" tabindex="0" role="region" aria-label="08 · 从 Agent 到模型服务，窄屏可横向滚动">
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 720 1065" width="720" height="1065" role="img" aria-labelledby="pi-provider-title pi-provider-desc">
<title id="pi-provider-title">08 · 从 Agent 到模型服务</title><desc id="pi-provider-desc">流程的完整文字版本位于图后的可展开说明。</desc>
<defs><pattern id="pi-provider-hatch" width="9" height="9" patternUnits="userSpaceOnUse"><path d="M-2 9 9-2M5 12 12 5" stroke="#80775f" stroke-width=".65" opacity=".13"/></pattern><marker id="pi-provider-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M1 1 8 5 1 9" fill="none" stroke="#4a4a42" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></marker></defs>
<rect x="3" y="3" width="714" height="1059" rx="17" fill="#fffaf0" stroke="#8da4ad" stroke-width="1.8"/><rect x="6" y="5" width="708" height="1054" rx="15" fill="none" stroke="#8da4ad" stroke-opacity=".3"/>
<g fill="#302d28" font-family="LXGW WenKai, Kaiti SC, KaiTi, serif"><text x="35" y="40" text-anchor="start" font-size="23">08 · 从 Agent 到模型服务</text><path d="M107 66 Q360.0 63 613 65 Q626 65 625 78 L624 129 Q625 142 612 141 Q360.0 143 107 140 Q94 141 95 128 L96 77 Q95 65 107 66Z" fill="#dcebf0" stroke="#494940" stroke-width="1.8"/><path d="M107 66 Q360.0 63 613 65 Q626 65 625 78 L624 129 Q625 142 612 141 Q360.0 143 107 140 Q94 141 95 128 L96 77 Q95 65 107 66Z" fill="url(#pi-provider-hatch)" stroke="#77735f" stroke-opacity=".25" transform="translate(1.8,1.4)"/><text x="360.0" y="109.0" text-anchor="middle" font-size="19">Agent 的 streamAssistantResponse</text><path d="M360 144 Q358 157 360 169" fill="none" stroke="#4a4a42" stroke-width="2" stroke-linecap="round" marker-end="url(#pi-provider-arrow)"/><path d="M107 176 Q360.0 173 613 175 Q626 175 625 188 L624 239 Q625 252 612 251 Q360.0 253 107 250 Q94 251 95 238 L96 187 Q95 175 107 176Z" fill="#e9e0f0" stroke="#494940" stroke-width="1.8"/><path d="M107 176 Q360.0 173 613 175 Q626 175 625 188 L624 239 Q625 252 612 251 Q360.0 253 107 250 Q94 251 95 238 L96 187 Q95 175 107 176Z" fill="url(#pi-provider-hatch)" stroke="#77735f" stroke-opacity=".25" transform="translate(1.8,1.4)"/><text x="360.0" y="219.0" text-anchor="middle" font-size="19">注入的 streamFn</text><path d="M360 254 Q358 267 360 279" fill="none" stroke="#4a4a42" stroke-width="2" stroke-linecap="round" marker-end="url(#pi-provider-arrow)"/><path d="M107 286 Q360.0 283 613 285 Q626 285 625 298 L624 349 Q625 362 612 361 Q360.0 363 107 360 Q94 361 95 348 L96 297 Q95 285 107 286Z" fill="#edf0d2" stroke="#494940" stroke-width="1.8"/><path d="M107 286 Q360.0 283 613 285 Q626 285 625 298 L624 349 Q625 362 612 361 Q360.0 363 107 360 Q94 361 95 348 L96 297 Q95 285 107 286Z" fill="url(#pi-provider-hatch)" stroke="#77735f" stroke-opacity=".25" transform="translate(1.8,1.4)"/><text x="360.0" y="329.0" text-anchor="middle" font-size="19">ModelRuntime.streamSimple</text><path d="M360 364 Q358 377 360 389" fill="none" stroke="#4a4a42" stroke-width="2" stroke-linecap="round" marker-end="url(#pi-provider-arrow)"/><path d="M107 396 Q360.0 393 613 395 Q626 395 625 408 L624 459 Q625 472 612 471 Q360.0 473 107 470 Q94 471 95 458 L96 407 Q95 395 107 396Z" fill="#f3dedb" stroke="#494940" stroke-width="1.8"/><path d="M107 396 Q360.0 393 613 395 Q626 395 625 408 L624 459 Q625 472 612 471 Q360.0 473 107 470 Q94 471 95 458 L96 407 Q95 395 107 396Z" fill="url(#pi-provider-hatch)" stroke="#77735f" stroke-opacity=".25" transform="translate(1.8,1.4)"/><text x="360.0" y="425.5" text-anchor="middle" font-size="19">prepareRequest</text><text x="360.0" y="452.5" text-anchor="middle" font-size="19">准备提供商、模型和请求选项</text><path d="M360 474 Q358 487 360 499" fill="none" stroke="#4a4a42" stroke-width="2" stroke-linecap="round" marker-end="url(#pi-provider-arrow)"/><path d="M107 506 Q360.0 503 613 505 Q626 505 625 518 L624 569 Q625 582 612 581 Q360.0 583 107 580 Q94 581 95 568 L96 517 Q95 505 107 506Z" fill="#faedb9" stroke="#494940" stroke-width="1.8"/><path d="M107 506 Q360.0 503 613 505 Q626 505 625 518 L624 569 Q625 582 612 581 Q360.0 583 107 580 Q94 581 95 568 L96 517 Q95 505 107 506Z" fill="url(#pi-provider-hatch)" stroke="#77735f" stroke-opacity=".25" transform="translate(1.8,1.4)"/><text x="360.0" y="549.0" text-anchor="middle" font-size="19">prepared.provider.streamSimple</text><path d="M360 584 Q358 597 360 609" fill="none" stroke="#4a4a42" stroke-width="2" stroke-linecap="round" marker-end="url(#pi-provider-arrow)"/><path d="M107 616 Q360.0 613 613 615 Q626 615 625 628 L624 679 Q625 692 612 691 Q360.0 693 107 690 Q94 691 95 678 L96 627 Q95 615 107 616Z" fill="#dcebf0" stroke="#494940" stroke-width="1.8"/><path d="M107 616 Q360.0 613 613 615 Q626 615 625 628 L624 679 Q625 692 612 691 Q360.0 693 107 690 Q94 691 95 678 L96 627 Q95 615 107 616Z" fill="url(#pi-provider-hatch)" stroke="#77735f" stroke-opacity=".25" transform="translate(1.8,1.4)"/><text x="360.0" y="659.0" text-anchor="middle" font-size="19">createProvider 中的 dispatch</text><path d="M360 694 Q358 707 360 719" fill="none" stroke="#4a4a42" stroke-width="2" stroke-linecap="round" marker-end="url(#pi-provider-arrow)"/><path d="M107 726 Q360.0 723 613 725 Q626 725 625 738 L624 789 Q625 802 612 801 Q360.0 803 107 800 Q94 801 95 788 L96 737 Q95 725 107 726Z" fill="#e9e0f0" stroke="#494940" stroke-width="1.8"/><path d="M107 726 Q360.0 723 613 725 Q626 725 625 738 L624 789 Q625 802 612 801 Q360.0 803 107 800 Q94 801 95 788 L96 737 Q95 725 107 726Z" fill="url(#pi-provider-hatch)" stroke="#77735f" stroke-opacity=".25" transform="translate(1.8,1.4)"/><text x="360.0" y="769.0" text-anchor="middle" font-size="19">对应 API 的 streamSimple</text><path d="M360 804 Q358 817 360 829" fill="none" stroke="#4a4a42" stroke-width="2" stroke-linecap="round" marker-end="url(#pi-provider-arrow)"/><path d="M107 836 Q360.0 833 613 835 Q626 835 625 848 L624 899 Q625 912 612 911 Q360.0 913 107 910 Q94 911 95 898 L96 847 Q95 835 107 836Z" fill="#edf0d2" stroke="#494940" stroke-width="1.8"/><path d="M107 836 Q360.0 833 613 835 Q626 835 625 848 L624 899 Q625 912 612 911 Q360.0 913 107 910 Q94 911 95 898 L96 847 Q95 835 107 836Z" fill="url(#pi-provider-hatch)" stroke="#77735f" stroke-opacity=".25" transform="translate(1.8,1.4)"/><text x="360.0" y="879.0" text-anchor="middle" font-size="19">对应 API 的 stream</text><path d="M360 914 Q358 927 360 939" fill="none" stroke="#4a4a42" stroke-width="2" stroke-linecap="round" marker-end="url(#pi-provider-arrow)"/><path d="M107 946 Q360.0 943 613 945 Q626 945 625 958 L624 1009 Q625 1022 612 1021 Q360.0 1023 107 1020 Q94 1021 95 1008 L96 957 Q95 945 107 946Z" fill="#f3dedb" stroke="#494940" stroke-width="1.8"/><path d="M107 946 Q360.0 943 613 945 Q626 945 625 958 L624 1009 Q625 1022 612 1021 Q360.0 1023 107 1020 Q94 1021 95 1008 L96 957 Q95 945 107 946Z" fill="url(#pi-provider-hatch)" stroke="#77735f" stroke-opacity=".25" transform="translate(1.8,1.4)"/><text x="360.0" y="975.5" text-anchor="middle" font-size="19">提供商 SDK</text><text x="360.0" y="1002.5" text-anchor="middle" font-size="19">请求与响应转换</text></g>
</svg>
</div>
<figcaption>08 · 从 Agent 到模型服务</figcaption>
</figure>

<details class="pi-diagram-source">
<summary>展开文字链路（可复制）</summary>

```text
Agent 的 streamAssistantResponse
  → 注入的 streamFn
  → ModelRuntime.streamSimple
  → prepareRequest：准备提供商、模型和请求选项
  → prepared.provider.streamSimple
  → createProvider 中的 dispatch
  → 对应 API 的 streamSimple
  → 对应 API 的 stream
  → 提供商 SDK 请求与响应转换
```

</details>
<!-- pi-diagram:pi-provider:end -->

`ModelRuntime` 属于 coding agent 应用层，不能误画成 Pi AI 内的类。其 `streamSimple` 对虚拟模型还有额外路由分支，本章不展开。

如果不使用 coding agent，Pi AI 自身也提供 `Models` 接口：`models.ts` 中的实现负责上下文规范化、查找提供商、应用认证，再调用提供商流函数。这是另一条入口，**并非上面 `ModelRuntime.streamSimple` 必经的中间层**。

同样，不应把其他版本的全局 `streamSimple` 示例直接套用到这条链上。本版本核心入口 `index.ts` 明确把提供商工厂、API 实现和旧兼容入口分开导出。

### 4.2 提供商与 API 实现如何接起来

`providers/openai.ts` 中的 `openaiProvider()` 通过 `createProvider` 组合服务标识、地址、认证、模型列表及 `openAIResponsesApi()`。Anthropic 工厂同样组合自己的配置与 `anthropicMessagesApi()`。

OpenAI 的延迟加载入口非常短，`api/openai-responses.lazy.ts` 的**局部源码**：

```ts
export const openAIResponsesApi = (): ProviderStreams => lazyApi(() => import("./openai-responses.ts"));
```

它把具体实现推迟到需要时加载。真正的提供商分派在 `createProvider` 内进行：提供商可以使用单个实现，也可以按 `model.api` 选择实现。

这说明两个概念不能混淆：**提供商配置回答“连接谁”，API 实现回答“怎样与它交换消息”。**它们在一个简单配置中可能一一对应，但接口设计不要求永远如此。

### 4.3 同一个工具结果，需要两种外部表示

观察工具结果的转换，就能看出为什么不能只换一个 URL。

Anthropic 的 `convertToolResult` 返回以下数据，位于 `api/anthropic-messages.ts:1339–1346`，为**局部源码**：

```ts
return {
  type: "tool_result",
  tool_use_id: msg.toolCallId,
  content: convertContentBlocks(content),
  is_error: msg.isError,
};
```

OpenAI Responses 对普通函数工具结果则生成下列对象，位于 `api/openai-responses-shared.ts:420–424`，为**局部源码**：

```ts
messages.push({
  type: "function_call_output",
  call_id: callId,
  output,
});
```

后者在前面还会处理调用标识和结果内容；对于其他工具形态也有分支。因此，不能把上面的代码理解成只换字段名的完整转换器。

对照请求与响应的几个关键位置：

| Pi 内部含义 | Anthropic Messages | OpenAI Responses |
| --- | --- | --- |
| 历史工具调用 | `tool_use` 内容块 | `function_call` 项 |
| 工具结果 | `tool_result`，使用 `tool_use_id` | `function_call_output`，使用 `call_id` |
| 文本增量 | `content_block_delta` 下的 `text_delta` | `response.output_text.delta` |
| 工具参数增量 | `input_json_delta.partial_json` | `response.function_call_arguments.delta` |

这张表只比较本文涉及的普通函数工具路径，不覆盖所有工具类型。

对 Agent 来说，工具结果仍然是 `ToolResultMessage`。它不需要把这些协议分支写进每一次循环，也不必让读取文件的工具知道自己将服务于哪个模型。

### 4.4 网络请求只是中间一段

OpenAI Responses 的 `stream` 大致完成以下工作：

1. 根据兼容性设置处理上下文，初始化内部响应对象。
2. 创建客户端，转换消息与工具，构造参数。
3. 通过请求重试辅助函数调用 `client.responses.create(...)`。
4. 由 `processResponsesStream` 处理服务端事件，更新内部响应并发出统一事件。
5. 检查最终状态，发出 `done` 或 `error`。

这里的重试包装围绕创建请求的操作，不应据此声称任何流中断都能自动恢复。

Anthropic 实现则使用自己的客户端与消息转换逻辑，并在事件处理中将 `tool_use` 转成 Pi 的 `toolCall`。两者没有共用一个假定所有协议相同的响应解析器，而是在各自实现中遵守共同输出约定。

**这才是接口层的关键：内部统一，外部差异由具体适配代码承担。**

## 5. 流式输出不是“把回答逐字打印”那么简单

### 5.1 统一的是事件含义，不是事件名字

OpenAI Responses 收到文本增量时，执行如下代码；见 `openai-responses-shared.ts:713–722`，为**局部源码**：

```ts
const slot = getSlot(event.output_index, "text");
if (!slot) continue;
slot.block.text += event.delta;
stream.push({
  type: "text_delta",
  contentIndex: slot.contentIndex,
  delta: event.delta,
  partial: output,
});
```

这几行不仅转发文字，还完成了三件事：

- 找到这段文字所属的内容块，而不是假设整条响应只有一个字符串。
- 将增量追加到完整响应的当前状态。
- 发出 Pi 的 `text_delta` 事件，并附带内容块位置和当前响应。

Anthropic 收到不同形态的原始事件后，也输出 Pi 的 `text_delta`。于是上层可以用同一种方式更新界面与消息状态。

### 5.2 一次响应有“过程”和“结果”两种读取方式

`AssistantMessageEventStream` 同时提供异步迭代和 `result()`：

```ts
// 教学片段：response 由前面的模型接口返回
for await (const event of response) {
  updateDisplay(event);
}
const message = await response.result();
```

`updateDisplay` 是示意函数，片段不是完整程序。

事件让调用者观察生成过程；`result()` 提供最终 `AssistantMessage`。`utils/event-stream.ts` 中的实现把 `done` 事件中的消息，或 `error` 事件中的错误消息，作为最终结果。

因此，**取得 `result()` 不等于请求成功**：仍须检查消息状态。类型文件还明确说明，某些直接 `streamSimple` 调用可能在缺少认证时同步抛错；一旦返回了流，请求与运行失败应通过流协议表达。不能笼统声称所有入口都绝不抛异常。

第一章的 `streamAssistantResponse` 正是按照这个约定工作：消费增量更新，遇到终止事件后取得最终消息，再交给核心循环判断。

### 5.3 工具参数能解析，不代表可以执行

工具参数可能分几段到达。下面是**教学示意**：

```text
片段一：{"path":
片段二："已授权资料路径"
片段三：}
```

Anthropic 实现在 `input_json_delta` 分支累积 `partialJson`，再调用 `parseStreamingJson` 更新当前参数；OpenAI Responses 的参数增量分支也执行类似工作。

这允许上层观察正在生成的参数，但不要把当前对象当成已完成的工具调用。宽容的分片解析能够从不完整 JSON 中恢复部分结构，却无法保证模型已经输出全部字段。

这里还要区分最终解析：两种实现都会在工具调用完成时调用 `parseToolCallArguments`。它不沿用不完整 JSON 的可解析前缀；若最终文本不是合法 JSON 对象，会返回空参数并设置 `argumentsError`。因此，不能把流式阶段恢复出的对象描述为最终执行参数。

但严格解析仍不能替代响应完整性判断：即使某个调用的 JSON 已完整输出，整条响应仍可能因输出长度限制而截断。语法合法只能说明对象结构可解析，不能证明这次模型响应完整。

这里需要两层协作：

1. **Pi AI 提供可靠的状态信息。**Anthropic 的 `max_tokens` 被映射为 Pi 的 `length`，而不是普通的 `stop`。
2. **Agent 核心作出执行决策。**`agent-loop.ts:263–270` 检查到 `length` 后，调用 `failToolCallsFromTruncatedMessage`，不执行这条消息中的工具调用，而是产生错误结果。

这是“重要性”的一个具体答案：**模型接口层若把截断误报为正常完成，上层就失去了避免错误执行的依据。**但拒绝执行的策略仍属于 Agent 核心，而不是网络适配器。

### 5.4 结束原因属于控制信息

Anthropic 的 `mapStopReason` 中有以下映射：

| 原始原因 | Pi 原因 |
| --- | --- |
| `end_turn` | `stop` |
| `max_tokens` | `length` |
| `tool_use` | `toolUse` |
| `refusal` | `error`，附带说明 |

这不是全部枚举。本版本 `StopReason` 还包含 `pending`、`aborted`、`deferred` 等值；不能把上表当成所有 API 的完整状态机。

OpenAI Responses 实现会在流结束后检查是否仍为 `pending`。即使网络流已经结束，若没有得到有效结束原因，也会按错误处理，而不是把当前文本直接视为成功答案。

取消同样不是普通成功：该实现捕获错误时，根据取消信号将状态设置为 `aborted` 或 `error`，再发出统一错误事件。核心循环遇到这两种状态，会结束当前运行，不执行消息中的工具调用。

注意，核心循环实际从内容块中提取 `toolCall`，并不是只看 `stopReason === "toolUse"`。统一状态提供判断依据，不能代替完整的控制逻辑。

## 6. 为什么独立成模块，而不是直接写进循环？

以下是基于前述源码的**设计分析**，不是未经证实的官方设计动机。

### 6.1 不分层，协议差异会进入业务循环

下面是故意简化的**反例伪代码**：

```ts
while (needsAnotherTurn) {
  if (provider === "anthropic") {
    // 转换消息、解析内容块、还原工具调用、映射结束原因
  } else if (provider === "openai") {
    // 另一套请求与响应处理
  }
  // 执行工具、回填历史、判断是否继续
}
```

这种写法不是不能运行，而是让两类变化挤在一起：一类是模型协议变化，一类是 Agent 工作流变化。添加提供商、修改历史转换或修复分片解析，都可能触碰循环代码。

分层后，核心循环依赖的是 `Message`、`AssistantMessage` 和事件流约定，具体 API 实现负责履行它。即使暂时只使用一个提供商，也能把流解析等复杂细节从调度代码中移走。

### 6.2 独立模块带来的收益

- **局部修改。**某个服务改变事件字段时，尽量在对应实现中修复，而不是要求所有工具和 Agent 循环同时理解它。
- **复用。**不需要工具循环的摘要程序也可以使用模型接口；模型访问能力不必依附于 coding agent 应用。
- **可测试。**事件排队、分片解析、消息转换可以分别测试。Agent 的注入式流函数也让循环测试能够使用模拟响应，而不必每次调用真实模型。
- **清晰依赖。**工具负责业务操作，循环负责调度，模型接口负责与服务交换结构化信息。

这些收益来自职责边界，而不仅仅是目录名称。把所有代码挪到一个叫 `ai` 的目录，却继续到处泄漏提供商响应字段，并没有真正完成分层。

### 6.3 抽象也有成本

统一接口本身需要维护，还要处理不能完全统一的能力：模型是否支持图片、推理选项怎样映射、工具声明能否在对话中变化，以及历史签名是否可以重放。

本版本保留 API 专属选项、兼容性配置和原始诊断字段，说明它并没有把所有模型压成完全相同的功能集合。

因此，合理预期是：

- 更换服务时，**部分调用代码**能够保持稳定。
- 模型能力、成本、上下文容量和输出质量仍需重新评估。
- 更换模型后的任务结果必须验证，不能把“类型兼容”当成“行为相同”。

如果需求始终是固定服务上的短文本请求，直接使用 SDK 可能更简单。独立模块的必要性应随复杂度判断，不是为了架构图多一层。

## 7. 重要，但它不是整个 Agent

| 职责 | 本章所见的归属 |
| --- | --- |
| 请求字段、消息与原始事件转换 | Pi AI 的具体 API 实现 |
| 统一消息、事件流与结束状态 | Pi AI 的公共约定及实现 |
| 本次使用什么模型、如何配置运行时 | 应用层配置与模型运行时；Pi AI 提供相应能力 |
| 是否继续请求、怎样处理截断工具调用 | Agent 核心循环 |
| 查找工具、调用校验并执行工具 | Agent 核心及具体工具实现；校验辅助函数可来自 Pi AI |
| 哪些文件允许读取、哪些操作必须人工确认 | 应用和工具的权限策略，不能交给模型接口层代替 |

在本文场景中，即使模型返回合法的 `read_material` 参数，也不等于它获得了任意文件读取权限。工具实现仍需验证路径处于授权范围。

另外，“只读文件”不等于“没有对外发送”。如果把资料内容放进外部模型请求，它就会离开本机；实践阶段应明确允许发送的数据与目标服务。本章没有执行文件读取工具，也没有向真实模型发送资料，更不涉及覆盖或删除文件。

## 8. 回答开篇问题

**大模型调用不就是一个 REST 接口吗？**

对于最简单的使用方式，可以这样理解。但对 Agent 来说，模型交互还包含结构化消息、多轮工具关联、流式内容组装及终止状态。这些不是一个 `fetch` 自动提供的能力。

**为什么要独立成模块？**

为了让提供商协议变化尽量留在接口层，让 Agent 循环依赖稳定的内部约定，并让模型访问能力可以单独复用和测试。它是复杂度管理的选择，不是每个脚本都必须采用的形式。

**它在 Agent 中这么重要吗？**

重要，因为它把远程模型的输出变成程序能够解释的控制输入。它不决定业务权限，也不执行工具，却必须让上层有依据区分“可以继续处理的完整响应”和“已经失败、取消或截断的响应”。

可以用一句话记住本章：

> **HTTP 负责交换数据；Pi AI 负责把具体模型服务的数据转换为约定的交互语义；Agent 核心再据此组织行动。**

### 自测

1. 为什么两个服务都使用 HTTP 和 JSON，仍不能只替换 URL？
2. 工具参数已经能解析为对象，为什么还要等待最终响应并检查结束原因？
3. `response.result()` 返回消息，是否意味着模型调用成功？
4. 拒绝执行截断响应中的工具调用，属于模型接口层还是 Agent 核心的职责？
5. 更换模型后 TypeScript 没有报错，是否意味着工作流无需重新验证？

对应要点：数据语义不同；分片可能不完整；结果可能携带错误状态；接口层提供信息而核心作出决策；类型兼容不保证行为一致。

本章验证了事件流和 JSON 解析相关的 17 项本地单元测试，并重新运行了 38 项 Agent 核心循环测试，未验证真实提供商请求或完整助手。具体命令、源码导航及验证边界见 [源码与验证记录](#附录源码与验证记录)。

---

## 附录：源码与验证记录

### 基线与范围


- 本地参考仓库：`/Users/scottlee/workspace/github/pi`。
- 固定提交：`530015d93a40d157b5f7e3ddf4713abf14fa9616`，本次通过 `git rev-parse HEAD` 再次核实。
- 包：`@earendil-works/pi-ai`，版本 `1.3.0`，依据 `packages/ai/package.json`。
- 参考仓库阅读前、测试后 `git status --short` 均无输出；未修改参考源码，未安装或升级依赖。
- 第一章记录的远程为 `origin: https://github.com/LicsDaSheng/pi.git`，`upstream: https://github.com/earendil-works/pi.git`。下列固定提交链接按该来源构造；事实依据为本地源码，未验证远程链接可达性。

本章聚焦聊天模型接口、普通函数工具和流式响应。不覆盖图像生成、分类器、全部认证方式、虚拟模型路由或所有 API 的状态机。

### 源码导航

以下路径相对于参考仓库根目录。行号对应固定提交，不应套用到其他版本。

| 文件与范围 | 核查事实 |
| --- | --- |
| `packages/ai/src/index.ts:1–54` | 核心导出与提供商、API 实现、兼容入口分离 |
| `packages/ai/src/types.ts:144` | 传输选项包含 SSE 与 WebSocket 等 |
| `packages/ai/src/types.ts:379–394` | 流函数约定、规范化上下文、同步抛错与流内错误的边界 |
| `packages/ai/src/types.ts:413–474` | 内容块、工具调用、参数错误字段和结束原因 |
| `packages/ai/src/types.ts:570–602` | 最终响应内容、来源、用量、结束状态和诊断字段 |
| `packages/ai/src/utils/transcript.ts:10–64` | 系统消息生成、上下文规范化和工具变更重放 |
| `packages/ai/src/utils/transcript.ts:105–120` | 按能力保留或折叠系统消息 |
| `packages/ai/src/models.ts:885–932` | Pi AI 的 Models 流调用及完成接口 |
| `packages/ai/src/models.ts:1061–1145` | 提供商创建、API 选择与分派 |
| `packages/ai/src/providers/openai.ts` | OpenAI 服务、认证、模型和 API 的组合 |
| `packages/ai/src/providers/anthropic.ts` | Anthropic 提供商工厂与认证配置 |
| `packages/ai/src/api/openai-responses.lazy.ts` | API 实现延迟加载入口 |
| `packages/ai/src/api/openai-responses.ts:161–286` | 请求准备、创建请求重试包装、流处理、取消及错误终止 |
| `packages/ai/src/api/openai-responses-shared.ts:191–436` | 历史消息、普通函数工具调用及工具结果转换 |
| `packages/ai/src/api/openai-responses-shared.ts:511–844` | 内容块定位、增量转换、参数完成及停止状态处理 |
| `packages/ai/src/api/anthropic-messages.ts:759–856` | 工具调用块、文本和 JSON 增量、最终参数解析、结束原因处理 |
| `packages/ai/src/api/anthropic-messages.ts:1339–1346` | 工具结果转换为 tool_result |
| `packages/ai/src/api/anthropic-messages.ts:1664–1691` | Anthropic 停止原因映射 |
| `packages/ai/src/utils/event-stream.ts` | 异步事件队列、终止事件与最终结果 |
| `packages/ai/src/utils/json-parse.ts` | 流式宽容解析与最终工具参数严格解析的区别 |
| `packages/agent/src/agent-loop.ts:242–275` | 错误与取消退出，截断工具调用拒绝执行 |
| `packages/agent/src/agent-loop.ts:381–502` | 模型流函数调用、事件消费、最终响应与截断错误结果 |
| `packages/coding-agent/src/core/sdk.ts:411–446` | 注入 streamFn，调用应用层 ModelRuntime |
| `packages/coding-agent/src/core/model-runtime.ts:723–752` | 普通模型直接调用准备好的提供商，虚拟模型另行路由 |

主要固定提交入口：

- [类型约定](https://github.com/LicsDaSheng/pi/blob/530015d93a40d157b5f7e3ddf4713abf14fa9616/packages/ai/src/types.ts)
- [提供商与模型接口](https://github.com/LicsDaSheng/pi/blob/530015d93a40d157b5f7e3ddf4713abf14fa9616/packages/ai/src/models.ts)
- [OpenAI Responses 实现](https://github.com/LicsDaSheng/pi/blob/530015d93a40d157b5f7e3ddf4713abf14fa9616/packages/ai/src/api/openai-responses.ts)
- [OpenAI 消息与事件转换](https://github.com/LicsDaSheng/pi/blob/530015d93a40d157b5f7e3ddf4713abf14fa9616/packages/ai/src/api/openai-responses-shared.ts)
- [Anthropic 实现](https://github.com/LicsDaSheng/pi/blob/530015d93a40d157b5f7e3ddf4713abf14fa9616/packages/ai/src/api/anthropic-messages.ts)
- [事件流](https://github.com/LicsDaSheng/pi/blob/530015d93a40d157b5f7e3ddf4713abf14fa9616/packages/ai/src/utils/event-stream.ts)
- [JSON 解析](https://github.com/LicsDaSheng/pi/blob/530015d93a40d157b5f7e3ddf4713abf14fa9616/packages/ai/src/utils/json-parse.ts)
- [Agent 循环](https://github.com/LicsDaSheng/pi/blob/530015d93a40d157b5f7e3ddf4713abf14fa9616/packages/agent/src/agent-loop.ts)
- [应用运行时](https://github.com/LicsDaSheng/pi/blob/530015d93a40d157b5f7e3ddf4713abf14fa9616/packages/coding-agent/src/core/model-runtime.ts)

### 易误读之处

1. coding agent 的 `ModelRuntime.streamSimple` 不是先调用 Pi AI 的 `Models.streamSimple`，而是准备请求后直接调用提供商接口。
2. Pi AI 的统一类型不是提供商请求原样透传，需要实际转换代码履行约定。
3. `result()` 返回的消息可能表示错误，不应把 Promise 得到结果等同于调用成功。
4. `parseStreamingJson` 可以处理部分 JSON；最终的 `parseToolCallArguments` 不保留畸形 JSON 的可解析前缀，会记录 `argumentsError`。正文没有把流式部分对象当成最终工具参数。
5. Agent 从内容块提取工具调用，并另外检查错误、取消和长度截断，不只判断 `toolUse`。
6. 接口层报告 `length`，拒绝执行的决策在 Agent 核心。合法参数也不代替权限授权。
7. 创建请求的重试包装不证明流中断可以自动恢复。
8. 模块拆分收益是基于源码结构的工程分析，不声称已查证官方设计动机。

### 实际测试

使用参考仓库已有依赖，未发起真实模型请求。

#### 事件流与 JSON 解析

```sh
cd ~/workspace/github/pi/packages/ai
NO_COLOR=1 node ../../node_modules/vitest/dist/cli.js --run test/event-stream.test.ts test/json-parse.test.ts
```

实际结果：

```text
Test Files  2 passed (2)
     Tests  17 passed (17)
```

验证事件流队列及终止结果、时间记录，以及 JSON 转义修复和最终工具参数解析等测试所断言的行为。JSON 测试包括最终阶段不补全截断 JSON、不保留畸形 JSON 的合法前缀及拒绝非对象参数；不据此宣称所有网络分片组合均获覆盖。

#### Agent 核心循环

为核查接口状态如何影响执行，再次运行第一章使用的循环测试，而非只引用第一章结果：

```sh
cd ~/workspace/github/pi/packages/agent
NO_COLOR=1 node ../../node_modules/vitest/dist/cli.js --run test/agent-loop.test.ts
```

实际结果：

```text
Test Files  1 passed (1)
     Tests  38 passed (38)
```

覆盖该测试文件断言的核心控制流，包括截断工具调用等情形。两次测试共 55 项通过，不代表所有提供商和应用入口已验证。
