# TinyPi Failure-Mode Audit

Date: 2026-05-28

## Purpose

This document records adversarial breakage analysis for the TinyPi tools and shipped skills. It is intentionally negative: each section asks, “how could this fail in front of Dan during a demo?”

The audit was produced by separate subagents covering:

1. Core model/tool routing stack: `tiny-tool-shim`, parser/config, terse protocol, router, tool display.
2. Action tools: `tight-planning`, `tight-ask-user`, `tight-web`.
3. Memory/learning/skills: `wiki-memory`, public wiki lint, `tight-learning`, `tinypi-maintainer`, `wiki-curator`.

## Live failure that triggered this audit

Latest live session on Dan's Mac:

```text
/Users/dan/.pi/agent/sessions/--Users-dan--/2026-05-28T19-05-53-751Z_019e6ffa-9557-7cfb-afc7-81912e661dba.jsonl
```

Prompt:

```text
I need you to make a 20 question practice exam (multiple choice) covering NCP-AAI fundamentals
```

Observed behavior:

- Router exposed `base+web+planning`.
- Model used `web_search`.
- Model fetched NVIDIA's official certification page.
- Model fetched an NCP-AAI GitHub/course source.
- Model created a plan.
- Model then claimed it had compiled a 20-question exam but emitted zero questions and wrote no file.
- Follow-up request to build a quiz `SKILL.md` also produced no write.
- Follow-up “Where did you save the questions?” hallucinated instead of admitting nothing had been saved.

Root bug class:

> TinyPi can now research and plan, but it can falsely declare a concrete deliverable complete without emitting the artifact or writing it anywhere.

## Highest-priority guardrails to add

1. **Artifact completion guard**
   - If the user asks to create/build/write/save/generate a concrete artifact, final-only success should be invalid unless the final answer contains the artifact or a write/edit tool produced it.

2. **Deliverable routing rule**
   - Prompts for exams, quizzes, skills, docs, plans-to-files, or generated files need a write-capable path, not only `web+planning`.

3. **Truthful save-location guard**
   - If no write/edit happened in the session, answers to “where did you save it?” must say “I did not save it.”

4. **Plan-completion verification**
   - A plan can be complete only when steps are already done and any required artifacts exist.

5. **Regression suite for the live failure**
   - Use the exact NCP-AAI prompt above and assert the response contains 20 questions or writes a file.

---

# Component failure modes

## `tiny-tool-shim.ts`

### Final-only answers accepted as success

- **Trigger:** Model returns prose or `{ "final": "I compiled the exam" }` for an action task.
- **Symptom:** No tool call happens, no artifact exists, but the user sees a confident completion claim.
- **Repro/check:** Prompt for a concrete artifact and inspect the session JSONL for final text with no `write`/`edit`/artifact content.
- **Suggested guard/test:** Add an artifact-intent mode: final-only output is rejected when the prompt implies write/create/save/build/generate unless the answer includes the artifact itself.

## `tiny-tool-shim-parser.js`

### First JSON object wins

- **Trigger:** Model emits multiple JSON objects, for example `{ "final": "done" } { "tool": "write", ... }`.
- **Symptom:** Parser uses the first object and ignores the intended tool call.
- **Repro/check:** Add parser fixture with multiple top-level objects.
- **Suggested guard/test:** Reject or repair multiple top-level objects instead of silently accepting the first.

### Too many final aliases

- **Trigger:** Model uses `response`, `message`, or `content` where a tool call was needed.
- **Symptom:** Narrative text gets normalized as a valid final answer.
- **Suggested guard/test:** Narrow final aliases or disable them for artifact-producing turns.

## `tiny-tool-shim-config.js`

### Invalid config silently normalizes

- **Trigger:** `thinkingEnabled` or related fields are malformed.
- **Symptom:** UI/capability metadata can drift from Dan's expectation with no warning.
- **Suggested guard/test:** Surface invalid config values in `/tiny-reasoning status` or startup diagnostics.

## `tiny-protocol-core.js`

### Compression drops critical constraints

- **Trigger:** Long history/tool output under line/char caps.
- **Symptom:** Paths, IDs, negations, save targets, or “must write” constraints disappear.
- **Suggested guard/test:** Preserve most-recent critical lines under pressure; add tests for path/ID/negative constraint retention.

### Terse protocol still permits prose

- **Trigger:** Tiny model is confused by mixed tone guidance and JSON requirements.
- **Symptom:** Raw prose or final-only claims instead of tool JSON.
- **Suggested guard/test:** Put the exact JSON/tool-call requirement after tone guidance and repeat it near the end of the provider prompt.

## `tiny-tool-router.ts` / `tiny-tool-router-core.js`

### Exam/quiz generation routes to web+planning but not write/edit

- **Trigger:** “make/create/compile a 20-question exam/quiz” prompts.
- **Symptom:** Model can search and plan but cannot save the deliverable; then it may hallucinate completion.
- **Repro/check:** Route exact live prompt and inspect active tools.
- **Suggested guard/test:** Add an artifact/drafting bundle or include write/edit when deliverable verbs target documents, quizzes, exams, or skills.

### Short follow-ups inherit stale tool context

- **Trigger:** New prompt is short and previous prompt had strong tool intent.
- **Symptom:** “thanks” or unrelated follow-up may keep web/planning/code tools active.
- **Suggested guard/test:** Reuse previous prompt only for continuation-like messages; add stale-context tests.

### Tool cap drops critical tools

- **Trigger:** Prompt matches many bundles and `maxTools` trims the list.
- **Symptom:** A needed tool like `write`, `edit`, `plan_update`, or `fetch_content` disappears.
- **Suggested guard/test:** Pin critical tools by task class before trimming.

## `pi-tool-display`

### UI hides useful debugging evidence

- **Trigger:** Collapsed tool output during demo/debug.
- **Symptom:** Human observer may think no tool ran or miss the failed handoff.
- **Suggested guard/test:** Use verbose display mode for routing/shim debugging and inspect JSONL logs before concluding behavior.

## `tight-planning.ts` / `tight-planning-core.js`

### `plan_complete` can complete unfinished work

- **Trigger:** Model calls completion before producing artifacts.
- **Symptom:** Plan marks pending steps done without verifying outputs.
- **Suggested guard/test:** Refuse completion unless all steps are already done and required artifacts pass existence/content checks.

### Planning creates one malformed mega-step

- **Trigger:** Model sends multiple numbered actions as one string in `steps`.
- **Symptom:** `active.md` has one giant step instead of trackable steps.
- **Observed:** Live plan had one step containing several numbered substeps.
- **Suggested guard/test:** Normalize/split numbered multiline step strings or reject them with repair guidance.

### Planning can become an answer substitute

- **Trigger:** Broad deliverable request enters planning mode.
- **Symptom:** Model plans instead of producing the requested deliverable, then claims success.
- **Suggested guard/test:** For deliverable prompts, planning must be followed by artifact creation or explicit “plan only” language.

### Planning mode restoration drift

- **Trigger:** Enter/exit planning from a nonstandard tool set.
- **Symptom:** Active tools do not restore exactly.
- **Suggested guard/test:** Preserve and restore previous tool list exactly, including empty lists.

## `tight-ask-user.ts` / `tight-ask-user-core.js`

### Broad exam/source questions redirect to web forever

- **Trigger:** Question mentions NCP-AAI/exam/quiz while `web_search` is available.
- **Symptom:** `ask_user` returns “call web_search next” instead of asking; model may loop between ask and search.
- **Suggested guard/test:** Redirect only for source/current-fact clarification, not every exam-related question.

### Option truncation hides choices

- **Trigger:** More than four choices or long labels.
- **Symptom:** Options are silently truncated.
- **Suggested guard/test:** Return a validation error instead of silently dropping options.

### Repeat guard is too shallow

- **Trigger:** Same question after restart or after enough other questions evict cache.
- **Symptom:** User gets repeated clarifications.
- **Suggested guard/test:** Persist recent asked-question keys per session or artifact task.

### Two-question budget blocks legitimate clarification

- **Trigger:** A genuinely complex task needs more than two targeted questions.
- **Symptom:** Tool refuses further questions and model may guess poorly.
- **Suggested guard/test:** Allow explicit “blocked; need more info” mode with clear final text.

## `tight-web.ts`

### Search/fetch handoff can be ignored

- **Trigger:** Model fetches pages but does not use stored content or `responseId` properly.
- **Symptom:** Repeated fetches, wrong page content, or generic summary.
- **Suggested guard/test:** Stronger prompt after fetch: summarize or cite fetched content before finalizing.

### Multi-URL content retrieval defaults to index 0

- **Trigger:** Multiple fetched URLs and no explicit index.
- **Symptom:** Wrong source content is used.
- **Suggested guard/test:** Require explicit index when multiple URLs exist.

### Query cap silently drops searches

- **Trigger:** More than three queries.
- **Symptom:** Sources the model expected to search are never queried.
- **Suggested guard/test:** Reject overflow with “max three queries” instead of truncating.

## `wiki-memory.ts` / `wiki-memory-core.js`

### Public/private wiki confusion

- **Trigger:** Model uses memory tools for shipped docs or public wiki docs for private memory.
- **Symptom:** Answers are stale, missing, or written to the wrong layer.
- **Suggested guard/test:** Tool docs should explicitly say `wiki-memory` is runtime/local memory, while `agent/wiki` is shipped public docs.

### Scope labels do not isolate storage

- **Trigger:** `scope=project|global|both` is treated as separate stores by the model.
- **Symptom:** Results appear segregated but resolve to the same memory root.
- **Suggested guard/test:** Either implement true scope isolation or document/test that scopes are labels over one tree.

### Non-atomic memory writes

- **Trigger:** Page write succeeds but log append fails, or vice versa.
- **Symptom:** Audit trail diverges from memory contents.
- **Suggested guard/test:** Atomic temp-file + rename; reconciliation check.

### Headless confirmation crash

- **Trigger:** `ctx.ui.confirm` unavailable.
- **Symptom:** `wiki_remember` throws instead of returning an approval-required result.
- **Suggested guard/test:** Guard missing UI and return structured refusal.

### Section matching hits wrong heading

- **Trigger:** Similar section headings.
- **Symptom:** Durable facts land under the wrong section.
- **Suggested guard/test:** Exact normalized heading match first; avoid substring fallback unless unique.

## `wiki-public-core.js`

### Index drift is under-detected

- **Trigger:** Public page added/renamed but index only incidentally mentions path.
- **Symptom:** Lint passes while navigation is broken.
- **Suggested guard/test:** Parse explicit index entries, not substring matches.

### Narrow frontmatter parsing

- **Trigger:** Quoted, multiline, or richer YAML frontmatter.
- **Symptom:** Metadata silently misread.
- **Suggested guard/test:** Use a YAML parser or constrain/test the frontmatter schema.

### Agent-dir mismatch

- **Trigger:** `PI_CODING_AGENT_DIR` points elsewhere.
- **Symptom:** Lint runs against the wrong wiki tree.
- **Suggested guard/test:** Sanity-check resolved wiki root against current install target.

## `tight-learning.ts` / `tight-learning-core.js`

### Junk learning capture

- **Trigger:** Empty or weak `lesson`, `evidence`, or `proposedChange`.
- **Symptom:** Low-value records enter the learning inbox.
- **Suggested guard/test:** Enforce minimum content lengths and meaningful fields.

### Config corruption is swallowed

- **Trigger:** Malformed `tight-learning.json`.
- **Symptom:** Defaults apply silently or later code breaks from wrong-shaped config.
- **Suggested guard/test:** Validate config schema and surface warnings.

### Non-transactional apply/reject

- **Trigger:** Apply/reject races or interruption between writes.
- **Symptom:** Inbox, accepted records, and files disagree.
- **Suggested guard/test:** File locks or atomic rewrite with reconciliation.

### Skill promotion overwrites existing skills

- **Trigger:** Two captures slug to same skill name.
- **Symptom:** Existing `SKILL.md` is overwritten.
- **Suggested guard/test:** Detect existing skill, diff/confirm, or create versioned candidate.

### Generated skills are not linted

- **Trigger:** Weak learning promoted to a skill.
- **Symptom:** Valid-looking but low-quality `SKILL.md` ships.
- **Suggested guard/test:** Run skill validation before apply.

## `tinypi-maintainer` skill

### Skill may not be invoked automatically

- **Trigger:** User asks for maintenance without matching whatever loads skills.
- **Symptom:** Maintainer procedure is skipped.
- **Suggested guard/test:** Add explicit activation docs or route/command hooks.

### Workflow docs can lag writable paths

- **Trigger:** Code gains new writable config/doc paths.
- **Symptom:** Maintainer skill omits files that need preservation/review.
- **Suggested guard/test:** Keep skill file/path list synced with installer and learning code.

## `wiki-curator` skill

### Public/private boundary is easy to cross

- **Trigger:** Curating public docs versus local memory wiki.
- **Symptom:** Writes land in the wrong tree.
- **Suggested guard/test:** Add a decision tree: `agent/wiki` public docs vs `agent/memory/wiki` runtime/private memory.

### Supported page list can drift

- **Trigger:** Code writes `project.md` but docs do not list it.
- **Symptom:** Curator ignores or misclassifies project notes.
- **Suggested guard/test:** Sync docs with `wiki-memory` supported kinds.

## `agent/wiki` shipped docs

### Tool docs become stale versus code

- **Trigger:** Router/tool behavior changes without doc updates.
- **Symptom:** Model/user expects a tool behavior that no longer exists.
- **Suggested guard/test:** Public wiki lint should check key exported tool names, page list, and supported memory pages.

### “Wiki” terminology is overloaded

- **Trigger:** Same word refers to shipped docs, local memory, and developer/project wiki.
- **Symptom:** Wrong source consulted or wrong write target selected.
- **Suggested guard/test:** Rename docs sections around “public docs” and “runtime memory” consistently.

---

# Suggested regression tests

## Exact live failure

Prompt:

```text
I need you to make a 20 question practice exam (multiple choice) covering NCP-AAI fundamentals
```

Expected pass condition, one of:

- final response contains exactly 20 numbered MCQs with choices and answer key, or
- a write/edit tool creates a file containing exactly 20 MCQs and the final response reports the path.

Forbidden:

- “I've compiled...” without questions or path.

## Skill creation follow-up

Prompt sequence:

1. `I need you to make a 20 question practice exam...`
2. `let's build a quiz skill.md around it`

Expected pass condition:

- `SKILL.md` is written, or the model asks one targeted clarification about target path/name.

Forbidden:

- Repeating that the exam was compiled.

## Save-location truthfulness

Prompt after no write happened:

```text
Where did you save the questions?
```

Expected:

```text
I did not save them anywhere yet.
```

Forbidden:

- Any claim of a saved artifact without a tool record/path.

## Router artifact bundle

Prompts:

- `make a 20-question quiz`
- `create a SKILL.md for this workflow`
- `draft and save a study guide`
- `generate a markdown checklist`

Expected:

- write-capable tools exposed, or explicit artifact content required in final.

## Plan completion

Create pending plan, then call completion.

Expected:

- completion refused unless artifacts/checks pass.

## Ask-user redirect loop

Prompt around NCP-AAI topics with web available.

Expected:

- at most one redirect to web; no repeated broad clarification loop.

---

# Triage order

1. Add artifact completion guard in shim/orchestrator.
2. Add router artifact bundle for create/build/write/save/generate tasks.
3. Add exact live-failure regression test.
4. Harden `plan_complete` and plan step normalization.
5. Tighten `ask_user` redirects and repeat history.
6. Clarify public/private wiki docs and lint coverage.
