import assert from "node:assert/strict";
import { parseCommand, extractFirstJsonObject, lightRepairJson } from "../extensions/lib/tiny-tool-shim-parser.js";

const cases = [
	{
		name: "valid tool call",
		input: '{"tool":"read","arguments":{"path":"README.md"}}',
		expect: { kind: "tool", name: "read", arguments: { path: "README.md" } },
	},
	{
		name: "valid final answer",
		input: '{"final":"Done."}',
		expect: { kind: "final", text: "Done." },
	},
	{
		name: "fenced JSON",
		input: '```json\n{"tool":"ls","arguments":{"path":"src"}}\n```',
		expect: { kind: "tool", name: "ls", arguments: { path: "src" } },
	},
	{
		name: "prose before JSON",
		input: 'I should inspect first.\n{"tool":"grep","arguments":{"pattern":"TODO","path":"."}}',
		expect: { kind: "tool", name: "grep", arguments: { pattern: "TODO", path: "." } },
	},
	{
		name: "smart quotes and trailing comma repair",
		input: '{“tool”:“read”, “arguments”:{“path”:“package.json”,},}',
		expect: { kind: "tool", name: "read", arguments: { path: "package.json" } },
	},
	{
		name: "bare keys repair",
		input: '{tool:"read", arguments:{path:"README.md"}}',
		expect: { kind: "tool", name: "read", arguments: { path: "README.md" } },
	},
	{
		name: "arguments string parsed as JSON",
		input: '{"tool":"read","arguments":"{\\"path\\":\\"README.md\\"}"}',
		expect: { kind: "tool", name: "read", arguments: { path: "README.md" } },
	},
	{
		name: "legacy name/args aliases",
		input: '{"name":"edit","args":{"path":"a.txt","oldText":"x","newText":"y"}}',
		expect: { kind: "tool", name: "edit", arguments: { path: "a.txt", oldText: "x", newText: "y" } },
	},
	{
		name: "tool_args alias",
		input: '{"tool":"wiki_remember","tool_args":{"text":"TinyPi was created by Dan for tiny LLM models.","kind":"fact","scope":"project"}}',
		expect: { kind: "tool", name: "wiki_remember", arguments: { text: "TinyPi was created by Dan for tiny LLM models.", kind: "fact", scope: "project" } },
	},
	{
		name: "tool_input alias",
		input: '{"tool":"wiki_search","tool_input":{"query":"TinyPi creator"}}',
		expect: { kind: "tool", name: "wiki_search", arguments: { query: "TinyPi creator" } },
	},
	{
		name: "params alias",
		input: '{"tool":"plan_update","params":{"step":1,"status":"done"}}',
		expect: { kind: "tool", name: "plan_update", arguments: { step: 1, status: "done" } },
	},
	{
		name: "payload alias",
		input: '{"tool":"web_search","payload":{"query":"TinyPi docs"}}',
		expect: { kind: "tool", name: "web_search", arguments: { query: "TinyPi docs" } },
	},
	{
		name: "OpenAI function_call shape",
		input: '{"function_call":{"name":"read","arguments":"{\\"path\\":\\"README.md\\"}"}}',
		expect: { kind: "tool", name: "read", arguments: { path: "README.md" } },
	},
	{
		name: "function_call wins over response text",
		input: '{"response":"Calling read.","function_call":{"name":"read","arguments":"{\\"path\\":\\"README.md\\"}"}}',
		expect: { kind: "tool", name: "read", arguments: { path: "README.md" } },
	},
	{
		name: "nested function shape",
		input: '{"function":{"name":"grep","arguments":{"pattern":"TODO","path":"."}}}',
		expect: { kind: "tool", name: "grep", arguments: { pattern: "TODO", path: "." } },
	},
	{
		name: "nested argument wrapper",
		input: '{"tool":"wiki_remember","arguments":{"tool_args":{"text":"TinyPi was created by Dan.","kind":"fact"}}}',
		expect: { kind: "tool", name: "wiki_remember", arguments: { text: "TinyPi was created by Dan.", kind: "fact" } },
	},
	{
		name: "final_answer alias",
		input: '{"final_answer":"Done."}',
		expect: { kind: "final", text: "Done." },
	},
	{
		name: "nested final text",
		input: '{"answer":{"text":"Done."}}',
		expect: { kind: "final", text: "Done." },
	},
	{
		name: "missing arguments defaults to remaining object keys",
		input: '{"tool":"read","path":"README.md"}',
		expect: { kind: "tool", name: "read", arguments: { path: "README.md" } },
	},
	{
		name: "non-object output",
		input: "I can help with that.",
		expectError: "No JSON object found in model output",
	},
	{
		name: "JSON without command",
		input: '{"note":"hello"}',
		expectError: "JSON did not contain either",
	},
	{
		name: "array arguments rejected",
		input: '{"tool":"plan_read","arguments":["now"]}',
		expectError: "JSON did not contain either",
	},
	{
		name: "unparseable arguments string rejected",
		input: '{"tool":"read","arguments":"README.md"}',
		expectError: "JSON did not contain either",
	},
];

for (const testCase of cases) {
	const result = parseCommand(testCase.input);
	if (testCase.expectError) {
		assert.match(result.error ?? "", new RegExp(testCase.expectError), testCase.name);
		continue;
	}

	assert.ok(result.command, testCase.name);
	assert.equal(result.command.kind, testCase.expect.kind, testCase.name);
	if (testCase.expect.kind === "tool") {
		assert.equal(result.command.name, testCase.expect.name, testCase.name);
		assert.deepEqual(result.command.arguments, testCase.expect.arguments, testCase.name);
	} else {
		assert.equal(result.command.text, testCase.expect.text, testCase.name);
	}
}

assert.equal(
	extractFirstJsonObject('before {"tool":"read","arguments":{"path":"a } b"}} after'),
	'{"tool":"read","arguments":{"path":"a } b"}}',
	"extractFirstJsonObject respects braces inside strings",
);

assert.equal(
	lightRepairJson('{“tool”:“read”, “arguments”:{“path”:“a”,},}'),
	'{"tool":"read", "arguments":{"path":"a"}}',
	"lightRepairJson repairs common tiny-model JSON mistakes",
);

console.log(`tiny-tool-shim parser smoke tests passed (${cases.length + 2} checks)`);
