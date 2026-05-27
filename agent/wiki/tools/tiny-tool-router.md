---
title: Tiny Tool Router
type: tool-reference
status: public
audience: tiny-model, maintainer
tags:
  - tinypi
  - router
  - tools
updated: 2026-05-27
---

# Tiny Tool Router

Automatic active-tool selection for tiny models.

Location:

```text
~/.pi/agent/extensions/tiny-tool-router.ts
~/.pi/agent/extensions/lib/tiny-tool-router-core.js
```

## Purpose

`tiny-tool-router` keeps the tiny model's prompt small by exposing only the tools that match the current request.

It has no slash command. It runs before each agent turn, classifies the user's prompt, and calls `pi.setActiveTools` with a compact bundle.

## Bundles

- `base`: `ask_user`
- `code`: file/code tools such as `read`, `grep`, `ls`, `bash`, `edit`, `write`
- `web`: `web_search`, `fetch_content`
- `memory`: `wiki_search`, `wiki_read`, `wiki_remember`
- `planning`: `plan_create`, `plan_read`, `plan_update`
- `learning`: `learn_capture`, `learn_review`, `learn_apply`, `learn_reject`

Maintenance tools such as `wiki_lint`, `wiki_review`, `get_search_content`, and `plan_complete` are only enabled for prompts that mention those workflows.

Explicit `/planning` mode overrides the router and keeps the read-only planning tool set active.

## Verification

Router classification lives in `tiny-tool-router-core.js` so it can be tested without launching Pi.

Run:

```bash
cd ~/.pi/agent/npm
npm run test:tiny-tool-router
```
