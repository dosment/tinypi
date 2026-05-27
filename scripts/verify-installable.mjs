#!/usr/bin/env node
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const required = [
	"agent/AGENTS.md",
	"agent/settings.json",
	"agent/extensions/tiny-tool-shim.ts",
	"agent/extensions/tight-web.ts",
	"agent/extensions/wiki-memory.ts",
	"agent/extensions/tight-ask-user.ts",
	"agent/extensions/tight-planning.ts",
	"agent/extensions/tight-learning.ts",
	"agent/extensions/tight-learning-core.js",
	"agent/skills/tinypi-maintainer/SKILL.md",
	"agent/npm/package.json",
	"agent/npm/package-lock.json",
	"agent/tests/tiny-tool-shim-parser.test.mjs",
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

if (failed) process.exit(1);
console.log("[tinypi] installable layout verified");
