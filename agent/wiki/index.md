---
title: TinyPi Built-In Wiki
type: index
status: public
audience: tiny-model, maintainer, user
tags:
  - tinypi
  - wiki
  - public-docs
updated: 2026-05-27
---

# TinyPi Built-In Wiki

This directory contains public TinyPi reference docs that ship with the repository.

User and project memory is local-only and lives at:

```text
~/.pi/agent/memory/wiki/
```

Runtime memory files are intentionally not committed to GitHub.

## Page Metadata

Public wiki pages use Obsidian-style YAML frontmatter:

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

Keep frontmatter compact and factual. Do not store private user memory in public page metadata. `npm run verify` and `wiki_lint` with `target: "public"` validate this metadata and ensure every shipped page appears in this index.

## Tool Documentation

- `tools/tiny-tool-shim.md`: tiny/local model tool-calling shim.
- `tools/tiny-tool-router.md`: automatic active-tool selection for tiny models.
- `tools/tight-web.md`: small-model web access wrapper and compact fetch policy.
- `tools/wiki-memory.md`: Markdown wiki memory, linting, and drift review.
- `tools/tight-ask-user.md`: structured clarification tool for tiny models.
- `tools/pi-tool-display.md`: compact TUI rendering for built-in tool calls and diffs.
- `tools/tight-planning.md`: tiny-model planning mode and Markdown-backed active plan.
- `tools/tight-learning.md`: self-learning inbox, approval flow, and skill promotion.
