# Tight Ask User Extension

Structured clarification tool for tiny models.

Location:

```txt
~/.pi/agent/extensions/tight-ask-user.ts
```

## Purpose

`tight-ask-user` gives small/local models a safe way to ask the user for missing information instead of guessing.

Tiny models often make bad assumptions when requirements are incomplete. This tool constrains clarification to one short multiple-choice question with 2–4 options.

## Tool

### `ask_user`

Ask one structured question.

Model-facing rule:

```txt
Ask one short structured question instead of guessing; 2-4 options.
```

Parameters:

```ts
{
  question: string,
  options: Array<{
    label: string,
    description?: string
  }>,
  allowCustom?: boolean // default true
}
```

Limits:

- one question per call
- 2–4 options
- short labels
- optional custom user answer
- no free-form multi-question wandering

## Tiny Model Policy

Use `ask_user` when required information is missing and guessing could cause wrong work.

Good uses:

- choosing between incompatible implementation approaches
- asking for missing credentials/environment choice without exposing secrets
- confirming destructive or broad direction changes
- choosing user preference when repo evidence is insufficient

Avoid using it for:

- trivial choices that repo evidence answers
- questions where a safe default exists
- multi-step planning conversations
- repeating the same question after the user already answered, cancelled, or said no action is needed
- asking the user to do the model's investigation work

## Example

```json
{
  "question": "Which memory scope should this apply to?",
  "options": [
    { "label": "Project", "description": "Only this repo/workspace" },
    { "label": "Global", "description": "All pi sessions" }
  ]
}
```

## Behavior

In interactive mode, Pi shows a small selectable UI.

The user can:

- choose an option
- type a custom answer if `allowCustom` is true
- cancel

In non-interactive mode, the tool returns a compact prompt describing the needed user input.

If a model repeats the exact same question after the user has already answered or cancelled it in the same session, `ask_user` blocks the repeat and returns the prior response so the model can continue instead of looping.

## Why This Helps Tiny Models

Tiny models are more prone to confident guessing. A bounded clarification tool gives them an explicit escape hatch while keeping the tool schema simple enough to use reliably.
