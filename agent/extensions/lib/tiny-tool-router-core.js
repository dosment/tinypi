export const TOOL_BUNDLES = Object.freeze({
	base: ["ask_user"],
	code: ["read", "grep", "find", "ls", "edit", "write", "bash"],
	web: ["web_search", "fetch_content"],
	web_followup: ["get_search_content"],
	memory: ["wiki_search", "wiki_read", "wiki_remember"],
	memory_maintenance: ["wiki_lint", "wiki_review"],
	planning: ["plan_create", "plan_read", "plan_update"],
	planning_requirements: ["requirements_brief"],
	planning_contract: ["planning_contract"],
	plan_complete: ["plan_complete"],
	learning: ["learn_capture", "learn_review", "learn_apply", "learn_reject"],
});

export const DEFAULT_MAX_TOOLS = 10;

const CODE_RE = /\b(code|repo|file|files|bug|error|test|tests|build|install|readme|typescript|javascript|script|function|fix|implement|commit|diff|push|git|npm|extension|router|tool|skill|feature)\b/i;
const WEB_RE = /\b(web|search|browse|look\s*up|latest|current|today|news|source|citation|docs?|official|url|https?:\/\/|ncp[- ]?aai|nvidia(?:\s+\w+){0,4}\s+(exam|certification|certificate)|exam\s+(guide|blueprint|objectives|topics|outline))\b/i;
const MEMORY_RE = /\b(remember|memory|wiki|preference|preferences|decision|decisions|workflow|workflows|project history|prior|previous|convention|facts?|curate)\b/i;
const MEMORY_MAINTENANCE_RE = /\b(lint|review|audit|drift|cleanup|clean up|dedupe|duplicate|contradiction|stale)\b.*\b(wiki|memory)\b|\b(wiki|memory)\b.*\b(lint|review|audit|drift|cleanup|clean up|dedupe|duplicate|contradiction|stale)\b/i;
const PLANNING_RE = /\b(plan|planning|planned|active plan|next step|roadmap|approach|architecture|design|strategy|requirements?|schema|user flow|data structure|multi[- ]?step|risky|ambiguous|scope|tradeoff|tradeoffs|continue|resume|quiz|quizzes|quizzing|multiple choice|exam prep|question bank)\b/i;
const REQUIREMENTS_BRIEF_RE = /\b(requirements? brief|brief requirements|clarify requirements|known context|blocking question|missing but not blocking)\b/i;
const PLANNING_CONTRACT_RE = /\b(planning contract|plan contract|assumptions?|done checks?|unknowns?|one question if blocked|acceptance criteria)\b/i;
const LEARNING_RE = /\b(learn|learning|lesson|lessons|self[- ]?learn|capture|pending learnings?|auto-memory|auto-safe|skill candidate|promote.*skill)\b/i;
const COMPLETE_RE = /\b(plan_complete|complete (the )?(active )?plan|mark (the )?(active )?plan (complete|done)|close (the )?(active )?plan)\b/i;
const EXECUTE_PLAN_RE = /\b(execute|run|work|continue|resume)\b.*\b(active plan|plan|planned step|next step)\b|\b(active plan|plan|planned step|next step)\b.*\b(execute|run|work|continue|resume)\b/i;
const FETCH_STORED_RE = /\b(get_search_content|responseId|stored full content|full content|fetch (the )?(first|next|stored) result|open (the )?(first|next) result|retrieve (the )?(full )?(page|content))\b/i;
const LEARNING_FOLLOWUP_RE = /\b(apply|approve|reject|discard)\b.*\b(pending )?(learning|learnings|lesson|lessons|first one|that one)\b/i;
const ARTIFACT_RE = /\b(make|create|build|draft|write|save|generate|produce)\b[\s\S]{0,80}\b(practice exam|exam|quiz|quizzes|question bank|multiple choice|study guide|skill\.md|markdown file|markdown doc(?:ument)?|docs?|artifact|deliverable)\b|\b(practice exam|exam|quiz|quizzes|question bank|multiple choice|study guide|skill\.md|markdown file|markdown doc(?:ument)?|docs?|artifact|deliverable)\b[\s\S]{0,80}\b(make|create|build|draft|write|save|generate|produce|save it)\b/i;
const ARTIFACT_DISCUSSION_RE = /\b(?:how (?:do|would|can|should) (?:i|we)|explain|discuss|tell me about|what (?:is|are))\b/i;
const ARTIFACT_USER_ASK_RE = /\b(?:for me|make me|build me|create me|write me|generate me|save it|save this)\b/i;
const ARTIFACT_PINNED_TOOLS = ["read", "edit", "write", "bash"];

function escapeRegExp(value) {
	return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function mentionsToolName(text, name) {
	const lower = text.toLowerCase();
	const literal = String(name).toLowerCase();
	if (literal.includes("_")) return lower.includes(literal);
	return new RegExp(`(^|[^A-Za-z0-9_])${escapeRegExp(literal)}([^A-Za-z0-9_]|$)`, "i").test(text);
}

function mentionsAny(text, names) {
	return names.some((name) => mentionsToolName(text, name));
}

function allToolNames() {
	return [...new Set(Object.values(TOOL_BUNDLES).flat())];
}

function literalToolMentions(text) {
	return allToolNames().filter((name) => mentionsToolName(text, name));
}

function addUnique(target, names) {
	for (const name of names) {
		if (!target.includes(name)) target.push(name);
	}
}

function clampTools(tools, maxTools) {
	if (!maxTools || tools.length <= maxTools) return tools;
	const keep = new Set(TOOL_BUNDLES.base);
	const out = tools.filter((name) => keep.has(name));
	for (const name of tools) {
		if (out.includes(name)) continue;
		if (out.length >= maxTools) break;
		out.push(name);
	}
	return out;
}

function clampToolsWithPinned(tools, maxTools, pinned = []) {
	if (!maxTools || tools.length <= maxTools) return tools;
	const out = [];
	addUnique(out, TOOL_BUNDLES.base);
	addUnique(out, pinned);
	for (const name of tools) {
		if (out.length >= maxTools) break;
		addUnique(out, [name]);
	}
	return out.slice(0, maxTools);
}

export function detectToolBundles(prompt, options = {}) {
	const text = String(prompt ?? "");
	const bundles = ["base"];
	const reasons = [];

	const artifactRequested = ARTIFACT_RE.test(text) && (!ARTIFACT_DISCUSSION_RE.test(text) || ARTIFACT_USER_ASK_RE.test(text));
	if (CODE_RE.test(text) || artifactRequested || mentionsAny(text, TOOL_BUNDLES.code)) {
		bundles.push("code");
		reasons.push(artifactRequested ? "artifact" : "code");
	}
	if (WEB_RE.test(text) || mentionsAny(text, TOOL_BUNDLES.web)) {
		bundles.push("web");
		reasons.push("web");
	}
	if (FETCH_STORED_RE.test(text) || mentionsAny(text, TOOL_BUNDLES.web_followup)) {
		bundles.push("web_followup");
		reasons.push("stored-web");
	}
	if (MEMORY_RE.test(text) || mentionsAny(text, TOOL_BUNDLES.memory)) {
		bundles.push("memory");
		reasons.push("memory");
	}
	if (MEMORY_MAINTENANCE_RE.test(text) || mentionsAny(text, TOOL_BUNDLES.memory_maintenance)) {
		bundles.push("memory_maintenance");
		reasons.push("memory-maintenance");
	}
	if (PLANNING_RE.test(text) || mentionsAny(text, TOOL_BUNDLES.planning) || (options.autoPlanLongPrompts && text.length > 900)) {
		bundles.push("planning");
		reasons.push("planning");
	}
	if (REQUIREMENTS_BRIEF_RE.test(text) || mentionsAny(text, TOOL_BUNDLES.planning_requirements)) {
		bundles.push("planning_requirements");
		reasons.push("requirements-brief");
	}
	if (PLANNING_CONTRACT_RE.test(text) || mentionsAny(text, TOOL_BUNDLES.planning_contract)) {
		bundles.push("planning_contract");
		reasons.push("planning-contract");
	}
	if (EXECUTE_PLAN_RE.test(text)) {
		bundles.push("code");
		reasons.push("plan-execution");
	}
	if (COMPLETE_RE.test(text) || mentionsAny(text, TOOL_BUNDLES.plan_complete)) {
		bundles.push("plan_complete");
		reasons.push("plan-complete");
	}
	if (LEARNING_RE.test(text) || LEARNING_FOLLOWUP_RE.test(text) || mentionsAny(text, TOOL_BUNDLES.learning)) {
		bundles.push("learning");
		reasons.push("learning");
	}

	if (bundles.length === 1 && options.defaultMemory === true) {
		bundles.push("memory");
		reasons.push("default-memory");
	}

	return { bundles: [...new Set(bundles)], reasons };
}

export function routeTools(prompt, options = {}) {
	const maxTools = Number.isInteger(options.maxTools) ? options.maxTools : DEFAULT_MAX_TOOLS;
	const { bundles, reasons } = detectToolBundles(prompt, options);
	const tools = [];
	const pinned = literalToolMentions(String(prompt ?? ""));
	if (bundles.includes("planning_requirements")) addUnique(pinned, TOOL_BUNDLES.planning_requirements);
	if (bundles.includes("planning_contract")) addUnique(pinned, TOOL_BUNDLES.planning_contract);
	if (reasons.includes("artifact")) {
		if (bundles.includes("web")) addUnique(pinned, ["web_search"]);
		if (bundles.includes("planning")) addUnique(pinned, ["plan_create"]);
		addUnique(pinned, ARTIFACT_PINNED_TOOLS);
	}
	const bundlePriority = ["base", "web", "web_followup", "planning", "planning_requirements", "planning_contract", "plan_complete", "code", "memory", "memory_maintenance", "learning"];
	const orderedBundles = [...bundlePriority.filter((bundle) => bundles.includes(bundle)), ...bundles.filter((bundle) => !bundlePriority.includes(bundle))];
	for (const bundle of orderedBundles) addUnique(tools, TOOL_BUNDLES[bundle] ?? []);
	return {
		bundles,
		reasons,
		tools: clampToolsWithPinned(tools, maxTools, pinned),
	};
}

export function filterAvailableTools(tools, availableTools) {
	const available = new Set(availableTools);
	return tools.filter((name) => available.has(name));
}

export function isExplicitPlanningToolSet(activeTools) {
	const active = new Set(activeTools);
	return active.has("plan_create")
		&& active.has("plan_update")
		&& active.has("bash")
		&& active.has("read")
		&& !active.has("edit")
		&& !active.has("write");
}
