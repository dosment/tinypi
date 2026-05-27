---
title: Tight Learning Extension
type: tool-reference
status: public
audience: tiny-model, maintainer
tags:
  - tinypi
  - learning
  - memory
updated: 2026-05-27
---

# Tight Learning Extension

TinyPi self-learning loop for tiny models.

Location:

```text
~/.pi/agent/extensions/tight-learning.ts
~/.pi/agent/extensions/lib/tight-learning-core.js
```

## Purpose

`tight-learning` lets TinyPi capture durable lessons from experience, review them, and promote them into wiki memory or skills.

The design is inspired by Hermes-style self-improvement, but constrained for tiny models:

- capture observations
- propose durable changes
- require approval by default
- allow explicit opt-in silent application
- keep all learning inspectable and versionable

## User Interface

`tight-learning` has no slash command. TinyPi's tool router exposes learning tools only when the user asks in plain language, such as `review pending learnings` or `set learning mode to auto-memory`.

## Tools

- `learn_capture`: capture a durable lesson or skill candidate.
- `learn_review`: list pending learnings, report learning mode, or set mode when explicitly requested.
- `learn_apply`: apply a pending learning.
- `learn_reject`: reject a pending learning.

## Storage

```text
~/.pi/agent/learning/inbox.jsonl
~/.pi/agent/learning/accepted.jsonl
~/.pi/agent/learning/rejected.jsonl
```

Applied wiki learnings write to local memory at `~/.pi/agent/memory/wiki/`.

Applied skill candidates write to `~/.pi/agent/skills/<skill-name>/SKILL.md`.

After applying a wiki learning, TinyPi lints the affected local memory page and only warns the user when non-low issues appear.

## Notifications

Captured learnings are visible in three places:

- the `learn_capture` tool result
- a TUI notification after capture or auto-apply
- a footer/status indicator like `learn 3` when pending learnings exist

After agent turns, TinyPi also reminds the user when learnings are pending review. The reminder is throttled to avoid repeated noise.

## Autonomy Modes

```text
suggest      capture only; never apply
approve      default; ask before durable writes
auto-memory  auto-apply wiki/preference/workflow/note learnings
auto-safe    auto-apply memory plus test fixture candidates
auto         auto-apply all allowed learning kinds
```

Use learning only for durable patterns, not temporary task details.

## Verification

The extension keeps deterministic mode, path guard, wiki formatting, and skill rendering helpers in `tight-learning-core.js` so they can be tested without launching a Pi runtime.

Run:

```bash
npm test
```

The learning-specific suite is:

```bash
cd agent/npm
npm run test:tight-learning
```
