import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { StringEnum } from "@earendil-works/pi-ai";
import { Type } from "typebox";
import { Text } from "@earendil-works/pi-tui";

import { search, type SearchProvider } from "/Users/dan/.pi/agent/npm/node_modules/pi-web-access/gemini-search.ts";
import { fetchAllContent, type ExtractedContent } from "/Users/dan/.pi/agent/npm/node_modules/pi-web-access/extract.ts";
import { compactMarkdown, DEFAULT_COMPACT_MAX_CHARS } from "/Users/dan/.pi/agent/npm/node_modules/pi-web-access/compact-markdown.ts";
import {
	generateId,
	getResult,
	restoreFromSession,
	storeResult,
	type QueryResultData,
	type StoredSearchData,
} from "/Users/dan/.pi/agent/npm/node_modules/pi-web-access/storage.ts";

const MAX_QUERIES = 3;
const DEFAULT_RESULTS = 5;
const MAX_RESULTS = 8;
const MAX_INLINE_CHARS = 12000;
const MAX_STORED_RETURN_CHARS = 30000;

type Format = "compact" | "full";

function clampInt(value: unknown, fallback: number, min: number, max: number): number {
	if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
	return Math.max(min, Math.min(max, Math.floor(value)));
}

function normalizeQueries(params: { query?: unknown; queries?: unknown }): string[] {
	const raw = Array.isArray(params.queries) ? params.queries : params.query ? [params.query] : [];
	const out: string[] = [];
	for (const item of raw) {
		if (typeof item !== "string") continue;
		const q = item.trim();
		if (q && !out.includes(q)) out.push(q);
		if (out.length >= MAX_QUERIES) break;
	}
	return out;
}

function normalizeUrls(params: { url?: unknown; urls?: unknown }): string[] {
	const raw = Array.isArray(params.urls) ? params.urls : params.url ? [params.url] : [];
	const out: string[] = [];
	for (const item of raw) {
		if (typeof item !== "string") continue;
		const url = item.trim();
		if (url && !out.includes(url)) out.push(url);
	}
	return out;
}

function normalizeFormat(value: unknown): Format {
	return value === "full" ? "full" : "compact";
}

function stripMedia(results: ExtractedContent[]): ExtractedContent[] {
	return results.map(({ thumbnail, frames, ...rest }) => rest);
}

function formatSearchResult(query: string, data: QueryResultData): string {
	if (data.error) return `## ${query}\nError: ${data.error}`;
	let out = data.answer ? `${data.answer}\n\nSources:\n` : `Sources for ${query}:\n`;
	out += data.results.map((r, i) => `${i + 1}. ${r.title}\n   ${r.url}`).join("\n");
	return out;
}

function compactForInline(content: string, format: Format, maxChars: number): string {
	if (format === "compact") return compactMarkdown(content, { maxChars });
	if (content.length <= maxChars) return content;
	return content.slice(0, maxChars).replace(/\s+$/g, "") + "\n\n[truncated: use get_search_content for full content]";
}

function formatFetched(result: ExtractedContent, responseId: string, format: Format, maxChars: number): string {
	const body = compactForInline(result.content, format, maxChars);
	const header = result.title ? `# ${result.title}\n\n` : "";
	const note = body.length < result.content.length || format === "compact"
		? `\n\n---\nStored full content. To retrieve it: get_search_content({ responseId: "${responseId}", urlIndex: 0 })`
		: "";
	return header + body + note;
}

export default function tightWeb(pi: ExtensionAPI) {
	pi.on("session_start", (_event, ctx) => {
		restoreFromSession(ctx);
	});

	pi.registerTool({
		name: "web_search",
		label: "Web Search",
		description: "Search the web. Use 1-3 specific queries. Prefer official sources. Do not fetch page contents unless needed.",
		promptSnippet: "Search web with 1-3 specific queries; prefer official sources.",
		promptGuidelines: [
			"Use web_search for current facts or unknown web info.",
			"For web_search, send either query or queries. Keep queries specific. Omit optional parameters unless needed.",
			"After web_search, call fetch_content only for the 1-2 best URLs if page details are needed.",
		],
		parameters: Type.Object({
			query: Type.Optional(Type.String({ description: "One specific search query." })),
			queries: Type.Optional(Type.Array(Type.String(), { description: "Up to 3 specific queries. Use only when one query is not enough." })),
			numResults: Type.Optional(Type.Integer({ minimum: 1, maximum: MAX_RESULTS, description: "Results per query. Usually omit." })),
			provider: Type.Optional(StringEnum(["auto", "exa", "perplexity", "gemini"], { description: "Usually omit; auto is best." })),
		}),
		async execute(_id, params, signal) {
			const queries = normalizeQueries(params);
			if (!queries.length) return { content: [{ type: "text", text: "Error: provide query or queries." }], details: { error: "missing query" } };
			const numResults = clampInt(params.numResults, DEFAULT_RESULTS, 1, MAX_RESULTS);
			const provider = typeof params.provider === "string" ? params.provider as SearchProvider : "auto";
			const responseId = generateId();
			const stored: QueryResultData[] = [];
			let output = "";

			for (const q of queries) {
				if (signal?.aborted) break;
				try {
					const res = await search(q, { numResults, provider });
					const data: QueryResultData = { query: q, answer: res.answer ?? "", results: res.results, error: null, provider: res.provider };
					stored.push(data);
					output += (queries.length > 1 ? `## Query: ${q}\n\n` : "") + formatSearchResult(q, data) + "\n\n";
				} catch (err) {
					const error = err instanceof Error ? err.message : String(err);
					const data: QueryResultData = { query: q, answer: "", results: [], error };
					stored.push(data);
					output += `## Query: ${q}\n\nError: ${error}\n\n`;
				}
			}

			const data: StoredSearchData = { id: responseId, type: "search", timestamp: Date.now(), queries: stored };
			storeResult(responseId, data);
			pi.appendEntry("web-search-results", data);
			output = output.trim() + `\n\n---\nresponseId: ${responseId}`;
			return { content: [{ type: "text", text: output }], details: { responseId, queryCount: queries.length, numResults } };
		},
		renderCall(args, theme) {
			const queries = normalizeQueries(args as Record<string, unknown>);
			return new Text(theme.fg("toolTitle", theme.bold("web_search ")) + theme.fg("accent", queries.join(" | ") || "(no query)"), 0, 0);
		},
	});

	pi.registerTool({
		name: "fetch_content",
		label: "Fetch Page",
		description: "Fetch URL(s) and return compact Markdown. Use default compact mode. Only use format='full' when exact/full text is required.",
		promptSnippet: "Fetch a URL as compact Markdown. Use defaults. Use full only for exact/full text.",
		promptGuidelines: [
			"Use fetch_content only after you have a URL.",
			"For fetch_content, normally provide only url. Do not set format or maxChars unless the user needs exact/full text.",
		],
		parameters: Type.Object({
			url: Type.Optional(Type.String({ description: "One URL to fetch." })),
			urls: Type.Optional(Type.Array(Type.String(), { description: "Multiple URLs. Usually avoid; fetch 1-2 best URLs." })),
			format: Type.Optional(StringEnum(["compact", "full"], { description: "Usually omit. compact is default. full only for exact/full text." })),
			maxChars: Type.Optional(Type.Integer({ minimum: 1000, maximum: MAX_STORED_RETURN_CHARS, description: "Usually omit. Inline char budget." })),
		}),
		async execute(_id, params, signal) {
			const urls = normalizeUrls(params);
			if (!urls.length) return { content: [{ type: "text", text: "Error: provide url or urls." }], details: { error: "missing url" } };
			const format = normalizeFormat(params.format);
			const maxChars = clampInt(params.maxChars, DEFAULT_COMPACT_MAX_CHARS, 1000, MAX_STORED_RETURN_CHARS);
			const results = await fetchAllContent(urls, signal);
			const responseId = generateId();
			const data: StoredSearchData = { id: responseId, type: "fetch", timestamp: Date.now(), urls: stripMedia(results) };
			storeResult(responseId, data);
			pi.appendEntry("web-search-results", data);

			if (urls.length === 1) {
				const result = results[0];
				if (result.error) return { content: [{ type: "text", text: `Error: ${result.error}` }], details: { error: result.error, responseId } };
				return {
					content: [{ type: "text", text: formatFetched(result, responseId, format, maxChars) }],
					details: { responseId, urlCount: 1, title: result.title, totalChars: result.content.length, format, maxChars },
				};
			}

			let out = "Fetched URLs:\n";
			for (let i = 0; i < results.length; i++) {
				const r = results[i];
				out += r.error ? `- ${i}: ${r.url} ERROR ${r.error}\n` : `- ${i}: ${r.title || r.url} (${r.content.length} chars)\n`;
			}
			out += `\nFull content stored. Use get_search_content({ responseId: "${responseId}", urlIndex: 0 })`;
			return { content: [{ type: "text", text: out }], details: { responseId, urlCount: urls.length } };
		},
		renderCall(args, theme) {
			const urls = normalizeUrls(args as Record<string, unknown>);
			const label = urls.length === 1 ? urls[0] : `${urls.length} URLs`;
			return new Text(theme.fg("toolTitle", theme.bold("fetch_content ")) + theme.fg("accent", label || "(no url)"), 0, 0);
		},
	});

	pi.registerTool({
		name: "get_search_content",
		label: "Get Stored Web Content",
		description: "Retrieve stored full content by responseId from web_search or fetch_content. Use only when compact/search output was not enough.",
		promptSnippet: "Retrieve stored full web content by responseId only when needed.",
		parameters: Type.Object({
			responseId: Type.String({ description: "responseId from web_search or fetch_content." }),
			queryIndex: Type.Optional(Type.Integer({ minimum: 0, description: "For web_search results. Usually 0." })),
			urlIndex: Type.Optional(Type.Integer({ minimum: 0, description: "For fetch_content results. Usually 0." })),
			maxChars: Type.Optional(Type.Integer({ minimum: 1000, maximum: MAX_STORED_RETURN_CHARS, description: "Usually omit." })),
		}),
		async execute(_id, params) {
			const data = getResult(params.responseId);
			if (!data) return { content: [{ type: "text", text: `Error: no stored content for ${params.responseId}` }], details: { error: "not found" } };
			const maxChars = clampInt(params.maxChars, MAX_STORED_RETURN_CHARS, 1000, MAX_STORED_RETURN_CHARS);
			if (data.type === "fetch") {
				const idx = clampInt(params.urlIndex, 0, 0, Math.max(0, (data.urls?.length ?? 1) - 1));
				const item = data.urls?.[idx];
				if (!item) return { content: [{ type: "text", text: "Error: urlIndex not found." }], details: { error: "bad urlIndex" } };
				const text = item.content.length > maxChars ? item.content.slice(0, maxChars) + "\n\n[truncated]" : item.content;
				return { content: [{ type: "text", text }], details: { responseId: params.responseId, urlIndex: idx, totalChars: item.content.length } };
			}
			const idx = clampInt(params.queryIndex, 0, 0, Math.max(0, (data.queries?.length ?? 1) - 1));
			const item = data.queries?.[idx];
			if (!item) return { content: [{ type: "text", text: "Error: queryIndex not found." }], details: { error: "bad queryIndex" } };
			return { content: [{ type: "text", text: formatSearchResult(item.query, item) }], details: { responseId: params.responseId, queryIndex: idx } };
		},
	});
}
