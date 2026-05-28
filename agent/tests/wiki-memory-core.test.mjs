import assert from "node:assert/strict";
import {
	formatMemoryLint,
	memoryPageIssues,
	normalizedLine,
	splitSections,
	summarizeLintIssues,
} from "../extensions/lib/wiki-memory-core.js";
import { appendMemoryAtomically, confirmWikiMemorySave, executeWikiRemember } from "../extensions/lib/wiki-memory-write-core.js";

assert.equal(normalizedLine(" ## Hello   `World` "), "hello world");

const sections = splitSections("# Title\n\nIntro\n\n## 2026-05-27 - Fact\n\nType: fact\nSource: test\n\nBody");
assert.equal(sections.length, 2);
assert.equal(sections[1].title, "2026-05-27 - Fact");

const validPage = {
	scope: "global",
	relPath: "facts.md",
	content: "# Facts\n\n## 2026-05-27 - Fact\n\nType: fact\nSource: test\n\nA durable fact.",
};
assert.deepEqual(memoryPageIssues(validPage), []);

const invalidPage = {
	scope: "global",
	relPath: "facts.md",
	content: "Facts\n\n## 2026-05-27 - Fact\n\nA durable fact.",
};
const issues = memoryPageIssues(invalidPage);
assert.ok(issues.some((issue) => issue.level === "high" && issue.text.includes("missing top-level # title")));
assert.ok(issues.some((issue) => issue.level === "low" && issue.text.includes("memory lacks valid Type")));
assert.ok(issues.some((issue) => issue.level === "low" && issue.text.includes("memory lacks Source")));

assert.match(formatMemoryLint(issues), /# Wiki lint/);
assert.match(summarizeLintIssues(issues, 1), /\.\.\. 2 more issues/);


const headlessDecision = await confirmWikiMemorySave(undefined, {
	kind: "fact",
	scope: "project",
	text: "TinyPi keeps runtime memory under PI_CODING_AGENT_DIR/memory/wiki.",
	clampText: (value) => value,
});
assert.equal(headlessDecision.approved, false);
assert.equal(headlessDecision.error, "approval-required");

const confirms = [];
const approvedDecision = await confirmWikiMemorySave({ ui: { confirm: async (title, body) => { confirms.push({ title, body }); return true; } } }, {
	kind: "workflow",
	scope: "global",
	text: "Run targeted tests before full verification.",
	clampText: (value) => value.slice(0, 12),
});
assert.equal(approvedDecision.approved, true);
assert.equal(confirms[0].title, "Save wiki memory?");
assert.match(confirms[0].body, /Save this workflow memory to global wiki/);
assert.match(confirms[0].body, /Run targeted/);

const headlessExecuteResult = await executeWikiRemember(
	{ text: "Remember this safely", kind: "fact", scope: "project" },
	{},
	{
		normalizeKind: (value) => value,
		clampText: (value) => value,
		appendMemory: async () => { throw new Error("append should not run without approval"); },
		notifyMemoryLintIssues: async () => {},
	},
);
assert.equal(headlessExecuteResult.details.saved, false);
assert.equal(headlessExecuteResult.details.error, "approval-required");

const writes = new Map();
const fakeFs = {
	mkdir: async () => {},
	readFile: async (path) => writes.get(path) ?? "# facts\n\n",
	writeFile: async (path, content) => {
		if (String(path).endsWith("log.jsonl.tmp")) throw new Error("simulated log temp write failure");
		writes.set(path, content);
	},
	rename: async (from, to) => {
		writes.set(to, writes.get(from));
		writes.delete(from);
	},
};
await assert.rejects(
	appendMemoryAtomically({
		fs: fakeFs,
		root: "/tmp/wiki",
		relPath: "facts.md",
		header: "# facts\n\n",
		block: "\n## 2026-05-28 — fact\n\nType: fact\nSource: test\n\nNo drift.\n",
		logLine: "{\"kind\":\"fact\"}\n",
	}),
	/simulated log temp write failure/,
);
assert.equal(writes.get("/tmp/wiki/facts.md"), undefined, "page must not be rewritten when log temp write fails");

console.log("wiki-memory core smoke tests passed");
