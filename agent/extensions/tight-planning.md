# Tight Planning Extension

Tiny-model planning mode for pi.

Location:

```text
~/.pi/agent/extensions/tight-planning.ts
```

## Purpose

`tight-planning` adds a Claude Code-like planning workflow adapted for small/local models.

It has two layers:

- Router-enabled `plan_*` tools so the model can create or update a plan automatically when work is broad, risky, multi-step, or ambiguous.
- Explicit `/planning` mode that makes the session read-only until the user exits planning or runs the plan.

## Commands

```text
/planning
/planning on
/planning off
/planning status
/planning execute
/planning clear
```

## Tools

- `plan_create`: create or replace the active Markdown plan.
- `plan_read`: read the active plan.
- `plan_update`: update one step status or append a note.
- `plan_complete`: mark the active plan complete when the requested work is actually done.

## Plan File

The active plan is stored at:

```text
~/.pi/agent/plans/active.md
```

Step status marks:

- `[ ]` pending
- `[>]` in progress
- `[x]` done
- `[!]` blocked

For `plan_update`, use the exact `status` enum values: `pending`, `in_progress`, `done`, or `blocked`.

## Planning Mode Rules

When planning mode is active:

- `edit` and `write` tool calls are blocked.
- `bash` is restricted to read-only inspection commands.
- The model is instructed to inspect first and create/update a plan instead of modifying files.

Outside explicit planning mode, the tool router exposes planning tools for broad, multi-step, risky, or ambiguous work, and keeps them out of context for simple one-shot tasks.
