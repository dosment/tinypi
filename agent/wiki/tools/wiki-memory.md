---
title: Wiki Memory Extension
type: tool-reference
status: public
audience: tiny-model, maintainer
tags:
  - tinypi
  - wiki
  - memory
updated: 2026-05-27
---

# Wiki Memory Extension

Long-term Markdown memory for pi, designed for tiny models.

Location:

```txt
~/.pi/agent/extensions/wiki-memory.ts
```

## Purpose

`wiki-memory` gives pi a local-first LLM wiki for durable memory.

It is designed for small models by avoiding vague hidden memory and large context dumps. The model searches a small Markdown wiki, reads only relevant pages or sections, and can save durable memories only after user approval.

Use the `wiki-curator` skill for larger curation work such as source ingest, index upkeep, drift cleanup, or Karpathy-style LLM Wiki maintenance.

## Memory Location

Local runtime memory:

```txt
~/.pi/agent/memory/wiki/
```

The `scope` parameter remains accepted for compatibility, but all scopes resolve to this single local memory wiki. This avoids duplicate project/global memory trees for the tiny-model harness.

The repository also ships public reference docs in `~/.pi/agent/wiki/`. Those docs are not used for private memory writes.

Local memory pages are created automatically:

```txt
index.md
preferences.md
decisions.md
workflows.md
facts.md
glossary.md
inbox.md
log.jsonl
```

## Tools

### `wiki_search`

Search long-term memory.

Use before answering about:

- user preferences
- prior decisions
- workflows
- architecture
- project history
- durable facts

Parameters:

```ts
{
  query: string,
  scope?: "project" | "global" | "both" // default both
}
```

Behavior:

- deterministic Markdown scan
- one canonical result set
- returns top matching sections/snippets
- does not dump the whole wiki

### `wiki_read`

Read one wiki page or section.

Parameters:

```ts
{
  path: string,
  section?: string,
  scope?: "project" | "global" | "both"
}
```

Behavior:

- reads a specific page
- optionally reads only a heading section
- caps output to avoid context bloat

### `wiki_lint`

Read-only mechanical checker for wiki health.

For local memory, checks for duplicate headings, oversized pages/sections, missing `Type:` or `Source:`, duplicate long lines, and overgrown inbox.

For the shipped public wiki, checks required Obsidian-style frontmatter, allowed page types, `updated` date shape, and whether every public page is listed in `agent/wiki/index.md`.

Parameters:

```ts
{
  scope?: "project" | "global" | "both",
  target?: "memory" | "public" | "all"
}
```

### `wiki_review`

Read-only drift candidate finder.

Looks for stale wording, duplicate topics, and simple contradiction candidates. It never edits files.

Parameters:

```ts
{
  scope?: "project" | "global" | "both"
}
```

### `wiki_remember`

Propose saving durable memory.

Parameters:

```ts
{
  text: string,
  kind?: "preference" | "decision" | "fact" | "workflow" | "project" | "note",
  scope?: "project" | "global",
  source?: string
}
```

Behavior:

- asks the user for confirmation before writing
- writes to the appropriate Markdown page
- appends an audit entry to local `log.jsonl`
- automatically lints local memory after the write and warns only if non-low issues appear

## Tiny Model Policy

The intended model behavior is:

```txt
1. Use wiki_search before answering about preferences, decisions, workflows, architecture, project history, or durable facts.
2. Search first; do not read the whole wiki.
3. Use wiki_read only for the relevant page or section.
4. Never write memory silently.
5. Use wiki_remember only for durable facts, preferences, decisions, workflows, or project notes.
6. Do not save temporary task details.
7. Use wiki_lint to check mechanical wiki health.
8. Use wiki_review to find drift candidates; candidates are not proven facts.
```

## Context Reminder

The extension injects a short reminder before each model call:

```txt
Memory policy: use wiki_search before answering about user preferences, prior decisions, workflows, architecture, project history, or durable facts. Search first, then wiki_read only specific pages/sections. Never write memory silently; use wiki_remember only with user approval.
```

This is intentionally short so tiny models see the rule without receiving the whole wiki.

## Why Markdown Wiki?

For tiny models, Markdown wiki memory is usually better than opaque vector memory because it is:

- deterministic
- inspectable
- editable
- grep-friendly
- low token usage
- easy to back up
- easy to delete or correct

Embeddings can be added later, but deterministic file search is the safest MVP.

## Example Calls

Search memory:

```json
{
  "query": "tool design preferences tiny models"
}
```

Read a page:

```json
{
  "path": "preferences.md"
}
```

Read a section:

```json
{
  "path": "decisions.md",
  "section": "Tight Web Extension"
}
```

Remember a global preference:

```json
{
  "text": "Dan prefers short, directive tool descriptions for 2B-14B models.",
  "kind": "preference",
  "scope": "global"
}
```

Remember a project decision:

```json
{
  "text": "The pi harness should expose compact web tools by default and store full content separately.",
  "kind": "decision",
  "scope": "project"
}
```
