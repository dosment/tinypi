const MAX_ITEM = 240;
const MAX_LONG = 1200;
const MAX_ITEMS = 12;

function cleanText(value, max = MAX_ITEM) {
	return String(value ?? "").replace(/\s+/g, " ").trim().slice(0, max).trim();
}

function cleanList(value, maxItems = MAX_ITEMS) {
	const input = Array.isArray(value) ? value : [];
	return input.map((item) => cleanText(item)).filter(Boolean).slice(0, maxItems);
}

function renderBullets(items, fallback = "- none") {
	if (!items.length) return fallback;
	return items.map((item) => `- ${item}`).join("\n");
}

function cleanStep(step, index) {
	if (typeof step === "string") {
		return {
			id: `E${index + 1}`,
			action: cleanText(step),
			needs: [],
			output: "completed subtask result",
		};
	}
	const raw = step && typeof step === "object" ? step : {};
	return {
		id: cleanText(raw.id, 16) || `E${index + 1}`,
		action: cleanText(raw.action),
		needs: cleanList(raw.needs, 6).map((need) => need.replace(/^#/, "")),
		output: cleanText(raw.output) || "completed subtask result",
	};
}

export function normalizePlanningContract(input = {}) {
	const raw = input && typeof input === "object" ? input : {};
	const steps = (Array.isArray(raw.steps) ? raw.steps : [])
		.map((step, index) => cleanStep(step, index))
		.filter((step) => step.action)
		.slice(0, MAX_ITEMS);
	return {
		goal: cleanText(raw.goal, MAX_LONG) || "Complete the requested work",
		knownFacts: cleanList(raw.knownFacts ?? raw.known_facts),
		assumptions: cleanList(raw.assumptions),
		unknowns: cleanList(raw.unknowns),
		oneQuestionIfBlocked: cleanText(raw.oneQuestionIfBlocked ?? raw.one_question_if_blocked, MAX_ITEM),
		steps,
		doneCheck: cleanList(raw.doneCheck ?? raw.done_check),
		risk: cleanList(raw.risk),
	};
}

export function renderPlanningContract(contractInput) {
	const contract = normalizePlanningContract(contractInput);
	let out = "## Planning Contract\n\n";
	out += `Goal: ${contract.goal}\n\n`;
	out += "## Known Facts\n" + renderBullets(contract.knownFacts) + "\n\n";
	out += "## Assumptions\n" + renderBullets(contract.assumptions) + "\n\n";
	out += "## Unknowns\n" + renderBullets(contract.unknowns) + "\n\n";
	out += "## Steps\n";
	if (!contract.steps.length) {
		out += "- none\n";
	} else {
		out += contract.steps.map((step) => {
			const needs = step.needs.length ? step.needs.join(", ") : "none";
			return `- ${step.id}: ${step.action} (needs: ${needs}; output: ${step.output})`;
		}).join("\n") + "\n";
	}
	out += "\n## Done Check\n" + renderBullets(contract.doneCheck) + "\n\n";
	out += "## Risk\n" + renderBullets(contract.risk) + "\n\n";
	out += "## One Question If Blocked\n";
	out += contract.oneQuestionIfBlocked || "none";
	return out.trim() + "\n";
}


export function getUnfinishedPlanSteps(plan = {}) {
	const steps = Array.isArray(plan.steps) ? plan.steps : [];
	return steps
		.map((step, index) => ({
			step: index + 1,
			status: step?.status || "pending",
			text: cleanText(step?.text, MAX_ITEM),
		}))
		.filter((step) => step.status !== "done");
}

export function validatePlanCompletion(plan = {}) {
	const unfinishedSteps = getUnfinishedPlanSteps(plan);
	if (!unfinishedSteps.length) return { completed: true, unfinishedSteps: [] };
	const list = unfinishedSteps
		.map((step) => `- step ${step.step} (${step.status}): ${step.text || "untitled step"}`)
		.join("\n");
	return {
		completed: false,
		error: "unfinished steps",
		unfinishedSteps,
		message: `Error: plan_complete refused because the active plan still has unfinished steps.\n${list}\nUse plan_update to mark each step done only after the actual work is finished. Blocked, pending, and in_progress steps must be resolved before plan_complete will stamp the plan completed.`,
	};
}

export function createRequirementsBrief(input = {}) {
	const raw = input && typeof input === "object" ? input : {};
	let out = "## Requirements Brief\n\n";
	out += `Goal: ${cleanText(raw.goal, MAX_LONG) || "Clarify and plan the requested work"}\n\n`;
	out += `User Intent: ${cleanText(raw.userIntent ?? raw.user_intent, MAX_LONG) || "not specified"}\n\n`;
	out += "### Known Context\n" + renderBullets(cleanList(raw.knownContext ?? raw.known_context)) + "\n\n";
	out += "### Assumptions\n" + renderBullets(cleanList(raw.assumptions)) + "\n\n";
	out += "### Missing But Not Blocking\n" + renderBullets(cleanList(raw.missingButNotBlocking ?? raw.missing_but_not_blocking)) + "\n\n";
	out += "### Blocking Question\n" + (cleanText(raw.blockingQuestion ?? raw.blocking_question, MAX_ITEM) || "none") + "\n\n";
	out += "### Proposed First Plan\n" + renderBullets(cleanList(raw.proposedFirstPlan ?? raw.proposed_first_plan));
	return out.trim() + "\n";
}
