export type SeriesStage = {
	title: string;
	description: string;
	status: "active" | "planned";
};

export type SeriesConfig = {
	id: string;
	title: string;
	eyebrow: string;
	description: string;
	audience: string;
	stages: SeriesStage[];
};

// 专栏定义：文章通过 frontmatter 的 `series` 与 `seriesOrder` 归入专栏
export const seriesList: SeriesConfig[] = [
	{
		id: "pi-tutorial",
		title: "Pi 智能体开发教程",
		eyebrow: "COLUMN · PI TUTORIAL",
		description:
			"以源码剖析、贯穿项目实践和问题驱动解析三个阶段，逐步学习如何基于 Pi 开发自定义智能体，而不只是学会使用现成工具。",
		audience:
			"面向具备基础编程能力的初级程序员，不默认读者熟悉 TypeScript、异步编程、LLM 或智能体开发。",
		stages: [
			{
				title: "第一阶段 · 源码级剖析",
				description: "从源码层面剖析 Pi agent 的原理、设计与实现。",
				status: "active",
			},
			{
				title: "第二阶段 · 动手实践",
				description: "围绕一个文件与资料处理助手逐步演进，完成自定义 agent。",
				status: "planned",
			},
			{
				title: "第三阶段 · 问题驱动的技术解析",
				description: "围绕实践中的具体问题，解释相关机制与设计取舍。",
				status: "planned",
			},
		],
	},
];

export function getSeriesConfig(id: string | undefined | null) {
	if (!id) return undefined;
	return seriesList.find((s) => s.id === id);
}
