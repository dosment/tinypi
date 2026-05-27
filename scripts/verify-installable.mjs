#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { lintPublicWiki } from "../agent/extensions/lib/wiki-public-core.js";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const keepTempInstall = process.env.TINYPI_VERIFY_KEEP_TEMP === "1";

function isPathAtOrInside(parent, candidate) {
	const child = relative(parent, candidate);
	return child === "" || (!child.startsWith("..") && !isAbsolute(child));
}

function nearestExistingParent(target) {
	let parent = dirname(target);
	while (!existsSync(parent)) {
		const next = dirname(parent);
		if (next === parent) return parent;
		parent = next;
	}
	return parent;
}

function createTempInstallRoot() {
	const override = process.env.TINYPI_VERIFY_INSTALL_DIR;
	if (!override) return mkdtempSync(join(tmpdir(), "tinypi-verify-"));

	const installRoot = resolve(override);
	const realTempRoot = realpathSync(tmpdir());
	const realParent = realpathSync(nearestExistingParent(installRoot));
	if (!isPathAtOrInside(realTempRoot, realParent)) {
		throw new Error(
			`[tinypi] refusing TINYPI_VERIFY_INSTALL_DIR outside temp space: ${installRoot} (temp root: ${realTempRoot})`,
		);
	}
	if (existsSync(installRoot)) {
		throw new Error(
			`[tinypi] refusing pre-existing TINYPI_VERIFY_INSTALL_DIR; choose a new temp path: ${installRoot}`,
		);
	}
	return installRoot;
}

let tempInstallRoot;
try {
	tempInstallRoot = createTempInstallRoot();
} catch (error) {
	console.error(error.message);
	process.exit(1);
}
const required = [
	"agent/AGENTS.md",
	"agent/settings.json",
	"agent/extensions/tiny-tool-shim.ts",
	"agent/extensions/tiny-tool-router.ts",
	"agent/extensions/lib/tiny-tool-router-core.js",
	"agent/extensions/lib/tiny-protocol-core.js",
	"agent/extensions/lib/tiny-protocol-core.d.ts",
	"agent/extensions/tight-web.ts",
	"agent/extensions/wiki-memory.ts",
	"agent/extensions/lib/wiki-memory-core.js",
	"agent/extensions/lib/wiki-public-core.js",
	"agent/extensions/tight-ask-user.ts",
	"agent/extensions/tight-planning.ts",
	"agent/extensions/tight-learning.ts",
	"agent/extensions/lib/tight-learning-core.js",
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

function runCommand(command, args, options = {}) {
	console.log(`[tinypi] running ${command} ${args.join(" ")}`);
	const result = spawnSync(command, args, {
		cwd: repoRoot,
		env: process.env,
		stdio: "inherit",
		...options,
	});
	if (result.status !== 0) {
		failed = true;
		console.error(`[tinypi] command failed: ${command} ${args.join(" ")}`);
	}
	return result;
}

function runTempInstallSmoke() {
	console.log(`[tinypi] temp install target ${tempInstallRoot}`);
	runCommand(process.execPath, ["scripts/install-local.mjs"], {
		env: { ...process.env, PI_CODING_AGENT_DIR: tempInstallRoot },
	});
	if (failed) return;

	const installedNpm = join(tempInstallRoot, "npm");
	if (!existsSync(join(installedNpm, "package.json"))) {
		console.error(`[tinypi] missing installed npm package at ${installedNpm}`);
		failed = true;
		return;
	}

	runCommand("npm", ["--prefix", installedNpm, "test"]);
	if (failed) return;

	const installedPi = join(installedNpm, "node_modules", ".bin", process.platform === "win32" ? "pi.cmd" : "pi");
	if (existsSync(installedPi)) {
		runCommand(installedPi, ["--list-models", "tiny-tools"], {
			env: { ...process.env, PI_CODING_AGENT_DIR: tempInstallRoot, PI_OFFLINE: "1" },
		});
	} else {
		console.log(`[tinypi] pi binary unavailable at ${installedPi}; skipped offline extension/model-list smoke`);
	}
	if (!failed) console.log("[tinypi] temp install smoke verified");
}

try {
	if (failed) process.exitCode = 1;
	else {
		console.log("[tinypi] installable layout verified");
		runTempInstallSmoke();
		if (failed) process.exitCode = 1;
	}
} finally {
	if (keepTempInstall) {
		console.log(`[tinypi] preserved temp install target ${tempInstallRoot}`);
	} else {
		rmSync(tempInstallRoot, { recursive: true, force: true });
	}
}
