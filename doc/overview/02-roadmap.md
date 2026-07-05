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
  related_decisions: [ADR-0001, ADR-0002, PDR-0001, TDR-0001, ADR-0005]
  related_changes: []
summary: "Engineering roadmap — MS-0002 MVP (safe one-way publisher / trust wedge), MS-0003 MLP (exceptional DX), then staged reverse-sync gates."
ai_assistance: "AI-assisted drafting; human-authored and approved by Juliusz Ćwiąkalski."
---

# Engineering Roadmap

_The engineering roadmap for delivery. Each milestone has a stable, monotonic
ID (`MS-0001`, `MS-0002`, ...). The **Current Milestone** (`MS-0002`) is
first-class and detailed. The **Next Milestone** (`MS-0003`) is also detailed
because the project already has useful current knowledge that should not be
lost, but it is explicitly subject to change based on `MS-0002` evidence. Later
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
| `MS-0001` | Confluence API validation spike | 2026-07-03 | Proved the Confluence Cloud contract: Storage round-trip (27/27 GFM constructs), v2 content properties, drift 409 detection, attachments, labels, search, restrictions. De-risked `MS-0002` feasibility. | TDR-0001, ADR-0005; `doc/inception/integration-scenarios/` |

_(Only the spike has shipped; no product milestone has shipped yet.)_

## Current Milestone

### MS-0002 — MVP — "Safe one-way publisher" (the trust wedge)

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
- **Drift detection** via **canonical semantic hashing** (raw + canonical + normalized + attachment hashes, premortem `§5.4`); classify `NO_CHANGE` / `REMOTE_BEHIND` / `REMOTE_AHEAD` / `DIVERGED` / `REMOTE_MISSING`; block unsafe overwrites by default. **Invariant:** a remotely-deleted managed page is never silently re-created.
- **Concurrency control** for CI-first operation: decentralized optimistic concurrency — Confluence 409 on stale version.number + operation-ID deduplication + stale-plan expiry + CI concurrency-group templates (premortem `§5.8`, ADR-0006 C-6) — so two overlapping CI plans can never let the older overwrite the newer.
- **Minimal repair surface** (in `MS-0002` / MVP, not deferred): `repair-state` for stale locks and interrupted-apply journal replay (premortem `§14` includes `repair` in the beachhead) — so a single stale lock or partial apply never blocks a whole subtree with no recovery.
- Visible provenance (panel/footer: source path + Git revision + last-sync) plus machine content-property metadata.
- Local images/attachments (path-safe, content-hashed, reused when unchanged).
- Mermaid diagrams rendered via the **official** library in-process, content-hashed (ADR-0001, ADR-0002). **Spike-gated:** if the ADR-0002 headless-render spike fails late, the `MS-0002` fallback is render-failure policy `code` (preserve the code block) per the ADR-0002 ladder, with full in-process render moved to `MS-0003` — a failed spike does **not** block `MS-0002` release.
- Auth: local API-token (email + token, OS keyring) and non-interactive CI credentials from environment.
- Dry-run / plan / diff before any write; stable exit codes; JSON/NDJSON output; `doctor` health-check (capability + permission discovery, premortem `§4.2`, `§7.4`).
- **`MS-0002` performance budget (NFR guardrails):** binary ≤ 90 MB; cold-start ≤ 2 s on reference hardware; targets repos ≤ ~500 managed pages (large-repo incremental optimization is deferred — correctness first, premortem `§5.9`, `§13.11`).
- **Quality gates (lightweight):** unit + integration (mocked Confluence) + golden fixtures are mandatory; a live-sandbox E2E tier runs on a **single dedicated test space** (not per-suite creation, premortem `§8.5`); Gherkin/BDD specs cover **lifecycle invariants only** (premortem `§8.2`), not exhaustive steps.

**In scope (`MS-0002` / MVP):**

- Confluence **Cloud** only; one configured page subtree per target; safe publish + drift block; the canonical GFM subset; Mermaid; assets; provenance; CI + local operation; agent-friendly output.

**Out of scope (for this milestone):**

- Reverse sync / Confluence→Git reconciliation (`MS-0005+`, Gate 3+).
- Adopting an **existing** Confluence corpus into the managed set (depends on reverse sync; tracked assumption A-VAL-3).
- Automatic deletion; watch mode; webhooks; OAuth 2.0 (3LO); Data Center; comments/restrictions/whiteboards/databases; MCP server; GUI/editor plugins; hosted SaaS.
- "Exceptional DX" polish (guided init, migration helpers, sub-10-min first-publish) → that is `MS-0003` / **MLP**, the next milestone.

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

- **ADR-0002 Mermaid headless-render spike** must pass before `MS-0002` tooling locks — it is load-bearing for the TypeScript choice and the single-binary promise. If it requires Chromium, the language decision is revisited. A failed spike is a **language-level reconsideration and a multi-month `MS-0002` slip**, not merely a mitigation tweak; the `MS-0002` `code`-fallback above keeps the wedge shippable while full render moves to `MS-0003`.
- Bun single-binary cross-compile + signing/notarization story (clean-OS smoke).
- 3–5 design partners willing to install, test, and retain MarkSync in CI — **recruit ≥3 before `MS-0002` feature-lock; if 0 at feature-lock, slip the lock** (premortem `§18.1`).

### Validation approach

- **Method:** design-partner beta (heterogeneous repos/sites) + an **adversarial public round-trip corpus seeded by sanitized design-partner pages** (real macros/nested tables/app content the canonical subset excludes, premortem `§17.2`) + live-sandbox E2E on a dedicated test space. Track publish-success-rate, drift-effectiveness, and the zero-overwrite guardrail.
- **Partition the retention signal:** for each design partner, record *why* they did/did not retain — **safety failure vs migration-absence vs DX-friction vs capability-gap**. The retention guardrail triggers "narrow" **only on safety/value failures**; migration-absence escalates A-VAL-3 priority rather than questioning the wedge.
- **Instrument `MS-0003` signal during `MS-0002`:** capture time-to-first-publish and a setup-failure taxonomy (informational only; not `MS-0002` targets) to de-risk A-USA-1/A-USA-2 before `MS-0003` is built.
- **Decision it drives:** proceed to `MS-0003` if the wedge is retained by real teams; **narrow (do not expand) scope** only on safety/value failures. Do not advance to reverse sync on a weak wedge.

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

## Next Milestone

### MS-0003 — MLP — "Exceptional DX & easy setup"  _(subject to change)_

_This section is intentionally detailed even though the milestone is next, not
current. It captures what we know now so Phase 2 knowledge does not evaporate.
Scope must be revalidated after `MS-0002` beta using the retention-reason taxonomy,
time-to-first-publish measurements, and support-issue data._

**Outcome hypothesis:** a technically capable new user can reach a safe first
publish in **≤ 10 min** (excluding Atlassian credential creation), understand why
the tool did or did not write, and recover from common setup/state problems
without maintainer intervention.

**Deliverables:**

- Guided `marksync init` with progressive disclosure: minimal happy path first;
  advanced mappings only when needed.
- `marksync doctor` for tenant, auth, scopes, parent-page permissions,
  attachment/property capability, proxy/CA hints, renderer availability, Git
  state, and visibility completeness.
- Setup-failure taxonomy and human-readable remediation messages paired with
  stable machine-readable diagnostic codes.
- Common-layout examples: single folder → one Confluence parent, multiple folders
  → multiple spaces, architecture docs with Mermaid/assets, CI publish.
- Migration/adoption helpers if `MS-0002` beta validates A-VAL-3:
  - import/adopt planning for pre-existing Confluence pages;
  - `mark` / `md2conf` / manual-copy migration notes;
  - clear generated-page / managed-page banners.
- Minimal repair UX expansion beyond `MS-0002` `repair-state`: explain stale locks,
  moved pages, missing pages, permission asymmetry, and partial-apply recovery.
- First public user guide and troubleshooting guide focused on activation, not
  architecture.

**In scope (`MS-0003` / MLP):**

- Activation/DX improvements; setup diagnostics; common examples; migration
  discovery and the first low-friction adoption workflows; clearer failure
  messages; repair UX.

**Out of scope (for this milestone):**

- Full reverse sync / Confluence→Git reconciliation; structural merge; Data
  Center; OAuth 2.0 (3LO) unless `MS-0002` beta shows API-token auth blocks adoption;
  MCP server; GUI/editor plugins.

### Success metrics (outcomes, not outputs)

| Metric | Type | Definition | Target |
|---|---|---|---|
| Time to first publish | Target | New user reaches first safe publish excluding Atlassian credential creation | ≤ 10 min median in moderated tests |
| Setup completion | Target | Users completing init + doctor + first plan without maintainer help | ≥ 80% in design-partner onboarding |
| Actionable diagnostics | Guardrail | Setup failures with stable code + likely cause + remediation | 100% of known setup failure classes |
| Migration signal clarity | Target | `MS-0002` beta non-retention reasons are classified (migration vs DX vs safety vs capability) | 100% of beta non-retentions classified |
| Support burden | Guardrail | Repeated unclear setup issues after docs/doctor updates | No repeated P1/P2 setup issue without a backlog item |

### Dependencies

- `MS-0002` beta telemetry-by-report: time-to-first-publish, setup-failure taxonomy,
  retention-reason partition.
- A-VAL-3 outcome: whether existing-corpus adoption is a blocker.
- A-USA-1 / A-USA-2 validation results.
- `MS-0002` state model and repair primitives must exist before `MS-0003` can make them easy.

### Validation approach

- Run moderated first-publish sessions with at least 3 target-user types:
  software architect/lead, platform/DevX engineer, documentation owner.
- Record setup time, blockers, docs consulted, commands used, and whether the
  user can explain the plan before publish.
- Decide whether to proceed to `MS-0004`, or spend another `MS-0003` iteration on
  setup/migration if activation is still poor.

### OST / discovery linkage

| Milestone outcome | Opportunity (OST) | Solution (OST) | Experiment |
|---|---|---|---|
| ≤ 10 min first publish | O2 | S2.1 | E2.1 |
| Single-binary trust / clean install | O2 | S2.2 | E2.2 |
| Agent/CI-operable setup diagnostics | O4 | S4.1 | E4.1 |
| Migration/adoption clarity | O5 / A-VAL-3 | S5.1 precursor | `MS-0002` beta retention taxonomy |

### Read before detailed MS-0003 planning

- `doc/inception/marksync-failure-premortem-and-anti-failure-playbook-2026-07-02.md`
  — especially `§3.3`, `§4.2`, `§4.3`, `§18.2`, `§19.1`.
- `doc/overview/personas-jtbd.md` — Personas 1, 2, 3, and 5.
- `doc/inception/analysis/assumptions.md` — A-USA-1, A-USA-2, A-USA-3,
  A-VAL-3, A-FEA-10.
- `doc/inception/analysis/risks.md` — R-USA-1, R-USA-2, R-USA-3, R-VIA-1.
- `doc/inception/analysis/backlog-reconciliation.md` — cross-cutting coverage
  and backlog triggers.

## Future Milestones

_Rough, outcome-oriented placeholders. Names mirror the premortem's phase gates
(`§15`). Each subsection records what to read before detailed planning so current
knowledge is preserved._

| ID | Milestone | Outcome hypothesis | Rough timing |
|---|---|---|---|
| `MS-0004` | **Drift lifecycle completeness** (Gate 2) | Drift is not just detected but repairable per-document; stale locks, moved pages, and partial-apply are recoverable without expert supervision. | After `MS-0003` |
| `MS-0005` | **Reverse change capture** (Gate 3) | Confluence-side edits are captured and reverse-converted to a reviewable Markdown patch; never auto-committed. | After `MS-0004` |
| `MS-0006` | **Reviewable reconciliation** (Gate 4) | Divergence produces base/local/remote conflict bundles and a controlled review/PR workflow; structural merge only for proven node classes. | After `MS-0005` |
| `MS-0007` | **Continuous / policy-controlled sync** (Gate 5–6) | Policy-controlled continuous bidirectional behaviour for supported constructs; per-page ownership modes. | After `MS-0006` |
| `MS-0008` | **Public launch & sustainability readiness** | The project is safe to promote publicly: trademark notice, support matrix, funding/sponsorship posture, continuity model, contributor seams. | Before broad launch |
| `MS-0009` | **Platform breadth** | Data Center adapter; OAuth 2.0 (3LO); package-manager distribution; optional MCP server. Only after Confluence Cloud is mature and the matrix is sustainable. | Later |

### MS-0004 — Drift lifecycle completeness (Gate 2) — detail notes

**Likely scope to refine later:** repair commands beyond `MS-0002`, stale-lock
diagnostics, moved-page repair, missing-page / `REMOTE_MISSING` handling,
permission-asymmetry handling, partial-apply replay, per-document isolation.

**Read before planning:**

- Premortem `§4.3`, `§4.4`, `§5.1`, `§5.2`, `§5.4`, `§5.8`, `§7.4`, `§15 Gate 2`.
- `doc/inception/analysis/risks.md` — R-USA-3, R-FEA-3, R-FEA-4,
  R-FEA-7, R-FEA-8, R-FEA-10.
- `doc/inception/analysis/assumptions.md` — A-FEA-7, A-FEA-9, A-FEA-6.
- `doc/inception/analysis/backlog-reconciliation.md` — repair/state triggers.

### MS-0005 — Reverse change capture (Gate 3) — detail notes

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
| A-FEA-1; ADR-0002; BT-FEA-1 | Assumptions / ADR / backlog reconciliation | `MS-0002` prerequisite / `MS-0002` | Mermaid spike before `MS-0002` tooling locks; `code` fallback if late failure. |
| A-FEA-2; R-FEA-2; ADR-0001 | Assumptions / risks / ADR | `MS-0002` | Bun single-binary, clean-OS smoke, signing, size/startup budget. |
| A-FEA-3, A-FEA-4, A-FEA-5; ADR-0005 | Assumptions / ADR | `MS-0002` | Storage rendering, content properties, drift 409. |
| A-FEA-7; R-FEA-7 | Assumptions / risks | `MS-0002` | CI concurrency control; stale-base overwrite prevention. |
| A-FEA-9; R-FEA-3 | Assumptions / risks | `MS-0002` / Phase 3 architecture prerequisite | UUID, committed lock, cache/state separation; state ADR should be seeded in Phase 3. |
| A-FEA-10; R-FEA-2; R-VIA-1 | Assumptions / risks | `MS-0002` | ≤500 page budget, ≤90 MB binary, ≤2s cold start. |
| A-VAL-1; R-VAL-1, R-VAL-2, R-VAL-3 | Assumptions / risks | `MS-0002` beta gate | Validate wedge before expanding. |
| A-VAL-2; R-FEA-9 | Assumptions / risks | `MS-0002` | Adversarial corpus seeded by real/sanitized pages. |
| A-VAL-3; R-USA-2 | Assumptions / risks | `MS-0003` if validated | Existing-corpus migration. |
| A-USA-1, A-USA-2, A-USA-3; R-USA-1 | Assumptions / risks | `MS-0003` | ≤10-min first publish, setup friction, visible provenance trust. |
| R-USA-3; R-FEA-4 | Risks | `MS-0002` minimal repair; expanded in `MS-0004` | `repair-state` in `MS-0002`; fuller lifecycle repair later. |
| R-FEA-8 | Risk | `MS-0002` | Semantic hashing / false no-op prevention. |
| R-FEA-10 | Risk | `MS-0002` / `MS-0004` | Permission asymmetry; `doctor` visibility checks in `MS-0002`, repair later. |
| R-SEC-1; AC-SEC-* | Risk / future ACs | `MS-0002` | Secret redaction and converter escaping. |
| A-FEA-6; R-FEA-6 | Assumption / risk | `MS-0002` and ongoing | Adapter isolation, live smoke, deprecation monitoring. |
| R-VAL-4 | Risk | `MS-0002` and all later milestones | Zero silent overwrite is a permanent guardrail. |
| A-VIA-1, A-VIA-2, A-VIA-4; R-VIA-1, R-VIA-2, R-VIA-3 | Assumptions / risks | `MS-0008` | Support matrix, continuity/funding, trademark, no demo-ware. |
| PDR-0001 | Decision | `MS-0008` / `MS-0009` | Brand, Confluence as adapter, package naming. |
| TDR-0001 | Decision/spike | `MS-0001` / evidence base | Keep evidence links available for implementation. |
| `backlog-reconciliation.md` rows | Planning control | Phase 7 / first delivery planning | Replace placeholders with ticket refs or closure reasons. |
| `failure-premortem.md` / `success-pre-parade.md` | Prospective analysis | Phase 6 readiness + all milestone planning | Verify routed outputs remain reflected. |

## Links

- Changes: _(none yet — delivery starts after inception Phase 7)_
- Decision records: ADR-0001 (TS), ADR-0002 (Mermaid), PDR-0001 (MarkSync brand), TDR-0001 (spike), ADR-0005 (Storage). To be migrated to `doc/decisions/` during inception.
- North star: [`01-north-star.md`](./01-north-star.md) · OST: [`opportunity-solution-tree.md`](./opportunity-solution-tree.md) · Assumptions: [`../inception/analysis/assumptions.md`](../inception/analysis/assumptions.md) · Risks: [`../inception/analysis/risks.md`](../inception/analysis/risks.md) · Backlog reconciliation: [`../inception/analysis/backlog-reconciliation.md`](../inception/analysis/backlog-reconciliation.md) · Failure premortem: [`../inception/analysis/failure-premortem.md`](../inception/analysis/failure-premortem.md) · Success pre-parade: [`../inception/analysis/success-pre-parade.md`](../inception/analysis/success-pre-parade.md)
