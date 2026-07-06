# mermaid-render spike (GH-11 / MS2-E1-S1)

> **Stub — full run-book is finalized in Phase 9.**

This standalone spike validates whether the official `mermaid` library renders
**deterministically in-process** under Bun + happy-dom **without Chromium**,
producing five hypothesis verdicts (H1–H5) consumed by ADR-0002 Part B /
MS2-E4-S1. The deliverable is a findings document, not production code.

## Quick start (Bun only)

```bash
bun install     # materialize deps (creates bun.lock)
bun run render  # single smoke render under Bun
```

The complete run-book (all `probe:*` scripts, expected outputs, how to read the
findings, and the MS-0002 outcome routing) is finalized in Phase 9. See the
authoritative plan at
`doc/changes/2026-07/2026-07-06--GH-11--mermaid-render-spike/chg-GH-11-plan.md`.
