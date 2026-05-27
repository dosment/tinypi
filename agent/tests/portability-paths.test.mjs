import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const installedAgentRoot = new URL("../", import.meta.url);
const repoRoot = existsSync(fileURLToPath(new URL("../../agent/extensions/", import.meta.url)))
	? new URL("../..", import.meta.url)
	: installedAgentRoot;
const scanRoots = repoRoot === installedAgentRoot ? ["extensions"] : ["agent/extensions", "scripts"];
const forbiddenPathPattern = /\/Users\/dan\b|\/Users\/|\/home\//;

function* filesUnder(relativeRoot) {
	const root = fileURLToPath(new URL(`${relativeRoot}/`, repoRoot));
	if (!existsSync(root)) return;
	const stack = [root];
	while (stack.length) {
		const current = stack.pop();
		for (const name of readdirSync(current)) {
			const path = join(current, name);
			const stat = statSync(path);
			if (stat.isDirectory()) {
				stack.push(path);
			} else if (stat.isFile()) {
				yield path;
			}
		}
	}
}

const violations = [];
for (const root of scanRoots) {
	for (const path of filesUnder(root)) {
		const text = readFileSync(path, "utf8");
		const lines = text.split(/\r?\n/);
		lines.forEach((line, index) => {
			if (forbiddenPathPattern.test(line)) {
				violations.push(`${path}:${index + 1}: ${line.trim()}`);
			}
		});
	}
}

if (violations.length) {
	throw new Error(`Hardcoded developer-local paths found:\n${violations.join("\n")}`);
}

function importSpecifiers(text) {
	const specs = [];
	const importRe = /import\s+(?:type\s+)?(?:[^"']*?\s+from\s+)?["']([^"']+)["']/g;
	for (const match of text.matchAll(importRe)) specs.push(match[1]);
	return specs;
}

function assertRelativeImportsResolve(relativeFile) {
	const file = fileURLToPath(new URL(relativeFile, repoRoot));
	const text = readFileSync(file, "utf8");
	const missing = [];
	for (const specifier of importSpecifiers(text)) {
		if (!specifier.startsWith(".")) continue;
		const target = resolve(dirname(file), specifier);
		if (!existsSync(target)) missing.push(`${relativeFile}: missing ${specifier} -> ${target}`);
	}
	if (missing.length) {
		throw new Error(`Relative runtime imports do not resolve:\n${missing.join("\n")}`);
	}
}

assertRelativeImportsResolve(repoRoot === installedAgentRoot ? "extensions/tight-web.ts" : "agent/extensions/tight-web.ts");
