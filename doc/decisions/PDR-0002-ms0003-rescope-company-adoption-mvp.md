---
# Copyright (c) 2025-2026 Juliusz Ćwiąkalski (https://www.cwiakalski.com | https://www.linkedin.com/in/juliusz-cwiakalski | https://www.x.com/cwiakalski)
# MIT License - see LICENSE file for full terms
id: PDR-0002
decision_type: pdr
status: Accepted
created: 2026-07-26
decision_date: 2026-07-26
last_updated: 2026-07-26
summary: "Re-scope MS-0003 from DX-first MLP to 'Company Adoption MVP': pull forward reverse conversion, Git-arbitrated patch-based conflict resolution, `marksync import` (A-VAL-3), and no-external-services Mermaid; DX polish becomes the milestone tail. Milestone ID unchanged."
owners:
  - Juliusz Ćwiąkalski
service: marksync-cli
decision_area: product
decision_scope: product-line
reversibility: moderate
review_date: 2026-10-26
business_impact: "Converts the maintainer's company (first design partner) into the MS-0003 validation vehicle; defers broad-market DX activation to MS-0004+."
customer_impact: "Company team of 5–15 devs gets conflict resolution in Git, existing-corpus adoption, and rendering without external services; public users see DX polish later."
classification:
  domains: [product, strategy]
  archetype: prioritization
  environment: complicated
  rigor: R2
  reversibility: moderate
  stakes: high
  urgency: high
  uncertainty: medium
  blast_radius: customers
  recurrence: one-off
governance:
  driver: Juliusz Ćwiąkalski
  decider: Juliusz Ćwiąkalski
  contributors: ["company design-partner team (MVP goals)", "AI delivery agents (analysis)"]
  reviewers: []
  performers: [Juliusz Ćwiąkalski, "AI delivery agents"]
  informed: ["company dev team (5–15 devs)"]
ai_assistance:
  used: true
  roles: [analyst, record-writer]
  external_data_shared: false
  citations_verified: false
  human_decider: Juliusz Ćwiąkalski
  reviewers: []
revisit_triggers:
  - "Second in-process Mermaid spike fails ADR-0002 determinism/fidelity stop criteria — descend the ladder (self-hosted Kroki endpoint → `code` policy) without re-opening ADR-0001 (CEO-DEC-1 pattern)."
  - "Reverse-converter round-trip drops below 100% on golden fixtures from the real partner corpus — hold the `resolve` flow and expand unsupported-construct diagnostics."
  - "Confluence historical-version API spike disproves fetch-body-at-version-N — redesign base-version capture (e.g., snapshot base body in lock/cache)."
  - "The company team abandons local manual sync in favor of a CI-first flow — revisit milestone sequencing and the DX tail."
  - "A second external design partner arrives with DX-first activation blockers — rebalance MS-0004."
links:
  related_changes: []
  supersedes: []
  superseded_by: []
  spec: []
  contracts: []
  diagrams: []
  decisions: [ADR-0001, ADR-0002, ADR-0005, ADR-0006, ADR-0011, PDR-0001, TDR-0001]
  experiments: []
  metrics: []
  roadmap_items: [MS-0003, MS-0005, MS-0006]
---

# PDR-0002: MS-0003 re-scope — "Company Adoption MVP" replaces DX-first MLP

## Context

`MS-0002` (MVP — safe one-way publisher) shipped **2026-07-26**: all 31 milestone
issues closed, 0 open bugs, 34 merges, all quality gates green (1309 tests /
0 fail), and the live demo regression verified — plan/sync/doctor/repair all
correct, the diverged-remote safety `Block` fires correctly, zero silent
overwrites. The binary release pipeline is live (`GH-32`).

The roadmap defined `MS-0003` as "MLP — Exceptional DX & easy setup"
(≤10-min first publish), with reverse sync deferred to `MS-0005`/`MS-0006` and
existing-corpus adoption (assumption A-VAL-3) gated on `MS-0002` beta
validation.

The first real design partner is the maintainer's company. On 2026-07-26 the
owner (Juliusz Ćwiąkalski) defined five adoption-blocking MVP goals:

1. **Mermaid rendering Git→Confluence without public/external services** —
   ideally in-process in the single executable.
2. **Git→Confluence sync** — already delivered in `MS-0002` (verified).
3. **Detect Confluence-side edits and prevent overwriting on sync** — already
   delivered in `MS-0002` (verified live).
4. **Conflict resolution: sync back from Confluence into Git and resolve
   conflicts there** (remote-side diff as a Markdown patch; human merges in
   Git; nothing auto-committed).
5. **Easy setup for 5–15 devs, LOCAL manual sync only** (CI deferred; every
   publication updates the lock file, which the dev commits).

This decision **is** the "revalidation after `MS-0002` beta" the roadmap
required: the partner's goals are the revalidation input, and the retention
partition points at migration-absence (A-VAL-3 / R-USA-2), not safety or value
failure — the wedge held.

Rendering fact base: `src/infra/mermaid/kroki.ts` hardcodes
`https://kroki.io/mermaid/svg` (line 11) with an internal `endpoint` option
(lines 17–18, "tests/local instances") that is **not exposed in user config**.
"In-process Kroki" is not technically possible — Kroki is a standalone Java
server. The realistic ladder is: (a) in-process Mermaid via DOM emulation +
deterministic synthetic text metrics (new spike; the GH-11 attempt failed on
missing SVG layout — happy-dom/jsdom have none, per ADR-0002's spike
outcome), (b) self-hosted Kroki on company infra via a configurable endpoint,
(c) the `code` policy fallback.

## Problem Framing (Clarified)

The DX-first `MS-0003` does not unblock the only real adopter: three of the
five partner goals (conflict resolution, existing-corpus adoption, rendering
without external services) live in `MS-0005`/`MS-0006`/deferred ADR-0002
territory, and the DX headline (≤10-min first publish) is secondary to a team
that already has the maintainer on site. Meanwhile the roadmap's own
validation gate fired: A-VAL-3 is confirmed by a real corpus, and the
retention taxonomy says migration-absence escalates A-VAL-3 priority rather
than questioning the wedge.

The decision question: **how does `MS-0003` absorb the partner's goals
without breaking the milestone discipline (stable IDs, staged gates, safety
guardrails) or over-committing a solo developer?**

## Constraints (Hard Requirements)

### C-1: Zero silent overwrites (permanent guardrail)

- **Statement:** No release of MarkSync may overwrite remote edits without an
  explicit conflict — including all new `resolve`/`import` flows.
- **Source:** prior decision (roadmap allocation R-VAL-4; premortem `§17`).
- **Verification:** test (BDD lifecycle invariants extended to new flows).
- **Negotiable:** no.

### C-2: Never auto-commit; Git is the final arbiter for managed documents

- **Statement:** Conflict resolution produces a reviewable patch applied by a
  human in Git; MarkSync never commits or pushes on the user's behalf.
- **Source:** prior decision (premortem `§5.5`); owner direction 2026-07-26.
- **Verification:** test + code review (no Git write path outside explicit user action).
- **Negotiable:** no.

### C-3: Explicit managed/unmanaged boundary

- **Statement:** Documents created in Confluence and not managed by marksync
  stay in Confluence as their source of truth; marksync must never touch them.
  Adoption happens only via the explicit `marksync import` command.
- **Source:** owner direction 2026-07-26.
- **Verification:** test (unmanaged-page non-interaction) + audit.
- **Negotiable:** no.

### C-4: Unsupported constructs are never silently dropped

- **Statement:** On import and conflict resolution, constructs the canonical
  Markdown subset cannot represent must produce stable diagnostic codes with
  locations, and an explicit resolution path (edit in Confluence to remove, or
  an adopt-verbatim escape hatch).
- **Source:** owner direction 2026-07-26; ADR-0005 subset discipline.
- **Verification:** test (adversarial corpus, GH-31 classification reused).
- **Negotiable:** no.

### C-5: No public/external service calls by default for rendering

- **Statement:** Rendering defaults must not egress to public services. A
  self-hosted Kroki endpoint is explicit configuration; the public `render`
  policy remains opt-in (GH-69 posture).
- **Source:** owner direction 2026-07-26; NFR-PRIV-2 posture.
- **Verification:** test (default-config egress audit) + demonstration.
- **Negotiable:** no.

### C-6: Milestone-ID rule

- **Statement:** The re-scoped milestone keeps the ID `MS-0003`; no
  renumbering or ID reuse.
- **Source:** internal standard (roadmap Milestone-ID rule).
- **Verification:** audit (roadmap registry).
- **Negotiable:** no.

### C-7: Secrets redaction

- **Statement:** Secrets appearing in any log/plan/state/diagnostics output
  stays at zero across all new flows.
- **Source:** prior decision (premortem `§17 #10`; R-SEC-1).
- **Verification:** test.
- **Negotiable:** no.

### C-8: Runtime boundary — TypeScript/Bun single binary, no Chromium

- **Statement:** The in-process Mermaid spike must not require a Chromium
  dependency (ADR-0001 boundary stands per CEO-DEC-1).
- **Source:** prior decision (ADR-0001; CEO-DEC-1 2026-07-13).
- **Verification:** architect sign-off on spike result + build audit.
- **Negotiable:** no.

## Decision Drivers

**Business / product drivers:**

- **D1 — Unblock company adoption now:** the first design partner is waiting;
  value is immediate and concrete (5–15 devs, local manual sync).
- **D2 — Validate A-VAL-3 with a real corpus:** `marksync import` against the
  partner's existing Confluence pages is the strongest possible evidence.
- **D3 — Extend the trust wedge:** conflict resolution arbitrated in Git
  deepens the differentiator (safe, auditable, reversible) instead of
  abandoning it for polish work.

**Technical drivers:**

- **D4 — Eliminate external-service dependency for rendering** (privacy +
  explicit company constraint), ideally fully in-process in the binary.
- **D5 — Scope realism:** solo developer + AI agents — pull *subsets* of
  `MS-0005`/`MS-0006`, not the full milestones.

**Strategic drivers:**

- **D6 — Preserve staged-gate logic:** the premortem's sequencing (prove the
  wedge before breadth) stays intact; this re-scope follows its own
  revalidation gate rather than bypassing it.

## Decision Rights (DACI)

- **Driver:** Juliusz Ćwiąkalski (owner)
- **Decider:** Juliusz Ćwiąkalski
- **Contributors:** company design-partner team (five MVP goals); AI delivery
  agents (analysis, record drafting)
- **Required reviewers:** none (documentation-only change; implementation
  work items get their own reviews)
- **Performers:** Juliusz Ćwiąkalski + AI delivery agents
- **Informed:** company dev team (5–15 devs)

## Evidence, Assumptions & Unknowns

| Item | Label | Source | Impact if false | Confidence |
|------|-------|--------|-----------------|------------|
| `MS-0002` shipped 2026-07-26 in full (31/31 issues, 0 open bugs, 1309 tests green, live regression verified, diverged-remote Block fires, zero silent overwrites) | FACT | milestone close + live demo, 2026-07-26 | re-scope premise collapses | High |
| Partner goals 2 & 3 (sync; Confluence-edit detection/block) already delivered | FACT | `MS-0002` delivery, verified live 2026-07-26 | milestone would need publish/drift work first | High |
| `kroki.ts` hardcodes `https://kroki.io`; `endpoint` option exists internally but is not exposed in user config | FACT | `src/infra/mermaid/kroki.ts:11,17–18` | only the config-surface change grows | High |
| "In-process Kroki" impossible — Kroki is a standalone Java server | FACT | Kroki's architecture (public knowledge) | rendering ladder misframed | High |
| GH-11 spike: happy-dom/jsdom lack an SVG layout engine; faithful render needs a validated SVG-layout shim (e.g., `svgdom` / canvas-measured `getBBox`) — follow-up spike required | FACT | ADR-0002 spike outcome (2026-07-06) | second spike plan changes | High |
| DOM emulation + deterministic synthetic text metrics can pass ADR-0002 stop criteria in-process | TO-CONFIRM | new time-boxed spike in `MS-0003` | descend ladder: self-hosted endpoint → `code` policy | Low–Med |
| Confluence Cloud API can fetch a page body at historical version N | TO-CONFIRM | small spike before `resolve` locks | base-version capture redesigned (snapshot base body in lock/cache) | Med |
| Canonical GFM subset reverse round-trips 100% on golden fixtures and the real partner corpus | TO-CONFIRM | golden fixtures + partner corpus | diagnostics carry more load; milestone scope risk | Med |
| Company team operates via local manual sync; CI deferred | ASSUMPTION | owner statement 2026-07-26 | adoption tail must reprioritize a CI story | Med–High |

## Mental Models & Techniques Used

- **First Principles:** what actually blocks adoption? Three of five goals —
  all three live in deferred territory. The DX headline optimizes a metric the
  current partner does not gate on.
- **Inversion:** "what would destroy the trust the wedge earned?" — silent
  overwrites, auto-commits, touching unmanaged pages, silent construct loss.
  These became constraints C-1…C-4, not tradeables.
- **Opportunity Cost:** DX polish now vs. conflict resolution now; the
  partner's value concentrates in the latter; polish slips to the tail.
- **Reversibility:** a scope re-allocation at the next planning gate is cheap;
  a renumbered milestone history is not (C-6).
- **Second-Order Thinking:** `import` flips a page's source of truth — the
  transition must be explicit and one-way, or the managed/unmanaged boundary
  erodes; the resolve→merge→re-sync→new-base loop must close cleanly or
  conflicts compound.
- **The spike before the commitment** (project principle): both
  high-uncertainty items (in-process Mermaid, historical-version API) get
  time-boxed spikes before binding design.

## Alternatives Considered

### Per-Alternative Constraint-Compliance Evaluation

Legend: ✅ = passes · ❌ = fails · ⚠️ = passes only via an accepted-risk exception.

|      | C-1 | C-2 | C-3 | C-4 | C-5 | C-6 | C-7 | C-8 |
|------|-----|-----|-----|-----|-----|-----|-----|-----|
| Alt 0 — keep DX-first `MS-0003` | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ | ✅ | ✅ |
| Alt 1 — re-scope `MS-0003` in place (chosen) | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Alt 2 — new milestone ID, push DX out | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Alt 3 — self-hosted Kroki only, no spike | ✅ | ✅ | ✅ | ✅ | ⚠️ | ✅ | ✅ | ✅ |

### Alternative 0 — Do Nothing / Keep DX-first "Exceptional DX & easy setup"

- **Eligibility:** Not eligible (fails C-5 — rendering story remains
  public-Kroki-or-`code`; no no-external-services path exists for the partner).
- **Summary:** Ship guided init, ≤10-min metric, user guide as planned;
  conflict resolution stays in `MS-0005`/`MS-0006`.
- **Constraint compliance:** C-5 ❌ (no configurable self-hosted endpoint, no
  in-process path); all others pass (nothing changes).
- **Driver fit:** fails D1, D2, D3 outright; weak D4.
- **Pros:** smallest near-term scope; original plan continuity.
- **Cons:** the only real design partner cannot adopt; A-VAL-3 stays
  unvalidated despite a live corpus; the roadmap's own revalidation signal is
  ignored.
- **Why rejected:** fails a hard requirement and the top three drivers.

### Alternative 1 — Re-scope `MS-0003` in place → "Company Adoption MVP" (CHOSEN)

- **Eligibility:** Eligible.
- **Summary:** Keep the `MS-0003` ID; pull forward (a) reverse conversion
  Storage→Markdown for the canonical GFM subset (subset of `MS-0005`), (b)
  reviewable patch-based conflict resolution, Git-arbitrated (subset of
  `MS-0006`), (c) A-VAL-3 activation via `marksync import`, (d) reopened
  ADR-0002 territory: no-external-services Mermaid (in-process spike +
  configurable self-hosted endpoint). Former DX scope reduces to a milestone
  **tail** after conflict resolution; deeper polish moves to `MS-0004+`.
- **Constraint compliance:** all ✅ — guardrails preserved unchanged by
  design (see attestation).
- **Driver fit:** strongest on D1–D5; D6 preserved via the Milestone-ID rule
  and by pulling *subsets*, leaving the staged gates intact.
- **Pros:** partner unblocked; real-corpus A-VAL-3 evidence; wedge extended;
  rendering constraint satisfied with pre-committed fallbacks.
- **Cons:** DX activation for external users slips; two spike-gated
  workstreams add duration risk; solo-dev capacity spread.
- **Why chosen:** the only alternative that satisfies every constraint while
  serving every top driver.

### Alternative 2 — Allocate a new milestone ID for company adoption

- **Eligibility:** Eligible.
- **Summary:** Create e.g. `MS-0010` "Company Adoption" now, push the DX MLP
  to a later number.
- **Constraint compliance:** all ✅ (C-6 satisfied — no renumbering, new ID).
- **Driver fit:** D1–D5 similar to Alt 1; weaker D6 (adds a milestone,
  fragments the "revalidation of MS-0003 scope" the roadmap promised).
- **Pros:** clean separation of scopes in history.
- **Cons:** planning overhead and delay for zero functional gain; the roadmap
  explicitly anticipated `MS-0003` re-scoping after beta; the DX content does
  not disappear — it becomes the tail, so a new ID misrepresents the change.
- **Why rejected:** same outcomes as Alt 1 with more ceremony and slower
  start.

### Alternative 3 — Self-hosted Kroki endpoint only (skip the in-process spike)

- **Eligibility:** Eligible-with-accepted-risk-exception (C-5 — satisfies the
  partner's letter via company infra, but leaves the *default* binary unable
  to render without an external service; A-FEA-1 stays unresolved).
- **Summary:** Expose the Kroki endpoint in user config, point the company at
  their self-hosted instance; no second in-process attempt.
- **Constraint compliance:** C-5 ⚠️ (only via company-operated infra); C-8 ✅.
- **Driver fit:** satisfies D4 partially, D1 partially; abandons the
  single-binary ideal and leaves ADR-0002 Part B permanently unresolved.
- **Pros:** cheapest rendering fix; no spike cost.
- **Cons:** every future user needs a Kroki server or public egress;
  contradicts "ideally in-process in the single executable" (owner goal 1).
- **Why rejected as primary:** absorbed instead as the **fallback rung** of
  Alt 1's ladder — the spike is cheap per project principle, and its failure
  automatically lands here.

## Decision

- **Decision:** Adopt **Alternative 1**. `MS-0003` is re-scoped (ID unchanged)
  to **"Company Adoption MVP"** with epic structure:

  1. **Reverse converter foundation** (`MS-0005` subset): Storage→Markdown for
     the canonical GFM subset; stable unsupported-construct diagnostics
     (codes + locations); golden-fixture round-trip.
  2. **`resolve` patch flow** (`MS-0006` subset): remote-side diff = Markdown
     patch between (a) the Confluence version that originated from the last
     marksync publish (base version, recorded in the committed lock file,
     ADR-0006) and (b) the current Confluence version — both
     reverse-converted, then diffed as Markdown. Human applies/merges the
     patch in Git, commits, re-syncs; the follow-up sync publishes the merged
     result and records the new base. Preceded by a small spike: fetch page
     body at historical version N.
  3. **`import` command** (A-VAL-3 activation): explicitly adopt a
     Confluence-originated page into Git — reverse-convert, assign UUID v7
     frontmatter, add a lock entry with current remote hashes so the first
     sync is a NoOp. From that moment Git is the source of truth for the page.
  4. **No-external-services Mermaid** (ADR-0002 territory reopened): expose
     renderer engine configuration including a self-hosted Kroki endpoint;
     run a new time-boxed in-process spike (DOM emulation + deterministic
     synthetic text metrics) with the pre-committed ladder in-process →
     self-hosted endpoint → `code` policy. Public Kroki stays opt-in.
  5. **Adoption/DX tail** (reduced, sequenced after conflict resolution):
     guided init polish, examples, a first user guide focused on the company
     team's local-manual-sync flow; ≤10-min first publish is demoted from
     headline metric; deeper DX polish moves to `MS-0004+`; CI-driven sync
     deferred.

  **Ownership model (normative):** Git-originated managed documents — Git is
  the ultimate source of truth; Confluence-side manual edits flow back via the
  `resolve` patch flow. Confluence-originated unmanaged documents — stay in
  Confluence; marksync never touches them; `marksync import` is the only
  transition mechanism.

- **Rationale (tied to drivers):** D1/D2/D3 dominate — the only live design
  partner is blocked exactly on the pulled-forward subsets, and the retention
  partition (migration-absence, not safety/value) is the roadmap's own signal
  to escalate A-VAL-3. D4 is served with pre-committed fallbacks so a spike
  failure cannot derail the milestone. D5/D6 are respected by pulling subsets
  and keeping the ID.
- **Decider:** Juliusz Ćwiąkalski (owner), 2026-07-26.
- **Conditions for revisit:** see `revisit_triggers`; first review at the
  `review_date` after the pilot retrospective.

### Constraint Compliance Attestation

The chosen alternative satisfies all documented constraints:

- **C-1 — ✅** zero-silent-overwrite invariants extend to `resolve`/`import`
  (BDD lifecycle invariants).
- **C-2 — ✅** the patch flow is reviewable and human-applied; no auto-commit
  path exists or is added.
- **C-3 — ✅** unmanaged pages are never touched; adoption is explicit via
  `marksync import`.
- **C-4 — ✅** unsupported constructs produce stable diagnostic codes and an
  explicit resolution path (remove in Confluence or adopt-verbatim); never
  silently dropped.
- **C-5 — ✅** defaults render without egress (`code` policy until a rung
  passes); self-hosted endpoint is explicit configuration; public Kroki stays
  opt-in.
- **C-6 — ✅** the milestone keeps `MS-0003`; no renumbering.
- **C-7 — ✅** redaction coverage extends to all new outputs.
- **C-8 — ✅** the spike stays no-Chromium; ADR-0001 untouched (CEO-DEC-1
  pattern).

## Trade-offs & Consequences

### Positive Outcomes

- The first real adoption proceeds on `MS-0003` completion, not later
  milestones.
- A-VAL-3 gets its strongest possible validation: a real, used Confluence
  corpus.
- The trust wedge story strengthens: conflicts resolved in Git is the
  natural continuation of "never silently overwrite".
- Rendering constraint satisfied end-state with bounded downside (fallback
  ladder pre-committed).

### Negative Outcomes

- **DX-first activation slips:** the ≤10-min headline and public-user
  activation work (A-USA-1/2) lose their dedicated milestone; residual risk
  tracked for `MS-0004+` external-user focus.
- **Two spike-gated workstreams** (in-process Mermaid; historical-version
  API) add duration risk to a solo-developer milestone.
- **Validation breadth narrows:** one design partner (the maintainer's
  company) is a weaker retention signal than 3–5 external partners —
  acknowledged explicitly; the safety wedge itself was proven live.
- Reverse conversion on real pages may surface unsupported constructs
  frequently, shifting effort into diagnostics.

### Unresolved Questions

- [ ] Conflict-patch representation (unified Markdown diff vs structured
  bundle) — decide in `MS-0003` detailed planning (owner: Juliusz).
- [ ] `adopt-verbatim` escape-hatch semantics on `import` and `resolve`
  (marker format, later re-sync behavior) (owner: Juliusz + delivery plan).
- [ ] Does `import` handle attachments/labels day one, or page bodies only?
  (owner: `MS-0003` planning).
- [ ] Historical-version spike owner and time-box (owner: Juliusz).

## Implementation Plan

1. **Documentation (this change):** decision record + roadmap update
   (`doc/overview/02-roadmap.md`) + decision index; no code/spec changes.
2. **Backlog:** break `MS-0003` into epics E1–E5 with tickets; sequence E1
   (converter) first — it feeds both `resolve` (E2) and `import` (E3); the
   E4 spike can start early in parallel; E5 last.
3. **Spikes before commitments:** time-boxed in-process Mermaid spike
   (ADR-0002 stop criteria) and the historical-version API spike; publish
   outcomes before locking designs.
4. **Guardrail extension:** BDD lifecycle invariants cover `resolve` and
   `import` (zero silent overwrites; never auto-commit; unmanaged
   non-interaction; unsupported-construct diagnostics).
5. **Validation:** moderated onboarding with the actual company team;
   maintain a conflict-class taxonomy during the pilot.

## Rollout, Communication & Verification

**Communication:** the company dev team learns the new flow at pilot start
(owner presents the `resolve`/`import` workflow); the roadmap and this record
are the public artifact of record.

**Verification criteria:**

- **Metric: pilot operation** — Target: company team operates MarkSync ≥ 2
  weeks as their docs workflow — Window: `MS-0003` close.
- **Metric: conflict resolvability** — Target: 100% of known conflict classes
  resolvable via the documented flow — Window: `MS-0003` close.
- **Metric: reverse round-trip fidelity** — Guardrail: 100% on canonical
  golden fixtures (re-run on subset expansion) — Window: continuous.
- **Metric: zero silent overwrites** — Guardrail: 0 incidents (permanent) —
  Window: continuous.
- **Metric: default egress** — Guardrail: 0 external service calls under
  default rendering config — Window: continuous.
- **Metric: unsupported-construct diagnostics** — Target: 100% of known
  classes emit stable diagnostic codes with locations — Window: `MS-0003`
  close.

## Confidence Rating

**Medium-High.** The direction follows directly from the owner's explicit
goals and the roadmap's own revalidation gate; two of five goals are already
delivered facts. Confidence is bounded by two TO-CONFIRM spikes (in-process
Mermaid; historical-version API) — both have pre-committed fallbacks, so
residual uncertainty affects milestone *duration and rendering rung*, not the
decision's structure.

## Lessons Learned (Retrospective)

TODO: First retro after `MS-0003` pilot (≥2 weeks of team operation).

## References

- [`02-roadmap.md`](../overview/02-roadmap.md) — updated MS-0003 section,
  allocation matrix, completed-MS-0002 entry.
- [ADR-0002](./ADR-0002-mermaid-rendering-strategy.md) — rung ladder, GH-11
  spike outcome, reopened Part B territory.
- [ADR-0005](./ADR-0005-page-body-representation-storage-not-adf.md) —
  Storage Format / canonical subset discipline.
- [ADR-0006](./ADR-0006-document-identity-and-shared-base-state-model.md) —
  committed lock, shared base, UUID v7 identity.
- `../inception/analysis/assumptions.md` — A-VAL-3, A-USA-1/2/3, A-FEA-1.
- `../inception/analysis/risks.md` — R-VAL-4, R-USA-2, R-FEA-1.
- Owner direction: five company MVP goals + ownership model (Juliusz
  Ćwiąkalski, 2026-07-26) — transcribed in Context and Decision.

## Revision History

- **2026-07-26** — Initial record, authored and accepted same day per owner
  direction (five company MVP goals; ownership model; conflict-resolution
  sequencing). Status `Accepted` per repo lifecycle.
