import assert from "node:assert/strict";
import {
	assessArtifactFinalContract,
	finalContainsRequestedArtifact,
	hasPriorArtifactWrite,
	isConcreteArtifactRequest,
	isSaveLocationQuestion,
} from "../extensions/lib/tiny-artifact-final-contract.js";

const ncpExamPrompt = "I need you to make a 20 question practice exam (multiple choice) covering NCP-AAI fundamentals";
const messagesFor = (text, extra = []) => [{ role: "user", content: text }, ...extra];

assert.equal(isConcreteArtifactRequest(ncpExamPrompt), true, "NCP-AAI exam prompt is a concrete artifact request");
assert.equal(isConcreteArtifactRequest("What is TinyPi?"), false, "ordinary Q&A is not an artifact request");

const finalOnlyClaim = assessArtifactFinalContract({
	messages: messagesFor(ncpExamPrompt),
	finalText: "I compiled the exam.",
});
assert.equal(finalOnlyClaim.ok, false, "final-only success claim must be rejected for requested artifacts");
assert.equal(finalOnlyClaim.reason, "artifact_final_without_artifact_or_write");
assert.match(finalOnlyClaim.message ?? "", /write\/edit\/create tool|full artifact/i);

const normalAnswer = assessArtifactFinalContract({
	messages: messagesFor("What is TinyPi?"),
	finalText: "TinyPi is a small-model harness overlay for pi.dev.",
});
assert.equal(normalAnswer.ok, true, "non-artifact final answers still work");

const saveLocationFollowUp = [
	{ role: "user", content: ncpExamPrompt },
	{ role: "assistant", content: [{ type: "text", text: "I compiled the exam." }] },
	{ role: "user", content: "Where did you save the questions?" },
];
assert.equal(isSaveLocationQuestion("Where did you save the questions?"), true, "live save-location follow-up is detected");
const inventedSaveLocation = assessArtifactFinalContract({
	messages: saveLocationFollowUp,
	finalText: "I saved the questions in /tmp/ncp-aai-practice-exam.md.",
});
assert.equal(inventedSaveLocation.ok, false, "save-location answer must not invent a path when no write happened");
assert.equal(inventedSaveLocation.reason, "save_location_without_write");
assert.match(inventedSaveLocation.message ?? "", /not saved anywhere yet|Do not invent/i);
assert.equal(
	assessArtifactFinalContract({ messages: saveLocationFollowUp, finalText: "I did not save them anywhere yet." }).reason,
	"truthful_not_saved",
	"truthful not-saved answer is allowed for live follow-up",
);

const priorWriteMessages = messagesFor(ncpExamPrompt, [
	{
		role: "toolResult",
		toolName: "write",
		isError: false,
		content: [{ type: "text", text: "saved /tmp/ncp-aai-exam.md" }],
	},
]);
assert.equal(hasPriorArtifactWrite(priorWriteMessages), true, "successful write tool history satisfies artifact contract");
assert.equal(
	assessArtifactFinalContract({ messages: priorWriteMessages, finalText: "Saved the exam to /tmp/ncp-aai-exam.md." }).ok,
	true,
	"concise final with prior artifact write is allowed",
);


const piAssistantToolCallMessages = messagesFor(ncpExamPrompt, [
	{
		role: "assistant",
		content: [{ type: "toolCall", name: "write", arguments: { path: "/tmp/ncp-aai-exam.md", content: "..." } }],
	},
]);
assert.equal(hasPriorArtifactWrite(piAssistantToolCallMessages), true, "pi assistant toolCall block satisfies artifact contract");

const openAiToolCallMessages = messagesFor(ncpExamPrompt, [
	{
		role: "assistant",
		content: null,
		tool_calls: [
			{ id: "call_1", type: "function", function: { name: "write", arguments: "{\"path\":\"/tmp/ncp-aai-exam.md\"}" } },
		],
	},
	{ role: "tool", tool_call_id: "call_1", name: "write", content: "saved /tmp/ncp-aai-exam.md" },
]);
assert.equal(hasPriorArtifactWrite(openAiToolCallMessages), true, "OpenAI tool_calls/tool-role history satisfies artifact contract");

const anthropicToolUseMessages = messagesFor(ncpExamPrompt, [
	{
		role: "assistant",
		content: [{ type: "tool_use", name: "write", input: { path: "/tmp/ncp-aai-exam.md" } }],
	},
]);
assert.equal(hasPriorArtifactWrite(anthropicToolUseMessages), true, "tool_use block history satisfies artifact contract");

const genericLongClaim = `I have completed the artifact successfully. ${"This work is ready and covers the requested material. ".repeat(25)}`;
assert.equal(finalContainsRequestedArtifact("Create a study guide for NCP-AAI", genericLongClaim), false, "long generic success claim is not treated as an artifact");

const structuredStudyGuide = `# NCP-AAI Study Guide

## Core Concepts
- Agent architecture
- Tool use
- RAG grounding
- Evaluation
- Deployment

## Review
Use official objectives as the source of truth.`;
assert.equal(finalContainsRequestedArtifact("Create a study guide for NCP-AAI", structuredStudyGuide), true, "structured non-exam artifact is accepted");

const fullExam = Array.from({ length: 20 }, (_, index) => {
	const n = index + 1;
	return `${n}. Which statement best describes NCP-AAI concept ${n}?\nA. Correct option\nB. Distractor\nC. Distractor\nD. Distractor`;
}).join("\n\n");
assert.equal(finalContainsRequestedArtifact(ncpExamPrompt, fullExam), true, "full requested MCQ artifact in final is allowed");
assert.equal(
	assessArtifactFinalContract({ messages: messagesFor(ncpExamPrompt), finalText: fullExam }).ok,
	true,
	"artifact included in final satisfies contract without write history",
);

console.log("tiny artifact final contract tests passed");
