import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";

const defaultFs = { mkdir, readFile, rename, writeFile };

export async function confirmWikiMemorySave(ctx, { kind, scope, text, clampText = (value) => value }) {
	const confirm = ctx?.ui?.confirm;
	if (typeof confirm !== "function") {
		return { approved: false, error: "approval-required", message: "Memory not saved: approval required but confirmation UI is unavailable." };
	}
	const preview = `Save this ${kind} memory to ${scope} wiki?\n\n${clampText(text, 1000)}`;
	return { approved: Boolean(await confirm("Save wiki memory?", preview)) };
}

export async function appendMemoryAtomically({ fs = defaultFs, root, relPath, header, block, logLine }) {
	await fs.mkdir(root, { recursive: true });
	const pagePath = join(root, relPath);
	const logPath = join(root, "log.jsonl");
	let pageContent = header;
	try {
		pageContent = await fs.readFile(pagePath, "utf8");
	} catch (error) {
		if (error?.code !== "ENOENT") throw error;
	}
	let logContent = "";
	try {
		logContent = await fs.readFile(logPath, "utf8");
	} catch (error) {
		if (error?.code !== "ENOENT") throw error;
	}
	const pageTmp = `${pagePath}.tmp`;
	const logTmp = `${logPath}.tmp`;
	await fs.writeFile(pageTmp, pageContent + block, "utf8");
	await fs.writeFile(logTmp, logContent + logLine, "utf8");
	await fs.rename(pageTmp, pagePath);
	await fs.rename(logTmp, logPath);
}

export async function executeWikiRemember(params, ctx, { normalizeKind, clampText, appendMemory, notifyMemoryLintIssues }) {
	const text = typeof params.text === "string" ? params.text.trim() : "";
	if (!text) return { content: [{ type: "text", text: "Error: text is required." }], details: { error: "missing text" } };
	const kind = normalizeKind(params.kind);
	const scope = params.scope === "global" ? "global" : "project";
	const source = typeof params.source === "string" && params.source.trim() ? params.source.trim() : "user-approved";
	const approval = await confirmWikiMemorySave(ctx, { kind, scope, text, clampText });
	if (!approval.approved) {
		return {
			content: [{ type: "text", text: approval.message ?? "Memory not saved." }],
			details: { saved: false, ...(approval.error ? { error: approval.error } : {}) },
		};
	}
	const result = await appendMemory(scope, kind, text, source);
	await notifyMemoryLintIssues(ctx, scope);
	return { content: [{ type: "text", text: `Memory saved to ${scope}:${result.relPath}` }], details: { saved: true, scope, path: result.relPath, kind } };
}
