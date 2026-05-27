---
name: wiki-curator
description: Curate TinyPi local wiki memory. Use when ingesting durable sources, organizing or rewriting local memory pages, maintaining index/log conventions, running wiki_lint or wiki_review, handling wiki_search/wiki_read/wiki_remember workflows, or applying Karpathy-style LLM wiki practices to TinyPi's tiny-model memory layer.
---

# Wiki Curator

## Core Model

TinyPi uses two wiki layers:

- `~/.pi/agent/wiki/`: shipped public TinyPi reference docs. Do not store private memory here.
- `~/.pi/agent/memory/wiki/`: local runtime memory. This is the LLM-maintained wiki.

Follow Karpathy's LLM Wiki pattern: raw/source material is the source of truth, the wiki is a persistent compiled artifact, and the agent maintains structure, links, summaries, contradictions, index entries, and logs over time. For details, read `references/llm-wiki-pattern.md` when designing or revising wiki workflows.

## Tiny Model Rules

- Prefer `wiki_search`, `wiki_read`, `wiki_remember`, `wiki_lint`, and `wiki_review` over direct file edits.
- Keep entries short, factual, and source-labeled.
- Preserve caveats, dates, source names, contradictions, and uncertainty.
- Ask for approval before saving new memory.
- Do not save temporary task chatter.
- Do not bulk-read the whole wiki; search first, then read one page or section.

## Page Roles

- `index.md`: catalog of local memory pages with one-line summaries.
- `preferences.md`: durable user preferences.
- `decisions.md`: durable decisions and tradeoffs.
- `workflows.md`: reusable procedures.
- `facts.md`: stable project/user facts.
- `glossary.md`: terms and definitions.
- `inbox.md`: approved memories not yet curated.
- `log.jsonl`: append-only audit written by tools.

## Entry Shape

Use the tool-generated format when possible:

```md
## YYYY-MM-DD - kind

Type: kind
Source: source

Concise durable memory.
```

For manual curation, keep the same fields. Use `Source:` values like `user-approved`, `source-ingest:<name>`, `wiki-curation`, or `tight-learning`.

## Workflow

1. Search with `wiki_search` for related memory before adding or editing.
2. Read only the relevant page or section with `wiki_read`.
3. Decide if the new item is a preference, decision, fact, workflow, project note, glossary term, or inbox item.
4. Use `wiki_remember` for new durable memory whenever possible.
5. When curating manually, update `index.md` if page coverage changed.
6. Run `wiki_lint` after structural edits.
7. Run `wiki_review` periodically to find stale, duplicate, contradictory, orphaned, or under-linked memory.

## Ingest Pattern

When the user provides a durable source:

1. Identify source name, date, and reliability.
2. Extract stable claims, open questions, contradictions, and reusable workflows.
3. Save only durable distilled memory, not the whole source.
4. Prefer several small entries over one large blob.
5. If a synthesized answer becomes useful, ask whether to file it back into memory.

## Query Pattern

When answering from memory:

1. Search the local wiki.
2. Read relevant sections.
3. Answer with the specific memory basis.
4. If memory is missing or uncertain, say so.
5. If the answer creates a reusable synthesis, offer to save it.

## Public Repo Boundary

Repository changes may update `agent/wiki/tools/*.md` or `agent/wiki/index.md` as public docs. Private memory belongs under `agent/memory/wiki/` and is ignored by Git.

Public wiki pages should use compact Obsidian-style YAML frontmatter with:

```yaml
---
title: Page Title
type: index | tool-reference
status: public
audience: tiny-model, maintainer, user
tags:
  - tinypi
updated: YYYY-MM-DD
---
```

Do not place private user/project memory in public frontmatter.
