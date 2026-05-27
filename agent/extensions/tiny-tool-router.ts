import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { filterAvailableTools, isExplicitPlanningToolSet, routeTools } from "./lib/tiny-tool-router-core.js";

const MAX_TOOLS = 10;

function toolNames(tools: Array<string | { name?: string }>): string[] {
	return tools.map((tool) => typeof tool === "string" ? tool : tool.name).filter((name): name is string => Boolean(name));
}

function routeSummary(bundles: string[], tools: string[]): string {
	return `TinyPi tool router selected bundles: ${bundles.join("+")}. Active tools this turn: ${tools.join(", ") || "none"}.`;
}

export default function tinyToolRouter(pi: ExtensionAPI) {
	pi.on("before_agent_start", (event) => {
		const active = toolNames(pi.getActiveTools() as unknown as Array<string | { name?: string }>);
		if (isExplicitPlanningToolSet(active)) {
			return {
				message: {
					customType: "tiny-tool-router-context",
					display: false,
					content: "TinyPi tool router skipped: explicit planning mode controls the active read-only tool set.",
				},
			};
		}

		const available = toolNames(pi.getAllTools() as unknown as Array<string | { name?: string }>);
		const routed = routeTools(event.prompt, { maxTools: MAX_TOOLS, autoPlanLongPrompts: true });
		const next = filterAvailableTools(routed.tools, available);
		pi.setActiveTools(next);

		return {
			message: {
				customType: "tiny-tool-router-context",
				display: false,
				content: routeSummary(routed.bundles, next),
			},
		};
	});
}
