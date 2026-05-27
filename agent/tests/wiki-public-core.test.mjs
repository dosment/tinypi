import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	formatPublicWikiLint,
	lintPublicWiki,
	parseFrontmatter,
	validatePublicWikiPage,
} from "../extensions/lib/wiki-public-core.js";

const valid = `---
title: Example
type: tool-reference
status: public
audience: tiny-model, maintainer
tags:
  - tinypi
  - example
updated: 2026-05-27
related:
  - tools/other.md
---

# Example

Body.
`;

const parsed = parseFrontmatter(valid);
assert.equal(parsed.data.title, "Example");
assert.deepEqual(parsed.data.tags, ["tinypi", "example"]);
assert.deepEqual(parsed.data.related, ["tools/other.md"]);
assert.equal(parsed.errors.length, 0);

assert.equal(validatePublicWikiPage("tools/example.md", valid).issues.length, 0);

const invalid = validatePublicWikiPage("bad.md", "# Bad\n");
assert.ok(invalid.issues.some((issue) => issue.text.includes("missing opening frontmatter fence")));
assert.ok(invalid.issues.some((issue) => issue.text.includes("missing frontmatter field: title")));

const dir = await mkdtemp(join(tmpdir(), "tinypi-wiki-public-"));
try {
	const agentDir = join(dir, "agent");
	const wikiDir = join(agentDir, "wiki");
	const toolsDir = join(wikiDir, "tools");
	await mkdir(toolsDir, { recursive: true });
	await writeFile(join(wikiDir, "index.md"), valid.replace("type: tool-reference", "type: index").replace("# Example", "# Index") + "\n- tools/example.md\n", "utf8");
	await writeFile(join(toolsDir, "example.md"), valid, "utf8");
	const result = await lintPublicWiki(agentDir);
	assert.deepEqual(result.issues, []);
	assert.match(formatPublicWikiLint(result), /No issues found/);

	await writeFile(join(toolsDir, "orphan.md"), valid.replace("title: Example", "title: Orphan"), "utf8");
	const withOrphan = await lintPublicWiki(agentDir);
	assert.ok(withOrphan.issues.some((issue) => issue.text.includes("index.md does not list tools/orphan.md")));
} finally {
	await rm(dir, { recursive: true, force: true });
}

console.log("wiki-public core smoke tests passed");
