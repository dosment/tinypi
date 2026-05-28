import assert from "node:assert/strict";
import {
	buildTinyToolProviderModels,
	normalizeReasoningMode,
	setReasoningEnabled,
	mergeTinyToolConfig,
} from "../extensions/lib/tiny-tool-shim-config.js";

assert.equal(normalizeReasoningMode(true), true);
assert.equal(normalizeReasoningMode(false), false);
assert.equal(normalizeReasoningMode("on"), true);
assert.equal(normalizeReasoningMode("off"), false);
assert.equal(normalizeReasoningMode("enable"), true);
assert.equal(normalizeReasoningMode("disable"), false);
assert.equal(normalizeReasoningMode(undefined), false);

const disabledModels = buildTinyToolProviderModels(["qwen3.5:9b-mlx"], {
	thinkingEnabled: false,
	contextWindow: 131072,
	maxTokens: 2048,
});
assert.equal(disabledModels[0].reasoning, false);

const enabledModels = buildTinyToolProviderModels(["qwen3.5:9b-mlx"], {
	thinkingEnabled: true,
	contextWindow: 131072,
	maxTokens: 2048,
});
assert.equal(enabledModels[0].reasoning, true);
assert.deepEqual(enabledModels[0].input, ["text"]);
assert.equal(enabledModels[0].contextWindow, 131072);

assert.deepEqual(setReasoningEnabled({ maxTokens: 2048 }, true), { maxTokens: 2048, thinkingEnabled: true });
assert.deepEqual(setReasoningEnabled({ thinkingEnabled: true }, false), { thinkingEnabled: false });

const merged = mergeTinyToolConfig({ maxTokens: 4096, thinkingEnabled: "on" });
assert.equal(merged.maxTokens, 4096);
assert.equal(merged.thinkingEnabled, true);
assert.equal(merged.contextWindow, 131072);

console.log("tiny-tool-shim config tests passed");
