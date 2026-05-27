import { appendFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { StringEnum } from "@earendil-works/pi-ai";
import { Text } from "@earendil-works/pi-tui";
import { Type } from "typebox";
import { memoryPageIssues, summarizeLintIssues } from "./lib/wiki-memory-core.js";
import {
	DEFAULT_CONFIG,
	MAX_STEPS,
	MAX_TITLE,
	cleanText,
	memoryArtifactPathForKind,
	pathAllowed,
	shouldAutoApply,
	skillMarkdown,
	slug,
	wikiBlock,
	wikiPageForKind,
} from "./lib/tight-learning-core.js";

type LearningMode = "suggest" | "approve" | "auto-memory" | "auto-safe" | "auto";
type LearningKind = "wiki_memory" | "preference" | "workflow" | "skill_candidate" | "test_fixture" | "note";
type LearningStatus = "pending" | "accepted" | "rejected";

interface LearningConfig {
	mode: LearningMode;
	allowKinds: LearningKind[];
	allowPaths: string[];
	denyPaths: string[];
}

interface LearningRecord {
	id: string;
	ts: string;
	kind: LearningKind;
	title: string;
	lesson: string;
	evidence: string;
	proposedChange: string;
	status: LearningStatus;
	applied?: boolean;
	artifactPath?: string;
	skillName?: string;
	trigger?: string;
	steps?: string[];
}

const AGENT_DIR = process.env.PI_CODING_AGENT_DIR || join(homedir(), ".pi", "agent");
const EXTENSION_CONFIG_PATH = join(AGENT_DIR, "extensions", "tight-learning.json");
const LEARNING_DIR = join(AGENT_DIR, "learning");
const INBOX_PATH = join(LEARNING_DIR, "inbox.jsonl");
const ACCEPTED_PATH = join(LEARNING_DIR, "accepted.jsonl");
const REJECTED_PATH = join(LEARNING_DIR, "rejected.jsonl");
const MEMORY_WIKI_DIR = join(AGENT_DIR, "memory", "wiki");
const SKILLS_DIR = join(AGENT_DIR, "skills");

const KindSchema = StringEnum(["wiki_memory", "preference", "workflow", "skill_candidate", "test_fixture", "note"]);

function newId(): string {
	return `learn_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

async function ensureLearningDir(): Promise<void> {
	await mkdir(LEARNING_DIR, { recursive: true });
}

async function loadConfig(): Promise<LearningConfig> {
	try {
		const raw = await readFile(EXTENSION_CONFIG_PATH, "utf8");
		const parsed = JSON.parse(raw) as Partial<LearningConfig>;
		return {
			mode: parsed.mode ?? DEFAULT_CONFIG.mode,
			allowKinds: parsed.allowKinds ?? DEFAULT_CONFIG.allowKinds,
			allowPaths: parsed.allowPaths ?? DEFAULT_CONFIG.allowPaths,
			denyPaths: parsed.denyPaths ?? DEFAULT_CONFIG.denyPaths,
		};
	} catch {
		return { ...DEFAULT_CONFIG };
	}
}

async function saveConfig(config: LearningConfig): Promise<void> {
	await mkdir(join(AGENT_DIR, "extensions"), { recursive: true });
	await writeFile(EXTENSION_CONFIG_PATH, JSON.stringify(config, null, 2) + "\n", "utf8");
}

async function appendJsonl(path: string, record: unknown): Promise<void> {
	await ensureLearningDir();
	await appendFile(path, JSON.stringify(record) + "\n", "utf8");
}

async function readJsonl(path: string): Promise<LearningRecord[]> {
	if (!existsSync(path)) return [];
	const raw = await readFile(path, "utf8");
	return raw.split("\n").filter(Boolean).map((line) => JSON.parse(line) as LearningRecord);
}

async function writeJsonl(path: string, records: LearningRecord[]): Promise<void> {
	await ensureLearningDir();
	await writeFile(path, records.map((r) => JSON.stringify(r)).join("\n") + (records.length ? "\n" : ""), "utf8");
}

async function updateInbox(id: string, update: Partial<LearningRecord>): Promise<LearningRecord | null> {
	const records = await readJsonl(INBOX_PATH);
	const index = records.findIndex((r) => r.id === id);
	if (index === -1) return null;
	records[index] = { ...records[index], ...update };
	await writeJsonl(INBOX_PATH, records);
	return records[index];
}

async function applyWiki(record: LearningRecord, config: LearningConfig): Promise<string> {
	await mkdir(MEMORY_WIKI_DIR, { recursive: true });
	const rel = wikiPageForKind(record.kind);
	const artifactPath = memoryArtifactPathForKind(record.kind);
	if (!pathAllowed(config, artifactPath)) throw new Error(`Learning path not allowed: ${artifactPath}`);
	const path = join(MEMORY_WIKI_DIR, rel);
	if (!existsSync(path)) await writeFile(path, `# ${rel.replace(/\.md$/, "")}\n\n`, "utf8");
	await appendFile(path, wikiBlock(record), "utf8");
	await appendFile(join(MEMORY_WIKI_DIR, "log.jsonl"), JSON.stringify({
		ts: new Date().toISOString(),
		scope: "global",
		kind: record.kind,
		path: rel,
		text: record.proposedChange,
		source: "tight-learning",
		learningId: record.id,
	}) + "\n", "utf8");
	return artifactPath;
}

async function lintAppliedWikiPage(relPath: string): Promise<Array<{ level: "high" | "medium" | "low"; text: string }>> {
	const path = join(MEMORY_WIKI_DIR, relPath);
	if (!existsSync(path)) return [];
	const content = await readFile(path, "utf8");
	return memoryPageIssues({ scope: "global", relPath, content }).filter((issue) => issue.level !== "low");
}

async function applySkill(record: LearningRecord, config: LearningConfig): Promise<string> {
	const name = slug(record.skillName || record.title);
	const artifactPath = `agent/skills/${name}/SKILL.md`;
	if (!pathAllowed(config, artifactPath)) throw new Error(`Learning path not allowed: ${artifactPath}`);
	const dir = join(SKILLS_DIR, name);
	await mkdir(dir, { recursive: true });
	await writeFile(join(dir, "SKILL.md"), skillMarkdown({ ...record, skillName: name }), "utf8");
	return artifactPath;
}

async function applyRecord(record: LearningRecord, config: LearningConfig): Promise<{ path: string; record: LearningRecord; lintIssues?: Array<{ level: "high" | "medium" | "low"; text: string }> }> {
	const path = record.kind === "skill_candidate" ? await applySkill(record, config) : await applyWiki(record, config);
	const lintIssues = record.kind === "skill_candidate" ? [] : await lintAppliedWikiPage(wikiPageForKind(record.kind));
	const applied = { ...record, status: "accepted" as const, applied: true, artifactPath: path };
	await updateInbox(record.id, applied);
	await appendJsonl(ACCEPTED_PATH, applied);
	return { path, record: applied, lintIssues };
}

function formatRecord(record: LearningRecord): string {
	const skill = record.skillName ? `\nSkill: ${record.skillName}` : "";
	return `ID: ${record.id}\nKind: ${record.kind}\nStatus: ${record.status}\nTitle: ${record.title}${skill}\nLesson: ${record.lesson}\nEvidence: ${record.evidence}\nProposed change: ${record.proposedChange}`;
}

export default function tightLearning(pi: ExtensionAPI) {
	let lastPendingReminder = 0;

	async function pendingCount(): Promise<number> {
		return (await readJsonl(INBOX_PATH)).filter((r) => r.status === "pending").length;
	}

	async function updateLearningStatus(ctx: { ui: { setStatus: (key: string, value: string | undefined) => void; theme: { fg: (color: string, text: string) => string } } }) {
		const pending = await pendingCount();
		ctx.ui.setStatus("learning", pending > 0 ? ctx.ui.theme.fg("accent", `learn ${pending}`) : undefined);
		return pending;
	}

	pi.on("turn_start", async (_event, ctx) => {
		await updateLearningStatus(ctx);
	});

	pi.on("agent_end", async (_event, ctx) => {
		const pending = await updateLearningStatus(ctx);
		if (!pending || !ctx.hasUI) return;
		const now = Date.now();
		if (now - lastPendingReminder < 10 * 60 * 1000) return;
		lastPendingReminder = now;
		ctx.ui.notify(`${pending} learning${pending === 1 ? "" : "s"} pending review. Ask TinyPi to review pending learnings.`, "info");
	});

	pi.on("before_agent_start", async () => {
		const config = await loadConfig();
		return {
			message: {
				customType: "tight-learning-context",
				display: false,
				content: `Learning mode: ${config.mode}. The tool router exposes learning tools only for learning/review requests. Capture durable lessons with learn_capture. Use learn_review to inspect pending learnings or change mode when the user asks. Approval is default unless mode explicitly permits auto-apply.`,
			},
		};
	});

	pi.registerTool({
		name: "learn_capture",
		label: "Capture Learning",
		description: "Capture a durable lesson or skill candidate from experience. Approval is default; auto-apply only happens when configured.",
		promptSnippet: "Capture durable lessons or skill candidates after useful experience.",
		promptGuidelines: [
			"Use learn_capture for durable lessons from successful tasks, repeated corrections, or reusable workflows.",
			"Do not capture temporary task details.",
			"Use skill_candidate only for repeated procedural workflows, not facts.",
		],
		parameters: Type.Object({
			kind: KindSchema,
			title: Type.String({ description: "Short title for the learning." }),
			lesson: Type.String({ description: "What should be learned." }),
			evidence: Type.String({ description: "Why this learning is justified." }),
			proposedChange: Type.String({ description: "What should be persisted or changed." }),
			skillName: Type.Optional(Type.String({ description: "For skill_candidate, proposed skill name." })),
			trigger: Type.Optional(Type.String({ description: "For skill_candidate, when the skill should trigger." })),
			steps: Type.Optional(Type.Array(Type.String(), { maxItems: MAX_STEPS, description: "For skill_candidate, concise workflow steps." })),
		}),
		async execute(_id, params, _signal, _onUpdate, ctx) {
			const config = await loadConfig();
			const kind = params.kind as LearningKind;
			if (!config.allowKinds.includes(kind)) {
				return { content: [{ type: "text", text: `Error: learning kind not allowed: ${kind}` }], details: { error: "kind not allowed" } };
			}
			const record: LearningRecord = {
				id: newId(),
				ts: new Date().toISOString(),
				kind,
				title: cleanText(params.title, MAX_TITLE) || "Untitled learning",
				lesson: cleanText(params.lesson),
				evidence: cleanText(params.evidence),
				proposedChange: cleanText(params.proposedChange),
				status: "pending",
				skillName: cleanText(params.skillName, 80) || undefined,
				trigger: cleanText(params.trigger, 500) || undefined,
				steps: Array.isArray(params.steps) ? params.steps.map((s) => cleanText(s, 240)).filter(Boolean).slice(0, MAX_STEPS) : undefined,
			};
			await appendJsonl(INBOX_PATH, record);
			if (shouldAutoApply(config, kind)) {
				const applied = await applyRecord(record, config);
				if (ctx.hasUI) {
					const pending = await updateLearningStatus(ctx);
					ctx.ui.notify(`Learning auto-applied to ${applied.path}. Pending review: ${pending}`, "info");
					if (applied.lintIssues?.length) ctx.ui.notify(`Memory wiki lint found ${applied.lintIssues.length} issue${applied.lintIssues.length === 1 ? "" : "s"} after learning apply:\n${summarizeLintIssues(applied.lintIssues)}`, "warning");
				}
				return { content: [{ type: "text", text: `Learning captured and auto-applied to ${applied.path}\n\n${formatRecord(applied.record)}` }], details: applied.record };
			}
			if (ctx.hasUI) {
				const pending = await updateLearningStatus(ctx);
				ctx.ui.notify(`Captured learning pending review. Ask TinyPi to review pending learnings. Pending: ${pending}`, "info");
			}
			return { content: [{ type: "text", text: `Learning captured for review.\n\n${formatRecord(record)}` }], details: record };
		},
		renderCall(args, theme) {
			const title = cleanText((args as { title?: unknown }).title, 80);
			return new Text(theme.fg("toolTitle", theme.bold("learn_capture ")) + theme.fg("accent", title || "(untitled)"), 0, 0);
		},
	});

	pi.registerTool({
		name: "learn_review",
		label: "Review Learnings",
		description: "Review pending learning records, report learning status, or set learning mode when the user asks.",
		promptSnippet: "Review pending learnings or update learning mode when requested.",
		parameters: Type.Object({
			limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 20, description: "Max records. Defaults to 8." })),
			mode: Type.Optional(StringEnum(["suggest", "approve", "auto-memory", "auto-safe", "auto"], { description: "Set learning mode only when the user explicitly asks." })),
		}),
		async execute(_id, params, _signal, _onUpdate, ctx) {
			const config = await loadConfig();
			if (typeof params.mode === "string") {
				config.mode = params.mode as LearningMode;
				await saveConfig(config);
				if (ctx.hasUI) await updateLearningStatus(ctx);
			}
			const limit = typeof params.limit === "number" ? Math.max(1, Math.min(20, params.limit)) : 8;
			const pending = (await readJsonl(INBOX_PATH)).filter((r) => r.status === "pending").slice(-limit);
			const header = `Learning mode: ${config.mode}\nPending learnings: ${pending.length}`;
			const body = pending.length ? "\n\n" + pending.map(formatRecord).join("\n\n---\n\n") : "\n\nNo pending learnings.";
			return { content: [{ type: "text", text: header + body }], details: { count: pending.length, mode: config.mode } };
		},
	});

	pi.registerTool({
		name: "learn_apply",
		label: "Apply Learning",
		description: "Apply one pending learning. In approve mode, asks the user before writing.",
		promptSnippet: "Apply a pending learning only when appropriate.",
		parameters: Type.Object({
			id: Type.String({ description: "Learning ID from learn_capture or learn_review." }),
		}),
		async execute(_id, params, _signal, _onUpdate, ctx) {
			const records = await readJsonl(INBOX_PATH);
			const record = records.find((r) => r.id === params.id && r.status === "pending");
			if (!record) return { content: [{ type: "text", text: `Error: pending learning not found: ${params.id}` }], details: { error: "not found" } };
			const config = await loadConfig();
			if (!shouldAutoApply(config, record.kind)) {
				if (!ctx.hasUI) {
					return { content: [{ type: "text", text: `Approval required before applying:\n\n${formatRecord(record)}` }], details: { needsApproval: true, id: record.id } };
				}
				const ok = await ctx.ui.confirm("Apply learning?", formatRecord(record));
				if (!ok) return { content: [{ type: "text", text: "Learning not applied." }], details: { applied: false, id: record.id } };
			}
			const applied = await applyRecord(record, config);
			if (ctx.hasUI) {
				await updateLearningStatus(ctx);
				if (applied.lintIssues?.length) ctx.ui.notify(`Memory wiki lint found ${applied.lintIssues.length} issue${applied.lintIssues.length === 1 ? "" : "s"} after learning apply:\n${summarizeLintIssues(applied.lintIssues)}`, "warning");
			}
			return { content: [{ type: "text", text: `Learning applied to ${applied.path}\n\n${formatRecord(applied.record)}` }], details: applied.record };
		},
	});

	pi.registerTool({
		name: "learn_reject",
		label: "Reject Learning",
		description: "Reject one pending learning and keep an audit record.",
		promptSnippet: "Reject a captured learning when it is wrong, stale, or not durable.",
		parameters: Type.Object({
			id: Type.String({ description: "Learning ID from learn_capture or learn_review." }),
			reason: Type.Optional(Type.String({ description: "Short rejection reason." })),
		}),
		async execute(_id, params, _signal, _onUpdate, ctx) {
			const rejected = await updateInbox(params.id, { status: "rejected" });
			if (!rejected) return { content: [{ type: "text", text: `Error: learning not found: ${params.id}` }], details: { error: "not found" } };
			const record = { ...rejected, proposedChange: `${rejected.proposedChange}\n\nRejection reason: ${cleanText(params.reason, 500) || "not specified"}` };
			await appendJsonl(REJECTED_PATH, record);
			if (ctx.hasUI) await updateLearningStatus(ctx);
			return { content: [{ type: "text", text: `Learning rejected.\n\n${formatRecord(record)}` }], details: record };
		},
	});
}
