import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { StringEnum } from "@earendil-works/pi-ai";
import { Type } from "typebox";
import { Text } from "@earendil-works/pi-tui";
import { mkdir, readdir, readFile, stat, writeFile, appendFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { basename, join, normalize, relative } from "node:path";
import { findDuplicateLineIssues, formatMemoryLint, memoryPageIssues, normalizedLine, splitSections, summarizeLintIssues } from "./lib/wiki-memory-core.js";
import { formatPublicWikiLint, lintPublicWiki } from "./lib/wiki-public-core.js";

const AGENT_DIR = process.env.PI_CODING_AGENT_DIR || join(homedir(), ".pi", "agent");
const MEMORY_WIKI_DIR = join(AGENT_DIR, "memory", "wiki");
const MAX_SEARCH_RESULTS = 5;
const MAX_SNIPPET_CHARS = 900;
const MAX_READ_CHARS = 8000;
const MAX_REMEMBER_TEXT = 3000;

type Scope = "project" | "global" | "both";
type WikiLintTarget = "memory" | "public" | "all";
type MemoryKind = "preference" | "decision" | "fact" | "workflow" | "project" | "note";

interface WikiPage {
	scope: Exclude<Scope, "both">;
	root: string;
	path: string;
	relPath: string;
	content: string;
}

interface Section {
	title: string;
	level: number;
	start: number;
	end: number;
	content: string;
}

function clampText(text: string, max: number): string {
	if (text.length <= max) return text;
	return text.slice(0, max).replace(/\s+$/g, "") + `\n\n[truncated ${text.length - max} chars]`;
}

function normalizeScope(value: unknown): Scope {
	return value === "project" || value === "global" || value === "both" ? value : "both";
}

function normalizeKind(value: unknown): MemoryKind {
	return value === "preference" || value === "decision" || value === "fact" || value === "workflow" || value === "project" || value === "note"
		? value
		: "note";
}

function normalizeLintTarget(value: unknown): WikiLintTarget {
	return value === "public" || value === "all" ? value : "memory";
}

function rootsForScope(scope: Scope): Array<{ scope: Exclude<Scope, "both">; root: string }> {
	return [{ scope: scope === "project" ? "project" : "global", root: MEMORY_WIKI_DIR }];
}

function safeRelPath(input: string): string | null {
	const cleaned = input.trim().replace(/^\/+/, "");
	if (!cleaned || cleaned.includes("\0")) return null;
	const withExt = cleaned.endsWith(".md") ? cleaned : `${cleaned}.md`;
	const rel = normalize(withExt);
	if (rel.startsWith("..") || rel.includes("/../") || rel === ".") return null;
	return rel;
}

function isMarkdownFile(path: string): boolean {
	return path.endsWith(".md") && !basename(path).startsWith(".");
}

async function ensureWikiRoot(root: string, scope: Exclude<Scope, "both">): Promise<void> {
	await mkdir(root, { recursive: true });
	const defaults: Record<string, string> = {
		"index.md": "# Local Memory Wiki Index\n\n- preferences.md: User preferences and style.\n- decisions.md: Durable decisions.\n- workflows.md: Reusable workflows.\n- facts.md: Stable facts.\n- glossary.md: Terms and definitions.\n- inbox.md: Unsorted approved memories.\n",
		"preferences.md": "# Preferences\n\n",
		"decisions.md": "# Decisions\n\n",
		"workflows.md": "# Workflows\n\n",
		"facts.md": "# Facts\n\n",
		"glossary.md": "# Glossary\n\n",
		"inbox.md": "# Inbox\n\nApproved memories that have not been curated into a stable page yet.\n\n",
	};
	for (const [file, content] of Object.entries(defaults)) {
		const path = join(root, file);
		if (!existsSync(path)) await writeFile(path, content, "utf8");
	}
	const log = join(root, "log.jsonl");
	if (!existsSync(log)) await writeFile(log, "", "utf8");
}

async function ensureWikis(): Promise<void> {
	for (const root of rootsForScope("both")) await ensureWikiRoot(root.root, root.scope);
}

async function walkMarkdown(root: string): Promise<string[]> {
	if (!existsSync(root)) return [];
	const out: string[] = [];
	async function walk(dir: string) {
		const entries = await readdir(dir, { withFileTypes: true });
		for (const entry of entries) {
			const path = join(dir, entry.name);
			if (entry.isDirectory()) {
				if (!entry.name.startsWith(".")) await walk(path);
			} else if (entry.isFile() && isMarkdownFile(path)) {
				out.push(path);
			}
		}
	}
	await walk(root);
	return out;
}

async function loadPages(scope: Scope): Promise<WikiPage[]> {
	const pages: WikiPage[] = [];
	for (const { scope: s, root } of rootsForScope(scope)) {
		await ensureWikiRoot(root, s);
		for (const path of await walkMarkdown(root)) {
			pages.push({ scope: s, root, path, relPath: relative(root, path), content: await readFile(path, "utf8") });
		}
	}
	return pages;
}

function terms(query: string): string[] {
	return query.toLowerCase().split(/[^a-z0-9_-]+/).filter((t) => t.length >= 2);
}

function score(page: WikiPage, section: Section, queryTerms: string[]): number {
	const rel = page.relPath.toLowerCase();
	const title = section.title.toLowerCase();
	const body = section.content.toLowerCase();
	let s = 0;
	for (const term of queryTerms) {
		if (rel.includes(term)) s += 10;
		if (title.includes(term)) s += 8;
		const count = body.split(term).length - 1;
		s += Math.min(5, count);
	}
	if (page.scope === "project") s += 1;
	return s;
}

async function resolvePage(pathInput: string, scope: Scope): Promise<WikiPage | null> {
	const rel = safeRelPath(pathInput);
	if (!rel) return null;
	for (const { scope: s, root } of rootsForScope(scope)) {
		const path = join(root, rel);
		if (existsSync(path) && (await stat(path)).isFile()) {
			return { scope: s, root, path, relPath: rel, content: await readFile(path, "utf8") };
		}
	}
	return null;
}

function findSection(content: string, wanted: string): Section | null {
	const needle = wanted.trim().toLowerCase();
	return splitSections(content).find((s) => s.title.toLowerCase() === needle || s.title.toLowerCase().includes(needle)) ?? null;
}

function targetPageForKind(kind: MemoryKind): string {
	if (kind === "preference") return "preferences.md";
	if (kind === "decision") return "decisions.md";
	if (kind === "workflow") return "workflows.md";
	if (kind === "project") return "project.md";
	if (kind === "fact") return "facts.md";
	return "inbox.md";
}

function today(): string {
	return new Date().toISOString().slice(0, 10);
}

function memoryBlock(text: string, kind: MemoryKind, source: string): string {
	const cleaned = clampText(text.trim(), MAX_REMEMBER_TEXT);
	return `\n## ${today()} — ${kind}\n\nType: ${kind}\nSource: ${source}\n\n${cleaned}\n`;
}

async function appendMemory(scope: Exclude<Scope, "both">, kind: MemoryKind, text: string, source: string): Promise<{ path: string; relPath: string }> {
	const root = MEMORY_WIKI_DIR;
	await ensureWikiRoot(root, scope);
	const relPath = targetPageForKind(kind);
	const path = join(root, relPath);
	if (!existsSync(path)) await writeFile(path, `# ${relPath.replace(/\.md$/, "")}\n\n`, "utf8");
	await appendFile(path, memoryBlock(text, kind, source), "utf8");
	await appendFile(join(root, "log.jsonl"), JSON.stringify({ ts: new Date().toISOString(), scope, kind, path: relPath, text, source }) + "\n", "utf8");
	return { path, relPath };
}

async function lintWikiIssues(scope: Scope): Promise<Array<{ level: "high" | "medium" | "low"; text: string }>> {
	const pages = await loadPages(scope);
	return [...pages.flatMap(memoryPageIssues), ...findDuplicateLineIssues(pages)];
}

async function lintWiki(scope: Scope): Promise<string> {
	return clampText(formatMemoryLint(await lintWikiIssues(scope)), 8000);
}

async function lintAllWikis(scope: Scope, target: WikiLintTarget): Promise<string> {
	const parts: string[] = [];
	if (target === "memory" || target === "all") parts.push(await lintWiki(scope));
	if (target === "public" || target === "all") parts.push(formatPublicWikiLint(await lintPublicWiki(AGENT_DIR)));
	return parts.join("\n\n---\n\n");
}

async function notifyMemoryLintIssues(ctx: { hasUI?: boolean; ui?: { notify: (message: string, level?: "info" | "warning" | "error") => void } } | undefined, scope: Scope) {
	if (!ctx?.hasUI || !ctx.ui) return;
	const issues = (await lintWikiIssues(scope)).filter((issue) => issue.level !== "low");
	if (!issues.length) return;
	ctx.ui.notify(`Memory wiki lint found ${issues.length} issue${issues.length === 1 ? "" : "s"} after write:\n${summarizeLintIssues(issues)}`, "warning");
}

async function reviewWiki(scope: Scope): Promise<string> {
	const pages = await loadPages(scope);
	const warnings: string[] = [];
	const tentative = /\b(currently|temporary|temporarily|for now|maybe|might|todo|deprecated|old)\b/i;
	const negative = /\b(do not|don't|avoid|never|disable|remove)\b/i;
	const positive = /\b(use|prefer|enable|keep|always)\b/i;
	const buckets = new Map<string, string[]>();
	for (const page of pages) {
		for (const section of splitSections(page.content)) {
			const loc = `${page.scope}:${page.relPath} — ${section.title}`;
			if (tentative.test(section.content)) warnings.push(`Possible stale/tentative memory: ${loc}`);
			const key = normalizedLine(section.title).split(" ").slice(0, 4).join(" ");
			if (key.length >= 6) buckets.set(key, [...(buckets.get(key) ?? []), loc]);
		}
	}
	for (const [key, locs] of buckets) {
		if (locs.length > 1) warnings.push(`Possible duplicate/drift around "${key}": ${locs.join("; ")}`);
	}
	for (const [key, locs] of buckets) {
		if (locs.length < 2) continue;
		const related = pages.flatMap((p) => splitSections(p.content).map((s) => ({ p, s }))).filter(({ s }) => normalizedLine(s.title).includes(key));
		if (related.some(({ s }) => negative.test(s.content)) && related.some(({ s }) => positive.test(s.content))) warnings.push(`Possible contradiction around "${key}"`);
	}
	if (!warnings.length) return "# Wiki drift review\n\nNo drift candidates found. No changes made.";
	return clampText("# Wiki drift review\n\nNo changes made. Review these candidates manually or save a corrected memory with wiki_remember.\n\n" + warnings.slice(0, 30).map((w) => `- ${w}`).join("\n"), 8000);
}

export default function wikiMemory(pi: ExtensionAPI) {
	void ensureWikis();

	pi.on("context", (event) => {
		const reminder = "Memory policy: use wiki_search before answering about user preferences, prior decisions, workflows, architecture, project history, or durable facts. Search first, then wiki_read only specific pages/sections. Never write memory silently; use wiki_remember only with user approval.";
		return { messages: [{ role: "user", content: reminder }, ...event.messages] };
	});

	pi.registerTool({
		name: "wiki_search",
		label: "Wiki Search",
		description: "Search long-term memory wiki. Use before answering about preferences, prior decisions, workflows, architecture, project history, or durable facts.",
		promptSnippet: "Search memory wiki for preferences, decisions, workflows, project history, or durable facts.",
		promptGuidelines: [
			"Use wiki_search before answering about user preferences, prior decisions, workflows, architecture, project history, or durable facts.",
			"Do not read the whole wiki. Search first, then use wiki_read only for the relevant page or section.",
		],
		parameters: Type.Object({
			query: Type.String({ description: "Specific memory search query." }),
			scope: Type.Optional(StringEnum(["project", "global", "both"], { description: "Usually omit. Accepted for compatibility; all scopes use the canonical agent wiki." })),
		}),
		async execute(_id, params) {
			const query = typeof params.query === "string" ? params.query.trim() : "";
			if (!query) return { content: [{ type: "text", text: "Error: query is required." }], details: { error: "missing query" } };
			const queryTerms = terms(query);
			const hits: Array<{ page: WikiPage; section: Section; score: number }> = [];
			for (const page of await loadPages(normalizeScope(params.scope))) {
				for (const section of splitSections(page.content)) {
					const s = score(page, section, queryTerms);
					if (s > 0) hits.push({ page, section, score: s });
				}
			}
			hits.sort((a, b) => b.score - a.score);
			if (!hits.length) return { content: [{ type: "text", text: "No wiki memory matches found." }], details: { count: 0 } };
			let out = `# Wiki search: ${query}\n\n`;
			for (const hit of hits.slice(0, MAX_SEARCH_RESULTS)) {
				out += `## [${hit.page.scope}] ${hit.page.relPath} — ${hit.section.title}\n`;
				out += clampText(hit.section.content.replace(/\n{3,}/g, "\n\n"), MAX_SNIPPET_CHARS) + "\n\n";
			}
			return { content: [{ type: "text", text: out.trim() }], details: { count: Math.min(hits.length, MAX_SEARCH_RESULTS), total: hits.length } };
		},
		renderCall(args, theme) {
			const query = typeof (args as { query?: unknown }).query === "string" ? (args as { query: string }).query : "";
			return new Text(theme.fg("toolTitle", theme.bold("wiki_search ")) + theme.fg("accent", query || "(no query)"), 0, 0);
		},
	});

	pi.registerTool({
		name: "wiki_read",
		label: "Wiki Read",
		description: "Read one wiki page or one section. Use after wiki_search. Never read the whole wiki directory.",
		promptSnippet: "Read one memory wiki page/section after wiki_search.",
		parameters: Type.Object({
			path: Type.String({ description: "Wiki page path, e.g. preferences.md or decisions.md." }),
			section: Type.Optional(Type.String({ description: "Optional heading title to read only one section." })),
			scope: Type.Optional(StringEnum(["project", "global", "both"], { description: "Usually omit. If duplicate pages exist, project is checked first." })),
		}),
		async execute(_id, params) {
			const path = typeof params.path === "string" ? params.path : "";
			const page = await resolvePage(path, normalizeScope(params.scope));
			if (!page) return { content: [{ type: "text", text: `Error: wiki page not found: ${path}` }], details: { error: "not found" } };
			let content = page.content;
			if (typeof params.section === "string" && params.section.trim()) {
				const section = findSection(content, params.section);
				if (!section) return { content: [{ type: "text", text: `Error: section not found: ${params.section}` }], details: { error: "section not found" } };
				content = section.content;
			}
			const header = `# [${page.scope}] ${page.relPath}\n\n`;
			return { content: [{ type: "text", text: header + clampText(content, MAX_READ_CHARS) }], details: { scope: page.scope, path: page.relPath, chars: content.length } };
		},
	});

	pi.registerTool({
		name: "wiki_lint",
		label: "Wiki Lint",
		description: "Check local memory wiki or shipped public wiki for mechanical problems. Read-only.",
		promptSnippet: "Check wiki for mechanical memory/frontmatter/index issues. Read-only.",
		parameters: Type.Object({
			scope: Type.Optional(StringEnum(["project", "global", "both"], { description: "Usually omit. Defaults to both." })),
			target: Type.Optional(StringEnum(["memory", "public", "all"], { description: "Usually omit. Use public to validate shipped wiki frontmatter and index coverage." })),
		}),
		async execute(_id, params) {
			const output = await lintAllWikis(normalizeScope(params.scope), normalizeLintTarget(params.target));
			return { content: [{ type: "text", text: output }], details: { readOnly: true } };
		},
	});

	pi.registerTool({
		name: "wiki_review",
		label: "Wiki Review",
		description: "Find possible wiki drift: stale wording, duplicates, and contradiction candidates. Read-only; never changes files.",
		promptSnippet: "Review wiki drift candidates. Read-only; no changes made.",
		parameters: Type.Object({
			scope: Type.Optional(StringEnum(["project", "global", "both"], { description: "Usually omit. Defaults to both." })),
		}),
		async execute(_id, params) {
			const output = await reviewWiki(normalizeScope(params.scope));
			return { content: [{ type: "text", text: output }], details: { readOnly: true } };
		},
	});

	pi.registerTool({
		name: "wiki_remember",
		label: "Wiki Remember",
		description: "Propose saving durable memory. Requires user confirmation. Use only for stable preferences, decisions, facts, workflows, or project notes.",
		promptSnippet: "Save durable memory only with user approval.",
		promptGuidelines: [
			"Never write memory silently. wiki_remember asks the user before saving.",
			"Use wiki_remember only for durable preferences, decisions, facts, workflows, or project notes; do not save temporary task details.",
		],
		parameters: Type.Object({
			text: Type.String({ description: "Short durable memory to save. Keep it factual and concise." }),
			kind: Type.Optional(StringEnum(["preference", "decision", "fact", "workflow", "project", "note"], { description: "Memory type. Choose the closest durable category." })),
			scope: Type.Optional(StringEnum(["project", "global"], { description: "Where to save. Use project for repo-specific memory, global for user preference." })),
			source: Type.Optional(Type.String({ description: "Usually omit. Short source label." })),
		}),
		async execute(_id, params, _signal, _onUpdate, ctx) {
			const text = typeof params.text === "string" ? params.text.trim() : "";
			if (!text) return { content: [{ type: "text", text: "Error: text is required." }], details: { error: "missing text" } };
			const kind = normalizeKind(params.kind);
			const scope = params.scope === "global" ? "global" : "project";
			const source = typeof params.source === "string" && params.source.trim() ? params.source.trim() : "user-approved";
			const preview = `Save this ${kind} memory to ${scope} wiki?\n\n${clampText(text, 1000)}`;
			const ok = await ctx.ui.confirm("Save wiki memory?", preview);
			if (!ok) return { content: [{ type: "text", text: "Memory not saved." }], details: { saved: false } };
			const result = await appendMemory(scope, kind, text, source);
			await notifyMemoryLintIssues(ctx, scope);
			return { content: [{ type: "text", text: `Memory saved to ${scope}:${result.relPath}` }], details: { saved: true, scope, path: result.relPath, kind } };
		},
	});
}
