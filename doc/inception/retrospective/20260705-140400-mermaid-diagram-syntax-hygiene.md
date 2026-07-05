---
status: Draft
created: 2026-07-05T14:04:00Z
phase_scope: phase-3
topic: Mermaid diagram syntax hygiene
outcome: improve
---

# Retrospective — Mermaid diagram syntax hygiene

## What happened

The architecture overview contained two Mermaid diagrams with syntax errors
that broke rendering on GitHub:

1. **Container diagram (C4 L2):** node labels used `\n` for line breaks
   inside unquoted labels (e.g., `Bin[MarkSync single binary\nBun build
   --compile\nTypeScript]`). Mermaid's parser does not interpret `\n` as a
   newline inside unquoted labels — it renders the literal characters.

2. **Push-flow diagram:** node labels contained parentheses inside unquoted
   square brackets (e.g., `L[Upload assets (hash-named, deduped)]`). Mermaid
   interprets `(` as the start of a round node shape, causing a parse error:
   "Expecting 'SQE', 'DOUBLECIRCLEEND', ... got 'PS'".

The owner caught both issues in PR review. The fix was:
- Replace `\n` with `<br/>` inside double-quoted labels.
- Wrap all labels containing special characters in double quotes.

## What went well

- The owner caught the rendering failure in PR review before merge.
- The fix was straightforward (quote labels, use `<br/>`).
- Both diagrams render correctly after the fix.

## What went wrong

- The diagrams were not visually verified after being written — the AI wrote
  Mermaid syntax from memory without checking the rendered output.
- The `\n` convention works in some Mermaid contexts but not in unquoted node
  labels — this is a common pitfall.
- Parentheses in unquoted labels are a known Mermaid parse-error trigger that
  the AI did not avoid.

## Lesson

**Mermaid diagram syntax rules for MarkSync docs:**

1. **Always quote node labels** with double quotes when they contain any
   special characters: parentheses, brackets, slashes, colons, etc.
   - Bad: `A[Upload assets (hash-named, deduped)]`
   - Good: `A["Upload assets (hash-named, deduped)"]`

2. **Use `<br/>` for line breaks** inside labels, not `\n`.
   - Bad: `Bin[Single binary\nTypeScript]`
   - Good: `Bin["Single binary<br/>TypeScript"]`

3. **Visually verify rendering** after writing a Mermaid diagram — either in
   a local Markdown previewer or by pushing and checking the GitHub render.

4. **Keep diagrams simple** — complex node labels with multiple special
   characters are a parse-error magnet. If a label needs more than a few
   words, consider splitting the node or using a note.

## Future guardrail

Before committing a document with Mermaid diagrams:

```bash
# Check for unquoted labels with special characters
rg '\[.*[()].*\]' --type md doc/ | grep -v '"'
```

If any results contain parentheses in unquoted labels, quote them.
