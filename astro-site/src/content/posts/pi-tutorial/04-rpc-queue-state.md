---
title: "第四章：Pi RPC 队列状态——如何观察待处理消息并设计上层调度"
published: 2026-11-12
description: "从 Pi 1.5.2 源码厘清 get_state、queue_update、steer、follow_up 与 clear_queue 的边界，并给出 super agent 调度 Pi 会话的观察模型与决策框架。"
tags: [pi, rpc, queue, agent-orchestration, 源码剖析]
category: Pi 教程
series: pi-tutorial
seriesOrder: 4
seriesStage: 3
draft: false
---

> 阶段：问题驱动的技术解析。适用版本：`@earendil-works/pi-coding-agent` `1.5.2`；参考本地仓库 `~/workspace/github/pi`，固定提交 `a40abecaaf39e5a11e6c4850ee5cd8ecda4958cc`。
>
> 本文前半部分描述 **Pi RPC 的协议事实**，后半部分提出 **super agent 的上层调度设计**。调度状态与决策规则不是 Pi 原生协议的一部分。

[第三章](/posts/pi-tutorial/03-rpc-steer-lifecycle/)追踪了一条 `steer` 消息从排队到被消费的生命周期。本章继续回答一个更接近工程落地的问题：**外部程序怎样知道 Pi 是否正在运行、队列里有多少条消息，以及这些消息具体是什么？**

先给结论：

1. Pi RPC 没有单独的“只读查询队列内容”命令。
2. `get_state` 能查询运行状态和待处理消息数量，但不返回队列正文。
3. `queue_update` 会发布 `steering` 与 `followUp` 的完整快照；外部程序需要从进程启动时持续监听并缓存。
4. `steer` / `follow_up` response 中的 `disposition` 只描述命令的接收方式，不代表消息已经执行完成。
5. `clear_queue` 会返回队列内容，但同时清空队列，不能当作查询接口使用。

这意味着：如果要在 Pi 之上构建一个可靠的调度器，不能只靠轮询一个状态接口，而要同时处理**状态查询、事件快照和命令响应**。

## 1. `get_state`：查询运行状态，不查询队列正文

RPC 客户端可以发送：

```json
{"id":"state-1","type":"get_state"}
```

Pi 1.5.2 返回的状态不只有队列字段。下面省略了 `model` 等较大的对象，只保留与调度最相关的内容：

```json
{
  "id": "state-1",
  "type": "response",
  "command": "get_state",
  "success": true,
  "data": {
    "thinkingLevel": "medium",
    "isStreaming": true,
    "isCompacting": false,
    "steeringMode": "one-at-a-time",
    "followUpMode": "one-at-a-time",
    "sessionId": "session-id",
    "sessionName": "example",
    "autoCompactionEnabled": true,
    "messageCount": 18,
    "pendingMessageCount": 2
  }
}
```

其中，与队列观察直接相关的是：

| 字段 | 可以回答 | 不能回答 |
| --- | --- | --- |
| `isStreaming` | 当前是否有 Agent run 正在进行 | 当前 run 何时结束、某条消息是否完成 |
| `isCompacting` | 当前是否正在压缩上下文 | 压缩结束后业务任务是否完成 |
| `pendingMessageCount` | steering 与 follow-up 队列合计有多少条消息 | 两类队列各有多少条、消息正文是什么 |
| `steeringMode` | steering 队列按 `all` 还是 `one-at-a-time` 投递 | 当前 steering 队列的内容 |
| `followUpMode` | follow-up 队列按 `all` 还是 `one-at-a-time` 投递 | 当前 follow-up 队列的内容 |
| `sessionId` / `sessionName` | 当前绑定的是哪个 session | 队列消息与外部业务 id 的对应关系 |

源码中，`pendingMessageCount` 的计算很直接：

```ts
get pendingMessageCount(): number {
  return this._steeringMessages.length + this._followUpMessages.length;
}
```

因此它只是两个队列长度的总和。即使值为 `2`，外部程序仍然不知道这是两条 steering、两条 follow-up，还是各一条；更无法从中恢复消息正文。

## 2. `queue_update`：队列内容的完整快照

队列发生变化时，Pi 会发布 `queue_update` session event：

```json
{
  "type": "queue_update",
  "steering": [
    "先检查失败重试，再继续实现"
  ],
  "followUp": [
    "当前任务完成后补充测试说明"
  ]
}
```

两个数组的语义不同：

- `steering`：在当前 Agent run 中尽快改变后续执行方向。它不会抢占正在执行的工具，而是在当前 assistant turn 及其工具调用结束后，于下一次模型调用前注入。
- `followUp`：等当前 Agent run 不再有工具调用和 steering 消息后，再作为后续要求处理。

`queue_update` 是**完整快照**，不是增量事件。每次收到事件时，都应该用新数组覆盖旧缓存：

```ts
let queueSnapshot = {
  steering: [] as string[],
  followUp: [] as string[],
};

function onSessionEvent(event: SessionEvent) {
  if (event.type !== "queue_update") return;

  queueSnapshot = {
    steering: [...event.steering],
    followUp: [...event.followUp],
  };
}
```

源码中的发送逻辑同样表明它是快照：

```ts
private _emitQueueUpdate(): void {
  this._emit({
    type: "queue_update",
    steering: [...this._steeringMessages],
    followUp: [...this._followUpMessages],
  });
}
```

消息入队时会发送一次快照；当某条 user 消息开始被消费时，Pi 先把匹配文本从内部队列移除，再发送新的快照。因此，队列数组变短表示消息已从待处理队列中取出，**不表示这条消息对应的任务已经执行成功**。

### 必须正视的观察窗口

`queue_update` 只在队列变化时发出，并不是一个可随时调用的读取接口。如果观察端中途断开，又错过了队列变化事件，仅凭 `get_state` 的数量无法重建正文。

所以，一个需要可靠调度的宿主程序至少应做到：

1. 从 Pi RPC 进程启动时就订阅 stdout 事件。
2. 将最新快照保存在宿主侧，而不是临时读取后丢弃。
3. 将缓存与 `sessionId`、RPC 进程实例绑定，避免切换 session 后继续使用旧快照。
4. 发生断线、进程重启或事件解析失败时，把正文缓存标记为“不可信”，而不是根据数量猜测内容。

## 3. `disposition`：命令被怎样接收

发送 `steer` 或 `follow_up` 后，Pi 会返回带原请求 `id` 的 response：

```json
{
  "id": "dispatch-42",
  "type": "response",
  "command": "steer",
  "success": true,
  "data": {
    "disposition": "queued"
  }
}
```

相关值有两个：

| `disposition` | Pi 中的含义 | 调度器应该如何解释 |
| --- | --- | --- |
| `queued` | 输入处理后进入 steering 或 follow-up 队列 | 投递已被接受，可以继续观察队列和消息事件 |
| `handled` | 输入处理器已经消费输入，没有按普通消息入队 | 不应继续等待它出现在队列快照中 |

这里最容易产生的误解是把 `queued` 当成“任务已开始”，或者把 `handled` 当成“模型已完成”。两者都不正确。

`disposition` 回答的是：**这条 RPC 输入在命令接收阶段去了哪里？** 它不回答：

- 消息是否已经进入模型上下文；
- 模型是否已经开始处理；
- 工具调用是否成功；
- 业务目标是否完成。

如果要观察排队消息何时开始被消费，可以继续监听匹配的 user `message_start` / `message_end`。但 `queue_update` 和后续消息事件不携带原始 RPC request id；当队列中存在相同文本时，仅靠正文无法无歧义地映射回外部业务记录。这是上层系统设计关联机制时必须接受的协议限制。

## 4. 为什么 `clear_queue` 不能用于查询

`clear_queue` 的响应确实会返回当时的队列内容：

```json
{
  "id": "clear-1",
  "type": "response",
  "command": "clear_queue",
  "success": true,
  "data": {
    "steering": ["先检查失败重试"],
    "followUp": ["完成后补充测试"]
  }
}
```

但它的完整语义是：

```text
复制当前 steering / followUp 队列
  → 清空 AgentSession 中的两个队列
  → 清空底层 Agent 队列
  → 发布空的 queue_update
  → 返回清理前的内容
```

如果把它当作查询，会直接改变 Pi 的执行计划，并引入并发入队时的竞态。所谓“先清空、读取、再重新放回”也不是安全替代方案，因为消息顺序、消费时机和输入处理结果都可能发生变化。

`clear_queue` 只应该用于明确的取消或重排操作，不应该出现在普通状态页的刷新逻辑中。

## 5. 外部调度器应维护三层事实

为了避免把不同信号混成一个“状态”，宿主程序可以将信息分为三层：

| 层次 | 来源 | 保存内容 | 可信边界 |
| --- | --- | --- | --- |
| 会话运行状态 | `get_state` | `sessionId`、`isStreaming`、`isCompacting`、队列模式、消息数量 | 查询时刻的状态 |
| 队列内容 | `queue_update` | 最新 `steering[]` 与 `followUp[]` 快照 | 自最后一个未丢失事件起可信 |
| 单次投递结果 | RPC response | request id、command、`success`、`disposition` | 只描述这次命令的接收结果 |

一个更稳妥的观察流程是：

```text
启动 RPC 进程并立即监听事件
  ├─ get_state
  │    └─ 保存 sessionId、运行状态和 pendingMessageCount
  ├─ queue_update
  │    └─ 原子替换当前 session 的队列快照
  └─ steer / follow_up response
       ├─ disposition=queued  → 记录“已接受并排队”
       └─ disposition=handled → 记录“被输入处理器处理”
```

还可以做一个一致性检查：

```text
queueSnapshot.steering.length
+ queueSnapshot.followUp.length
=== get_state.pendingMessageCount
```

相等时，只能说明两个观察结果在当时看起来一致；不相等时，可能是并发变化、事件尚未处理，或观察端丢失了快照。它适合用于发现问题，不适合作为强一致性证明。

## 6. 在 Pi 之上构建 super agent

有了上述观察模型，就可以进一步设计一个负责调度 Pi 的 super agent：

> super agent 通过内置工具观察 Pi session 的运行状态与消息队列，再根据新要求和当前任务的关系，决定使用 `steer`、`follow_up`，还是等待当前运行稳定后创建新的 session。

### 6.1 工具分层

super agent 的内置工具可以分成三组：

1. **观察工具**：调用 `get_state`，读取宿主缓存的 `queue_update`，查看最近的消息与生命周期事件。
2. **调度工具**：发送 `steer`、`follow_up`、`abort` 或 `clear_queue`。
3. **会话工具**：在需要隔离上下文时调用 `new_session`，并重新绑定新 session 的状态与队列缓存。

工具返回值应保留 Pi 的原始事实，不要直接把 `queued` 翻译成“执行中”，也不要把 `isStreaming=false` 翻译成“任务成功”。业务状态应该由 super agent 或宿主根据多种事件派生。

### 6.2 决策框架

新消息到来后，可以按下面的顺序判断：

| 判断 | 推荐动作 | 典型场景 |
| --- | --- | --- |
| 新消息会立即改变当前任务的方向或约束 | `steer` | “先不要改文件，先验证根因” |
| 当前任务仍应完成，新消息适合随后处理 | `follow_up` | “完成后再补充测试和文档” |
| 新消息与当前任务无关，需要干净上下文 | 等待稳定后 `new_session` | 从代码排障切换到独立的方案写作 |
| 当前执行已经不应继续 | 先 `abort`，必要时清理队列，再决定是否新建 session | 发现目标错误、权限风险或破坏性操作 |

这里不能只看 `isStreaming`。真正的决策至少还需要考虑：

- 新消息与当前任务的语义相关性；
- 是否会改变当前工具调用之后的行动方向；
- 队列中是否已经存在同义或冲突要求；
- 当前上下文是否仍适合承载新任务；
- 是否需要取消、清队列或保留审计记录。

一个保守的流程如下：

```text
读取 get_state + 最新 queue_update
  ↓
确认快照是否可信、sessionId 是否一致
  ↓
判断新消息与当前任务的关系
  ├─ 立即改变方向 → steer
  ├─ 当前任务结束后继续 → follow_up
  ├─ 当前执行应停止 → abort / clear_queue
  └─ 上下文需要隔离 → 等待稳定或中止后 new_session
```

### 6.3 上层系统仍需补齐的能力

Pi 提供了调度所需的基础信号，但一个可靠的 super agent 还需要自己解决：

- **稳定关联**：RPC request id 不会自动进入后续 user 消息事件；重复正文无法可靠匹配。
- **幂等投递**：网络重试或宿主重启时，如何避免同一要求被重复排队。
- **快照可信度**：如何识别事件丢失、进程重启和 session 切换。
- **完成定义**：什么叫消息已消费、Agent run 已稳定、业务任务已成功。
- **冲突处理**：新 `steer` 与已有 steering/follow-up 消息冲突时，谁有更高优先级。
- **审计与恢复**：为什么选择某个动作，以及失败后如何恢复或人工接管。

因此，Pi RPC 适合成为调度执行层，但不会替上层系统定义完整的业务状态机。

## 7. 源码定位

以下路径均相对于 Pi 源码仓库根目录：

| 源码路径 | 关注点 |
| --- | --- |
| `packages/coding-agent/src/modes/rpc/rpc-mode.ts` | `steer`、`follow_up`、`clear_queue`、`new_session` 与 `get_state` 的命令分发 |
| `packages/coding-agent/src/modes/rpc/rpc-types.ts` | `RpcSessionState`、response 和 `disposition` 的类型定义 |
| `packages/coding-agent/src/core/agent-session.ts` | 队列存储、入队、出队、`pendingMessageCount`、`queue_update` 与 `clearQueue()` |
| `packages/coding-agent/src/modes/json-event.ts` | session event 到 JSON/RPC stdout 事件的转换 |

阅读这些源码时，应始终区分三种信息：

- `get_state` 是某一时刻的**会话状态查询**；
- `queue_update` 是队列变化后的**内容快照事件**；
- RPC response 是某一条命令的**接收结果**。

它们组合起来提供了可观测性，但没有合并成一个“按业务 id 查询消息并确认完成”的接口。

## 小结

- Pi 1.5.2 没有只读查询队列正文的 RPC 命令。
- `get_state` 能提供运行状态、队列模式和待处理总数，但不能恢复队列内容。
- `queue_update` 提供 steering 与 follow-up 的完整快照，宿主应持续监听并按 session 缓存。
- `queued` 和 `handled` 描述输入在接收阶段的去向，不等于开始执行或业务完成。
- `clear_queue` 是会改变系统状态的取消操作，不能作为查询手段。
- super agent 可以基于这些信号在 `steer`、`follow_up`、取消和新 session 之间做决策，但关联、幂等、完成判定与恢复机制仍需由上层系统实现。
