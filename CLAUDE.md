# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 项目概述

这是一个 GitHub 个人博客站点，基于 **Jekyll + Chirpy** 主题（`jekyll-theme-chirpy`，gem 方式引入）构建。

- 站点地址：https://licsdasheng.github.io （用户主页仓库，根域名部署）
- 部署方式：GitHub Actions（`.github/workflows/pages-deploy.yml`），推送到 `main` 自动构建发布
- 主题特性：深色/浅色切换、全站搜索、分类/标签/归档、目录(TOC)、阅读时长、响应式

## 常用命令

```bash
bundle install              # 首次安装依赖
bundle exec jekyll serve    # 本地预览 http://127.0.0.1:4000
bundle exec jekyll build    # 构建静态站点到 _site/
bundle exec jekyll clean    # 清理构建缓存
```

## 项目结构

```
_config.yml         # Jekyll + Chirpy 配置（标题、作者、头像、分页、permalink）
_posts/             # 博客文章（格式: YYYY-MM-DD-title.md）
_tabs/              # 侧边栏导航页（关于/分类/标签/归档），靠 icon + order 排序
assets/images/      # 图片资源
index.html          # 首页（layout: home）
Gemfile             # Ruby 依赖
.github/workflows/  # GitHub Pages 部署流程
```

> 注意：Chirpy 的导航来自 `_tabs/`，**不是** `_pages/`。新增导航页请放在 `_tabs/`。

## 添加新内容

### 博客文章

在 `_posts/` 创建 `YYYY-MM-DD-title.md`，front matter 遵循 Chirpy 规范：

```yaml
---
title: "文章标题"
date: 2026-03-18 10:00:00 +0800   # 带时区，避免日期解析错误
categories: [一级分类, 二级分类]
tags: [tag1, tag2]                # 小写
math: false
mermaid: false
# 可选封面图：
# image:
#   path: /assets/images/cover.jpg
#   width: 1200
#   height: 630
---
```

### 导航页

在 `_tabs/` 创建 `.md`，用 `icon`（Font Awesome）和 `order` 控制侧边栏顺序，
并指定对应 `layout`（`page` / `categories` / `tags` / `archives`）。

## 配置要点

- `avatar`: 头像图片路径，需放置真实文件，否则留空 `""` 避免 404
- `permalink`: 当前为 `/:categories/:title/`
- `paginate`: 首页分页条数
- `timezone` / `lang`: `Asia/Shanghai` / `zh-CN`

## 用户体验原则

1. **首页清晰** - 一眼了解站主是谁、做什么
2. **导航简洁** - 核心内容触手可及
3. **加载快速** - 图片需带 width/height，减少外部依赖
4. **移动优先** - 确保手机端浏览体验流畅
