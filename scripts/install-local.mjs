#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import {
	cpSync,
	existsSync,
	lstatSync,
	mkdirSync,
	readdirSync,
	readFileSync,
	rmSync,
	symlinkSync,
	writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const sourceAgent = join(repoRoot, "agent");
const targetAgent = process.env.PI_CODING_AGENT_DIR || join(homedir(), ".pi", "agent");
const useSymlink = process.argv.includes("--symlink");

const TINYPI_OWNED_INSTALL_MANIFEST = [
	{ source: "AGENTS.md", target: "AGENTS.md", type: "file", mode: "copyOrSymlink" },
	{ source: "extensions", target: "extensions", type: "dir", mode: "copyOrSymlink" },
	{ source: "skills", target: "skills", type: "dir", mode: "copyOrSymlink" },
	{ source: "wiki", target: "wiki", type: "dir", mode: "copyOrSymlink" },
	{ source: "tests", target: "tests", type: "dir", mode: "copyOrSymlink" },
];

const SHARED_CONFIG_MANIFEST = [
	{ source: "settings.json", target: "settings.json", mode: "mergeJson" },
];

function log(message) {
	console.log(`[tinypi] ${message}`);
}

function ensureDir(path) {
	mkdirSync(path, { recursive: true });
}

function removeManifestOwnedPath(path) {
	if (existsSync(path)) rmSync(path, { recursive: true, force: true });
}

function readJson(path) {
	return JSON.parse(readFileSync(path, "utf8"));
}

function writeJson(path, value) {
	writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function mergeUniqueArray(existing = [], required = []) {
	const merged = Array.isArray(existing) ? [...existing] : [];
	for (const item of required) {
		if (!merged.includes(item)) merged.push(item);
	}
	return merged;
}

function isPlainObject(value) {
	return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function mergeSettingsJson(sourceSettings, targetSettings) {
	const merged = { ...targetSettings };
	for (const [key, value] of Object.entries(sourceSettings)) {
		if (!(key in merged)) {
			merged[key] = value;
		} else if (Array.isArray(value) && Array.isArray(merged[key])) {
			merged[key] = mergeUniqueArray(merged[key], value);
		} else if (isPlainObject(value) && isPlainObject(merged[key])) {
			merged[key] = mergeSettingsJson(value, merged[key]);
		}
	}
	return merged;
}

function installSettingsJson(entry) {
	const src = join(sourceAgent, entry.source);
	const dest = join(targetAgent, entry.target);
	if (!existsSync(src)) return;
	ensureDir(dirname(dest));
	if (!existsSync(dest)) {
		cpSync(src, dest);
		log(`copied ${entry.target}`);
		return;
	}
	const sourceSettings = readJson(src);
	const targetSettings = readJson(dest);
	writeJson(dest, mergeSettingsJson(sourceSettings, targetSettings));
	log(`merged ${entry.target}`);
}

function copyOrLink(entry) {
	const src = join(sourceAgent, entry.source);
	const dest = join(targetAgent, entry.target);
	if (!existsSync(src)) return;
	ensureDir(dirname(dest));
	if (useSymlink) {
		if (existsSync(dest)) {
			const stat = lstatSync(dest);
			if (stat.isDirectory() && !stat.isSymbolicLink()) {
				throw new Error(`refusing to replace existing directory with symlink: ${dest}`);
			}
			removeManifestOwnedPath(dest);
		}
		symlinkSync(src, dest, entry.type === "dir" ? "dir" : "file");
		log(`linked ${entry.target}`);
		return;
	}
	cpSync(src, dest, { recursive: true, force: true });
	log(`copied ${entry.target}`);
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

function ensureFileIfMissing(path, content) {
	if (!existsSync(path)) writeFileSync(path, content, "utf8");
}

function ensureLocalMemoryWiki() {
	const memoryWiki = join(targetAgent, "memory", "wiki");
	ensureDir(memoryWiki);
	const defaults = {
		"index.md": "# Local Memory Wiki Index\n\n- preferences.md: User preferences and style.\n- decisions.md: Durable decisions.\n- workflows.md: Reusable workflows.\n- facts.md: Stable facts.\n- glossary.md: Terms and definitions.\n- inbox.md: Unsorted approved memories.\n",
		"preferences.md": "# Preferences\n\n",
		"decisions.md": "# Decisions\n\n",
		"workflows.md": "# Workflows\n\n",
		"facts.md": "# Facts\n\n",
		"glossary.md": "# Glossary\n\n",
		"inbox.md": "# Inbox\n\nApproved memories that have not been curated into a stable page yet.\n\n",
		"log.jsonl": "",
	};
	for (const [file, content] of Object.entries(defaults)) {
		ensureFileIfMissing(join(memoryWiki, file), content);
	}
	log("ensured local memory/wiki");
}

function listInstalledExtensions() {
	const dir = join(targetAgent, "extensions");
	if (!existsSync(dir)) return [];
	return readdirSync(dir).filter((name) => name.endsWith(".ts")).sort();
}

ensureDir(targetAgent);
log(`installing to ${targetAgent}`);

for (const entry of TINYPI_OWNED_INSTALL_MANIFEST) copyOrLink(entry);
for (const entry of SHARED_CONFIG_MANIFEST) installSettingsJson(entry);
ensureLocalMemoryWiki();
installNpmPackage();

log("installed extensions:");
for (const name of listInstalledExtensions()) log(`  ${name}`);

log("done. Verify with: pi --list-models tiny-tools");
