# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 项目概述

这是一个 GitHub 个人主页静态站点，基于 **Jekyll + Minimal Mistakes** 主题构建。

**优势：**
- GitHub Pages 原生支持，无需 CI/CD 配置
- 推送即部署，自动化构建
- 主题成熟、功能丰富、社区活跃
- 良好的 SEO 和移动端适配

## 常用命令

```bash
# 本地预览（需要安装 Jekyll）
bundle install          # 首次安装依赖
bundle exec jekyll serve

# 构建静态站点
bundle exec jekyll build

# 清理构建缓存
bundle exec jekyll clean
```

## 项目结构

```
_config.yml         # Jekyll 配置文件（主题、导航、作者信息）
_posts/             # 博客文章目录（格式: YYYY-MM-DD-title.md）
_pages/             # 静态页面（关于、项目等）
_includes/          # 自定义 HTML 组件
_layouts/           # 自定义页面布局
assets/             # 静态资源（图片、CSS、JS）
index.html          # 首页
```

## 添加新内容

### 博客文章
在 `_posts/` 目录创建文件，命名格式：`YYYY-MM-DD-title.md`

```yaml
---
title: "文章标题"
date: 2026-03-18
categories: [技术]
tags: [jekyll, github]
---
```

### 静态页面
在 `_pages/` 目录创建 `.md` 文件，并在 `_config.yml` 的 `navigation` 中添加链接

## 主题配置

Minimal Mistakes 主题已启用：
- 🌓 深色/浅色模式切换
- 🔍 全站搜索（Lunr）
- 📱 响应式设计
- 💬 评论系统集成（可选）
- 📊 Google Analytics（可选）

## 依赖安装

```bash
# macOS
gem install bundler jekyll
bundle install
```

## 用户体验原则

1. **首页清晰** - 一眼了解站主是谁、做什么
2. **导航简洁** - 核心内容触手可及
3. **加载快速** - 图片优化、减少外部依赖
4. **移动优先** - 确保手机端浏览体验流畅
