import assert from "node:assert/strict";
import {
	filterAvailableTools,
	isExplicitPlanningToolSet,
	routeTools,
} from "../extensions/lib/tiny-tool-router-core.js";

const simple = routeTools("thanks", { maxTools: 9 });
assert.deepEqual(simple.bundles, ["base"]);
assert.deepEqual(simple.tools, ["ask_user"]);

const code = routeTools("Implement the router and update tests", { maxTools: 9 });
assert.ok(code.bundles.includes("code"));
assert.ok(code.tools.includes("read"));
assert.ok(code.tools.includes("edit"));

const findToolName = routeTools("Use find to locate package files", { maxTools: 9 });
assert.ok(findToolName.tools.includes("find"));

const quizSkillFollowup = routeTools("can you help me build skills?\nI suppose multiple choice quizzing for exam prep", { maxTools: 10 });
assert.ok(quizSkillFollowup.bundles.includes("code"));
assert.ok(quizSkillFollowup.bundles.includes("planning"));
assert.ok(quizSkillFollowup.tools.includes("read"));
assert.ok(quizSkillFollowup.tools.includes("plan_create"));

const quizPlanning = routeTools("Design the question schema for multiple choice exam prep quizzes", { maxTools: 10 });
assert.ok(quizPlanning.bundles.includes("planning"));
assert.ok(quizPlanning.tools.includes("plan_create"));

const web = routeTools("Look up the latest official docs for this API", { maxTools: 9 });
assert.ok(web.bundles.includes("web"));
assert.ok(web.tools.includes("web_search"));
assert.ok(web.tools.includes("fetch_content"));

const learning = routeTools("Review pending learnings and set learning mode to auto-memory", { maxTools: 9 });
assert.ok(learning.bundles.includes("learning"));
assert.ok(learning.tools.includes("learn_review"));

const learningToolName = routeTools("Why did learn_capture fail when the tool router ran?", { maxTools: 10 });
assert.ok(learningToolName.bundles.includes("learning"));
assert.ok(learningToolName.tools.includes("learn_capture"));

const webToolName = routeTools("Why did web_search not become available?", { maxTools: 10 });
assert.ok(webToolName.bundles.includes("web"));
assert.ok(webToolName.tools.includes("web_search"));

const fetchToolName = routeTools("Call fetch_content for the best URL", { maxTools: 10 });
assert.ok(fetchToolName.bundles.includes("web"));
assert.ok(fetchToolName.tools.includes("fetch_content"));

const memoryToolName = routeTools("Use wiki_remember for this durable preference", { maxTools: 10 });
assert.ok(memoryToolName.bundles.includes("memory"));
assert.ok(memoryToolName.tools.includes("wiki_remember"));

const planToolName = routeTools("Use plan_update after the next step", { maxTools: 10 });
assert.ok(planToolName.bundles.includes("planning"));
assert.ok(planToolName.tools.includes("plan_update"));

const planCompleteToolName = routeTools("Now call plan_complete", { maxTools: 10 });
assert.ok(planCompleteToolName.bundles.includes("plan_complete"));
assert.ok(planCompleteToolName.tools.includes("plan_complete"));

const maintenance = routeTools("Audit wiki memory drift and duplicate entries", { maxTools: 9 });
assert.ok(maintenance.bundles.includes("memory_maintenance"));
assert.ok(maintenance.tools.includes("wiki_lint"));
assert.ok(maintenance.tools.includes("wiki_review"));

const maintenanceToolName = routeTools("Run wiki_lint on memory", { maxTools: 10 });
assert.ok(maintenanceToolName.bundles.includes("memory_maintenance"));
assert.ok(maintenanceToolName.tools.includes("wiki_lint"));

const capped = routeTools("Implement code, search web, remember wiki, planning, learning", { maxTools: 5 });
assert.equal(capped.tools.length, 5);
assert.equal(capped.tools[0], "ask_user");

const cappedLiteralLearning = routeTools("Use learn_reject after reading files and searching web", { maxTools: 10 });
assert.ok(cappedLiteralLearning.tools.includes("learn_reject"));

const cappedLiteralMaintenance = routeTools("Run wiki_lint on README docs and memory", { maxTools: 10 });
assert.ok(cappedLiteralMaintenance.tools.includes("wiki_lint"));

const executePlan = routeTools("Execute the active plan: Update homepage (0/3 done)", { maxTools: 10 });
assert.ok(executePlan.tools.includes("read"));
assert.ok(executePlan.tools.includes("edit"));
assert.ok(!executePlan.tools.includes("plan_complete"));

const continuePlan = routeTools("Continue with the next planned step", { maxTools: 10 });
assert.ok(continuePlan.tools.includes("plan_read"));
assert.ok(continuePlan.tools.includes("plan_update"));

const fetchResultFollowup = routeTools("Fetch the first result", { maxTools: 10 });
assert.ok(fetchResultFollowup.tools.includes("get_search_content"));

const learningApplyFollowup = routeTools("Apply the first pending learning", { maxTools: 10 });
assert.ok(learningApplyFollowup.tools.includes("learn_apply"));

assert.deepEqual(filterAvailableTools(["ask_user", "missing", "wiki_search"], ["ask_user", "wiki_search"]), ["ask_user", "wiki_search"]);

assert.equal(isExplicitPlanningToolSet(["read", "grep", "find", "ls", "bash", "ask_user", "plan_create", "plan_read", "plan_update", "plan_complete"]), true);
assert.equal(isExplicitPlanningToolSet(["read", "grep", "bash", "edit", "plan_create", "plan_update"]), false);

console.log("tiny-tool-router core smoke tests passed");
