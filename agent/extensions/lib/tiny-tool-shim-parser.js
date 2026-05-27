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

const ARG_WRAPPER_KEYS = ["arguments", "args", "tool_args", "tool_input", "input", "parameters", "params", "payload"];

function parseArgs(args) {
	if (args === undefined) return {};
	if (typeof args === "string") {
		try { args = JSON.parse(args); } catch { return null; }
	}
	if (!args || typeof args !== "object" || Array.isArray(args)) return null;
	const keys = Object.keys(args);
	if (keys.length === 1 && ARG_WRAPPER_KEYS.includes(keys[0])) return parseArgs(args[keys[0]]);
	return args;
}

export function normalizeCommand(parsed) {
	if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
	const obj = parsed;
	if (obj.function_call && typeof obj.function_call === "object" && !Array.isArray(obj.function_call)) {
		const name = obj.function_call.name;
		if (typeof name !== "string") return null;
		const args = parseArgs(obj.function_call.arguments ?? obj.function_call.args);
		return args ? { kind: "tool", name, arguments: args, raw: parsed } : null;
	}
	if (obj.function && typeof obj.function === "object" && !Array.isArray(obj.function)) {
		const name = obj.function.name;
		if (typeof name !== "string") return null;
		const args = parseArgs(obj.function.arguments ?? obj.function.args);
		return args ? { kind: "tool", name, arguments: args, raw: parsed } : null;
	}
	const name = obj.tool ?? obj.name ?? obj.tool_name ?? obj.function;
	if (typeof name === "string") {
		let args = obj.arguments ?? obj.args ?? obj.tool_args ?? obj.tool_input ?? obj.input ?? obj.parameters ?? obj.params ?? obj.payload;
		if (args === undefined) {
			args = { ...obj };
			for (const k of ["tool", "name", "tool_name", "function", "function_call"]) delete args[k];
		}
		const parsedArgs = parseArgs(args);
		return parsedArgs ? { kind: "tool", name, arguments: parsedArgs, raw: parsed } : null;
	}
	const final = obj.final ?? obj.final_answer ?? obj.answer ?? obj.response ?? obj.message ?? obj.content;
	if (typeof final === "string") return { kind: "final", text: final, raw: parsed };
	if (final && typeof final === "object" && !Array.isArray(final)) {
		const text = final.text ?? final.content ?? final.message;
		if (typeof text === "string") return { kind: "final", text, raw: parsed };
	}
	return null;
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
