export const MAX_PAGE_CHARS = 12000;
export const MAX_SECTION_CHARS = 4000;
export const INBOX_WARN_SECTIONS = 10;

export function normalizedLine(line) {
	return line.toLowerCase().replace(/[`*_#[\]()]/g, "").replace(/\s+/g, " ").trim();
}

export function splitSections(content) {
	const headingRegex = /^(#{1,6})\s+(.+)$/gm;
	const matches = [...String(content ?? "").matchAll(headingRegex)];
	if (matches.length === 0) return [{ title: "Document", level: 1, start: 0, end: content.length, content }];
	return matches.map((match, i) => {
		const start = match.index ?? 0;
		const end = i + 1 < matches.length ? matches[i + 1].index ?? content.length : content.length;
		return { title: match[2].trim(), level: match[1].length, start, end, content: content.slice(start, end).trim() };
	});
}

export function memoryPageIssues(page) {
	const issues = [];
	const headings = [...String(page.content ?? "").matchAll(/^(#{1,6})\s+(.+)$/gm)];
	if (!page.content.trim().startsWith("# ")) issues.push({ level: "high", text: `${page.scope}:${page.relPath} missing top-level # title` });
	if (page.content.length > MAX_PAGE_CHARS) issues.push({ level: "medium", text: `${page.scope}:${page.relPath} page is large (${page.content.length} chars)` });
	const seenHeadings = new Set();
	for (const h of headings) {
		const key = normalizedLine(h[2]);
		if (seenHeadings.has(key)) issues.push({ level: "medium", text: `${page.scope}:${page.relPath} duplicate heading: ${h[2]}` });
		seenHeadings.add(key);
	}
	for (const section of splitSections(page.content)) {
		if (section.content.length > MAX_SECTION_CHARS) issues.push({ level: "medium", text: `${page.scope}:${page.relPath} section too large: ${section.title} (${section.content.length} chars)` });
		if (/^##\s+\d{4}-\d{2}-\d{2}/m.test(section.content)) {
			if (!/^Type:\s*(preference|decision|fact|workflow|project|note)/mi.test(section.content)) issues.push({ level: "low", text: `${page.scope}:${page.relPath} memory lacks valid Type: ${section.title}` });
			if (!/^Source:\s*\S+/mi.test(section.content)) issues.push({ level: "low", text: `${page.scope}:${page.relPath} memory lacks Source: ${section.title}` });
		}
	}
	if (page.relPath === "inbox.md" && headings.filter((h) => h[1] === "##").length > INBOX_WARN_SECTIONS) {
		issues.push({ level: "medium", text: `${page.scope}:inbox.md has many uncurated entries` });
	}
	return issues;
}

export function findDuplicateLineIssues(pages) {
	const issues = [];
	const lineMap = new Map();
	for (const page of pages) {
		for (const line of page.content.split("\n")) {
			const n = normalizedLine(line);
			if (n.length < 40 || n.startsWith("type:") || n.startsWith("source:")) continue;
			const locs = lineMap.get(n) ?? [];
			locs.push(`${page.scope}:${page.relPath}`);
			lineMap.set(n, locs);
		}
	}
	for (const [line, locs] of lineMap) {
		const unique = [...new Set(locs)];
		if (unique.length > 1) issues.push({ level: "low", text: `duplicate line across pages: "${line.slice(0, 90)}" in ${unique.join(", ")}` });
	}
	return issues;
}

export function formatMemoryLint(issues) {
	if (!issues.length) return "# Wiki lint\n\nNo issues found.";
	let out = "# Wiki lint\n\n";
	for (const level of ["high", "medium", "low"]) {
		const items = issues.filter((i) => i.level === level);
		if (!items.length) continue;
		out += `## ${level}\n` + items.slice(0, 20).map((i) => `- ${i.text}`).join("\n") + "\n\n";
	}
	return out.trim();
}

export function summarizeLintIssues(issues, max = 3) {
	if (!issues.length) return "";
	const head = issues.slice(0, max).map((issue) => `${issue.level}: ${issue.text}`).join("\n");
	const extra = issues.length > max ? `\n... ${issues.length - max} more issue${issues.length - max === 1 ? "" : "s"}` : "";
	return head + extra;
}
