# Tight Learning Extension

TinyPi self-learning loop for tiny models.

Location:

```text
~/.pi/agent/extensions/tight-learning.ts
```

## Purpose

`tight-learning` lets TinyPi capture durable lessons from experience, review them, and promote them into wiki memory or skills.

The design is inspired by Hermes-style self-improvement, but constrained for tiny models:

- capture observations
- propose durable changes
- require approval by default
- allow explicit opt-in silent application
- keep all learning inspectable and versionable

## Commands

```text
/learn status
/learn review
/learn mode suggest
/learn mode approve
/learn mode auto-memory
/learn mode auto-safe
/learn mode auto
```

## Tools

- `learn_capture`: capture a durable lesson, workflow, preference, note, test fixture candidate, or skill candidate.
- `learn_review`: list pending captured learnings.
- `learn_apply`: apply a pending learning. In `approve` mode, this asks the user before writing.
- `learn_reject`: reject a pending learning and write an audit record.

## Storage

```text
~/.pi/agent/learning/inbox.jsonl
~/.pi/agent/learning/accepted.jsonl
~/.pi/agent/learning/rejected.jsonl
```

Applied wiki learnings write to `~/.pi/agent/wiki/`.

Applied skill candidates write to `~/.pi/agent/skills/<skill-name>/SKILL.md`.

## Autonomy Modes

```text
suggest      capture only; never apply
approve      default; ask before durable writes
auto-memory  auto-apply wiki/preference/workflow/note learnings
auto-safe    auto-apply memory plus test fixture candidates
auto         auto-apply all allowed learning kinds
```

Configuration:

```text
~/.pi/agent/extensions/tight-learning.json
```

Use learning only for durable patterns, not temporary task details.
