#!/usr/bin/env node
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";
import { lintPublicWiki } from "../agent/extensions/wiki-public-core.js";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const required = [
	"agent/AGENTS.md",
	"agent/settings.json",
	"agent/extensions/tiny-tool-shim.ts",
	"agent/extensions/tiny-tool-router.ts",
	"agent/extensions/tiny-tool-router-core.js",
	"agent/extensions/tiny-protocol-core.js",
	"agent/extensions/tiny-protocol-core.d.ts",
	"agent/extensions/tight-web.ts",
	"agent/extensions/wiki-memory.ts",
	"agent/extensions/wiki-memory-core.js",
	"agent/extensions/wiki-public-core.js",
	"agent/extensions/tight-ask-user.ts",
	"agent/extensions/tight-planning.ts",
	"agent/extensions/tight-learning.ts",
	"agent/extensions/tight-learning-core.js",
	"agent/skills/tinypi-maintainer/SKILL.md",
	"agent/skills/wiki-curator/SKILL.md",
	"agent/npm/package.json",
	"agent/npm/package-lock.json",
	"agent/tests/tiny-tool-shim-parser.test.mjs",
	"agent/tests/tiny-protocol-core.test.mjs",
	"agent/tests/tiny-tool-router-core.test.mjs",
	"agent/tests/wiki-public-core.test.mjs",
	"agent/tests/wiki-memory-core.test.mjs",
	"agent/tests/tight-learning-core.test.mjs",
	"agent/wiki/index.md",
	"README.md",
];

let failed = false;
for (const file of required) {
	if (!existsSync(join(repoRoot, file))) {
		console.error(`[tinypi] missing ${file}`);
		failed = true;
	}
}

const publicWiki = await lintPublicWiki(join(repoRoot, "agent"));
for (const issue of publicWiki.issues) {
	console.error(`[tinypi] public wiki ${issue.level}: ${issue.text}`);
	failed = true;
}

if (failed) process.exit(1);
console.log("[tinypi] installable layout verified");
