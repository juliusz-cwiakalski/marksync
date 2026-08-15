---
# Copyright (c) 2025-2026 Juliusz Ćwiąkalski (https://www.cwiakalski.com | https://www.linkedin.com/in/juliusz-cwiakalski/ | https://x.com/cwiakalski)
# MIT License - see LICENSE file for full terms
source: https://github.com/juliusz-cwiakalski/agentic-delivery-os/blob/main/doc/templates/roadmap-engineering-template.md
ados_distribution: redistributable
id: ROADMAP-ENGINEERING
status: Draft
created: 2026-07-03
last_updated: 2026-08-15
owners: [Juliusz Ćwiąkalski]
area: engineering
document_classification: current-truth
links:
  related_decisions: [ADR-0001, ADR-0002, PDR-0001, TDR-0001, ADR-0005, PDR-0002]
  related_changes: ["GH-69", "GH-81", "GH-32", "GH-92"]
summary: "Engineering roadmap — MS-0002 MVP (safe one-way publisher) shipped 2026-07-26; MS-0003 re-scoped to Company Adoption MVP (PDR-0002): conflict resolution in Git, `import`, no-external-services Mermaid, DX tail."
ai_assistance: "AI-assisted drafting; human-authored and approved by Juliusz Ćwiąkalski."
---

# Engineering Roadmap

_The engineering roadmap for delivery. Each milestone has a stable, monotonic
ID (`MS-0001`, `MS-0002`, ...). The **Current Milestone** (`MS-0003`,
re-scoped 2026-07-26 per [PDR-0002](../decisions/PDR-0002-ms0003-rescope-company-adoption-mvp.md)
after the post-`MS-0002` beta revalidation) is first-class and detailed. Later
future milestones remain high-level and include "read before planning"
references. Sequencing follows the failure-premortem's central conclusion:
**prove the narrow trust wedge before the end-state category vision**
(`doc/inception/marksync-failure-premortem-and-anti-failure-playbook-2026-07-02.md`)._

> **Milestone-ID rule.** Milestone IDs are permanent references, not semantic
> labels. If a milestone is renamed, split, or descoped, keep its existing
> `MS-<NNNN>` ID and allocate new future work to the next number. Never reuse or
> renumber milestone IDs.

> **What "the wedge" means.** _"Publish Markdown from Git to native Confluence
> pages without ever silently overwriting remote work, and explain every intended
> mutation before applying it."_ This is valuable alone, differentiates MarkSync
> from one-way incumbents, and builds the state/identity/fidelity foundation that
> later reverse sync depends on.

## Completed Milestones

| ID | Milestone | Shipped | Outcome achieved | Links |
|---|---|---|---|---|
| `MS-0001` | Confluence API validation spike | 2026-07-03 | Proved the Confluence Cloud contract: Storage round-trip (27/27 GFM constructs), content properties, drift 409 detection, attachments, labels, search, restrictions. De-risked `MS-0002` feasibility. | TDR-0001, ADR-0005; `doc/inception/integration-scenarios/` |
| `MS-0002` | MVP — Safe one-way publisher (trust wedge) | 2026-07-26 | Safe one-way publisher delivered in full: all 31 milestone issues closed, 0 open bugs, 34 merges, 1309 tests / 0 fail, all quality gates green. Wedge proven live — plan/sync/doctor/repair correct, diverged-remote safety `Block` fires, zero silent overwrites. Binary release pipeline live (`GH-32`). Beta validation happened via the maintainer's company as the first design partner (PDR-0002 revalidation input) rather than 3–5 external partners. | PDR-0002; ADR-0005, ADR-0006, ADR-0011; `GH-32`, `GH-69`, `GH-81` |

## Current Milestone

### MS-0003 — Company Adoption MVP  _(re-scoped 2026-07-26 per [PDR-0002](../decisions/PDR-0002-ms0003-rescope-company-adoption-mvp.md))_

_The first real design partner is the maintainer's company. On 2026-07-26 the
owner defined five adoption-blocking MVP goals: (1) Mermaid rendering without
public/external services, ideally in-process in the single executable;
(2) Git→Confluence sync — **already delivered in `MS-0002`**; (3) detect
Confluence-side edits and prevent overwriting — **already delivered in
`MS-0002`**; (4) conflict resolution synced back from Confluence into Git and
resolved there; (5) easy setup for 5–15 devs, LOCAL manual sync only (CI
deferred; every publication updates the lock file, which the dev commits).
This re-scope **is** the post-`MS-0002` beta revalidation the roadmap
required — the partner's goals are the revalidation input, and the retention
partition (migration-absence, not safety/value failure) escalates A-VAL-3
rather than questioning the wedge. Per the Milestone-ID rule the ID
`MS-0003` is kept; the former "MLP — Exceptional DX & easy setup" scope is
reduced to a milestone tail (deeper DX polish → `MS-0004+`)._

**Outcome hypothesis:** the company team (5–15 devs) runs MarkSync as their
docs workflow with conflicts resolved in Git — without maintainer
intervention.

**Deliverables (epic structure):**

- **E1 — Reverse converter foundation** (subset of `MS-0005` pulled forward):
  Storage Format → Markdown for the canonical GFM subset (ADR-0005); stable
  unsupported-construct diagnostics (codes + locations); golden-fixture
  round-trip verification. **Delivered (GH-92, v0.9.0):** library-only
  converter (`reverseStorage`/`reverseStorageCollectAll` + `normalizeMarkdown`)
  with the two-class diagnostics taxonomy and the partition-manifest round-trip
  harness — see
  [feature-reverse-conversion.md](../spec/features/feature-reverse-conversion.md).
- **E2 — `resolve` patch flow** (subset of `MS-0006` pulled forward):
  the remote-side diff is the patch between (a) the Confluence version that
  originated from the last marksync publish (base version, recorded in the
  committed lock file, ADR-0006) and (b) the current Confluence version — both
  reverse-converted to Markdown, then diffed as Markdown. The human
  applies/merges the patch in Git, commits, and re-syncs; the follow-up sync
  publishes the merged result and records the new base. **Git is the final
  arbiter; nothing is auto-committed.** Preceded by a small spike: fetch page
  body at historical version N.
- **E3 — `marksync import` command** (A-VAL-3 activation): explicitly adopts a
  Confluence-originated page into Git — reverse-convert to Markdown, assign
  UUID v7 frontmatter, add a lock entry with current remote hashes so the
  first sync is a NoOp. From that moment Git is the source of truth for that
  page.
- **E4 — No-external-services Mermaid** (ADR-0002 territory reopened): expose
  renderer engine configuration including a self-hosted Kroki endpoint
  (today `src/infra/mermaid/kroki.ts` hardcodes `https://kroki.io` with an
  internal-only override); run a new time-boxed in-process spike (DOM
  emulation + deterministic synthetic text metrics) after the GH-11 partial
  failure, with the pre-committed ladder: in-process → self-hosted endpoint →
  `code` policy. Rendering must not call public services by default; the
  opt-in public-Kroki `render` policy (GH-69) is unchanged.
- **E5 — Adoption/DX tail** (reduced, sequenced after conflict resolution):
  guided `init` polish, common-layout examples, and a first user guide focused
  on the company team's local-manual-sync flow; the ≤10-min first-publish
  headline metric is demoted; deeper DX polish moves to `MS-0004+`;
  CI-driven sync is deferred.

**Ownership model (normative, owner direction 2026-07-26):**

- Git-originated, marksync-managed documents: **Git is the ultimate source of
  truth**; Confluence-side manual edits are synced back into Git via the
  `resolve` flow.
- Confluence-originated, unmanaged documents: stay in Confluence —
  **Confluence remains their source of truth; marksync must never touch
  them**. `marksync import` is the only transition mechanism.
- Unsupported Confluence constructs (macros, complex layouts): on `import`
  and on conflict resolution the user must be clearly informed (stable
  diagnostic codes + locations); manual Confluence edits adding
  Markdown-unrepresentable macros must be explicitly resolvable (edit the page
  to remove, or an adopt-verbatim escape hatch) — never silently dropped.

**In scope (`MS-0003` / Company Adoption MVP):** E1–E5 above; the company
team's real corpus as the validation vehicle; ownership-model enforcement
(managed/unmanaged boundary).

**Out of scope (for this milestone):** full reverse sync (`MS-0005` remainder:
full change capture); conflict bundles / structural merge / review workflow
(`MS-0006` remainder); CI-driven sync; Data Center; OAuth 2.0 (3LO); MCP
server; GUI/editor plugins; hosted SaaS; broad public-user DX activation
(`MS-0004+`).

### Success metrics (outcomes, not outputs)

| Metric | Type | Definition | Target |
|---|---|---|---|
| Pilot team operation | Target | Company team runs MarkSync as their docs workflow | ≥ 2 weeks continuous operation at milestone close |
| Conflict resolvability | Target | Known conflict classes resolvable via the documented `resolve` flow | 100% |
| Reverse round-trip fidelity | Guardrail | Canonical GFM fixtures surviving Storage→Markdown round-trip | 100% (re-run on every subset expansion) — enforced mechanically by the GH-92 round-trip harness + partition manifest |
| Zero silent overwrites | Guardrail | Incidents where a remote edit is overwritten without an explicit conflict (incl. `resolve`/`import` flows) | **0** (permanent guardrail, R-VAL-4) |
| Default rendering egress | Guardrail | External service calls under default rendering configuration | **0** (self-hosted endpoint is explicit config; public Kroki stays opt-in) |
| Unsupported-construct diagnostics | Target | Known unsupported-construct classes emitting stable diagnostic codes + locations on `import`/`resolve` | 100% |

### Dependencies

- **Spike: Confluence historical-version API** — fetch page body at version N
  (assumption behind the base-version diff). If disproved, base-version
  capture is redesigned (e.g., snapshot base body in lock/cache).
- **Spike: in-process Mermaid, second attempt** — DOM emulation + deterministic
  synthetic text metrics per ADR-0002's follow-up note (GH-11 found no SVG
  layout engine in happy-dom/jsdom). Fallbacks pre-committed: self-hosted
  Kroki endpoint (exposed in config), then `code` policy. No-Chromium boundary
  stands (ADR-0001, CEO-DEC-1).
- **E1 before E2/E3** — the reverse converter feeds both the `resolve` diff
  and `import`; golden fixtures gate both.
- **Real partner corpus access** — the company's existing Confluence pages
  (sanitized into the adversarial corpus pattern, GH-31) for reverse-round-trip
  evidence.
- **`MS-0002` state model** — committed lock file, base hashes, `repair-state`
  (all delivered) are the substrate for base-version records.

### Validation approach

- **Method:** moderated onboarding with the actual company team (not synthetic
  test users): install, `import` of their real corpus, then day-to-day
  publish/conflict/resolve operation. Maintain a conflict-class taxonomy
  during the pilot; every unresolved class becomes a backlog item.
- **Safety instrumentation:** the zero-overwrite guardrail and the
  never-auto-commit invariant are verified continuously via BDD lifecycle
  invariants extended to the new flows.
- **Decision it drives:** proceed to `MS-0004` when the pilot team operates
  ≥ 2 weeks without maintainer intervention; if conflict classes remain
  unresolved or reverse round-trip fidelity fails on the real corpus, iterate
  within `MS-0003` before expanding.

### OST / discovery linkage

| Milestone outcome | Opportunity (OST) | Solution (OST) | Experiment |
|---|---|---|---|
| Conflicts resolved in Git (patch flow) | O5 | S5.1 | E5.1 (advanced into `MS-0003`, PDR-0002) |
| Existing-corpus adoption (`import`) | O5 / A-VAL-3 | S5.1 precursor | `MS-0002` beta retention taxonomy → PDR-0002 activation |
| No-external-services Mermaid | O3 | S3.1 | E3.1 (second spike attempt, PDR-0002) |
| Company team self-operation | O2 | S2.1 | E2.1 (re-scoped: team activation, not ≤10-min headline) |

### Read before detailed MS-0003 planning

- [PDR-0002](../decisions/PDR-0002-ms0003-rescope-company-adoption-mvp.md) —
  the re-scope decision, constraints (C-1…C-8), and ownership model.
- `doc/inception/marksync-failure-premortem-and-anti-failure-playbook-2026-07-02.md`
  — especially `§4.1`, `§4.2`, `§4.3`, `§5.5`, `§5.6`, `§18.2`, `§19.1`.
- `doc/inception/integration-scenarios/15-reverse-sync.md` and
  `13-version-conflict-drift.md`.
- `doc/inception/analysis/assumptions.md` — A-VAL-3, A-USA-1, A-USA-2,
  A-USA-3, A-FEA-1, A-FEA-10.
- `doc/inception/analysis/risks.md` — R-VAL-4, R-USA-2, R-FEA-1, R-FEA-9,
  R-USA-3.
- `doc/overview/personas-jtbd.md` — Personas 1, 2, 3, and 5.
- `doc/inception/analysis/backlog-reconciliation.md` — cross-cutting coverage
  and backlog triggers.

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

_Rough, outcome-oriented placeholders. Names mirror the premortem's phase gates
(`§15`). Each subsection records what to read before detailed planning so current
knowledge is preserved._

| ID | Milestone | Outcome hypothesis | Rough timing |
|---|---|---|---|
| `MS-0004` | **Drift lifecycle completeness** (Gate 2) | Drift is not just detected but repairable per-document; stale locks, moved pages, and partial-apply are recoverable without expert supervision. | After `MS-0003` |
| `MS-0005` | **Reverse change capture** (Gate 3) | Confluence-side edits are captured and reverse-converted to a reviewable Markdown patch; never auto-committed. _(Canonical-subset reverse conversion pulled forward into `MS-0003` by PDR-0002; the remainder stays here.)_ | After `MS-0004` |
| `MS-0006` | **Reviewable reconciliation** (Gate 4) | Divergence produces base/local/remote conflict bundles and a controlled review/PR workflow; structural merge only for proven node classes. _(Patch-based Git-arbitrated resolution pulled forward into `MS-0003` by PDR-0002; bundles/structural merge stay here.)_ | After `MS-0005` |
| `MS-0007` | **Continuous / policy-controlled sync** (Gate 5–6) | Policy-controlled continuous bidirectional behaviour for supported constructs; per-page ownership modes. | After `MS-0006` |
| `MS-0008` | **Public launch & sustainability readiness** | The project is safe to promote publicly: trademark notice, support matrix, funding/sponsorship posture, continuity model, contributor seams. | Before broad launch |
| `MS-0009` | **Platform breadth** | Data Center adapter; OAuth 2.0 (3LO); package-manager distribution; optional MCP server. Only after Confluence Cloud is mature and the matrix is sustainable. | Later |

### MS-0004 — Drift lifecycle completeness (Gate 2) — detail notes

**Likely scope to refine later:** repair commands beyond `MS-0002`, stale-lock
diagnostics, moved-page repair, missing-page / `REMOTE_MISSING` handling,
permission-asymmetry handling, partial-apply replay, per-document isolation.
Per PDR-0002, deeper DX polish deferred from the re-scoped `MS-0003` tail
(broad public-user activation, ≤10-min headline metric) also lands here or in
a dedicated successor.

**Read before planning:**

- Premortem `§4.3`, `§4.4`, `§5.1`, `§5.2`, `§5.4`, `§5.8`, `§7.4`, `§15 Gate 2`.
- `doc/inception/analysis/risks.md` — R-USA-3, R-FEA-3, R-FEA-4,
  R-FEA-7, R-FEA-8, R-FEA-10.
- `doc/inception/analysis/assumptions.md` — A-FEA-7, A-FEA-9, A-FEA-6.
- `doc/inception/analysis/backlog-reconciliation.md` — repair/state triggers.

### MS-0005 — Reverse change capture (Gate 3) — detail notes

> **Pull-forward (PDR-0002, 2026-07-26):** the canonical-GFM-subset
> Storage→Markdown reverse conversion and its golden-fixture/diagnostics
> foundation were pulled forward into `MS-0003` (E1). This milestone retains
> the remainder: full change capture across the broader corpus and construct
> set.

**Likely scope to refine later:** read managed Confluence page, classify supported
vs unsupported constructs, reverse-convert canonical subset, produce reviewable
Markdown patch, never auto-commit, preserve unsupported content safely.

**Read before planning:**

- Premortem `§4.1`, `§5.5`, `§5.6`, `§15 Gate 3`.
- `doc/overview/opportunity-solution-tree.md` — O5 / S5.1 / E5.1.
- `doc/inception/integration-scenarios/15-reverse-sync.md`.
- `doc/inception/analysis/assumptions.md` — A-VAL-3, A-VAL-2.
- `doc/inception/analysis/risks.md` — R-USA-2, R-FEA-9, R-FEA-5.

### MS-0006 — Reviewable reconciliation (Gate 4) — detail notes

> **Pull-forward (PDR-0002, 2026-07-26):** reviewable patch-based,
> Git-arbitrated conflict resolution for the canonical subset was pulled
> forward into `MS-0003` (E2, `resolve` flow + `import`). This milestone
> retains the remainder: base/local/remote conflict bundles, the controlled
> review/PR workflow, and structural merge for proven node classes.

**Likely scope to refine later:** base/local/remote bundle, conflict workspace,
human/AI review workflow, PR-oriented apply, semantic validation before new base,
clear unsupported-merge fallback.

**Read before planning:**

- Premortem `§5.5`, `§5.6`, `§15 Gate 4`.
- `doc/inception/integration-scenarios/13-version-conflict-drift.md`.
- `doc/inception/integration-scenarios/15-reverse-sync.md`.
- `doc/inception/analysis/failure-premortem.md` — backward-chain drivers.

### MS-0007 — Continuous / policy-controlled sync (Gate 5–6) — detail notes

**Likely scope to refine later:** explicit ownership modes, supported structural
merge classes, page/section policies, policy-controlled continuous operation,
guardrails against automatic semantic conflict resolution.

**Read before planning:**

- Premortem `§3.2`, `§4.1`, `§5.5`, `§13.1`, `§15 Gate 5`, `§15 Gate 6`.
- `doc/inception/analysis/risks.md` — R-VAL-3, R-VAL-4, R-FEA-8, R-FEA-9.
- `doc/inception/analysis/id-prefix-catalog.md` — stable IDs for ownership
  policies / acceptance criteria.

### MS-0008 — Public launch & sustainability readiness — detail notes

**Likely scope to refine later:** README positioning, non-affiliation notice,
support matrix, issue templates, contributor seams, continuity/funding posture,
design-partner evidence pack.

**Read before planning:**

- Premortem `§9`, `§18`, `§19.5`, `§21`.
- PDR-0001 (MarkSync brand / Confluence adapter).
- `doc/inception/analysis/risks.md` — R-VIA-1, R-VIA-2, R-VIA-3.
- `doc/inception/analysis/assumptions.md` — A-VIA-1, A-VIA-2, A-VIA-4.

### MS-0009 — Platform breadth — detail notes

**Likely scope to refine later:** Data Center adapter, OAuth 2.0 (3LO), package
manager distribution, optional MCP server, additional knowledge-platform
adapters. This milestone must not start until Confluence Cloud maturity and
maintainer sustainability are proven.

**Read before planning:**

- Premortem `§7.1`, `§7.2`, `§8.6`, `§9.1`, `§13.2`, `§13.3`, `§13.8`, `§13.12`.
- `doc/inception/integration-scenarios/18-oauth-3lo.md`.
- ADR-0001 (distribution constraints), PDR-0001 (adapter architecture).
- `doc/inception/analysis/risks.md` — R-FEA-2, R-FEA-6, R-VIA-1.

## Roadmap allocation matrix

_Every currently known backlog trigger / assumption / risk / decision / spike is
allocated to a roadmap milestone ID or pre-milestone planning gate. Update this
table whenever a new durable ID is introduced._

| Item(s) | Source | Handled in milestone / gate | Notes |
|---|---|---|---|
| A-FEA-1; ADR-0002; BT-FEA-1 | Assumptions / ADR / backlog reconciliation | `MS-0002` prerequisite / `MS-0002` → reopened in `MS-0003` | Mermaid spike before `MS-0002` tooling locks; `code` fallback if late failure. In-process spike reopened in `MS-0003` under the no-external-services constraint (PDR-0002), with the ladder in-process → self-hosted Kroki endpoint → `code`. |
| A-FEA-2; R-FEA-2; ADR-0001 | Assumptions / risks / ADR | `MS-0002` | Bun single-binary, clean-OS smoke, signing, size/startup budget. |
| A-FEA-3, A-FEA-4, A-FEA-5; ADR-0005 | Assumptions / ADR | `MS-0002` | Storage rendering, content properties, drift 409. |
| A-FEA-7; R-FEA-7 | Assumptions / risks | `MS-0002` | CI concurrency control; stale-base overwrite prevention. |
| A-FEA-9; R-FEA-3 | Assumptions / risks | `MS-0002` / Phase 3 architecture prerequisite | UUID, committed lock, cache/state separation; state ADR should be seeded in Phase 3. |
| A-FEA-10; R-FEA-2; R-VIA-1 | Assumptions / risks | `MS-0002` | ≤500 page budget, ≤90 MB binary, ≤2s cold start. |
| A-VAL-1; R-VAL-1, R-VAL-2, R-VAL-3 | Assumptions / risks | `MS-0002` beta gate | Validate wedge before expanding. |
| A-VAL-2; R-FEA-9 | Assumptions / risks | `MS-0002` | Adversarial corpus seeded by real/sanitized pages. |
| A-VAL-3; R-USA-2 | Assumptions / risks | `MS-0003` (activated — PDR-0002) | Existing-corpus migration, activated via `marksync import` (E3); A-VAL-3 confirmed by the first design partner (maintainer's company). |
| A-USA-1, A-USA-2, A-USA-3; R-USA-1 | Assumptions / risks | `MS-0003` | ≤10-min first publish, setup friction, visible provenance trust. Conflict-resolution-first sequencing per owner direction (PDR-0002): DX items reduced to the milestone tail; headline metric demoted; deeper polish → `MS-0004+`. |
| R-USA-3; R-FEA-4 | Risks | `MS-0002` minimal repair; expanded in `MS-0004` | `repair-state` in `MS-0002`; fuller lifecycle repair later. |
| R-FEA-8 | Risk | `MS-0002` | Semantic hashing / false no-op prevention. |
| R-FEA-10 | Risk | `MS-0002` / `MS-0004` | Permission asymmetry; `doctor` visibility checks in `MS-0002`, repair later. |
| R-SEC-1; AC-SEC-* | Risk / future ACs | `MS-0002` | Secret redaction and converter escaping. |
| A-FEA-6; R-FEA-6 | Assumption / risk | `MS-0002` and ongoing | Adapter isolation, live smoke, deprecation monitoring. |
| R-VAL-4 | Risk | `MS-0002` and all later milestones | Zero silent overwrite is a permanent guardrail. |
| A-VIA-1, A-VIA-2, A-VIA-4; R-VIA-1, R-VIA-2, R-VIA-3 | Assumptions / risks | `MS-0008` | Support matrix, continuity/funding, trademark, no demo-ware. |
| PDR-0001 | Decision | `MS-0008` / `MS-0009` | Brand, Confluence as adapter, package naming. |
| PDR-0002 | Decision | `MS-0003` | Company Adoption MVP re-scope: MS-0005/MS-0006 subsets pulled forward, A-VAL-3 activated, no-external-services Mermaid, ownership model; guardrails unchanged. |
| `MS-0005` subset (E1) | PDR-0002 pull-forward | `MS-0003` | Canonical-subset Storage→Markdown reverse conversion + golden fixtures + unsupported-construct diagnostics; remainder stays in `MS-0005`. |
| `MS-0006` subset (E2) | PDR-0002 pull-forward | `MS-0003` | Reviewable patch-based, Git-arbitrated conflict resolution (`resolve` flow); conflict bundles / structural merge / review workflow remain in `MS-0006`. |
| TDR-0001 | Decision/spike | `MS-0001` / evidence base | Keep evidence links available for implementation. |
| `backlog-reconciliation.md` rows | Planning control | Phase 7 / first delivery planning | Replace placeholders with ticket refs or closure reasons. |
| `failure-premortem.md` / `success-pre-parade.md` | Prospective analysis | Phase 6 readiness + all milestone planning | Verify routed outputs remain reflected. |

## Links

- Changes: _(none yet — delivery starts after inception Phase 7)_
- Decision records: ADR-0001 (TS), ADR-0002 (Mermaid), PDR-0001 (MarkSync brand), TDR-0001 (spike), ADR-0005 (Storage), PDR-0002 (MS-0003 re-scope — Company Adoption MVP).
- North star: [`01-north-star.md`](./01-north-star.md) · OST: [`opportunity-solution-tree.md`](./opportunity-solution-tree.md) · Assumptions: [`../inception/analysis/assumptions.md`](../inception/analysis/assumptions.md) · Risks: [`../inception/analysis/risks.md`](../inception/analysis/risks.md) · Backlog reconciliation: [`../inception/analysis/backlog-reconciliation.md`](../inception/analysis/backlog-reconciliation.md) · Failure premortem: [`../inception/analysis/failure-premortem.md`](../inception/analysis/failure-premortem.md) · Success pre-parade: [`../inception/analysis/success-pre-parade.md`](../inception/analysis/success-pre-parade.md)
