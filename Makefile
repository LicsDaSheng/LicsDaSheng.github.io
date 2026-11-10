# 博客站点便捷命令（源码在 astro-site/，包管理器 pnpm）

SITE_DIR := astro-site
PNPM := pnpm --dir $(SITE_DIR)

.PHONY: run dev build preview install clean check

## make run：安装依赖（如有缺失）→ 构建 → 启动本地预览服务
run: install build
	$(PNPM) preview

## make dev：开发模式（热更新，不构建）
dev: install
	$(PNPM) dev

build: install
	$(PNPM) build

preview: build
	$(PNPM) preview

check: install
	$(PNPM) check

install:
	@if [ ! -d "$(SITE_DIR)/node_modules" ]; then \
		$(PNPM) install; \
	fi

clean:
	rm -rf $(SITE_DIR)/dist $(SITE_DIR)/.astro
