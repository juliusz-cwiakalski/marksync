---
id: MS2-E4-S1
title: "mermaid-rendering"
status: todo
type: story
priority: high
epic: MS2-E4
milestone: MS-0002
estimate: 3d
gh_issue: GH-25
feature_spec: doc/spec/features/feature-mermaid-rendering.md
decisions: [ADR-0001, ADR-0002]
dependencies: { blocks: [], blocked_by: [MS2-E1-S1, MS2-E3-S6] }
cross_cutting: [R-FEA-1, NFR-SEC-5, NFR-PRIV-2]
---

# MS2-E4-S1 — Mermaid rendering (in-process, content-hashed)

> **⚠️ RE-PLANNING REQUIRED (flagged by GH-11, 2026-07-06).** The MS2-E1-S1 spike
> returned a **PARTIAL** verdict that invalidates this story's core assumption
> ("in-process render via happy-dom + Bun per spike E1-S1"). See
> [`findings/mermaid-render-spike-findings.md`](../../../../../findings/mermaid-render-spike-findings.md).
> **happy-dom in-process is NOT viable as-is** (H4 FAIL 0/5: no SVG layout engine,
> `getBBox` returns zeros). This story must be re-scoped before delivery to choose
> one of: (1) **Chromium-based render** (`mmdc`/Puppeteer) — faithful but violates
> ADR-0001's single-binary/no-Chromium promise (owner decision); (2) **validated
> SVG-layout shim** (`svgdom` / canvas measured `getBBox`) — could preserve the
> no-Chromium path but is unvalidated and **needs a follow-up spike**; or
> (3) **accept the `code` policy as the MS-0002 default** and defer full rendering
> to a later milestone. The ADR-0001 revisit trigger is activated — an owner
> (CEO) decision is pending. Do not start delivery against the current scope.
>
> **✅ RESOLVED by CEO-DEC-1 (2026-07-13) — Option 3 chosen.** MS-0002 ships the
> `code` policy as the default per ADR-0002 rung 7; full in-process rendering
> deferred to MS-0003+. TypeScript/Bun locked in (ADR-0001 NOT revisited). The
> re-scoped delivery is **GH-25** (implemented, tested, `bun run check` green).
> This banner is preserved for history; see `chg-GH-25-spec.md` for the active
> scope.

## Goal
Production Mermaid rendering wired into the Markdown pipeline: detect ```` ```mermaid ```` fences, render to **deterministic SVG** via the official library in-process, sanitize, content-hash, attach to the page, and reuse unchanged diagrams (no re-upload). Fallback ladder with `code` policy as the MS-0002 floor. *(The "in-process via happy-dom" mechanism is blocked by the GH-11 spike outcome — see the re-planning banner above; the renderer path must be re-chosen.)*

## Background
Implements ADR-0002 Part B + the Mermaid feature spec. **Per GH-11 (2026-07-06), ADR-0002 Part B did NOT advance to `spike-validated`** — H4 (fidelity) FAILED because happy-dom/jsdom lack an SVG layout engine. The spike's determinism/security evidence and the two degenerate golden SVG fixtures (flowchart, gantt) plus the digest-normalization rules (esp. Rule 5: strip the gantt `today` line) remain reusable substrates **once a faithful render path is chosen**. Content-hash naming (blueprint §6) gives idempotency. **This story assumed the spike would PASS; it must be re-planned.**

## Detailed scope (deliverables)
1. **`src/domain/render/port.ts`** — the `Renderer` port: `render(source, opts): Result<Artifact, MarkSyncError>` where `Artifact={bytes; mime; hash}`.
2. **`src/infra/mermaid/renderer.ts`** — `MermaidRenderer` impl: load official `mermaid` once; `initialize({startOnLoad:false, securityLevel:"strict", htmlLabels:false, deterministicIds:true, fontFamily:<pinned>})`; render via happy-dom global registrant (`tests/mermaid.preload.ts` — now populated for real). Reuse the spike's normalization rules so output is byte-stable.
3. **`src/domain/mermaid/manager.ts`** — `MermaidArtifactManager`: compute the attachment identity per blueprint §6 hash formula; check `attachmentExists(pageId, hash)` (E3-S4 port) — if present, reuse; else render → sanitize → `uploadAttachment`. **Unchanged diagram → no re-upload** (idempotency).
4. **`src/infra/mermaid/sanitize.ts`** — SVG sanitizer: strip `<script>`, event handlers (`on*`), `javascript:` URIs, external `<use href>`/`xlink:href` to remote origins. Hard requirement (ADR-0002 Security Requirements, NFR-SEC-5).
5. **Pipeline hook** — the Markdown pipeline (E3-S3) detects ```` ```mermaid ```` fences; the sync engine (E3-S6) calls the manager to replace each fence with an `<ac:image><ri:attachment ri:filename="marksync-mermaid-<hash>.svg"/></ac:image>` reference in the Storage body before write.
6. **Fallback ladder (MS-0002 scope)** — policy `render` (default): try in-process; on `RenderUnavailable` → fall to `code` policy (emit the raw fence as a code block + warning). `mmdc`/Kroki rungs are documented but NOT wired in MS-0002 (deferred unless spike failed). Remote rendering stays OFF (NFR-PRIV-2).
7. **Golden fixtures** — the spike's normalized SVGs become the golden set; `tests/golden/mermaid/*.svg` byte-stable.

## Technical approach
- happy-dom global registrant registered via `bunfig.toml [test] preload` AND at runtime in the renderer init.
- Hash input includes `marksync-mermaid-render-v1` + normalized source + renderer family/version + svg + theme + securityConfig + fontPolicy + scale + background (blueprint §6).
- Sanitizer is a small allowlist-based XML walker (no dep).
- Determinism: pin mermaid version + fontFamily + theme; re-baseline golden SVGs as a reviewed action on mermaid major bumps (ADR-0002 C-1).

## Interface contracts (what other stories consume)
- `Renderer` port + `MermaidRenderer` consumed by E3-S6 (via the manager).
- `MermaidArtifactManager` consumed by E3-S6 to resolve diagram references.
- Attachment hash naming scheme shared with E4-S2 (assets).

## Acceptance criteria (testable)
- [ ] **Determinism:** same source+config → byte-identical normalized SVG across runs (golden snapshot match; cross-OS stretch recorded).
- [ ] **Security (NFR-SEC-5):** adversarial fixtures (XSS payloads, `<script>`, `onerror`, `javascript:`) → sanitized output contains none of them; `securityLevel:"strict"` + `htmlLabels:false` confirmed.
- [ ] **Attachment reuse (idempotency):** unchanged diagram → `attachmentExists` true → NO upload call (assert via mock target); changed diagram → new hash → upload.
- [ ] **Fallback (C-2):** a malformed diagram → `RenderUnavailable` → `code` policy emits the raw block + a warning; never silently drops.
- [ ] **Privacy (NFR-PRIV-2):** no diagram content is sent to any remote endpoint (default config); remote path stays opt-in.
- [ ] Pipeline: a doc with a mermaid fence → Storage body contains `<ri:attachment ri:filename="marksync-mermaid-<hash>.svg"/>`.
- [ ] `bun run check` green; mermaid-DOM test tier green.

## Test matrix
| Tier | This story |
|---|---|
| Mermaid-DOM (happy-dom preload) | render determinism (5x byte-identical), security-level active, adversarial fixtures inert |
| Golden | normalized SVG fixtures byte-stable |
| Integration | manager reuse path (mock target `attachmentExists`), fallback-to-code on render failure, pipeline fence→attachment reference |
| E2E | (E5-S1) real sandbox: diagram renders + attaches |

## Definition of Done
In-process renderer + sanitizer + content-hash manager wired into the pipeline; deterministic; secure; idempotent (reuse); code-fallback works. AC list is the DoD.

## Out of scope
- `mmdc`/Kroki/container fallback rungs (only if spike failed; otherwise MS-0003).
- PNG output (SVG default; ADR-0002 defers PNG to per-diagram need).
- Remote rendering (off by default; opt-in future).

## Risks / open questions (CEO-resolved)
- **R1:** If spike E1-S1 found cross-OS SVG deltas. → Include `rendererVersion` + `fontPolicy` in the hash (already in formula §6); per-OS cache keys keep idempotency per-OS. CEO-recorded.
- **Q1:** `htmlLabels:false` reduces fidelity for some diagrams. → Required by ADR-0002 Security Requirements until a sanitized HTML-label path is proven; non-negotiable for MS-0002. Confirmed.
