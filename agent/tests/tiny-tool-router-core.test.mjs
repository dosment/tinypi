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

const web = routeTools("Look up the latest official docs for this API", { maxTools: 9 });
assert.ok(web.bundles.includes("web"));
assert.ok(web.tools.includes("web_search"));
assert.ok(web.tools.includes("fetch_content"));

const learning = routeTools("Review pending learnings and set learning mode to auto-memory", { maxTools: 9 });
assert.ok(learning.bundles.includes("learning"));
assert.ok(learning.tools.includes("learn_review"));

const maintenance = routeTools("Audit wiki memory drift and duplicate entries", { maxTools: 9 });
assert.ok(maintenance.bundles.includes("memory_maintenance"));
assert.ok(maintenance.tools.includes("wiki_lint"));
assert.ok(maintenance.tools.includes("wiki_review"));

const capped = routeTools("Implement code, search web, remember wiki, planning, learning", { maxTools: 5 });
assert.equal(capped.tools.length, 5);
assert.equal(capped.tools[0], "ask_user");

assert.deepEqual(filterAvailableTools(["ask_user", "missing", "wiki_search"], ["ask_user", "wiki_search"]), ["ask_user", "wiki_search"]);

assert.equal(isExplicitPlanningToolSet(["read", "grep", "find", "ls", "bash", "ask_user", "plan_create", "plan_read", "plan_update", "plan_complete"]), true);
assert.equal(isExplicitPlanningToolSet(["read", "grep", "bash", "edit", "plan_create", "plan_update"]), false);

console.log("tiny-tool-router core smoke tests passed");
