import assert from "node:assert/strict";
import {
	formatMemoryLint,
	memoryPageIssues,
	normalizedLine,
	splitSections,
	summarizeLintIssues,
} from "../extensions/wiki-memory-core.js";

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

console.log("wiki-memory core smoke tests passed");
