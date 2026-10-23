---
title: "第一章：Pi 的 Agent 循环——原理、设计与核心代码链路"
published: 2026-10-21
description: "沿 Pi 源码追踪一次用户输入如何进入循环、请求模型、执行工具并回传结果，讲清 Agent 循环的继续、结束、出错与取消条件。"
tags: [pi, agent-loop, 源码剖析]
category: Pi 教程
series: pi-tutorial
seriesOrder: 1
seriesStage: 1
draft: false
---

> 阶段：源码级剖析。适用源码：本地 Pi 仓库 `~/workspace/github/pi`，包版本 `1.3.0`，提交 `530015d93a40d157b5f7e3ddf4713abf14fa9616`。
>
> 该仓库的 `origin` 是 `LicsDaSheng/pi`，`upstream` 是 `earendil-works/pi`，本文不将其视为其他 Pi 发行版的同版本实现。源码定位和测试范围见 [源码与验证记录](#附录源码与验证记录)。以下代码均为局部源码或明确标注的教学伪代码，不是可直接运行的完整项目。

## 本章目标与阅读准备

本章回答三个问题：Agent 为什么需要循环？Pi 如何组织这个循环？一次用户输入具体经过哪些函数，才变成模型请求、工具执行和最终回答？

读完后，你应能沿源码找到循环入口，解释消息如何累积，指出继续和结束的实际条件，并区分核心循环与 coding agent 应用层的职责。

只需具备变量、函数、数组、条件分支和循环的基础知识。TypeScript 和异步编程的必要概念会在文中解释。本章不实现完整助手，而是为后续“读取资料 → 提取信息 → 生成知识卡片”的贯穿项目建立执行模型；资料类型、卡片结构和存储方案仍未确定。

## 1. 从一次模型调用到 Agent 循环

假设用户提出：“读取我授权的资料，提取三个要点。”

大语言模型（LLM）接收消息并生成响应，但生成文本本身不会让本地文件被读取。即使模型返回一个名为 `read_material` 的工具调用，也只是输出了“请求程序调用这个工具”的结构化数据。

宿主程序必须完成后续工作：找到工具、检查参数、执行读取、把结果交给模型。模型第二次获得资料内容，才有依据提取要点。

<!-- pi-diagram:pi-loop:start -->
<figure class="pi-diagram">
<div class="pi-diagram-scroll" tabindex="0" role="region" aria-label="01 · Agent 循环：行动之后，再看结果，窄屏可横向滚动">
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 720 680" width="720" height="680" role="img" aria-labelledby="pi-loop-title pi-loop-desc">
<title id="pi-loop-title">01 · Agent 循环：行动之后，再看结果</title><desc id="pi-loop-desc">流程的完整文字版本位于图后的可展开说明。</desc>
<defs><pattern id="pi-loop-hatch" width="9" height="9" patternUnits="userSpaceOnUse"><path d="M-2 9 9-2M5 12 12 5" stroke="#80775f" stroke-width=".65" opacity=".13"/></pattern><marker id="pi-loop-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M1 1 8 5 1 9" fill="none" stroke="#4a4a42" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></marker></defs>
<rect x="3" y="3" width="714" height="674" rx="17" fill="#fffaf0" stroke="#8da4ad" stroke-width="1.8"/><rect x="6" y="5" width="708" height="669" rx="15" fill="none" stroke="#8da4ad" stroke-opacity=".3"/>
<g fill="#302d28" font-family="LXGW WenKai, Kaiti SC, KaiTi, serif"><text x="35" y="42" text-anchor="start" font-size="23">01 · Agent 循环：行动之后，再看结果</text><path d="M252 76 Q360.0 73 468 75 Q481 75 480 88 L479 133 Q480 146 467 145 Q360.0 147 252 144 Q239 145 240 132 L241 87 Q240 75 252 76Z" fill="#dcebf0" stroke="#494940" stroke-width="1.8"/><path d="M252 76 Q360.0 73 468 75 Q481 75 480 88 L479 133 Q480 146 467 145 Q360.0 147 252 144 Q239 145 240 132 L241 87 Q240 75 252 76Z" fill="url(#pi-loop-hatch)" stroke="#77735f" stroke-opacity=".25" transform="translate(1.8,1.4)"/><text x="360.0" y="116.0" text-anchor="middle" font-size="19">用户输入</text><path d="M252 191 Q360.0 188 468 190 Q481 190 480 203 L479 248 Q480 261 467 260 Q360.0 262 252 259 Q239 260 240 247 L241 202 Q240 190 252 191Z" fill="#e9e0f0" stroke="#494940" stroke-width="1.8"/><path d="M252 191 Q360.0 188 468 190 Q481 190 480 203 L479 248 Q480 261 467 260 Q360.0 262 252 259 Q239 260 240 247 L241 202 Q240 190 252 191Z" fill="url(#pi-loop-hatch)" stroke="#77735f" stroke-opacity=".25" transform="translate(1.8,1.4)"/><text x="360.0" y="231.0" text-anchor="middle" font-size="19">请求模型</text><path d="M252 306 Q360.0 303 468 305 Q481 305 480 318 L479 363 Q480 376 467 375 Q360.0 377 252 374 Q239 375 240 362 L241 317 Q240 305 252 306Z" fill="#edf0d2" stroke="#494940" stroke-width="1.8"/><path d="M252 306 Q360.0 303 468 305 Q481 305 480 318 L479 363 Q480 376 467 375 Q360.0 377 252 374 Q239 375 240 362 L241 317 Q240 305 252 306Z" fill="url(#pi-loop-hatch)" stroke="#77735f" stroke-opacity=".25" transform="translate(1.8,1.4)"/><text x="360.0" y="346.0" text-anchor="middle" font-size="19">模型响应</text><path d="M360 148 L360 183" fill="none" stroke="#4a4a42" stroke-width="2" stroke-linecap="round" marker-end="url(#pi-loop-arrow)"/><path d="M360 263 L360 298" fill="none" stroke="#4a4a42" stroke-width="2" stroke-linecap="round" marker-end="url(#pi-loop-arrow)"/><path d="M72 441 Q190.0 438 308 440 Q321 440 320 453 L319 513 Q320 526 307 525 Q190.0 527 72 524 Q59 525 60 512 L61 452 Q60 440 72 441Z" fill="#f3dedb" stroke="#494940" stroke-width="1.8"/><path d="M72 441 Q190.0 438 308 440 Q321 440 320 453 L319 513 Q320 526 307 525 Q190.0 527 72 524 Q59 525 60 512 L61 452 Q60 440 72 441Z" fill="url(#pi-loop-hatch)" stroke="#77735f" stroke-opacity=".25" transform="translate(1.8,1.4)"/><text x="190.0" y="475.0" text-anchor="middle" font-size="19">工具调用 → 程序执行</text><text x="190.0" y="502.0" text-anchor="middle" font-size="19">工具结果写入消息</text><path d="M412 441 Q530.0 438 648 440 Q661 440 660 453 L659 513 Q660 526 647 525 Q530.0 527 412 524 Q399 525 400 512 L401 452 Q400 440 412 441Z" fill="#faedb9" stroke="#494940" stroke-width="1.8"/><path d="M412 441 Q530.0 438 648 440 Q661 440 660 453 L659 513 Q660 526 647 525 Q530.0 527 412 524 Q399 525 400 512 L401 452 Q400 440 412 441Z" fill="url(#pi-loop-hatch)" stroke="#77735f" stroke-opacity=".25" transform="translate(1.8,1.4)"/><text x="530.0" y="475.0" text-anchor="middle" font-size="19">普通回答</text><text x="530.0" y="502.0" text-anchor="middle" font-size="19">判断是否继续运行</text><path d="M300 378 C300 413 190 403 190 433" fill="none" stroke="#4a4a42" stroke-width="2" stroke-linecap="round" marker-end="url(#pi-loop-arrow)"/><path d="M420 378 C420 413 530 403 530 433" fill="none" stroke="#4a4a42" stroke-width="2" stroke-linecap="round" marker-end="url(#pi-loop-arrow)"/><path d="M60 480 C22 480 25 228 233 225" fill="none" stroke="#4a4a42" stroke-width="2" stroke-linecap="round" marker-end="url(#pi-loop-arrow)"/><text x="94" y="292" text-anchor="middle" font-size="17">带回结果</text><path d="M442 586 Q530.0 583 618 585 Q631 585 630 598 L629 628 Q630 641 617 640 Q530.0 642 442 639 Q429 640 430 627 L431 597 Q430 585 442 586Z" fill="#edf0d2" stroke="#494940" stroke-width="1.8"/><path d="M442 586 Q530.0 583 618 585 Q631 585 630 598 L629 628 Q630 641 617 640 Q530.0 642 442 639 Q429 640 430 627 L431 597 Q430 585 442 586Z" fill="url(#pi-loop-hatch)" stroke="#77735f" stroke-opacity=".25" transform="translate(1.8,1.4)"/><text x="530.0" y="618.5" text-anchor="middle" font-size="19">结束</text><path d="M530 528 L530 578" fill="none" stroke="#4a4a42" stroke-width="2" stroke-linecap="round" marker-end="url(#pi-loop-arrow)"/><text x="555" y="563" text-anchor="start" font-size="16">结束</text><path d="M660 480 C705 480 704 224 487 225" fill="none" stroke="#4a4a42" stroke-width="2" stroke-linecap="round" marker-end="url(#pi-loop-arrow)"/><text x="638" y="292" text-anchor="middle" font-size="17">继续</text></g>
</svg>
</div>
<figcaption>01 · Agent 循环：行动之后，再看结果</figcaption>
</figure>

<details class="pi-diagram-source">
<summary>展开文字链路（可复制）</summary>

```text
用户输入
   ↓
请求模型 ←──────────────────┐
   ↓                       │
模型响应                   │
   ├─ 工具调用 → 程序执行 → 工具结果写入消息
   └─ 普通回答 → 判断是否还有继续运行的理由 → 结束或继续
```

</details>
<!-- pi-diagram:pi-loop:end -->

这就是 Agent 循环的基本形态：**模型提出下一步，程序执行动作，将结果放回上下文，再请求模型。**

这里的“上下文”指本次请求可使用的信息，主要包括系统说明、对话消息与工具声明。它不是模型能任意访问的外部世界。

上图是教学模型。Pi 的真实结束判断不只是“有没有工具调用”：排队输入、回合钩子和工具终止提示都会影响控制流。后文将逐项展开。

## 2. 阅读代码需要的最小概念

### 2.1 消息、工具调用与工具结果

Pi 的模型消息包括以下角色：

| 角色 | 作用 |
| --- | --- |
| `system` | 系统说明；本版本还通过系统消息记录工具声明变更 |
| `user` | 用户提供的文本、图片等输入 |
| `assistant` | 模型生成的响应，内容中可能包含文本和工具调用 |
| `toolResult` | 程序执行工具后产生的结果 |

一次工具调用不是独立的用户消息，而是 `assistant.content` 中的一个内容块。下列对象是**省略字段的教学数据**：

```ts
const call = {
  type: "toolCall",
  id: "call_1",
  name: "read_material",
  arguments: { path: "允许读取的示例资料" },
};

const result = {
  role: "toolResult",
  toolCallId: "call_1",
  toolName: "read_material",
  content: [{ type: "text", text: "资料正文……" }],
  isError: false,
};
```

`toolCallId` 把结果与请求对应起来。若一条模型响应包含多个工具调用，仅凭工具名称不足以区分结果，因为同一个工具可能被调用多次。

`AgentMessage` 则允许在标准模型消息之外扩展应用消息。因此，进入模型接口前还需要一次转换，不能假设所有应用消息都能直接发送给模型。

### 2.2 TypeScript 与异步代码

本文会用到以下语法：

- `AgentMessage[]`：一个消息数组；类型注解用于约束代码，不会自行生成消息。
- `Promise<T>`：一个异步操作最终产生 `T` 类型结果。
- `async` / `await`：声明异步函数，并等待异步结果；`await` 不等于把整个程序阻塞住。
- `for await (...)`：依次读取异步到来的事件，适合处理模型流式响应。
- `config.finishTurn?.(...)`：仅在可选函数存在时调用。
- `value ?? fallback`：只有左侧是 `null` 或 `undefined` 才使用默认值。
- `{ ...context }` 与 `[...messages]`：浅拷贝对象或数组，内部消息对象不因此被递归复制。

“流式响应”是指结果分批到达，例如文本逐段出现；“Agent 循环”则是多次模型请求与工具执行的调度。两者是不同层次的循环。

## 3. 源码分层：谁负责什么

本章主要阅读三个包：

| 层次 | 目录 | 本章关注的职责 |
| --- | --- | --- |
| 模型接口层 | `packages/ai` | 模型消息与流式响应接口、上下文规范化、工具参数校验 |
| Agent 核心层 | `packages/agent` | 多次请求的调度、工具执行、消息队列、状态与事件 |
| coding agent 应用层 | `packages/coding-agent` | 用户输入处理、会话准备、扩展集成和模型运行时接线 |

核心层又分为两部分：

- `agent.ts` 中的 `Agent`：有状态封装，管理历史消息、运行状态、取消信号和排队输入。
- `agent-loop.ts`：执行本次运行的控制流，通过事件回调报告进展。

关键导航如下，行号均针对本章固定提交：

| 文件 | 入口或关键函数 | 阅读目的 |
| --- | --- | --- |
| `coding-agent/src/core/agent-session.ts:2058` | `AgentSession.prompt` | 普通输入如何进入会话 |
| `coding-agent/src/core/agent-session.ts:1837` | `_startRun` | 准备消息并调用核心 Agent |
| `coding-agent/src/core/sdk.ts:411` | `new Agent(...)` | 模型接口与应用逻辑如何注入 |
| `agent/src/agent.ts:371` | `Agent.prompt` | 字符串如何变成消息，如何禁止重入 |
| `agent/src/agent.ts:432` | `runPromptMessages` | 进入核心循环 |
| `agent/src/agent-loop.ts:102` | `runAgentLoop` | 初始化上下文和生命周期事件 |
| `agent/src/agent-loop.ts:163` | `runLoop` | 双层循环与继续条件 |
| `agent/src/agent-loop.ts:381` | `streamAssistantResponse` | 消息转换与流式响应汇总 |
| `agent/src/agent-loop.ts:508` | `executeToolCalls` | 串行或并行工具执行 |
| `agent/src/agent-loop.ts:708` | `prepareToolCall` | 工具查找、参数校验与执行前钩子 |
| `agent/src/agent.ts:565` | `processEvents` | 事件如何更新 Agent 状态 |

完整路径和固定提交链接见 [源码索引](#源码索引)。阅读时先抓住主链，再回到分支；不必先理解会话压缩、缓存预热或所有扩展机制。

## 4. 从用户输入到循环入口

### 4.1 应用入口不是直接调用模型

以空闲会话中的普通文本输入为例，主链是：

<!-- pi-diagram:pi-entry:start -->
<figure class="pi-diagram">
<div class="pi-diagram-scroll" tabindex="0" role="region" aria-label="02 · 从应用输入到循环入口，窄屏可横向滚动">
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 720 625" width="720" height="625" role="img" aria-labelledby="pi-entry-title pi-entry-desc">
<title id="pi-entry-title">02 · 从应用输入到循环入口</title><desc id="pi-entry-desc">流程的完整文字版本位于图后的可展开说明。</desc>
<defs><pattern id="pi-entry-hatch" width="9" height="9" patternUnits="userSpaceOnUse"><path d="M-2 9 9-2M5 12 12 5" stroke="#80775f" stroke-width=".65" opacity=".13"/></pattern><marker id="pi-entry-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M1 1 8 5 1 9" fill="none" stroke="#4a4a42" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></marker></defs>
<rect x="3" y="3" width="714" height="619" rx="17" fill="#fffaf0" stroke="#8da4ad" stroke-width="1.8"/><rect x="6" y="5" width="708" height="614" rx="15" fill="none" stroke="#8da4ad" stroke-opacity=".3"/>
<g fill="#302d28" font-family="LXGW WenKai, Kaiti SC, KaiTi, serif"><text x="35" y="40" text-anchor="start" font-size="23">02 · 从应用输入到循环入口</text><path d="M107 66 Q360.0 63 613 65 Q626 65 625 78 L624 129 Q625 142 612 141 Q360.0 143 107 140 Q94 141 95 128 L96 77 Q95 65 107 66Z" fill="#dcebf0" stroke="#494940" stroke-width="1.8"/><path d="M107 66 Q360.0 63 613 65 Q626 65 625 78 L624 129 Q625 142 612 141 Q360.0 143 107 140 Q94 141 95 128 L96 77 Q95 65 107 66Z" fill="url(#pi-entry-hatch)" stroke="#77735f" stroke-opacity=".25" transform="translate(1.8,1.4)"/><text x="360.0" y="95.5" text-anchor="middle" font-size="19">AgentSession.prompt(text)</text><text x="360.0" y="122.5" text-anchor="middle" font-size="19">输入处理、模板展开、模型与认证检查</text><path d="M360 144 Q358 157 360 169" fill="none" stroke="#4a4a42" stroke-width="2" stroke-linecap="round" marker-end="url(#pi-entry-arrow)"/><path d="M107 176 Q360.0 173 613 175 Q626 175 625 188 L624 239 Q625 252 612 251 Q360.0 253 107 250 Q94 251 95 238 L96 187 Q95 175 107 176Z" fill="#e9e0f0" stroke="#494940" stroke-width="1.8"/><path d="M107 176 Q360.0 173 613 175 Q626 175 625 188 L624 239 Q625 252 612 251 Q360.0 253 107 250 Q94 251 95 238 L96 187 Q95 175 107 176Z" fill="url(#pi-entry-hatch)" stroke="#77735f" stroke-opacity=".25" transform="translate(1.8,1.4)"/><text x="360.0" y="205.5" text-anchor="middle" font-size="19">_startRun(...)</text><text x="360.0" y="232.5" text-anchor="middle" font-size="19">_prepareRun(...)</text><path d="M360 254 Q358 267 360 279" fill="none" stroke="#4a4a42" stroke-width="2" stroke-linecap="round" marker-end="url(#pi-entry-arrow)"/><path d="M107 286 Q360.0 283 613 285 Q626 285 625 298 L624 349 Q625 362 612 361 Q360.0 363 107 360 Q94 361 95 348 L96 297 Q95 285 107 286Z" fill="#edf0d2" stroke="#494940" stroke-width="1.8"/><path d="M107 286 Q360.0 283 613 285 Q626 285 625 298 L624 349 Q625 362 612 361 Q360.0 363 107 360 Q94 361 95 348 L96 297 Q95 285 107 286Z" fill="url(#pi-entry-hatch)" stroke="#77735f" stroke-opacity=".25" transform="translate(1.8,1.4)"/><text x="360.0" y="315.5" text-anchor="middle" font-size="19">agent.prompt(messages)</text><text x="360.0" y="342.5" text-anchor="middle" font-size="19">normalizePromptInput(...)</text><path d="M360 364 Q358 377 360 389" fill="none" stroke="#4a4a42" stroke-width="2" stroke-linecap="round" marker-end="url(#pi-entry-arrow)"/><path d="M107 396 Q360.0 393 613 395 Q626 395 625 408 L624 459 Q625 472 612 471 Q360.0 473 107 470 Q94 471 95 458 L96 407 Q95 395 107 396Z" fill="#f3dedb" stroke="#494940" stroke-width="1.8"/><path d="M107 396 Q360.0 393 613 395 Q626 395 625 408 L624 459 Q625 472 612 471 Q360.0 473 107 470 Q94 471 95 458 L96 407 Q95 395 107 396Z" fill="url(#pi-entry-hatch)" stroke="#77735f" stroke-opacity=".25" transform="translate(1.8,1.4)"/><text x="360.0" y="425.5" text-anchor="middle" font-size="19">runPromptMessages(...)</text><text x="360.0" y="452.5" text-anchor="middle" font-size="19">runWithLifecycle(...)</text><path d="M360 474 Q358 487 360 499" fill="none" stroke="#4a4a42" stroke-width="2" stroke-linecap="round" marker-end="url(#pi-entry-arrow)"/><path d="M107 506 Q360.0 503 613 505 Q626 505 625 518 L624 569 Q625 582 612 581 Q360.0 583 107 580 Q94 581 95 568 L96 517 Q95 505 107 506Z" fill="#faedb9" stroke="#494940" stroke-width="1.8"/><path d="M107 506 Q360.0 503 613 505 Q626 505 625 518 L624 569 Q625 582 612 581 Q360.0 583 107 580 Q94 581 95 568 L96 517 Q95 505 107 506Z" fill="url(#pi-entry-hatch)" stroke="#77735f" stroke-opacity=".25" transform="translate(1.8,1.4)"/><text x="360.0" y="535.5" text-anchor="middle" font-size="19">runAgentLoop(...)</text><text x="360.0" y="562.5" text-anchor="middle" font-size="19">runLoop(...)</text></g>
</svg>
</div>
<figcaption>02 · 从应用输入到循环入口</figcaption>
</figure>

<details class="pi-diagram-source">
<summary>展开文字链路（可复制）</summary>

```text
AgentSession.prompt(text)
  → 输入处理、模板展开、模型与认证检查
  → _startRun(...)
      → _prepareRun(...)
      → agent.prompt(messages)
          → normalizePromptInput(...)
          → runPromptMessages(...)
              → runWithLifecycle(...)
                  → runAgentLoop(...)
                      → runLoop(...)
```

</details>
<!-- pi-diagram:pi-entry:end -->

这不是所有输入的共同路径。扩展命令可以被直接处理而不调用模型；会话运行期间的输入可以进入 `steer` 或 `followUp` 队列。直接使用核心 `Agent` 开发自定义智能体，也不必经过 `AgentSession`。

应用层 `_startRun` 在 `agent.prompt` 返回后，还会检查后续处理与会话收尾边界，必要时调用 `agent.continue()`。因此，**核心一次运行结束，不一定等于应用会话已完全收尾。**

### 4.2 `Agent.prompt`：检查运行状态并统一输入

`agent.ts:373–382` 的局部源码：

```ts
async prompt(input: string | AgentMessage | AgentMessage[], images?: ImageContent[]): Promise<void> {
  if (this.activeRun) {
    throw new Error(
      "Agent is already processing a prompt. Use steer() or followUp() to queue messages, or wait for completion.",
    );
  }
  const messages = this.normalizePromptInput(input, images);
  await this.runPromptMessages(messages);
}
```

这里先解决并发状态问题：同一个 `Agent` 正在运行时，不允许再直接启动第二个 `prompt`。调用者应排队或等待，而不是让两个循环同时修改同一份对话。

`normalizePromptInput` 将字符串包装为 `role: "user"` 的消息；如果输入本来就是消息数组，则沿用该数组。

接着，`runPromptMessages` 创建上下文快照和循环配置，将 `(event) => this.processEvents(event)` 作为事件接收函数传给 `runAgentLoop`。`runWithLifecycle` 则创建 `AbortController`，设置忙碌状态，并在结束时清理运行状态。

注意本版本的实际调用是 **`Agent` → `runAgentLoop`**。同文件虽然还导出 `agentLoop`，但它是另一种接口：将回调形式包装成 `EventStream`，不是这里必经的一层。

### 4.3 `runAgentLoop`：一次运行从哪里开始

`agent-loop.ts:110–115` 的局部源码：

```ts
const initialMessages = declareToolChanges(context, prompts);
const newMessages: AgentMessage[] = [...initialMessages];
const currentContext: AgentContext = {
  ...context,
  messages: [...context.messages, ...initialMessages],
};
```

这里有两个不同集合：

- `currentContext.messages`：历史消息加本次消息，用于后续请求。
- `newMessages`：只记录本次调用新增的消息，作为运行结果返回。

`declareToolChanges` 对比消息历史中已声明的工具和当前可执行工具。如果有变化，就通过系统消息中的 `toolsAdded` / `toolsRemoved` 记录差异。这是本版本的重要特征：不能只把工具理解为每次请求单独附加的一份固定列表。

随后依次发出 `agent_start`、`turn_start`，再为初始消息发出 `message_start` 和 `message_end`，最后进入 `runLoop`。

## 5. 核心循环：为什么有两层 `while`

先约定三个单位：

- **模型请求**：调用一次模型接口并接收响应。
- **回合（turn）**：本章指核心循环中一次模型响应及其对应工具结果的处理，通常对应一次请求。
- **运行（run）**：从 `agent_start` 到 `agent_end`，可能包含多个回合。

`runLoop` 的外层是 `while (true)`，内层条件为：

```ts
while (hasMoreToolCalls || pendingMessages.length > 0) {
```

进入外层时，`hasMoreToolCalls` 会设为 `true`，保证至少产生一次请求。因此，这个变量不意味着“进入时已经知道模型会调用工具”，而是在参与控制是否继续进入内层。

### 5.1 内层：处理工具反馈与运行中输入

一次普通回合按以下顺序推进：

1. 若已有上一回合，调用 `prepareNextTurn`，必要时替换上下文、模型等状态。
2. 将准备好的消息和待处理消息写入上下文，并发出消息事件。
3. 调用 `prepareRequest`，进行本次请求前的状态准备；它也适用于第一次请求。
4. 调用 `streamAssistantResponse`，得到完整的模型消息。
5. 若模型消息表示错误或取消，走硬退出分支。
6. 从内容块中提取工具调用，执行工具，追加结果。
7. 调用 `finishTurn`，发出 `turn_end`。
8. 根据回合决策、工具执行结果和 steering 队列决定后续动作。

`prepareNextTurn` 与 `prepareRequest` 不应混淆：前者只在已经完成回合且确实要继续时调用，后者位于每次请求前，包括第一次。

Steering 是运行中插入的引导消息。此版本会在循环开始时检查它，在回合完成后再次检查；若下一回合准备耗时且前次未取到消息，还会补查一次。**它不是在任意工具执行中间立即抢占工具。**

### 5.2 外层：本来要停下时，还有没有后续工作

内层不再需要继续时，外层先读取 follow-up 队列。Follow-up 是“当前任务自然停下后再处理”的排队消息。

若没有 follow-up，但 `finishTurn` 返回了 `{ action: "continue" }` 且尚无其他自然请求满足该决策，外层会额外安排一次仅使用现有上下文的请求。

若工具反馈、steering 或 follow-up 已经触发下一次请求，就不再为同一个 `continue` 决策叠加一次请求。

当这些理由都不存在时，退出外层并发出 `agent_end`。

### 5.3 结束条件不是单一布尔值

| 条件 | 本版本行为 |
| --- | --- |
| 模型 `stopReason` 为 `error` 或 `aborted` | 调用回合收尾钩子后发出结束事件并返回；不能由其 `continue` 决策复活 |
| 正常回合的 `finishTurn` 返回 `end` | 直接结束，不再轮询队列 |
| 工具批次未整体要求终止 | 通常安排下一次请求，让模型看到工具结果 |
| 工具批次的全部最终结果都带 `terminate: true` | 不再因为该批工具结果自动继续；队列或显式继续仍可能触发请求 |
| 没有工具调用，但有 steering、follow-up 或显式继续 | 仍可能继续 |
| 没有任何继续理由 | 自然结束 |

核心 `runLoop` 本身没有一个固定的最大回合数检查。对于自定义 Agent，预算、最大次数或业务完成条件可以作为额外策略设计，但不能误称为此循环自带的统一限制。

## 6. 一次模型请求内部发生了什么

### 6.1 在模型边界转换消息

`streamAssistantResponse` 先执行如下局部源码（`agent-loop.ts:389–397`）：

```ts
let messages = context.messages;
if (config.transformContext) {
  messages = await config.transformContext(messages, signal);
}

const llmMessages = await config.convertToLlm(messages);
const llmContext = normalizeContext({ messages: llmMessages });
```

这三个步骤解决不同问题：

1. `transformContext`：仍在应用消息层面整理上下文，例如选择请求所需的信息。
2. `convertToLlm`：转换或过滤应用专用消息，得到模型接口支持的消息。
3. `normalizeContext`：规范化模型接口上下文。

返回新的转换数组，不等于自动替换 Agent 的长期历史。这里主要是在构造本次请求视图；若钩子直接修改了共享消息对象，则还要考虑浅拷贝带来的影响。

随后解析本次请求的 API key，并执行注入的 `streamFunction`：

```ts
const response = await streamFunction(config.model, llmContext, {
  ...config,
  apiKey: resolvedApiKey,
  signal,
});
```

coding agent 的 `sdk.ts:420–430` 把该函数连接到 `modelRuntime.streamSimple`。这说明核心循环并不在这里硬编码某家模型服务的 HTTP 请求。

### 6.2 流式事件与最终消息

`streamAssistantResponse` 使用 `for await` 消费响应事件：

| 模型流事件 | 核心处理 |
| --- | --- |
| `start` | 将临时 assistant 消息加入上下文，发出 `message_start` |
| 文本、思考或工具调用的增量事件 | 更新临时消息，发出 `message_update` |
| `done` 或 `error` | 读取最终结果，替换临时消息，发出 `message_end` |

如果响应没有先发出 `start`，代码也会在最终结果到达时补充消息开始事件。

这里不是“每收到几个字符就添加一条历史消息”，而是反复更新同一条尚未完成的 assistant 消息。完整响应取得后，`runLoop` 才识别和执行工具调用；它不会直接执行尚在流式拼接中的参数。

## 7. 工具执行：从模型建议到程序动作

### 7.1 提取调用，但先排除不安全的截断结果

循环通过以下表达式取出工具调用：

```ts
const toolCalls = message.content.filter((c) => c.type === "toolCall");
```

如果响应因为输出 token 上限而结束，即 `stopReason === "length"`，本版本**不执行其中任何工具调用**。原因是参数可能被截断；即使恢复出的 JSON 可以解析，也不代表内容完整。

`failToolCallsFromTruncatedMessage` 为这些调用生成错误结果，交回模型，让它有机会重新生成完整调用。这与模型响应本身的 `error` 硬退出不是同一条路径。

### 7.2 串行还是并行

`executeToolCalls` 的局部源码（`agent-loop.ts:515–523`）：

```ts
const toolCalls = assistantMessage.content.filter((c) => c.type === "toolCall");
const hasSequentialToolCall = toolCalls.some(
  (tc) => currentContext.tools?.find((t) => t.name === tc.name)?.executionMode === "sequential",
);
if (config.toolExecution === "sequential" || hasSequentialToolCall) {
  return executeToolCallsSequential(currentContext, assistantMessage, toolCalls, config, signal, emit);
}
return executeToolCallsParallel(currentContext, assistantMessage, toolCalls, config, signal, emit);
```

`Agent` 默认将 `toolExecution` 设为 `"parallel"`。如果全局要求串行，或本批任一工具声明 `executionMode: "sequential"`，整批改为串行。

并行分支先按顺序准备各个调用，再用 `Promise.all` 执行已准备好的任务。工具完成事件可以按实际完成顺序发出，但最终工具结果消息按原始调用顺序写入。不要把“完成顺序”和“历史排列顺序”混为一谈。

设计上的取舍是：独立读取任务可能从并行中获益；存在文件写入依赖的工具则需要更谨慎的顺序控制。后一句是开发建议，不意味着 Pi 会自动推断所有业务依赖。

### 7.3 参数校验、执行前钩子和真正执行

一次调用的主链如下：

<!-- pi-diagram:pi-tools:start -->
<figure class="pi-diagram">
<div class="pi-diagram-scroll" tabindex="0" role="region" aria-label="03 · 工具执行：准备、校验与结果回写，窄屏可横向滚动">
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 720 845" width="720" height="845" role="img" aria-labelledby="pi-tools-title pi-tools-desc">
<title id="pi-tools-title">03 · 工具执行：准备、校验与结果回写</title><desc id="pi-tools-desc">流程的完整文字版本位于图后的可展开说明。</desc>
<defs><pattern id="pi-tools-hatch" width="9" height="9" patternUnits="userSpaceOnUse"><path d="M-2 9 9-2M5 12 12 5" stroke="#80775f" stroke-width=".65" opacity=".13"/></pattern><marker id="pi-tools-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M1 1 8 5 1 9" fill="none" stroke="#4a4a42" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></marker></defs>
<rect x="3" y="3" width="714" height="839" rx="17" fill="#fffaf0" stroke="#8da4ad" stroke-width="1.8"/><rect x="6" y="5" width="708" height="834" rx="15" fill="none" stroke="#8da4ad" stroke-opacity=".3"/>
<g fill="#302d28" font-family="LXGW WenKai, Kaiti SC, KaiTi, serif"><text x="35" y="40" text-anchor="start" font-size="23">03 · 工具执行：准备、校验与结果回写</text><path d="M107 66 Q360.0 63 613 65 Q626 65 625 78 L624 129 Q625 142 612 141 Q360.0 143 107 140 Q94 141 95 128 L96 77 Q95 65 107 66Z" fill="#dcebf0" stroke="#494940" stroke-width="1.8"/><path d="M107 66 Q360.0 63 613 65 Q626 65 625 78 L624 129 Q625 142 612 141 Q360.0 143 107 140 Q94 141 95 128 L96 77 Q95 65 107 66Z" fill="url(#pi-tools-hatch)" stroke="#77735f" stroke-opacity=".25" transform="translate(1.8,1.4)"/><text x="360.0" y="95.5" text-anchor="middle" font-size="19">prepareToolCall</text><text x="360.0" y="122.5" text-anchor="middle" font-size="19">按名称查找工具</text><path d="M360 144 Q358 157 360 169" fill="none" stroke="#4a4a42" stroke-width="2" stroke-linecap="round" marker-end="url(#pi-tools-arrow)"/><path d="M107 176 Q360.0 173 613 175 Q626 175 625 188 L624 239 Q625 252 612 251 Q360.0 253 107 250 Q94 251 95 238 L96 187 Q95 175 107 176Z" fill="#e9e0f0" stroke="#494940" stroke-width="1.8"/><path d="M107 176 Q360.0 173 613 175 Q626 175 625 188 L624 239 Q625 252 612 251 Q360.0 253 107 250 Q94 251 95 238 L96 187 Q95 175 107 176Z" fill="url(#pi-tools-hatch)" stroke="#77735f" stroke-opacity=".25" transform="translate(1.8,1.4)"/><text x="360.0" y="205.5" text-anchor="middle" font-size="19">prepareArguments</text><text x="360.0" y="232.5" text-anchor="middle" font-size="19">可选的参数预处理</text><path d="M360 254 Q358 267 360 279" fill="none" stroke="#4a4a42" stroke-width="2" stroke-linecap="round" marker-end="url(#pi-tools-arrow)"/><path d="M107 286 Q360.0 283 613 285 Q626 285 625 298 L624 349 Q625 362 612 361 Q360.0 363 107 360 Q94 361 95 348 L96 297 Q95 285 107 286Z" fill="#edf0d2" stroke="#494940" stroke-width="1.8"/><path d="M107 286 Q360.0 283 613 285 Q626 285 625 298 L624 349 Q625 362 612 361 Q360.0 363 107 360 Q94 361 95 348 L96 297 Q95 285 107 286Z" fill="url(#pi-tools-hatch)" stroke="#77735f" stroke-opacity=".25" transform="translate(1.8,1.4)"/><text x="360.0" y="315.5" text-anchor="middle" font-size="19">validateToolArguments</text><text x="360.0" y="342.5" text-anchor="middle" font-size="19">校验工具参数</text><path d="M360 364 Q358 377 360 389" fill="none" stroke="#4a4a42" stroke-width="2" stroke-linecap="round" marker-end="url(#pi-tools-arrow)"/><path d="M107 396 Q360.0 393 613 395 Q626 395 625 408 L624 459 Q625 472 612 471 Q360.0 473 107 470 Q94 471 95 458 L96 407 Q95 395 107 396Z" fill="#f3dedb" stroke="#494940" stroke-width="1.8"/><path d="M107 396 Q360.0 393 613 395 Q626 395 625 408 L624 459 Q625 472 612 471 Q360.0 473 107 470 Q94 471 95 458 L96 407 Q95 395 107 396Z" fill="url(#pi-tools-hatch)" stroke="#77735f" stroke-opacity=".25" transform="translate(1.8,1.4)"/><text x="360.0" y="425.5" text-anchor="middle" font-size="19">beforeToolCall</text><text x="360.0" y="452.5" text-anchor="middle" font-size="19">执行前钩子，可以阻止执行</text><path d="M360 474 Q358 487 360 499" fill="none" stroke="#4a4a42" stroke-width="2" stroke-linecap="round" marker-end="url(#pi-tools-arrow)"/><path d="M107 506 Q360.0 503 613 505 Q626 505 625 518 L624 569 Q625 582 612 581 Q360.0 583 107 580 Q94 581 95 568 L96 517 Q95 505 107 506Z" fill="#faedb9" stroke="#494940" stroke-width="1.8"/><path d="M107 506 Q360.0 503 613 505 Q626 505 625 518 L624 569 Q625 582 612 581 Q360.0 583 107 580 Q94 581 95 568 L96 517 Q95 505 107 506Z" fill="url(#pi-tools-hatch)" stroke="#77735f" stroke-opacity=".25" transform="translate(1.8,1.4)"/><text x="360.0" y="535.5" text-anchor="middle" font-size="19">executePreparedToolCall</text><text x="360.0" y="562.5" text-anchor="middle" font-size="19">tool.execute(id, args, signal, onUpdate)</text><path d="M360 584 Q358 597 360 609" fill="none" stroke="#4a4a42" stroke-width="2" stroke-linecap="round" marker-end="url(#pi-tools-arrow)"/><path d="M107 616 Q360.0 613 613 615 Q626 615 625 628 L624 679 Q625 692 612 691 Q360.0 693 107 690 Q94 691 95 678 L96 627 Q95 615 107 616Z" fill="#dcebf0" stroke="#494940" stroke-width="1.8"/><path d="M107 616 Q360.0 613 613 615 Q626 615 625 628 L624 679 Q625 692 612 691 Q360.0 693 107 690 Q94 691 95 678 L96 627 Q95 615 107 616Z" fill="url(#pi-tools-hatch)" stroke="#77735f" stroke-opacity=".25" transform="translate(1.8,1.4)"/><text x="360.0" y="645.5" text-anchor="middle" font-size="19">finalizeExecutedToolCall</text><text x="360.0" y="672.5" text-anchor="middle" font-size="19">afterToolCall（可调整结果）</text><path d="M360 694 Q358 707 360 719" fill="none" stroke="#4a4a42" stroke-width="2" stroke-linecap="round" marker-end="url(#pi-tools-arrow)"/><path d="M107 726 Q360.0 723 613 725 Q626 725 625 738 L624 789 Q625 802 612 801 Q360.0 803 107 800 Q94 801 95 788 L96 737 Q95 725 107 726Z" fill="#e9e0f0" stroke="#494940" stroke-width="1.8"/><path d="M107 726 Q360.0 723 613 725 Q626 725 625 738 L624 789 Q625 802 612 801 Q360.0 803 107 800 Q94 801 95 788 L96 737 Q95 725 107 726Z" fill="url(#pi-tools-hatch)" stroke="#77735f" stroke-opacity=".25" transform="translate(1.8,1.4)"/><text x="360.0" y="755.5" text-anchor="middle" font-size="19">createToolResultMessage</text><text x="360.0" y="782.5" text-anchor="middle" font-size="19">生成工具结果消息</text></g>
</svg>
</div>
<figcaption>03 · 工具执行：准备、校验与结果回写</figcaption>
</figure>

<details class="pi-diagram-source">
<summary>展开文字链路（可复制）</summary>

```text
prepareToolCall
  → 按名称查找工具
  → prepareArguments（可选参数预处理）
  → validateToolArguments
  → beforeToolCall（可阻止执行）
  → executePreparedToolCall
      → tool.execute(id, args, signal, onUpdate)
  → finalizeExecutedToolCall
      → afterToolCall（可调整结果）
  → createToolResultMessage
```

</details>
<!-- pi-diagram:pi-tools:end -->

其中实际动作发生在 `executePreparedToolCall` 中（`agent-loop.ts:832–840`）：

```ts
const result = await prepared.tool.execute(
  prepared.toolCall.id,
  prepared.args as never,
  signal,
  (partialResult) => {
    if (!acceptingUpdates) return;
    updateEvents.push(Promise.resolve(onUpdate(partialResult)));
  },
);
```

`as never` 是此处泛型调用的类型断言，不是运行时参数校验；真正的校验在前面的 `validateToolArguments`。

工具可以通过 `onUpdate` 报告中间进度，这会变成 `tool_execution_update`。最终结果则用于创建 `toolResult` 消息。

未知工具、参数校验失败、执行前阻止以及通常的工具异常，会转成 `isError: true` 的结果，而非全部直接抛出并结束运行。执行后钩子仅用于已经进入执行流程的调用；被提前阻止的调用不会走正常执行后处理。

参数结构合法也不等于操作已获授权。文件范围、覆盖策略、删除和外发权限仍需应用或工具实施；不能用 JSON 参数校验替代权限判断。

### 7.4 结果回写，形成反馈闭环

`createToolResultMessage` 保留调用 ID、工具名称、结果内容、错误标志与时间等信息。随后，`runLoop` 将结果同时加入：

```ts
for (const result of toolResults) {
  currentContext.messages.push(result);
  newMessages.push(result);
}
```

这样下一次请求就包含“模型请求读取什么”和“程序实际读到了什么”。缺少这一步，工具虽然执行过，模型仍不知道执行结果，循环也就没有形成信息反馈。

## 8. 一条完整时序：读取资料并提取要点

以下是**教学时序，不是实际文件读取或真实模型调用记录**。假设：

- 已有系统消息 `S`，其中声明了教学工具 `read_material`。
- 工具仅能读取一份明确授权的示例资料；不写入、不删除、不对外发送。
- 没有排队消息、工具变更或额外继续决策。
- 模型第一次请求读取，第二次直接回答。

记号：`U` 是用户消息，`A1` / `A2` 是模型消息，`R1` 是工具结果。

| 步骤 | 核心动作 | 完成该步骤后的上下文 |
| --- | --- | --- |
| 1 | 用户输入包装成 `U`，调用 `runAgentLoop` | `[S, U]` |
| 2 | 第一次 `streamAssistantResponse` 返回含工具调用的 `A1` | `[S, U, A1]` |
| 3 | 执行 `read_material`，生成 `R1` | `[S, U, A1, R1]` |
| 4 | 本回合结束，工具反馈触发下一回合 | 不变 |
| 5 | 第二次请求获得资料内容，返回要点 `A2` | `[S, U, A1, R1, A2]` |
| 6 | 无工具调用、无排队输入、无显式继续，运行结束 | 不变 |

对应事件序列为：

<!-- pi-diagram:pi-events:start -->
<figure class="pi-diagram">
<div class="pi-diagram-scroll" tabindex="0" role="region" aria-label="04 · 一次运行，两个回合，窄屏可横向滚动">
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 720 1285" width="720" height="1285" role="img" aria-labelledby="pi-events-title pi-events-desc">
<title id="pi-events-title">04 · 一次运行，两个回合</title><desc id="pi-events-desc">流程的完整文字版本位于图后的可展开说明。</desc>
<defs><pattern id="pi-events-hatch" width="9" height="9" patternUnits="userSpaceOnUse"><path d="M-2 9 9-2M5 12 12 5" stroke="#80775f" stroke-width=".65" opacity=".13"/></pattern><marker id="pi-events-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M1 1 8 5 1 9" fill="none" stroke="#4a4a42" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></marker></defs>
<rect x="3" y="3" width="714" height="1279" rx="17" fill="#fffaf0" stroke="#8da4ad" stroke-width="1.8"/><rect x="6" y="5" width="708" height="1274" rx="15" fill="none" stroke="#8da4ad" stroke-opacity=".3"/>
<g fill="#302d28" font-family="LXGW WenKai, Kaiti SC, KaiTi, serif"><text x="35" y="40" text-anchor="start" font-size="23">04 · 一次运行，两个回合</text><path d="M107 66 Q360.0 63 613 65 Q626 65 625 78 L624 129 Q625 142 612 141 Q360.0 143 107 140 Q94 141 95 128 L96 77 Q95 65 107 66Z" fill="#dcebf0" stroke="#494940" stroke-width="1.8"/><path d="M107 66 Q360.0 63 613 65 Q626 65 625 78 L624 129 Q625 142 612 141 Q360.0 143 107 140 Q94 141 95 128 L96 77 Q95 65 107 66Z" fill="url(#pi-events-hatch)" stroke="#77735f" stroke-opacity=".25" transform="translate(1.8,1.4)"/><text x="360.0" y="109.0" text-anchor="middle" font-size="19">agent_start</text><path d="M360 144 Q358 157 360 169" fill="none" stroke="#4a4a42" stroke-width="2" stroke-linecap="round" marker-end="url(#pi-events-arrow)"/><path d="M107 176 Q360.0 173 613 175 Q626 175 625 188 L624 239 Q625 252 612 251 Q360.0 253 107 250 Q94 251 95 238 L96 187 Q95 175 107 176Z" fill="#e9e0f0" stroke="#494940" stroke-width="1.8"/><path d="M107 176 Q360.0 173 613 175 Q626 175 625 188 L624 239 Q625 252 612 251 Q360.0 253 107 250 Q94 251 95 238 L96 187 Q95 175 107 176Z" fill="url(#pi-events-hatch)" stroke="#77735f" stroke-opacity=".25" transform="translate(1.8,1.4)"/><text x="360.0" y="219.0" text-anchor="middle" font-size="19">turn_start · 第一回合</text><path d="M360 254 Q358 267 360 279" fill="none" stroke="#4a4a42" stroke-width="2" stroke-linecap="round" marker-end="url(#pi-events-arrow)"/><path d="M107 286 Q360.0 283 613 285 Q626 285 625 298 L624 349 Q625 362 612 361 Q360.0 363 107 360 Q94 361 95 348 L96 297 Q95 285 107 286Z" fill="#edf0d2" stroke="#494940" stroke-width="1.8"/><path d="M107 286 Q360.0 283 613 285 Q626 285 625 298 L624 349 Q625 362 612 361 Q360.0 363 107 360 Q94 361 95 348 L96 297 Q95 285 107 286Z" fill="url(#pi-events-hatch)" stroke="#77735f" stroke-opacity=".25" transform="translate(1.8,1.4)"/><text x="360.0" y="329.0" text-anchor="middle" font-size="19">用户消息 U：message_start → message_end</text><path d="M360 364 Q358 377 360 389" fill="none" stroke="#4a4a42" stroke-width="2" stroke-linecap="round" marker-end="url(#pi-events-arrow)"/><path d="M107 396 Q360.0 393 613 395 Q626 395 625 408 L624 459 Q625 472 612 471 Q360.0 473 107 470 Q94 471 95 458 L96 407 Q95 395 107 396Z" fill="#f3dedb" stroke="#494940" stroke-width="1.8"/><path d="M107 396 Q360.0 393 613 395 Q626 395 625 408 L624 459 Q625 472 612 471 Q360.0 473 107 470 Q94 471 95 458 L96 407 Q95 395 107 396Z" fill="url(#pi-events-hatch)" stroke="#77735f" stroke-opacity=".25" transform="translate(1.8,1.4)"/><text x="360.0" y="425.5" text-anchor="middle" font-size="19">响应 A1：message_start</text><text x="360.0" y="452.5" text-anchor="middle" font-size="19">→ message_update* → message_end</text><path d="M360 474 Q358 487 360 499" fill="none" stroke="#4a4a42" stroke-width="2" stroke-linecap="round" marker-end="url(#pi-events-arrow)"/><path d="M107 506 Q360.0 503 613 505 Q626 505 625 518 L624 569 Q625 582 612 581 Q360.0 583 107 580 Q94 581 95 568 L96 517 Q95 505 107 506Z" fill="#faedb9" stroke="#494940" stroke-width="1.8"/><path d="M107 506 Q360.0 503 613 505 Q626 505 625 518 L624 569 Q625 582 612 581 Q360.0 583 107 580 Q94 581 95 568 L96 517 Q95 505 107 506Z" fill="url(#pi-events-hatch)" stroke="#77735f" stroke-opacity=".25" transform="translate(1.8,1.4)"/><text x="360.0" y="535.5" text-anchor="middle" font-size="19">tool_execution_start(call_1)</text><text x="360.0" y="562.5" text-anchor="middle" font-size="19">→ tool_execution_update* → tool_execution_end</text><path d="M360 584 Q358 597 360 609" fill="none" stroke="#4a4a42" stroke-width="2" stroke-linecap="round" marker-end="url(#pi-events-arrow)"/><path d="M107 616 Q360.0 613 613 615 Q626 615 625 628 L624 679 Q625 692 612 691 Q360.0 693 107 690 Q94 691 95 678 L96 627 Q95 615 107 616Z" fill="#dcebf0" stroke="#494940" stroke-width="1.8"/><path d="M107 616 Q360.0 613 613 615 Q626 615 625 628 L624 679 Q625 692 612 691 Q360.0 693 107 690 Q94 691 95 678 L96 627 Q95 615 107 616Z" fill="url(#pi-events-hatch)" stroke="#77735f" stroke-opacity=".25" transform="translate(1.8,1.4)"/><text x="360.0" y="659.0" text-anchor="middle" font-size="19">工具结果 R1：message_start → message_end</text><path d="M360 694 Q358 707 360 719" fill="none" stroke="#4a4a42" stroke-width="2" stroke-linecap="round" marker-end="url(#pi-events-arrow)"/><path d="M107 726 Q360.0 723 613 725 Q626 725 625 738 L624 789 Q625 802 612 801 Q360.0 803 107 800 Q94 801 95 788 L96 737 Q95 725 107 726Z" fill="#e9e0f0" stroke="#494940" stroke-width="1.8"/><path d="M107 726 Q360.0 723 613 725 Q626 725 625 738 L624 789 Q625 802 612 801 Q360.0 803 107 800 Q94 801 95 788 L96 737 Q95 725 107 726Z" fill="url(#pi-events-hatch)" stroke="#77735f" stroke-opacity=".25" transform="translate(1.8,1.4)"/><text x="360.0" y="769.0" text-anchor="middle" font-size="19">turn_end(A1, [R1])</text><path d="M360 804 Q358 817 360 829" fill="none" stroke="#4a4a42" stroke-width="2" stroke-linecap="round" marker-end="url(#pi-events-arrow)"/><path d="M107 836 Q360.0 833 613 835 Q626 835 625 848 L624 899 Q625 912 612 911 Q360.0 913 107 910 Q94 911 95 898 L96 847 Q95 835 107 836Z" fill="#edf0d2" stroke="#494940" stroke-width="1.8"/><path d="M107 836 Q360.0 833 613 835 Q626 835 625 848 L624 899 Q625 912 612 911 Q360.0 913 107 910 Q94 911 95 898 L96 847 Q95 835 107 836Z" fill="url(#pi-events-hatch)" stroke="#77735f" stroke-opacity=".25" transform="translate(1.8,1.4)"/><text x="360.0" y="879.0" text-anchor="middle" font-size="19">turn_start · 第二回合</text><path d="M360 914 Q358 927 360 939" fill="none" stroke="#4a4a42" stroke-width="2" stroke-linecap="round" marker-end="url(#pi-events-arrow)"/><path d="M107 946 Q360.0 943 613 945 Q626 945 625 958 L624 1009 Q625 1022 612 1021 Q360.0 1023 107 1020 Q94 1021 95 1008 L96 957 Q95 945 107 946Z" fill="#f3dedb" stroke="#494940" stroke-width="1.8"/><path d="M107 946 Q360.0 943 613 945 Q626 945 625 958 L624 1009 Q625 1022 612 1021 Q360.0 1023 107 1020 Q94 1021 95 1008 L96 957 Q95 945 107 946Z" fill="url(#pi-events-hatch)" stroke="#77735f" stroke-opacity=".25" transform="translate(1.8,1.4)"/><text x="360.0" y="975.5" text-anchor="middle" font-size="19">响应 A2：message_start</text><text x="360.0" y="1002.5" text-anchor="middle" font-size="19">→ message_update* → message_end</text><path d="M360 1024 Q358 1037 360 1049" fill="none" stroke="#4a4a42" stroke-width="2" stroke-linecap="round" marker-end="url(#pi-events-arrow)"/><path d="M107 1056 Q360.0 1053 613 1055 Q626 1055 625 1068 L624 1119 Q625 1132 612 1131 Q360.0 1133 107 1130 Q94 1131 95 1118 L96 1067 Q95 1055 107 1056Z" fill="#faedb9" stroke="#494940" stroke-width="1.8"/><path d="M107 1056 Q360.0 1053 613 1055 Q626 1055 625 1068 L624 1119 Q625 1132 612 1131 Q360.0 1133 107 1130 Q94 1131 95 1118 L96 1067 Q95 1055 107 1056Z" fill="url(#pi-events-hatch)" stroke="#77735f" stroke-opacity=".25" transform="translate(1.8,1.4)"/><text x="360.0" y="1099.0" text-anchor="middle" font-size="19">turn_end(A2, [])</text><path d="M360 1134 Q358 1147 360 1159" fill="none" stroke="#4a4a42" stroke-width="2" stroke-linecap="round" marker-end="url(#pi-events-arrow)"/><path d="M107 1166 Q360.0 1163 613 1165 Q626 1165 625 1178 L624 1229 Q625 1242 612 1241 Q360.0 1243 107 1240 Q94 1241 95 1228 L96 1177 Q95 1165 107 1166Z" fill="#dcebf0" stroke="#494940" stroke-width="1.8"/><path d="M107 1166 Q360.0 1163 613 1165 Q626 1165 625 1178 L624 1229 Q625 1242 612 1241 Q360.0 1243 107 1240 Q94 1241 95 1228 L96 1177 Q95 1165 107 1166Z" fill="url(#pi-events-hatch)" stroke="#77735f" stroke-opacity=".25" transform="translate(1.8,1.4)"/><text x="360.0" y="1209.0" text-anchor="middle" font-size="19">agent_end · * 表示零次或多次</text></g>
</svg>
</div>
<figcaption>04 · 一次运行，两个回合</figcaption>
</figure>

<details class="pi-diagram-source">
<summary>展开文字链路（可复制）</summary>

```text
agent_start
turn_start
  message_start(U) → message_end(U)
  message_start(A1) → message_update(A1)* → message_end(A1)
  tool_execution_start(call_1)
  tool_execution_update(call_1)*
  tool_execution_end(call_1)
  message_start(R1) → message_end(R1)
turn_end(A1, [R1])
turn_start
  message_start(A2) → message_update(A2)* → message_end(A2)
turn_end(A2, [])
agent_end
```

</details>
<!-- pi-diagram:pi-events:end -->

`*` 表示零次或多次。`finishTurn` 在对应 `turn_end` 之前执行，但它是钩子，不是上表中的独立事件。

本例中一次 Agent 运行包含两次模型请求、两个回合和一次工具执行。`newMessages` 为 `[U, A1, R1, A2]`，不包含历史系统消息 `S`。

### 8.1 为什么循环上下文和 Agent 状态都在更新消息

低层循环维护 `currentContext`，用于下一次模型请求；外层 `Agent.processEvents` 在 `message_end` 时执行：

```ts
this._state.messages.push(event.message);
```

两者维护的是不同的顶层数组。前者是本次运行的工作上下文，后者是 `Agent` 持有的对话状态，所以这里不是把同一消息向同一个数组重复添加两次。

事件也用于更新 `streamingMessage` 与 `pendingToolCalls`，然后按订阅顺序等待监听器。因此事件不是无成本的日志打印：慢监听器会延迟运行推进。

`agent_end` 是循环结束信号，但 Agent 还要等待该事件的监听器结束，再由 `finishRun()` 清理忙碌状态。需要确认真正空闲时，应理解 `waitForIdle()` 的含义，而不是仅看到事件名称就立刻重入 `prompt()`。

## 9. 错误、取消与设计边界

### 9.1 三类失败需要分开理解

| 类型 | 典型处理 |
| --- | --- |
| 工具调用失败 | 生成错误工具结果；通常让模型读取错误并决定下一步 |
| 模型返回 `error` / `aborted` 消息 | 当前核心循环硬退出 |
| 请求准备、流函数或事件接收方抛出异常 | 可能跳出低层循环；`Agent.runWithLifecycle` 有异常收尾封装 |

不能据此宣称“所有异常都安全变成工具结果”。例如低层调用者自行传入会抛错的事件接收函数，可能中断正常事件序列；核心配置类型对部分转换钩子明确要求不要抛错。`Agent` 的异常封装与直接使用低层函数的行为也不能混为一谈。

### 9.2 取消是协作机制，不是撤销机制

`Agent.abort()` 调用当前 `AbortController.abort()`。其 `signal` 被传给模型流函数、工具和相关钩子；工具调度处也会检查取消状态。

这不代表可以强制杀死任意第三方函数，更不代表已经写入的文件会自动恢复。工具需要主动尊重信号；涉及副作用时，应用还需规定操作边界、幂等或补偿策略。

本章只采用只读资料场景。后续如果增加卡片写入或覆盖操作，需要再明确允许路径、覆盖确认和失败处理，不能直接沿用只读场景的风险假设。

### 9.3 从实现可观察到的设计取舍

以下是基于源码的分析，而非对维护者动机的官方陈述：

1. **循环与模型访问分离。** 核心调用注入的 `StreamFn`，可以在测试中用受控流替代真实服务，重点验证调度而非网络。
2. **应用消息与模型消息分离。** 应用可保留自己的消息类型，在请求边界转换，避免界面状态直接泄漏到模型协议中。
3. **消息历史与事件通知分离。** 历史支撑下一次请求，事件支撑流式显示和状态更新；两者用途不同，但要保持顺序一致。
4. **工具错误进入对话。** 模型可以根据失败反馈调整调用，不过也可能反复失败，因此业务层仍需限制预算和重复行为。
5. **排队时机明确。** Steering 服务于当前运行的调整，follow-up 服务于自然停下后的追加任务，避免把所有输入都当成新的并发运行。
6. **回合钩子提供控制点。** 应用可以准备下一次请求或要求继续、结束；灵活性也意味着调用者需要理解钩子的时机和异常约束。

## 10. 用伪代码收束主链

下面是**教学伪代码，不是可运行实现，也不是源码逐字转写**：

```text
准备用户消息、工具声明与当前上下文
发出运行开始事件

重复：
    如果有上一回合，准备下一回合
    追加待处理消息
    准备本次请求
    转换消息，调用模型，汇总流式响应

    如果模型出错或被取消：
        收尾并结束

    如果响应被截断且包含工具调用：
        生成错误结果，不执行这些工具
    否则：
        校验并执行工具，生成结果
    将工具结果写入上下文

    获取回合决策并发出回合结束事件
    如果决策要求结束：结束
    如果工具反馈或 steering 要求继续：进入下一回合
    如果有 follow-up：进入下一回合
    如果决策要求继续：用现有上下文进入下一回合
    否则：结束

发出运行结束事件
```

伪代码省略了双层循环的具体变量、工具声明差异、并行结果排序、取消检查细节和事件异常处理。准确行为仍以对应提交源码为准。

核心调用链可以缩写为：

<!-- pi-diagram:pi-map:start -->
<figure class="pi-diagram">
<div class="pi-diagram-scroll" tabindex="0" role="region" aria-label="05 · 核心调用链与事件通道，窄屏可横向滚动">
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 720 810" width="720" height="810" role="img" aria-labelledby="pi-map-title pi-map-desc">
<title id="pi-map-title">05 · 核心调用链与事件通道</title><desc id="pi-map-desc">流程的完整文字版本位于图后的可展开说明。</desc>
<defs><pattern id="pi-map-hatch" width="9" height="9" patternUnits="userSpaceOnUse"><path d="M-2 9 9-2M5 12 12 5" stroke="#80775f" stroke-width=".65" opacity=".13"/></pattern><marker id="pi-map-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M1 1 8 5 1 9" fill="none" stroke="#4a4a42" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></marker></defs>
<rect x="3" y="3" width="714" height="804" rx="17" fill="#fffaf0" stroke="#8da4ad" stroke-width="1.8"/><rect x="6" y="5" width="708" height="799" rx="15" fill="none" stroke="#8da4ad" stroke-opacity=".3"/>
<g fill="#302d28" font-family="LXGW WenKai, Kaiti SC, KaiTi, serif"><text x="35" y="42" text-anchor="start" font-size="23">05 · 核心调用链与事件通道</text><path d="M47 71 Q300.0 68 553 70 Q566 70 565 83 L564 148 Q565 161 552 160 Q300.0 162 47 159 Q34 160 35 147 L36 82 Q35 70 47 71Z" fill="#dcebf0" stroke="#494940" stroke-width="1.8"/><path d="M47 71 Q300.0 68 553 70 Q566 70 565 83 L564 148 Q565 161 552 160 Q300.0 162 47 159 Q34 160 35 147 L36 82 Q35 70 47 71Z" fill="url(#pi-map-hatch)" stroke="#77735f" stroke-opacity=".25" transform="translate(1.8,1.4)"/><text x="300.0" y="121.0" text-anchor="middle" font-size="19">Agent.prompt</text><path d="M300 162 L300 170" fill="none" stroke="#4a4a42" stroke-width="2" stroke-linecap="round" marker-end="url(#pi-map-arrow)"/><path d="M568 115 L620 115" fill="none" stroke="#4a4a42" stroke-width="2" stroke-linecap="round" marker-end="url(#pi-map-arrow)" stroke-dasharray="5 5"/><path d="M47 176 Q300.0 173 553 175 Q566 175 565 188 L564 253 Q565 266 552 265 Q300.0 267 47 264 Q34 265 35 252 L36 187 Q35 175 47 176Z" fill="#e9e0f0" stroke="#494940" stroke-width="1.8"/><path d="M47 176 Q300.0 173 553 175 Q566 175 565 188 L564 253 Q565 266 552 265 Q300.0 267 47 264 Q34 265 35 252 L36 187 Q35 175 47 176Z" fill="url(#pi-map-hatch)" stroke="#77735f" stroke-opacity=".25" transform="translate(1.8,1.4)"/><text x="300.0" y="226.0" text-anchor="middle" font-size="19">runPromptMessages / runWithLifecycle</text><path d="M300 267 L300 275" fill="none" stroke="#4a4a42" stroke-width="2" stroke-linecap="round" marker-end="url(#pi-map-arrow)"/><path d="M568 220 L620 220" fill="none" stroke="#4a4a42" stroke-width="2" stroke-linecap="round" marker-end="url(#pi-map-arrow)" stroke-dasharray="5 5"/><path d="M47 281 Q300.0 278 553 280 Q566 280 565 293 L564 358 Q565 371 552 370 Q300.0 372 47 369 Q34 370 35 357 L36 292 Q35 280 47 281Z" fill="#edf0d2" stroke="#494940" stroke-width="1.8"/><path d="M47 281 Q300.0 278 553 280 Q566 280 565 293 L564 358 Q565 371 552 370 Q300.0 372 47 369 Q34 370 35 357 L36 292 Q35 280 47 281Z" fill="url(#pi-map-hatch)" stroke="#77735f" stroke-opacity=".25" transform="translate(1.8,1.4)"/><text x="300.0" y="331.0" text-anchor="middle" font-size="19">runAgentLoop → runLoop</text><path d="M300 372 L300 380" fill="none" stroke="#4a4a42" stroke-width="2" stroke-linecap="round" marker-end="url(#pi-map-arrow)"/><path d="M568 325 L620 325" fill="none" stroke="#4a4a42" stroke-width="2" stroke-linecap="round" marker-end="url(#pi-map-arrow)" stroke-dasharray="5 5"/><path d="M47 386 Q300.0 383 553 385 Q566 385 565 398 L564 463 Q565 476 552 475 Q300.0 477 47 474 Q34 475 35 462 L36 397 Q35 385 47 386Z" fill="#f3dedb" stroke="#494940" stroke-width="1.8"/><path d="M47 386 Q300.0 383 553 385 Q566 385 565 398 L564 463 Q565 476 552 475 Q300.0 477 47 474 Q34 475 35 462 L36 397 Q35 385 47 386Z" fill="url(#pi-map-hatch)" stroke="#77735f" stroke-opacity=".25" transform="translate(1.8,1.4)"/><text x="300.0" y="422.5" text-anchor="middle" font-size="19">streamAssistantResponse</text><text x="300.0" y="449.5" text-anchor="middle" font-size="19">transformContext → convertToLlm → streamFunction</text><path d="M300 477 L300 485" fill="none" stroke="#4a4a42" stroke-width="2" stroke-linecap="round" marker-end="url(#pi-map-arrow)"/><path d="M568 430 L620 430" fill="none" stroke="#4a4a42" stroke-width="2" stroke-linecap="round" marker-end="url(#pi-map-arrow)" stroke-dasharray="5 5"/><path d="M47 491 Q300.0 488 553 490 Q566 490 565 503 L564 568 Q565 581 552 580 Q300.0 582 47 579 Q34 580 35 567 L36 502 Q35 490 47 491Z" fill="#faedb9" stroke="#494940" stroke-width="1.8"/><path d="M47 491 Q300.0 488 553 490 Q566 490 565 503 L564 568 Q565 581 552 580 Q300.0 582 47 579 Q34 580 35 567 L36 502 Q35 490 47 491Z" fill="url(#pi-map-hatch)" stroke="#77735f" stroke-opacity=".25" transform="translate(1.8,1.4)"/><text x="300.0" y="514.0" text-anchor="middle" font-size="19">executeToolCalls</text><text x="300.0" y="541.0" text-anchor="middle" font-size="19">prepareToolCall → tool.execute</text><text x="300.0" y="568.0" text-anchor="middle" font-size="19">→ finalizeExecutedToolCall</text><path d="M300 582 L300 590" fill="none" stroke="#4a4a42" stroke-width="2" stroke-linecap="round" marker-end="url(#pi-map-arrow)"/><path d="M568 535 L620 535" fill="none" stroke="#4a4a42" stroke-width="2" stroke-linecap="round" marker-end="url(#pi-map-arrow)" stroke-dasharray="5 5"/><path d="M47 596 Q300.0 593 553 595 Q566 595 565 608 L564 673 Q565 686 552 685 Q300.0 687 47 684 Q34 685 35 672 L36 607 Q35 595 47 596Z" fill="#dcebf0" stroke="#494940" stroke-width="1.8"/><path d="M47 596 Q300.0 593 553 595 Q566 595 565 608 L564 673 Q565 686 552 685 Q300.0 687 47 684 Q34 685 35 672 L36 607 Q35 595 47 596Z" fill="url(#pi-map-hatch)" stroke="#77735f" stroke-opacity=".25" transform="translate(1.8,1.4)"/><text x="300.0" y="632.5" text-anchor="middle" font-size="19">结果回写 → finishTurn</text><text x="300.0" y="659.5" text-anchor="middle" font-size="19">继续或结束</text><path d="M568 640 L620 640" fill="none" stroke="#4a4a42" stroke-width="2" stroke-linecap="round" marker-end="url(#pi-map-arrow)" stroke-dasharray="5 5"/><path d="M625 110 Q630 370 625 685" stroke="#8b7b9d" stroke-width="2" stroke-dasharray="6 5" fill="none"/><path d="M625 685 Q625 718 560 728" fill="none" stroke="#4a4a42" stroke-width="2" stroke-linecap="round" marker-end="url(#pi-map-arrow)" stroke-dasharray="5 5"/><path d="M127 701 Q340.0 698 553 700 Q566 700 565 713 L564 768 Q565 781 552 780 Q340.0 782 127 779 Q114 780 115 767 L116 712 Q115 700 127 701Z" fill="#e9e0f0" stroke="#494940" stroke-width="1.8"/><path d="M127 701 Q340.0 698 553 700 Q566 700 565 713 L564 768 Q565 781 552 780 Q340.0 782 127 779 Q114 780 115 767 L116 712 Q115 700 127 701Z" fill="url(#pi-map-hatch)" stroke="#77735f" stroke-opacity=".25" transform="translate(1.8,1.4)"/><text x="340.0" y="732.5" text-anchor="middle" font-size="19">processEvents</text><text x="340.0" y="759.5" text-anchor="middle" font-size="19">在各个事件发出时更新状态、通知监听器</text></g>
</svg>
</div>
<figcaption>05 · 核心调用链与事件通道</figcaption>
</figure>

<details class="pi-diagram-source">
<summary>展开文字链路（可复制）</summary>

```text
Agent.prompt
  → runPromptMessages / runWithLifecycle
  → runAgentLoop
  → runLoop
      → streamAssistantResponse
          → transformContext → convertToLlm → streamFunction
      → executeToolCalls
          → prepareToolCall → tool.execute → finalizeExecutedToolCall
      → 结果回写 → finishTurn → 继续或结束
  → processEvents 更新状态与通知监听器
```

</details>
<!-- pi-diagram:pi-map:end -->

最后一行不是仅在循环结束后执行：`processEvents` 在各个事件发出时贯穿整个过程。

### 自测

1. 为什么工具调用必须由程序执行，且结果必须再次进入消息上下文？
2. 模型没有返回工具调用，为什么 Agent 仍可能继续运行？
3. 多个工具并行执行时，完成事件顺序和结果消息顺序是否必然相同？
4. 为什么不能执行 `stopReason === "length"` 响应里的工具调用？
5. `agent_end` 与 Agent 真正空闲有什么区别？

参考答案：

1. 模型输出调用请求不等于实际访问外部资源；不回传结果，下一次请求就缺少执行反馈。
2. Steering、follow-up 或 `finishTurn` 的显式继续仍可能安排请求。
3. 不必相同；并行分支允许完成事件按完成顺序产生，结果消息按源调用顺序输出。
4. 参数可能被截断，即使能解析和通过结构校验也不保证语义完整。
5. 结束事件的监听器还需要完成，随后运行状态才被清理。

## 小结与后续关系

Pi 的 Agent 循环并不是让模型“自行操作电脑”，而是由程序把模型响应、工具执行、消息反馈和运行控制组织成一个闭环。本版本的核心理解点是：**请求边界上的消息转换、回合内的工具执行、双层循环的调度，以及事件驱动的状态更新。**

后续开发资料处理助手时，可以将读取、提取和卡片生成能力放入这个执行模型；本章不预设这些能力全部实现为工具，也不提前确定存储方式。扩展之前，先明确哪些动作由模型选择、哪些由程序保证、哪些必须经人工确认。

本章已对照固定提交核查核心链路，并运行核心循环测试：38 项通过。`Agent` 状态封装测试因源码仓库缺少模型目录数据而未能加载，不能视为通过；未调用真实模型，也未执行本章示意的资料读取。详见 [验证记录](#验证记录)。

---

## 附录：源码与验证记录

### 参考基线


| 项目 | 实际检查结果 |
| --- | --- |
| 绝对路径 | `/Users/scottlee/workspace/github/pi` |
| `git rev-parse HEAD` | `530015d93a40d157b5f7e3ddf4713abf14fa9616` |
| `origin` | `https://github.com/LicsDaSheng/pi.git` |
| `upstream` | `https://github.com/earendil-works/pi.git` |
| `packages/agent/package.json` | `@earendil-works/pi-agent-core`，`1.3.0` |
| `packages/ai/package.json` | `@earendil-works/pi-ai`，`1.3.0` |
| `packages/coding-agent/package.json` | `@earendil-works/pi-coding-agent`，`1.3.0` |
| 源码工作区 | 阅读前与测试后 `git status --short` 均无输出 |

包版本仅用于标记适用范围，具体行为以提交为准。没有据此推断其他发行版或上游其他提交的行为。此次未修改参考仓库源码，也未补生成模型目录数据。

### 源码索引

路径均相对于参考仓库根目录。以下链接按本地 `origin` 和固定提交构造，用于定位；本文事实依据为本地文件，未验证远程网页可达性。若链接无法打开，可在本地按路径与提交阅读。

| 位置 | 核查内容 | 固定提交链接 |
| --- | --- | --- |
| `packages/agent/src/agent.ts:371–613` | 输入规范化、运行封装、配置、状态与事件处理 | [源码](https://github.com/LicsDaSheng/pi/blob/530015d93a40d157b5f7e3ddf4713abf14fa9616/packages/agent/src/agent.ts#L371-L613) |
| `packages/agent/src/agent.ts:227–257` | 默认队列和工具执行策略、事件订阅约定 | [源码](https://github.com/LicsDaSheng/pi/blob/530015d93a40d157b5f7e3ddf4713abf14fa9616/packages/agent/src/agent.ts#L227-L257) |
| `packages/agent/src/agent-loop.ts:38–157` | 流接口与回调接口、初始化和继续入口 | [源码](https://github.com/LicsDaSheng/pi/blob/530015d93a40d157b5f7e3ddf4713abf14fa9616/packages/agent/src/agent-loop.ts#L38-L157) |
| `packages/agent/src/agent-loop.ts:163–325` | 双层循环、队列、回合钩子与退出 | [源码](https://github.com/LicsDaSheng/pi/blob/530015d93a40d157b5f7e3ddf4713abf14fa9616/packages/agent/src/agent-loop.ts#L163-L325) |
| `packages/agent/src/agent-loop.ts:338–375` | 工具声明差异处理 | [源码](https://github.com/LicsDaSheng/pi/blob/530015d93a40d157b5f7e3ddf4713abf14fa9616/packages/agent/src/agent-loop.ts#L338-L375) |
| `packages/agent/src/agent-loop.ts:381–502` | 消息转换、流式响应汇总、截断调用拒绝执行 | [源码](https://github.com/LicsDaSheng/pi/blob/530015d93a40d157b5f7e3ddf4713abf14fa9616/packages/agent/src/agent-loop.ts#L381-L502) |
| `packages/agent/src/agent-loop.ts:508–949` | 工具调度、校验、执行、钩子和结果生成 | [源码](https://github.com/LicsDaSheng/pi/blob/530015d93a40d157b5f7e3ddf4713abf14fa9616/packages/agent/src/agent-loop.ts#L508-L949) |
| `packages/agent/src/types.ts:135–275` | 回合控制和消息转换接口约定 | [源码](https://github.com/LicsDaSheng/pi/blob/530015d93a40d157b5f7e3ddf4713abf14fa9616/packages/agent/src/types.ts#L135-L275) |
| `packages/coding-agent/src/core/agent-session.ts:1837–1882` | 会话启动与核心运行后的继续逻辑 | [源码](https://github.com/LicsDaSheng/pi/blob/530015d93a40d157b5f7e3ddf4713abf14fa9616/packages/coding-agent/src/core/agent-session.ts#L1837-L1882) |
| `packages/coding-agent/src/core/agent-session.ts:2058–2141` | 用户输入分支与启动入口 | [源码](https://github.com/LicsDaSheng/pi/blob/530015d93a40d157b5f7e3ddf4713abf14fa9616/packages/coding-agent/src/core/agent-session.ts#L2058-L2141) |
| `packages/coding-agent/src/core/sdk.ts:411–446` | Agent 构造与模型运行时接线 | [源码](https://github.com/LicsDaSheng/pi/blob/530015d93a40d157b5f7e3ddf4713abf14fa9616/packages/coding-agent/src/core/sdk.ts#L411-L446) |
| `packages/ai/src/utils/transcript.ts:6–64` | 初始系统消息、上下文规范化及工具声明重放 | [源码](https://github.com/LicsDaSheng/pi/blob/530015d93a40d157b5f7e3ddf4713abf14fa9616/packages/ai/src/utils/transcript.ts#L6-L64) |
| `packages/agent/test/agent-loop.test.ts` | 核心循环测试 | [源码](https://github.com/LicsDaSheng/pi/blob/530015d93a40d157b5f7e3ddf4713abf14fa9616/packages/agent/test/agent-loop.test.ts) |

### 关键事实核查

- `Agent` 直接调用 `runAgentLoop`，不是先调用 `agentLoop` 包装器。
- 默认工具策略为并行；任一被调用工具要求串行时，整批改为串行。
- 并行完成事件与工具结果消息的排列顺序不同，后者按调用顺序生成。
- Steering 在回合边界等指定位置读取，不在每个工具结束后抢占本批剩余工具。
- `finishTurn` 位于 `turn_end` 前；正常回合可以显式继续或结束。
- 错误和取消模型响应硬退出，输出长度截断中的工具调用则转换为错误结果而不执行。
- 批次 `terminate` 判断使用所有最终结果的 `every`，不是任一结果的 `some`。
- `transformContext` 在 `convertToLlm` 前执行；调用模型前才跨越消息类型边界。
- `Agent` 监听器会被等待；收到 `agent_end` 不等于运行状态已经清理。

### 验证记录

#### 核心循环测试：通过

使用参考仓库现有依赖，没有安装或升级依赖，没有运行全量测试或真实模型请求。

```sh
cd ~/workspace/github/pi/packages/agent
NO_COLOR=1 node ../../node_modules/vitest/dist/cli.js --run test/agent-loop.test.ts
```

实际结果：

```text
Test Files  1 passed (1)
     Tests  38 passed (38)
```

该文件覆盖工具调用、转换顺序、并行结果排序、运行中消息注入、串行覆盖、截断调用、回合继续/结束及请求准备等核心行为。通过结果只证明这些测试所断言的范围，不等于所有应用入口、提供商和工具组合均已验证。

#### 扩大到 Agent 状态测试：加载失败

同时尝试：

```sh
cd ~/workspace/github/pi/packages/agent
NO_COLOR=1 node ../../node_modules/vitest/dist/cli.js --run test/agent-loop.test.ts test/agent.test.ts
```

结果：核心循环测试通过，`test/agent.test.ts` 在模块加载阶段失败：

```text
Cannot find module './data/amazon-bedrock.json'
imported from packages/ai/src/providers/amazon-bedrock.models.ts
Test Files  1 failed | 1 passed (2)
     Tests  38 passed (38)
```

没有修改参考仓库去补数据，也没有将此结果描述为 Agent 状态测试通过。正文对状态封装的描述以源码阅读为依据。
