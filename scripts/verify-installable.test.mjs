#!/usr/bin/env node
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const repoRoot = new URL("..", import.meta.url);

const unsafeDir = mkdtempSync(join(tmpdir(), "tinypi-verify-unsafe-"));
const sentinel = join(unsafeDir, "sentinel.txt");
writeFileSync(sentinel, "do not delete");

try {
	const unsafeResult = spawnSync(process.execPath, ["scripts/verify-installable.mjs"], {
		cwd: repoRoot,
		env: {
			...process.env,
			PATH: process.env.PATH,
			TINYPI_VERIFY_INSTALL_DIR: unsafeDir,
			TINYPI_VERIFY_KEEP_TEMP: "0",
		},
		encoding: "utf8",
	});

	assert.notEqual(unsafeResult.status, 0, "pre-existing override install dir should be refused");
	assert.match(`${unsafeResult.stdout}\n${unsafeResult.stderr}`, /refus.*TINYPI_VERIFY_INSTALL_DIR|pre-existing/i);
	assert.equal(existsSync(sentinel), true, "verify must not delete a pre-existing override directory");
} finally {
	rmSync(unsafeDir, { recursive: true, force: true });
}

const installParent = mkdtempSync(join(tmpdir(), "tinypi-verify-test-"));
const installDir = join(installParent, "install");
const result = spawnSync(process.execPath, ["scripts/verify-installable.mjs"], {
	cwd: repoRoot,
	env: {
		...process.env,
		PATH: process.env.PATH,
		TINYPI_VERIFY_INSTALL_DIR: installDir,
		TINYPI_VERIFY_KEEP_TEMP: "0",
	},
	encoding: "utf8",
});

try {
	assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
	assert.match(result.stdout, /temp install smoke verified/);
	assert.equal(existsSync(installDir), false, "verify should clean up its created install target");
} finally {
	rmSync(installParent, { recursive: true, force: true });
}
