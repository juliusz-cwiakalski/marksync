# Readiness Review Iteration 2

Verdict: READY
Work Item: GH-20
Date: 2026-07-09
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

## Scope of review

Re-review (iteration 2) after remediation of iter-1's NOT_READY verdict. Read
the revised spec (`935fa86`), test-plan (`0c37256`), plan (`5b8c487`), plus the
iter-1 record, the authoritative story, PM notes, typescript.md, architecture
overview, spike H6 (lines 17-41), and the live contracts (`src/domain/errors.ts`,
`src/domain/result.ts`, `package.json`, `.dependency-cruiser.cjs`,
`testing-strategy.md`). For each iter-1 finding, verified genuine resolution
(not an assertion of resolution). Adversarial stance preserved: probed the
re-baselined count and the sub/sup defensive position for cross-artifact drift
and for new gaps introduced by the remediation.

## Iter-1 finding resolution status

### Finding 1 [BLOCKER] — `<sub>`/`<sup>` unreachable; "27/27" inconsistent → RESOLVED

Evidence:
- **Sub/sup removed from the golden Markdown fixture set across all three
  artifacts.** Spec §1.4 (line 33), §2.1 (line 50), §5.1 F-4 (line 127) + F-6
  (line 136), §8.3 DM-6 (line 232), §12 (line 279), §15 DEC-7 (line 320), §17
  AC-F4-1 (line 342), NFR-1 (line 246). Test-plan §1.1 (line 87), §3.1 AC-F4-1
  (line 156), §3.3 NFR-1 (line 206), §6.1 (lines 1255-1305 + explicit "Excluded"
  note), OQ-TP-2 RESOLVED (line 1394). Plan summary (line 33), PD-6 (lines
  139-152), Phase 5 goal (lines 609-612), Phase 5.2 (lines 642-672), open
  question RESOLVED (lines 188-194). No residual unconditional sub/sup golden
  claim found.
- **Count consistently 25 (the remark-gfm-reachable number).** Test-plan §6.1
  table enumerates exactly 25 fixtures (lines 1273-1299); §1.1/§3.1/§3.3 say
  "25/25". Plan says "25 = spike 27 − `<sub>` − `<sup>`" (lines 33, 145, 192).
  Spec restates the bar as "the `remark-gfm`-reachable fixture set" without a
  conflicting number; AC-F4-1 + NFR-1 both carry the "(DEC-7)" exclusion
  caveat. Residual occurrences of "27" are all properly contextualized as
  "spike 27" (the source number being reduced) or revision-log history — no
  unconditional "27/27 fidelity" claim remains (grep-verified).
- **Defensive visitor arm + test present.** Spec F-4 (line 127) + DEC-7
  (line 320). Test-plan TC-RENDER-006 (lines 306, 661-690) — synthetic `<sub>`
  /`<sup>` HAST → visitor emits them (not classified). Plan Phase 5.4 (lines
  683-692) + Phase 4.2 TC-UNSUP-003 asserts the classifier does NOT flag
  sub/sup (allow-listed). The defensive path is internally consistent: a
  synthetic sub/sup HAST node → classifier null → visitor emits. PM-DEC-1
  recorded in `pm-notes.yaml` (lines 22-32).
- **Fidelity bar honestly re-baselined.** Provenance corrected: spec §2.1
  (line 50) + §12 (line 279) + §24 (line 395) now state the spike proved a
  Storage-XML round-trip of hand-authored kitchensink XML (~14 families), not
  markdown→storage; the golden Markdown fixtures are the remark-gfm-reachable
  subset.

### Finding 2 [MAJOR] — `ParseError` drift + `UnsupportedConstruct` overload → RESOLVED

Evidence:
- **Position consistent across spec/test-plan/plan.** Spec F-1 (line 120)
  + Flow 1 (lines 145-147) + DEC-8 (line 321) + §21 (line 371). Plan PD-3
  (lines 118-119) + PD-8 (lines 157-170) + Phase 1.1 + open question RESOLVED
  (lines 177-187) + Constraints "Error discipline" (lines 262-268). PM-DEC-2 in
  `pm-notes.yaml` (lines 34-44). All three say the same thing: signature kept
  for port-contract alignment; treated as total in MS-0002; genuine parse
  failure = invariant violation → `throw`.
- **`UnsupportedConstruct` NOT overloaded.** Spec F-1 (line 120: "It is **not**
  surfaced as `UnsupportedConstruct`"), DEC-8 (line 321). Plan PD-3 (line 118:
  "NOT overloaded for parse failures"), PD-8, Phase 1.1 TC-PARSE-004 asserts the
  throw propagates and is not mapped. Confirmed against the live
  `src/domain/errors.ts:45` (the arm is `{ construct; sourcePath }` — for
  unrecognized constructs, not malformed input).
- **Consistent with typescript.md error handling.** `typescript.md` lines
  294-297: "Domain functions return `Result<T,E>` — no throwing for expected
  failures" + "`throw` is for invariant violations … 'should never happen'
  cases." DEC-8 classifies a genuine `unified` throw (rare; remark-gfm is
  extremely tolerant) as an invariant violation → throw. Aligned. Lines 323-325
  ("add a kind only when the recovery action differs") supports NOT adding a
  `ParseError` kind (the recovery = surface + halt, matching existing kinds).
- **architecture-overview:219 drift routed, not silently drifted.** The
  documented `parse → MdastRoot | ParseError` contract (confirmed at
  architecture-overview.md line 219; `ParseError` confirmed ABSENT from
  `MarkSyncError` in errors.ts) is flagged for phase-7 doc-sync in
  `pm-notes.yaml` `doc_risks` (line 92) and plan "Out of scope" (lines
  217-219). No longer silent.

### Finding 3 [MINOR] — OQ-TP-1 vs PD-4 status mismatch → RESOLVED

Test-plan OQ-TP-1 (§8.3 line 1393) now reads "RESOLVED — aligned with plan
PD-4" with blocking status "No (resolved)". §3.1 AC-F4-3 status (line 158) and
§4 (line 276) both say "mechanism decided (PD-4; OQ-TP-1 resolved)". The
blocking-vs-decided contradiction is gone; both artifacts agree the hand-written
test-tier checker + negative-test suite is the mechanism.

### Finding 4 [MINOR] — "27-construct" provenance overstated → RESOLVED

Spec §2.1 (line 50), §12 (line 279), §24 (line 395) restate provenance
honestly: the spike H6 table enumerates ~14 construct families; the spike
proved a Storage→ADF→Storage round-trip of hand-authored XML (summary line 15:
"posted as Storage and read back"); the golden Markdown fixtures are this
story's remark-gfm-reachable decomposition. No "spike proved 27 markdown
constructs" claim remains.

### Finding 5 [MINOR] — stale renderer path in testing-strategy.md:44 → RESOLVED (flagged)

`testing-strategy.md` line 44 confirmed still reading
`src/infra/render/storage-renderer.ts` (stale; actual is
`src/infra/confluence/render/storage.ts`). Now recorded in
`pm-notes.yaml` `doc_risks` (lines 100-102) and plan "Out of scope" (lines
220-222) for the phase-7 doc-sync pass. Not fixed in-code (correctly — phase 7
owns it); the gap is now visible to `@doc-syncer`.

### Finding 6 [MINOR] — dep-cruiser claim overstated → RESOLVED

Plan "Constraints" (lines 238-248) now states dep-cruiser enforcement is
**partial**: exactly four `forbidden` rules (confirmed in
`.dependency-cruiser.cjs`: `domain→infra`, `domain→app`, `cli→domain`,
`cli→infra`); the load-bearing `domain-may-not-import-infra` direction for
AC-Q-1 IS enforced at severity `error`; `infra→app`/`infra→cli` and
`infra→domain` gaps explicitly noted as out of scope. §8.2 (lines 857-862) +
Success Metrics (lines 314-316) carry the same softened, accurate claim.

### Finding 7 [NIT] — mdast/hast type-only deps → RESOLVED (with a naming nit — see New Finding 3)

Spec §8.4 (line 236) + NFR-11 (line 256) now explicitly permit type-only
devDependencies beyond the 4 runtime deps, with the "zero runtime surface"
justification. Plan Phase 0.2 + Constraints operationalize it. The
permissibility question (the iter-1 concern) is closed.

## DoR-passed items from iter-1 — still intact

- **Tier purity.** Domain modules (`parse`, `mdast-to-hast`, `unsupported`,
  `canonicalize`) import no infra/app/cli; only `storage.ts` (infra) imports
  domain one-way. dep-cruiser's `domain-may-not-import-infra` enforces the
  load-bearing reverse edge. AC-Q-1 / NFR-10 hold.
- **Reuses, not redefines.** `UnsupportedConstruct { construct; sourcePath }`
  confirmed at `src/domain/errors.ts:45` and in `assertNeverMarkSyncError`;
  `Result<T,E>` + `Result.ok`/`Result.err` confirmed at `src/domain/result.ts`.
  No new error kind, no `Result` change. NG-7 / DEC-2 hold.
- **Dependency scope.** `package.json` confirmed to have none of
  remark/rehype/mermaid/jsdom installed yet; plan installs only the 4 unified
  runtime deps + type-only devDeps; mermaid/jsdom/happy-dom excluded (E4-S1).
  NFR-11 holds.
- **Over-mocking guardrail.** Real fixtures through the real pipeline; the XML
  check is the real PD-4 hand-written checker gated by its own negative-test
  suite; golden byte-match remains the primary well-formedness witness;
  classifier exercised end-to-end through the real parser.

## AC ↔ test ↔ plan ↔ story traceability (post-re-baselining)

All 7 story ACs → 8 spec ACs (story AC6 split into AC-F4-5 byte-determinism +
AC-F3-1 hash-determinism) → TC IDs in test-plan §3.1 (all "Covered") → phased
tasks in plan. No AC orphaned by the 27→25 re-baselining: AC-F4-1 maps to
TC-GOLDEN-001/002 + TC-RENDER-006 (defensive). Traceability complete.

## New Findings (none blocking)

### 1. [MINOR] cross_artifact_consistency — plan PD-6 (line 151) + Phase 5.2 (lines 666-667): kitchensink "byte-for-byte" claim inaccurate after sub/sup re-baselining

**Gap:** PD-6 states "the kitchensink pair derives byte-for-byte from
`storage-kitchensink.xml` (the sub/sup bytes there are preserved by the
defensive visitor when present)" and Phase 5.2 repeats "derived byte-for-byte
from the spike reference". But `kitchensink.md` is a Markdown source exercising
the 25 remark-gfm-reachable constructs (test-plan §6 line 1311) — remark-gfm
cannot produce `<sub>`/`<sup>`, so the rendered `kitchensink.storage.xhtml`
will contain **no** sub/sup bytes. The spike `storage-kitchensink.xml` **does**
contain sub/sup. Therefore the markdown-derived kitchensink cannot be
"byte-for-byte" from the spike XML, and the parenthetical "preserved by the
defensive visitor when present" is vacuous for the markdown path (the visitor
is never presented with sub/sup nodes). The test mechanic is sound —
TC-GOLDEN-002 step 2 asserts byte-exact against the *committed*
`kitchensink.storage.xhtml` snapshot (the renderer's actual output), and step
3's enumerated shape list correctly omits sub/sup — so this is a prose
imprecision, not a test failure. But the PD-6 language could mislead the coder
into expecting the kitchensink to reproduce the spike's sub/sup bytes.

**Suggested remediation target phase:** delivery_planning

**Suggested fix:** Soften PD-6 / Phase 5.2 to: "`kitchensink.storage.xhtml` is
the renderer's actual output from `kitchensink.md` (the remark-gfm-reachable
subset), reviewed against the spike `storage-kitchensink.xml` shape **modulo**
the omitted `ac:schema-version`/`ac:macro-id` **and** the sub/sup bytes the
markdown source cannot produce (DEC-7)." Drop the "preserved by the defensive
visitor when present" parenthetical from the kitchensink context (it is true
in general — TC-RENDER-006 — but irrelevant to the markdown kitchensink).

---

### 2. [MINOR] cross_artifact_consistency — test-plan TC-RENDER-006 vs plan TC-SUBSUP-DEF-001 (same test, different ID)

**Gap:** The defensive `<sub>`/`<sup>` visitor test is `TC-RENDER-006` in the
test-plan (lines 306, 661, and the F-4 capability rollup line 172:
"TC-RENDER-001..006") but `TC-SUBSUP-DEF-001` in the plan (Phase 5.4 line 686
+ Test Scenarios table line 902). It is the same test (synthetic sub/sup HAST →
visitor emits `<sub>`/`<sup>`), with two IDs. The test-plan is the TC-ID
authority; the plan invents a parallel ID, slightly muddying traceability.

**Suggested remediation target phase:** delivery_planning

**Suggested fix:** Align the plan to reference `TC-RENDER-006` (the test-plan
ID) in Phase 5.4 and the Test Scenarios table, retiring `TC-SUBSUP-DEF-001`.

---

### 3. [NIT] cross_artifact_consistency — spec §8.4/NFR-11 (`@types/mdast`/`@types/hast`) vs plan Phase 0.2 (`mdast`/`hast`) package naming

**Gap:** Spec §8.4 (line 236) + NFR-11 (line 256) name the type-only packages
`@types/mdast` / `@types/hast` (DefinitelyTyped-scoped), while plan Phase 0.2
(lines 347-350) + Constraints (line 251) name them `mdast` / `hast` (unscoped),
and Phase 0.2 attempts `import type { Root } from "mdast"`. These resolve to
different npm packages. The plan's pragmatic "attempt the import; add whatever
is transitively resolvable" resolves the ambiguity at delivery, so this is
non-blocking, but the spec and plan disagree on the package name.

**Suggested remediation target phase:** specification

**Suggested fix:** Pick one naming and propagate. The unified ecosystem's
canonical MDAST/HAST type sources are the `@types/mdast` / `@types/hast`
packages (and/or transitive re-exports from `remark`/`rehype`); align the plan's
Phase 0.2 import-attempt + Constraints to match the spec's `@types/*` naming, or
have the spec defer to "whatever package provides the types" as the plan does.

---

### 4. [MINOR — observation, non-blocking] cross_artifact_consistency — story file still says "27" while spec/test-plan/plan say 25

**Gap:** The authoritative story `MS2-E3-S3--markdown-pipeline.md` still reads
"27" in its Goal (line 20), deliverable #6 (line 31), AC NFR-REL-4 (line 48),
Test matrix (line 60), and DoD (line 64: "27/27 GFM fixtures convert …"). The
spec/test-plan/plan re-baseline to the remark-gfm-reachable 25 per PM-DEC-1.
The deviation IS authorized (PM-DEC-1 is a recorded technical-scope
clarification in `pm-notes.yaml` lines 22-32, documented as spec DEC-7), so this
is not a DoR blocker. The risk is procedural: phase-10 `dod_check` (run by
`@pm`) should verify against PM-DEC-1's 25, not the story's literal "27".

**Suggested remediation target phase:** specification (clarifying note) — or no
action if `@pm` honors PM-DEC-1 at `dod_check`.

**Suggested fix:** No artifact change required (the story file is an input, not
edited by the spec-writer). `@pm` should treat PM-DEC-1's re-baselined 25 as
the DoD fidelity count at phase 10. Optionally add a one-line note in
`pm-notes.yaml` recording that the story's "27" is superseded by PM-DEC-1's 25
for `dod_check` purposes.

## Re-open decision

None. Both iter-1 blockers (findings 1, 2) are genuinely RESOLVED with
cross-artifact-consistent positions and recorded PM decisions. Iter-1 minors/nits
(findings 3-7) are resolved. The four new findings are MINOR/NIT and
non-blocking — they are prose/traceability tidy-ups that do not change any
contract, AC, or test mechanic, and can ride into the next revision or be noted
for the coder at delivery. Per the override rule, no bypass is invoked: this is
a plain READY on the merits.

## Gate result

READY — delivery unblocked. Iter-1 blockers resolved; all facets PASS; new
findings are non-blocking MINOR/NIT. Recommend the coder note new findings 1-2
(kitchensink prose + TC-ID alignment) when landing Phase 5; finding 3
(package naming) resolves itself via the plan's transitive-resolve step.
