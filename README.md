# Agent Insight

技术文档与深度分析文章的静态站点。

## 本地预览

```bash
# 安装依赖
pip install mkdocs mkdocs-material

# 启动本地服务器（热重载）
mkdocs serve
```

访问 http://127.0.0.1:8000 查看站点。

## 构建部署

```bash
# 构建静态文件
mkdocs build

# 部署到 GitHub Pages
mkdocs gh-deploy
```

## 添加新文章

1. 在 `docs/` 目录下创建 `.md` 文件
2. 在 `mkdocs.yml` 的 `nav` 部分添加导航链接

## 项目结构

```
docs/           # Markdown 源文件
mkdocs.yml      # MkDocs 配置
site/           # 构建输出（已忽略）
```

## License

MIT
