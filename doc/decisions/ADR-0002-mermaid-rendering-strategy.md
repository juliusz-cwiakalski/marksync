---
# Copyright (c) 2025-2026 Juliusz Ćwiąkalski (https://www.cwiakalski.com | https://www.linkedin.com/in/juliusz-cwiakalski/ | https://x.com/cwiakalski)
# MIT License - see LICENSE file for full terms
id: ADR-0002
decision_type: adr
status: Accepted
created: 2026-07-03
decision_date: null
last_updated: 2026-07-13
summary: "Reuse the official Mermaid library with content-hash attachment naming; defer the exact headless-rendering mechanism to a spike with a documented fallback ladder."
owners:
  - Juliusz Ćwiąkalski
service: marksync-cli
decision_area: architecture
decision_scope: repo
reversibility: moderate
review_date: null
business_impact: "Determines diagram fidelity, privacy posture, and whether MarkSync works without org-level Confluence Mermaid plugins."
customer_impact: "Diagrams render as attached images; unchanged diagrams are not re-rendered or re-uploaded."
classification:
  domains: [architecture, security, privacy]
  archetype: design
  environment: complex
  rigor: R2
  reversibility: moderate
  stakes: high
  urgency: medium
  uncertainty: high
  blast_radius: team
  recurrence: one-off
governance:
  driver: Juliusz Ćwiąkalski
  decider: Juliusz Ćwiąkalski
  contributors: []
  reviewers: []
  performers: [Juliusz Ćwiąkalski]
  informed: []
ai_assistance:
  used: true
  roles: [analyst, record-writer]
  external_data_shared: false
  citations_verified: false
  human_decider: Juliusz Ćwiąkalski
  reviewers: []
revisit_triggers:
  - "The headless-rendering spike proves in-process `mermaid.render()` cannot produce deterministic SVG/PNG without bundling Chromium."
  - "Mermaid upstream changes break headless/jdom rendering in a way that forces a container dependency."
  - "A higher-fidelity or lower-dependency rendering path becomes available (e.g., a maintained WASM build of Mermaid)."
links:
  related_changes: ["GH-11", "GH-25"]
  supersedes: []
  superseded_by: []
  spec: ["../inception/system-specification-draft-from-ai-brainstorm.md"]
  contracts: []
  diagrams: []
  decisions: [ADR-0001]
  experiments: []
  metrics: []
  roadmap_items: []
---

# ADR-0002: Mermaid rendering strategy

## Context

> **Migration note:** This record was authored pre-inception in `doc/inception/decisions/` and migrated to the canonical ADOS home `doc/decisions/` during Phase 3 inception (2026-07-04). It remains `status: Proposed` pending human confirmation. Records were originally numbered in one sequence regardless of `decision_type`; on 2026-07-05 they were reclassified so each type (ADR, PDR, TDR) has its own sequence per the ADOS decision-making guide.

Mermaid and other text diagrams must be rendered to images and attached to Confluence pages, with content-hash-based filenames so unchanged diagrams are not re-rendered or re-uploaded. This is a headline MVP feature and works **even when the target organization has no Confluence Mermaid plugin** (`../inception/motivation-and-goal-notes-brain-dump.md`; spec §7.5, §9.11).

This decision **depends on ADR-0001** (TypeScript): the preferred in-process rendering path is only available because the implementation runs the official Mermaid library natively. The spec already lists "Which Mermaid renderer is mandatory in v1?" as an open question (§2.5) and records the assumption "No assumption of a production-grade pure-Go renderer" (§2.4). The spec's capability matrix (§9.11) ranks modes: local `mmdc` command (MVP), official container bundle (MVP), Confluence plugin macro (optional), Kroki/remote (optional, privacy warning), preserve code block (fallback), embedded native renderer (research).

FACT: The owner prohibits reimplementing or reverse-engineering Mermaid (NO-GO). FACT: Content-hash naming is already "Decided" in the spec (§2.2: "Mermaid uses content hashing"). FACT: Remote/third-party rendering must stay opt-in with a privacy warning (spec FR-AST-007, NFR-006). FACT: the exact headless rendering mechanism is genuinely unknown and cannot be pre-decided without a spike.

## Problem Framing (Clarified)

This decision has two separable parts with very different confidence profiles:

1. **The core architectural commitments (decidable now, high confidence):** reuse the official `mermaid` library; never reimplement; adopt content-hash attachment naming so idempotency holds.
2. **The exact headless-rendering mechanism (NOT pre-decidable, low confidence):** can `mermaid.render()` produce deterministic SVG/PNG in-process via jsdom without bundling Chromium? This is a factual question answerable only by a spike.

Reframed: lock the principles and the naming scheme now; defer the mechanism to a time-boxed spike with a pre-agreed fallback ladder so the project never blocks on the unknown.

## Constraints (Hard Requirements)

### C-1: Deterministic output (idempotency)

- **Statement:** The same Mermaid source + render options must produce the same attachment identity and therefore the same content hash, so unchanged diagrams are never re-rendered or re-uploaded. The hash is computed over the **normalized logical render input** (see [Attachment identity (hash formula)](#attachment-identity-hash-formula)), so "same bytes cross-platform" is satisfied via **logical-input hashing**, not via raw byte-equality of the rendered SVG. Byte-stability of the rendered output is verified **same-OS** (the gate); cross-OS rendered-byte drift, if any, is absorbed by a **per-OS cache key** folded into the hash input (DEC-3 / spec Q1) so the attachment identity remains stable per OS without abandoning the in-process path.
- **Source:** Spec §2.2 ("Mermaid uses content hashing"), FR-AST-003/006, NFR-002/003 (idempotency, determinism); GH-11 spike clarified the same-OS-vs-cross-OS split.
- **Verification:** Golden-fixture tests: identical inputs produce byte-identical **normalized** SVG on a given OS; the hash is identical across OSes for identical logical input; a second unchanged sync performs zero attachment writes.
- **Negotiable:** no.

### C-2: No silent failure (explicit fallback policy)

- **Statement:** When a renderer is missing or fails, behavior must follow a configured policy (`error` | `code` | `macro` fallback) and never silently drop a diagram.
- **Source:** Spec FR-AST-008; §9.11 ("missing renderer follows configured policy").
- **Verification:** Tests cover each policy branch; diagnostics name the failing diagram and renderer.
- **Negotiable:** no.

### C-3: Privacy (remote rendering is opt-in only)

- **Statement:** Any rendering path that sends source/diagram content to a remote service (e.g., Kroki) must be disabled by default and require explicit opt-in with a privacy warning.
- **Source:** Spec FR-AST-007, NFR-006; `../inception/motivation-and-goal-notes-brain-dump.md` (local-first).
- **Verification:** Default config has remote rendering off; enabling it surfaces a warning; no outbound diagram content without opt-in.
- **Negotiable:** no.

## Security Requirements

Mermaid rendering executes Markdown-supplied diagram source and emits SVG/HTML that is attached to Confluence, so it is a real attack surface, not a cosmetic one. Mermaid's `securityLevel` config controls this: `strict` (the Mermaid default) encodes HTML tags and disables click functionality; laxer modes allow more interactivity and HTML behavior. Mermaid has had **2025–2026 security advisories** covering CSS/HTML injection and XSS-related issues (see References). ADR-0002 therefore requires, for **every** renderer rung:

- **`securityLevel: "strict"` by default** — override only with an explicit, reviewed configuration.
- **`htmlLabels: false`** unless a safe, tested path proves HTML labels are sanitized end-to-end.
- **SVG sanitization before attaching** to Confluence — strip scripts, event handlers, `javascript:` URIs, and external references.
- **No external resource loading** from rendered diagrams (no remote fonts/images/`<use href=...>` to external origins) unless explicitly enabled by the user.
- **A fixture suite of malicious / edge-case Mermaid inputs** (XSS payloads, click-event injection, oversized inputs, recursion bombs) run against every supported renderer rung in CI.

These are hard requirements on the chosen renderer, not preferences. If a fallback rung cannot satisfy them, it is downgraded in the fallback ladder.

## Decision Drivers

**Technical drivers:**
- Fidelity (faithful, current Mermaid rendering).
- Determinism / idempotency (no version spam, no needless re-uploads — the failure premortem and competitor analysis both praise hash-based change detection).
- Dependency footprint (prefer in-process over bundling Chromium where feasible).

**Security / privacy drivers:**
- Source/diagram content must not leave the user's environment unless explicitly authorized.

**Operational drivers:**
- Works on target orgs that lack a Confluence Mermaid plugin (the core motivation).
- Graceful degradation with clear diagnostics.

## Mental Models & Techniques Used

- **Separation of certainties:** decouple what is decidable now (principles + naming) from what requires a spike (mechanism).
- **Inversion:** "How do we guarantee idempotency?" → hash the normalized input, not the rendered bytes alone; include renderer mode/version/format/options in the hash input.
- **Fallback ladder / graceful degradation:** define an ordered fallback chain so a missing renderer never produces a silent drop.
- **Expected Value / information value:** a short spike cheaply resolves the highest-uncertainty question (in-process headless render) before commitment.

## Maturity & Ecosystem Evidence

This evidence explains **why official Mermaid is the right compatibility invariant**, not just a preference. Mermaid is the dominant standard for text-based diagrams in developer documentation and is strategically aligned with AI-native documentation — GitHub renders Mermaid directly from fenced code blocks, and AI tooling continues to use Mermaid as a structured representation for software workflows.

| Option | Maturity / adoption | Recent activity | Fit for MarkSync | Verdict |
|--------|---------------------|-----------------|------------------|---------|
| Official `mermaid` library | Very high: ~9.9M weekly npm downloads, ~89k GitHub stars, ~9.1k forks, ~370 contributors; Snyk classifies it a "Key ecosystem project" / "Healthy." | Healthy maintenance; latest release **11.16.0** with recent commit/release signals. | Best fidelity anchor; must be used directly or indirectly. | **Confirm as invariant.** |
| In-process official Mermaid + jsdom/svgdom | Emerging / uncertain. Smaller wrappers vary in maturity: `isomorphic-mermaid` ~13 stars; `mermaid-isomorphic` ~43 stars. | Some recent activity, but not ecosystem-grade dependencies. | Best DX if it works; highest uncertainty. | **Spike-gated, not accepted yet.** |
| `@mermaid-js/mermaid-cli` / `mmdc` | High enough: official CLI, ~4.8k stars, available via npm/Homebrew; Homebrew stable tracks 11.16.0. | Active; recent releases include feature work and Windows E2E CI improvements. | Reliable fallback, but dependency-heavy (Node + Chromium). | **Best MVP fallback.** |
| `mmdc` via persistent-browser API | Mature enough, operationally heavier. | Same ecosystem as `mmdc`. | Better than shelling once per diagram (a Mermaid CLI maintainer notes reusing a Puppeteer browser speeds batch renders). | **Add as explicit alternative (fallback rung 2).** |
| Official container / Docker image | Mature enough for CI; heavy and not ideal for a local-first single binary. | Reasonable. | Good controlled fallback for CI users. | **Keep as fallback (rung 4).** |
| Kroki (project) | Mature; supports Mermaid among many diagram types via HTTP API; Docker/Podman guidance for local use. | Recent releases exist, but Kroki's bundled Mermaid may lag upstream (one release listed Mermaid 10.6.1 while Mermaid itself is 11.x). | Useful **opt-in** fallback; risk profile depends on hosting model. | **Split self-hosted vs public.** |
| Confluence Mermaid marketplace macro | Useful where installed, but violates "works without org plugin." | Active marketplace area. | Optional enhancement, not core. | **Optional macro mode only.** |
| Preserve code block | Mature, safe, deterministic; low user value (no visual diagram). | N/A. | Correct last-resort behavior. | **Keep as final fallback (rung 7).** |

The smaller server-side wrappers (`isomorphic-mermaid`, `mermaid-isomorphic`) are **not trusted as primary dependencies** because of low star/contributor counts and uneven maintenance; the spike must rely on the official `mermaid` package directly rather than on these wrappers.

## Alternatives Considered

### Per-Alternative Constraint-Compliance Evaluation

Legend: ✅ = passes · ❌ = fails · ⚠️ = passes only via an accepted-risk exception.

|          | C-1 (deterministic) | C-2 (no silent failure) | C-3 (privacy: remote opt-in) |
|----------|---------------------|--------------------------|-------------------------------|
| Reimplement Mermaid | ⚠️ (self-controlled, but fidelity/maintenance risk) | ✅ | ✅ |
| Always shell to `mmdc` (primary) | ✅ | ✅ | ✅ |
| In-process official lib via jsdom (preferred, spike-gated) | ✅ (if deterministic) | ✅ (via fallback ladder) | ✅ |

### Alternative 0 — Reimplement / reverse-engineer Mermaid

- **Summary:** Build a native Mermaid renderer.
- **Pros:** Full control over output and determinism; no JS dependency.
- **Cons:** Massive, fragile maintenance burden; will always lag official Mermaid syntax; rejected by owner.
- **Constraint compliance:** C-1 ⚠️ (deterministic in theory, but fidelity risk); C-2 ✅; C-3 ✅.
- **Why rejected:** **Owner NO-GO.** Out of scope permanently.

### Alternative 1 — Always shell to `mmdc` as the primary path

- **Summary:** Render by invoking the official `mmdc` CLI (Node + Chromium) or the official container on every render.
- **Pros:** Uses the official library; well-understood; matches spec §9.11 MVP rows.
- **Cons:** Heavy external dependency (Node + Chromium or container); slower; reintroduces environment-failure risk (failure premortem §7).
- **Constraint compliance:** C-1 ✅; C-2 ✅; C-3 ✅.
- **Why rejected as primary:** Viable as a **fallback**, but not the preferred primary path under ADR-0001, which exists precisely to run Mermaid in-process. Kept as rung 3 of the fallback ladder (shell to local `mmdc`).

### Alternative 1b — Official Mermaid CLI programmatic renderer with persistent browser

- **Summary:** Drive the official `@mermaid-js/mermaid-cli` package programmatically, keeping one Puppeteer/Chromium browser instance alive across many diagrams instead of shelling out once per render.
- **Pros:** Uses the official library; avoids the per-invocation browser-startup cost that a Mermaid CLI maintainer explicitly flagged as the reason repeated `mmdc` calls are slow; far better throughput than shelling per diagram.
- **Cons:** Still requires a Chromium runtime; more operational coupling than a one-shot shell command; determinism must still be verified (C-1).
- **Constraint compliance:** C-1 ⚠️ (determinism must be verified, like all non-trivial rungs); C-2 ✅; C-3 ✅.
- **Why ranked rung 2:** Better than shelling once per diagram (rung 3) but heavier than the in-process no-browser path (rung 1); kept as the second rung of the fallback ladder.

### Alternative 2 — In-process official library via a headless DOM (PREFERRED; spike-gated)

- **Summary:** Run the official `mermaid` npm package in-process (made possible by ADR-0001), with a headless DOM library — **happy-dom preferred per TDR-0004** (Bun-compatible; used by the Mermaid-DOM test tier), **jsdom as fallback** — providing the DOM, to render to SVG/PNG without bundling Chromium.
- **Pros:** No external Node/Chromium/container requirement for the common case; fastest; best fits the single-binary promise; reuses the official library.
- **Cons:** Unproven — must be confirmed by a spike; Mermaid assumes a browser-like DOM and may need shims; determinism must be verified (C-1).
- **Constraint compliance:** C-1 ✅ (conditional on spike confirming determinism); C-2 ✅ (via fallback ladder); C-3 ✅.
- **Why chosen (as the design target):** Best fit with ADR-0001 and the single-binary promise, gated on the spike.

## Decision

ADR-0002 is structured in **two layers** with materially different confidence profiles. The record is governance-`Accepted` (the containing PR merged to `main`; see `00-index.md` migration note). The **substantive** acceptance state is split: **Part A = accepted-direction; Part B = spike-gated.** The GH-11 spike (2026-07-06) produced a PARTIAL verdict — Part A holds; Part B's fidelity stop criterion FAILED, so Part B does not advance to `spike-validated` (see the "Spike outcome" subsection below) and MS-0002 descends to fallback rung 7 (`code` policy).

### Accepted invariant (Part A — accepted-direction)

MarkSync will render Mermaid diagrams using the **official Mermaid implementation**, directly or indirectly. MarkSync will **never reimplement or reverse-engineer Mermaid** (owner NO-GO). Diagram attachment identity is content-hash based so idempotency holds — unchanged diagrams are never re-rendered or re-uploaded:

- **Filename:** `marksync-mermaid-<first-24-sha256-hex>.<ext>`
- **Hash input:** see [Attachment identity (hash formula)](#attachment-identity-hash-formula) below.

Remote rendering stays opt-in with a privacy warning at every layer (C-3).

### Spike-gated primary renderer (Part B — NOT accepted until the spike passes)

The preferred primary renderer is an **in-process official Mermaid renderer using a headless DOM library (happy-dom preferred per TDR-0004; jsdom as fallback)**, but it is **not** accepted as the production renderer until the ADR-0002 spike proves **all** of the following stop criteria:

1. **Byte-stable normalized SVG output** for unchanged input on a given OS (same-OS byte-stability is the gate); cross-OS stability is **hash-stable** via a per-OS cache key folded into the hash input (per [Attachment identity (hash formula)](#attachment-identity-hash-formula) and DEC-3), not raw byte-equality of the rendered SVG.
2. **No hidden browser/Chromium runtime dependency** is required to satisfy (1).
3. **Bun single-binary compatibility** (ADR-0001) is preserved.
4. **Acceptable rendering fidelity** for the canonical Mermaid subset.
5. **Safe Mermaid configuration defaults** (see [Security Requirements](#security-requirements)).

Until the spike passes, Part B remains an **unresolved implementation choice**; the MVP baseline is "official Mermaid output via whichever fallback rung passes determinism + security tests," not "in-process jsdom."

#### Spike outcome (GH-11, 2026-07-06) — PARTIAL; Part B does **NOT** advance to `spike-validated`

The GH-11 spike ([findings](../../findings/mermaid-render-spike-findings.md)) produced a **PARTIAL** verdict. Against the five stop criteria:

| # | Stop criterion | Verdict | Note |
|---|---|---|---|
| 1 | Byte-stable normalized SVG (same-OS) | **PASS (caveat)** | Byte-stable for the 2/5 fixtures that render (flowchart, gantt). Cross-run drift on the gantt `today` line is normalized away (Rule 5). Cross-OS was **not** exercised (single Linux/x64 host); the per-OS cache key (DEC-3) is the documented mechanism for cross-OS idempotency. |
| 2 | No hidden Chromium dependency | **PASS** | `bun pm ls --all` (transitive) → 0 `puppeteer`/`playwright`/`chromium`; runtime process delta 0. |
| 3 | Bun single-binary compatibility | **PASS** | Full pipeline runs under Bun 1.1.34, no Node-only fallback. |
| 4 | Acceptable rendering fidelity | **FAIL (0/5)** | happy-dom has **no SVG layout engine** — `SVGElement.prototype.getBBox` returns `{0,0,0,0}`. Sequence/class/state throw during render; flowchart/gantt produce degenerate output (no `<svg>` root, default 60×30 boxes, gantt negative widths). jsdom (next escalation rung) would also fail — no layout engine either. |
| 5 | Safe Mermaid defaults | **PASS** | `securityLevel:"strict"` active; 0 `<script>`/event-handler/`javascript:` in adversarial output. Scope: validates Mermaid default-config XSS/script safety only; full SVG sanitization is deferred to MS-0003+. |

**Consequence:** stop criterion #4 (fidelity) FAILS, so **Part B does NOT advance to `spike-validated`**. For **MS-0002**, MarkSync descends the fallback ladder to **rung 7 — the `code` policy** (preserve the raw Mermaid code block instead of rendering). This **does not block MS-0002**. The catastrophic-FAIL escalation (no deterministic path at all) is **not** triggered — a deterministic path exists for the renderable fixtures; the finding that *faithful* no-Chromium rendering is not achievable with happy-dom or jsdom **activated** the ADR-0001 revisit trigger for owner review, which is **resolved by CEO-DEC-1 (2026-07-13)** — MS-0002 ships rung 7, full rendering deferred to MS-0003+, ADR-0001 stands (see ADR-0001 and the Revision History). A faithful in-process render would require either a Chromium-based path (violates ADR-0001's single-binary/no-Chromium promise — owner decision) or a validated SVG-layout shim (`svgdom` / canvas-measured `getBBox` polyfill — needs a follow-up spike).

### Fallback ladder (ordered, from preferred to last resort)

If the in-process renderer fails any stop criterion, descend this ladder. Every rung must still satisfy C-2 (no silent failure) and C-3 (privacy):

1. **In-process, no-browser official Mermaid render** (preferred, spike-gated — Part B above).
2. **Official Mermaid CLI programmatic renderer with a persistent browser** — better than shelling once per diagram; the Mermaid CLI maintainer notes repeated `mmdc` calls are slow because each run starts a new Puppeteer browser, and reusing the browser speeds batch rendering.
3. **Shell to local `mmdc`** (official `@mermaid-js/mermaid-cli` executable).
4. **Containerized `mmdc`** (official container image; well-suited to CI).
5. **Self-hosted Kroki** (privacy-compatible; user-operated endpoint; no third-party egress).
6. **Public Kroki** — **opt-in only, explicit privacy warning** (sends diagram content to a third-party endpoint).
7. **Preserve code block** (last resort; deterministic and safe, but no visual diagram).

Kroki is deliberately split into rungs 5 and 6 because **self-hosted Kroki** and **public Kroki** have materially different risk profiles: self-hosted keeps diagram content inside the user's environment, while public Kroki is a third-party data egress and must never be a default.

### Attachment identity (hash formula)

Attachment identity is derived from the **normalized logical render input**, not from rendered bytes alone. Mermaid output may include generated IDs, timestamps, random-looking prefixes, font/layout variation, or dependency-version drift; therefore byte determinism is tested **separately** and is not the sole source of identity.

```text
hash = sha256(
  marksync-mermaid-render-v1
  + normalized_mermaid_source
  + renderer_family
  + renderer_version
  + output_format
  + theme
  + security_config
  + font_policy
  + scale
  + background
)
```

- Rendered bytes are tested separately for cross-OS determinism (golden fixtures) but do **not** define identity.
- The `marksync-mermaid-render-v1` prefix is a normalization-version tag, bumped whenever the hash-input canonicalization changes.

### Output format (SVG vs PNG)

- **Default to SVG** if Confluence Cloud storage/rendering tests pass for: image-macro display, **PDF export**, **mobile view**, and **page copy**.
- **Allow PNG fallback** per diagram or globally when SVG rendering/export is poor for a given renderer + Confluence combination.
- The hash input includes `output_format`, so an SVG↔PNG switch for the same source produces a distinct (and correct) attachment identity.

> **AI-assistance disclosure:** This analysis is AI-assisted. The record is governance-`Accepted` (merged PR). Substantively, Part A is accepted-direction and Part B remains spike-gated; the GH-11 spike FAILED Part B's fidelity stop criterion, so MS-0002 ships fallback rung 7 (`code` policy) — see the Spike outcome above and the Revision History.

### Constraint Compliance Attestation

- **C-1 (deterministic / idempotent) — ⚠️ Conditionally satisfied; same-OS byte-stability evidenced, cross-OS via per-OS hash key.** The GH-11 spike (2026-07-06) evidenced **same-OS byte-stable normalized SVG** for the renderable fixtures on a single Linux/x64 host; **cross-OS was not exercised** (single host). Cross-OS idempotency is provided by the hash-formula design (logical-input hashing) plus a per-OS cache key (DEC-3), so identical logical render input yields identical attachment identity per OS even if raw rendered bytes drift across OSes. Part B still does not advance to `spike-validated` because C-1's underlying renderer is gated on **all** stop criteria, and stop criterion #4 (fidelity) FAILED.
- **C-2 (no silent failure) — ✅ Full compliance (design):** a missing/failed renderer follows the configured `error`/`code`/`macro` policy; the fallback ladder guarantees no silent drop.
- **C-3 (privacy: remote opt-in) — ✅ Full compliance (design):** remote rendering (public Kroki) is off by default and requires explicit opt-in with a privacy warning; self-hosted Kroki keeps content in-environment.

Because C-1 is conditional on the spike, **accepted-risk exceptions may be required** if the spike fails and MVP must ship on a fallback rung whose determinism is weaker than in-process; any such exception would be recorded here when it arises.

## Trade-offs & Consequences

### Positive Outcomes

- Diagram fidelity tracks official Mermaid for free.
- Idempotent, no version/watcher spam (competitor-praised behavior).
- Works on orgs without a Confluence Mermaid plugin.
- Privacy-preserving by default.

### Negative Outcomes

- The in-process path is unproven until the spike; if it fails, the fallback reintroduces a Node/Chromium/container dependency for rendering only (not for the core CLI).
- Determinism of headless SVG/PNG must be actively verified (font availability, layout nondeterminism).

### Unresolved Questions

- [x] Can `mermaid.render()` produce deterministic SVG headless via happy-dom/jsdom without Chromium? — **Resolved by GH-11 (2026-07-06):** the in-process path runs and is same-OS byte-stable (H1/H2/H3 PASS), but it does **not** produce faithful output (H4 FAIL 0/5) because happy-dom and jsdom lack an SVG layout engine (`getBBox` returns zeros). Faithful rendering requires Chromium or a validated SVG-layout shim.
- [ ] Which output format is the v1 default (SVG vs PNG) considering Confluence attachment fidelity + determinism? (owner: Juliusz Ćwiąkalski)
- [ ] How to normalize Mermaid source for a stable hash without altering semantics? (owner: Juliusz Ćwiąkalski) — partial: the spike's digest-normalization rules (incl. the gantt `today`-line strip) are recorded in the GH-11 findings §5 for MS-0003+ reuse.
- [x] **Owner decision (CEO-level):** given the H4 FAIL, is a faithful no-Chromium in-process render still viable for ADR-0001/ADR-0002 (via a validated SVG-layout shim such as `svgdom`/canvas `getBBox`), or does MS2-E4-S1 require a Chromium-based path that breaks ADR-0001's single-binary promise? — **Resolved by CEO-DEC-1 (2026-07-13):** MS-0002 ships the `code` policy (rung 7) as the default; full in-process rendering deferred to MS-0003+; ADR-0001 NOT revisited. The `code` policy is implemented, tested, and correctly defaulted under GH-25.

## Implementation Plan

1. **Spike first (highest information value):** validate in-process `mermaid.render()` via jsdom on Linux, macOS, Windows; capture determinism evidence.
2. Implement the `Renderer` interface (spec §9.11) with the official library behind it.
3. Implement content-hash naming exactly per spec §9.11.
4. Implement the fallback ladder with the configured policy (FR-AST-008) and clear diagnostics.
5. Keep remote rendering behind an explicit opt-in flag with a privacy warning (FR-AST-007, NFR-006).
6. Add golden fixtures and cross-OS determinism tests.

## Verification Criteria

- **Metric: Idempotent upload** — Target: a second unchanged sync performs zero Mermaid attachment writes — Window: vertical slice.
- **Metric: Determinism** — Target: same source + options → byte-identical output + identical hash on all supported OSes — Window: spike + CI.
- **Metric: Fallback policy coverage** — Target: each policy branch (`error`/`code`/`macro`) and each fallback-ladder rung has a passing test — Window: MVP.
- **Metric: Privacy default** — Target: default config sends no diagram content to any remote endpoint — Window: MVP (privacy test).

## Confidence Rating

**Medium-High** on Part A (the core commitments are well-grounded in already-Decided spec items and the owner NO-GO). **Low** on Part B (the exact mechanism is genuinely spike-gated; AI confidence here is not evidence).

## Lessons Learned (Retrospective)

TODO: Populate after implementation.

## References

- `../inception/system-specification-draft-from-ai-brainstorm.md` — §2.2 (Mermaid hashing Decided), §2.4 (no pure-Go renderer assumption), §2.5 (open question: Mermaid renderer), §7.5 (FR-AST-005…010), §9.11 (capability matrix, hash input, filename), §16 (renderer fidelity / remote-leak risks).
- `../inception/motivation-and-goal-notes-brain-dump.md` — render Mermaid to images, hash-based change detection, works without org plugin.
- `../inception/marksync-failure-premortem-and-anti-failure-playbook-2026-07-02.md` — §7 (renderer-missing failure mode), §13.7 (do not support every diagram language).
- `../inception/marksync-category-leadership-strategy-report-2026-07-02.md` — §19 (content fidelity strategy).
- `../inception/open-source-git-markdown-confluence-sync-report-2026-07-02.md` — §8 (diagrams as decision-driving features), §9 (round-trip fidelity).
- Related decision: ADR-0001 (implementation language) — this ADR depends on it.
- Mermaid security advisories (2025–2026, CSS/HTML injection / XSS): https://github.com/mermaid-js/mermaid/security/advisories
- Mermaid package health (Snyk — "Key ecosystem project" / "Healthy", ~9.9M weekly downloads, ~89k stars, ~370 contributors, v11.16.0): https://security.snyk.io/package/npm/mermaid
- Mermaid `securityLevel` config docs (`strict` default): https://mermaid.ai/open-source/config/schema-docs/config.html
- Mermaid CLI (`@mermaid-js/mermaid-cli` / `mmdc`, ~4.8k stars) and the maintainer note on reusing a Puppeteer browser for batch rendering (Discussion #4806): https://github.com/mermaid-js/mermaid-cli , https://github.com/orgs/mermaid-js/discussions/4806
- Kroki (supports Mermaid via HTTP API) and Docker/Podman self-hosting guidance: https://github.com/yuzutech/kroki , https://docs.kroki.io/kroki/setup/use-docker-or-podman/
- Confluence Cloud SVG rendering engine (CONFCLOUD-1762) and image/attachment display docs: https://jira.atlassian.com/browse/CONFCLOUD-1762 , https://support.atlassian.com/confluence-cloud/docs/display-files-and-images/
- GitHub Docs — creating Mermaid diagrams in Markdown (ecosystem alignment): https://docs.github.com/en/get-started/writing-on-github/working-with-advanced-formatting/creating-diagrams
- Review driving these amendments: `tmp/decision-reviews/ADR-0002-review.md`

## Revision History

- **2026-07-03** — Initial record authored pre-inception, migrated to the canonical home `doc/decisions/` during Phase 3 inception (2026-07-04).
- **2026-07-05** — Amended per `tmp/decision-reviews/ADR-0002-review.md`:
  - Split the decision into an **accepted invariant** (Part A — official Mermaid, no reimplementation, content-hash naming) and a **spike-gated primary renderer** (Part B — in-process jsdom is *not* accepted until the spike proves byte-stable cross-OS SVG, no hidden Chromium dependency, Bun single-binary compatibility, acceptable fidelity, and safe Mermaid config defaults).
  - Downgraded **C-1** from "Full compliance" to **conditionally satisfied only after the renderer spike passes**, and removed the "no accepted-risk exceptions are required" claim (exceptions may be required if MVP ships on a weaker fallback rung).
  - Added a **Maturity & Ecosystem Evidence** section (Mermaid, in-process wrappers, `mmdc`, persistent-browser `mmdc`, container, Kroki, Confluence macro, preserve-code-block) with adoption/recent-activity data.
  - Added a **Security Requirements** section (`securityLevel: "strict"`, `htmlLabels: false`, SVG sanitization, no external resource loading, malicious-input fixture suite) referencing Mermaid's 2025–2026 security advisories.
  - Expanded the **fallback ladder** to seven rungs and **split Kroki** into self-hosted (privacy-compatible, rung 5) vs public (opt-in with privacy warning, rung 6).
  - Rewrote the **attachment-identity hash formula** to hash logical render input (`marksync-mermaid-render-v1` + normalized source + renderer family/version + output format + theme + security config + font policy + scale + background), with byte determinism tested separately.
  - Added **SVG-vs-PNG decision criteria** (default to SVG pending Confluence Cloud display/PDF/mobile/page-copy tests; per-diagram or global PNG fallback).
  - Status (governance) remains `Accepted` (merged PR); substantively Part A is accepted-direction and Part B stays spike-gated.
- **2026-07-06 (GH-11, lifecycle phase 7 reconciliation)** — Reconciled ADR-0002 with the GH-11 Mermaid headless-render spike (`findings/mermaid-render-spike-findings.md`):
  - **§F1 (MAJOR):** reworded Part B **stop criterion #1** from "byte-stable SVG across Linux, macOS, and Windows" to **same-OS byte-stable normalized SVG; cross-OS hash-stable via per-OS cache key in the hash input** (DEC-3); clarified **C-1** so "cross-platform same bytes" is satisfied via the hash formula (logical-input hashing), not raw byte-equality of rendered SVG. The spike gates on same-OS (the story-authoritative bar); cross-OS idempotency is the per-OS cache key.
  - **Cross-OS attestation:** recorded the actual cross-OS result in the Constraint Compliance Attestation — **same-OS only** (single Linux/x64 host); per-OS cache key (DEC-3) is the documented mechanism for cross-OS idempotency.
  - **H4 FAIL consequence (load-bearing):** Part B does **NOT** advance to `spike-validated`. The spike produced a PARTIAL verdict — H1/H2/H3/H5 PASS, **H4 (fidelity) FAIL (0/5)** because happy-dom/jsdom lack an SVG layout engine (`getBBox` returns zeros). **MS-0002 descends the fallback ladder to rung 7 (`code` policy)**; this does not block MS-0002. Added a "Spike outcome" subsection and an Unresolved-Question owner-decision flag for ADR-0001/ADR-0002.
  - **§F4:** reconciled the pre-existing frontmatter-vs-body status mismatch. The record is governance-`Accepted` (consistent with `00-index.md` migration note — merged PR); the body now states this explicitly and distinguishes governance status from the substantive Part A (accepted-direction) / Part B (spike-gated-FAIL) split, instead of the stale "remains `Proposed`" wording.
  - Resolved the first Unresolved Question (deterministic headless SVG) per the spike; `last_updated` bumped to 2026-07-06; `links.related_changes` extended with `GH-11`.
  - The catastrophic-FAIL ADR-0001 escalation is **not** triggered, but the ADR-0001 revisit trigger **is** activated (see ADR-0001).
- **2026-07-06** — Headless-DOM library clarified: **happy-dom is the preferred headless DOM for the in-process renderer and the Mermaid-DOM test tier** (per TDR-0004 and `.ai/rules/testing-strategy.md`, which post-date this ADR and chose happy-dom for Bun compatibility); **jsdom is the documented fallback/escalation** if happy-dom cannot shim a required Mermaid browser API. The ADR's earlier "jsdom" wording described the consideration space at authoring time; this amendment aligns the decision with the later tooling decisions without changing Part A/B semantics. The MS-0002 spike (E1-S1) and the production renderer (E4-S1) target happy-dom. (CEO-agent authorized under user-delegated autonomous authority; reconciles an inconsistency the owner already resolved in TDR-0004.)
- **2026-07-13 (GH-25, lifecycle phase 7 reconciliation)** — Resolved the CEO-level owner decision left open by GH-11:
  - **CEO-DEC-1 (2026-07-13, CEO-agent under user-delegated autonomous authority) chose Option 3:** MS-0002 ships the `code` policy (rung 7) as the default; full in-process Mermaid SVG rendering deferred to MS-0003+; ADR-0001 NOT revisited. Rationale: GH-11 proved happy-dom/jsdom lack an SVG layout engine (H4 FAIL 0/5); Chromium violates ADR-0001 single-binary; SVG-layout shim unvalidated; MS-0002 value is the safe publish, not rendering; code policy is deterministic + safe + reversible.
  - The `code` policy is now the **implemented, tested, and correctly-defaulted** MS-0002 operating behavior under GH-25: the `MermaidPolicy` enum is `"code" | "render" | "skip"` with `"code"` as the config default; golden fixtures + adversarial injection-safety tests prove mermaid fences are preserved byte-stable as code macros.
  - Resolved the last Unresolved Question (CEO-level owner decision) per CEO-DEC-1; updated the Spike-outcome consequence paragraph to record the decision authority. Governance status remains `Accepted`. `last_updated` bumped to 2026-07-13; `links.related_changes` extended with `GH-25`.
