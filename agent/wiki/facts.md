# Facts


## 2026-05-27 — tiny-tool-shim parser smoke tests

Type: project
Source: user-request

Added a dependency-free smoke-test loop for `tiny-tool-shim`.

Files added:

- `agent/extensions/tiny-tool-shim-parser.js`: shared parser/normalizer module.
- `agent/extensions/tiny-tool-shim-parser.d.ts`: TypeScript declarations for the shared parser.
- `agent/tests/tiny-tool-shim-parser.test.mjs`: Node-based parser fixture tests.

Files updated:

- `agent/extensions/tiny-tool-shim.ts`: imports the shared parser instead of keeping parser logic inline.
- `agent/npm/package.json`: adds `npm run test:tiny-tool-shim`.
- `agent/extensions/tiny-tool-shim.md` and `agent/wiki/tools/tiny-tool-shim.md`: document the smoke-test command.

Verification:

```bash
cd ~/.pi/agent/npm
npm run test:tiny-tool-shim
```

Expected result: `tiny-tool-shim parser smoke tests passed (13 checks)`.


## 2026-05-27 — tight-planning extension

Type: project
Source: user-request

Added `tight-planning`, a Claude Code-like planning extension for the tiny-model harness.

Implementation:

- `agent/extensions/tight-planning.ts`: registers `/planning` plus `plan_create`, `plan_read`, `plan_update`, and `plan_complete`.
- `agent/extensions/tight-planning.md`: extension docs.
- `agent/wiki/tools/tight-planning.md`: wiki tool docs.

Behavior:

- `/planning` toggles read-only planning mode.
- `/planning on`, `off`, `status`, `execute`, and `clear` manage the mode and active plan.
- Active plan file is `~/.pi/agent/plans/active.md`.
- Planning mode blocks `edit` and `write`, and restricts `bash` to read-only inspection commands.
- Planning tools stay active outside explicit planning mode so the model can auto-use plans for broad, risky, multi-step, or ambiguous work.

Verification:

```bash
PI_OFFLINE=1 ./agent/npm/node_modules/.bin/pi --extension agent/extensions/tight-planning.ts --list-models tiny-tools
```


## 2026-05-27 — wiki consolidation

Type: project
Source: user-request

Consolidated durable memory into a single canonical wiki:

```text
~/.pi/agent/wiki/
```

Changes:

- Removed the duplicate root workspace wiki at `/Users/dan/.pi/wiki/`.
- Updated `agent/extensions/wiki-memory.ts` so `project`, `global`, and `both` scopes all resolve to `~/.pi/agent/wiki/`.
- Updated `agent/extensions/wiki-memory.md` and `agent/wiki/tools/wiki-memory.md` to document one canonical wiki location.

Reason:

The root `wiki/` only contained default stub pages, while `agent/wiki/` contained the substantive harness memory and tool documentation. Keeping one wiki avoids drift and duplicate memory trees.


## 2026-05-27 — TinyPi repository model

Type: decision
Source: user-request

TinyPi should be a standalone overlay repository for pi.dev rather than a fork of pi.dev.

Intended relationship:

```text
pi.dev = upstream CLI/app/runtime
TinyPi = tiny-model extension layer and harness policy
```

Normal users should not need to clone pi.dev. They should install pi normally, then clone/install TinyPi as an overlay. A future `install:local` script should copy or symlink TinyPi extensions, wiki tool docs, and npm package metadata into `~/.pi/agent/`.

Fork pi.dev only if TinyPi needs changes that cannot be done through extensions, such as missing lifecycle hooks, provider streaming changes, tool validation changes, or upstream TUI behavior.

Documented in root `README.md`.


## 2026-05-27 — TinyPi local installer

Type: project
Source: user-request

Added an installable repo flow for TinyPi.

Files:

- `package.json`: root TinyPi package with `install:local`, `install:local:symlink`, `test`, and `verify` scripts.
- `package-lock.json`: root npm lockfile.
- `scripts/install-local.mjs`: installs TinyPi into `~/.pi/agent` or `PI_CODING_AGENT_DIR`.
- `scripts/verify-installable.mjs`: checks required installable repo files exist.
- `README.md`: documents prerequisites, install commands, verification, and overlay model.

Installer behavior:

- Copies or symlinks `AGENTS.md`, `settings.json`, `extensions/`, `wiki/`, and `tests/`.
- Copies `agent/npm/package.json` and `agent/npm/package-lock.json`.
- Runs `npm install` inside the target pi npm directory.
- Does not install auth, sessions, plans, binaries, or `node_modules`.

Verification used:

```bash
npm run verify
npm test
PI_CODING_AGENT_DIR=/private/tmp/tinypi-install-test npm run install:local
PI_CODING_AGENT_DIR=/private/tmp/tinypi-install-test PI_OFFLINE=1 ./agent/npm/node_modules/.bin/pi --list-models tiny-tools
npm --prefix /private/tmp/tinypi-install-test/npm run test:tiny-tool-shim
```


## 2026-05-27 — tinypi-maintainer skill

Type: project
Source: user-request

Added `tinypi-maintainer`, an installable skill for maintaining the TinyPi harness repo.

Files:

- `agent/skills/tinypi-maintainer/SKILL.md`: maintainer workflow for scoped edits, wiki updates, validation, installer awareness, and secret-safe git hygiene.
- `agent/skills/tinypi-maintainer/agents/openai.yaml`: UI metadata for the skill.

Installer updates:

- `scripts/install-local.mjs` now installs `agent/skills/`.
- `scripts/verify-installable.mjs` verifies the maintainer skill exists.
- `README.md` documents the skill.


## 2026-05-27 — tight-learning extension

Type: project
Source: user-request

Added `tight-learning`, a self-learning loop for TinyPi.

Files:

- `agent/extensions/tight-learning.ts`: registers `/learn` plus `learn_capture`, `learn_review`, `learn_apply`, and `learn_reject`.
- `agent/extensions/tight-learning.json`: default learning autonomy config.
- `agent/extensions/tight-learning.md`: extension docs.
- `agent/wiki/tools/tight-learning.md`: wiki tool docs.

Behavior:

- Captures durable learnings into `~/.pi/agent/learning/inbox.jsonl`.
- Applies accepted memory/workflow/preference learnings into `~/.pi/agent/wiki/`.
- Promotes accepted skill candidates into `~/.pi/agent/skills/<skill-name>/SKILL.md`.
- Defaults to `approve` mode.
- Supports opt-in autonomy modes: `suggest`, `approve`, `auto-memory`, `auto-safe`, and `auto`.
- Shows pending learning count in the TUI status area, notifies after capture/auto-apply, and reminds after agent turns when pending learnings need review.


## 2026-05-27 — tight-learning core tests

Type: project
Source: user-request

Added focused tests for deterministic `tight-learning` behavior.

Files:

- `agent/extensions/tight-learning-core.js`: shared helper module for learning config defaults, text normalization, slugging, autonomy decisions, path allow/deny checks, wiki block formatting, and skill Markdown rendering.
- `agent/tests/tight-learning-core.test.mjs`: Node-based smoke tests for the helper behavior.

Files updated:

- `agent/extensions/tight-learning.ts`: imports shared deterministic helpers.
- `agent/npm/package.json`: adds `test:tight-learning` and a combined `test` script.
- `package.json`: root `npm test` now runs all agent npm tests.
- `scripts/verify-installable.mjs`: verifies the new learning test is part of the installable repo.

Verification:

```bash
npm test
```


## 2026-05-27 — terse protocol for tiny-tool-shim

Type: project
Source: user-request

Added a "terse protocol" implementation for TinyPi's tiny model provider.

Design:

- Use structured semantic compression instead of "caveman" style.
- Preserve constraints, negations, source ids, paths, ids, error text, and missing-info behavior.
- Lightly compact history and tool results before sending them to local tiny models.
- Keep the behavior configurable through `tiny-tool-shim.json`.

Files:

- `agent/extensions/tiny-protocol-core.js`: deterministic terse protocol and context compaction helpers.
- `agent/extensions/tiny-protocol-core.d.ts`: TypeScript declarations for the helper module.
- `agent/tests/tiny-protocol-core.test.mjs`: smoke tests for compaction and protocol rules.

Files updated:

- `agent/extensions/tiny-tool-shim.ts`: injects terse protocol rules and light context compression into the tiny-tools provider prompt path.
- `agent/extensions/tiny-tool-shim.json`: enables `terseProtocol: "terse"` and `contextCompression: "light"` by default.
- `agent/npm/package.json`: includes the tiny protocol test in `npm test`.
- `scripts/verify-installable.mjs`: verifies the helper and tests are part of the installable repo.
- `README.md` and `agent/wiki/tools/tiny-tool-shim.md`: document the feature and config.

Verification:

```bash
npm test
```
