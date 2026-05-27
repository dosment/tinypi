#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, readdirSync, rmSync, symlinkSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const sourceAgent = join(repoRoot, "agent");
const targetAgent = process.env.PI_CODING_AGENT_DIR || join(homedir(), ".pi", "agent");
const useSymlink = process.argv.includes("--symlink");

const items = [
	["AGENTS.md", "file"],
	["settings.json", "file"],
	["extensions", "dir"],
	["wiki", "dir"],
	["tests", "dir"],
];

function log(message) {
	console.log(`[tinypi] ${message}`);
}

function ensureDir(path) {
	mkdirSync(path, { recursive: true });
}

function removeExisting(path) {
	if (existsSync(path)) rmSync(path, { recursive: true, force: true });
}

function copyOrLink(relativePath, type) {
	const src = join(sourceAgent, relativePath);
	const dest = join(targetAgent, relativePath);
	if (!existsSync(src)) return;
	ensureDir(dirname(dest));
	removeExisting(dest);
	if (useSymlink) {
		symlinkSync(src, dest, type === "dir" ? "dir" : "file");
		log(`linked ${relativePath}`);
	} else {
		cpSync(src, dest, { recursive: true });
		log(`copied ${relativePath}`);
	}
}

function installNpmPackage() {
	const srcNpm = join(sourceAgent, "npm");
	const destNpm = join(targetAgent, "npm");
	ensureDir(destNpm);
	for (const file of ["package.json", "package-lock.json"]) {
		const src = join(srcNpm, file);
		if (existsSync(src)) {
			cpSync(src, join(destNpm, file));
			log(`copied npm/${file}`);
		}
	}
	const npm = process.platform === "win32" ? "npm.cmd" : "npm";
	const result = spawnSync(npm, ["install"], { cwd: destNpm, stdio: "inherit" });
	if (result.status !== 0) {
		throw new Error(`npm install failed in ${destNpm}`);
	}
}

function listInstalledExtensions() {
	const dir = join(targetAgent, "extensions");
	if (!existsSync(dir)) return [];
	return readdirSync(dir).filter((name) => name.endsWith(".ts")).sort();
}

ensureDir(targetAgent);
log(`installing to ${targetAgent}`);

for (const [relativePath, type] of items) copyOrLink(relativePath, type);
installNpmPackage();

log("installed extensions:");
for (const name of listInstalledExtensions()) log(`  ${name}`);

log("done. Verify with: pi --list-models tiny-tools");
