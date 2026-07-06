---
status: Accepted
created: 2026-07-06T20:30:00
phase_scope: 7
topic: Initial milestone backlog missing from Phase 7 activities
outcome: propose-ados-framework-improvement
---

# Retrospective: Phase 7 must explicitly produce the initial milestone backlog

## What happened

Phase 7 was nearly completed without a ranked milestone backlog. The inception
guide's Phase 7 activities say:

1. Generate the inception summary
2. Produce initial feature specs
3. Verify initial backlog coverage for cross-cutting concerns
4. Final human sign-off

Activity 3 ("verify initial backlog coverage") was interpreted as "verify that
cross-cutting concerns are represented in feature specs" — which is not the same
as creating a ranked delivery backlog. The backlog reconciliation (Phase 2)
explicitly defers concrete ticket creation to "Phase 7 / first delivery
planning" but the Phase 7 guide doesn't list "create the backlog" as an explicit
activity.

The owner caught this gap: *"at which phase should we create backlog for first
milestone?"* — and the answer should have been obvious from the start: Phase 7.

## Root cause

The inception guide's Phase 7 is written as "summary & handoff" — focused on
recording what was decided, not on producing the delivery plan. But the backlog
reconciliation (Phase 2), the roadmap (Phase 2), and the feature specs (Phase 7)
all converge on needing a ranked backlog as the final handoff artifact.

The guide says "verify backlog coverage" without saying "create the backlog to
verify against." This is an ambiguity that led to the backlog being skipped.

## Improvement / pattern to propose

**Add "Create the initial milestone backlog" as an explicit Phase 7 activity.**

The updated Phase 7 activities should read:

1. Generate the inception summary (decisions, deferred items, confidence).
2. Produce initial feature specs from the current-milestone scope.
3. **Create the initial milestone backlog** — a ranked delivery queue at
   `doc/planning/backlog-MS-<NNNN>.md`, derived from the roadmap deliverables +
   feature specs + backlog reconciliation matrix + cross-cutting concerns.
4. Verify initial backlog coverage for cross-cutting concerns (against the
   backlog created in step 3).
5. Final human sign-off.

### Why Phase 7 (not earlier)

- **Phase 2** has the roadmap scope but not the architecture, conventions, or
  feature decomposition needed for actionable tickets.
- **Phase 3–4** produce the architecture and conventions but not the feature
  specs.
- **Phase 7** has all inputs: roadmap, architecture, conventions, feature specs,
  risk register, assumptions, cross-cutting matrix — everything needed to write
  a ranked, dependency-aware backlog.

### What the backlog contains

- **Spike items** (load-bearing unknowns that gate feature work)
- **Foundation items** (scaffolding, config, CLI framework, auth)
- **Core domain items** (the trust wedge: identity, state, drift, sync engine)
- **Feature items** (Mermaid, attachments, provenance, repair)
- **Quality/ops items** (test wiring, doctor, corpus, binary builds)
- **Dependency chain** (what blocks what)
- **Cross-cutting AC references** (each item links to the invariants/NFRs it serves)
- **Deferred items** (explicitly out of scope, with trigger conditions)

## Anti-pattern

**Inception without a backlog is handoff without a plan.** Feature specs describe
*what* to build; the backlog describes *in what order* to build it. Without the
backlog, the first delivery action becomes ad-hoc PM prioritization instead of
executing a reviewed plan.

## Caution

- The backlog is a **plan, not a contract**. It's subject to reprioritization as
  MS-0002 delivery surfaces new knowledge. PM reviews ranking every few tickets.
- **Don't over-plan future milestones.** Only the current milestone gets a full
  backlog. Later milestones get high-level scope only (they'll be re-planned
  when their turn comes).

**Filed as:** ADOS framework improvement — add explicit backlog-creation
activity to Phase 7 of the project-inception guide.
