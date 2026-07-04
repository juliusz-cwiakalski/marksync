---
# Copyright (c) 2025-2026 Juliusz Ćwiąkalski (https://www.cwiakalski.com | https://www.linkedin.com/in/juliusz-cwiakalski/ | https://x.com/cwiakalski)
# MIT License - see LICENSE file for full terms
id: ADR-0002
decision_type: adr
status: Proposed
created: 2026-07-03
decision_date: null
last_updated: 2026-07-03
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
  related_changes: []
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

> **Migration note:** This record was authored pre-inception in `doc/inception/decisions/` and migrated to the canonical ADOS home `doc/decisions/` during Phase 3 inception (2026-07-04). It remains `status: Proposed` pending human confirmation. Records are numbered in one sequence (ADR-0001…) regardless of `decision_type`.

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

- **Statement:** The same Mermaid source + render options must produce the same image bytes and therefore the same content hash, cross-platform and cross-runs. Unchanged diagrams must never be re-rendered or re-uploaded.
- **Source:** Spec §2.2 ("Mermaid uses content hashing"), FR-AST-003/006, NFR-002/003 (idempotency, determinism).
- **Verification:** Golden-fixture tests: identical inputs produce byte-identical outputs across OSes; a second unchanged sync performs zero attachment writes.
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
- **Why rejected as primary:** Viable as a **fallback**, but not the preferred primary path under ADR-0001, which exists precisely to run Mermaid in-process. Kept as rung 1 of the fallback ladder.

### Alternative 2 — In-process official library via jsdom (PREFERRED; spike-gated)

- **Summary:** Run the official `mermaid` npm package in-process (made possible by ADR-0001), with jsdom providing the headless DOM, to render to SVG/PNG without bundling Chromium.
- **Pros:** No external Node/Chromium/container requirement for the common case; fastest; best fits the single-binary promise; reuses the official library.
- **Cons:** Unproven — must be confirmed by a spike; Mermaid assumes a browser-like DOM and may need shims; determinism must be verified (C-1).
- **Constraint compliance:** C-1 ✅ (conditional on spike confirming determinism); C-2 ✅ (via fallback ladder); C-3 ✅.
- **Why chosen (as the design target):** Best fit with ADR-0001 and the single-binary promise, gated on the spike.

## Decision

**Recommendation:** Two-part decision.

**Part A — Core commitments (decidable now):**
1. Reuse the official `mermaid` library; **never reimplement or reverse-engineer Mermaid** (owner NO-GO).
2. Adopt the spec §9.11 content-hash naming scheme:
   - **Filename:** `marksync-mermaid-<first-24-sha256-hex>.<ext>`
   - **Hash input:** normalized Mermaid source + renderer mode/version + output format + theme/options.
3. Unchanged diagrams (same hash) are never re-rendered or re-uploaded (idempotency).

**Part B — Mechanism (spike-gated):** Target the **in-process official library via jsdom** as the primary path, validated by a time-boxed spike. If the spike fails, descend a pre-agreed fallback ladder (from spec §9.11):

1. local `mmdc` command;
2. official container bundle;
3. Kroki/remote — **opt-in only, privacy warning** (C-3);
4. preserve code block (last-resort, no visual diagram).

Remote rendering must remain opt-in with a privacy warning at every layer.

> **AI-assistance disclosure:** This analysis is AI-assisted. The human decider (Juliusz Ćwiąkalski) has **not yet** decided. `status: Proposed` until human confirmation during inception.

### Constraint Compliance Attestation

The recommended design (Part A + Part B primary path with fallback ladder) satisfies all documented constraints:

- **C-1 — ✅ Full compliance:** Hash input is normalized source + renderer mode/version + format + options; golden tests assert byte-stable output and zero re-upload on unchanged input.
- **C-2 — ✅ Full compliance:** A missing/failed renderer follows the configured `error`/`code`/`macro` policy; the fallback ladder guarantees no silent drop.
- **C-3 — ✅ Full compliance:** Remote rendering is off by default and requires explicit opt-in with a privacy warning.

No accepted-risk exceptions are required.

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

- [ ] Can `mermaid.render()` produce deterministic SVG headless via jsdom without Chromium? (spike — owner: Juliusz Ćwiąkalski)
- [ ] Which output format is the v1 default (SVG vs PNG) considering Confluence attachment fidelity + determinism? (owner: Juliusz Ćwiąkalski)
- [ ] How to normalize Mermaid source for a stable hash without altering semantics? (owner: Juliusz Ćwiąkalski)

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
