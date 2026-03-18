# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 项目概述

这是一个 MkDocs 静态文档站点，使用 Material 主题，用于存放技术文档和深度分析文章。

## 常用命令

```bash
# 本地预览（热重载）
mkdocs serve

# 构建静态站点
mkdocs build

# 构建并清理旧文件
mkdocs build --clean

# 部署到 GitHub Pages
mkdocs gh-deploy
```

## 项目结构

```
mkdocs.yml          # MkDocs 配置文件
docs/               # Markdown 源文件目录
  index.md          # 首页
  *.md              # 其他文档页面
site/               # 构建输出目录（gitignore）
```

## 添加新文章

1. 在 `docs/` 目录下创建 `.md` 文件
2. 在 `mkdocs.yml` 的 `nav` 部分添加导航链接

## 主题配置

使用 `mkdocs-material` 主题，支持：
- 中英文搜索
- 深色/浅色模式切换
- 代码高亮和复制
- 目录导航

## 依赖安装

```bash
pip install mkdocs mkdocs-material
```
