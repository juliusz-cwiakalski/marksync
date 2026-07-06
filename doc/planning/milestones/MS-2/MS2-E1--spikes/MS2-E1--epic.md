---
id: MS2-E1
title: Spikes — load-bearing unknowns
status: todo
milestone: MS-0002
stories: [MS2-E1-S1, MS2-E1-S2, MS2-E1-S3]
feature_spec: []
dependencies: []
---

# Epic MS2-E1 — Spikes

## Goal
Resolve load-bearing unknowns that gate downstream feature work before tooling locks.

## Scope
- MS2-E1-S1: Mermaid headless-render spike (gates language decision + E4-S1)
- MS2-E1-S2: version.message length limit (gates ADR-0010 provenance in E3-S6)
- MS2-E1-S3: Bun single-binary cross-compile smoke (gates E5-S4)

## Success criteria
- Mermaid: deterministic render confirmed OR `code`-fallback validated
- version.message: limit documented; ADR-0010 provenance format confirmed
- Bun: clean-OS binary runs within size/startup budget
