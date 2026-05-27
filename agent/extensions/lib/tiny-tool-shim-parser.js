function stripCodeFence(text) {
	const trimmed = text.trim();
	const fence = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
	return fence ? fence[1].trim() : trimmed;
}

export function extractFirstJsonObject(text) {
	const s = stripCodeFence(text);
	const start = s.indexOf("{");
	if (start === -1) return null;
	let depth = 0;
	let inString = false;
	let escaped = false;
	for (let i = start; i < s.length; i++) {
		const ch = s[i];
		if (inString) {
			if (escaped) escaped = false;
			else if (ch === "\\") escaped = true;
			else if (ch === '"') inString = false;
			continue;
		}
		if (ch === '"') inString = true;
		else if (ch === "{") depth++;
		else if (ch === "}") {
			depth--;
			if (depth === 0) return s.slice(start, i + 1);
		}
	}
	return null;
}

export function lightRepairJson(json) {
	return json
		.replace(/[“”]/g, '"')
		.replace(/[‘’]/g, "'")
		.replace(/,\s*([}\]])/g, "$1")
		.replace(/([{,]\s*)([A-Za-z_][A-Za-z0-9_-]*)(\s*:)/g, '$1"$2"$3');
}

export function normalizeCommand(parsed) {
	if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
	const obj = parsed;
	const final = obj.final ?? obj.answer ?? obj.response;
	if (typeof final === "string" && !("tool" in obj) && !("name" in obj) && !("tool_name" in obj)) {
		return { kind: "final", text: final, raw: parsed };
	}
	const name = obj.tool ?? obj.name ?? obj.tool_name ?? obj.function;
	if (typeof name !== "string") return null;
	let args = obj.arguments ?? obj.args ?? obj.input ?? obj.parameters;
	if (args === undefined) {
		args = { ...obj };
		for (const k of ["tool", "name", "tool_name", "function"]) delete args[k];
	}
	if (typeof args === "string") {
		try { args = JSON.parse(args); } catch { args = { value: args }; }
	}
	if (!args || typeof args !== "object" || Array.isArray(args)) args = {};
	return { kind: "tool", name, arguments: args, raw: parsed };
}

export function parseCommand(text) {
	const json = extractFirstJsonObject(text);
	if (!json) return { error: "No JSON object found in model output" };
	for (const candidate of [json, lightRepairJson(json)]) {
		try {
			const parsed = JSON.parse(candidate);
			const command = normalizeCommand(parsed);
			if (!command) return { error: "JSON did not contain either {final:string} or {tool:string, arguments:object}", json: candidate };
			return { command, json: candidate };
		} catch {}
	}
	return { error: "Invalid JSON object", json };
}
