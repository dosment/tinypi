const IMPORTANT_LINE = /\b(must|never|only|required|forbidden|do not|don't|cannot|missing|not found|evidence|source|citation|error|failed|warning|constraint|rule|id|path|line|status|accepted|rejected|denied)\b/i;

export const TERSE_PROTOCOL_RULES = [
	"Be concise. No filler.",
	"Preserve constraints, negations, source ids, paths, ids, and error text.",
	"If information is missing, say MISSING or use the required missing field.",
	"Do not guess beyond provided context.",
	"Use structured output when requested.",
];

export function oneLine(value) {
	return String(value ?? "").replace(/\s+/g, " ").trim();
}

export function compactLines(text, options = {}) {
	const maxChars = options.maxChars ?? 4000;
	const maxLineChars = options.maxLineChars ?? 240;
	const maxLines = options.maxLines ?? 80;
	const lines = String(text ?? "")
		.replace(/\r\n/g, "\n")
		.split("\n")
		.map((line) => oneLine(line))
		.filter(Boolean);

	if (!lines.length) return "";

	const prepared = lines.map((line) => ({
		line: line.length > maxLineChars ? `${line.slice(0, maxLineChars - 15)}...[line cut]` : line,
		important: IMPORTANT_LINE.test(line),
	}));
	const selectedIndexes = new Set();
	for (let i = 0; i < prepared.length && selectedIndexes.size < maxLines; i++) {
		if (prepared[i].important) selectedIndexes.add(i);
	}
	for (let i = 0; i < prepared.length && selectedIndexes.size < maxLines; i++) selectedIndexes.add(i);
	const selected = [...selectedIndexes].sort((a, b) => a - b).map((i) => prepared[i].line);
	let out = selected.join("\n");
	if (out.length > maxChars) out = `${out.slice(0, maxChars - 20)}\n...[context cut]`;
	return out;
}

export function tokenEstimate(text) {
	return Math.ceil(String(text ?? "").length / 4);
}

export function buildTerseProtocolBlock(mode = "terse") {
	if (mode === "off") return "";
	const label = mode === "strict" ? "Terse protocol strict" : "Terse protocol";
	const extra = mode === "strict" ? ["Prefer short bullets or JSON fields.", "Avoid restating the prompt."] : [];
	return [`[${label}]`, ...TERSE_PROTOCOL_RULES, ...extra].map((line, i) => (i === 0 ? line : `- ${line}`)).join("\n");
}
