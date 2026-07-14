---
# Copyright (c) 2025-2026 Juliusz Ćwiąkalski (https://www.cwiakalski.com | https://www.linkedin.com/in/juliusz-cwiakalski/ | https://x.com/cwiakalski)
# MIT License - see LICENSE file for full terms
ados_distribution: project-generated
id: SPEC-MERMAID-RENDERING
status: Current
created: 2026-07-06
last_updated: 2026-07-13
owners: [Juliusz Ćwiąkalski]
service: marksync-cli
links:
  related_changes: ["GH-11", "GH-25", "GH-69"]
  decisions: [ADR-0001, ADR-0002, TDR-0004]
  contracts: []
---

# Feature Specification: Mermaid Diagram Rendering

> Mermaid diagrams render as SVG image attachments. MS-0002 ships the `code` policy as the default (GH-25) and the opt-in `render` policy via the public Kroki API — ADR-0002 fallback-ladder rung 6 (GH-69). The deterministic **in-process** renderer (Part B) remains the design target, deferred to MS-0003+ pending a faithful-render path (GH-11 H4 FAIL).

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
does not block MS-0002. The in-process renderer is deferred to MS-0003+ pending
a faithful-render path (Chromium-based, or a validated SVG-layout shim such as
`svgdom`/canvas-measured `getBBox`).

> **Implemented state (GH-25 + GH-69, 2026-07-13).** The `MermaidPolicy` config
> enum is `"code" | "render" | "skip"` with `"code"` as the default. The `code`
> and `skip` policies emit the Mermaid source as a code macro with
> `language=mermaid` (GH-25) — golden fixtures prove byte-stability and
> adversarial fixtures prove XSS/`<script>`/`onerror`/`javascript:` payloads are
> inert inside the CDATA code body (NFR-SEC-5). The `render` policy is
> **implemented** (GH-69) via the public Kroki API (ADR-0002 rung 6): each
> `language-mermaid` fence is POSTed to `https://kroki.io/mermaid/svg`, the
> returned SVG is content-hashed (full sha256) and uploaded as the attachment
> `marksync-mermaid-<fullhash>.svg` via the GH-26 asset pipeline, and the fence is
> replaced by an `<ac:image><ri:attachment>` reference. A one-time privacy warning
> is emitted per run because diagram content leaves the user's environment
> (NFR-PRIV-2); network failures fall back to the code block with a warning
> (ADR-0002 C-2). The deterministic **in-process** renderer (Part B) is still
> deferred to MS-0003+ pending a faithful-render path (GH-11 H4 FAIL).

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

- **`render` policy — remote SVG via Kroki (implemented, GH-69):** when
  `render.mermaid.policy === "render"`, each `language-mermaid` fence is rendered
  to SVG via `POST https://kroki.io/mermaid/svg` (ADR-0002 fallback-ladder rung 6,
  public Kroki — opt-in). The SVG bytes are content-hashed (full sha256) and
  uploaded as `marksync-mermaid-<fullhash>.svg` via the GH-26 asset pipeline
  (`Renderer` port → `KrokiClient` adapter; `src/domain/mermaid/transform.ts`
  replaces the fence with an `<img>` node so the Storage renderer emits
  `<ac:image><ri:attachment>`). This is **remote** rendering, not the in-process
  path: the one-time-per-run privacy warning (NFR-PRIV-2) reflects that diagram
  content is sent to a third-party endpoint.
- **`code` policy — default (ADR-0002 rung 7, implemented GH-25):** the
  `MermaidPolicy` config enum is `"code" | "render" | "skip"` with `"code"` as the
  default. Preserve the raw Mermaid source as a code macro with
  `language=mermaid`. Safe, deterministic, and sends no content remotely.
- **In-process render via official `mermaid` library (design target, Part B):**
  the deterministic in-process renderer remains the design target but is
  **deferred to MS-0003+** pending a faithful-render path (GH-11 H4 FAIL —
  happy-dom/jsdom lack an SVG layout engine). When it lands, it occupies rung 1
  of the ADR-0002 fallback ladder.
- **Deterministic output (when rendering):** `deterministicIds: true` plus the
  digest-normalization rules (§3.4) ensure stable element IDs; same logical
  input → same SVG bytes on a given OS (after normalization) and same attachment
  hash cross-OS (per-OS cache key, ADR-0002 C-1 / DEC-3).
- **Security:** `securityLevel: "strict"` (encodes HTML, disables click);
  `htmlLabels: false`; SVG sanitized; no external resource loading.
- **Content hashing:** render output is content-hashed for attachment reuse
  (unchanged diagram → reused attachment, no re-upload).
- **Fallback ladder (ADR-0002):** in-process (rung 1, deferred to MS-0003+) → … →
  public Kroki (rung 6, opt-in `render` policy — GH-69) → `code` policy (rung 7,
  the default — GH-25). On a Kroki network failure the `render` policy descends
  per-fence to the `code` block with a warning (ADR-0002 C-2).

### 3.2 Attachment identity

Attachment filename is derived from a deterministic hash:

```
marksync-mermaid-render-v1 + normalized-source + renderer-family/version +
output-format + theme + security-config + font-policy + scale + background
```

Unchanged logical render input → same hash → same attachment → no re-upload.

> **Implemented Kroki path (GH-69, GH-76).** The remote render path now (a) forwards
> `deterministicIds` and `htmlLabels` as Kroki diagram-options query parameters
> (`deterministic-ids=true`, `html-labels=false`), and (b) normalizes the SVG via
> §3.3 rules before hashing — `Artifact.bytes` is the normalized SVG and
> `hash = sha256(normalizedSVG)` (DEC-3). `securityLevel` is not passed (blocked
> by Kroki, enforced as `strict` by default, DEC-1). This ensures deterministic
> digests across syncs, restoring NFR-PERF-4 idempotent rerun.
> The logical-input formula applies to the in-process renderer (Part B, MS-0003+).

### 3.3 Normalization rules (digest stability)

> **Implemented for Kroki path (GH-76).** The §3.3 normalization rules are now
> implemented in `src/domain/mermaid/normalize.ts` and applied to SVG output
> from Kroki before hashing (DEC-5). The function is pure and reusable for the
> in-process renderer (MS-0003+).

The renderer's **digest** form (the bytes used for golden-fixture comparison and
as the cache/determinism check) is produced by a pure, dependency-free
normalizer. The rules — recorded verbatim from the GH-11 spike
(`spikes/mermaid-render/normalize.ts`) for MS-0003+ reuse — applied **in order**:

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

> **Rule 5 is load-bearing for MS-0003+.** The GH-11 spike observed that the
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
- **Kroki network failure / timeout (GH-69):** a `RemoteUnreachable` (HTTP 4xx/5xx,
  DNS failure, or 30 s timeout) on the Kroki endpoint leaves the fence unchanged
  so it renders as a code macro; a per-fence warning is surfaced (ADR-0002 C-2).
  The run continues (per-document isolation).
- **Privacy (NFR-PRIV-2):** the `render` policy sends diagram content to
  `https://kroki.io`; a one-time warning is emitted per run. The `code`/`skip`
  policies send no content remotely.
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
deferred to MS-0003+ (Chromium-based, or a validated SVG-layout shim). For the
remote render path, MS-0002 wires the `render` policy to the public Kroki API
(GH-69) — an HTTP adapter (`src/infra/mermaid/kroki.ts`) behind the domain
`Renderer` port; the default `code` policy emits the raw Mermaid block.

### 4.2 Core components

| Component | Responsibility | Status |
|---|---|---|
| `Renderer` port (`src/domain/mermaid/port.ts`) | Domain interface: `render(source, config): Promise<Result<Artifact, MarkSyncError>>` — contract carries `MermaidRenderConfig` (DM-1, GH-76) | Implemented (GH-69, GH-76) |
| `KrokiClient` (`src/infra/mermaid/kroki.ts`) | HTTP adapter: POSTs source with diagram options (`deterministic-ids`, `html-labels`), normalizes SVG before hashing (§3.3 rules, DEC-5), 30 s timeout, maps HTTP/network errors → `RemoteUnreachable` | Implemented (GH-69, GH-76) |
| HAST transform (`src/domain/mermaid/transform.ts`) | Discovers `language-mermaid` fences, calls `Renderer.render(source, config)` under `render` policy, replaces `pre` with synthetic `img` node, in-doc dedup, per-fence fallback on error | Implemented (GH-69, GH-76) |
| `normalizeSvg` (`src/domain/mermaid/normalize.ts`) | Pure SVG normalizer implementing §3.3 rules for digest stability (strip comments, sort attrs, rewrite IDs, canonicalize whitespace, strip metadata) | Implemented (GH-76) |
| `AttachmentService` (`src/infra/confluence/attachments.ts`) | `attachmentFilename()` → `marksync-mermaid-<fullhash>.svg`; `uploadAssets` / `attachmentExists` reuse path (GH-26) | Implemented (GH-26) |
| `MermaidRenderer` (in-process) | Loads official Mermaid, renders source → SVG in headless DOM | Deferred — MS-0003+ (GH-11 H4 FAIL) |
| `DOMEnvironment` | happy-dom headless environment (TDR-0004) | Deferred — MS-0003+ |
| `SVGSanitizer` | Strips unsafe elements/attributes | Deferred — MS-0003+ |

### 4.3 Key decisions

- **ADR-0001:** TypeScript chosen partly because Mermaid ecosystem is TS-native.
- **ADR-0002:** Official library in-process; `securityLevel: strict`;
  `deterministicIds: true`; ordered fallback ladder (in-process → mmdc CLI →
  container → Kroki remote → `code` block). MS-0002 implements rung 6 (Kroki
  via `render` policy, GH-69) and rung 7 (`code` default, GH-25); rungs 1–5
  are deferred to MS-0003+.
- **TDR-0004:** bun:test + happy-dom for Mermaid-DOM rendering tests
  (applicable when the in-process renderer lands in MS-0003+; the Kroki path
  is tested with a mocked renderer — see the test spec).

## 5. Acceptance criteria

- [x] **Render policy (Kroki, implemented GH-69):** `render.mermaid.policy:
      render` → each mermaid fence renders as
      `<ac:image><ri:attachment ri:filename="marksync-mermaid-<fullhash>.svg"/>`;
      the attachment exists on the page after apply. The `code` policy preserves
      the raw code as `<ac:structured-macro ac:name="code">` with
      `language=mermaid`. *(ADR-0002 rung 6; evidenced by GH-69 integration +
      golden fixtures.)*
- [ ] **Determinism (when rendering in-process):** same Mermaid source + config →
      byte-identical normalized SVG across runs on a given OS (cross-OS
      hash-stable via per-OS cache key, ADR-0002 C-1 / DEC-3). *Evidenced for
      the renderable fixtures by GH-11 (H1 PASS-caveat).*
- [ ] **Security:** `securityLevel: strict`; SVG sanitized; no external resource
      loading; adversarial fixtures pass. *Default-config XSS/script safety
      evidenced by GH-11 (H5 PASS); full SVG sanitization is MS-0003+
      (`SVGSanitizer`). Code-policy injection safety proven by GH-25 adversarial
      fixtures (NFR-SEC-5).*
- [x] **Spike-gated (GH-11, 2026-07-06) — PARTIAL:** the headless render spike
      returned H1/H2/H3/H5 PASS but **H4 (fidelity) FAIL (0/5)** (happy-dom/jsdom
      have no SVG layout engine). Part B does **not** advance to `spike-validated`;
      **MS-0002 falls back to the `code` policy (preserve code block, ADR-0002
      rung 7)** — this does not block MS-0002. The in-process renderer is deferred
      to MS-0003+ pending a faithful-render path. **The `code` policy is
      implemented, tested, and correctly defaulted under GH-25 (CEO-DEC-1).**
- [x] **Attachment reuse:** unchanged diagram → same full-sha256 hash → same
      `marksync-mermaid-<hash>.svg` → 0 re-uploads on the second run
      (`attachmentExists` short-circuits). *Render-policy dedup evidenced by
      GH-69; the in-process renderer's cross-OS hash formula applies when Part B
      lands (MS-0003+).*
- [x] **Fallback (MS-0002, implemented GH-25 + GH-69):** the `code` policy is the
      implemented default — a mermaid fence is preserved as a code macro with
      `language=mermaid`, byte-stable across runs. Under the `render` policy, a
      Kroki failure descends per-fence to the code block with a warning
      (ADR-0002 C-2). (In-process render-failure → `code` descent activates with
      a renderer in MS-0003+.)

## 6. References

- [ADR-0001](../../decisions/ADR-0001-implementation-language-and-runtime.md)
- [ADR-0002](../../decisions/ADR-0002-mermaid-rendering-strategy.md)
- [TDR-0004](../../decisions/TDR-0004-testing-runner.md)
- [Testing strategy: Mermaid-DOM tier](../../../.ai/rules/testing-strategy.md)
- [NFR-SEC-5: converter injection safety](../nonfunctional.md)
