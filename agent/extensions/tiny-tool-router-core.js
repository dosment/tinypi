export const TOOL_BUNDLES = Object.freeze({
	base: ["ask_user"],
	code: ["read", "grep", "ls", "edit", "write", "bash"],
	web: ["web_search", "fetch_content"],
	web_followup: ["get_search_content"],
	memory: ["wiki_search", "wiki_read", "wiki_remember"],
	memory_maintenance: ["wiki_lint", "wiki_review"],
	planning: ["plan_create", "plan_read", "plan_update"],
	plan_complete: ["plan_complete"],
	learning: ["learn_capture", "learn_review", "learn_apply", "learn_reject"],
});

export const DEFAULT_MAX_TOOLS = 10;

const CODE_RE = /\b(code|repo|file|files|bug|error|test|tests|build|install|readme|typescript|javascript|script|function|fix|implement|commit|diff|push|git|npm|extension|router|tool|skill)\b/i;
const WEB_RE = /\b(web|search|browse|look\s*up|latest|current|today|news|source|citation|docs?|official|url|https?:\/\/)\b/i;
const MEMORY_RE = /\b(remember|memory|wiki|preference|preferences|decision|decisions|workflow|workflows|project history|prior|previous|convention|facts?|curate)\b/i;
const MEMORY_MAINTENANCE_RE = /\b(lint|review|audit|drift|cleanup|clean up|dedupe|duplicate|contradiction|stale)\b.*\b(wiki|memory)\b|\b(wiki|memory)\b.*\b(lint|review|audit|drift|cleanup|clean up|dedupe|duplicate|contradiction|stale)\b/i;
const PLANNING_RE = /\b(plan|planning|roadmap|approach|architecture|design|strategy|multi[- ]?step|risky|ambiguous|scope|tradeoff|tradeoffs)\b/i;
const LEARNING_RE = /\b(learn|learning|lesson|lessons|self[- ]?learn|capture|pending learnings?|auto-memory|auto-safe|skill candidate|promote.*skill)\b/i;
const COMPLETE_RE = /\b(complete|finish|done|mark.*done|close.*plan)\b/i;
const FETCH_STORED_RE = /\b(get_search_content|responseId|stored full content|full content)\b/i;

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

export function detectToolBundles(prompt, options = {}) {
	const text = String(prompt ?? "");
	const bundles = ["base"];
	const reasons = [];

	if (CODE_RE.test(text)) {
		bundles.push("code");
		reasons.push("code");
	}
	if (WEB_RE.test(text)) {
		bundles.push("web");
		reasons.push("web");
	}
	if (FETCH_STORED_RE.test(text)) {
		bundles.push("web_followup");
		reasons.push("stored-web");
	}
	if (MEMORY_RE.test(text)) {
		bundles.push("memory");
		reasons.push("memory");
	}
	if (MEMORY_MAINTENANCE_RE.test(text)) {
		bundles.push("memory_maintenance");
		reasons.push("memory-maintenance");
	}
	if (PLANNING_RE.test(text) || (options.autoPlanLongPrompts && text.length > 900)) {
		bundles.push("planning");
		reasons.push("planning");
	}
	if (COMPLETE_RE.test(text) && /\b(plan|planning)\b/i.test(text)) {
		bundles.push("plan_complete");
		reasons.push("plan-complete");
	}
	if (LEARNING_RE.test(text)) {
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
	for (const bundle of bundles) addUnique(tools, TOOL_BUNDLES[bundle] ?? []);
	return {
		bundles,
		reasons,
		tools: clampTools(tools, maxTools),
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
