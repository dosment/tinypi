# TinyPi

TinyPi is a userland harness layer for [pi.dev](https://pi.dev), adapted for small/local models.

It is not intended to be a fork of pi.dev. TinyPi is an overlay: extensions, docs, tests, wiki memory, and local configuration that sit on top of an existing pi installation.

## Why This Exists

Small/local models often struggle with large tool schemas, verbose tool descriptions, native function calling, and implicit memory. TinyPi keeps the model-facing surface small and deterministic.

The current harness provides:

- tight tool wrappers for tiny models
- an OpenAI-compatible tiny tool-call shim
- Markdown wiki memory
- structured user clarification
- Markdown-backed planning mode
- opt-in self-learning
- compact tool display configuration

## Relationship To pi.dev

TinyPi should stay separate from pi.dev unless we need to change pi core behavior.

Normal users should not need to clone pi.dev. They should install pi through its normal install path, then install TinyPi as an overlay.

Conceptually:

```text
pi.dev  = upstream CLI/app/runtime
TinyPi  = tiny-model extension layer and harness policy
```

Fork pi.dev only if we hit a limit that cannot be solved with extensions, such as missing lifecycle hooks, provider streaming changes, tool validation changes, or TUI behavior that must be modified upstream.

## Repository Layout

```text
agent/
  AGENTS.md
  extensions/
    tiny-tool-shim.ts
    tight-web.ts
    wiki-memory.ts
    tight-ask-user.ts
    tight-planning.ts
    tight-learning.ts
  skills/
    tinypi-maintainer/
  npm/
    package.json
    package-lock.json
  tests/
    tiny-tool-shim-parser.test.mjs
  wiki/
    index.md
    tools/
```

Canonical wiki:

```text
agent/wiki/
```

Do not commit local auth, sessions, installed dependencies, or generated plans.

## Install

Prerequisites:

- pi.dev installed and available as `pi`
- Node.js and npm
- Optional: Ollama or another OpenAI-compatible local model server

```bash
git clone https://github.com/dosment/tinypi.git
cd tinypi
npm install
npm run install:local
```

The installer copies TinyPi into your pi config directory:

```text
agent/extensions/*     -> ~/.pi/agent/extensions/
agent/skills/*         -> ~/.pi/agent/skills/
agent/wiki/*           -> ~/.pi/agent/wiki/
agent/npm/package.json -> ~/.pi/agent/npm/
```

It also runs `npm install` in:

```text
~/.pi/agent/npm/
```

For development, symlink the overlay instead of copying:

```bash
npm run install:local:symlink
```

Verify:

```bash
pi --list-models tiny-tools
```

Then start pi and try:

```text
/planning status
```

## Tiny Tool Shim

`tiny-tool-shim` registers a `tiny-tools` provider for OpenAI-compatible local endpoints such as Ollama:

```text
http://localhost:11434/v1
```

The shim asks tiny models to emit exactly one JSON object:

```json
{"tool":"read","arguments":{"path":"README.md"}}
```

or:

```json
{"final":"concise answer"}
```

It then parses, lightly repairs, validates, and converts that text into native pi tool calls.

## Planning Mode

TinyPi includes `/planning`, a Claude Code-like planning mode adapted for tiny models.

Commands:

```text
/planning
/planning on
/planning off
/planning status
/planning execute
/planning clear
```

Planning tools:

```text
plan_create
plan_read
plan_update
plan_complete
```

The active plan is stored as Markdown:

```text
~/.pi/agent/plans/active.md
```

Explicit planning mode is read-only: `edit` and `write` are blocked, and `bash` is restricted to read-only inspection commands.

## Self-Learning

TinyPi includes `tight-learning`, a Hermes-inspired learning loop constrained for tiny models.

Commands:

```text
/learn status
/learn review
/learn mode approve
/learn mode auto-memory
/learn mode auto-safe
/learn mode auto
```

Learning tools:

```text
learn_capture
learn_review
learn_apply
learn_reject
```

Approval is the default. Silent application is opt-in through:

```text
~/.pi/agent/extensions/tight-learning.json
```

Learning records are stored in:

```text
~/.pi/agent/learning/
```

Accepted learnings can be promoted into wiki memory or skills.

When learnings are pending review, TinyPi shows a `learn N` status indicator and can remind the user to run `/learn review`.

## Wiki Memory

TinyPi uses one canonical Markdown wiki:

```text
~/.pi/agent/wiki/
```

The `project`, `global`, and `both` memory scopes are accepted for compatibility, but all resolve to the canonical agent wiki in this harness.

## Skills

TinyPi includes a repo maintainer skill:

```text
agent/skills/tinypi-maintainer/
```

It teaches the agent how to maintain this harness: keep changes scoped, update the wiki, run checks, preserve the overlay model, and avoid committing local runtime state.

## Development Checks

```bash
cd agent/npm
npm run test:tiny-tool-shim
```

Load an extension directly:

```bash
PI_OFFLINE=1 ./agent/npm/node_modules/.bin/pi --extension agent/extensions/tight-planning.ts --list-models tiny-tools
```

## Current Dependencies

TinyPi currently uses:

```text
pi-tool-display
pi-web-access
```

The pi runtime itself is expected to be installed separately or available through the user’s existing pi setup.
