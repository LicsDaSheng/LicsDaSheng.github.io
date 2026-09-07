---
title: "终端文件管理器换代：从 ranger 到 Yazi + glow"
published: 2026-07-08
description: "ranger 的 markdown 预览一直不对味。切换到 Yazi，配合 glow 插件，在终端里直接渲染出带格式的 markdown。"
tags: [terminal, yazi, cli, markdown, 效率工具]
category: 工具
draft: false
---

ranger 用了很久，作为终端文件管理器它够用——Vim 键位、三栏布局、快速预览。但有一个痛点一直没解决：**markdown 文件的预览体验**。

ranger 对 `.md` 文件的预览本质上是把原始文本丢进 less。标题、列表、代码块全是一样颜色的纯文本，没有任何视觉层次。每次预览 markdown 都像在看源码，而不是在"阅读"。

最近切到了 [Yazi](https://github.com/sxyazi/yazi)，配合 [glow](https://github.com/charmbracelet/glow) 插件，预览体验终于对了。

## 为什么是 Yazi

Yazi 是用 Rust 写的，异步架构，性能比 ranger 好不止一个档次。大目录滚动丝滑，图片预览、视频缩略图都原生支持。更重要的是**插件系统**——previewer、preloader、fetcher 都可以按文件类型挂载不同的后端。

glow 是 Charmbracelet 出品的终端 markdown 渲染器，它能在终端里渲染出真正的 markdown 格式：

- 标题有字号层次
- 代码块有语法高亮
- 列表有缩进
- 表格有对齐

把 glow 挂到 Yazi 的 previewer 上，选中 `.md` 文件的瞬间就能在预览窗看到渲染后的效果。

## 安装与配置

```bash
# 安装 Yazi 及全部依赖
brew install yazi ffmpeg sevenzip jq poppler fd ripgrep fzf zoxide glow

# 安装 Piper 插件（通用预览器，可桥接 glow）
ya pkg add yazi-rs/plugins:piper
```

两个配置文件：

`~/.config/yazi/yazi.toml` — 对 markdown 文件挂 glow 预览：

```toml
[plugin]
prepend_previewers = [
  { mime = "text/markdown", run = "piper", args = ["glow -s dark -w $w -- $1"] },
]
```

`~/.config/yazi/keymap.toml` — 预览窗滚动快捷键：

```toml
[[manager.prepend_keymap]]
on = ["<C-e>"]
run = "seek 5"

[[manager.prepend_keymap]]
on = ["<C-y>"]
run = "seek -5"
```

Ctrl+E 上滚、Ctrl+Y 下滚。

## 依赖做什么

| 依赖 | 作用 |
|---|---|
| ffmpeg | 音视频预览 |
| sevenzip | 压缩包内浏览 |
| jq | JSON 语法高亮 |
| poppler | PDF 转文本预览 |
| fd | 文件搜索 |
| ripgrep | 内容搜索 |
| fzf | 模糊匹配 |
| zoxide | 智能跳转 |
| glow | markdown 渲染 |

## 小结

终端不等于简陋。ranger 是可靠的老工具，但 Yazi 在性能、扩展性、特别是 markdown 预览上完全是代际升级。如果你每天在终端里处理大量 markdown 文件（笔记、文档、README），这个切换值得一试。
