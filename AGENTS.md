# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 项目概述

个人技术博客，基于 **Astro + Fuwari** 主题构建，专注 AI Agent 领域深度分析。

- 站点地址：https://licsdasheng.github.io （用户主页仓库，根域名部署）
- 站点源码在 **`astro-site/`** 子目录（Astro 项目根）
- 部署方式：GitHub Actions（`.github/workflows/deploy-astro.yml`），推送到 `main` 自动构建并发布到 GitHub Pages
- 包管理器：**pnpm**（`packageManager: pnpm@9.x`），搜索由 **Pagefind** 提供

> 历史：本站曾使用 Jekyll + Chirpy，已于迁移后移除；旧文件可在 git 历史中找到。

## 常用命令

> 所有命令在 `astro-site/` 目录下执行。

```bash
cd astro-site
pnpm install          # 安装依赖
pnpm dev              # 本地预览 http://localhost:4321
pnpm build            # 构建到 dist/（含 Pagefind 索引）
pnpm preview          # 预览生产构建
pnpm new-post <name>  # 新建文章到 src/content/posts/
pnpm astro check      # 类型与内容 schema 检查
```

## 项目结构

```
astro-site/
├── src/
│   ├── config.ts            # 站点配置（标题、语言、作者、头像、favicon、导航）
│   ├── content/
│   │   ├── posts/           # 博客文章（.md / .mdx）
│   │   └── spec/about.md    # 关于页内容
│   ├── content/config.ts    # 内容集合 schema（frontmatter 校验）
│   ├── assets/images/       # 经构建处理的图片（如 avatar.svg）
│   ├── components/ layouts/ pages/   # 主题组件与页面
│   └── plugins/ styles/ i18n/
├── public/                  # 原样输出的静态资源（favicon/、avatar.png）
└── astro.config.mjs         # Astro 配置（site=线上地址, base="/"）
.github/workflows/deploy-astro.yml   # Pages 部署流程
```

## 添加新文章

在 `astro-site/src/content/posts/` 创建 `.md`，frontmatter 须符合 `src/content/config.ts` 的 schema：

```yaml
---
title: "文章标题"
published: 2026-06-23        # 日期（必填）
description: "一句话摘要"
tags: [tag1, tag2]
category: 分类名             # 单个字符串
draft: false
# image: /cover.jpg         # 可选封面，置于 public/ 用 /path，或同目录用 ./path
---
```

文件名即 slug；正文无需重复一级标题（主题会渲染 title）。

## 配置要点（src/config.ts）

- `title` / `subtitle` / `lang`（`zh_CN`）
- `themeColor.hue`：主题色相（当前 250，蓝色系）
- `profileConfig.avatar`：头像（`assets/images/avatar.svg`）
- `favicon`：浏览器标签页图标数组
- `navBarConfig.links`：顶部导航

## 用户体验原则

1. **首页清晰** - 一眼了解站主是谁、做什么
2. **导航简洁** - 核心内容触手可及
3. **加载快速** - 图片带尺寸、按需加载，零多余 JS
4. **移动优先** - 确保手机端浏览体验流畅
