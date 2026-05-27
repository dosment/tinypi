# TinyPi Install Portability Fix Plan

> **For Hermes:** Use `subagent-driven-development` to implement this plan task-by-task. Preserve unrelated dirty working-tree changes.

**Goal:** Make TinyPi install cleanly on arbitrary macOS/Linux `pi.dev` setups without developer-specific paths, destructive overwrites, or hidden local assumptions.

**Architecture:** Keep TinyPi as an overlay. The installer copies or symlinks **TinyPi-owned files only**, preserves existing user `pi` config/state, installs npm dependencies into `~/.pi/agent/npm`, and verifies extension loading from a temporary install. Runtime imports must be package-relative, never hardcoded to `/Users/example/...` or another developer-local path.

**Tech Stack:** Node/npm, ESM scripts, TypeScript TinyPi extensions, `pi.dev` agent runtime, macOS/Linux shell environments.

---

## Non-Negotiables

- **Overlay only:** TinyPi must not fork, replace, or globally mutate upstream `pi.dev` runtime files outside TinyPi-owned paths.
- **No destructive overwrites:** Existing user auth, sessions, plans, memory, model state, and unrelated settings must survive install.
- **Portable paths:** No `/Users/example/...`, repo-absolute imports, or assumptions about where the source repo lives.
- **Temp-install verification:** Verification must prove a clean install works from an isolated target, not just a developer's live `~/.pi`.
- **TinyPi-owned scope:** Installer may manage only the files/directories explicitly owned by TinyPi.

## Target Layout

Default install target:

```text
~/.pi/agent/
├── AGENTS.md                  # TinyPi-owned
├── settings.json              # merge/preserve strategy required
├── extensions/                # TinyPi-owned extension files
├── skills/                    # TinyPi-owned shipped skills
├── tests/                     # TinyPi-owned tests
├── wiki/                      # TinyPi-owned public docs
├── memory/wiki/               # user/runtime memory; create if missing, never replace
└── npm/                       # TinyPi-owned npm package + dependencies
```

Override target for tests/users:

```bash
PI_CODING_AGENT_DIR=/tmp/tinypi-install-test npm run install:local
```

## Files Likely In Scope

- `scripts/install-local.mjs`
- `scripts/verify-installable.mjs`
- `package.json`
- `package-lock.json`
- `agent/npm/package.json`
- `agent/npm/package-lock.json`
- `agent/extensions/**/*.ts`
- `agent/extensions/lib/**/*.js`
- `agent/wiki/**/*.md`
- `README.md`

## Acceptance Criteria

- `npm run verify` passes.
- `npm test` passes.
- A temp install into a nonexistent directory succeeds.
- A second install into the same temp directory succeeds without deleting local memory or unrelated files.
- Runtime extension imports resolve from the installed package layout.
- `grep`/scan finds no hardcoded developer-local paths in runtime code or install scripts.
- Documentation explains install target, overlay behavior, preservation rules, and temp verification.

---

## Implementation Tasks

### Task 1: Audit installer-owned paths

**Objective:** Identify exactly what the installer currently writes, overwrites, symlinks, or assumes.

**Files:**
- Read: `scripts/install-local.mjs`
- Read: `scripts/verify-installable.mjs`
- Read: `README.md`

**Steps:**
1. Read `scripts/install-local.mjs` and list every source-to-target copy/symlink.
2. Mark each target as one of:
   - TinyPi-owned and safe to replace
   - User-owned and must preserve
   - Shared config and must merge/backup
3. Check whether `PI_CODING_AGENT_DIR` is respected consistently.
4. Record any hardcoded absolute paths or assumptions.

**Verification:**

```bash
grep -R "/Users/example\|/home/example" scripts agent/extensions package.json README.md
```

Expected: no runtime/install dependency on developer-local paths. Documentation references are acceptable only if clearly labeled as examples.

---

### Task 2: Define TinyPi-owned install manifest

**Objective:** Make the installer's file ownership explicit and auditable.

**Files:**
- Modify: `scripts/install-local.mjs`

**Steps:**
1. Add a manifest object/array for TinyPi-owned install entries.
2. Include source path, target path, and mode: `copy` or `symlink`.
3. Keep user-owned runtime paths out of the replaceable manifest.
4. Ensure target paths are resolved relative to `PI_CODING_AGENT_DIR` or `~/.pi/agent`.

**Verification:**

```bash
node scripts/install-local.mjs --help 2>/dev/null || true
npm run verify
```

Expected: install script still loads; verify still passes.

---

### Task 3: Preserve existing user state

**Objective:** Prevent install from deleting or replacing local runtime data.

**Files:**
- Modify: `scripts/install-local.mjs`

**Preserve paths:**

```text
auth/
sessions/
plans/
memory/
models/
logs/
.env
*.local.*
```

**Steps:**
1. Ensure installer creates `memory/wiki/` only when missing.
2. Ensure installer never recursively deletes the install root.
3. If cleanup is needed, delete/replace only manifest-owned files.
4. For existing non-TinyPi files under shared directories, leave them alone.

**Verification:**

```bash
rm -rf /tmp/tinypi-preserve-test
mkdir -p /tmp/tinypi-preserve-test/{memory/wiki,sessions,plans}
printf 'keep me\n' > /tmp/tinypi-preserve-test/memory/wiki/local.md
printf 'keep me\n' > /tmp/tinypi-preserve-test/sessions/session.json
PI_CODING_AGENT_DIR=/tmp/tinypi-preserve-test npm run install:local
test -f /tmp/tinypi-preserve-test/memory/wiki/local.md
test -f /tmp/tinypi-preserve-test/sessions/session.json
```

Expected: both `test -f` checks pass.

---

### Task 4: Make `settings.json` safe

**Objective:** Avoid clobbering an existing user `settings.json`.

**Files:**
- Modify: `scripts/install-local.mjs`
- Possibly modify: `agent/settings.json`

**Steps:**
1. If no target `settings.json` exists, install TinyPi's default.
2. If target `settings.json` exists, merge TinyPi-required extension/tool settings without deleting unknown user keys.
3. If merge is too risky, write `settings.tinypi.json` and document manual opt-in.
4. Keep formatting stable enough for readable diffs.

**Verification:**

```bash
rm -rf /tmp/tinypi-settings-test
mkdir -p /tmp/tinypi-settings-test
printf '{"userSetting":true}\n' > /tmp/tinypi-settings-test/settings.json
PI_CODING_AGENT_DIR=/tmp/tinypi-settings-test npm run install:local
node -e 'const s=require("/tmp/tinypi-settings-test/settings.json"); if (s.userSetting !== true) process.exit(1)'
```

Expected: user key remains present.

---

### Task 5: Install npm deps into target npm package

**Objective:** Ensure TinyPi dependencies are installed under the target agent npm directory, not the source repo or global npm space.

**Files:**
- Modify: `scripts/install-local.mjs`
- Verify: `agent/npm/package.json`
- Verify: `agent/npm/package-lock.json`

**Steps:**
1. Copy `agent/npm/package.json` and `agent/npm/package-lock.json` into `<target>/npm/`.
2. Run npm install/ci with working directory `<target>/npm/`.
3. Do not copy source `node_modules`.
4. Keep root repo `npm install` separate from target runtime npm install.

**Verification:**

```bash
rm -rf /tmp/tinypi-npm-test
PI_CODING_AGENT_DIR=/tmp/tinypi-npm-test npm run install:local
test -f /tmp/tinypi-npm-test/npm/package.json
test -d /tmp/tinypi-npm-test/npm/node_modules
```

Expected: target npm package exists and has installed dependencies.

---

### Task 6: Remove hardcoded runtime imports

**Objective:** Make extensions load from the installed package-relative layout.

**Files:**
- Modify: `agent/extensions/**/*.ts`
- Modify: `agent/extensions/lib/**/*.js` only if needed

**Steps:**
1. Search for absolute path imports and repo-root assumptions.
2. Replace them with relative imports from the extension file location.
3. Keep `.js` import suffixes where ESM requires them.
4. Avoid importing from `agent/memory/wiki/` or other ignored local-only paths.

**Verification:**

```bash
grep -R "/Users/example\|/Users/\|/home/" agent/extensions scripts || true
npm test
```

Expected: no hardcoded runtime path dependencies; tests pass.

---

### Task 7: Add temp-install smoke verification

**Objective:** Prove TinyPi loads from a clean temporary install.

**Files:**
- Modify: `scripts/verify-installable.mjs`
- Possibly modify: `package.json`

**Steps:**
1. Add or document a verify mode that installs into a temp directory.
2. Run TinyPi's installed test commands from `<temp>/npm`.
3. If `pi` binary is available, run an offline extension-list/model-list smoke check.
4. Clean up temp directory unless a debug flag requests preservation.

**Verification:**

```bash
npm run verify
```

Expected: verify includes installability checks and fails loudly on missing install-owned files.

Optional deeper smoke:

```bash
PI_CODING_AGENT_DIR=/tmp/tinypi-install-test npm run install:local
PI_CODING_AGENT_DIR=/tmp/tinypi-install-test PI_OFFLINE=1 /tmp/tinypi-install-test/npm/node_modules/.bin/pi --list-models tiny-tools
npm --prefix /tmp/tinypi-install-test/npm run test:tiny-tool-shim
```

---

### Task 8: Document install behavior

**Objective:** Make portability and preservation rules obvious to future users/contributors.

**Files:**
- Modify: `README.md`
- Possibly create: `docs/install.md`

**Steps:**
1. Document default install target and `PI_CODING_AGENT_DIR` override.
2. Explain copy vs symlink modes.
3. List preserved user-owned paths.
4. Explain temp install verification.
5. State that TinyPi is an overlay, not a `pi.dev` fork.

**Verification:**

```bash
grep -n "PI_CODING_AGENT_DIR\|overlay\|preserve\|symlink" README.md
```

Expected: install docs are discoverable from README.

---

### Task 9: Final portability check

**Objective:** Verify the whole change set behaves like a portable installer.

**Commands:**

```bash
npm run verify
npm test
rm -rf /tmp/tinypi-final-test
PI_CODING_AGENT_DIR=/tmp/tinypi-final-test npm run install:local
PI_CODING_AGENT_DIR=/tmp/tinypi-final-test npm run install:local
npm --prefix /tmp/tinypi-final-test/npm run test:tiny-tool-shim
grep -R "/Users/example\|/Users/\|/home/" scripts agent/extensions package.json README.md || true
```

**Expected:**
- Verify passes.
- Tests pass.
- First and second temp installs pass.
- Target npm tests pass.
- Any absolute path hits are docs/examples only, not runtime/import/install dependencies.

---

## Risks and Guardrails

- **Risk:** Over-preserving stale TinyPi-owned files can leave old extension code installed.
  - **Guardrail:** Replace only manifest-owned files/directories deterministically.
- **Risk:** Merging `settings.json` incorrectly could break user config.
  - **Guardrail:** Preserve unknown keys; consider writing a TinyPi sidecar config if merge semantics are unclear.
- **Risk:** Verification passes on one developer's machine but fails elsewhere.
  - **Guardrail:** Temp install must use a fresh target and package-relative imports.
- **Risk:** Symlink mode hides missing copy/install behavior.
  - **Guardrail:** Always test plain copy mode before release.

## Suggested Commit Sequence

1. `docs: add TinyPi install portability plan`
2. `refactor: define TinyPi installer ownership manifest`
3. `fix: preserve user state during TinyPi install`
4. `fix: make TinyPi settings install non-destructive`
5. `fix: install TinyPi npm deps into target agent dir`
6. `fix: remove developer-local TinyPi runtime paths`
7. `test: add TinyPi temp install verification`
8. `docs: document portable TinyPi install flow`
