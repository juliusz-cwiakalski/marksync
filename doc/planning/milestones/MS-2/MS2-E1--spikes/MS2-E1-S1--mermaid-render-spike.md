---
id: MS2-E1-S1
title: "mermaid-render-spike"
status: todo
type: spike
priority: critical
epic: MS2-E1
milestone: MS-0002
estimate: 1d
gh_issue: GH-11
feature_spec: doc/spec/features/feature-mermaid-rendering.md
decisions: [ADR-0001, ADR-0002]
dependencies: { blocks: [MS2-E4-S1], blocked_by: [] }
cross_cutting: [R-FEA-1, A-FEA-1]
---

# MS2-E1-S1 — Mermaid headless-render spike

## Goal
Prove the official Mermaid library renders **deterministically** in-process (happy-dom + Bun) **without Chromium**, so ADR-0001 (TypeScript) and ADR-0002 Part B hold.

## Background & why this is load-bearing
ADR-0001 chose TypeScript+Bun specifically to run the **official** Mermaid library in-process and ship a single binary. ADR-0002 Part B is **spike-gated**: in-process jsdom rendering is NOT accepted as the production renderer until this spike proves byte-stable cross-OS SVG with no hidden Chromium dependency. **Failure modes & consequences** (per ADR-0002, blueprint §0):
- **PASS** → proceed to MS2-E4-S1 (full in-process rendering).
- **Partial fail** (deterministic but needs a shim) → record the shim; proceed if single-binary promise holds.
- **Fail (needs Chromium)** → MS-0002 falls back to ADR-0002 ladder rung 7 (`code` policy — preserve code block); full render moves to MS-0003. This does **not** block MS-0002.
- **Catastrophic fail** (no deterministic path at all) → escalate: language-level reconsideration (ADR-0001). CEO records a decision; do NOT silently proceed.

## Hypotheses (H) & stop criteria
- **H1 (determinism):** same Mermaid source + config → byte-identical **normalized** SVG across ≥2 runs in the same OS. (Cross-OS is a stronger bar; record same-OS first, cross-OS as stretch.)
- **H2 (no Chromium):** `mermaid.render()` runs under happy-dom with **no** Puppeteer/Chromium process spawned. Verify via process listing + absence of `puppeteer`/`playwright` in the dependency tree.
- **H3 (Bun single-binary compat):** the render path runs under the Bun runtime (not just Node). `bun run` executes the spike.
- **H4 (fidelity):** representative diagrams (flowchart `graph TD`, sequence `sequenceDiagram`, class `classDiagram`, state, gantt) render to non-empty, well-formed SVG containing expected node labels.
- **H5 (security defaults):** `securityLevel: "strict"` + `htmlLabels: false` + `deterministicIds: true` are accepted by the lib and the output contains no `<script>`, no `javascript:` URIs, no inline event handlers.

## Methodology (exact steps)
1. Create a **standalone** spike workspace under `spikes/mermaid-render/` (gitignored artifacts only; code+findings committed). Do NOT modify the main `src/` tree.
2. `package.json` with `mermaid` (latest 11.x), `happy-dom`, `@happy-dom/global-registrator`. Bun runtime.
3. `render.ts`: register happy-dom global, `mermaid.initialize({ startOnLoad:false, securityLevel:"strict", htmlLabels:false, deterministicIds:true, fontFamily:"..." })`, then `await mermaid.render("id", source)` for each fixture.
4. **Fixtures:** `fixtures/{flowchart,sequence,class,state,gantt}.mmd` + at least one **adversarial** fixture (XSS payload `<img src=x onerror=alert(1)>` inside a node label; a `<script>` injection attempt).
5. **Determinism probe:** render each fixture **N=5** times; normalize SVG (strip comments, sort attributes deterministically, drop ephemeral IDs if any); assert byte-identical within the run. Persist normalized SVG to `fixtures/*.expected.svg`.
6. **Chromium-absence probe:** assert `puppeteer`/`playwright`/`chromium` are absent from `bun pm ls` output and no chrome process appears during render.
7. **Security probe:** assert adversarial fixtures produce SVG with zero `<script>` tags, zero `onerror`/`onload`/`javascript:` substrings.

## Deliverables
- `spikes/mermaid-render/` (code + fixtures + normalized SVGs).
- `findings/mermaid-render-spike-findings.md` (committed; structure: Summary H1–H5 PASS/FAIL with evidence pointers; Forced ADR updates; Recommendation for MS2-E4-S1).
- If PASS: a **golden SVG fixture pair** (source + normalized SVG) reusable by E4-S1 and the golden test tier.
- Update ADR-0002 Part B status (Proposed → spike-validated) and the blueprint.

## Acceptance criteria (testable)
- [ ] H1 documented: 5/5 repeats produce byte-identical normalized SVG per fixture (same OS). Cross-OS result recorded (PASS/known-delta).
- [ ] H2 documented: no Chromium/Puppeteer dependency; no chrome process during render.
- [ ] H3 documented: `bun run` executes the spike end-to-end.
- [ ] H4 documented: all 5 diagram types render non-empty well-formed SVG with expected labels.
- [ ] H5 documented: adversarial fixtures yield zero `<script>`/event-handler/`javascript:` in output; `securityLevel:"strict"` confirmed active.
- [ ] Findings doc written with explicit PASS/FAIL per hypothesis + a clear MS-0002 recommendation (proceed to E4-S1 in-process, OR `code` fallback).
- [ ] No secrets in any committed artifact.

## Out of scope
- Wiring Mermaid into the real `src/infra/mermaid/renderer.ts` (that is MS2-E4-S1).
- The content-hash attachment naming (defined in blueprint §6; implemented in E4-S1).
- PNG output, Kroki/mmdc fallbacks (ADR-0002 ladder; only relevant if H2 fails).
- Cross-OS determinism is a **stretch goal**; same-OS determinism is the gate.

## Risks / open questions (CEO-resolved)
- **R1:** Mermaid may emit non-deterministic element IDs even with `deterministicIds:true`. → Mitigation: deterministic post-normalization of the SVG before comparison; record the normalization rules so E4-S1 reuses them.
- **Q1 (CEO decides if H1 fails on cross-OS but passes same-OS):** proceed with in-process render using a per-OS cache key in the hash input (blueprint §6 already includes `rendererVersion`/`fontPolicy`). Recorded as accepted assumption.
