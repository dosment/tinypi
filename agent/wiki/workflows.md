# Workflows


## 2026-05-27 — Tiny-model next steps

Type: workflow
Source: user-session

Potential next improvements for the tiny-model harness:

1. Done: add dependency-free parser smoke tests for `tiny-tool-shim` via `npm run test:tiny-tool-shim`.
2. Add secret scanning to `wiki_remember` so credentials and tokens cannot become durable memory.
3. Add deterministic permission/path guardrails for dangerous bash, `.env`, SSH keys, auth files, and destructive edits.
4. Build or wrap compressed context tools for read/grep/find/ls, possibly using `pi-lean-ctx` as a backend.
5. Run a real tiny-model smoke test with a minimal active tool set.
6. Stabilize the `tight-web` dependency on `pi-web-access` internals by turning the prototype into a proper local package/fork if needed.

## 2026-05-27 — Tight planning tool

Type: workflow
Source: user-request

Build a tiny-model-friendly planning tool similar to Claude Code planning, but adapted to pi's tight harness philosophy.

Desired properties:

- Done: added `tight-planning` extension at `agent/extensions/tight-planning.ts`.
- Done: explicit `/planning` command with `on`, `off`, `status`, `execute`, and `clear`.
- Done: Markdown-backed active plan at `~/.pi/agent/plans/active.md`.
- Done: small model surface area with `plan_create`, `plan_read`, `plan_update`, and `plan_complete`.
- Done: planning tools are active outside explicit planning mode so the model can auto-use plans for broad, risky, multi-step, or ambiguous work.
- Done: explicit planning mode blocks `edit` and `write`, and restricts `bash` to read-only inspection commands.
- Done: documented in `agent/wiki/tools/tight-planning.md`.

Potential tool names:

- `plan_create`
- `plan_read`
- `plan_update`
- `plan_complete`

Tiny-model rule: use planning for multi-step changes, risky edits, or ambiguous implementation work; skip planning for simple one-shot tasks.
