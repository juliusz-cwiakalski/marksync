---
# Copyright (c) 2025-2026 Juliusz Ćwiąkalski (https://www.cwiakalski.com | https://www.linkedin.com/in/juliusz-cwiakalski/ | https://www.x.com/cwiakalski)
# MIT License - see LICENSE file for full terms
change:
  ref: GH-25
  type: feat
  status: Proposed
  slug: mermaid-code-policy
  title: "[MS2-E4-S1] Mermaid rendering (re-scoped) — code policy as the MS-0002 default"
  owners: [Juliusz Ćwiąkalski]
  service: marksync-cli
  labels: [MS-0002, MS2-E4, mermaid, code-policy, CEO-DEC-1, security]
  version_impact: patch
  audience: internal
  security_impact: low
  risk_level: low
  dependencies:
    internal: [config-system (GH-15), markdown-pipeline (GH-20), sync-engine (GH-23)]
    external: []
---

# CHANGE SPECIFICATION

> **PURPOSE**: Make the Mermaid `code` policy (ADR-0002 fallback rung 7) the
> explicit, tested, and correctly-defaulted MS-0002 operating behavior —
> correcting a misleading `render` config default, resolving a pre-existing
> enum/ADR terminology mismatch, and proving byte-stable preservation and
> injection safety with golden and adversarial fixtures — so the safe one-way
> publish ships an honest, deterministic, reversible diagram-handling posture
> while full in-process SVG rendering is deferred to MS-0003+ per CEO-DEC-1.

## 1. SUMMARY

This is the **re-scoped** delivery of story MS2-E4-S1 (GH-25). The original
story scoped a full in-process Mermaid SVG renderer (happy-dom + official
library). That premise was invalidated by the GH-11 spike (2026-07-06): happy-dom
and jsdom have **no SVG layout engine** (`getBBox` returns zeros; fidelity H4
FAIL 0/5). On 2026-07-13, **CEO-DEC-1** resolved the resulting owner-level
decision by choosing **Option 3**: MS-0002 ships the **`code` policy**
(preserve the raw Mermaid code block) as the default per **ADR-0002 fallback
rung 7**, and full in-process rendering is **deferred to MS-0003+**.

This is a **small** story because the code-policy fallback is **already the
de-facto pipeline behavior**: a ```` ```mermaid ```` fence flows through the
Markdown pipeline (GH-20) into the existing HAST→Storage renderer, which emits
a Confluence `<ac:structured-macro ac:name="code">` with
`<ac:parameter ac:name="language">mermaid</ac:parameter>` and the source in a
CDATA body. **No renderer exists and none is added in this change.** The work
is to (1) resolve the pre-existing config/ADR terminology mismatch by adding
`"code"` to the policy enum and making it the default; (2) add explicit tests
proving mermaid fences are preserved byte-stable as code macros; (3) add
adversarial fixtures proving the code policy is injection-safe by construction;
and (4) document the fallback ladder as the MS-0002 operating default.

> **Re-scope note.** The story file
> (`MS2-E4-S1--mermaid-rendering.md`) carries a "Do not start delivery against
> the current scope" banner and scoped a `Renderer` port, `MermaidRenderer`,
`MermaidArtifactManager`, `SVGSanitizer`, and golden SVG fixtures. That banner
> is **resolved by CEO-DEC-1**. This spec supersedes the story file's original
> scope for MS-0002; all renderer/sanitizer/attachment-hashing artifacts are
> Non-Goals (§4.2) deferred to MS-0003+.

## 2. CONTEXT

### 2.1 Current State Snapshot

- **The code-policy path already exists and ships.** The HAST→Storage renderer
  (GH-20) maps every `<pre>` element — including ```` ```mermaid ```` fences —
  through its `codeMacro` visitor, which emits
  `<ac:structured-macro ac:name="code">` with a `language` parameter extracted
  from the `language-mermaid` class and the source text wrapped in a CDATA
  `<ac:plain-text-body>`. This is deterministic and already exercised by the
  GH-20 golden fixture suite.
- **The `MermaidPolicy` config type is declared but never consumed.** The type
  is `"render" | "skip"` and the field `config.render.mermaid.policy` is
  populated by `applyDefaults`, but **no code reads it** — the pipeline always
  emits a code macro regardless of the configured value.
- **The config default is misleadingly `"render"`.** Both the loader defaults
  and the starter template ship `policy: render`, implying an SVG renderer
  exists. It does not. This misrepresents MS-0002's actual capability.
- **There is a terminology mismatch between config and ADR-0002.** ADR-0002
  names fallback rung 7 the **`code` policy** and its C-2 lists policy values
  `error | code | macro`. The config enum has no `"code"` value — only
  `"render"` and `"skip"`.
- **Hard dependencies are resolved.** GH-11 (spike, CLOSED) and GH-23 (sync
  engine, MERGED) are complete. The Markdown pipeline (GH-20) and config
  system (GH-15) are merged.
- **ADR-0001 (TypeScript/Bun) is NOT revisited.** CEO-DEC-1 resolved the
  ADR-0001 revisit trigger without fundamental reconsideration: TypeScript/Bun
  is locked in (15 successful deliveries). The H4 failure is a DOM-layout
  gap, not a language-level catastrophe (a deterministic path exists).

### 2.2 Pain Points / Gaps

- **Misleading default.** A user who inspects `marksync.yml` sees
  `policy: render` and reasonably expects rendered diagrams. They get a code
  block. This erodes trust in the config surface and the product's honesty.
- **Enum/ADR drift.** The config vocabulary (`render | skip`) does not match
  ADR-0002's vocabulary (`code` as the rung-7 name). A reader cross-referencing
  the ADR and the config cannot reconcile the two. There is no `"code"` value
  despite the ADR naming it the MS-0002 floor.
- **No explicit test coverage for mermaid preservation.** The GH-20 golden
  suite covers code fences generically, but there is no fixture or test that
  explicitly asserts a ```` ```mermaid ```` fence is preserved byte-stable as a
  `language=mermaid` code macro. A regression that silently dropped or altered
  mermaid content would not be caught at the mermaid-specific granularity.
- **No adversarial proof for the code policy.** NFR-SEC-5 (converter injection
  safety) is proven for general Markdown (GH-20), but there is no adversarial
  fixture demonstrating that XSS/`<script>`/`onerror` payloads inside a
  ```` ```mermaid ```` fence are inert. The code policy is safe by construction
  (CDATA-escaped, XML-escaped inside a code macro), but this is unproven.
- **The fallback ladder is not documented as the operating default.** ADR-0002
  records the seven-rung ladder and the H4-failure descent to rung 7, but the
  config surface and starter template do not communicate that `code` is the
  MS-0002 operating reality.

## 3. PROBLEM STATEMENT

Because the config default misleadingly advertises a `render` policy that has
no renderer, because the config enum lacks the `code` value that ADR-0002 names
as the MS-0002 floor, and because mermaid-fence preservation and injection
safety are unproven at the mermaid-specific granularity, MarkSync cannot
honestly represent its MS-0002 diagram-handling capability — so a user or
contributor reading the config or the ADR cannot trust that mermaid content is
preserved deterministically and safely, and a future edit could silently
regress preservation or safety without a failing test — so this change must
correct the default, resolve the terminology mismatch, and add the missing
proofs before MS-0002 ships.

## 4. GOALS

- **G-1**: Resolve the canonical MS-0002 Mermaid policy model — the enum,
  default, and semantics — so config and ADR-0002 use consistent terminology
  and the default reflects MS-0002 reality (F-1, DEC-1).
- **G-2**: Prove that a ```` ```mermaid ```` fence is preserved byte-stable as a
  Confluence code macro with `language=mermaid` across repeated renders (F-2,
  NFR-2).
- **G-3**: Prove that the code policy is injection-safe by construction —
  adversarial mermaid payloads (XSS, `<script>`, `onerror`, `javascript:`)
  are rendered as inert escaped text inside the CDATA code body (F-3,
  NFR-1/NFR-SEC-5).
- **G-4**: Ensure the config default and starter template ship `code` as the
  MS-0002 policy, reflecting reality (F-4).
- **G-5**: Document the fallback ladder as the MS-0002 operating default so
  readers understand why the spec differs from the original story scope (F-1,
  DEC-1, DEC-2).

### 4.1 Success Metrics / KPIs

| Metric | Target |
|--------|--------|
| mermaid preservation | a ```` ```mermaid ```` fence → Storage output contains `<ac:structured-macro ac:name="code">` with `<ac:parameter ac:name="language">mermaid</ac:parameter>`; **100%** of mermaid fixtures |
| byte-stability | same mermaid input rendered N≥3 times → **0 bytes** diff across runs |
| injection safety (NFR-SEC-5) | adversarial mermaid fixtures → **0** `<script>`, **0** live `on*` handlers, **0** `javascript:` URIs in Storage output |
| config default correctness | `loadConfig` with no `render.mermaid` section → `policy === "code"`; starter template → `policy: code` |
| schema/type lock-step | joint valid/invalid config tests pass with the updated enum (`code \| render \| skip`) |
| remote rendering (NFR-PRIV-2) | default config sends **0** diagram bytes to any remote endpoint (code policy is local-only) |
| quality gate | `bun run check` exits **0** |

### 4.2 Non-Goals

- **NG-1**: In-process Mermaid rendering / SVG output / a `MermaidRenderer`
  / an `SVGSanitizer` / attachment hashing for diagrams — **all deferred to
  MS-0003+** per CEO-DEC-1.
- **NG-2**: Chromium / `mmdc` / Kroki fallback rungs — deferred (ADR-0002
  rungs 2–6).
- **NG-3**: PNG output — deferred (ADR-0002 defers PNG to per-diagram need).
- **NG-4**: The original story's `Renderer` port, `MermaidArtifactManager`,
  golden SVG fixtures, and content-hash attachment naming — NOT in this
  change; they require a faithful render path that does not yet exist.
- **NG-5**: Reconsidering ADR-0001 (TypeScript/Bun) — explicitly NOT
  reconsidered; the revisit trigger is resolved by CEO-DEC-1 without
  fundamental reconsideration.
- **NG-6**: Policy-driven pipeline branching in MS-0002 — in MS-0002 all
  policy values produce the same code-macro output (no renderer exists); the
  values differ in documented intent for MS-0003+, not in MS-0002 behavior.
- **NG-7**: The ADR-0001/ADR-0002 open-question amendments — those are
  recorded by `@doc-syncer` in lifecycle phase 7 (system_spec_update), citing
  CEO-DEC-1; this spec references the resolved state but does not perform the
  ADR edits.

## 5. FUNCTIONAL CAPABILITIES

| ID | Capability | Rationale |
|----|------------|-----------|
| F-1 | Canonical Mermaid policy model | Define the config enum, default, and MS-0002 semantics so config and ADR-0002 use consistent terminology and the default is honest. Resolves the pre-existing `render \| skip` enum vs ADR-0002 `code` mismatch (DEC-1). |
| F-2 | Mermaid code-block preservation | A ```` ```mermaid ```` fence is preserved as a Confluence code macro with `language=mermaid`, byte-stable across runs. This is the existing de-facto behavior, now made explicit and proven. ADR-0002 rung 7. |
| F-3 | Code-policy injection safety | Mermaid source containing XSS/`<script>`/`onerror`/`javascript:` payloads is rendered as inert escaped text inside the CDATA code body. Safe by construction; now proven with adversarial fixtures (NFR-SEC-5). |
| F-4 | Default reflects MS-0002 reality | `loadConfig` with no `render.mermaid` section yields the `code` policy; the starter template ships `code`. Corrects the misleading `render` default. |

### 5.1 Capability Details

- **F-1 (Policy model).** The `MermaidPolicy` enum gains `"code"`: the
  canonical MS-0002 enum is `"code" | "render" | "skip"`. The default changes
  from `"render"` to `"code"`. Because no renderer exists in MS-0002
  (CEO-DEC-1), **all three values produce the same observable output** — the
  Mermaid source is emitted as a code macro with `language=mermaid` (ADR-0002
  rung 7). The values differ in documented intent:
  - `"code"` (default) — the explicit "preserve as code" policy; the MS-0002
    operating floor.
  - `"render"` — the "attempt SVG render" intent; reserved for MS-0003+; in
    MS-0002 descends the fallback ladder to `code` output (documented terminal
    rung per ADR-0002 C-2, not a silent no-op). Forward-compatible: when the
    renderer lands, `"render"` activates without config migration.
  - `"skip"` — the "do not render" intent; in MS-0002 also produces the code
    macro (source is never dropped — C-2). May gain distinct behavior in
    MS-0003+.

  MS-0002 is pre-release, so adding `"code"` and changing the default is
  non-breaking: a user who set `"render"` or `"skip"` continues to get the
  code macro (unchanged observable behavior). The JSON schema enum and the
  TypeScript type are updated in lock-step with the joint valid/invalid config
  tests (RSK-2 mitigation, consistent with the GH-15 lock-step convention).

- **F-2 (Preservation).** A ```` ```mermaid ```` fence in Markdown is parsed by
  the existing pipeline (GH-20) into a `<pre><code class="language-mermaid">`
  HAST node and rendered by the existing `codeMacro` visitor into
  `<ac:structured-macro ac:name="code"><ac:parameter ac:name="language">mermaid</ac:parameter><ac:plain-text-body><![CDATA[…]]></ac:plain-text-body></ac:structured-macro>`.
  The output is deterministic: identical input produces identical output
  across runs (0 bytes diff). No new render logic is introduced — this
  capability makes the existing behavior explicit and tested at the
  mermaid-specific granularity.

- **F-3 (Injection safety).** The code policy is safe by construction: the
  Mermaid source is placed inside a CDATA section within
  `<ac:plain-text-body>`, and the `language` parameter value (`mermaid`) is
  XML-escaped. Adversarial payloads (`<script>`, `onerror=`, `javascript:`,
  `]]>` sequences) cannot break out of the CDATA body or inject executable
  content into the Storage XML. This is proven with adversarial fixtures
  asserting 0 executable content in the output. This complements the GH-20
  general injection-safety proof (NFR-SEC-5) at the mermaid-specific
  granularity.

- **F-4 (Default correctness).** The loader's `applyDefaults` and the starter
  template both ship `policy: "code"` (was `"render"`). A config with no
  `render.mermaid` section yields the `code` default. This is tested directly:
  `loadConfig` on a minimal valid config returns `policy === "code"`, and the
  starter template round-trips through `loadConfig` to the same default.

## 6. USER & SYSTEM FLOWS

```
Flow 1 — Mermaid fence → Storage (code policy, MS-0002)
  User authors a ```` ```mermaid ```` fence in a .md file
    → Markdown pipeline (GH-20) parses to <pre><code class="language-mermaid"> HAST
    → HAST→Storage renderer codeMacro() emits <ac:structured-macro ac:name="code">
      with <ac:parameter ac:name="language">mermaid</ac:parameter>
      and <ac:plain-text-body><![CDATA[source]]></ac:plain-text-body>
    → Storage body is byte-stable across repeated renders
    → sync engine (GH-23) writes the body to Confluence
    → Confluence renders a syntax-highlighted code block (source visible, no SVG)

Flow 2 — Adversarial mermaid source → Storage (injection safety)
  User authors a ```` ```mermaid ```` fence containing <script>/onerror=/javascript:
    → same pipeline path as Flow 1
    → payloads land inside the CDATA code body as inert escaped text
    → Storage output contains 0 executable content (NFR-SEC-5)

Flow 3 — Config load (default correctness)
  User runs marksync with a marksync.yml that omits render.mermaid
    → loadConfig → applyDefaults fills policy: "code"
    → pipeline emits code macros (the MS-0002 operating default)
```

## 7. SCOPE & BOUNDARIES

### 7.1 In Scope

- Adding `"code"` to the `MermaidPolicy` enum (type + JSON schema) and making
  it the default in the loader and starter template.
- Explicit golden fixture(s) proving a ```` ```mermaid ```` fence is preserved
  byte-stable as a `language=mermaid` code macro.
- Adversarial fixture(s) proving XSS/`<script>`/`onerror`/`javascript:` payloads
  in mermaid source are inert in the Storage output (NFR-SEC-5).
- Config-default tests: `loadConfig` (no `render.mermaid`) → `code`; starter
  template → `code`.
- Documentation of the fallback ladder as the MS-0002 operating default within
  this spec and its linked artifacts (the ADR-0002 amendment itself is phase 7).

### 7.2 Out of Scope

- [OUT] In-process Mermaid SVG/PNG rendering, `MermaidRenderer`,
  `SVGSanitizer`, `MermaidArtifactManager`, content-hash attachment naming —
  deferred to MS-0003+ (NG-1, NG-4).
- [OUT] Chromium / `mmdc` / Kroki fallback rungs (ADR-0002 rungs 2–6) —
  deferred (NG-2).
- [OUT] Reconsidering ADR-0001 (TypeScript/Bun) — resolved by CEO-DEC-1, not
  revisited (NG-5).
- [OUT] Policy-driven pipeline branching in MS-0002 — all values produce the
  code macro; branching activates in MS-0003+ (NG-6).
- [OUT] Direct edits to ADR-0001/ADR-0002 open-question text — phase 7
  (`@doc-syncer`); this spec references the resolved state (NG-7).

### 7.3 Deferred / Maybe-Later

- A follow-up spike validating an SVG-layout shim (`svgdom` / canvas-measured
  `getBBox`) as the no-Chromium faithful-render path — the only option that
  preserves ADR-0001's load-bearing no-Chromium premise (GH-11 §10; ADR-0001
  Unresolved Questions).
- Activating the `"render"` policy with a real renderer and the full
  fallback-ladder branching (`error`/`code`/`macro` per ADR-0002 C-2) in
  MS-0003+.
- Distinguishing `"skip"` from `"code"` observably (e.g., suppressing language
  highlighting) once the renderer makes the distinction meaningful.

## 8. INTERFACES & INTEGRATION CONTRACTS

### 8.1 REST / HTTP Endpoints

N/A — this change touches the config domain and the existing Storage renderer;
it introduces no HTTP endpoints and performs no network I/O.

### 8.2 Events / Messages

N/A — no new events or messages.

### 8.3 Data Model Impact

| ID | Element | Description |
|----|---------|-------------|
| DM-1 | `MermaidPolicy` type | Gains `"code"`: the canonical MS-0002 enum is `"code" \| "render" \| "skip"` (was `"render" \| "skip"`). Aligned with ADR-0002 rung-7 terminology. |
| DM-2 | `render.mermaid.policy` JSON schema enum | Gains `"code"`: `["code", "render", "skip"]` (was `["render", "skip"]`). The schema description is updated to state the MS-0002 default is `code`. |
| DM-3 | `render.mermaid.policy` default | Changes from `"render"` to `"code"` in `applyDefaults` and in the starter template. Reflects MS-0002 reality (no renderer). |

No other config fields, lock-file fields, or persistent state shapes change.

### 8.4 External Integrations

N/A — no external APIs or services are affected. The code policy is local-only;
no diagram content leaves the user's environment (NFR-PRIV-2).

### 8.5 Backward Compatibility

MS-0002 is **pre-release** — no released version exists to break. The change is
non-breaking:

- Adding `"code"` to the enum is purely additive.
- Changing the default from `"render"` to `"code"` does not change observable
  pipeline behavior (both produce the code macro in MS-0002).
- A user who explicitly set `policy: render` or `policy: skip` before this
  change continues to get the code macro (unchanged behavior); the value is
  now schema-accepted and documented.
- The starter template is regenerated only by `marksync init` (which refuses
  to overwrite an existing config); existing configs are never mutated.

## 9. NON-FUNCTIONAL REQUIREMENTS (NFRs)

| ID | Requirement | Threshold |
|----|-------------|-----------|
| NFR-1 | Mermaid injection safety (NFR-SEC-5) | Adversarial mermaid fixtures → **0** `<script>` tags, **0** live `on*` handlers, **0** `javascript:` URIs in Storage output |
| NFR-2 | Byte-stability of code-macro output (NFR-REL-4) | Same mermaid input rendered N≥3 times → **0 bytes** diff across runs |
| NFR-3 | Remote rendering opt-in (NFR-PRIV-2) | Default config sends **0** diagram bytes to any remote endpoint; code policy is local-only |
| NFR-4 | Config schema/type lock-step | **100%** of joint valid/invalid config test cases pass with the updated enum |
| NFR-5 | Conversion latency (NFR-PERF-5) | Per-page render including a mermaid fence ≤ **200 ms p95** (informational; code-macro path adds negligible cost) |

## 10. TELEMETRY & OBSERVABILITY REQUIREMENTS

N/A — no new metrics, logs, traces, or alerts. The code policy introduces no
new failure modes or operational surfaces. Existing provenance/version-message
behavior (GH-23) is unchanged.

## 11. RISKS & MITIGATIONS

| ID | Risk | Impact | Probability | Mitigation | Residual Risk |
|----|------|--------|-------------|------------|---------------|
| RSK-1 | A pre-release user set `policy: render` expecting SVG and is surprised by a code block | L | L | The default already produced a code block before this change (no renderer existed); this change makes the default honest. The spec and config docs state `render` is deferred to MS-0003+. | L |
| RSK-2 | Enum/schema change breaks joint config tests or downstream type sites | L | L | MS-0002 pre-release; update schema, type, and tests in lock-step per the GH-15 convention. The policy field is never consumed, so no behavioral call-sites break. | L |
| RSK-3 | A reader confuses this spec's scope with the original story's full-render scope | L | M | Re-scope note at the top of this spec (§1); explicit Non-Goals (§4.2); CEO-DEC-1 and ADR-0002 rung 7 cited throughout. | L |
| RSK-4 | Adversarial fixture misses a payload class (false confidence in injection safety) | M | L | The code policy is safe by construction (CDATA + XML-escaping), independent of payload coverage; fixtures are defense-in-depth, not the primary control. GH-20 already proved general injection safety. | L |

## 12. ASSUMPTIONS

- CEO-DEC-1 (2026-07-13) is the authoritative re-scope decision; it is not
  re-litigated in this spec.
- ADR-0001 (TypeScript/Bun) is settled and not reconsidered; the H4 failure is
  a DOM-layout gap, not a language-level failure.
- MS-0002 is pre-release; config-surface changes (new enum value, changed
  default) are non-breaking.
- The existing `codeMacro` visitor (GH-20) is correct and deterministic; this
  change adds mermaid-specific proof, not new render logic.
- The `@doc-syncer` phase-7 amendments to ADR-0001/ADR-0002 (citing CEO-DEC-1)
  will record the resolved decision state; this spec references that state.

## 13. DEPENDENCIES

| Direction | Item | Notes |
|-----------|------|-------|
| Depends on | GH-11 (Mermaid spike, CLOSED) | Established H4 FAIL; CEO-DEC-1 input. |
| Depends on | GH-15 (config system, MERGED) | `MermaidPolicy` type, schema, `applyDefaults`, starter template. |
| Depends on | GH-20 (Markdown pipeline, MERGED) | `codeMacro` visitor, golden-fixture infrastructure, injection-safety precedent. |
| Depends on | GH-23 (sync engine, MERGED) | Push flow that writes rendered bodies (consuming the code-macro output unchanged). |
| Blocks | None | MS-0003 mermaid rendering is a separate future story; no MS-0002 story is blocked by this change. |

## 14. OPEN QUESTIONS

| ID | Question | Context | Status |
|----|----------|---------|--------|
| OQ-1 | Should `"skip"` gain a distinct observable behavior in MS-0002 (e.g., suppress `language=mermaid` highlighting) or remain a documented alias of `"code"` until MS-0003? | The prompt's scoping frames `skip`/`code` as both preserving the block. This spec treats them as producing the same code-macro output in MS-0002 (NG-6) and defers the distinction to MS-0003+. | Resolved for MS-0002 (DEC-1); revisit in MS-0003. |

No blocking open questions remain — CEO-DEC-1 resolved the sole blocker
(OQ-1 in `chg-GH-25-questions.md`).

## 15. DECISION LOG

| ID | Decision | Rationale | Date |
|----|----------|-----------|------|
| DEC-1 | Canonical MS-0002 Mermaid policy model: enum = `"code" \| "render" \| "skip"`; default = `"code"`; in MS-0002 all values produce the code macro (no renderer); `"render"` is a forward-compatible placeholder descending to `code`, `"skip"` is a documented alias. | Aligns config vocabulary with ADR-0002 rung-7 terminology; corrects the misleading `render` default; non-breaking (pre-release); proportionate to a small story (no new pipeline branching). | 2026-07-13 |
| DEC-2 | Full in-process Mermaid SVG rendering is deferred to MS-0003+; MS-0002 ships the `code` policy as the operating default. | CEO-DEC-1 (Option 3): GH-11 H4 FAIL (no SVG layout engine in happy-dom/jsdom); Chromium violates ADR-0001 single-binary; SVG-layout shim unvalidated; MS-0002 value is the safe publish, not rendering; code policy is deterministic + safe + reversible. | 2026-07-13 |
| DEC-3 | ADR-0001 (TypeScript/Bun) is NOT revisited. | CEO-DEC-1: the H4 failure is a DOM-layout gap, not a language-level catastrophe (a deterministic path exists); TS/Bun is locked in (15 successful deliveries); the revisit trigger is resolved without fundamental reconsideration. | 2026-07-13 |

## 16. AFFECTED COMPONENTS (HIGH-LEVEL)

| Component | Impact |
|-----------|--------|
| Config domain (`MermaidPolicy` type, JSON schema) | Updated — enum gains `"code"`; schema description updated. |
| Config loader (`applyDefaults`) | Updated — default changes from `"render"` to `"code"`. |
| Starter template (`marksync init`) | Updated — ships `policy: code`. |
| HAST→Storage renderer (`codeMacro`) | Unchanged — already emits the code macro; now explicitly tested at mermaid granularity. |
| Golden fixture suite | Extended — mermaid preservation + adversarial fixtures added. |
| Config test suite | Extended — default-correctness + updated enum lock-step tests. |
| Mermaid renderer / sanitizer / attachment manager | Not created — deferred to MS-0003+ (NG-1, NG-4). |

## 17. ACCEPTANCE CRITERIA

| ID | Criterion | Linked |
|----|-----------|--------|
| AC-F1-1 | **Given** a valid `marksync.yml` with no `render.mermaid` section, **when** `loadConfig` runs, **then** the resulting `config.render.mermaid.policy` is `"code"` (the MS-0002 default). | F-1, F-4 |
| AC-F1-2 | **Given** a valid `marksync.yml` with `render.mermaid.policy: "render"`, **when** `loadConfig` runs, **then** the config is accepted (schema-valid) and the pipeline emits a code macro (documented fallback descent; no error). | F-1, F-2 |
| AC-F1-3 | **Given** the updated JSON schema and TypeScript type, **when** the joint valid/invalid config tests run, **then** all cases pass and `"code"` is accepted while invalid values are rejected. | F-1, NFR-4 |
| AC-F2-1 | **Given** a Markdown document containing a ```` ```mermaid ```` fence with valid diagram source, **when** rendered to Storage, **then** the output contains `<ac:structured-macro ac:name="code">` with `<ac:parameter ac:name="language">mermaid</ac:parameter>` and the source inside a CDATA `<ac:plain-text-body>`. | F-2 |
| AC-F2-2 | **Given** the same mermaid fence rendered N≥3 times, **when** the Storage outputs are compared, **then** they are byte-identical (**0 bytes** diff). | F-2, NFR-2 |
| AC-F3-1 | **Given** a ```` ```mermaid ```` fence containing adversarial payloads (`<script>`, `onerror=`, `javascript:`, CDATA-breakout `]]>`), **when** rendered to Storage, **then** the output contains **0** `<script>` tags, **0** live `on*` event handlers, **0** `javascript:` URIs, and **0** CDATA-breakout sequences — all payload text appears as inert escaped content inside the CDATA code body. | F-3, NFR-1 |
| AC-F4-1 | **Given** the starter template written by `marksync init`, **when** loaded via `loadConfig`, **then** `config.render.mermaid.policy === "code"`. | F-4 |
| AC-CHECK | **Given** the full repository, **when** `bun run check` runs, **then** it exits **0** (lint, format, typecheck, test, boundaries all green). | NFR-2, NFR-4 |

## 18. ROLLOUT & CHANGE MANAGEMENT (HIGH-LEVEL)

This is a small, low-risk change with no migration. Delivery order:

1. Update the config domain (type + schema enum + default) and starter
   template — the DEC-1 policy model.
2. Add golden mermaid-preservation fixtures and byte-stability tests (AC-F2-1,
   AC-F2-2).
3. Add adversarial injection-safety fixtures (AC-F3-1).
4. Add/update config-default and schema lock-step tests (AC-F1-1..3, AC-F4-1).
5. Verify `bun run check` is green (AC-CHECK).

No feature flags, no phased rollout, no communication beyond the standard PR.
The ADR-0001/ADR-0002 open-question amendments are recorded by `@doc-syncer`
in phase 7.

## 19. DATA MIGRATION / SEEDING (IF APPLICABLE)

N/A — no persistent data migration. The config change is non-breaking and
pre-release. Existing `marksync.yml` files are never mutated; `marksync init`
refuses to overwrite. No lock-file or cache format changes.

## 20. PRIVACY / COMPLIANCE REVIEW

The code policy is **local-only**: Mermaid source is preserved as text in the
Storage body and written to the configured Confluence target. No diagram
content is sent to any remote rendering service (NFR-PRIV-2). Remote rendering
(public Kroki, ADR-0002 rung 6) remains off by default and is not introduced
in this change. No new data egress paths are created.

## 21. SECURITY REVIEW HIGHLIGHTS

- **NFR-SEC-5 (converter injection safety).** The code policy is safe by
  construction: Mermaid source is CDATA-wrapped and the `language` parameter is
  XML-escaped, so adversarial payloads (`<script>`, `onerror=`, `javascript:`,
  `]]>`) cannot inject executable content or break out of the code body. This
  is proven with adversarial fixtures (AC-F3-1). The `]]>` CDATA-terminator
  sequence is split by the existing `cdata()` helper so the section stays
  well-formed (GH-20 spike-H6 rule).
- **No new attack surface.** This change introduces no renderer, no DOM
  execution, no network calls, and no new dependencies. The security posture
  is strictly tighter than the original story's scope (which would have
  executed Mermaid's JS in a headless DOM).

## 22. MAINTENANCE & OPERATIONS IMPACT

Negligible. The change makes existing behavior explicit and tested; it
introduces no new runtime components, no new dependencies, and no operational
procedures. The config surface gains one enum value and a corrected default.
When the renderer lands in MS-0003+, the `"render"` policy activates without a
config migration (forward-compatible by design).

## 23. GLOSSARY

| Term | Definition |
|------|------------|
| `code` policy | ADR-0002 fallback rung 7: preserve the raw Mermaid source as a Confluence code macro with `language=mermaid` instead of rendering. Deterministic, safe, reversible. |
| Fallback ladder | ADR-0002's ordered descent chain (rungs 1–7) from the preferred in-process renderer to the `code` policy last resort. MS-0002 operates at rung 7. |
| CEO-DEC-1 | The 2026-07-13 CEO decision (under user-delegated autonomous authority) choosing Option 3: ship the `code` policy as the MS-0002 default; defer rendering to MS-0003+. |
| H4 FAIL | The GH-11 spike fidelity verdict (0/5): happy-dom/jsdom have no SVG layout engine (`getBBox` returns zeros), so no canonical diagram type renders faithfully. |
| CDATA | XML `<![CDATA[…]]>` section used for code-macro bodies; content inside is treated as literal text, not parsed as XML. |

## 24. APPENDICES

- **Appendix A — Re-scope decision chain.** GH-11 spike (2026-07-06, H4 FAIL)
  → ADR-0001 revisit trigger activated → OPEN-Q1 on GH-25 (blocking) →
  CEO-DEC-1 (2026-07-13, Option 3) → this spec. The story file's
  "Do not start delivery" banner is resolved.
- **Appendix B — ADR-0002 fallback ladder (rung 7 = MS-0002).** Rungs 1–6
  (in-process renderer, persistent-browser `mmdc`, shell `mmdc`, container,
  self-hosted Kroki, public Kroki) are all deferred. Rung 7 (`code` policy)
  is the MS-0002 operating default.

## 25. DOCUMENT HISTORY

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-07-13 | spec-writer (AI) | Initial specification — re-scoped per CEO-DEC-1 (code policy as MS-0002 default); resolves policy-model mismatch (DEC-1); full render deferred to MS-0003+ (DEC-2). |

---

## AUTHORING GUIDELINES

This spec was authored from the clarify_scope planning context (PM notes,
resolved questions, CEO-DEC-1) and the existing repository docs (ADR-0001,
ADR-0002, GH-11 spike findings, feature spec, GH-15 config system, GH-20
Markdown pipeline). Key authoring decisions:

- **Re-scope fidelity.** The spec explicitly supersedes the original story
  scope (full in-process renderer) and documents the re-scope chain so a reader
  understands why the spec is small. CEO-DEC-1 and ADR-0002 rung 7 are cited as
  the authority.
- **Policy-model resolution (DEC-1).** The pre-existing enum/ADR mismatch was
  resolved by adding `"code"` to the enum (aligned with ADR-0002 terminology),
  making `"code"` the default (correcting the misleading `"render"`), and
  documenting that all three values produce the same code-macro output in
  MS-0002 (no renderer exists; `"render"`/`"skip"` are forward-compatible
  placeholders). This avoids introducing pipeline branching that would be
  premature without a renderer.
- **Proportionality.** Capabilities, ACs, and risks are scoped to a small
  story: the behavior already exists; this change makes it explicit, tested,
  correctly defaulted, and documented. No implementation details, file paths,
  or code-level tasks are included.
- **No invention.** All facts are sourced from planning context and repository
  docs. The sole unresolved item (OQ-1: whether `skip` should differ
  observably from `code` in MS-0002) is resolved for MS-0002 and flagged for
  MS-0003 revisit.

## VALIDATION CHECKLIST

- [x] `change.ref` matches provided `workItemRef` (GH-25)
- [x] `owners` has at least one entry (Juliusz Ćwiąkalski)
- [x] `status` is "Proposed"
- [x] All sections present in order (1-25 + guidelines + checklist)
- [x] ID prefixes consistent and unique (F-, AC-, NFR-, RSK-, DEC-, DM-, OQ-)
- [x] Acceptance criteria reference at least one F-/NFR- ID and use Given/When/Then
- [x] NFRs include measurable values
- [x] Risks include Impact & Probability
- [x] No implementation details (no file-level code paths, no step-by-step tasks)
- [x] No content duplicated from linked docs
- [x] Front matter validates per front_matter_rules
