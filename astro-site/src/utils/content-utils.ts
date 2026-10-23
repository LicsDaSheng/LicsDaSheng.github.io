import { type CollectionEntry, getCollection } from "astro:content";
import I18nKey from "@i18n/i18nKey";
import { i18n } from "@i18n/translation";
import { getCategoryUrl } from "@utils/url-utils.ts";

// // Retrieve posts and sort them by publication date
async function getRawSortedPosts() {
	const allBlogPosts = await getCollection("posts", ({ data }) => {
		return import.meta.env.PROD ? data.draft !== true : true;
	});

	const sorted = allBlogPosts.sort((a, b) => {
		const dateA = new Date(a.data.published);
		const dateB = new Date(b.data.published);
		return dateA > dateB ? -1 : 1;
	});
	return sorted;
}

function linkNeighbours(posts: CollectionEntry<"posts">[]) {
	// posts 按阅读顺序反向排列（较新/靠后的在前），与原有 prev/next 语义一致
	for (let i = 1; i < posts.length; i++) {
		posts[i].data.nextSlug = posts[i - 1].slug;
		posts[i].data.nextTitle = posts[i - 1].data.title;
	}
	for (let i = 0; i < posts.length - 1; i++) {
		posts[i].data.prevSlug = posts[i + 1].slug;
		posts[i].data.prevTitle = posts[i + 1].data.title;
	}
}

function bySeriesOrder(a: CollectionEntry<"posts">, b: CollectionEntry<"posts">) {
	return (a.data.seriesOrder ?? 0) - (b.data.seriesOrder ?? 0);
}

export async function getSortedPosts() {
	const sorted = await getRawSortedPosts();

	// 普通文章按时间互相串联；专栏文章只在本专栏内按章节顺序串联
	linkNeighbours(sorted.filter((p) => !p.data.series));
	const seriesIds = new Set(
		sorted.map((p) => p.data.series).filter(Boolean) as string[],
	);
	for (const id of seriesIds) {
		linkNeighbours(
			sorted
				.filter((p) => p.data.series === id)
				.sort(bySeriesOrder)
				.reverse(),
		);
	}

	return sorted;
}

/** 首页信息流：不含专栏文章（专栏在 /series/ 单独呈现） */
export async function getFeedPosts() {
	return (await getSortedPosts()).filter((p) => !p.data.series);
}

/** 指定专栏的文章，按章节顺序升序 */
export async function getSeriesPosts(seriesId: string) {
	return (await getRawSortedPosts())
		.filter((p) => p.data.series === seriesId)
		.sort(bySeriesOrder);
}

export type PostForList = {
	slug: string;
	data: CollectionEntry<"posts">["data"];
};
export async function getSortedPostsList(): Promise<PostForList[]> {
	const sortedFullPosts = await getRawSortedPosts();

	// delete post.body
	const sortedPostsList = sortedFullPosts.map((post) => ({
		slug: post.slug,
		data: post.data,
	}));

	return sortedPostsList;
}
export type Tag = {
	name: string;
	count: number;
};

export async function getTagList(): Promise<Tag[]> {
	const allBlogPosts = await getCollection<"posts">("posts", ({ data }) => {
		return import.meta.env.PROD ? data.draft !== true : true;
	});

	const countMap: { [key: string]: number } = {};
	allBlogPosts.forEach((post: { data: { tags: string[] } }) => {
		post.data.tags.forEach((tag: string) => {
			if (!countMap[tag]) countMap[tag] = 0;
			countMap[tag]++;
		});
	});

	// sort tags
	const keys: string[] = Object.keys(countMap).sort((a, b) => {
		return a.toLowerCase().localeCompare(b.toLowerCase());
	});

	return keys.map((key) => ({ name: key, count: countMap[key] }));
}

export type Category = {
	name: string;
	count: number;
	url: string;
};

export async function getCategoryList(): Promise<Category[]> {
	const allBlogPosts = await getCollection<"posts">("posts", ({ data }) => {
		return import.meta.env.PROD ? data.draft !== true : true;
	});
	const count: { [key: string]: number } = {};
	allBlogPosts.forEach((post: { data: { category: string | null } }) => {
		if (!post.data.category) {
			const ucKey = i18n(I18nKey.uncategorized);
			count[ucKey] = count[ucKey] ? count[ucKey] + 1 : 1;
			return;
		}

		const categoryName =
			typeof post.data.category === "string"
				? post.data.category.trim()
				: String(post.data.category).trim();

		count[categoryName] = count[categoryName] ? count[categoryName] + 1 : 1;
	});

	const lst = Object.keys(count).sort((a, b) => {
		return a.toLowerCase().localeCompare(b.toLowerCase());
	});

	const ret: Category[] = [];
	for (const c of lst) {
		ret.push({
			name: c,
			count: count[c],
			url: getCategoryUrl(c),
		});
	}
	return ret;
}
