---
name: tinypi-maintainer
description: Maintain the TinyPi harness repository. Use when changing TinyPi extensions, installer scripts, package metadata, repo docs, wiki memory, tiny-model harness behavior, planning/learning flows, or GitHub release-ready project state. Applies to tasks in the tinypi repo that need scoped edits, validation, wiki updates, and protection of local runtime state.
---

# TinyPi Maintainer

## Workflow

1. Inspect the relevant files before editing. Prefer `rg` and targeted reads.
2. Keep changes scoped to the requested TinyPi behavior. Avoid unrelated refactors.
3. Preserve the overlay model: TinyPi sits on top of pi.dev and should avoid pi core changes unless extension APIs are insufficient.
4. Update durable memory/docs for meaningful changes:
   - `agent/memory/wiki/facts.md` for implemented project facts.
   - `agent/memory/wiki/workflows.md` for roadmap/workflow changes.
   - `agent/memory/wiki/log.jsonl` for local audit entries.
   - `agent/wiki/tools/*.md` for public tool or extension docs.
   - Never commit `agent/memory/`; it is local runtime memory.
5. Run focused checks:
   - `npm run verify`
   - `npm test`
   - If extension loading changed: `PI_OFFLINE=1 ./agent/npm/node_modules/.bin/pi --extension agent/extensions/<file>.ts --list-models tiny-tools`
   - If installer changed: test with `PI_CODING_AGENT_DIR=/private/tmp/tinypi-install-test npm run install:local`
6. Before commit or push, check staged files and scan for secrets.

## Files To Protect

Never commit local runtime state:

```text
agent/auth.json
agent/sessions/
agent/plans/
agent/npm/node_modules/
agent/bin/
```

Dummy local-model values like `apiKey: "ollama"` are acceptable.

## Installer Rules

The user-facing install path should remain:

```bash
git clone https://github.com/dosment/tinypi.git
cd tinypi
npm install
npm run install:local
```

If adding repo content that users need, update:

- `scripts/install-local.mjs`
- `scripts/verify-installable.mjs`
- `README.md`

## Tiny-Model Design Rules

- Keep model-facing tool schemas small.
- Prefer deterministic parsers, compact prompts, and explicit guardrails.
- Do not rely on tiny models to infer hidden state.
- For durable learning or memory, propose first and require user approval before writes.
- If `tight-learning` autonomy is enabled, respect its configured mode and path/kind allowlists.
- Keep active tools narrow when possible.

## Git Checklist

Before committing:

```bash
git status --short --ignored
git diff --cached --name-only
git grep --cached -n -E 'eyJ|refresh|access_token|OPENAI_API_KEY|ANTHROPIC_API_KEY|BEGIN (RSA|OPENSSH|PRIVATE)|rt_[A-Za-z0-9_-]+'
```

If the grep finds only benign docs/config such as `apiKey: "ollama"`, proceed.
