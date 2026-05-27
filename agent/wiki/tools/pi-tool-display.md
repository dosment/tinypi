---
title: pi-tool-display
type: tool-reference
status: public
audience: tiny-model, maintainer
tags:
  - tinypi
  - tool-display
  - tui
updated: 2026-05-27
---

# pi-tool-display

Installed package for compact tool rendering in pi.

Package:

```txt
npm:pi-tool-display
```

Config:

```txt
~/.pi/agent/extensions/pi-tool-display/config.json
```

## Why We Added It

`pi-tool-display` helps tiny-model workflows by reducing visual/tool-output clutter without adding reasoning burden to the model.

It keeps built-in tool calls compact by default, improves edit/write diff display, and makes the TUI easier for humans to inspect during small-model sessions.

## Current Policy

Use compact rendering defaults:

- hide read output in collapsed display
- hide grep/find/ls output in collapsed display
- collapse bash output
- show compact edit/write diffs
- keep debug logging disabled

This is a UI aid, not a model-facing reasoning tool.

## Installed Settings

```json
{
  "readOutputMode": "hidden",
  "searchOutputMode": "hidden",
  "mcpOutputMode": "hidden",
  "bashOutputMode": "opencode",
  "bashCollapsedLines": 10,
  "diffViewMode": "auto",
  "diffIndicatorMode": "bars",
  "diffCollapsedLines": 24,
  "enableNativeUserMessageBox": true
}
```

## Commands

Useful commands provided by the package:

```txt
/tool-display show
/tool-display reset
/tool-display preset opencode
/tool-display preset balanced
/tool-display preset verbose
```

For tiny models, prefer the `opencode` preset or similarly compact settings.
