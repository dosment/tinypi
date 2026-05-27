export const MAX_TEXT = 2000;
export const MAX_TITLE = 120;
export const MAX_STEPS = 12;

export const DEFAULT_CONFIG = {
	mode: "approve",
	allowKinds: ["wiki_memory", "preference", "workflow", "skill_candidate", "test_fixture", "note"],
	allowPaths: ["agent/memory/wiki/", "agent/skills/", "agent/tests/", "agent/learning/"],
	denyPaths: ["agent/auth.json", "agent/sessions/", "agent/plans/", "agent/npm/node_modules/", "agent/bin/"],
};

export function today() {
	return new Date().toISOString().slice(0, 10);
}

export function cleanText(value, max = MAX_TEXT) {
	return String(value ?? "").replace(/\s+/g, " ").trim().slice(0, max).trim();
}

export function slug(value) {
	return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 64) || "learned-skill";
}

export function shouldAutoApply(config, kind) {
	if (config.mode === "auto") return true;
	if (config.mode === "auto-safe") return ["wiki_memory", "preference", "workflow", "note", "test_fixture"].includes(kind);
	if (config.mode === "auto-memory") return ["wiki_memory", "preference", "workflow", "note"].includes(kind);
	return false;
}

export function wikiPageForKind(kind) {
	if (kind === "preference") return "preferences.md";
	if (kind === "workflow") return "workflows.md";
	return "facts.md";
}

export function memoryArtifactPathForKind(kind) {
	return `agent/memory/wiki/${wikiPageForKind(kind)}`;
}

export function pathAllowed(config, path) {
	const normalized = path.replace(/\\/g, "/");
	return config.allowPaths.some((prefix) => normalized.startsWith(prefix)) && !config.denyPaths.some((prefix) => normalized.startsWith(prefix));
}

export function wikiBlock(record) {
	const type = record.kind === "preference" ? "preference" : record.kind === "workflow" ? "workflow" : "project";
	return `\n## ${today()} - ${record.title}\n\nType: ${type}\nSource: tight-learning\nLearning ID: ${record.id}\n\nLesson: ${record.lesson}\n\nEvidence: ${record.evidence}\n\nApplied change: ${record.proposedChange}\n`;
}

export function skillMarkdown(record) {
	const name = slug(record.skillName || record.title);
	const trigger = cleanText(record.trigger || record.lesson, 500);
	const steps = (record.steps?.length ? record.steps : [record.proposedChange]).slice(0, MAX_STEPS);
	return `---\nname: ${name}\ndescription: ${trigger}\n---\n\n# ${record.title}\n\n## Workflow\n\n${steps.map((step, i) => `${i + 1}. ${cleanText(step, 240)}`).join("\n")}\n\n## Evidence\n\n${record.evidence}\n`;
}
