# Decisions


## 2026-05-27 — Tiny-model harness stack

Type: decision
Source: user-session

We are shaping this pi harness primarily for small/local models in the 2B–14B range. The preferred architecture is to keep powerful backend capabilities behind tight, directive wrappers with small schemas and safe defaults.

Current tiny-model stack:

- `tiny-tool-shim`: converts tiny model JSON text into native pi tool calls.
- `tight-web`: small-model wrapper over `pi-web-access`, compact fetch by default.
- `wiki-memory`: Markdown long-term memory with search/read/remember, lint, and drift review.
- `tight-ask-user`: bounded structured clarification tool instead of guessing.
- `pi-tool-display`: compact TUI rendering for tool calls and diffs.

Guiding principle: expose fewer, clearer tools to tiny models; use deterministic preprocessing and guardrails instead of relying on model judgment.
