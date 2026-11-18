import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const root = new URL("../dist/series/", import.meta.url);
const physical = readFileSync(new URL("physical-ai/index.html", root), "utf8");
const thoughts = readFileSync(new URL("personal-thoughts/index.html", root), "utf8");
const index = readFileSync(new URL("index.html", root), "utf8");

const chapterLinks = (html) => [...html.matchAll(/class="series-chapter-main"[\s\S]*?<strong>([^<]+)<\/strong>/g)]
  .map((match) => match[1]);

test("新增两个专栏并按顺序收录匹配的文章", () => {
  assert.match(index, /Physical AI/);
  assert.match(index, /个人思考/);
  assert.deepEqual(chapterLinks(physical), [
    "从零拆解机械臂 + Isaac ROS：硬件、通信和软件全链路",
    "ReKep 论文解读：用关系关键点约束连接语言与机器人动作（上篇）",
    "ReKep 与 VLA、世界模型的关系：从显式约束到学习型策略（下篇）",
  ]);
  assert.deepEqual(chapterLinks(thoughts), [
    "智能体应该适配人的工作方式，而不是让人适配智能体",
    "智能体的设计哲学演变：尽可能少地占用人类注意力，但尽可能地创造价值",
    "从今天起，别再只把笔记本当电脑用了",
  ]);
});

test("每篇文章在对应专栏只出现一次，且其他专栏入口保留", () => {
  assert.match(index, /Pi 智能体开发教程/);
  assert.match(index, /微服务技术回顾/);
  assert.equal(chapterLinks(physical).length, 3);
  assert.equal(chapterLinks(thoughts).length, 3);
});
