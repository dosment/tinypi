# Karpathy LLM Wiki Pattern

Source: https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f

## Pattern

Karpathy describes an LLM-maintained wiki as a persistent compiled knowledge artifact, not ordinary RAG. Instead of repeatedly retrieving raw chunks and synthesizing from scratch, the agent incrementally builds a markdown wiki that accumulates summaries, links, contradictions, and synthesized pages.

## Layers

- Raw sources: immutable source-of-truth material supplied or curated by the human.
- Wiki: mutable markdown pages maintained by the LLM.
- Schema: instructions such as AGENTS.md or skills that define conventions and workflows.

## Operations

- Ingest: read a source, discuss key points with the user, write or update summaries, entity/topic pages, index entries, and log entries.
- Query: search/read the wiki, synthesize an answer with evidence, and optionally file useful answers back into the wiki.
- Lint: check contradictions, stale claims, orphan pages, missing links, important missing pages, and data gaps.

## TinyPi Adaptation

TinyPi uses local memory at `~/.pi/agent/memory/wiki/` for the mutable wiki and public docs at `~/.pi/agent/wiki/` for shipped reference material.

Tiny models need smaller operations:

- search before read
- one page or section at a time
- compact entries
- explicit source labels
- approval before writes
- tool-generated formatting where possible

## Practical Heuristic

Treat the wiki like code:

- make small diffs
- keep conventions consistent
- maintain an index
- preserve an audit trail
- run lint/review checks
- do not mix private runtime memory into shipped repository docs
