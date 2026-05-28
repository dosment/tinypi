import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Editor, type EditorTheme, Key, matchesKey, Text, truncateToWidth } from "@earendil-works/pi-tui";
import { Type } from "typebox";

const MAX_OPTIONS = 4;
const MAX_QUESTION_CHARS = 300;
const MAX_LABEL_CHARS = 60;
const MAX_DESCRIPTION_CHARS = 160;

interface AskOption {
	label: string;
	description?: string;
}

interface DisplayOption extends AskOption {
	isOther?: boolean;
}

interface AskUserDetails {
	question: string;
	options: string[];
	answer: string | null;
	wasCustom?: boolean;
	cancelled?: boolean;
	repeatedQuestion?: boolean;
}

interface RecentAnswer {
	questionKey: string;
	question: string;
	answer: string | null;
	cancelled?: boolean;
}

const OptionSchema = Type.Object({
	label: Type.String({ description: "Short option label, 1-5 words." }),
	description: Type.Optional(Type.String({ description: "Optional short trade-off or meaning." })),
});

function cleanText(value: unknown, max: number): string {
	return String(value ?? "").replace(/\s+/g, " ").trim().slice(0, max).trim();
}

function questionKey(question: string): string {
	return question.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function normalizeOptions(input: unknown): AskOption[] {
	if (!Array.isArray(input)) return [];
	const out: AskOption[] = [];
	const seen = new Set<string>();
	for (const item of input) {
		if (!item || typeof item !== "object") continue;
		const raw = item as Record<string, unknown>;
		const label = cleanText(raw.label, MAX_LABEL_CHARS);
		if (!label) continue;
		const key = label.toLowerCase();
		if (seen.has(key)) continue;
		seen.add(key);
		const description = cleanText(raw.description, MAX_DESCRIPTION_CHARS);
		out.push(description ? { label, description } : { label });
		if (out.length >= MAX_OPTIONS) break;
	}
	return out;
}

export default function tightAskUser(pi: ExtensionAPI) {
	const recentAnswers: RecentAnswer[] = [];

	function rememberAnswer(entry: RecentAnswer) {
		recentAnswers.unshift(entry);
		recentAnswers.splice(5);
	}

	pi.on("session_start", () => {
		const active = pi.getActiveTools().map((t) => t.name);
		if (!active.includes("ask_user")) active.push("ask_user");
		pi.setActiveTools(active);
	});

	pi.registerTool({
		name: "ask_user",
		label: "Ask User",
		description: "Ask the user one structured multiple-choice question when required info is missing. Use instead of guessing. Keep it short: 2-4 options.",
		promptSnippet: "Ask one short structured question instead of guessing; 2-4 options.",
		promptGuidelines: [
			"Use ask_user when required information is missing and guessing could cause wrong work.",
			"For ask_user, ask exactly one question with 2-4 clear options. Keep labels short.",
			"Do not use ask_user for trivial choices you can safely infer from repo evidence.",
			"Do not ask the same question again after the user answered, cancelled, or said they are only curious / do not need action. Proceed with that answer instead.",
		],
		parameters: Type.Object({
			question: Type.String({ description: "One concise question ending in ?. Max 300 chars." }),
			options: Type.Array(OptionSchema, { minItems: 2, maxItems: MAX_OPTIONS, description: "2-4 choices. Keep labels short and distinct." }),
			allowCustom: Type.Optional(Type.Boolean({ description: "Usually omit. Defaults true, allowing the user to type another answer." })),
		}),

		async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
			const question = cleanText(params.question, MAX_QUESTION_CHARS);
			const options = normalizeOptions(params.options);
			const allowCustom = params.allowCustom !== false;
			const labels = options.map((o) => o.label);
			const key = questionKey(question);
			const previous = key ? recentAnswers.find((entry) => entry.questionKey === key) : undefined;

			if (previous) {
				const prior = previous.cancelled ? "the user cancelled it" : `the user answered: ${previous.answer}`;
				return {
					content: [{ type: "text", text: `Repeated question blocked. You already asked: ${previous.question}. ${prior}. Do not call ask_user again for this question; answer or continue using that user response.` }],
					details: { question, options: labels, answer: previous.answer, cancelled: previous.cancelled, repeatedQuestion: true } as AskUserDetails,
				};
			}

			if (!question) {
				return { content: [{ type: "text", text: "Error: question is required." }], details: { error: "missing question" } };
			}
			if (options.length < 2) {
				return { content: [{ type: "text", text: "Error: provide 2-4 distinct options." }], details: { error: "not enough options" } };
			}
			if (!ctx.hasUI) {
				return {
					content: [{ type: "text", text: `Need user input: ${question}\nOptions: ${labels.join(" | ")}` }],
					details: { question, options: labels, answer: null } as AskUserDetails,
				};
			}

			const allOptions: DisplayOption[] = allowCustom ? [...options, { label: "Other / type answer", isOther: true }] : options;
			const result = await ctx.ui.custom<{ answer: string; wasCustom: boolean; index?: number } | null>(
				(tui, theme, _kb, done) => {
					let optionIndex = 0;
					let editMode = false;
					let cachedLines: string[] | undefined;

					const editorTheme: EditorTheme = {
						borderColor: (s) => theme.fg("accent", s),
						selectList: {
							selectedPrefix: (t) => theme.fg("accent", t),
							selectedText: (t) => theme.fg("accent", t),
							description: (t) => theme.fg("muted", t),
							scrollInfo: (t) => theme.fg("dim", t),
							noMatch: (t) => theme.fg("warning", t),
						},
					};
					const editor = new Editor(tui, editorTheme);

					editor.onSubmit = (value) => {
						const trimmed = value.trim();
						if (trimmed) done({ answer: trimmed.slice(0, 1000), wasCustom: true });
						else {
							editMode = false;
							editor.setText("");
							refresh();
						}
					};

					function refresh() {
						cachedLines = undefined;
						tui.requestRender();
					}

					function handleInput(data: string) {
						if (editMode) {
							if (matchesKey(data, Key.escape)) {
								editMode = false;
								editor.setText("");
								refresh();
								return;
							}
							editor.handleInput(data);
							refresh();
							return;
						}
						if (matchesKey(data, Key.up)) {
							optionIndex = Math.max(0, optionIndex - 1);
							refresh();
							return;
						}
						if (matchesKey(data, Key.down)) {
							optionIndex = Math.min(allOptions.length - 1, optionIndex + 1);
							refresh();
							return;
						}
						if (matchesKey(data, Key.enter)) {
							const selected = allOptions[optionIndex];
							if (selected.isOther) {
								editMode = true;
								refresh();
							} else {
								done({ answer: selected.label, wasCustom: false, index: optionIndex + 1 });
							}
							return;
						}
						if (matchesKey(data, Key.escape)) done(null);
					}

					function render(width: number): string[] {
						if (cachedLines) return cachedLines;
						const lines: string[] = [];
						const add = (s: string) => lines.push(truncateToWidth(s, width));
						add(theme.fg("accent", "─".repeat(width)));
						add(theme.fg("text", ` ${question}`));
						lines.push("");
						for (let i = 0; i < allOptions.length; i++) {
							const opt = allOptions[i];
							const selected = i === optionIndex;
							const prefix = selected ? theme.fg("accent", "> ") : "  ";
							const label = `${i + 1}. ${opt.label}${opt.isOther && editMode ? " ✎" : ""}`;
							add(prefix + (selected ? theme.fg("accent", label) : theme.fg("text", label)));
							if (opt.description) add(`     ${theme.fg("muted", opt.description)}`);
						}
						if (editMode) {
							lines.push("");
							add(theme.fg("muted", " Your answer:"));
							for (const line of editor.render(width - 2)) add(` ${line}`);
						}
						lines.push("");
						add(theme.fg("dim", editMode ? " Enter to submit • Esc to options" : " ↑↓ navigate • Enter select • Esc cancel"));
						add(theme.fg("accent", "─".repeat(width)));
						cachedLines = lines;
						return lines;
					}

					return { render, invalidate: () => { cachedLines = undefined; }, handleInput };
				},
			);

			if (!result) {
				rememberAnswer({ questionKey: key, question, answer: null, cancelled: true });
				return { content: [{ type: "text", text: "User cancelled." }], details: { question, options: labels, answer: null, cancelled: true } as AskUserDetails };
			}
			rememberAnswer({ questionKey: key, question, answer: result.answer });
			const text = result.wasCustom ? `User answered: ${result.answer}` : `User selected: ${result.index}. ${result.answer}`;
			return { content: [{ type: "text", text }], details: { question, options: labels, answer: result.answer, wasCustom: result.wasCustom } as AskUserDetails };
		},

		renderCall(args, theme) {
			const question = cleanText((args as { question?: unknown }).question, 120);
			const options = normalizeOptions((args as { options?: unknown }).options).map((o, i) => `${i + 1}. ${o.label}`);
			let text = theme.fg("toolTitle", theme.bold("ask_user ")) + theme.fg("accent", question || "(no question)");
			if (options.length) text += "\n" + theme.fg("dim", `  ${options.join(" | ")}`);
			return new Text(text, 0, 0);
		},

		renderResult(result, _options, theme) {
			const details = result.details as AskUserDetails | undefined;
			if (!details) return new Text("", 0, 0);
			if (details.repeatedQuestion) return new Text(theme.fg("warning", "↻ repeated question blocked"), 0, 0);
			if (!details.answer) return new Text(theme.fg("warning", "No answer"), 0, 0);
			const prefix = details.wasCustom ? "answered" : "selected";
			return new Text(theme.fg("success", "✓ ") + theme.fg("muted", `${prefix}: `) + theme.fg("accent", details.answer), 0, 0);
		},
	});
}
