---
title: "第三章：Pi RPC steer 消息生命周期——queued 之后，何时才算被消费？"
published: 2026-11-11
description: "沿 Pi 1.5.1 源码追踪一条 RPC steer 从排队、出队、作为 user 消息消费，到后续 assistant 处理与 session settle 的完整事件链，并说明可映射状态与关联限制。"
tags: [pi, rpc, steer, 源码剖析]
category: Pi 教程
series: pi-tutorial
seriesOrder: 3
seriesStage: 1
draft: false
---

> 阶段：源码级剖析。适用版本：`@earendil-works/pi-coding-agent` `1.5.1`；参考本地仓库 `~/workspace/github/pi`，固定提交 `4ea8837927564c592b1d184c956ab7d28c88119b`。源码定位和验证范围见 [源码与验证记录](#附录源码与验证记录)。
>
> 本文区分 **Pi 原生协议事实** 与 **业务系统派生状态**。文中的 `pending`、`queued`、`consumed` 等业务状态不是 Pi 提供的一套单消息状态机，也不表示当前业务运行时已经实现了这些推进逻辑。

[第一章](/posts/pi-tutorial/01-agent-loop/)介绍了 Agent 循环，[第二章](/posts/pi-tutorial/02-pi-ai/)解释了模型接口层。本章聚焦一个更具体、也更容易误判的问题：**RPC 客户端发送一条 `steer` 后，从 Pi 的输出中究竟能看到什么？什么时候只能说它已排队，什么时候才有证据表明它正在被消费？**

先给出结论：

1. `response command="steer" success=true data.disposition="queued"` 只表示 Pi 接受并排队，不表示消息已经进入模型上下文。
2. 加入队列时，`queue_update` 通常先于这条 RPC `response` 输出。
3. steering 不会抢占正在执行的工具。当前 assistant turn 及其工具结果先完成，随后才在下一 turn 作为 `user` 消息注入。
4. Pi 没有 `steer_consumed(id)` 这样的专用事件。最接近“开始消费”和“完成注入”的公开证据，分别是匹配的 user `message_start` 与 `message_end`。
5. `agent_end` 只结束一次低层 Agent run；`agent_settled` 才表示当前 session-level run 不会因重试、恢复或排队消息自动继续。但它仍不是某一条 steer 的专用完成确认。
6. RPC `response` 可以按请求 `id` 精确关联；`queue_update` 只有文本数组，消息事件也不携带原始 RPC request id。重复文本无法无歧义映射回业务侧的 `dispatch_messages.id`。

## 1. 先分清两类输出：RPC response 与 session event

RPC stdout 上会混合两类与本题有关的记录：

| 输出 | 回答的问题 | 是否携带请求 `id` |
| --- | --- | --- |
| `response` | 这条 RPC 命令是否被接受，命令处理结果是什么 | 是，回显请求 `id` |
| session event | 会话中的队列、消息、工具和运行生命周期发生了什么 | 通常否 |

直接 steer 的输入可以写成：

```json
{"id":"dispatch-42","type":"steer","message":"先检查失败重试，再继续实现"}
```

接受排队后的响应是：

```json
{"id":"dispatch-42","type":"response","command":"steer","success":true,"data":{"disposition":"queued"}}
```

这里的 `id` 只把命令和响应连起来。它不会自动进入后续 user 消息，也不会出现在 `queue_update` 中。

还有一条等价的排队入口：Agent 已在运行时发送 `prompt`，并指定 `streamingBehavior: "steer"`：

```json
{"id":"dispatch-42","type":"prompt","message":"先检查失败重试，再继续实现","streamingBehavior":"steer"}
```

两条入口最终都会调用 `_queueSteer(...)`，因此后面的队列与消费链路相同。区别只在命令响应：直接入口返回 `command: "steer"`，prompt 入口返回 `command: "prompt"`。

`data.disposition` 有两个相关值：

- `queued`：输入经过处理后进入队列；它不是消费确认。
- `handled`：输入处理器已经消费该输入，没有按普通 steer 进入 Agent 队列。此时不应继续等待同一条输入对应的 user 消息事件。

`success: false` 则表示命令在接受前失败。接受后的模型错误、取消等不会再为同一请求 `id` 补发第二条失败 response，而是通过消息和生命周期事件表现。

## 2. 投递端源码：为什么 queue_update 通常先于 response

RPC 分支很短。`rpc-mode.ts:437–440` 先等待 `session.steer(...)`，再构造成功响应：

```ts
case "steer": {
  const disposition = await session.steer(command.message, command.images, { source: "rpc" });
  return success(id, "steer", { disposition });
}
```

`AgentSession.steer(...)` 经过 `_queueUserInput(...)` 运行输入处理器并展开 skill 或 prompt template。若没有被处理器消费，它进入 `_queueSteer(...)`。

`agent-session.ts:2390–2399` 的顺序是：

```ts
this._steeringMessages.push(text);
this._emitQueueUpdate();
// 构造 user message
this.agent.steer(message);
```

也就是说：

1. 文本先进入 `AgentSession` 用于展示的 `_steeringMessages`。
2. 立即发出完整队列快照 `queue_update`。
3. 再把真正的 `AgentMessage` 放进核心 Agent 的 steering queue。
4. `session.steer(...)` 返回 `"queued"` 后，RPC mode 才输出 response。

因此，在没有其他并发事件插入的典型记录中，会先看到：

```json
{"type":"queue_update","steering":["先检查失败重试，再继续实现"],"followUp":[]}
{"id":"dispatch-42","type":"response","command":"steer","success":true,"data":{"disposition":"queued"}}
```

这不是“先消费、后确认”，而是**先广播队列已变化，再确认命令处理结果**。当前 Agent run 的其他事件仍可能在全局输出中穿插，客户端不应假定 stdout 上只有这两条记录。

## 3. 消费端源码：出队发生在什么时候

steer 被接受后，当前 assistant turn 不会立刻中断。核心循环在本回合完成 assistant 响应、工具执行和工具结果后，先发出 `turn_end`，然后才读取 steering queue。

`agent-loop.ts:295–305` 的关键顺序是：

```ts
await emit({ type: "turn_end", message, toolResults });
// ...
pendingMessages = (await config.getSteeringMessages?.()) || [];
```

`Agent` 提供的 `getSteeringMessages` 会调用内部队列的 `drain()`。默认 `one-at-a-time` 模式一次取一条；`all` 模式一次取走全部。这个 drain 先发生在核心队列中，但此时对外展示用的 `_steeringMessages` 还没有删除对应文本。

下一次循环开始时，源码先发 `turn_start`，再为待注入消息发 `message_start` / `message_end`：

```ts
await emit({ type: "turn_start" });

for (const message of declareToolChanges(currentContext, [...preparedMessages, ...pendingMessages])) {
  await emit({ type: "message_start", message });
  await emit({ type: "message_end", message });
  // 写入下一次模型请求使用的上下文
}
```

不过，公开监听器看到 user `message_start` 之前，`AgentSession._handleAgentEvent(...)` 还会先做一件事：按消息文本在 `_steeringMessages` 中查找，删除匹配项并发出新的 `queue_update`。

```ts
const steeringIndex = this._steeringMessages.indexOf(messageText);
if (steeringIndex !== -1) {
  this._steeringMessages.splice(steeringIndex, 1);
  this._emitQueueUpdate();
}
```

而 `_handleAgentEvent` 在完成这些内部处理后，才把原始 `message_start` 通知公共监听器。因此消费侧的公开顺序是：

```text
当前 turn_end
  → 核心 steering queue drain
  → 下一轮 turn_start
  → queue_update：该文本从 steering 数组消失
  → message_start(role=user)
  → message_end(role=user)
  → 发起下一次模型请求
```

这解释了一个容易误读的现象：**`queue_update` 中消失发生在公开 user `message_start` 之前。**它适合表示“已出队、准备交付”，但不能单独证明是哪一条业务记录被消费。

## 4. 一条典型 steer 的完整时序与状态对照

假设：

- Agent 已经在处理原始用户请求。
- steer 在当前 assistant turn 中途送达。
- 当前 turn 含有工具调用。
- steering mode 使用默认 `one-at-a-time`。
- steer 被注入后，模型返回普通回答，不再调用工具，也没有重试、压缩恢复或其他排队消息。

典型输出链路如下：

```text
业务侧尚未发送
  ↓
queue_update：steering 中出现该文本
  ↓
response(command=steer, success=true, disposition=queued)
  ↓
当前 assistant turn 继续
  ├─ assistant message_update / message_end（取决于 steer 到达时机）
  ├─ tool_execution_start
  ├─ tool_execution_update*
  ├─ tool_execution_end
  └─ toolResult message_start → message_end
  ↓
turn_end
  ↓
turn_start
  ↓
queue_update：该文本从 steering 中消失
  ↓
user message_start → user message_end
  ↓
assistant message_start → message_update* → message_end
  ↓
turn_end
  ↓
agent_end
  ↓
agent_settled
```

`*` 表示零次或多次。若 steer 到达时当前 assistant 消息已经结束、工具正在执行，就不会在投递之后再次看到当前 assistant 的 `message_end`；但工具生命周期、toolResult 消息和当前 `turn_end` 仍先于 steer 的下一轮注入。

下面把公开证据与可派生业务状态放在一起。右栏是**建议映射**，不是 Pi 原生状态字段。

| 顺序 | Pi 输出或本地动作 | Pi 原生语义 | 可派生状态 |
| --- | --- | --- | --- |
| 0 | 业务记录已创建，RPC 尚未发送 | Pi 不知道这条消息 | `pending` |
| 1 | `queue_update` 中出现文本 | steering 队列快照已变化 | 可记录“已观察到入队”，但不要先于 response 宣告命令成功 |
| 2 | 匹配请求 `id` 的 response：`queued` | 命令已接受并排队 | `queued` |
| 2a | response：`handled` | 输入处理器已消费，没有普通排队链路 | `handled` |
| 2b | response：`success=false` | 命令在接受前失败 | `failed` |
| 3 | 当前 assistant / 工具事件继续 | steer 尚未注入模型上下文 | 保持 `queued` |
| 4 | 当前 `turn_end` | 当前 assistant 响应及其工具结果完成 | 仍不能单独标记 steer consumed |
| 5 | 下一轮 `turn_start` | 新 assistant turn 开始 | 可保持 `queued` |
| 6 | `queue_update` 中该文本消失 | 展示队列已删除匹配文本 | `dequeued` 或 `delivering` |
| 7 | 匹配文本的 user `message_start` | user 消息开始公开交付 | `consuming` |
| 8 | 匹配文本的 user `message_end` | user 消息完成并进入本轮上下文 | `consumed` |
| 9 | 后续 assistant `message_start` | 模型已开始处理包含该 steer 的上下文 | `processing` |
| 10 | 后续 assistant `message_end` / `turn_end` | 本次响应及工具完成 | 可记录处理结果，但 Pi 没有单 steer 完成事件 |
| 11 | `agent_end` | 一次低层 Agent run 结束 | 不应映射为最终稳定 |
| 12 | `agent_settled` | 当前 session-level run 不会自动继续 | `settled`，仅表示会话级稳定 |

这里的业务 `pending` 不要与 assistant 流式消息的 `stopReason: "pending"` 混淆；两者来自不同层次。

如果 steer 触发的 assistant 响应也调用工具，则第 9 步之后还会出现：

```text
assistant message_end
  → tool_execution_start
  → tool_execution_update*
  → tool_execution_end
  → toolResult message_start
  → toolResult message_end
  → turn_end
```

工具结果属于产生它的 assistant turn，因此一定在该 turn 的 `turn_end` 之前。

## 5. 为什么不能仅靠 queued 或 agent_settled 判断单条消息完成

### 5.1 queued 只证明接受排队

`disposition: "queued"` 的事实边界很窄：输入处理没有拒绝或消费它，Pi 已把处理后的消息放入队列。

它不保证：

- 消息已经从队列取出。
- 消息已经发出 user `message_start`。
- 下一次模型请求已经开始。
- 模型成功回答。
- 消息在等待期间没有被 `clear_queue` 删除。

官方命令文档也明确说明，`queued` 不保证消息仍然留在队列中。

### 5.2 agent_end 不是最终稳定点

在简单链路中，消费 steer 的 turn 完成后会看到 `agent_end`。但 session 仍可能进行自动重试、上下文溢出恢复、压缩后重试，或处理之后到达的队列消息。

因此需要确认“Pi 不会自动继续”时，应等待 `agent_settled`。源码在 `_startRun(...)` 的 finally 中调用 `_emitAgentSettled()`，它位于低层 run 结束和所有后续自动处理之后。

但 `agent_settled` 的主语是**整个 session-level run**，不是某一条 steer。若同一运行中消费了多条 steering、follow-up 或发生重试，最终仍可能只有一个 settled 事件。

### 5.3 Pi 没有 steer_consumed(id)

Pi 1.5.1 的 session event 联合类型包含 `queue_update`、通用消息事件、`agent_end` 和 `agent_settled`，没有 `steer_consumed` 或携带原始 RPC request id 的消费事件。

所以，“单条 steer 已消费”只能由宿主根据通用事件派生，不能把某个不存在的 Pi 原生事件当作协议保证。

## 6. 关联限制：请求 id 到了 response 就停止传播

RPC 命令类型允许 `id?: string`，对应 response 会回显该 id。这一段可以可靠关联：

```text
dispatch_messages.id
  ↔ RPC command.id
  ↔ RPC response.id
```

从队列事件开始，关联信息变成了文本：

- `queue_update.steering` 是完整的 `string[]`。
- user `message_start` / `message_end` 包含消息内容和时间戳，但没有原始 RPC request id。
- `AgentSession` 删除展示队列时使用 `indexOf(messageText)`，即按文本找第一个匹配项。

因此，如果同时排入两条完全相同的文本：

```text
dispatch-42 → "继续"
dispatch-43 → "继续"
```

后续看到：

```json
{"type":"queue_update","steering":["继续"],"followUp":[]}
{"type":"message_start","message":{"role":"user","content":[{"type":"text","text":"继续"}]}}
```

客户端无法仅凭这些公开字段判断被消费的是 `dispatch-42` 还是 `dispatch-43`。FIFO 可以作为业务假设辅助推断，但不是带 ID 的协议关联；输入处理器还可能改写文本，使“原始发送文本”与队列文本不同。

图片也不能解决这个问题：`queue_update` 仍只报告文本数组，图片本身不提供 RPC request id 到消费事件的桥梁。

## 7. 工程落地：哪些是 Pi 事实，哪些应由业务层实现

### 7.1 Pi 原生可直接依赖的事实

- request `id` 与 RPC response `id` 可精确关联。
- `queued` 表示接受排队，`handled` 表示输入处理器消费。
- `queue_update` 给出当前完整文本队列快照。
- user `message_start` / `message_end` 表示通用消息交付生命周期。
- assistant 和工具事件表示后续处理过程。
- `agent_settled` 表示当前 session-level run 不会自动继续。

### 7.2 业务层可以派生，但必须标注为派生

可以建立如下状态机：

```text
pending
  ├─ response success=false → failed
  ├─ disposition=handled    → handled
  └─ disposition=queued     → queued
                               ↓ queue_update 中消失
                             dequeued / delivering
                               ↓ user message_start
                             consuming
                               ↓ user message_end
                             consumed
                               ↓ assistant message_start
                             processing
                               ↓ agent_settled
                             settled（会话级）
```

这套状态机必须接受两个限制：

1. `dequeued`、`consuming`、`consumed` 依赖文本匹配，不是 request-id 级确认。
2. `settled` 不能解释为“这条 steer 的业务任务成功”，只能解释为“相关会话运行当前稳定”。模型可能返回错误或被取消，仍会进入 settlement。

若必须精确关联每一条 dispatch，需要额外设计应用级关联信息。例如把唯一标记放入消息内容，或通过扩展/自定义协议保留元数据；前者默认会进入模型上下文，必须评估是否可接受。仅使用原生 `{id,type:"steer",message}` 协议，无法获得无歧义的逐条消费确认。

### 7.3 不要把设计建议写成当前实现事实

就当前业务侧约束而言，`dispatch_messages` 只有默认 `pending`，消费者与状态推进尚未实现。本文给出的 `queued`、`consuming`、`consumed`、`processing`、`settled` 是可选的映射方案，**不能声称当前 bot-runtime 已经按这些状态运行**。

在真正实现前，至少需要决定：

- 重复文本是否允许；若允许，怎样建立稳定关联。
- `handled` 是否作为终态，还是进入单独的处理结果表。
- `message_end(role=user)` 后模型失败时，业务状态如何表达。
- 一个 session 同时包含多条 steer 时，`agent_settled` 怎样回填到各条记录。
- 清空队列、进程退出和超时分别映射为什么状态。

这些属于业务协议设计，不是 Pi 1.5.1 已替宿主完成的能力。

## 8. 回答开篇问题

一条 steer 从投递到被消费，典型 RPC response / session event 链路是：

```text
queue_update（加入 steering）
→ response(command=steer, success=true, disposition=queued)
→ 当前 assistant turn 与工具执行继续
→ turn_end
→ turn_start
→ queue_update（从 steering 移除）
→ message_start(role=user)
→ message_end(role=user)
→ assistant message_start / update* / end
→ turn_end
→ agent_end
→ agent_settled
```

其中最重要的边界是：

> **response queued 是“接受排队”；匹配的 user message_start / message_end 才是“开始消费 / 完成消息注入”的可观察证据；agent_settled 是会话级稳定，不是单条 steer 的完成回执。**

如果业务只需要“命令是否被 Pi 接受”，保存 response 即可。如果需要“单条消息是否真正被消费”，原生 RPC 事件只能提供文本级推断；要达到 request-id 级可靠性，还需要宿主自行扩展关联设计。

---

## 附录：源码与验证记录

### 基线与范围

- 本地参考仓库：`/Users/scottlee/workspace/github/pi`。
- 固定提交：`4ea8837927564c592b1d184c956ab7d28c88119b`。
- 包：`@earendil-works/pi-coding-agent`，版本 `1.5.1`；相关 `pi-agent-core` 与 `pi-ai` 包同为 `1.5.1`。
- 远程：`origin` 为 `https://github.com/LicsDaSheng/pi.git`，`upstream` 为 `https://github.com/earendil-works/pi.git`。
- 本文聚焦运行中的 direct `steer` 与 `prompt + streamingBehavior: "steer"`。不展开 follow-up、手动 abort、clear_queue、自动重试和上下文压缩的完整分支。
- 参考源码测试前后保持无改动。

### 源码导航

以下路径相对于参考仓库根目录，行号对应固定提交。

| 文件与范围 | 核查事实 |
| --- | --- |
| `packages/coding-agent/src/modes/rpc/rpc-types.ts:20–24, 116–125` | command 可带 id；steer response 回显 id 与 disposition |
| `packages/coding-agent/src/modes/rpc/rpc-mode.ts:400–440` | direct steer 调用 `session.steer` 后返回 response |
| `packages/coding-agent/src/modes/rpc/rpc-mode.ts:768–823` | 普通命令完成后才把返回的 response 写到 stdout |
| `packages/coding-agent/src/core/agent-session.ts:209–222` | session event 类型包含 queue、run 和消息事件，但无 steer 消费专用事件 |
| `packages/coding-agent/src/core/agent-session.ts:1100–1112` | `queue_update` 发出完整 steering / followUp 文本快照 |
| `packages/coding-agent/src/core/agent-session.ts:1139–1160` | `agent_settled` 的 session-level 发出位置 |
| `packages/coding-agent/src/core/agent-session.ts:1163–1209` | user message_start 时先删除展示队列并发 queue_update，再通知公共监听器 |
| `packages/coding-agent/src/core/agent-session.ts:1943–1987` | 低层 run 与后续处理结束后进入 settled |
| `packages/coding-agent/src/core/agent-session.ts:2153–2240` | prompt 在 streaming 时按 streamingBehavior 进入 `_queueSteer` |
| `packages/coding-agent/src/core/agent-session.ts:2325–2399` | direct steer 的输入处理、disposition、入队和 queue_update 顺序 |
| `packages/agent/src/agent.ts:149–180` | steering queue 的 one-at-a-time / all drain 行为 |
| `packages/agent/src/agent.ts:307–315, 476–514` | `Agent.steer` 入核心队列，循环通过 drain 读取 |
| `packages/agent/src/agent-loop.ts:184–226` | 下一 turn 先 turn_start，再公开待注入消息 |
| `packages/agent/src/agent-loop.ts:250–305` | assistant、工具、turn_end 与回合后 steering drain 的顺序 |
| `packages/agent/src/agent-loop.ts:424–478` | assistant message_start / update / end |
| `packages/agent/src/agent-loop.ts:545–635, 929–958` | 工具生命周期与 toolResult message_start / end |
| `packages/coding-agent/docs/rpc.md:22–69` | response 与 session event 的协议边界、id 关联及 settle 说明 |
| `packages/coding-agent/docs/rpc-commands.md:7–68` | prompt/steer 输入、disposition 与 queued 语义 |
| `packages/coding-agent/docs/json.md:31–68, 101–124` | run、message、tool、queue 事件的公开语义 |

固定提交入口：

- [RPC mode](https://github.com/LicsDaSheng/pi/blob/4ea8837927564c592b1d184c956ab7d28c88119b/packages/coding-agent/src/modes/rpc/rpc-mode.ts)
- [RPC types](https://github.com/LicsDaSheng/pi/blob/4ea8837927564c592b1d184c956ab7d28c88119b/packages/coding-agent/src/modes/rpc/rpc-types.ts)
- [AgentSession](https://github.com/LicsDaSheng/pi/blob/4ea8837927564c592b1d184c956ab7d28c88119b/packages/coding-agent/src/core/agent-session.ts)
- [Agent queue](https://github.com/LicsDaSheng/pi/blob/4ea8837927564c592b1d184c956ab7d28c88119b/packages/agent/src/agent.ts)
- [Agent loop](https://github.com/LicsDaSheng/pi/blob/4ea8837927564c592b1d184c956ab7d28c88119b/packages/agent/src/agent-loop.ts)
- [RPC 文档](https://github.com/LicsDaSheng/pi/blob/4ea8837927564c592b1d184c956ab7d28c88119b/packages/coding-agent/docs/rpc.md)
- [RPC 命令文档](https://github.com/LicsDaSheng/pi/blob/4ea8837927564c592b1d184c956ab7d28c88119b/packages/coding-agent/docs/rpc-commands.md)
- [JSON 事件文档](https://github.com/LicsDaSheng/pi/blob/4ea8837927564c592b1d184c956ab7d28c88119b/packages/coding-agent/docs/json.md)

### 易误读之处

1. `queue_update` 与 RPC response 是两种记录；前者没有 request id。
2. 入队时先发 `queue_update`，不表示消息已经被 Agent 消费。
3. 核心队列 drain 与公开展示队列删除不是同一时刻；后者发生在 user `message_start` 的 session 内部处理阶段。
4. `turn_start` 先于该 steer 的 user `message_start`。
5. steering 不会在工具执行中间抢占；工具事件和 toolResult 消息先完成。
6. `agent_end` 不是 session 最终空闲信号；`agent_settled` 也不是单条 steer 的成功确认。
7. 相同文本只能按内容和顺序推断，无法恢复原始 RPC request id。
8. 业务状态表是设计建议，不是 Pi 或当前 bot-runtime 已实现的状态机。

### 验证记录

尝试使用参考仓库已有依赖运行两项相关测试，未调用真实模型：

```sh
cd ~/workspace/github/pi/packages/coding-agent
NO_COLOR=1 node ../../node_modules/vitest/dist/cli.js --run \
  test/rpc-prompt-response-semantics.test.ts \
  test/suite/agent-session-queue.test.ts
```

测试在收集阶段停止，两个测试文件均未执行。原因是本地参考仓库的 `node_modules` 中缺少工作区包 `@earendil-works/pi-schema`；本次没有安装依赖或修改参考仓库来修复环境。本文对事件顺序的结论因此以固定提交源码、官方文档和现有测试断言的人工核查为依据，不声称这两项测试已经通过。

博客项目完成内容检查与生产构建：

```sh
cd astro-site
pnpm check
pnpm build
```

`pnpm check` 返回 0 个错误；`pnpm build` 成功生成 `/posts/pi-tutorial/03-rpc-steer-lifecycle/`，并完成 Pagefind 索引。检查中的 5 条提示均来自既有主题文件，与本文无关。
