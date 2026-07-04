---
# Copyright (c) 2025-2026 Juliusz Ćwiąkalski (https://www.cwiakalski.com | https://www.linkedin.com/in/juliusz-cwiakalski/ | https://x.com/cwiakalski)
# MIT License - see LICENSE file for full terms
source: https://github.com/juliusz-cwiakalski/agentic-delivery-os/blob/main/doc/templates/roadmap-engineering-template.md
ados_distribution: redistributable
id: ROADMAP-ENGINEERING
status: Draft
created: 2026-07-03
last_updated: 2026-07-03
owners: [Juliusz Ćwiąkalski]
area: engineering
document_classification: current-truth
links:
  related_decisions: [ADR-0001, ADR-0002, ADR-0003, ADR-0004, ADR-0005]
  related_changes: []
summary: "Engineering roadmap — MVP (safe one-way publisher / trust wedge) first, then MLP (exceptional DX), then staged reverse-sync gates."
ai_assistance: "AI-assisted drafting; human-authored and approved by Juliusz Ćwiąkalski."
---

# Engineering Roadmap

_The engineering roadmap for delivery. The **Current Milestone** is first-class
and detailed; past milestones are a record; future milestones are rough. Sequencing
follows the failure-premortem's central conclusion: **prove the narrow trust wedge
before the end-state category vision** (`doc/inception/marksync-failure-premortem-and-anti-failure-playbook-2026-07-02.md`)._

> **What "the wedge" means.** _"Publish Markdown from Git to native Confluence
> pages without ever silently overwriting remote work, and explain every intended
> mutation before applying it."_ This is valuable alone, differentiates MarkSync
> from one-way incumbents, and builds the state/identity/fidelity foundation that
> later reverse sync depends on.

## Completed Milestones

| Milestone | Shipped | Outcome achieved | Links |
|---|---|---|---|
| Confluence API validation spike | 2026-07-03 | Proved the Confluence Cloud contract: Storage round-trip (27/27 GFM constructs), v2 content properties, drift 409 detection, attachments, labels, search, restrictions. De-risked the MVP's feasibility. | ADR-0004, ADR-0005; `doc/inception/integration-scenarios/` |

_(Only the spike has shipped; no product milestone has shipped yet.)_

## Current Milestone

### MVP — "Safe one-way publisher" (the trust wedge)

_The premortem's beachhead (`§14 v0.x beachhead`, `§15 Gate 1`). A best-in-class
safe one-way Git→Confluence publisher with drift detection. **Not** naive one-way
push — the differentiator is that it refuses to silently overwrite remote work._

**Deliverables:**

_Beachhead-critical items first (the wedge); validation apparatus is best-effort and may slip without blocking the wedge (premortem `§2.1`, `§8.2`)._

- Portable **TypeScript** CLI compiled to one self-contained binary per OS/arch (Linux/macOS/Windows, amd64/arm64) via Bun `build --compile` (ADR-0001).
- Repository-owned YAML config: file selection, hierarchy mirroring, document-level overrides, JSON Schema validation.
- Deterministic Markdown → Confluence Storage Format conversion for a documented canonical GFM subset (ADR-0005).
- **Document identity & shared base:** immutable MarkSync document **UUID stored in source front-matter** (survives clones/branches/CI); Confluence page ID = remote identity; title/path are mutable attributes; **duplicate-UUID detection is fatal before any write** (premortem `§5.2`, `§17 #4`); a **committed (versioned) lock file** records the shared base; the `.marksync/` cache is disposable (premortem `§5.1` separation).
- Page create / update / no-op / move with the identity above.
- **Drift detection** via **canonical semantic hashing** (raw + canonical + normalized + attachment hashes, premortem `§5.4`); classify `NO_CHANGE` / `REMOTE_BEHIND` / `REMOTE_AHEAD` / `DIVERGED` / `REMOTE_DELETED`; block unsafe overwrites by default. **Invariant:** a remotely-deleted managed page is never silently re-created.
- **Concurrency control** for CI-first operation: per-target serialization + repository/target lease + operation-ID deduplication + stale-plan expiry + CI concurrency-group templates (premortem `§5.8`) — so two overlapping CI plans can never let the older overwrite the newer.
- **Minimal repair surface** (in MVP, not deferred): `repair-state` for stale locks and interrupted-apply journal replay (premortem `§14` includes `repair` in the beachhead) — so a single stale lock or partial apply never blocks a whole subtree with no recovery.
- Visible provenance (panel/footer: source path + Git revision + last-sync) plus machine content-property metadata.
- Local images/attachments (path-safe, content-hashed, reused when unchanged).
- Mermaid diagrams rendered via the **official** library in-process, content-hashed (ADR-0001, ADR-0002). **Spike-gated:** if the ADR-0002 headless-render spike fails late, the MVP fallback is render-failure policy `code` (preserve the code block) per the ADR-0002 ladder, with full in-process render moved to MLP — a failed spike does **not** block MVP release.
- Auth: local API-token (email + token, OS keyring) and non-interactive CI credentials from environment.
- Dry-run / plan / diff before any write; stable exit codes; JSON/NDJSON output; `doctor` health-check (capability + permission discovery, premortem `§4.2`, `§7.4`).
- **MVP performance budget (NFR guardrails):** binary ≤ 90 MB; cold-start ≤ 2 s on reference hardware; targets repos ≤ ~500 managed pages (large-repo incremental optimization is deferred — correctness first, premortem `§5.9`, `§13.11`).
- **Quality gates (lightweight):** unit + integration (mocked Confluence) + golden fixtures are mandatory; a live-sandbox E2E tier runs on a **single dedicated test space** (not per-suite creation, premortem `§8.5`); Gherkin/BDD specs cover **lifecycle invariants only** (premortem `§8.2`), not exhaustive steps.

**In scope (MVP):**

- Confluence **Cloud** only; one configured page subtree per target; safe publish + drift block; the canonical GFM subset; Mermaid; assets; provenance; CI + local operation; agent-friendly output.

**Out of scope (for this milestone):**

- Reverse sync / Confluence→Git reconciliation (Gate 3+).
- Adopting an **existing** Confluence corpus into the managed set (depends on reverse sync; tracked assumption A-VAL-3).
- Automatic deletion; watch mode; webhooks; OAuth 2.0 (3LO); Data Center; comments/restrictions/whiteboards/databases; MCP server; GUI/editor plugins; hosted SaaS.
- "Exceptional DX" polish (guided init, migration helpers, sub-10-min first-publish) → that is the **MLP**, the next milestone.

### Success metrics (outcomes, not outputs)

_Outcome metrics that prove the milestone delivered user value. **Type:** Target (drive toward) vs Guardrail (block release if violated)._

| Metric | Type | Definition | Target |
|---|---|---|---|
| Publish success rate (proximate NSM) | Target | `published` ÷ **all** plan entries (CONFLICT/ERROR kept in the denominator) across beta repos | ≥ 95% |
| Drift-detection effectiveness | Guardrail | Drift correctly detected & blocked in supported remote-edit scenarios | 100% (any miss blocks release) |
| Conflict false-positive rate | Guardrail | Conflicts raised where no semantic drift exists | < 5% |
| Zero silent overwrites | Guardrail | Incidents where a remote edit was overwritten without an explicit conflict | **0** (any incident blocks release) |
| Conversion fidelity | Guardrail | Canonical GFM fixtures surviving Markdown→Storage round-trip | 100% (re-run on every subset expansion) |
| Idempotency | Target | Writes performed on a second **semantically** unchanged push | 0 |
| Traceability | Target | Managed pages with valid source + revision provenance | 100% |
| Secret redaction | Guardrail | Secrets appearing in any log/plan/state/diagnostics output | **0** (premortem `§17 #10`) |
| Beachhead validation | Target | Real teams running MarkSync in recurring CI | 3–5 retained design partners (fewer on safety/value failure → narrow, do not expand) |

### Dependencies

- **ADR-0002 Mermaid headless-render spike** must pass before MVP tooling locks — it is load-bearing for the TypeScript choice and the single-binary promise. If it requires Chromium, the language decision is revisited. A failed spike is a **language-level reconsideration and a multi-month MVP slip**, not merely a mitigation tweak; the MVP `code`-fallback above keeps the wedge shippable while full render moves to MLP.
- Bun single-binary cross-compile + signing/notarization story (clean-OS smoke).
- 3–5 design partners willing to install, test, and retain MarkSync in CI — **recruit ≥3 before MVP feature-lock; if 0 at feature-lock, slip the lock** (premortem `§18.1`).

### Validation approach

- **Method:** design-partner beta (heterogeneous repos/sites) + an **adversarial public round-trip corpus seeded by sanitized design-partner pages** (real macros/nested tables/app content the canonical subset excludes, premortem `§17.2`) + live-sandbox E2E on a dedicated test space. Track publish-success-rate, drift-effectiveness, and the zero-overwrite guardrail.
- **Partition the retention signal:** for each design partner, record *why* they did/did not retain — **safety failure vs migration-absence vs DX-friction vs capability-gap**. The retention guardrail triggers "narrow" **only on safety/value failures**; migration-absence escalates A-VAL-3 priority rather than questioning the wedge.
- **Instrument MLP signal during MVP:** capture time-to-first-publish and a setup-failure taxonomy (informational only; not MVP targets) to de-risk A-USA-1/A-USA-2 before MLP is built.
- **Decision it drives:** proceed to MLP if the wedge is retained by real teams; **narrow (do not expand) scope** only on safety/value failures. Do not advance to reverse sync on a weak wedge.

### OST / discovery linkage

| Milestone outcome | Opportunity (OST) | Solution (OST) | Experiment |
|---|---|---|---|
| Safe publish with plan/diff | O1 | S1.1 | E1.1 (validated) |
| Drift detection blocks overwrites | O1 | S1.2 | E1.2 (validated) |
| Single-binary cross-OS distribution | O2 | S2.2 | E2.2 (unvalidated) |
| In-process Mermaid fidelity | O3 | S3.1 | E3.1 (testing — load-bearing) |
| Agent/CI-operable JSON contracts | O4 | S4.1 | E4.1 (unvalidated) |

### Backlog planning readiness controls

_Proactive overlay from ADOS retrospective issues #103, #105, and #131. ADOS
does not yet enforce these gates, so this project records them explicitly._

- **Decision / assumption → backlog reconciliation:** before the first delivery
  backlog is ready, every open assumption and deferred sub-decision must have a
  backlog ticket, named AC, or explicit closure reason. See
  [`backlog-reconciliation.md`](../inception/analysis/backlog-reconciliation.md).
- **Cross-cutting coverage:** every north-star guardrail / NFR / cross-cutting
  concern (safety, security, diagnostics, performance, provenance, observability,
  maintainer sustainability) must be represented as a dedicated ticket or named
  AC — never folded invisibly into a functional slice.
- **Prospective analysis routing:** the structured
  [`failure-premortem.md`](../inception/analysis/failure-premortem.md) feeds
  risks, phase gates, and anti-roadmap constraints; the structured
  [`success-pre-parade.md`](../inception/analysis/success-pre-parade.md) feeds
  outcome metrics, decision filters, and roadmap prioritization.

## Future Milestones

_Rough, outcome-oriented placeholders. Names mirror the premortem's phase gates (`§15`). Refine as MVP approaches completion._

| Milestone | Outcome hypothesis | Rough timing |
|---|---|---|
| **MLP — Exceptional DX & easy setup** | A new user reaches first publish in ≤ 10 min (excluding Atlassian credential creation); migration from `mark`/`md2conf`/manual copy is low-friction. Guided `init`, `doctor`, progressive disclosure, polished errors, common-layout examples. (Premortem `§3.3`, `§4.2`.) | Next after MVP |
| **Drift lifecycle completeness** (Gate 2) | Drift is not just detected but repairable per-document; stale locks, moved pages, and partial-apply are recoverable without expert supervision. (Premortem `§4.3`, `§4.4`, `§5.x`.) | After MLP |
| **Reverse change capture** (Gate 3) | Confluence-side edits are captured and reverse-converted to a reviewable Markdown patch; never auto-committed. (OST O5 / S5.1.) | After Gate 2 |
| **Reviewable reconciliation** (Gate 4) | Divergence produces base/local/remote conflict bundles and a controlled review/PR workflow; structural merge only for proven node classes. (Premortem `§5.5`.) | After Gate 3 |
| **Continuous / policy-controlled sync** (Gate 5–6) | Policy-controlled continuous bidirectional behaviour for supported constructs; per-page ownership modes. | After Gate 4 |
| **Platform breadth** | Data Center adapter; OAuth 2.0 (3LO); package-manager distribution; optional MCP server. Only after Confluence Cloud is mature and the matrix is sustainable. | Later |

## Links

- Changes: _(none yet — delivery starts after inception Phase 7)_
- Decision records: ADR-0001 (TS), ADR-0002 (Mermaid), ADR-0003 (MarkSync brand), ADR-0004 (spike), ADR-0005 (Storage). To be migrated to `doc/decisions/` during inception.
- North star: [`01-north-star.md`](./01-north-star.md) · OST: [`opportunity-solution-tree.md`](./opportunity-solution-tree.md) · Assumptions: [`../inception/analysis/assumptions.md`](../inception/analysis/assumptions.md) · Risks: [`../inception/analysis/risks.md`](../inception/analysis/risks.md) · Backlog reconciliation: [`../inception/analysis/backlog-reconciliation.md`](../inception/analysis/backlog-reconciliation.md) · Failure premortem: [`../inception/analysis/failure-premortem.md`](../inception/analysis/failure-premortem.md) · Success pre-parade: [`../inception/analysis/success-pre-parade.md`](../inception/analysis/success-pre-parade.md)
