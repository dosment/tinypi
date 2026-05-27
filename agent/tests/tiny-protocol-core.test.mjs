import assert from "node:assert/strict";
import { buildTerseProtocolBlock, compactLines, oneLine, tokenEstimate } from "../extensions/lib/tiny-protocol-core.js";

assert.equal(oneLine("  keep\nthis\tshort  "), "keep this short");

const compact = compactLines(
	`
	Helpful greeting that should be lower priority.
	MUST preserve this constraint.
	Source [S1] says April 26.
	Do not infer beyond context.
	Another ordinary line.
	`,
	{ maxLines: 3, maxChars: 500 },
);

assert.deepEqual(compact.split("\n"), [
	"MUST preserve this constraint.",
	"Source [S1] says April 26.",
	"Do not infer beyond context.",
]);

const cut = compactLines("x".repeat(300), { maxLineChars: 40, maxChars: 500 });
assert.match(cut, /\.\.\.\[line cut\]$/);

assert.equal(buildTerseProtocolBlock("off"), "");
assert.match(buildTerseProtocolBlock("terse"), /concise but natural user-facing prose/);
assert.match(buildTerseProtocolBlock("strict"), /Prefer short bullets or JSON fields/);

assert.equal(tokenEstimate("abcd"), 1);
assert.equal(tokenEstimate("abcde"), 2);

console.log("tiny-protocol core smoke tests passed");
