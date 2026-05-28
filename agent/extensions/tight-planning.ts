import { mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { StringEnum } from "@earendil-works/pi-ai";
import { Text } from "@earendil-works/pi-tui";
import { Type } from "typebox";
import { createRequirementsBrief, isSafePlanningCommand, renderPlanningContract, validatePlanCompletion } from "./lib/tight-planning-core.js";

const PLAN_DIR = join(homedir(), ".pi", "agent", "plans");
const ACTIVE_PLAN_PATH = join(PLAN_DIR, "active.md");
const PLAN_TOOLS = ["requirements_brief", "planning_contract", "plan_create", "plan_read", "plan_update", "plan_complete"];
const WEB_RESEARCH_TOOLS = ["web_search", "fetch_content", "get_search_content"];
const PLANNING_TOOLS = ["read", "grep", "find", "ls", "bash", "ask_user", ...WEB_RESEARCH_TOOLS, ...PLAN_TOOLS];
const MAX_TITLE = 120;
const MAX_STEP = 240;
const MAX_STEPS = 12;
const MAX_NOTE = 1200;
const MAX_PLAN_READ = 12000;

type StepStatus = "pending" | "in_progress" | "done" | "blocked";

interface PlanStep {
	status: StepStatus;
	text: string;
}

interface PlanState {
	title: string;
	summary?: string;
	steps: PlanStep[];
	created: string;
	updated: string;
	completed?: string;
	notes: string[];
}

function today(): string {
	return new Date().toISOString().slice(0, 10);
}

function cleanText(value: unknown, max: number): string {
	return String(value ?? "").replace(/\s+/g, " ").trim().slice(0, max).trim();
}

function statusMark(status: StepStatus): string {
	if (status === "done") return "x";
	if (status === "in_progress") return ">";
	if (status === "blocked") return "!";
	return " ";
}

function parseStatusMark(mark: string): StepStatus {
	if (mark.toLowerCase() === "x") return "done";
	if (mark === ">") return "in_progress";
	if (mark === "!") return "blocked";
	return "pending";
}

function renderPlan(plan: PlanState): string {
	let out = `# ${plan.title}\n\n`;
	out += `Created: ${plan.created}\n`;
	out += `Updated: ${plan.updated}\n`;
	if (plan.completed) out += `Completed: ${plan.completed}\n`;
	if (plan.summary) out += `\n## Summary\n\n${plan.summary}\n`;
	out += "\n## Steps\n\n";
	plan.steps.forEach((step, i) => {
		out += `${i + 1}. [${statusMark(step.status)}] ${step.text}\n`;
	});
	if (plan.notes.length) {
		out += "\n## Notes\n\n";
		for (const note of plan.notes) out += `- ${note}\n`;
	}
	return out.trim() + "\n";
}

function parsePlan(markdown: string): PlanState | null {
	const title = markdown.match(/^#\s+(.+)$/m)?.[1]?.trim();
	if (!title || title === "No Active Plan") return null;
	const created = markdown.match(/^Created:\s*(.+)$/m)?.[1]?.trim() || today();
	const updated = markdown.match(/^Updated:\s*(.+)$/m)?.[1]?.trim() || created;
	const completed = markdown.match(/^Completed:\s*(.+)$/m)?.[1]?.trim();
	const summaryMatch = markdown.match(/^## Summary\s*\n+([\s\S]*?)(?=\n## |\s*$)/m);
	const summary = summaryMatch?.[1]?.trim();
	const steps: PlanStep[] = [];
	for (const match of markdown.matchAll(/^\d+\.\s+\[([ xX>!])\]\s+(.+)$/gm)) {
		steps.push({ status: parseStatusMark(match[1]), text: match[2].trim() });
	}
	const notesMatch = markdown.match(/^## Notes\s*\n+([\s\S]*?)(?=\n## |\s*$)/m);
	const notes = notesMatch?.[1]
		?.split("\n")
		.map((line) => line.replace(/^-\s+/, "").trim())
		.filter(Boolean) ?? [];
	return { title, summary, steps, created, updated, completed, notes };
}

async function ensurePlanDir(): Promise<void> {
	await mkdir(PLAN_DIR, { recursive: true });
}

async function readPlan(): Promise<PlanState | null> {
	if (!existsSync(ACTIVE_PLAN_PATH)) return null;
	return parsePlan(await readFile(ACTIVE_PLAN_PATH, "utf8"));
}

async function writePlan(plan: PlanState): Promise<void> {
	await ensurePlanDir();
	await writeFile(ACTIVE_PLAN_PATH, renderPlan(plan), "utf8");
}

function summarizePlan(plan: PlanState): string {
	const done = plan.steps.filter((s) => s.status === "done").length;
	return `${plan.title} (${done}/${plan.steps.length} done)`;
}

function planningReminder(active: boolean, plan: PlanState | null): string {
	const activePlan = plan
		? `\n\nActive plan: ${summarizePlan(plan)}\nUse plan_read for details and plan_update as steps progress.`
		: "";
	if (active) {
		return `[PLANNING MODE ACTIVE — internal guidance; do not summarize this status]
You are in read-only planning mode. Answer the user's latest request by inspecting context and producing or updating a concrete plan.

Rules:
- Do not edit or write files in planning mode.
- Use read, grep, find, ls, and read-only bash to inspect existing files/docs before planning.
- Use web_search and fetch_content when the user asks for internet/current research; do not ask for source documents if web research was requested.
- Do not run a survey of generic ask_user questions. Ask at most one concrete clarification only when inspection cannot answer it.
- Use plan_create for a new numbered implementation plan with specific assumptions and details.
- Use plan_update if refining an existing active plan.
- Ask the user before leaving planning mode for broad or risky work.${activePlan}`;
	}
	return "Internal planning guidance only; do not mention this status in the reply. For broad, multi-step, risky, or ambiguous work, inspect available context, including web_search/fetch_content when internet research was requested, then create or read a concrete plan before editing. Do not chain generic ask_user questions; ask at most one targeted clarification unless blocked. Skip planning for simple one-shot tasks.";
}

export default function tightPlanning(pi: ExtensionAPI) {
	let planningMode = false;
	let previousTools: string[] | null = null;

	function enterPlanning(ctx?: ExtensionContext) {
		if (!planningMode) previousTools = pi.getActiveTools();
		planningMode = true;
		pi.setActiveTools([...PLANNING_TOOLS]);
		ctx?.ui.setStatus("planning", ctx.ui.theme.fg("warning", "planning"));
		ctx?.ui.notify("Planning mode enabled. Edits are blocked until /planning off or /planning execute.", "info");
	}

	function leavePlanning(ctx?: ExtensionContext) {
		planningMode = false;
		if (previousTools?.length) pi.setActiveTools(previousTools);
		previousTools = null;
		ctx?.ui.setStatus("planning", undefined);
		ctx?.ui.notify("Planning mode disabled.", "info");
	}

	pi.on("before_agent_start", async () => {
		const plan = await readPlan();
		return {
			message: {
				customType: "tight-planning-context",
				content: planningReminder(planningMode, plan),
				display: false,
			},
		};
	});

	pi.on("tool_call", (event) => {
		if (!planningMode) return;
		if (event.toolName === "edit" || event.toolName === "write") {
			return { block: true, reason: "Planning mode is read-only. Use /planning execute or /planning off before editing." };
		}
		if (event.toolName === "bash") {
			const command = typeof event.input.command === "string" ? event.input.command : "";
			if (!isSafePlanningCommand(command)) {
				return { block: true, reason: `Planning mode blocked non-read-only bash command: ${command}` };
			}
		}
	});

	pi.registerCommand("planning", {
		description: "Toggle or manage tight planning mode",
		getArgumentCompletions: (prefix) => {
			const options = ["on", "off", "status", "execute", "clear"];
			return options.filter((o) => o.startsWith(prefix)).map((value) => ({ value, label: value }));
		},
		handler: async (args, ctx) => {
			const action = args.trim() || "toggle";
			if (action === "on") return enterPlanning(ctx);
			if (action === "off") return leavePlanning(ctx);
			if (action === "execute") {
				const plan = await readPlan();
				leavePlanning(ctx);
				pi.sendMessage(
					{
						customType: "tight-planning-execute",
						content: plan ? `Execute the active plan: ${summarizePlan(plan)}` : "Execute the plan discussed above.",
						display: true,
					},
					{ triggerTurn: true },
				);
				return;
			}
			if (action === "clear") {
				await ensurePlanDir();
				await writeFile(ACTIVE_PLAN_PATH, `# No Active Plan\n\nCreated: ${today()}\nUpdated: ${today()}\n\n## Steps\n\n`, "utf8");
				ctx.ui.notify(`Cleared active plan at ${ACTIVE_PLAN_PATH}`, "info");
				return;
			}
			if (action === "status") {
				const plan = await readPlan();
				ctx.ui.notify(`${planningMode ? "Planning mode on" : "Planning mode off"}\n${plan ? summarizePlan(plan) : "No active plan."}`, "info");
				return;
			}
			if (planningMode) leavePlanning(ctx);
			else enterPlanning(ctx);
		},
	});


	pi.registerTool({
		name: "requirements_brief",
		label: "Requirements Brief",
		description: "Create a concise requirements brief from known context, assumptions, non-blocking unknowns, and at most one blocking question.",
		promptSnippet: "Use requirements_brief when requirements are fuzzy but mostly inferable; ask only one blocking question.",
		promptGuidelines: [
			"Prefer concrete assumptions over generic questionnaires.",
			"List known context, assumptions, missing-but-not-blocking details, and one blocking question only if truly needed.",
			"Use before planning_contract when the user intent is under-specified.",
		],
		parameters: Type.Object({
			goal: Type.String({ description: "The intended outcome." }),
			userIntent: Type.Optional(Type.String({ description: "The user's request or implied intent." })),
			knownContext: Type.Optional(Type.Array(Type.String(), { description: "Facts already known from inspection or conversation." })),
			assumptions: Type.Optional(Type.Array(Type.String(), { description: "Reasonable assumptions to proceed." })),
			missingButNotBlocking: Type.Optional(Type.Array(Type.String(), { description: "Unknown details that should not stop progress." })),
			blockingQuestion: Type.Optional(Type.String({ description: "One concrete blocker question, or omit if none." })),
			proposedFirstPlan: Type.Optional(Type.Array(Type.String(), { description: "Likely first implementation steps." })),
		}),
		async execute(_id, params) {
			const text = createRequirementsBrief(params);
			return { content: [{ type: "text", text }], details: { kind: "requirements_brief" } };
		},
		renderCall(args, theme) {
			const goal = cleanText((args as { goal?: unknown }).goal, 80);
			return new Text(theme.fg("toolTitle", theme.bold("requirements_brief ")) + theme.fg("accent", goal || "(untitled)"), 0, 0);
		},
	});

	pi.registerTool({
		name: "planning_contract",
		label: "Planning Contract",
		description: "Render a schema-first planning contract with facts, assumptions, unknowns, executable steps, done checks, and risk.",
		promptSnippet: "Use planning_contract for multi-step work before edits; include done checks and dependencies.",
		promptGuidelines: [
			"Make executable assumptions instead of stalling on broad questions.",
			"Each step should have an id, action, dependencies, and output.",
			"Include done checks so execution can verify success.",
		],
		parameters: Type.Object({
			goal: Type.String({ description: "The target outcome." }),
			knownFacts: Type.Optional(Type.Array(Type.String(), { description: "Grounded facts from context or inspection." })),
			assumptions: Type.Optional(Type.Array(Type.String(), { description: "Assumptions that permit progress." })),
			unknowns: Type.Optional(Type.Array(Type.String(), { description: "Open questions or uncertainty." })),
			oneQuestionIfBlocked: Type.Optional(Type.String({ description: "One targeted question only if blocked." })),
			steps: Type.Array(Type.Object({
				id: Type.Optional(Type.String({ description: "Short step id, e.g. E1." })),
				action: Type.String({ description: "Concrete action." }),
				needs: Type.Optional(Type.Array(Type.String(), { description: "Step ids this depends on." })),
				output: Type.Optional(Type.String({ description: "Expected artifact or result." })),
			}), { minItems: 1, maxItems: MAX_STEPS, description: "Executable ordered steps." }),
			doneCheck: Type.Optional(Type.Array(Type.String(), { description: "Verification checks." })),
			risk: Type.Optional(Type.Array(Type.String(), { description: "Material risks or caveats." })),
		}),
		async execute(_id, params) {
			const text = renderPlanningContract(params);
			return { content: [{ type: "text", text }], details: { kind: "planning_contract", steps: Array.isArray(params.steps) ? params.steps.length : 0 } };
		},
		renderCall(args, theme) {
			const goal = cleanText((args as { goal?: unknown }).goal, 80);
			return new Text(theme.fg("toolTitle", theme.bold("planning_contract ")) + theme.fg("accent", goal || "(untitled)"), 0, 0);
		},
	});

	pi.registerTool({
		name: "plan_create",
		label: "Create Plan",
		description: "Create or replace the active Markdown plan for broad, multi-step, risky, or ambiguous work.",
		promptSnippet: "Create a short numbered plan before broad or risky edits.",
		promptGuidelines: [
			"Use plan_create before broad, multi-step, risky, or ambiguous work.",
			"Keep plans short, specific, and executable. Do not plan for simple one-shot tasks.",
			"In planning mode, inspect first and create/update a plan instead of editing files.",
			"Do not turn planning into a generic questionnaire; make concrete assumptions and ask only for true blockers.",
		],
		parameters: Type.Object({
			title: Type.String({ description: "Short plan title." }),
			summary: Type.Optional(Type.String({ description: "Brief context or goal." })),
			steps: Type.Array(Type.String(), { minItems: 1, maxItems: MAX_STEPS, description: "Concrete ordered steps." }),
		}),
		async execute(_id, params) {
			const title = cleanText(params.title, MAX_TITLE) || "Active Plan";
			const summary = cleanText(params.summary, MAX_NOTE);
			const steps = params.steps.map((s) => cleanText(s, MAX_STEP)).filter(Boolean).slice(0, MAX_STEPS);
			if (!steps.length) return { content: [{ type: "text", text: "Error: provide at least one concrete step." }], details: { error: "missing steps" } };
			const now = today();
			const plan: PlanState = {
				title,
				summary: summary || undefined,
				steps: steps.map((text) => ({ status: "pending", text })),
				created: now,
				updated: now,
				notes: [],
			};
			await writePlan(plan);
			return {
				content: [{ type: "text", text: `Plan saved to ${ACTIVE_PLAN_PATH}\n\n${renderPlan(plan)}` }],
				details: { path: ACTIVE_PLAN_PATH, steps: steps.length },
			};
		},
		renderCall(args, theme) {
			const title = cleanText((args as { title?: unknown }).title, 80);
			return new Text(theme.fg("toolTitle", theme.bold("plan_create ")) + theme.fg("accent", title || "(untitled)"), 0, 0);
		},
	});

	pi.registerTool({
		name: "plan_read",
		label: "Read Plan",
		description: "Read the active Markdown plan and current step statuses.",
		promptSnippet: "Read the active plan before executing or updating it.",
		parameters: Type.Object({}),
		async execute() {
			const plan = await readPlan();
			if (!plan) return { content: [{ type: "text", text: "No active plan." }], details: { exists: false } };
			const rendered = renderPlan(plan);
			const text = rendered.length > MAX_PLAN_READ ? rendered.slice(0, MAX_PLAN_READ) + "\n[truncated]" : rendered;
			return { content: [{ type: "text", text }], details: { exists: true, path: ACTIVE_PLAN_PATH, steps: plan.steps.length } };
		},
	});

	pi.registerTool({
		name: "plan_update",
		label: "Update Plan",
		description: "Update one step in the active plan or append a short note.",
		promptSnippet: "Mark active plan steps in_progress, done, blocked, or pending.",
		parameters: Type.Object({
			step: Type.Optional(Type.Integer({ minimum: 1, description: "1-based step number to update." })),
			status: Type.Optional(StringEnum(["pending", "in_progress", "done", "blocked"], { description: "New step status." })),
			text: Type.Optional(Type.String({ description: "Optional replacement step text." })),
			note: Type.Optional(Type.String({ description: "Optional note to append." })),
		}),
		async execute(_id, params) {
			const plan = await readPlan();
			if (!plan) return { content: [{ type: "text", text: "Error: no active plan." }], details: { error: "no active plan" } };
			const stepNum = typeof params.step === "number" ? params.step : undefined;
			if (stepNum !== undefined) {
				const step = plan.steps[stepNum - 1];
				if (!step) return { content: [{ type: "text", text: `Error: step ${stepNum} not found.` }], details: { error: "bad step" } };
				if (params.status) step.status = params.status as StepStatus;
				const text = cleanText(params.text, MAX_STEP);
				if (text) step.text = text;
			}
			const note = cleanText(params.note, MAX_NOTE);
			if (note) plan.notes.push(`${today()}: ${note}`);
			plan.updated = today();
			await writePlan(plan);
			return { content: [{ type: "text", text: renderPlan(plan) }], details: { path: ACTIVE_PLAN_PATH, step: stepNum } };
		},
	});

	pi.registerTool({
		name: "plan_complete",
		label: "Complete Plan",
		description: "Mark the active plan complete after all required work is done.",
		promptSnippet: "Complete the active plan only when the work is actually done.",
		parameters: Type.Object({
			summary: Type.Optional(Type.String({ description: "Short completion note." })),
		}),
		async execute(_id, params) {
			const plan = await readPlan();
			if (!plan) return { content: [{ type: "text", text: "Error: no active plan." }], details: { error: "no active plan" } };
			const completion = validatePlanCompletion(plan);
			if (!completion.completed) {
				return {
					content: [{ type: "text", text: completion.message }],
					details: { error: completion.error, completed: false, unfinishedSteps: completion.unfinishedSteps },
				};
			}
			plan.completed = today();
			plan.updated = today();
			const summary = cleanText(params.summary, MAX_NOTE);
			if (summary) plan.notes.push(`${today()}: ${summary}`);
			await writePlan(plan);
			return { content: [{ type: "text", text: `Plan complete.\n\n${renderPlan(plan)}` }], details: { path: ACTIVE_PLAN_PATH, completed: true } };
		},
	});
}
