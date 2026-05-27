export type ParsedCommand =
	| { kind: "tool"; name: string; arguments: Record<string, unknown>; raw: unknown }
	| { kind: "final"; text: string; raw: unknown };

export function extractFirstJsonObject(text: string): string | null;
export function lightRepairJson(json: string): string;
export function normalizeCommand(parsed: unknown): ParsedCommand | null;
export function parseCommand(text: string): { command?: ParsedCommand; error?: string; json?: string };
