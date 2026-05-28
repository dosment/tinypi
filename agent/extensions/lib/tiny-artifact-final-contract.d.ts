export interface ArtifactFinalAssessment {
	ok: boolean;
	reason: string;
	message?: string;
}

export function isConcreteArtifactRequest(prompt?: string): boolean;
export function hasPriorArtifactWrite(messages?: unknown[]): boolean;
export function finalContainsRequestedArtifact(prompt?: string, finalText?: string): boolean;
export function assessArtifactFinalContract(input?: { messages?: unknown[]; finalText?: string }): ArtifactFinalAssessment;
