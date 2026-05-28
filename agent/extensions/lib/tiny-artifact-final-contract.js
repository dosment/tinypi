const ARTIFACT_ACTION_RE = /\b(?:create|make|build|write|draft|generate|save|compile|compose|prepare|produce|author)\b/i;
const ARTIFACT_NOUN_RE = /\b(?:artifact|exam|quiz|test|practice\s+exam|multiple\s+choice|mcq|questions?|worksheet|study\s+guide|guide|document|doc|file|report|brief|spec|plan|skill|lesson|flashcards?|deck|csv|json|markdown|md|script|program|code|component|page|app)\b/i;
const SUCCESS_CLAIM_RE = /\b(?:done|compiled|created|made|built|wrote|written|generated|saved|prepared|completed|finished|drafted|produced|attached|added|updated|successfully)\b/i;
const GENERIC_SUCCESS_PHRASE_RE = /\b(?:i (?:have )?(?:created|made|built|written|generated|saved|prepared|completed|finished|compiled|drafted|produced)|it is (?:done|complete|ready|finished)|the (?:artifact|exam|quiz|document|file|report|brief|guide|skill|deck|app|page) (?:is|has been) (?:done|complete|ready|finished|created|built|written|generated|saved))\b/i;
const STRUCTURED_ARTIFACT_RE = /(^\s{0,3}#{1,6}\s+\S)|(^\s*```)|(^\s*\|[^\n]*\|)|(^\s*[-*]\s+\S)|(^\s*(?:\{\s*"|\[\s*\{))|(^\s*[A-Za-z0-9_ -]+,[A-Za-z0-9_ -]+(?:,[A-Za-z0-9_ -]+)*)/im;
const WRITE_TOOL_RE = /^(?:write|edit|save|create|append|patch|replace|apply_patch|write_file|plan_create|requirements_brief|wiki_remember|learn_capture)$/i;
const SAVE_LOCATION_QUESTION_RE = /\b(?:where|what\s+(?:file|path|location)|which\s+(?:file|path|location))\b[\s\S]{0,80}\b(?:save|saved|write|wrote|put|store|stored|questions?|artifact|file|path|location)\b|\b(?:save|saved|write|wrote|put|store|stored)\b[\s\S]{0,80}\b(?:where|what\s+(?:file|path|location)|which\s+(?:file|path|location))\b/i;
const NOT_SAVED_TRUTH_RE = /\b(?:did\s+not|didn[’'\u2019]?t|not|never|haven[’'\u2019]?t|have\s+not|wasn[’'\u2019]?t|was\s+not|isn[’'\u2019]?t|is\s+not)\b[\s\S]{0,80}\b(?:save|saved|write|written|wrote|create|created|store|stored)|\b(?:no\s+(?:file|artifact|saved\s+copy)|not\s+saved\s+yet|nowhere)\b/i;

function textFromContent(content) {
	if (typeof content === "string") return content;
	if (!Array.isArray(content)) return "";
	return content
		.map((item) => {
			if (!item || typeof item !== "object") return "";
			if (item.type === "text" && typeof item.text === "string") return item.text;
			return "";
		})
		.filter(Boolean)
		.join("\n");
}

function latestUserText(messages = []) {
	for (let i = messages.length - 1; i >= 0; i--) {
		const message = messages[i];
		if (message?.role === "user") return textFromContent(message.content);
	}
	return "";
}

function requestedQuestionCount(prompt) {
	const match = prompt.match(/\b(\d{1,3})\s+(?:question|questions|mcq|mcqs)\b/i);
	return match ? Number(match[1]) : undefined;
}

export function isConcreteArtifactRequest(prompt = "") {
	const text = prompt.trim();
	if (!text) return false;
	if (/\b(?:what is|who is|when is|where is|why is|how does|explain|summari[sz]e|define|tell me about)\b/i.test(text) && !ARTIFACT_ACTION_RE.test(text)) return false;
	return ARTIFACT_ACTION_RE.test(text) && ARTIFACT_NOUN_RE.test(text);
}

export function isSaveLocationQuestion(prompt = "") {
	return SAVE_LOCATION_QUESTION_RE.test(prompt.trim());
}

function finalTruthfullySaysNotSaved(finalText = "") {
	return NOT_SAVED_TRUTH_RE.test(finalText.trim());
}

function isWriteToolName(name) {
	return WRITE_TOOL_RE.test(String(name ?? ""));
}

function toolCallName(call) {
	if (!call || typeof call !== "object") return undefined;
	if (typeof call.name === "string") return call.name;
	if (typeof call.toolName === "string") return call.toolName;
	if (typeof call.tool_name === "string") return call.tool_name;
	if (call.function && typeof call.function === "object" && typeof call.function.name === "string") return call.function.name;
	return undefined;
}

function messageIndicatesError(message) {
	if (message?.isError === true || message?.error === true) return true;
	if (message?.status === "error") return true;
	return false;
}

export function hasPriorArtifactWrite(messages = []) {
	return messages.some((message) => {
		if (!message || typeof message !== "object") return false;
		if (message.role === "toolResult") return !messageIndicatesError(message) && isWriteToolName(message.toolName);
		if (message.role === "tool") return !messageIndicatesError(message) && isWriteToolName(message.name ?? message.toolName);
		if (message.role !== "assistant") return false;
		if (Array.isArray(message.content) && message.content.some((block) => {
			if (!block || typeof block !== "object") return false;
			if (block.type === "toolCall" || block.type === "tool_call" || block.type === "tool_use") return isWriteToolName(toolCallName(block));
			return false;
		})) return true;
		if (Array.isArray(message.tool_calls) && message.tool_calls.some((call) => isWriteToolName(toolCallName(call)))) return true;
		if (message.function_call && isWriteToolName(toolCallName(message.function_call))) return true;
		return false;
	});
}

export function finalContainsRequestedArtifact(prompt = "", finalText = "") {
	const final = finalText.trim();
	if (!final) return false;
	const requestedCount = requestedQuestionCount(prompt);
	const numberedItems = final.match(/^\s*(?:\d+[.)]|Q\s*\d+[.:)])/gim)?.length ?? 0;
	const choiceLines = final.match(/^\s*(?:[A-D][.)]|-\s*[A-D][.)])/gim)?.length ?? 0;
	if (/\b(?:exam|quiz|multiple\s+choice|mcq|questions?)\b/i.test(prompt)) {
		const minimum = requestedCount ? Math.max(1, Math.min(requestedCount, 20)) : 3;
		return numberedItems >= minimum && (choiceLines >= minimum * 2 || /\banswer\s*key\b/i.test(final));
	}
	if (GENERIC_SUCCESS_PHRASE_RE.test(final) && !STRUCTURED_ARTIFACT_RE.test(final)) return false;
	const bulletItems = final.match(/^\s*[-*]\s+\S/gim)?.length ?? 0;
	const hasTable = /^\s*\|[^\n]*\|/m.test(final);
	const hasCodeFence = /^\s*```/m.test(final);
	const hasJsonLike = /^\s*(?:\{\s*"|\[\s*\{)/m.test(final);
	const hasMarkdownSections = (final.match(/^\s{0,3}#{1,6}\s+\S/gm)?.length ?? 0) >= 2;
	return numberedItems >= 3 || bulletItems >= 5 || hasTable || hasCodeFence || hasJsonLike || hasMarkdownSections;
}

export function assessArtifactFinalContract({ messages = [], finalText = "" } = {}) {
	const prompt = latestUserText(messages);
	const priorArtifactWrite = hasPriorArtifactWrite(messages);
	if (isSaveLocationQuestion(prompt)) {
		if (priorArtifactWrite) return { ok: true, reason: "prior_artifact_write" };
		if (finalTruthfullySaysNotSaved(finalText)) return { ok: true, reason: "truthful_not_saved" };
		return {
			ok: false,
			reason: "save_location_without_write",
			message:
				"No write/edit/create tool record exists for this session. Do not invent a save location; say plainly that it was not saved anywhere yet.",
		};
	}
	if (!isConcreteArtifactRequest(prompt)) return { ok: true, reason: "not_artifact_request" };
	if (priorArtifactWrite) return { ok: true, reason: "prior_artifact_write" };
	if (finalContainsRequestedArtifact(prompt, finalText)) return { ok: true, reason: "final_contains_artifact" };
	return {
		ok: false,
		reason: "artifact_final_without_artifact_or_write",
		message:
			"Concrete artifact request detected. Do not claim success unless the artifact was written with a write/edit/create tool, or the full artifact is included in the final answer. If neither is true, say plainly that it was not saved or completed yet and ask for/perform the needed artifact-producing step.",
	};
}
