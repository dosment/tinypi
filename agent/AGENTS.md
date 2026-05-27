# Global Pi Instructions

## Memory Policy

Use the wiki as the source of long-term memory.

Before answering questions about user preferences, prior decisions, project conventions, workflows, architecture, history, or durable facts, call `wiki_search`.

Do not rely on vague remembered conversation context when wiki tools are available.

Do not write memory silently. Use `wiki_remember` only for durable facts, preferences, decisions, workflows, or project notes, and only with user approval.

Do not read the whole wiki. Search first, then use `wiki_read` only for the relevant page or section.

For ordinary one-off coding tasks, do not call the wiki unless memory is relevant.

## Tool Policy

TinyPi uses an automatic tool router. Keep active tools narrow and let the router expose code, web, memory, planning, or learning tools based on the user's request.

`/planning` is the only TinyPi slash command. Use plain-language requests for learning review, memory work, web research, and configuration checks.
