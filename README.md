# TinyPi

TinyPi is a userland harness layer for [pi.dev](https://pi.dev), adapted for small/local models.

It is not intended to be a fork of pi.dev. TinyPi is an overlay: extensions, docs, tests, local memory support, and local configuration that sit on top of an existing pi installation.

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
    tiny-tool-router.ts
    tight-web.ts
    wiki-memory.ts
    tight-ask-user.ts
    tight-planning.ts
    tight-learning.ts
    lib/
      tiny-tool-router-core.js
      tiny-protocol-core.js
      tight-learning-core.js
      wiki-memory-core.js
      wiki-public-core.js
  skills/
    tinypi-maintainer/
    wiki-curator/
  npm/
    package.json
    package-lock.json
  tests/
    tiny-tool-shim-parser.test.mjs
    tiny-protocol-core.test.mjs
    tiny-tool-router-core.test.mjs
    wiki-public-core.test.mjs
    wiki-memory-core.test.mjs
    tight-learning-core.test.mjs
  wiki/
    index.md
    tools/
```

Shipped wiki docs:

```text
agent/wiki/
```

Local runtime memory:

```text
agent/memory/wiki/
```

Do not commit local auth, sessions, installed dependencies, generated plans, learning inboxes, or local memory.

Additional engineering notes:

- `docs/tinypi-failure-modes.md` — adversarial audit of how each TinyPi tool/skill can break and what regressions to add.
- `docs/plans/` — implementation plans for larger changes.

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

By default, the installer targets your pi agent directory:

```text
~/.pi/agent/
```

Set `PI_CODING_AGENT_DIR` to install into a different agent directory, which is the recommended way to test without touching your live pi setup:

```bash
PI_CODING_AGENT_DIR=/tmp/tinypi-install-test npm run install:local
```

TinyPi is installed as an overlay, not a pi.dev fork. The installer manages only TinyPi-owned files:

```text
agent/AGENTS.md        -> ~/.pi/agent/AGENTS.md
agent/extensions/*     -> ~/.pi/agent/extensions/
agent/skills/*         -> ~/.pi/agent/skills/
agent/wiki/*           -> ~/.pi/agent/wiki/
agent/tests/*          -> ~/.pi/agent/tests/
agent/npm/package.json -> ~/.pi/agent/npm/
```

Install mode defaults to copy mode. For development, symlink the overlay instead of copying:

```bash
npm run install:local:symlink
```

Symlink mode refuses to replace an existing real directory with a symlink, so use it against a clean development target or remove only the TinyPi-owned target path first.

The installer preserves user-owned runtime state. It does not replace these user-owned paths:

```text
~/.pi/agent/auth/
~/.pi/agent/sessions/
~/.pi/agent/plans/
~/.pi/agent/memory/
~/.pi/agent/models/
~/.pi/agent/logs/
~/.pi/agent/.env
~/.pi/agent/*.local.*
```

`settings.json` is shared config: TinyPi merges/preserves existing settings instead of treating the file as a disposable TinyPi-owned overlay. Default `memory/wiki/*` files are created only when missing.

It also installs TinyPi npm dependencies in the target runtime package directory:

```text
~/.pi/agent/npm/
```

Verify a temporary install before relying on it:

```bash
TINYPI_VERIFY_INSTALL_DIR=/tmp/tinypi-verify npm run verify
# or run the installer directly:
PI_CODING_AGENT_DIR=/tmp/tinypi-install-test npm run install:local
PI_CODING_AGENT_DIR=/tmp/tinypi-install-test PI_OFFLINE=1 /tmp/tinypi-install-test/npm/node_modules/.bin/pi --list-models tiny-tools
```

For a live install, verify:

```bash
pi --list-models tiny-tools
```

Then start pi and try:

```text
/planning status
```

TinyPi keeps the user command surface intentionally small. `/planning` is the only TinyPi slash command; tools, memory, web access, and learning are selected automatically from the user's plain-language request.

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
{"final":"your answer"}
```

It then parses, lightly repairs, validates, and converts that text into native pi tool calls.

TinyPi also enables a terse protocol by default for tiny models. This is structured semantic compression, not a flat assistant personality: the model is told to use natural user-facing prose while preserving constraints, negations, source ids, paths, ids, error text, and missing-info behavior. The shim also gives explicit final-answer tone guidance so normal discussion should feel conversational instead of clipped. Tool results and history are lightly compacted before being sent back to the local model.

Configure it in:

```text
~/.pi/agent/extensions/tiny-tool-shim.json
```

Relevant options:

```json
{
  "terseProtocol": "terse",
  "contextCompression": "light"
}
```

## Tool Router

TinyPi includes an automatic tool router so tiny models do not see every tool schema on every turn.

The router has no slash command. Before each agent turn it inspects the user's prompt and activates a compact bundle such as:

```text
base, code, web, memory, planning, learning
```

Maintenance tools like `wiki_lint`, `wiki_review`, `learn_apply`, `learn_reject`, `get_search_content`, and `plan_complete` are only exposed for prompts that need them. Explicit `/planning` mode overrides the router and keeps its read-only planning tool set active.

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

There is no `/learn` command. Ask naturally, for example:

```text
review pending learnings
set learning mode to auto-memory
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

Accepted learnings can be promoted into local wiki memory or skills.

When learnings are pending review, TinyPi shows a `learn N` status indicator and can remind the user to ask TinyPi to review pending learnings.

## Wiki Memory

TinyPi ships public reference docs in:

```text
~/.pi/agent/wiki/
```

Runtime memory is local-only and stored in:

```text
~/.pi/agent/memory/wiki/
```

The `project`, `global`, and `both` memory scopes are accepted for compatibility, but all resolve to local memory in this harness. The shipped `wiki/` directory should stay barebones and public-safe.

## Skills

TinyPi includes a repo maintainer skill:

```text
agent/skills/tinypi-maintainer/
```

It teaches the agent how to maintain this harness: keep changes scoped, update the wiki, run checks, preserve the overlay model, and avoid committing local runtime state.

TinyPi also includes a wiki curator skill:

```text
agent/skills/wiki-curator/
```

It teaches the agent how to maintain local wiki memory in the Karpathy-style LLM Wiki pattern while keeping public repository docs separate from private runtime memory.

## Development Checks

```bash
npm test
```

This runs the tiny tool shim parser checks, terse protocol helper checks, deterministic tool router checks, public wiki frontmatter/index checks, memory wiki lint checks, and deterministic `tight-learning` core checks.

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
