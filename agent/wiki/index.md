# TinyPi Built-In Wiki

This directory contains public TinyPi reference docs that ship with the repository.

User and project memory is local-only and lives at:

```text
~/.pi/agent/memory/wiki/
```

Runtime memory files are intentionally not committed to GitHub.

## Tool Documentation

- `tools/tiny-tool-shim.md`: tiny/local model tool-calling shim.
- `tools/tight-web.md`: small-model web access wrapper and compact fetch policy.
- `tools/wiki-memory.md`: Markdown wiki memory, linting, and drift review.
- `tools/tight-ask-user.md`: structured clarification tool for tiny models.
- `tools/pi-tool-display.md`: compact TUI rendering for built-in tool calls and diffs.
- `tools/tight-planning.md`: tiny-model planning mode and Markdown-backed active plan.
- `tools/tight-learning.md`: self-learning inbox, approval flow, and skill promotion.
