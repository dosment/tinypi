import assert from "node:assert/strict";
import { asksForWebContext, shouldRedirectAskUserToWebSearch, webSearchRedirectMessage } from "../extensions/lib/tight-ask-user-core.js";

assert.equal(asksForWebContext("Please search the nvidia site for context details"), true);
assert.equal(asksForWebContext("General Exam Review"), false);

assert.equal(shouldRedirectAskUserToWebSearch({
	question: "What specific topics should the quiz cover for the NCP-AAI exam?",
	options: ["AI Fundamentals", "Machine Learning", "Natural Language Processing", "General Exam Review"],
	activeTools: ["ask_user", "web_search", "fetch_content", "plan_create"],
}), true);

assert.equal(shouldRedirectAskUserToWebSearch({
	question: "Since I cannot perform live web searches of the NVIDIA site, could you provide me with key topics?",
	options: ["AI Fundamentals", "Machine Learning", "NLP Techniques"],
	availableTools: ["web_search", "fetch_content"],
}), true);

assert.equal(shouldRedirectAskUserToWebSearch({
	question: "Which output format should I use?",
	options: ["Markdown", "JSON"],
	activeTools: ["ask_user", "web_search"],
}), false);

assert.match(webSearchRedirectMessage("What topics for NCP-AAI?"), /Call web_search next/);
assert.match(webSearchRedirectMessage("What topics for NCP-AAI?"), /NVIDIA official/);

console.log("tight-ask-user core smoke tests passed");
