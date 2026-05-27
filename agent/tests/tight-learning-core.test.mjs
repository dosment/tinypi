import assert from "node:assert/strict";
import {
	DEFAULT_CONFIG,
	cleanText,
	memoryArtifactPathForKind,
	pathAllowed,
	shouldAutoApply,
	skillMarkdown,
	slug,
	wikiBlock,
	wikiPageForKind,
} from "../extensions/tight-learning-core.js";

assert.equal(cleanText("  keep\nthis\tcompact  "), "keep this compact");
assert.equal(cleanText("abcdef", 3), "abc");

assert.equal(slug("TinyPi Maintainer!"), "tinypi-maintainer");
assert.equal(slug("!!!"), "learned-skill");

assert.equal(shouldAutoApply({ ...DEFAULT_CONFIG, mode: "approve" }, "wiki_memory"), false);
assert.equal(shouldAutoApply({ ...DEFAULT_CONFIG, mode: "auto-memory" }, "workflow"), true);
assert.equal(shouldAutoApply({ ...DEFAULT_CONFIG, mode: "auto-memory" }, "test_fixture"), false);
assert.equal(shouldAutoApply({ ...DEFAULT_CONFIG, mode: "auto-safe" }, "test_fixture"), true);
assert.equal(shouldAutoApply({ ...DEFAULT_CONFIG, mode: "auto-safe" }, "skill_candidate"), false);
assert.equal(shouldAutoApply({ ...DEFAULT_CONFIG, mode: "auto" }, "skill_candidate"), true);

assert.equal(pathAllowed(DEFAULT_CONFIG, "agent/memory/wiki/facts.md"), true);
assert.equal(pathAllowed(DEFAULT_CONFIG, "agent/wiki/facts.md"), false);
assert.equal(pathAllowed(DEFAULT_CONFIG, "agent/skills/tinypi-maintainer/SKILL.md"), true);
assert.equal(pathAllowed(DEFAULT_CONFIG, "agent/auth.json"), false);
assert.equal(pathAllowed(DEFAULT_CONFIG, "agent/sessions/run.jsonl"), false);
assert.equal(pathAllowed(DEFAULT_CONFIG, "README.md"), false);

assert.equal(wikiPageForKind("preference"), "preferences.md");
assert.equal(wikiPageForKind("workflow"), "workflows.md");
assert.equal(wikiPageForKind("note"), "facts.md");
assert.equal(memoryArtifactPathForKind("workflow"), "agent/memory/wiki/workflows.md");

const record = {
	id: "learn_test",
	kind: "skill_candidate",
	title: "Use Focused Learning Tests",
	lesson: "Extract deterministic logic before testing extension behavior.",
	evidence: "Pure helpers are easier to exercise without a Pi runtime.",
	proposedChange: "Add tests around learning mode and path guard decisions.",
	skillName: "Focused Learning Tests",
	trigger: "When changing TinyPi learning behavior.",
	steps: ["Extract pure helpers.", "Exercise mode decisions.", "Verify protected paths stay denied."],
};

const skill = skillMarkdown(record);
assert.match(skill, /^---\nname: focused-learning-tests\n/m);
assert.match(skill, /description: When changing TinyPi learning behavior\./);
assert.match(skill, /1\. Extract pure helpers\./);
assert.match(skill, /3\. Verify protected paths stay denied\./);

const block = wikiBlock({ ...record, kind: "workflow" });
assert.match(block, /Type: workflow/);
assert.match(block, /Learning ID: learn_test/);

console.log("tight-learning core smoke tests passed");
