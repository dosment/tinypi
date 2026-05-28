import assert from "node:assert/strict";
import {
	createRequirementsBrief,
	normalizePlanningContract,
	renderPlanningContract,
} from "../extensions/lib/tight-planning-core.js";

const brief = createRequirementsBrief({
	goal: "Build a multiple-choice exam prep skill",
	userIntent: "I suppose multiple choice quizzing for exam prep",
	knownContext: ["TinyPi skills are markdown skill folders", "User wants exam prep"],
	assumptions: ["The skill should both generate questions and quiz the user"],
	missingButNotBlocking: ["Exact exam domain can be supplied later"],
	blockingQuestion: "Should the first version generate questions, run quizzes, or both?",
	proposedFirstPlan: ["Inspect existing skill format", "Draft MCQ skill schema", "Add review loop"],
});
assert.match(brief, /## Requirements Brief/);
assert.match(brief, /### Known Context/);
assert.match(brief, /- TinyPi skills are markdown skill folders/);
assert.match(brief, /### Blocking Question/);
assert.match(brief, /Should the first version/);

const contract = normalizePlanningContract({
	goal: "Build MCQ skill",
	knownFacts: ["Skills live under agent/skills"],
	assumptions: ["Start with markdown-only skill"],
	unknowns: ["Exact exam domain"],
	oneQuestionIfBlocked: "Which exam domain should v1 target?",
	steps: [
		{ id: "E1", action: "Inspect existing skills", needs: [], output: "skill conventions" },
		{ id: "E2", action: "Draft MCQ schema", needs: ["E1"], output: "schema" },
	],
	doneCheck: ["Skill has clear trigger and workflow"],
	risk: ["Too many broad clarifying questions"],
});
assert.equal(contract.steps[1].needs[0], "E1");
assert.equal(contract.oneQuestionIfBlocked, "Which exam domain should v1 target?");

const rendered = renderPlanningContract(contract);
assert.match(rendered, /## Planning Contract/);
assert.match(rendered, /Goal: Build MCQ skill/);
assert.match(rendered, /E1: Inspect existing skills/);
assert.match(rendered, /needs: none/);
assert.match(rendered, /E2: Draft MCQ schema/);
assert.match(rendered, /needs: E1/);
assert.match(rendered, /## Done Check/);
assert.match(rendered, /## One Question If Blocked/);

const sparse = normalizePlanningContract({ goal: "Ship demo", steps: ["Verify runtime", "Run smoke"] });
assert.deepEqual(sparse.knownFacts, []);
assert.equal(sparse.steps[0].id, "E1");
assert.equal(sparse.steps[1].id, "E2");
assert.equal(sparse.steps[0].output, "completed subtask result");

console.log("tight-planning core smoke tests passed");
