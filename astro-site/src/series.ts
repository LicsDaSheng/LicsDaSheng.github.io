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
	{
		id: "microservices-review",
		title: "微服务技术回顾",
		eyebrow: "COLUMN · MICROSERVICES REVIEW",
		description:
			"系统回顾微服务架构的来龙去脉：从单体拆分的动机与边界，到注册发现、网关、通信、容错、数据一致性等核心组件，再到可观测性与服务网格，最后复盘实践中的取舍与教训。",
		audience:
			"面向有一定后端开发经验、用过或准备使用微服务的工程师，也适合想把零散知识串成体系的读者。",
		stages: [
			{
				title: "第一阶段 · 演进与拆分",
				description: "为什么要微服务：单体的瓶颈、架构演进脉络、服务拆分原则与领域边界。",
				status: "active",
			},
			{
				title: "第二阶段 · 核心组件",
				description:
					"注册发现、配置中心、API 网关、RPC 与消息通信、负载均衡、熔断限流降级、分布式事务。",
				status: "planned",
			},
			{
				title: "第三阶段 · 可观测与治理",
				description: "日志、指标、链路追踪，容器化与 Kubernetes，服务网格（Service Mesh）。",
				status: "planned",
			},
			{
				title: "第四阶段 · 复盘与反思",
				description: "实践中的典型问题与设计取舍：什么时候不该用微服务，以及架构的下一步。",
				status: "planned",
			},
		],
	},
];

export function getSeriesConfig(id: string | undefined | null) {
	if (!id) return undefined;
	return seriesList.find((s) => s.id === id);
}
