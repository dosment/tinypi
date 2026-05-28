export const WEB_TOOLS = ["web_search", "fetch_content", "get_search_content"];

export const WEB_REQUEST_RE = /\b(web|search|internet|online|website|site|url|link|links|docs?|documentation|official|nvidia|find it|look it up|try again)\b/i;

const EXAM_WEB_CONTEXT_RE = /\b(ncp[- ]?aai|nvidia|certification|certificate|exam|quiz|practice questions?|multiple[- ]?choice|multi[- ]?choice)\b/i;
const BROAD_SOURCE_QUESTION_RE = /\b(what|which|specific|provide|could you provide|cannot (perform|access)|can't (perform|access)|topics?|areas?|domains?|source|material|guide|documentation|context|focus|cover)\b/i;

export function asksForWebContext(text) {
	return WEB_REQUEST_RE.test(String(text ?? ""));
}

export function shouldRedirectAskUserToWebSearch({ question, options = [], activeTools = [], availableTools = [] } = {}) {
	const q = String(question ?? "");
	const optionText = Array.isArray(options) ? options.join(" ") : "";
	const text = `${q} ${optionText}`;
	const active = new Set(activeTools);
	const available = new Set(availableTools);
	const webAvailable = active.has("web_search") || available.has("web_search");
	if (!webAvailable) return false;
	if (WEB_REQUEST_RE.test(text)) return true;
	return EXAM_WEB_CONTEXT_RE.test(text) && BROAD_SOURCE_QUESTION_RE.test(text);
}

export function webSearchRedirectMessage(question) {
	const q = String(question ?? "").trim();
	return `Do not ask the user for broad exam/source topics here. Web research tools are available. Call web_search next for official/current context${q ? ` related to: ${q}` : ""}. Prefer NVIDIA official pages before third-party sources.`;
}
