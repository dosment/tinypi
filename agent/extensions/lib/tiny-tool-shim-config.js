export const DEFAULT_TINY_TOOL_SHIM_CONFIG = Object.freeze({
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
});

export function normalizeReasoningMode(value) {
	if (value === true || value === false) return value;
	const text = String(value ?? "").trim().toLowerCase();
	if (["1", "true", "on", "yes", "enable", "enabled"].includes(text)) return true;
	if (["0", "false", "off", "no", "disable", "disabled"].includes(text)) return false;
	return false;
}

export function mergeTinyToolConfig(config = {}) {
	return {
		...DEFAULT_TINY_TOOL_SHIM_CONFIG,
		...config,
		thinkingEnabled: normalizeReasoningMode(config.thinkingEnabled),
	};
}

export function setReasoningEnabled(config = {}, enabled) {
	return { ...config, thinkingEnabled: Boolean(enabled) };
}

export function buildTinyToolProviderModels(modelIds, config) {
	const cfg = mergeTinyToolConfig(config);
	return modelIds.map((id) => ({
		id,
		name: `${id} (tiny tools)`,
		reasoning: cfg.thinkingEnabled,
		input: ["text"],
		cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
		contextWindow: cfg.contextWindow,
		maxTokens: cfg.maxTokens,
	}));
}
