---
title: "Claude Code 的 `/loop` 命令：让 AI 编码进入"自动驾驶"时代"
date: 2026-03-18 10:00:00 +0800
categories: [AI, Claude Code]
tags: [claude-code, loop, automation]
math: false
mermaid: false
---

# Claude Code 的 `/loop` 命令：让 AI 编码进入"自动驾驶"时代

> 2026 年 3 月 7 日，Claude Code v2.1.71 悄悄加入了一个可能改变 AI 编码工作方式的功能。

---

## 一行命令，无限循环

在 `/loop` 出现之前，使用 Claude Code 的模式是**人驱动 AI**：你输入指令，AI 执行，你检查，再输入下一个指令。每一次交互都需要人类在场。

`/loop` 打破了这个模式。

```
/loop 5m check the deploy
```

这一行命令做了什么？它告诉 Claude Code：**每隔 5 分钟，自动执行一次 "check the deploy"，不需要我在场。**

这不是脚本。不是 cron job。不是外部自动化工具。这是 Claude Code 内置的原生能力——在同一个会话内，让 AI 按照你设定的时间间隔，**反复执行同一个任务**。

同时发布的还有 **cron scheduling tools**，支持更复杂的定时调度模式。

---

## 为什么这个功能意义重大？

### 1. 从"一次性工具"到"持续运行的服务"

传统的 AI 编码工具本质上是**函数调用**——你调用一次，它执行一次，然后结束。`/loop` 把这个模型变成了**服务**——启动后持续运行，按计划反复执行。

这看起来只是加了一个定时器，但范式上的变化是根本性的。就像 HTTP 从请求-响应模式进化到 WebSocket 持久连接——连接的性质变了，能做的事情也完全不同。

### 2. 真正的"无人值守"开发

考虑这些场景：

- **部署监控：** `/loop 5m check the deploy status and alert if anything fails`
- **代码质量守护：** `/loop 10m run lint and fix any issues`
- **测试守护：** `/loop 15m run the test suite, fix failures if any`
- **依赖更新：** `/loop 1h check for dependency updates and create PRs`

你不需要坐在电脑前等待。AI 会像你的夜班同事一样，按照计划持续工作。

### 3. 会话上下文的天然优势

`/loop` 在**同一个 Claude Code 会话内**运行，这意味着：
- 每次循环都**共享相同的上下文**——AI 记得之前做了什么
- 权限、工具、配置都是**已就绪的**——不需要每次重新配置
- 可以利用 Claude Code 的**全部 agentic 能力**——文件读写、命令执行、搜索、Web 访问

这和外部脚本循环调用 `claude` CLI 有本质区别：外部调用每次都是全新会话，上下文为零。

### 4. 从"提问"到"设定目标"

使用 `/loop` 的思维方式变了。你不再是问 Claude "帮我做 X"，而是**设定一个持续目标**："持续关注 X，保持 Y 的状态"。这是一种更高层的抽象——从命令式编程到声明式编程的跃迁。

---

## 技术细节

### 命令格式

```
/loop <interval> <prompt or slash command>
```

- **interval**：时间间隔，如 `5m`（5分钟）、`1h`（1小时）
- **prompt**：任意提示词或斜杠命令

### 已知问题与修复

v2.1.76（March 14, 2026）修复了 `/loop` 的一个兼容性问题：
- 修复了在 **Bedrock、Vertex、Foundry** 上 `/loop` 不可用的问题
- 修复了 **telemetry 禁用**时 `/loop` 不可用的问题

这说明初始版本在企业级部署场景存在一些限制，Anthropic 在一周内就修复了。

### 配套功能：Cron Scheduling Tools

与 `/loop` 同时发布的还有 **cron scheduling tools**，提供更灵活的定时调度：
- 支持 cron 表达式（如 `0 */2 * * *`）
- 适合更复杂的调度需求（每天固定时间、工作日执行等）
- 与 `/loop` 的简单间隔模式互补

---

## 与"Continuous Claude"的对比

HN 上 170+ points 的第三方项目 **Continuous Claude**（Anand Chowdhary）采用了类似思路，但路径不同：

| 维度 | Claude Code `/loop` | Continuous Claude |
|------|---------------------|-------------------|
| **实现方式** | 内置命令，单会话内循环 | 外部 Bash 脚本，多次启动 Claude |
| **上下文持久化** | 天然共享会话上下文 | 需要外部 Markdown 文件中转 |
| **工作流集成** | 无 Git/PR 集成 | 深度集成 GitHub PR 工作流 |
| **定时模式** | 间隔 + cron | while true + sleep |
| **容错机制** | 会话级 | 分支级（失败丢弃分支） |
| **适用场景** | 监控、守护、轻量自动化 | 大规模重构、测试覆盖提升 |

两者不矛盾。`/loop` 是**轻量级的内置方案**，Continuous Claude 是**重量级的外部编排**。对于日常开发中的持续任务，`/loop` 就够了；对于跨多个 PR 的大型工程，Continuous Claude 的 Git 工作流集成更有优势。

---

## 深层影响：AI 编码的"常驻化"趋势

`/loop` 的出现不是孤立的。把它和其他信号放在一起看：

1. **Claude Code 自身**：从单次对话到 agentic loop，再到 `/loop` 的循环执行
2. **Cursor**：支持同时运行多个 Agent 并行处理不同任务
3. **GitHub Next Continuous AI**：探索 Agent 的持续运行范式
4. **OpenClaw**：cron job + heartbeat 机制实现 24/7 自动化

一个清晰的趋势正在形成：**AI 编码工具正在从"你调用它"变成"它持续运行"**。

这背后的驱动力是 token 成本的持续下降和模型能力的持续提升。当调用一次 AI 的边际成本趋近于零时，"让它一直跑"就从奢侈品变成了默认选项。

---

## 风险与注意事项

1. **成本失控**：循环执行意味着持续的 token 消耗，长间隔高频率的任务可能产生可观费用
2. **幻觉累积**：AI 在循环中可能基于自己的错误输出继续工作，形成"幻觉雪球"
3. **权限放大**：自动执行意味着 AI 可以在你不在场时执行操作——确保权限配置合理
4. **无限循环风险**：虽然 changelog 中多次提到修复 infinite loop 问题，但设计不当时仍可能出现
5. **Bedrock/Vertex 兼容性**：企业用户需确认 v2.1.76+ 已修复相关问题

---

## 结语

`/loop` 是一个小功能，但它指向一个大方向：**AI 编码工具正在从"工具"进化为"常驻服务"。**

当你可以用一行命令让 AI 持续守护你的代码库时，开发者的角色也在悄然改变——从"写代码的人"变成"设定目标和审查结果的人"。

也许未来的开发者不需要整天坐在 IDE 前。他们只需要在早上设置好 `/loop`，然后喝杯咖啡，看看 AI 的工作报告。

毕竟，最好的代码审查，是在你睡觉时自动进行的。

---

*本文基于 Claude Code 官方 Changelog（v2.1.71 / v2.1.76）及 HN 社区讨论整理分析。*
*参考来源：https://code.claude.com/docs/en/changelog#2-1-71*
