---
# Copyright (c) 2025-2026 Juliusz Ćwiąkalski (https://www.cwiakalski.com | https://www.linkedin.com/in/juliusz-cwiakalski/ | https://x.com/cwiakalski)
# MIT License - see LICENSE file for full terms
id: ADR-0004
decision_type: tdr
status: Proposed
created: 2026-07-03
decision_date: null
last_updated: 2026-07-03
summary: "Approve a time-boxed, language-independent Atlassian Confluence Cloud API spike before implementation to convert assumptions into verified facts."
owners:
  - Juliusz Ćwiąkalski
service: marksync-cli
decision_area: architecture
decision_scope: repo
reversibility: easy
review_date: null
business_impact: "De-risks the load-bearing drift-detection and ownership model before costly implementation; seeds follow-on ADRs."
customer_impact: "None directly; prevents shipping a sync engine built on unverified API assumptions."
classification:
  domains: [architecture, operations, risk-management]
  archetype: go_no_go
  environment: complicated
  rigor: R2
  reversibility: easy
  stakes: high
  urgency: high
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
  - "Atlassian announces deprecation/migration of Cloud REST API v2, content properties, or page body representations referenced by the spike."
  - "Implementation uncovers behavior inconsistent with the recorded spike findings."
links:
  related_changes: []
  supersedes: []
  superseded_by: []
  spec: ["../system-specification-draft-from-ai-brainstorm.md"]
  contracts: []
  diagrams: []
  decisions: [ADR-0001, ADR-0002, ADR-0003]
  experiments: []
  metrics: []
  roadmap_items: []
---

# ADR-0004: Run a scoped Atlassian Confluence Cloud API validation spike before implementation

## Context

> **Pre-inception location note:** This record lives in `doc/inception/decisions/` by the project owner's explicit direction, overriding the canonical ADOS decision home (`doc/decisions/`). These are pre-inception inputs pending human confirmation during the formal ADOS inception, where they will be reviewed and possibly migrated to `doc/decisions/`. Records are numbered in one inception sequence (ADR-0001…ADR-0004) regardless of `decision_type`.

MarkSync's drift-detection + ownership model is **load-bearing on assumptions about Confluence Cloud REST API v2 behavior**. Those assumptions were checked against official Atlassian documentation on 2026-06-16 but have **never been exercised against a real tenant** (spec §20.3 "External Reference Baseline"; §2.4 assumptions flagged "Validation Needed"). The spec itself defines "Required Discovery Before Implementation" (§12.4), including sandbox spikes of Storage Format create/read/update, attachments, content properties, and Mermaid.

The failure premortem's top strategic risks bear directly on this:

- **"AI-generated false confidence"** — "extensive specifications and tests validate the implementation against the team's own assumptions rather than against real Confluence behavior" (§3.6).
- **"Mocked Confluence integration becomes the dominant test layer"** — explicitly listed in the strategy report's anti-patterns ("Relying only on mocked Confluence tests", §30) and the failure premortem's "do not do" checklist ("use mocks as the primary evidence of platform correctness", §22).
- **"Wrong state model"** — relying on local cache/timestamps/path/title for decisions that require durable identity and a shared base (§3, risk #17).

FACT: A spike is cheap, language-independent (curl or a throwaway script), and does **not** depend on ADR-0001's language outcome. FACT: Atlassian APIs evolve; the spec mandates re-verification before implementation (§20.3). FACT: Several spec assumptions are explicitly conditional on a spike (Storage representation as write body, page API v2, content-property behavior, state model — spec §2.4, §2.5).

## Problem Framing (Clarified)

The decision is **not** "which API endpoints to use" (that is an implementation detail settled by the spike's findings). The decision is: *do we invest in a short, scoped, language-independent API spike BEFORE full implementation, to convert documented assumptions into verified facts?*

This is a go/no-go on risk reduction. The cost is small and bounded; the cost of *not* spiking is building a sync engine and state model on assumptions that may be wrong, then reworking load-bearing logic.

## Constraints (Hard Requirements)

### C-1: Disposable sandbox (never production)

- **Statement:** The spike must run against a disposable Confluence Cloud sandbox space that is created for the spike and torn down afterwards — never a production space.
- **Source:** Spec §12.4 (create a disposable Cloud sandbox space); failure premortem (prove safety claims on real tenants, not production).
- **Verification:** Spike uses an isolated sandbox account/space; teardown is recorded.
- **Negotiable:** no.

### C-2: Captured, redacted request/response evidence

- **Statement:** All findings must be backed by captured request/response evidence with auth/cookies/tokens/account data redacted.
- **Source:** Spec NFR-004 (credentials never in logs); failure premortem §22 (secrets never in evidence).
- **Verification:** Evidence artifacts are reviewed for redaction before storage.
- **Negotiable:** no.

### C-3: Results recorded as ADRs / assumption-validation (not lost)

- **Statement:** Spike results must be written down in a durable findings note and must force any ADRs they imply (e.g., ADF vs Storage; state model). Findings must not live only in someone's head.
- **Source:** Spec §12.4 ("Record findings/deviations in ADRs before full implementation"); §17.5.
- **Verification:** A findings document exists and is linked from this record.
- **Negotiable:** no.

## Decision Drivers

**Risk-management drivers:**
- Eliminate the highest-impact, cheapest-to-resolve unknowns before implementation.
- Avoid the "AI-generated false confidence" failure mode (failure premortem §3.6).

**Technical drivers:**
- Confirm the load-bearing mechanisms: content properties (ownership/drift), page body representation (renderer target under ADR-0001), optimistic concurrency (safe update), attachments.
- Validate the spec's state-model assumptions (spec §2.5 open question: commit lock vs remote-only state).

**Operational drivers:**
- The spike is cheap, fast, and unblocks multiple downstream ADRs.
- It is independent of the ADR-0001 language decision, so it can start immediately.

## Mental Models & Techniques Used

- **Information Value / Expected Value:** a small, bounded investment resolves assumptions whose impact-if-false is high (drift detection, ownership, safe update). Very high EV.
- **Inversion:** "How do we ensure we never ship a sync engine built on unverified API assumptions?" → spike the load-bearing calls against a real tenant first.
- **Ockham's razor / KISS:** curl or a tiny throwaway script is sufficient — no need to build the real CLI to validate the API.
- **Decoupling:** the spike is language-independent, so it does not block on ADR-0001 and reduces the critical path.

## Alternatives Considered

### Per-Alternative Constraint-Compliance Evaluation

Legend: ✅ = passes · ❌ = fails · ⚠️ = passes only via an accepted-risk exception.

|          | C-1 (disposable sandbox) | C-2 (redacted evidence) | C-3 (recorded results) |
|----------|---------------------------|---------------------------|--------------------------|
| Alt 0    | n/a (no spike) | n/a | ❌ (assumptions stay unverified) |
| Alt 1    | ✅ | ✅ | ✅ |
| Alt 2    | ✅ | ✅ | ⚠️ (costly; findings arrive too late) |

### Alternative 0 — Do nothing; build on documented assumptions

- **Summary:** Skip the spike; implement directly against the 2026-06-16 documented API behavior.
- **Pros:** Saves a few days; starts implementation immediately.
- **Cons:** Bets the entire drift/ownership/state model on unverified assumptions; directly courts the failure premortem's top risks (§3.6 false confidence; §7.3 reactive API-drift handling).
- **Constraint compliance:** C-3 ❌ (assumptions never validated).
- **Why rejected:** High impact-if-wrong; the failure premortem and strategy report both explicitly warn against this path.

### Alternative 1 — The scoped, time-boxed API spike (RECOMMENDED)

- **Summary:** A language-independent, time-boxed spike against a disposable sandbox, producing redacted evidence and a findings note that seeds follow-on ADRs.
- **Pros:** Cheap; resolves load-bearing unknowns; independent of ADR-0001; directly implements spec §12.4.
- **Cons:** Takes a few days; requires a sandbox tenant.
- **Constraint compliance:** C-1 ✅; C-2 ✅; C-3 ✅.
- **Why chosen:** Best EV; satisfies all constraints; unblocks downstream ADRs.

### Alternative 2 — Full implementation, then fix discrepancies

- **Summary:** Implement the whole engine, then discover API mismatches during integration/E2E and patch.
- **Pros:** Produces shippable artifacts sooner (superficially).
- **Cons:** Reworking load-bearing state/identity/concurrency logic after the fact is far more expensive than a spike; findings arrive too late to shape the architecture.
- **Constraint compliance:** C-1 ✅; C-2 ✅; C-3 ⚠️ (results discovered late, in code rather than up-front ADRs).
- **Why rejected:** Most expensive path; violates "validate before commitment."

## Decision

**Recommendation: Alternative 1 — approve running a time-boxed, language-independent Atlassian Confluence Cloud API spike BEFORE full implementation.**

The spike may run with curl or a tiny throwaway script. It does **not** depend on ADR-0001's language outcome and should start immediately. Its purpose is to convert documented assumptions (spec §2.4) into verified facts and to seed the follow-on ADRs they force.

> **AI-assistance disclosure:** This analysis is AI-assisted. The human decider (Juliusz Ćwiąkalski) has **not yet** decided. `status: Proposed` until human confirmation during inception. (This is a decision to *invest in a spike*; it is not itself an Atlassian API interpretation.)

### Constraint Compliance Attestation

The recommended alternative (Alt 1) satisfies all documented constraints:

- **C-1 — ✅ Full compliance:** Spike uses a disposable sandbox space, created and torn down.
- **C-2 — ✅ Full compliance:** All captured request/response evidence is redacted of auth/cookies/tokens/account data.
- **C-3 — ✅ Full compliance:** Findings are written to a durable note and force any implied ADRs.

No accepted-risk exceptions are required.

## Trade-offs & Consequences

### Positive Outcomes

- Load-bearing assumptions (content properties, body representation, concurrency, attachments, auth) are verified before implementation.
- Seeds concrete follow-on ADRs (ADF vs Storage; commit-lock vs remote-only state model).
- Independent of ADR-0001, so it can start now and shorten the critical path.
- Directly counters the "false confidence" and "mocks-as-primary-evidence" failure modes.

### Negative Outcomes

- A few days of elapsed time and a sandbox tenant are required.
- Some findings may invalidate spec assumptions, requiring spec updates (a feature, not a bug).

### Unresolved Questions

The spike's own scope (each item becomes a verification criterion with an owner):

- [ ] **Content properties:** can `marksync.metadata` be reliably written and read back as a content property? What are the size and per-page count limits? (LOAD-BEARING for ownership + drift detection) — owner: Juliusz Ćwiąkalski
- [ ] **Page body representation:** does Confluence Cloud page API v2 accept **Storage representation** as the write body, or is **ADF** now expected? (Newly important under ADR-0001 — affects the renderer target) — owner: Juliusz Ćwiąkalski
- [ ] **Attachments:** multipart upload + reference behavior (attachment create/replace, naming, MIME) — owner: Juliusz Ćwiąkalski
- [ ] **Version-conflict / optimistic concurrency:** semantics of page update with an explicit version (basis for refusing blind overwrites) — owner: Juliusz Ćwiąkalski
- [ ] **Auth sanity:** API-token basic auth against a disposable sandbox space — owner: Juliusz Ćwiąkalski

## Implementation Plan

1. **Provision** a disposable Confluence Cloud sandbox space (C-1).
2. **Run** the five spike items above with curl/throwaway script, capturing redacted request/response evidence (C-2).
3. **Record** findings in `doc/inception/analysis/atlassian-api-spike-findings.md` (reference only — do **not** create it as part of this record).
4. **Force follow-on ADRs** where findings diverge from spec assumptions (anticipated: ADF vs Storage; commit-lock vs remote-only state model).
5. **Tear down** the sandbox space; confirm no production data was touched.

**Risk mitigation:** treat the spike as time-boxed; if the sandbox is temporarily unavailable, record the gap explicitly (spec §12.4) rather than silently proceeding on assumptions.

## Verification Criteria

- **Metric: Assumption coverage** — Target: each of the 5 spike items has a recorded, evidence-backed finding (verified / refuted / partial) — Window: spike completion.
- **Metric: Sandbox isolation** — Target: zero production-space mutations during the spike — Window: spike completion.
- **Metric: Redaction** — Target: 0 secrets/tokens/account data in stored evidence (reviewed) — Window: before evidence is stored.
- **Metric: Follow-on ADRs** — Target: every finding that diverges from spec §2.4 assumptions produces (or updates) an ADR — Window: post-spike.

## Confidence Rating

**High** on the decision to spike (low-cost, high-value, satisfies spec §12.4 and directly mitigates the failure premortem's top risks). The spike's *findings* will determine confidence in the downstream architecture ADRs.

## Lessons Learned (Retrospective)

TODO: Populate after implementation.

## References

- `../system-specification-draft-from-ai-brainstorm.md` — §2.4 (assumptions needing validation), §2.5 (open questions: state model), §9.3 (remote property `marksync.metadata`), §9.7 (Confluence adapter), §12.4 (Required Discovery Before Implementation), §16 (API-change risk), §20.3 (External Reference Baseline — 2026-06-16).
- `../marksync-failure-premortem-and-anti-failure-playbook-2026-07-02.md` — §3 (strategic failure modes incl. "AI-generated false confidence"), §7 (auth/platform failure modes incl. "all authentication scenarios is an unbounded requirement"), §17 (testing strategy), §22 (do-not-do: mocks as primary evidence).
- `../marksync-category-leadership-strategy-report-2026-07-02.md` — §30 (anti-patterns: mocked Confluence tests), §33 (key hypotheses to validate early).
- Related decisions: ADR-0001 (language — affects renderer target), ADR-0002 (Mermaid — uses attachments), ADR-0003 (naming — independent).
