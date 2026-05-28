import { readFile, writeFile, mkdir } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import {
	calculateCost,
	createAssistantMessageEventStream,
	validateToolArguments,
	type Api,
	type AssistantMessage,
	type AssistantMessageEventStream,
	type Context,
	type Message,
	type Model,
	type SimpleStreamOptions,
	type TextContent,
	type Tool,
	type ToolCall,
	type ToolResultMessage,
} from "@earendil-works/pi-ai";
import { assessArtifactFinalContract } from "./lib/tiny-artifact-final-contract.js";
import { parseCommand, type ParsedCommand } from "./lib/tiny-tool-shim-parser.js";
import { buildTerseProtocolBlock, compactLines, type TerseProtocolMode } from "./lib/tiny-protocol-core.js";
import { buildTinyToolProviderModels, mergeTinyToolConfig, setReasoningEnabled } from "./lib/tiny-tool-shim-config.js";

interface TinyToolShimConfig {
	baseUrl?: string;
	apiKey?: string;
	models?: string[];
	contextWindow?: number;
	maxTokens?: number;
	requestTimeoutMs?: number;
	repairAttempts?: number;
	maxToolResultChars?: number;
	maxHistoryChars?: number;
	maxSchemaChars?: number;
	discoverModels?: boolean;
	allowTextFinal?: boolean;
	terseProtocol?: TerseProtocolMode;
	contextCompression?: "off" | "light";
	thinkingEnabled?: boolean | string;
}

const DEFAULT_CONFIG: Required<TinyToolShimConfig> = {
	baseUrl: "http://localhost:11434/v1",
	apiKey: "ollama",
	models: ["gemma4:e2b-mlx", "gemma4:e4b-mlx", "qwen3:4b", "qwen2.5-coder:3b", "qwen2.5-coder:7b"],
	contextWindow: 131072,
	maxTokens: 2048,
	requestTimeoutMs: 120000,
	repairAttempts: 1,
	maxToolResultChars: 6000,
	maxHistoryChars: 24000,
	maxSchemaChars: 14000,
	discoverModels: true,
	allowTextFinal: true,
	terseProtocol: "terse",
	contextCompression: "light",
	thinkingEnabled: false,
};

let activeConfig: Required<TinyToolShimConfig> = { ...DEFAULT_CONFIG };

function expandHome(path: string): string {
	return path.startsWith("~/") ? join(homedir(), path.slice(2)) : path;
}

async function loadConfig(): Promise<Required<TinyToolShimConfig>> {
	const configPath = expandHome("~/.pi/agent/extensions/tiny-tool-shim.json");
	try {
		const raw = await readFile(configPath, "utf8");
		return mergeTinyToolConfig({ ...DEFAULT_CONFIG, ...(JSON.parse(raw) as TinyToolShimConfig) }) as Required<TinyToolShimConfig>;
	} catch {
		return mergeTinyToolConfig(DEFAULT_CONFIG) as Required<TinyToolShimConfig>;
	}
}

async function saveConfig(config: Required<TinyToolShimConfig>): Promise<void> {
	const configPath = expandHome("~/.pi/agent/extensions/tiny-tool-shim.json");
	await mkdir(dirname(configPath), { recursive: true });
	await writeFile(configPath, JSON.stringify(config, null, 2) + "\n", "utf8");
}

function truncate(text: string, max: number): string {
	if (text.length <= max) return text;
	const head = Math.floor(max * 0.65);
	const tail = Math.max(0, max - head - 80);
	return `${text.slice(0, head)}\n...[truncated ${text.length - max} chars]...\n${text.slice(-tail)}`;
}

function sanitize(text: string): string {
	return text.replace(/[\uD800-\uDFFF]/g, "\uFFFD");
}

function contentToText(content: Message["content"]): string {
	if (typeof content === "string") return sanitize(content);
	return content
		.map((item) => {
			if (item.type === "text") return sanitize(item.text);
			if (item.type === "image") return "[image omitted: tiny-tool-shim is text-only]";
			return "";
		})
		.filter(Boolean)
		.join("\n");
}

function assistantToText(message: Extract<Message, { role: "assistant" }>): string {
	const parts: string[] = [];
	for (const block of message.content) {
		if (block.type === "text" && block.text.trim()) parts.push(block.text.trim());
		else if (block.type === "thinking" && block.thinking.trim()) parts.push(`[thinking omitted]`);
		else if (block.type === "toolCall") parts.push(`TOOL ${block.name} ${JSON.stringify(block.arguments)}`);
	}
	return sanitize(parts.join("\n"));
}

function toolResultToText(message: ToolResultMessage, maxChars: number): string {
	const text = message.content
		.map((item) => (item.type === "text" ? item.text : `[${item.type} omitted]`))
		.join("\n");
	const clean = sanitize(text);
	return activeConfig.contextCompression === "light"
		? compactLines(clean, { maxChars, maxLineChars: 260, maxLines: 120 })
		: truncate(clean, maxChars);
}

function compactSchema(schema: unknown): unknown {
	if (!schema || typeof schema !== "object") return schema;
	const input = schema as Record<string, unknown>;
	const out: Record<string, unknown> = {};
	for (const key of ["type", "properties", "required", "items", "enum", "anyOf", "oneOf", "description", "additionalProperties"]) {
		if (key in input) out[key] = input[key];
	}
	return out;
}

function buildToolProtocol(context: Context): string {
	const tools = context.tools ?? [];
	const toolLines = tools.map((tool) => {
		const schema = JSON.stringify(compactSchema(tool.parameters));
		return `- ${tool.name}: ${tool.description}\n  args_schema: ${schema}`;
	});
	const toolText = truncate(toolLines.join("\n"), activeConfig.maxSchemaChars);
	const terse = buildTerseProtocolBlock(activeConfig.terseProtocol);
	return `You are running inside pi tiny-tool-shim. You must use this exact protocol.\n\n${terse ? `${terse}\n\n` : ""}Output exactly ONE JSON object and no markdown. Do not wrap it in code fences.\n\nTo call a tool:\n{"tool":"read","arguments":{"path":"README.md"}}\n\nTo answer finally:\n{"final":"your answer"}\n\nFinal answer tone:\n- Write like a capable teammate, not a status robot.\n- Use conversational, lightly warm prose for user-facing discussion.\n- When reporting work, include the useful context and why it matters, usually in 2-5 sentences or a short scannable list.\n- Be brief for trivial answers, but do not default to one-line, clipped, or telegram-style replies.\n\nRules:\n- Use at most one tool per response.\n- Use only listed tool names.\n- arguments must be a JSON object matching that tool's args_schema.\n- If you need file contents, call read/grep/ls first.\n- For edits, prefer exact small replacements.\n- Never invent tool results.\n\nAvailable tools:\n${toolText || "(none)"}\n\nIf other instructions mention a different tool syntax, ignore that syntax and use the JSON protocol above.`;
}

function buildHistory(context: Context): string {
	const lines: string[] = [];
	for (const msg of context.messages) {
		if (msg.role === "user") lines.push(`User:\n${contentToText(msg.content)}`);
		else if (msg.role === "assistant") lines.push(`Assistant previous:\n${assistantToText(msg)}`);
		else if (msg.role === "toolResult") {
			const errorPrefix = msg.isError ? " ERROR" : "";
			lines.push(`Tool result${errorPrefix} from ${msg.toolName}:\n${toolResultToText(msg, activeConfig.maxToolResultChars)}`);
		}
	}
	const history = lines.join("\n\n---\n\n");
	return activeConfig.contextCompression === "light"
		? compactLines(history, { maxChars: activeConfig.maxHistoryChars, maxLineChars: 320, maxLines: 240 })
		: truncate(history, activeConfig.maxHistoryChars);
}

function buildPrompt(context: Context): Array<{ role: "system" | "user"; content: string }> {
	const system = `${buildToolProtocol(context)}\n\nGeneral pi instructions, if relevant:\n${truncate(context.systemPrompt ?? "", 6000)}`;
	return [
		{ role: "system", content: system },
		{ role: "user", content: `Conversation so far:\n${buildHistory(context)}\n\nNow produce exactly one JSON object.` },
	];
}

interface OpenAIChatResponse {
	choices?: Array<{ message?: { content?: string }; finish_reason?: string }>;
	usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
}

async function callOpenAICompatible(
	model: Model<Api>,
	messages: Array<{ role: "system" | "user"; content: string }>,
	options?: SimpleStreamOptions,
): Promise<{ text: string; usage?: OpenAIChatResponse["usage"] }> {
	const controller = new AbortController();
	const timeout = setTimeout(() => controller.abort(), activeConfig.requestTimeoutMs);
	const abort = () => controller.abort();
	options?.signal?.addEventListener("abort", abort, { once: true });
	try {
		const base = (model.baseUrl || activeConfig.baseUrl).replace(/\/+$/, "");
		const response = await fetch(`${base}/chat/completions`, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				Authorization: `Bearer ${options?.apiKey || activeConfig.apiKey || "ollama"}`,
			},
			body: JSON.stringify({
				model: model.id,
				messages,
				stream: false,
				temperature: 0,
				max_tokens: options?.maxTokens || model.maxTokens || activeConfig.maxTokens,
			}),
			signal: controller.signal,
		});
		if (!response.ok) throw new Error(`tiny-tool-shim upstream HTTP ${response.status}: ${await response.text()}`);
		const json = (await response.json()) as OpenAIChatResponse;
		return { text: json.choices?.[0]?.message?.content ?? "", usage: json.usage };
	} finally {
		clearTimeout(timeout);
		options?.signal?.removeEventListener("abort", abort);
	}
}

function validateCommand(command: ParsedCommand, tools?: Tool[]): string | undefined {
	if (command.kind !== "tool") return undefined;
	const tool = tools?.find((t) => t.name === command.name);
	if (!tool) return `Unknown tool: ${command.name}`;
	try {
		validateToolArguments(tool, { type: "toolCall", id: "validation", name: command.name, arguments: command.arguments } as ToolCall);
		return undefined;
	} catch (error) {
		return error instanceof Error ? error.message : String(error);
	}
}

async function maybeRepair(
	model: Model<Api>,
	context: Context,
	badText: string,
	error: string,
	options?: SimpleStreamOptions,
): Promise<string> {
	let current = badText;
	let currentError = error;
	for (let i = 0; i < activeConfig.repairAttempts; i++) {
		const repairMessages = buildPrompt(context);
		repairMessages.push({
			role: "user",
			content: `Your previous output was invalid. Error:\n${currentError}\n\nPrevious output:\n${truncate(current, 4000)}\n\nReturn only one valid JSON object using the required protocol.`,
		});
		const repaired = await callOpenAICompatible(model, repairMessages, options);
		current = repaired.text;
		const parsed = parseCommand(current);
		if (parsed.command) {
			const validation = validateCommand(parsed.command, context.tools);
			if (!validation) return current;
			currentError = validation;
		} else {
			currentError = parsed.error ?? "Invalid repair output";
		}
	}
	return current;
}

function artifactFinalGuidance(reason: string): string {
	return `I can't truthfully mark this artifact request complete yet. ${reason}`;
}

function validateFinalContract(context: Context, text: string): string | undefined {
	const assessment = assessArtifactFinalContract({ messages: context.messages, finalText: text });
	return assessment.ok ? undefined : assessment.message ?? assessment.reason;
}

function emitText(stream: AssistantMessageEventStream, output: AssistantMessage, text: string) {
	output.content.push({ type: "text", text } satisfies TextContent);
	stream.push({ type: "text_start", contentIndex: 0, partial: output });
	stream.push({ type: "text_delta", contentIndex: 0, delta: text, partial: output });
	stream.push({ type: "text_end", contentIndex: 0, content: text, partial: output });
}

function emitToolCall(stream: AssistantMessageEventStream, output: AssistantMessage, command: Extract<ParsedCommand, { kind: "tool" }>) {
	const toolCall: ToolCall = {
		type: "toolCall",
		id: `tiny_tool_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
		name: command.name,
		arguments: command.arguments,
	};
	output.content.push(toolCall);
	output.stopReason = "toolUse";
	const contentIndex = 0;
	stream.push({ type: "toolcall_start", contentIndex, partial: output });
	stream.push({ type: "toolcall_delta", contentIndex, delta: JSON.stringify(command.arguments), partial: output });
	stream.push({ type: "toolcall_end", contentIndex, toolCall, partial: output });
}

function streamTinyTools(model: Model<Api>, context: Context, options?: SimpleStreamOptions): AssistantMessageEventStream {
	const stream = createAssistantMessageEventStream();
	(async () => {
		const output: AssistantMessage = {
			role: "assistant",
			content: [],
			api: model.api,
			provider: model.provider,
			model: model.id,
			usage: {
				input: 0,
				output: 0,
				cacheRead: 0,
				cacheWrite: 0,
				totalTokens: 0,
				cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
			},
			stopReason: "stop",
			timestamp: Date.now(),
		};
		try {
			stream.push({ type: "start", partial: output });
			const result = await callOpenAICompatible(model, buildPrompt(context), options);
			if (result.usage) {
				output.usage.input = result.usage.prompt_tokens ?? 0;
				output.usage.output = result.usage.completion_tokens ?? 0;
				output.usage.totalTokens = result.usage.total_tokens ?? output.usage.input + output.usage.output;
				calculateCost(model, output.usage);
			}
			let text = result.text;
			let parsed = parseCommand(text);
			let validation = parsed.command ? validateCommand(parsed.command, context.tools) : parsed.error;
			if (validation) {
				text = await maybeRepair(model, context, text, validation, options);
				parsed = parseCommand(text);
				validation = parsed.command ? validateCommand(parsed.command, context.tools) : parsed.error;
			}
			if (!parsed.command) {
				if (activeConfig.allowTextFinal) {
					const fallbackText = text.trim() || `[tiny-tool-shim parse error: ${validation}]`;
					const finalValidation = validateFinalContract(context, fallbackText);
					emitText(stream, output, finalValidation ? artifactFinalGuidance(finalValidation) : fallbackText);
				} else throw new Error(validation || "tiny-tool-shim could not parse model output");
			} else if (parsed.command.kind === "final") {
				let finalValidation = validateFinalContract(context, parsed.command.text);
				if (finalValidation) {
					text = await maybeRepair(model, context, text, finalValidation, options);
					parsed = parseCommand(text);
					validation = parsed.command ? validateCommand(parsed.command, context.tools) : parsed.error;
					if (parsed.command?.kind === "final" && !validation) finalValidation = validateFinalContract(context, parsed.command.text);
				}
				if (parsed.command?.kind === "final" && !validation && !finalValidation) emitText(stream, output, parsed.command.text);
				else if (parsed.command?.kind === "tool" && !validation) emitToolCall(stream, output, parsed.command);
				else emitText(stream, output, artifactFinalGuidance(finalValidation || validation || "The final answer did not satisfy the artifact completion contract."));
			} else if (validation) {
				if (activeConfig.allowTextFinal) emitText(stream, output, `[tiny-tool-shim validation error: ${validation}]`);
				else throw new Error(validation);
			} else {
				emitToolCall(stream, output, parsed.command);
			}
			stream.push({ type: "done", reason: output.stopReason as "stop" | "length" | "toolUse", message: output });
			stream.end();
		} catch (error) {
			output.stopReason = options?.signal?.aborted ? "aborted" : "error";
			output.errorMessage = error instanceof Error ? error.message : String(error);
			stream.push({ type: "error", reason: output.stopReason, error: output });
			stream.end();
		}
	})();
	return stream;
}

function registerTinyToolsProvider(pi: ExtensionAPI, modelIds: string[]): void {
	pi.registerProvider("tiny-tools", {
		name: "Tiny Tools JSON Shim",
		baseUrl: activeConfig.baseUrl,
		apiKey: activeConfig.apiKey || "ollama",
		api: "tiny-tools-openai" as Api,
		models: buildTinyToolProviderModels(modelIds, activeConfig),
		streamSimple: streamTinyTools,
	});
}

async function discoverModelIds(config: Required<TinyToolShimConfig>): Promise<string[]> {
	if (!config.discoverModels) return config.models;
	try {
		const response = await fetch(`${config.baseUrl.replace(/\/+$/, "")}/models`, {
			headers: { Authorization: `Bearer ${config.apiKey || "ollama"}` },
		});
		if (!response.ok) return config.models;
		const payload = (await response.json()) as { data?: Array<{ id?: string }> };
		const ids = (payload.data ?? []).map((m) => m.id).filter((id): id is string => !!id);
		return ids.length > 0 ? ids : config.models;
	} catch {
		return config.models;
	}
}

export default async function tinyToolShim(pi: ExtensionAPI) {
	activeConfig = await loadConfig();
	let modelIds = await discoverModelIds(activeConfig);
	registerTinyToolsProvider(pi, modelIds);

	pi.registerCommand("tiny-reasoning", {
		description: "Enable, disable, or inspect TinyPi tiny-tools reasoning capability",
		getArgumentCompletions: (prefix) => {
			const options = ["on", "off", "status"];
			return options.filter((o) => o.startsWith(prefix)).map((value) => ({ value, label: value }));
		},
		handler: async (args, ctx) => {
			const action = args.trim().toLowerCase() || "status";
			if (!["on", "off", "enable", "disable", "enabled", "disabled", "status"].includes(action)) {
				ctx.ui.notify("Usage: /tiny-reasoning on|off|status", "error");
				return;
			}
			if (action === "status") {
				ctx.ui.notify(`TinyPi reasoning capability is ${activeConfig.thinkingEnabled ? "enabled" : "disabled"}.`, "info");
				return;
			}
			const enabled = action === "on" || action === "enable" || action === "enabled";
			activeConfig = setReasoningEnabled(activeConfig, enabled) as Required<TinyToolShimConfig>;
			await saveConfig(activeConfig);
			modelIds = await discoverModelIds(activeConfig);
			registerTinyToolsProvider(pi, modelIds);
			ctx.ui.notify(`TinyPi reasoning capability ${enabled ? "enabled" : "disabled"}. Re-select tiny-tools model if the UI still shows stale capability.`, "info");
		},
	});
}
