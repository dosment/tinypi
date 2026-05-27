import { readdir, readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, relative } from "node:path";

export const PUBLIC_WIKI_REQUIRED_FRONTMATTER = ["title", "type", "status", "audience", "tags", "updated"];
export const PUBLIC_WIKI_TYPES = ["index", "tool-reference", "concept", "workflow", "decision", "source-note"];

function normalizePath(path) {
	return path.replace(/\\/g, "/");
}

export async function walkPublicWikiFiles(wikiDir) {
	if (!existsSync(wikiDir)) return [];
	const out = [];
	async function walk(dir) {
		const entries = await readdir(dir, { withFileTypes: true });
		for (const entry of entries) {
			const path = join(dir, entry.name);
			if (entry.isDirectory()) {
				if (!entry.name.startsWith(".")) await walk(path);
			} else if (entry.isFile() && entry.name.endsWith(".md") && !entry.name.startsWith(".")) {
				out.push(path);
			}
		}
	}
	await walk(wikiDir);
	return out.sort();
}

export function parseFrontmatter(markdown) {
	const lines = String(markdown ?? "").split(/\r?\n/);
	if (lines[0] !== "---") return { data: {}, body: markdown, errors: ["missing opening frontmatter fence"] };
	const end = lines.findIndex((line, index) => index > 0 && line === "---");
	if (end === -1) return { data: {}, body: markdown, errors: ["missing closing frontmatter fence"] };

	const data = {};
	let currentListKey = null;
	for (const rawLine of lines.slice(1, end)) {
		const line = rawLine.replace(/\s+$/g, "");
		if (!line.trim()) continue;
		const listItem = line.match(/^\s*-\s+(.+)$/);
		if (listItem && currentListKey) {
			data[currentListKey].push(listItem[1].trim());
			continue;
		}
		const pair = line.match(/^([A-Za-z][A-Za-z0-9_-]*):(?:\s*(.*))?$/);
		if (!pair) {
			currentListKey = null;
			continue;
		}
		const key = pair[1];
		const value = pair[2] ?? "";
		if (value === "") {
			data[key] = [];
			currentListKey = key;
		} else {
			data[key] = value.trim();
			currentListKey = null;
		}
	}

	return { data, body: lines.slice(end + 1).join("\n"), errors: [] };
}

export function validatePublicWikiPage(relPath, markdown) {
	const issues = [];
	const { data, body, errors } = parseFrontmatter(markdown);
	for (const error of errors) issues.push({ level: "high", text: `${relPath} ${error}` });
	for (const field of PUBLIC_WIKI_REQUIRED_FRONTMATTER) {
		if (data[field] === undefined || data[field] === "" || (Array.isArray(data[field]) && data[field].length === 0)) {
			issues.push({ level: "high", text: `${relPath} missing frontmatter field: ${field}` });
		}
	}
	if (data.type !== undefined && !PUBLIC_WIKI_TYPES.includes(data.type)) {
		issues.push({ level: "medium", text: `${relPath} invalid type: ${data.type}` });
	}
	if (data.status !== undefined && data.status !== "public") {
		issues.push({ level: "medium", text: `${relPath} status should be public` });
	}
	if (data.tags !== undefined && !Array.isArray(data.tags)) {
		issues.push({ level: "medium", text: `${relPath} tags must be a YAML list` });
	}
	if (data.related !== undefined && !Array.isArray(data.related)) {
		issues.push({ level: "medium", text: `${relPath} related must be a YAML list` });
	}
	if (data.updated !== undefined && !/^\d{4}-\d{2}-\d{2}$/.test(String(data.updated))) {
		issues.push({ level: "medium", text: `${relPath} updated must be YYYY-MM-DD` });
	}
	if (!/^#\s+.+/m.test(body.trimStart())) {
		issues.push({ level: "high", text: `${relPath} missing top-level # title after frontmatter` });
	}
	return { data, issues };
}

export async function lintPublicWiki(agentDir) {
	const wikiDir = join(agentDir, "wiki");
	const files = await walkPublicWikiFiles(wikiDir);
	const issues = [];
	const relPaths = [];
	let indexContent = "";

	for (const file of files) {
		const relPath = normalizePath(relative(wikiDir, file));
		const content = await readFile(file, "utf8");
		relPaths.push(relPath);
		if (relPath === "index.md") indexContent = content;
		issues.push(...validatePublicWikiPage(relPath, content).issues);
	}

	if (!relPaths.includes("index.md")) {
		issues.push({ level: "high", text: "missing public wiki index.md" });
	} else {
		for (const relPath of relPaths) {
			if (relPath === "index.md") continue;
			if (!indexContent.includes(relPath)) {
				issues.push({ level: "medium", text: `index.md does not list ${relPath}` });
			}
		}
	}

	return { issues, files: relPaths };
}

export function formatPublicWikiLint({ issues, files }) {
	if (!issues.length) return `# Public wiki lint\n\nNo issues found. Checked ${files.length} pages.`;
	let out = "# Public wiki lint\n\n";
	for (const level of ["high", "medium", "low"]) {
		const items = issues.filter((issue) => issue.level === level);
		if (!items.length) continue;
		out += `## ${level}\n` + items.map((issue) => `- ${issue.text}`).join("\n") + "\n\n";
	}
	return out.trim();
}
