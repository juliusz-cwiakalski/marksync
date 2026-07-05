---
# Copyright (c) 2025-2026 Juliusz Ćwiąkalski (https://www.cwiakalski.com | https://www.linkedin.com/in/juliusz-cwiakalski/ | https://x.com/cwiakalski)
# MIT License - see LICENSE file for full terms
id: ADR-0002
decision_type: adr
status: Proposed
created: 2026-07-03
decision_date: null
last_updated: 2026-07-05
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

### Alternative 2 — In-process official library via jsdom (PREFERRED; spike-gated)

- **Summary:** Run the official `mermaid` npm package in-process (made possible by ADR-0001), with jsdom providing the headless DOM, to render to SVG/PNG without bundling Chromium.
- **Pros:** No external Node/Chromium/container requirement for the common case; fastest; best fits the single-binary promise; reuses the official library.
- **Cons:** Unproven — must be confirmed by a spike; Mermaid assumes a browser-like DOM and may need shims; determinism must be verified (C-1).
- **Constraint compliance:** C-1 ✅ (conditional on spike confirming determinism); C-2 ✅ (via fallback ladder); C-3 ✅.
- **Why chosen (as the design target):** Best fit with ADR-0001 and the single-binary promise, gated on the spike.

## Decision

ADR-0002 is structured in **two layers** with materially different confidence profiles. The frontmatter remains `status: Proposed` until the human decider accepts at PR merge, but the intended acceptance state — per `tmp/decision-reviews/ADR-0002-review.md` — is: **Part A = accepted-direction; Part B = spike-gated.**

### Accepted invariant (Part A — accepted-direction)

MarkSync will render Mermaid diagrams using the **official Mermaid implementation**, directly or indirectly. MarkSync will **never reimplement or reverse-engineer Mermaid** (owner NO-GO). Diagram attachment identity is content-hash based so idempotency holds — unchanged diagrams are never re-rendered or re-uploaded:

- **Filename:** `marksync-mermaid-<first-24-sha256-hex>.<ext>`
- **Hash input:** see [Attachment identity (hash formula)](#attachment-identity-hash-formula) below.

Remote rendering stays opt-in with a privacy warning at every layer (C-3).

### Spike-gated primary renderer (Part B — NOT accepted until the spike passes)

The preferred primary renderer is an **in-process official Mermaid renderer using a headless DOM approach (jsdom)**, but it is **not** accepted as the production renderer until the ADR-0002 spike proves **all** of the following stop criteria:

1. **Byte-stable SVG output** for unchanged input across **Linux, macOS, and Windows**.
2. **No hidden browser/Chromium runtime dependency** is required to satisfy (1).
3. **Bun single-binary compatibility** (ADR-0001) is preserved.
4. **Acceptable rendering fidelity** for the canonical Mermaid subset.
5. **Safe Mermaid configuration defaults** (see [Security Requirements](#security-requirements)).

Until the spike passes, Part B remains an **unresolved implementation choice**; the MVP baseline is "official Mermaid output via whichever fallback rung passes determinism + security tests," not "in-process jsdom."

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

> **AI-assistance disclosure:** This analysis is AI-assisted. The human decider (Juliusz Ćwiąkalski) has **not yet** accepted at PR merge. `status: Proposed` until human confirmation; on acceptance, Part A is accepted-direction and Part B remains spike-gated.

### Constraint Compliance Attestation

- **C-1 (deterministic / idempotent) — ⚠️ Conditionally satisfied only after the renderer spike passes.** Until the spike proves byte-stable cross-OS output for the chosen rung, Part B remains an unresolved implementation choice and C-1 cannot be claimed as fully met. The hash-formula design (logical input) and the cross-OS golden-fixture plan are the mechanisms intended to satisfy C-1; they are evidence of **design intent**, not of compliance.
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
  - Status remains `Proposed` (human accepts Part A at PR merge; Part B stays spike-gated).
