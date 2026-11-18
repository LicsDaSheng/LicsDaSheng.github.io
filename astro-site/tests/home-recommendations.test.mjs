import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

// 构建后检查首页推荐区，不改变专栏独立页面与最新文章。
const home = readFileSync(new URL("../dist/index.html", import.meta.url), "utf8");
const section = home.match(/<section id="recommended"[\s\S]*?<\/section>/)?.[0];

test("首页展示且仅展示两篇指定推荐文章", () => {
  assert.ok(section, "首页缺少推荐区");
  const links = [...section.matchAll(/<a href="(\/posts\/[^"]+)"\s+class="post-card-title/g)].map((match) => match[1]);
  assert.deepEqual(links, [
    "/posts/laptop-as-digital-employee/",
    "/posts/agent-adapts-to-human/",
  ]);
  assert.match(section, /从今天起，别再只把笔记本当电脑用了/);
  assert.match(section, /智能体应该适配人的工作方式，而不是让人适配智能体/);
});

test("最新文章保持原有位置，首页不再展示专栏卡片", () => {
  assert.ok(home.indexOf('id="recommended"') < home.indexOf("<span>最新文章</span>"));
  assert.doesNotMatch(home, /series-card paper-panel/);
  assert.match(home, /href="\/series\/"/); // 专栏入口仍可通过导航访问
});
