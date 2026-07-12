# Readiness Review Iteration 3

Verdict: READY
Work Item: GH-22
Date: 2026-07-12
Pause Required: no

## Facet Summary
- spec_completeness: PASS
- ac_quality: PASS
- plan_coverage: PASS
- test_traceability: PASS
- cross_artifact_consistency: PASS
- decision_capture: PASS
- system_spec_consistency: PASS
- plan_doc_update_coverage: PASS
- plan_code_area_coverage: PASS
- dod_defined: PASS

## Gate Result

**Delivery is unblocked.** All three iter-2 findings are closed and no new
blocker/inconsistency was introduced by the remediation. The persistent root
cause of iter-1/iter-2 (TC-FALSEPOS fixtures asserting `NO_CHANGE` for diffs
the verified GH-20 canonicalizer does **not** normalize, then the same defect
propagating to the plan) is fully resolved: the plan's Phase 2 task 2.2, the
plan's Test Scenarios table row, and the test plan's §5.2 TC-FALSEPOS-001..005
now **agree with each other** and assert `NO_CHANGE` **only** for diffs the
canonicalizer provably normalizes.

Two non-blocking nits are noted below (Finding 3, Finding 4). Per the iter-3
instructions, nits do not block delivery; they may be folded into a future
doc-sync pass or addressed opportunistically during delivery.

## Verification performed (adversarial, against current source)

Reuse + canonicalizer claims re-verified against **actual source** a third time:

- `src/domain/render/canonicalize.ts` (109 lines, re-read in full):
  - `isStructuralWhitespace` (L77-79): drops a text node **only** when
    `value.trim() === "" && value.includes("\n")` (L62 `continue`). ⇒ structural-
    ws-node-count changes and empty-line-count changes are normalized to
    identity. ✓
  - `sortProperties` (L82-88): stably sorts element property keys. ⇒ attribute-
    order diffs are normalized. ✓
  - `raw`→`text` (L64-67): a `raw` node and a `text` node with the same `value`
    both emit `{ type: "text", value }`. ⇒ raw-vs-text equivalence is
    normalized. ✓
  - `position` is never copied (cloneElement L47-54 / cloneChildren L56-74).
    ⇒ source-location diffs are normalized. ✓
  - Does **not** collapse internal whitespace within a text node (L63 preserves
    `child.value` verbatim); does **not** trim code-block text. ⇒ those remain
    real changes (correctly excluded from the false-positive suite).
  - `contentHash` returns bare lowercase-hex sha256; header L40-41 defers the
    wire-prefix to E3-S5 verbatim ⇒ DEC-2 delegation valid.
- Whole-change grep for the old broken terms (`paragraph internal whitespace`,
  `trailing/leading whitespace in code blocks`, `indentation` as a positive
  NO_CHANGE case) returns **zero** positive assertions. The only surviving
  mentions are correct **negative** statements (spec F-2 detail L114, test-plan
  Notes L495, plan task 2.2 L653) that GH-20 does NOT normalize those.

## Iter-2 finding closure audit

### Iter-2 Finding 1 (blocker, plan TC-FALSEPOS descriptions) — CLOSED

The persistent root cause is resolved. Plan Phase 2 task 2.2
(`chg-GH-22-plan.md` L643-654) now enumerates the five GH-20-normalized diffs:

| TC | Plan task 2.2 (current) | Test plan §5.2 (current) | Canonicalizer mechanism | Provably normalized? |
|----|-------------------------|--------------------------|-------------------------|----------------------|
| 001 | structural-whitespace text-node count between block siblings (ws-only + `\n`) | Structural-whitespace text node count change between block siblings | `isStructuralWhitespace` L77-79 → dropped L62 | **YES** |
| 002 | multiple newline-containing ws nodes between blocks collapsed | Multiple newline-containing whitespace nodes between blocks collapsed to one | all such nodes dropped L62 | **YES** |
| 003 | HTML attribute order (`sortProperties`) | HTML attribute order diff | `sortProperties` L82-88 | **YES** |
| 004 | raw-HTML node vs text node (`raw`→`text` branch) | Raw HTML node vs text node for the same literal value | `raw`→`text` L64-67 | **YES** |
| 005 | empty-line count change (structural ws dropped) | Empty line count change (structural whitespace dropped) | empty line = ws-only + `\n` → dropped | **YES** |

**Plan ↔ test-plan agreement:** the two artifacts now describe TC-FALSEPOS-001..005
identically (same five diffs, same order, same mechanisms). No contradiction.
**Plan ↔ canonicalizer:** every asserted `NO_CHANGE` case is a diff the
canonicalizer provably normalizes to byte-identical output (verified against
`canonicalize.ts` line-by-line above). The plan additionally carries the
explicit negative guidance — *"Do NOT assert `NO_CHANGE` for internal-whitespace
collapse or code-block trimming (GH-20 does not normalize those — they are real
changes)"* (L653-654) — which is the correct guard against the iter-1/iter-2
DEC-2-breach pressure mode.

The plan's Test Scenarios table row (L947) is also updated: *"5 GH-20-normalized
diffs (structural-ws-node count, multi-ws-node collapse, attribute order,
raw-vs-text, empty-line count) → `ok(NO_CHANGE)`"*. Matches task 2.2 and the
test plan. **Iter-2 Finding 1 is closed in full.**

### Iter-2 Finding 2 (minor, spec DM-6/glossary SharedBase title) — CLOSED

- DM-6 (`chg-GH-22-spec.md` L217): *"`title` is **not** a base facet
  (`PageBinding` carries no title in MS-0002) — title is a local-vs-remote
  facet carried on `ContentHash` (DM-2)."*
- Glossary `SharedBase` (L383): *"Carries no `title` (`PageBinding` has none in
  MS-0002)."*

Both now state `title` is NOT a base facet, with the PageBinding-has-no-title
explanation, consistent with the plan's `SharedBase` type (L452-455, no `title`)
and PD-3 (L157-166). **Iter-2 Finding 2 is closed.**

### Iter-2 Finding 3 (nit, ContentHash summary lines) — CLOSED

The three remediation-targeted lines now include `title` + `parentPageId`:

- §7.1 (L172): *"`ContentHash` value object (`rawHash` + `canonicalHash` +
  `attachmentHash` + `title` + `parentPageId` — the R1 metadata facets)"* ✓
- §16 component table (L313): *"`rawHash` + `canonicalHash` (delegates to GH-20)
  + `attachmentHash` + `title` + `parentPageId` (R1 facets)"* ✓
- Glossary `ContentHash` (L382): *"`rawHash` (informational), `canonicalHash`
  (comparison basis, delegates to GH-20), `attachmentHash`, plus `title` +
  `parentPageId` (R1 metadata facets)"* ✓

These agree with the authoritative DM-2 (L213: `{ rawHash; canonicalHash;
attachmentHash; title; parentPageId }`) and F-2 (L104, L114). **Iter-2 Finding 3
is closed.**

## Findings

### 1. [nit] cross_artifact_consistency — chg-GH-22-spec.md §1 SUMMARY item 2 (L31) + §4 G-2 (L68) [residual of the same class as iter-2 Finding 3]

**Gap.** Two high-level summary/goal lines still describe `ContentHash` with
only the three hash facets, not the full 5-field shape: §1 SUMMARY item 2 (L31)
— *"`ContentHash` value object — the canonical semantic-hash composition:
`rawHash` … `canonicalHash` … `attachmentHash`"*; and G-2 (L68) — *"Deliver the
`ContentHash` value object — `rawHash` + `canonicalHash` … + `attachmentHash`"*.
This is the same class of nit as iter-2 Finding 3 (summary lines under-describing
the type the remediation enlarged), in two locations iter-2 did not enumerate.
The authoritative DM-2/F-2 (5 fields) govern; §1/G-2 are high-level summaries
focused on the hash-composition/DEC-2-delegation aspect.

**Suggested remediation target phase:** specification (non-blocking; can fold
into a future doc-sync pass)

**Suggested fix.** Optionally append *"+ `title` + `parentPageId` (R1 metadata
facets)"* to the §1 item 2 and G-2 `ContentHash` descriptions for full
internal consistency with DM-2/F-2.

---

### 2. [nit] test_traceability — chg-GH-22-test-plan.md TC-FALSEPOS-002 (L159, L476) + chg-GH-22-plan.md task 2.2 (L647)

**Gap.** TC-FALSEPOS-002 is phrased *"multiple newline-containing whitespace
nodes between blocks **collapsed to one**"*. The verified canonicalizer does
not collapse N structural-ws nodes to one — it **drops all of them** (L62
`continue` for every node matching `isStructuralWhitespace`). So the literal
phrasing should be "collapsed to zero" / "all dropped". The asserted behavior
(`NO_CHANGE`) is **correct** (any count of structural-ws nodes → 0 after
canonicalization → identical hashes), so this is a prose imprecision, not a
fixture-accuracy defect. The test plan's own Notes (L490-491) state the
mechanism correctly (*"structural whitespace drop … drops text nodes that are
whitespace-only AND contain a newline"*).

**Suggested remediation target phase:** test_planning (non-blocking)

**Suggested fix.** Optionally reword TC-FALSEPOS-002 from "collapsed to one" to
"all dropped (any count → zero)" for literal accuracy with `canonicalize.ts`
L62.

---

## No-regression check

The remediation stayed internally consistent across the three artifacts:

- **ContentHash shape (5 fields)** — F-2 (L104), F-2 detail (L114), §7.1 (L172),
  DM-2 (L213), §16 (L313), glossary (L382), plan PD-1 (L133-143), plan task 1.2
  type (L476-479): all agree on `{ rawHash; canonicalHash; attachmentHash;
  title; parentPageId }`. (§1 L31 + G-2 L68 are 3-field summaries — Finding 1
  nit.)
- **SharedBase shape (no title)** — DM-6 (L217), glossary (L383), plan task 1.1
  (L452-455), PD-3 (L157-166): all agree SharedBase carries no `title`.
- **TC-FALSEPOS-001..005 descriptions** — test plan index (L158-162), test plan
  §5.2 (L475-482), plan task 2.2 (L643-654), plan Test Scenarios table (L947):
  all four locations describe the same five GH-20-normalized diffs.
- **No silent positive assertion** of `NO_CHANGE` for internal-whitespace
  collapse or code-block trimming survives anywhere (verified by whole-change
  grep). The DEC-2-breach pressure mode iter-1/iter-2 warned of is closed off.

## What passed (re-confirmed, not re-litigated)

All iter-1 and iter-2 passes hold; no regression in the iter-2→iter-3
remediation:

- **spec_completeness** — every story deliverable (classifier, hashes, actions,
  RemoteState union, 6-state enum, false-positive guard, REMOTE_MISSING
  invariant) addressed; OQ-1..OQ-4 resolved at clarify_scope; no
  decision-advisor escalation needed.
- **ac_quality** — 13 ACs (AC-F1-1, AC-F3-1..F3-6, AC-F4-1, AC-F2-1, AC-F2-2,
  AC-F5-1, AC-F6-1, AC-Q-1) Given/When/Then, concrete, non-overlapping.
- **plan_coverage** — every AC + every TC maps to a plan phase; code-area blast
  radius explicit per phase; reused contracts enumerated under "DO NOT
  re-implement".
- **test_traceability** — every AC maps to ≥1 TC; every TC maps to a plan phase.
  The false-positive suite now asserts `NO_CHANGE` only for diffs the
  canonicalizer provably normalizes (verified line-by-line against
  `canonicalize.ts`).
- **decision_capture** — DEC-1..6 (spec), PD-1..5 (plan), R1/Q1 (pm-notes),
  iter-1 Finding 4 (pm-notes decision #0 expanded). None require an ADR.
- **system_spec_consistency** — consistent with UL §Sync State, ADR-0006
  INV-SAFE-1/2, feature-safe-publish §3.1/§5, NFRs; iter-1 Finding 2 typo
  (`domain-may-not-import-infra`) fixed; §4.2 stub + architecture-overview
  classify sketch correctly routed to lifecycle phase 7.
- **plan_doc_update_coverage** — Phase 5 task 5.4 enumerates the system docs to
  update (feature-safe-publish §4.2, architecture-overview, UL bindings,
  related_changes) and defers them to `@doc-syncer` phase 7.
- **plan_code_area_coverage** — four new modules + four test files listed with
  exact paths; reused contracts enumerated.
- **dod_defined** — spec §17 AC table = the DoD (story file confirms); testable
  and complete.
- **Quantitative-AC testability** — NFR-REL-3 (<5%) / NFR-REL-2 (100%) framed as
  concrete fixture suites (TC-FALSEPOS-001..005 + TC-REALCHG-001..005), now with
  accurate fixture descriptions on both the test-plan and plan sides.
- **Reuse claims** — re-verified against source this iteration:
  `canonicalize`/`contentHash` signatures + header delegation (DEC-2);
  `PageBinding` fields (no `title` → PD-3 / DM-6); `RemoteMissing`/`Forbidden`/
  `Conflict` arms (DEC-3); `Result<T,E>`; `reconcile.ts` sibling;
  boundary-negative pattern.
- **Dependencies** — GH-18/19/20/21 all merged on `main`.

## Next step

Proceed to **delivery** (phase 6). The plan is `READY` for `/run-plan GH-22`.
The two nits (Finding 1: §1/G-2 ContentHash summaries; Finding 2: TC-FALSEPOS-002
"collapsed to one" phrasing) are non-blocking and may be folded into a future
doc-sync pass or addressed opportunistically during delivery without reopening
any artifact-creation phase.
