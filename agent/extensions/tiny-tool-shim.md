# Tiny Tool Shim for pi

`tiny-tool-shim` is a pi extension that makes small/local models better at using tools.

It is intended for models like Gemma, small Qwen/Coder models, and other Ollama/OpenAI-compatible local models that may not reliably support provider-native function calling.

## Files

```text
~/.pi/agent/extensions/tiny-tool-shim.ts      # extension implementation
~/.pi/agent/extensions/tiny-tool-shim.json    # configuration
~/.pi/agent/extensions/lib/tiny-protocol-core.js  # terse protocol helpers
~/.pi/agent/extensions/tiny-tool-shim.md      # this document
```

## Provider

The extension registers a new pi provider:

```text
tiny-tools
```

Example models discovered on this machine:

```text
tiny-tools/gemma4:e2b-mlx
tiny-tools/gemma4:e4b-mlx
tiny-tools/qwen3.5:9b-mlx
```

List available models with:

```bash
pi --list-models tiny-tools
```

Start pi with one of them:

```bash
pi --model tiny-tools/gemma4:e4b-mlx
```

TinyPi's tool router automatically keeps the active tool set small. You normally do not need to pass `--tools` manually.

## Why this exists

pi normally expects a provider/model to emit structured tool calls. Many tiny local models instead output plain text such as:

```text
I should read the file.
{"tool":"read","arguments":{"path":"README.md"}}
```

Without a shim, pi treats that as assistant text, not as a real tool call.

`tiny-tool-shim` sits at the provider streaming layer and translates model text into native pi tool calls.

## Protocol given to the model

The model is instructed to output exactly one JSON object and no markdown.

TinyPi also adds a terse protocol block by default. This is not "caveman" style and should not flatten the assistant's personality. It is structured semantic compression:

- use natural user-facing prose
- be warm, specific, and a little fuller when explaining decisions or outcomes
- preserve constraints, negations, source ids, paths, ids, and errors
- say `MISSING` when information is unavailable
- do not guess beyond context
- use structured output when requested

To call a tool:

```json
{"tool":"read","arguments":{"path":"README.md"}}
```

To answer finally:

```json
{"final":"your answer"}
```

Final-answer tone is part of the protocol. User-facing discussion should read like a capable teammate: conversational, lightly warm, specific about what changed or why it matters, and not clipped into one-line status output unless the task is trivial.

Rules enforced/promoted by the shim:

- One tool call per assistant response.
- Tool name must exist in pi's active tools.
- `arguments` must be a JSON object.
- Arguments are validated against the actual pi tool schema.
- Tool output is compacted/truncated for tiny-model context stability.

## How it works

Flow:

```text
user prompt
  ↓
pi context + active tool schemas
  ↓
tiny-tool-shim prompt
  ↓
local OpenAI-compatible model
  ↓
JSON extraction / light repair / validation
  ↓
real pi toolCall block
  ↓
normal pi tool execution
```

The extension uses pi's existing tool validation, so once a JSON tool call is converted, normal pi execution handles the rest.

## Configuration

Edit:

```text
~/.pi/agent/extensions/tiny-tool-shim.json
```

Current example:

```json
{
  "baseUrl": "http://localhost:11434/v1",
  "apiKey": "ollama",
  "models": [
    "gemma4:e2b-mlx",
    "gemma4:e4b-mlx",
    "qwen3:4b",
    "qwen2.5-coder:3b",
    "qwen2.5-coder:7b"
  ],
  "discoverModels": true,
  "contextWindow": 131072,
  "maxTokens": 2048,
  "repairAttempts": 1,
  "maxToolResultChars": 6000,
  "maxHistoryChars": 24000,
  "maxSchemaChars": 14000,
  "allowTextFinal": true,
  "terseProtocol": "terse",
  "contextCompression": "light"
}
```

### Options

| Option | Meaning |
|---|---|
| `baseUrl` | OpenAI-compatible endpoint. Default is Ollama-style `http://localhost:11434/v1`. |
| `apiKey` | API key sent as Bearer token. Ollama accepts dummy values like `ollama`. |
| `models` | Fallback model IDs if discovery is disabled or unavailable. |
| `discoverModels` | If true, calls `/models` on `baseUrl` and registers discovered models. |
| `contextWindow` | Context size reported to pi. |
| `maxTokens` | Max output tokens reported/requested. |
| `repairAttempts` | Number of internal JSON repair retries. Recommended: `1`. |
| `maxToolResultChars` | Max chars from each tool result included in the next model call. |
| `maxHistoryChars` | Max chars of conversation history sent to the tiny model. |
| `maxSchemaChars` | Max chars of tool schema descriptions sent to the tiny model. |
| `allowTextFinal` | If parsing fails, allow raw text as final output instead of hard failing. |
| `terseProtocol` | `off`, `terse`, or `strict`. Adds compact model-facing rules while preserving constraints and missing-info behavior. |
| `contextCompression` | `off` or `light`. `light` compacts tool/history text while prioritizing constraints, source ids, paths, errors, and status lines. |

After editing config, restart pi or run:

```text
/reload
```

## Smoke Tests

The parser/normalizer lives in:

```text
~/.pi/agent/extensions/lib/tiny-tool-shim-parser.js
~/.pi/agent/extensions/lib/tiny-protocol-core.js
```

Run the dependency-free smoke tests with:

```bash
cd ~/.pi/agent/npm
npm test
```

The tests cover common tiny-model output shapes plus terse protocol/context compression helper behavior.

## Recommended practices for tiny models

### 1. Let the router keep active tools small

Avoid enabling every tool manually. The router exposes code, web, memory, planning, and learning tools only when the prompt calls for them.

### 2. Prefer inspection before edits

Tiny models should usually call `read`, `ls`, or `grep` before editing.

### 3. Avoid huge tool outputs

Large outputs confuse small models. The shim truncates tool results, but prompts should still ask for narrow searches and specific files.

### 4. Use one-step tasks

Instead of:

```text
Refactor this entire app.
```

Prefer:

```text
Read src/foo.ts and suggest the smallest safe edit.
```

### 5. Add `bash` only when necessary

`bash` is powerful and noisy. For tiny models, it is often better to start read-only and add shell access deliberately.

## Troubleshooting

### Model answers with raw JSON

That is expected in some cases. If the JSON is a final answer, the shim extracts the `final` field. If you see raw JSON in the UI, the model may have produced malformed or unexpected JSON.

### Tool call fails validation

pi will return a tool error to the model. The next turn gives the model a chance to correct the call.

Common causes:

- Wrong argument name.
- Path omitted.
- `edit` shape is incorrect.
- Tool not active via `--tools`.

### No tiny-tools models appear

Check local endpoint:

```bash
curl http://localhost:11434/v1/models
```

Then list pi models:

```bash
pi --list-models tiny-tools
```

If needed, set `discoverModels` to `false` and list exact model IDs in config.

## Design note

This is intentionally not a `tool_call` event hook. pi's `tool_call` events happen after pi already has a structured tool call. Tiny models often fail before that by producing JSON as text. Therefore the shim is implemented as a custom provider `streamSimple` layer, where text can be converted into real pi `toolCall` blocks.
