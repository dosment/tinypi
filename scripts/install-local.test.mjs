#!/usr/bin/env node
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { cpSync, existsSync, lstatSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const repoRoot = new URL("..", import.meta.url);

function copyRepoFixture(parent) {
	const copy = join(parent, "repo");
	cpSync(repoRoot, copy, {
		recursive: true,
		filter: (source) => !source.includes("/.git") && !source.includes("/node_modules"),
	});
	return copy;
}

function runUnsafeTargetInstall({ args = [], targetRelative }) {
	const parent = mkdtempSync(join(tmpdir(), "tinypi-install-local-test-"));
	try {
		const repoCopy = copyRepoFixture(parent);
		const sourceAgent = join(repoCopy, "agent");
		const targetAgent = join(repoCopy, targetRelative);
		const result = spawnSync(process.execPath, ["scripts/install-local.mjs", ...args], {
			cwd: repoCopy,
			env: { ...process.env, PI_CODING_AGENT_DIR: targetAgent },
			encoding: "utf8",
		});

		assert.notEqual(result.status, 0, `unsafe source-agent install should fail safely\n${result.stdout}\n${result.stderr}`);
		assert.match(`${result.stdout}\n${result.stderr}`, /refusing .*source agent directory|self-target/i);
		assert.equal(lstatSync(join(sourceAgent, "AGENTS.md")).isSymbolicLink(), false, "source AGENTS.md must not become a symlink");
		assert.equal(lstatSync(join(sourceAgent, "extensions")).isDirectory(), true, "source extensions must remain a directory");
		if (targetRelative !== "agent") {
			assert.equal(existsSync(targetAgent), false, "nested source-agent target must not be created");
		}
	} finally {
		rmSync(parent, { recursive: true, force: true });
	}
}

for (const args of [["--symlink"], []]) {
	runUnsafeTargetInstall({ args, targetRelative: "agent" });
	runUnsafeTargetInstall({ args, targetRelative: "agent/nested-target" });
}
