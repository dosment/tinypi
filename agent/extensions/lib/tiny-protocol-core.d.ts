export type TerseProtocolMode = "off" | "terse" | "strict";

export declare const TERSE_PROTOCOL_RULES: string[];
export declare function oneLine(value: unknown): string;
export declare function compactLines(
	text: string,
	options?: {
		maxChars?: number;
		maxLineChars?: number;
		maxLines?: number;
	},
): string;
export declare function tokenEstimate(text: string): number;
export declare function buildTerseProtocolBlock(mode?: TerseProtocolMode): string;
