---
# Copyright (c) 2025-2026 Juliusz Ćwiąkalski (https://www.cwiakalski.com | https://www.linkedin.com/in/juliusz-cwiakalski/ | https://x.com/cwiakalski)
# MIT License - see LICENSE file for full terms
ados_distribution: project-generated
id: SPEC-MERMAID-RENDERING
status: Current
created: 2026-07-06
last_updated: 2026-07-06
owners: [Juliusz Ćwiąkalski]
service: marksync-cli
links:
  related_changes: ["GH-11"]
  decisions: [ADR-0001, ADR-0002, TDR-0004]
  contracts: []
---

# Feature Specification: Mermaid Diagram Rendering

> Deterministic in-process Mermaid rendering — no external service dependency (design target). MS-0002 ships the ADR-0002 fallback `code` policy as the default; the in-process renderer is deferred pending a faithful-render path.

## 1. Overview

The **design target** is to render Mermaid diagram source blocks from Markdown
into SVG images that are attached to the published Confluence page, in-process
using the official Mermaid library, deterministically, so the same input always
produces the same output.

**MS-0002 reality (per the GH-11 spike, 2026-07-06).** The Mermaid headless-render
spike returned a **PARTIAL** verdict: the official library runs in-process under
Bun + happy-dom with no Chromium and is byte-stable after normalization (H1/H2/H3
PASS) and Mermaid's `securityLevel:"strict"` defaults are safe (H5 PASS), but
fidelity **FAILS (H4 0/5)** — happy-dom and jsdom have no SVG layout engine
(`SVGElement.prototype.getBBox` returns zeros), so text-measuring diagram types
(sequence/class/state) throw and flowchart/gantt produce degenerate output.
Accordingly, **MS-0002 descends ADR-0002's fallback ladder to rung 7 — the
`code` policy** (preserve the raw Mermaid code block instead of rendering). This
does not block MS-0002. The in-process renderer is deferred to MS2-E4-S1 pending
a faithful-render path (Chromium-based, or a validated SVG-layout shim such as
`svgdom`/canvas-measured `getBBox`).

## 2. Business Context

### 2.1 Problem Statement

- **Problem:** Mermaid diagrams in Markdown need to be visible on Confluence.
  External rendering services add latency, cost, and a dependency. Naive
  rendering is non-deterministic (random element IDs) and has security risks
  (CSS/HTML injection).
- **Affected Users:** All users with Mermaid diagrams in their documentation.
- **Business Impact:** In-process rendering eliminates the external dependency;
  determinism enables reliable caching and drift detection.

## 3. Functionality

### 3.1 Capabilities

- **Render Mermaid → SVG (design target):** in-process via official `mermaid`
  library. Deferred to MS2-E4-S1 pending a faithful-render path (GH-11 H4 FAIL).
- **MS-0002 default — `code` policy (ADR-0002 rung 7):** preserve the raw
  Mermaid code block instead of rendering. Safe, deterministic, and does not
  block MS-0002. A `render` policy that attempts in-process render is the
  intended default once a faithful path exists.
- **Deterministic output (when rendering):** `deterministicIds: true` plus the
  digest-normalization rules (§3.4) ensure stable element IDs; same logical
  input → same SVG bytes on a given OS (after normalization) and same attachment
  hash cross-OS (per-OS cache key, ADR-0002 C-1 / DEC-3).
- **Security:** `securityLevel: "strict"` (encodes HTML, disables click);
  `htmlLabels: false`; SVG sanitized; no external resource loading.
- **Content hashing:** render output is content-hashed for attachment reuse
  (unchanged diagram → reused attachment, no re-upload).
- **Fallback ladder:** `render` → … → `code` policy (preserve block) as the
  last resort. MS-0002 ships `code` as the effective default.

### 3.2 Attachment identity

Attachment filename is derived from a deterministic hash:

```
marksync-mermaid-render-v1 + normalized-source + renderer-family/version +
output-format + theme + security-config + font-policy + scale + background
```

Unchanged logical render input → same hash → same attachment → no re-upload.

### 3.3 Normalization rules (digest stability)

The renderer's **digest** form (the bytes used for golden-fixture comparison and
as the cache/determinism check) is produced by a pure, dependency-free
normalizer. The rules — recorded verbatim from the GH-11 spike
(`spikes/mermaid-render/normalize.ts`) for MS2-E4-S1 reuse — applied **in order**:

1. **XML comments stripped** — remove all `<!-- … -->`.
2. **Attributes sorted deterministically per element** — sort each element's
   attributes by name (value as secondary key).
3. **Ephemeral / instance-specific IDs rewritten deterministically** — collect
   every `id="…"` in document order, rewrite to a stable `eid0`, `eid1`, …
   sequence, and update every reference (`url(#…)`, `href="#…"`, `xlink:href="#…"`)
   to match (longest originals first). Neutralizes mermaid's `<base>-<n>` ids,
   clip-path/marker/filter ids, and the render-id prefix.
4. **Whitespace canonicalization** — collapse whitespace runs, drop inter-tag
   whitespace (`> <` → `><`), trim.
5. **Font / system metadata normalized or stripped; time-dependent layout
   markers stripped.** Canonicalize every `font-family:…` declaration (CSS and
   attribute) to a fixed token; strip `data-mermaid-version`/ISO-timestamp
   markers if present. **Also strip the gantt `<g class="today">…</g>` group**
   (inner `<line class="today" x1=… x2=…>` whose coordinates are a function of
   the current date/time).

> **Rule 5 is load-bearing for MS2-E4-S1.** The GH-11 spike observed that the
> gantt golden drifted across process runs (`x1="-27937"` → `x1="-27938"`)
> because the `today` line depends on the wall clock; within-window N=5 repeats
> miss this. Stripping `<g class="today">…</g>` from the **digest** form (the
> rendered SVG the user sees is untouched) made the gantt digest byte-stable
> across 3 separate process runs. Any gantt golden/cache key that does not
> normalize away the `today` line is inherently non-reproducible. For any
> determinism probe with N>1 in-window repeats, also run K>1 out-of-window
> process invocations to catch date/time-dependent output.

**Non-goal:** normalization is for *digest stability*, not for altering rendered
semantics.

### 3.4 Edge cases & error handling

- **Malformed Mermaid source:** render fails → fallback to `code` policy
  (preserve block); emit warning.
- **Mermaid security advisory:** `securityLevel: strict` + SVG sanitization;
  adversarial input fixture suite (NFR-SEC-5).
- **Large diagrams:** size guard; warn if render output exceeds threshold.

## 4. Technical Architecture

### 4.1 Design

The design target is a renderer that runs in a headless DOM environment
(happy-dom per TDR-0004) within the Bun process; the SVG output is extracted,
sanitized, and content-hashed. The GH-11 spike established that happy-dom/jsdom
run the library but cannot produce faithful output (no SVG layout engine), so
this design is **not yet implemented** and the production renderer choice is
deferred to MS2-E4-S1 (Chromium-based, or a validated SVG-layout shim). For
MS-0002 the pipeline emits the raw Mermaid block under the `code` policy.

### 4.2 Core components

| Component | Responsibility |
|---|---|
| MermaidRenderer | Loads official Mermaid, renders source → SVG |
| DOMEnvironment | happy-dom headless environment (TDR-0004) |
| SVGSanitizer | Strips unsafe elements/attributes |
| AttachmentHasher | Deterministic hash for attachment identity |

### 4.3 Key decisions

- **ADR-0001:** TypeScript chosen partly because Mermaid ecosystem is TS-native.
- **ADR-0002:** Official library in-process; `securityLevel: strict`;
  `deterministicIds: true`; fallback ladder (`strict` → `loose` → `code`).
- **TDR-0004:** bun:test + happy-dom for Mermaid-DOM rendering tests.

## 5. Acceptance criteria

- [ ] **Determinism (when rendering):** same Mermaid source + config →
      byte-identical normalized SVG across runs on a given OS (cross-OS
      hash-stable via per-OS cache key, ADR-0002 C-1 / DEC-3). *Evidenced for
      the renderable fixtures by GH-11 (H1 PASS-caveat).*
- [ ] **Security:** `securityLevel: strict`; SVG sanitized; no external resource
      loading; adversarial fixtures pass. *Default-config XSS/script safety
      evidenced by GH-11 (H5 PASS); full SVG sanitization is MS2-E4-S1
      (`SVGSanitizer`).*
- [x] **Spike-gated (GH-11, 2026-07-06) — PARTIAL:** the headless render spike
      returned H1/H2/H3/H5 PASS but **H4 (fidelity) FAIL (0/5)** (happy-dom/jsdom
      have no SVG layout engine). Part B does **not** advance to `spike-validated`;
      **MS-0002 falls back to the `code` policy (preserve code block, ADR-0002
      rung 7)** — this does not block MS-0002. The in-process renderer is deferred
      to MS2-E4-S1 pending a faithful-render path.
- [ ] **Attachment reuse:** unchanged diagram → same hash → no re-upload.
- [ ] **Fallback:** render failure → `code` policy; warning emitted. (MS-0002
      ships `code` as the effective default.)

## 6. References

- [ADR-0001](../../decisions/ADR-0001-implementation-language-and-runtime.md)
- [ADR-0002](../../decisions/ADR-0002-mermaid-rendering-strategy.md)
- [TDR-0004](../../decisions/TDR-0004-testing-runner.md)
- [Testing strategy: Mermaid-DOM tier](../../../.ai/rules/testing-strategy.md)
- [NFR-SEC-5: converter injection safety](../nonfunctional.md)
