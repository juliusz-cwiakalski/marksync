---
id: MS2-E4
title: Features — Mermaid, attachments, provenance, repair
status: todo
milestone: MS-0002
stories: [MS2-E4-S1, MS2-E4-S2, MS2-E4-S3, MS2-E4-S4]
feature_spec: [doc/spec/features/feature-mermaid-rendering.md, doc/spec/features/feature-safe-publish.md]
dependencies: [MS2-E3-S6]
---

# Epic MS2-E4 — Features

## Goal
Deliver the user-facing features that make the safe publish pipeline useful:
Mermaid diagrams, attachments, provenance, and minimal repair.

## Scope
- MS2-E4-S1: Mermaid rendering (gated by E1-S1 spike)
- MS2-E4-S2: Attachments & images (content-hashed, reused)
- MS2-E4-S3: Provenance (visible panel + machine metadata)
- MS2-E4-S4: Minimal repair (repair-state, journal replay)

## Success criteria
- Mermaid: deterministic output; securityLevel strict; fallback validated
- Attachments: unchanged image → no re-upload
- Provenance: 100% managed pages have source + revision metadata
- Repair: stale lock recoverable without data loss

## Cross-cutting
- R-FEA-1 (Mermaid), NFR-SEC-5 (converter injection), R-USA-3 (repair)
