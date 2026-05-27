---
title: Tight Web Extension
type: tool-reference
status: public
audience: tiny-model, maintainer
tags:
  - tinypi
  - web
  - retrieval
updated: 2026-05-27
---

# Tight Web Extension

Small-model wrapper for `pi-web-access`.

Location:

```txt
~/.pi/agent/extensions/tight-web.ts
```

## Purpose

`tight-web` exposes a minimal, fail-safe web tool surface for small models, especially 2B–14B local models.

It keeps the powerful `pi-web-access` backend, but replaces the verbose model-facing tool descriptions with short, directive tools that are easier for small models to operate.

## Design Goals

- Keep tool descriptions short.
- Prefer safe defaults.
- Avoid optional-parameter wandering.
- Return compact Markdown by default.
- Store full content for later retrieval.
- Make the model search before fetching pages.
- Encourage fetching only the best 1–2 URLs.

## Exposed Tools

### `web_search`

Searches the web.

Small-model instruction:

```txt
Search web with 1-3 specific queries; prefer official sources.
```

Parameters:

```ts
{
  query?: string,
  queries?: string[], // max 3 used
  numResults?: number, // default 5, max 8
  provider?: "auto" | "exa" | "perplexity" | "gemini"
}
```

Recommended model behavior:

1. Use one specific query for simple tasks.
2. Use 2–3 varied queries only for broader research.
3. Prefer official sources.
4. Do not fetch page contents unless search results are insufficient.

### `fetch_content`

Fetches URL content and returns Markdown.

Small-model instruction:

```txt
Fetch a URL as compact Markdown. Use defaults. Use full only for exact/full text.
```

Parameters:

```ts
{
  url?: string,
  urls?: string[],
  format?: "compact" | "full", // default compact
  maxChars?: number
}
```

Default behavior:

- `format: "compact"`
- compact Markdown output
- full extracted content stored internally
- response includes a `responseId`

Recommended model behavior:

1. Fetch only after a URL is known.
2. Usually pass only `{ url }`.
3. Fetch only 1–2 best URLs.
4. Use `format: "full"` only when the user needs exact text, full source, or quotes.

### `get_search_content`

Retrieves stored full content from previous `web_search` or `fetch_content` calls.

Small-model instruction:

```txt
Retrieve stored full web content by responseId only when needed.
```

Parameters:

```ts
{
  responseId: string,
  queryIndex?: number,
  urlIndex?: number,
  maxChars?: number
}
```

Recommended model behavior:

Use only when compact/search output was not enough.

## Backend

`tight-web` imports and reuses these modules from `pi-web-access`:

- `gemini-search.ts`
- `extract.ts`
- `compact-markdown.ts`
- `storage.ts`

This means the wrapper still benefits from the existing backend capabilities:

- Exa / Perplexity / Gemini search
- URL extraction
- Readability extraction
- GitHub extraction
- PDF/video support where the backend supports it
- stored result retrieval

## Compact Markdown

`fetch_content` defaults to compact Markdown.

The compactor:

- removes noisy image links
- simplifies links
- strips tracking parameters
- removes common boilerplate
- deduplicates repeated headings/lines
- truncates large tables
- truncates large code blocks
- enforces an inline character budget

Full extracted content is still stored unchanged.

## Tiny Model Rules

The intended model policy is:

```txt
1. If current web info is needed, call web_search.
2. Use 1 specific query unless broader research is needed.
3. If page details are needed, call fetch_content on 1-2 best URLs.
4. Use fetch_content defaults.
5. Do not use format="full" unless exact/full text is required.
6. Use get_search_content only if compact output was insufficient.
```

## Active Tool Behavior

On `session_start`, the extension:

- restores stored web results from session history

The tool router exposes `web_search`, `fetch_content`, and `get_search_content` only for web/search requests or stored-content follow-ups.

## Why Not Replace `pi-web-access`?

A separate full rewrite would duplicate too much functionality.

`tight-web` is intentionally a wrapper:

- small model surface area
- existing robust backend
- easier maintenance
- minimal risk

## Example Calls

Simple search:

```json
{
  "query": "Python 3.14 release date official"
}
```

Broader search:

```json
{
  "queries": [
    "Node.js 24 LTS schedule official",
    "Node.js 24 release plan GitHub",
    "Node.js release working group schedule 24"
  ]
}
```

Fetch compact page content:

```json
{
  "url": "https://example.com/article"
}
```

Fetch full page content only when necessary:

```json
{
  "url": "https://example.com/article",
  "format": "full"
}
```

Retrieve stored full content:

```json
{
  "responseId": "abc123",
  "urlIndex": 0
}
```
