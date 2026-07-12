# Readiness Review Iteration 2

Verdict: NOT_READY
Work Item: GH-22
Date: 2026-07-12
Pause Required: no

## Facet Summary
- spec_completeness: PASS
- ac_quality: PASS
- plan_coverage: FAIL
- test_traceability: PASS
- cross_artifact_consistency: FAIL
- decision_capture: PASS
- system_spec_consistency: PASS
- plan_doc_update_coverage: PASS
- plan_code_area_coverage: PASS
- dod_defined: PASS

## Gate Result

Delivery remains **blocked**. The iter-1 blocker's root cause (false-positive
fixtures asserting `NO_CHANGE` for diffs the verified GH-20 canonicalizer does
**not** normalize) was remediated in the **test plan** but **not propagated to
the plan**. The plan's Phase 2 task 2.2 (`chg-GH-22-plan.md` L643-647) still
enumerates the exact two broken cases iter-1 flagged — *"paragraph internal
whitespace"* and *"trailing/leading whitespace in code blocks"* — neither of
which `canonicalize.ts` normalizes to identity. The plan is the `/run-plan`
delivery instruction; a coder executing it writes the failing fixtures
iter-1 blocked on (or, worse, is pressured to modify `canonicalize.ts` to make
them pass — the DEC-2 breach iter-1 warned of).

The test-plan side of iter-1 Finding 1 **is** closed (verified below); the
plan side is not. This is the same root cause persisting in a sibling artifact.

**Phase to reopen:** `delivery_planning` (the plan). Findings 2 and 3 are
non-blocking spec-prose cleanups foldable into the same revision pass.

## Verification performed (adversarial, against current source)

Reuse + canonicalizer claims re-verified against **actual source**, not
artifact assertions:

- `src/domain/render/canonicalize.ts` (re-read in full, 109 lines):
  - `isStructuralWhitespace` (L77-79) drops a text node **only** when
    `value.trim() === "" && value.includes("\n")` (L62 `continue`). It does
    **not** collapse internal whitespace within a text node and does **not**
    trim code-block text.
  - `sortProperties` (L82-88) stably sorts element property keys → attribute
    order is normalized.
  - `raw`→`text` (L64-67): a `raw` node with value `v` and a `text` node with
    value `v` both emit `{ type: "text", value: v }` → byte-identical.
  - `position` is never copied (`cloneElement` L47-54 / `cloneChildren` L56-74
    reconstruct only `type`/`tagName`/`properties`/`children` or `type`/`value`).
  - `contentHash(canonical)` returns bare lowercase-hex sha256; header L40-41
    defers the wire-prefix to E3-S5 verbatim → DEC-2 delegation valid.
- `.dependency-cruiser.cjs` L17 — rule name is `domain-may-not-import-infra`
  (single "not"), severity `error` → iter-1 Finding 2 typo confirmed fixed.
- `src/domain/binding/page-binding.ts` — `PageBinding` carries `parentPageId`
  but **no `title`** → PD-3 sound; SharedBase cannot project a `title` field
  (relevant to Finding 2 below).

## Iter-1 finding closure audit

### Iter-1 Finding 1 (blocker, test-plan) — CLOSED on the test-plan side

`chg-GH-22-test-plan.md` §5.2 (TC-FALSEPOS-001..005, L475-496) rewritten and
**verified correct against the canonicalizer source**:

| TC | Test-plan description (current) | Canonicalizer mechanism | Provably normalized? |
|----|---------------------------------|-------------------------|---------------------|
| TC-FALSEPOS-001 | Structural-whitespace text node count change between block siblings (ws-only + `\n`) | `isStructuralWhitespace` L77-79 → dropped at L62 | **YES** |
| TC-FALSEPOS-002 | Multiple newline-containing ws nodes between blocks → collapsed | all such nodes dropped (L62) | **YES** |
| TC-FALSEPOS-003 | HTML attribute order diff | `sortProperties` L82-88 | **YES** (was sound in iter-1) |
| TC-FALSEPOS-004 | Raw HTML node vs text node for same literal value | `raw`→`text` L64-67 | **YES** (was the iter-1 blocker case; now sound) |
| TC-FALSEPOS-005 | Empty-line count change | empty line = ws-only + `\n` → dropped | **YES** (was sound in iter-1) |

The suite's Notes/Clarifications (L488-496) now precisely enumerate the four
invariants GH-20 normalizes (`isStructuralWhitespace` / `sortProperties` /
raw→text / position-absence, each with correct line cites) **and** the three it
does NOT (internal whitespace, code-block trimming, non-structural indentation).
This is accurate. **The test-plan half of iter-1 Finding 1 is closed.**

→ **BUT see Finding 1 below**: the same root cause persists in the **plan**.

### Iter-1 Finding 2 (minor, spec typo) — CLOSED

`chg-GH-22-spec.md` L47 now reads `domain-may-not-import-infra` (single "not").
Verified no double-"not" remains in any current change artifact (the sole
surviving occurrence is the historical quote inside `readiness-iter-1.md` itself,
which is an immutable record).

### Iter-1 Finding 3 (minor, ContentHash shape) — CLOSED (with nit; see Finding 3)

Spec F-2 (L104), F-2 capability detail (L114), and DM-2 (L213) now define
`ContentHash = { rawHash; canonicalHash; attachmentHash; title; parentPageId }`.
The plan's PD-1 (L133-143) and Phase 1 task 1.2 `ContentHash` type (L476-479)
agree on the 5-field shape. TC-METADATA-001/002's `local.title`/`local.parentPageId`
are now directly expressible from the spec (the spec, not the plan, owns the
`local` input shape — DM-2 notes the fold explicitly). No contradiction with
DM-6/SharedBase on the *ContentHash* side. → **Closed** (spec-internal summary
lines that still list only 3 fields are tracked as Finding 3, a nit).

### Iter-1 Finding 4 (nit, pm-notes) — CLOSED

`chg-GH-22-pm-notes.yaml` decision #0 (L18-30) now records the full delta: the
5-state count drift, the `REMOTE_BEHIND`→`LOCAL_AHEAD` rename, **and** the
`LOCAL_MISSING` omission, with the UL/story-file authority citation. Audit-clear.

## Findings

### 1. [major/blocker] cross_artifact_consistency / plan_coverage — chg-GH-22-plan.md Phase 2 task 2.2 (L643-647) [PERSISTENT root cause of iter-1 Finding 1]

**Gap.** The iter-1 blocker was: false-positive fixtures assert `NO_CHANGE` for
document differences the verified GH-20 canonicalizer does **not** normalize. The
remediation rewrote `TC-FALSEPOS-001/002/004` in the **test plan** (now sound —
see closure audit above) but did **not** propagate the rewrite to the **plan**'s
Phase 2 task 2.2. The plan still instructs the coder (`/run-plan` execution
target) to build:

> *"five superficial diffs (**paragraph internal whitespace**, indentation, HTML
> attribute order, **trailing/leading whitespace in code blocks**,
> empty-line-count change) → each `ok(NO_CHANGE)`"* (L643-647)

The two bolded cases are the **exact** iter-1 blocker cases, re-verified against
`canonicalize.ts` in this iteration:

- *"paragraph internal whitespace"* = old TC-FALSEPOS-001. `isStructuralWhitespace`
  (L77-79) drops a text node only when it is whitespace-only **and**
  newline-containing. `"a  b"` vs `"a b"` as HAST text-node values are preserved
  verbatim (L63) → serialize differently → different `canonicalHash` → **NOT
  `NO_CHANGE`**.
- *"trailing/leading whitespace in code blocks"* = old TC-FALSEPOS-004. A code
  block is an `element` whose text children are not structural whitespace (no
  inter-block newline-only nodes inside `<pre>`); their values are preserved
  verbatim → different `canonicalHash` → **NOT `NO_CHANGE`**.

The test plan now describes these TC IDs differently (structural-ws-node-count /
multiple-ws-nodes / raw-vs-text), so the plan and the test plan **contradict each
other on what TC-FALSEPOS-001/002/004 are**. A coder following the plan writes
failing fixtures; a coder following the test plan writes passing ones. This is
the same silent-contract-violation risk iter-1 blocked on (DEC-2 breach pressure
on `canonicalize.ts`), now living in the plan instead of the test plan.

**Suggested remediation target phase:** delivery_planning

**Suggested fix.** Update the plan's Phase 2 task 2.2 parenthetical (L643-647)
to match the rewritten test-plan TC-FALSEPOS-001..005 descriptions verbatim —
i.e. *"(structural-whitespace text-node count between block siblings; multiple
newline-containing ws nodes collapsed; HTML attribute order; raw-HTML-vs-text
node for the same literal; empty-line count change) → each `ok(NO_CHANGE)`"* —
and add the one-line note that these are the four invariants GH-20 provably
normalizes (matching test-plan §5.2 Notes). Also align the plan's Test Scenarios
table row for TC-FALSEPOS-001..005 (L940), which is currently vague
*"(whitespace, attribute order, …)"*.

---

### 2. [minor] cross_artifact_consistency — chg-GH-22-spec.md §8.3 DM-6 (L217) + §23 glossary (L383) vs chg-GH-22-plan.md Phase 1 task 1.1 (L452-455) + PD-3 (L157)

**Gap.** DM-6 describes `SharedBase` as carrying *"…the base canonical hash,
attachment hashes, **title**, parent page id, page id, page version"* and the
glossary repeats *"(canonical hash, attachment hashes, **title**, parent, page
id, version)"*. But `PageBinding` (the `SharedBase` source — verified iter-1 and
this iteration) has **no `title`** field, the plan's `SharedBase` type
definition (L452-455) is `{ uuid; pageId; parentPageId; pageVersion;
renderedBodyHash; attachmentHashes }` with **no `title`**, and PD-3 explicitly
states *"PageBinding carries `parentPageId` but **no `title`** in MS-0002"*. The
plan is operationally correct; the spec DM-6/glossary prose is loose. A
downstream consumer (E3-S6) reading the spec would expect `base.title` to exist.
(Likely pre-existing — not a regression from the iter-1→iter-2 remediation — but
it is a live cross-artifact inconsistency a DoR pass must surface.)

**Suggested remediation target phase:** specification

**Suggested fix.** Remove `title` from the DM-6 and glossary `SharedBase`
descriptions (it is not a base facet — title is a local-vs-remote facet per
PD-3/F-2; `ContentHash` carries it on the `local` side, `SharedBase` does not
carry it on the `base` side).

---

### 3. [nit] cross_artifact_consistency — chg-GH-22-spec.md §7.1 (L172), §16 (L313), §23 glossary (L382) [incomplete remediation propagation of iter-1 Finding 3]

**Gap.** When iter-1 Finding 3 was remediated by adding `title` + `parentPageId`
to `ContentHash` in F-2 (L104) and DM-2 (L213), three summary/glossary lines were
not updated and still list only the three hash facets: §7.1 *"The `ContentHash`
value object (`rawHash` + `canonicalHash` + `attachmentHash`)"*; §16 *"New —
`rawHash` + `canonicalHash` (delegates to GH-20) + `attachmentHash`"*; glossary
*"`rawHash` (informational), `canonicalHash` (comparison basis…), `attachmentHash`"*.
DM-2 (the data-model authority) lists 5 fields; these summaries list 3.
Spec-internal inconsistency, non-blocking (DM-2/F-2 are authoritative), but the
summaries should not silently under-describe the type the remediation enlarged.

**Suggested remediation target phase:** specification

**Suggested fix.** Append *"+ `title` + `parentPageId` (R1 metadata facets)"* to
the §7.1, §16, and glossary `ContentHash` summary lines so they agree with
DM-2/F-2.

---

## What passed (re-confirmed, not re-litigated)

All iter-1 passes still hold; no regression in the remediation:

- **spec_completeness** — every story deliverable addressed; OQ-1..OQ-4
  resolved at clarify_scope; no decision-advisor escalation needed.
- **ac_quality** — 13 ACs Given/When/Then, concrete, non-overlapping.
- **test_traceability** — every AC maps to ≥1 TC; every TC maps to a plan phase.
  The iter-1 test-plan blocker is closed (TC-FALSEPOS-001..005 now assert
  `NO_CHANGE` only for diffs the canonicalizer provably normalizes — verified
  line-by-line against `canonicalize.ts`).
- **decision_capture** — DEC-1..6 (spec), PD-1..5 (plan), R1/Q1 (pm-notes),
  iter-1 Finding 4 (pm-notes decision #0 expanded). None require an ADR.
- **system_spec_consistency** — consistent with UL §Sync State, ADR-0006
  INV-SAFE-1/2, feature-safe-publish §3.1/§5, NFRs; iter-1 Finding 2 typo fixed.
  The §4.2 stub + architecture-overview classify sketch remain correctly routed
  to lifecycle phase 7.
- **plan_doc_update_coverage** — Phase 5 task 5.4 enumerates the system docs to
  update and defers to `@doc-syncer` phase 7.
- **plan_code_area_coverage** — four new modules + four test files listed with
  exact paths; reused contracts enumerated under "DO NOT re-implement".
- **dod_defined** — spec §17 AC table = the DoD; testable and complete.
- **Quantitative-AC testability** — NFR-REL-3 (<5%) / NFR-REL-2 (100%) framed as
  concrete fixture suites; test-plan TC-FALSEPOS-001..005 + TC-REALCHG-001..005
  operationalize them (now with accurate fixture descriptions on the test-plan
  side).
- **Reuse claims** — re-verified against source this iteration:
  `canonicalize`/`contentHash` signatures + header delegation (DEC-2);
  `PageBinding` fields (no `title` → PD-3); `RemoteMissing`/`Forbidden`/`Conflict`
  arms (DEC-3); `Result<T,E>`; `reconcile.ts` sibling; boundary-negative pattern.
- **Dependencies** — GH-18/19/20/21 all merged on `main`.

## Next step

Reopen **delivery_planning**. Update the plan's Phase 2 task 2.2 (L643-647) and
the Test Scenarios table row (L940) so the TC-FALSEPOS-001..005 descriptions
match the rewritten test plan (the four GH-20-normalized invariants). Fold in
the two non-blocking spec-prose cleanups (Finding 2: drop `title` from DM-6/
glossary `SharedBase`; Finding 3: add `title`+`parentPageId` to the three
`ContentHash` summary lines) for a clean iter-3. Re-run this gate after
revision. This is iter-2 of the 3-iteration cap — one focused plan edit clears
the blocker.
