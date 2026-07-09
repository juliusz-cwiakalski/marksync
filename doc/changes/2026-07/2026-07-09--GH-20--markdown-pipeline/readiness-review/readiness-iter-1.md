# Readiness Review Iteration 1

Verdict: NOT_READY
Work Item: GH-20
Date: 2026-07-09
Pause Required: no

## Facet Summary
- spec_completeness: FAIL
- ac_quality: PASS
- plan_coverage: PASS
- test_traceability: PASS
- cross_artifact_consistency: FAIL
- decision_capture: FAIL
- system_spec_consistency: FAIL
- plan_doc_update_coverage: PASS
- plan_code_area_coverage: PASS
- dod_defined: PASS

## Scope of review

Adversarial critique of `chg-GH-20-spec.md` + `chg-GH-20-test-plan.md` +
`chg-GH-20-plan.md` against the authoritative story
(`MS2-E3-S3--markdown-pipeline.md`) and the system docs (architecture-overview,
typescript.md, testing-strategy.md, ADR-0005, spike H6, kitchensink fixture,
`src/domain/errors.ts`, `src/domain/result.ts`, `package.json`,
`.dependency-cruiser.cjs`). Cross-checked the four flagged points (XML
well-formedness, sub/sup reachability, parse-failure arm, 27-construct count)
and the tier / dependency-scope / reuse claims.

## Strengths (not blocking)
- **Reuses, not redefines.** Verified `UnsupportedConstruct { construct; sourcePath }`
  exists at `src/domain/errors.ts:45` and is named in `assertNeverMarkSyncError`;
  `Result<T,E>` + `Result.ok`/`Result.err` exist at `src/domain/result.ts`. No new
  error kind, no `assertNeverMarkSyncError` edit, no `Result` change. NG-7 / DEC-2 hold.
- **Tier purity is sound and (partly) enforced.** `parse`/`mdast-to-hast`/
  `unsupported`/`canonicalize` (domain) import no infra; only `storage.ts` (infra)
  imports domain one-way. dep-cruiser's `domain-may-not-import-infra/app` rules
  enforce the load-bearing direction (AC-Q-1).
- **Dependency scope correct.** `package.json` has none of remark/rehype/mermaid/jsdom
  yet; plan installs only the 4 unified-ecosystem deps and explicitly excludes
  mermaid/jsdom/happy-dom (E4-S1). NFR-11 holds.
- **AC + test traceability complete.** All 7 story ACs → 8 spec ACs (story AC6 split
  into AC-F4-5 byte-determinism + AC-F3-1 hash-determinism) → TC IDs in the test plan
  → phased tasks in the plan. No AC is orphaned.
- **Over-mocking guardrail honored.** Real fixtures through the real pipeline; the XML
  check is mandated to be a real check (not a mock of the converter); classifier also
  exercised end-to-end through the real parser.

## Findings

### 1. [BLOCKER] cross_artifact_consistency / spec_completeness — spec §5.1 F-4, §17 AC-F4-1, §9 NFR-1 vs test-plan §8.3 OQ-TP-2 + plan §"Open questions"

**Gap:** The brand-defining fidelity AC is "27/27 canonical GFM fixtures byte-match
their golden `.storage.xhtml`" (AC-F4-1 / NFR-REL-4), and spec F-4 unconditionally
lists `<sub>`/`<sup>` in the mapping. But **`<sub>`/`<sup>` are not reachable from
canonical `remark-gfm` Markdown** — GFM does not define subscript/superscript syntax,
and raw inline HTML is escaped per DEC-4, so there is no Markdown input that yields a
`<sub>`/`<sup>` node through the specified pipeline. The spike H6 table lists them
(`~`~`/`^`^` → `<sub>`/`<sup>`), but the spike **posted hand-authored Storage XML**
(spike summary line 15: "posted as Storage and read back (storage→ADF→storage)") —
it proved the *Storage* representation round-trips, **not** that Markdown produces it.
The kitchensink fixture (`storage-kitchensink.xml` line 13) is hand-authored XML.
So 2 of the "27" (test-plan §6.1 fixtures #12/#13) cannot be generated as specified.

The three artifacts do **not** hold a consistent position: the spec asserts sub/sup
are mapped (no caveat); the test-plan OQ-TP-2 flags it **BLOCKING** but defers to the
coder with options (a) add a remark sub/sup plugin / (b) author from a real construct
/ (c) defer + re-baseline; the plan's "27-construct enumeration" open question also
defers. **No defensible default is committed at the gate** — and the resolution
changes contracts: option (a) contradicts the spec's 4-dep list (§8.4 / NFR-11);
option (c) lowers NFR-REL-4's "27" to "25" and requires the visitor to classify
`<sub>`/`<sup>` as `UnsupportedConstruct` (contradicting F-4). DoR requires flagged
blocking questions to have a defensible default; this one has none that is internally
consistent.

**Suggested remediation target phase:** specification (primary) + test_planning (count/fixtures)

**Suggested fix:** The spec must pick **one** and propagate it:
- (preferred, lowest-contract-impact) **Option C — sub/sup out of canonical subset.**
  Drop sub/sup from F-4; re-baseline NFR-REL-4 / AC-F4-1 / NFR-1 to **25/25** (or
  re-decompose the 27 to exclude sub/sup — see finding 4); have the visitor classify
  any `<sub>`/`<sup>` HAST node as `UnsupportedConstruct` defensively; remove
  fixtures #12/#13 from test-plan §6.1; add a DEC recording that the spike's sub/sup
  rows were Storage-XML-only and unreachable from GFM Markdown (ADR-0005 unresolved
  questions). Keeps the 4-dep scope intact.
- (alternative) **Option A — add a `remark-sub-super` (or equivalent) plugin** as a
  justified 5th/6th dependency: update spec §8.4 + NFR-11 + DEC table; justify per
  typescript.md minimal-dependency; keep "27/27".
Either way the spec/test-plan/plan must agree before delivery.

---

### 2. [MAJOR] system_spec_consistency — plan §"Open questions" (parse-failure) vs architecture-overview §"Internal interface contracts" (line 219)

**Gap:** `architecture-overview.md` line 219 documents the parse port as
`parse(bytes) → MdastRoot | ParseError`. **`ParseError` does not exist** in
`MarkSyncError` (`src/domain/errors.ts`), and NG-7 / DEC-2 forbid adding a kind. The
plan's open question proposes mapping a rare `unified` throw onto
`UnsupportedConstruct { construct: "<markdown-parse>" }`. That (a) **silently drifts**
from the architecture's documented contract (named `ParseError`) without recording the
deviation, and (b) **semantically overloads** `UnsupportedConstruct` (which is "an
unrecognized *construct* in otherwise-valid input") to mean "the input would not parse
at all" — a different failure class. The plan flags this for DoR confirmation but
commits no decision; the spec is silent on it entirely.

**Suggested remediation target phase:** specification

**Suggested fix:** Capture a DEC in the spec that reconciles the drift. Defensible
default: **treat `parseMarkdown` as total** — `remark`/`unified` is lenient (nearly
all input → a paragraph MDAST); a genuine `unified` throw is an invariant violation →
`throw` is acceptable per typescript.md §"Error handling" (no `Result.err` arm needed),
and the architecture-overview `ParseError` is deferred until a real parse-failure
*recovery* path exists (at which point a kind is added per the "add a kind only when
the recovery action differs" rule, typescript.md:323). **Flag `architecture-overview.md`
line 219** for phase-7 correction (the `ParseError` annotation is aspirational).
Do **not** overload `UnsupportedConstruct` for malformed input.

---

### 3. [MINOR] cross_artifact_consistency — test-plan §8.3 OQ-TP-1 vs plan PD-4 (XML well-formedness mechanism)

**Gap:** The plan has **already decided** the XML-well-formedness mechanism (PD-4
option a: a ~80-line hand-written test-tier checker, justified by the
minimal-dependency rule, independence mitigated by a dedicated negative-test suite +
the golden byte-match oracle). But the test-plan OQ-TP-1 still marks the question
**BLOCKING** ("blocks TC-XML-001 sign-off", owned by plan-writer/coder). The
blocking-vs-decided status is inconsistent across the two artifacts. Separately, the
plan's justification "Bun ships no native XML parser" is **asserted, not verified**
(Bun 1.2 has evolving XML support; a real zero-dep parser such as `linkedom`, or a
Bun-native API if present, would be a stronger independent oracle than a hand-written
checker that risks sharing the emitter's blind spots — exactly the over-mocking
guardrail concern).

**Suggested remediation target phase:** test_planning

**Suggested fix:** (a) Resolve the status mismatch — either mark OQ-TP-1
"resolved-by-default (PD-4 option a)" in the test plan, or have the plan defer to the
test plan's blocking flag; pick one. (b) Before delivery, verify whether Bun 1.2.23
exposes a usable XML parser; if so, prefer it (stronger independence). (c) If the
hand-written checker is kept, ensure the negative-test suite (plan 7.2) is gated to
run **before** the checker validates any converter output, and that the golden
`.storage.xhtml` oracle is treated as the primary well-formedness witness (the checker
is defense-in-depth, not the sole oracle).

---

### 4. [MINOR] cross_artifact_consistency / system_spec_consistency — spec §2.1, §5.1 F-4, §3 (27-construct provenance)

**Gap:** The spec repeatedly frames the fidelity bar as "the **27** canonical GFM
constructs" "proven by spike H6" / "the spike-H6-proven 27-construct mapping". But the
spike H6 table (`atlassian-api-spike-findings.md` lines 19-34) enumerates **~14
families**, not 27; the spike proved a **Storage→ADF→Storage** round-trip of
**hand-authored Storage XML** (summary line 15), not a Markdown→Storage conversion.
"27" is the **test-plan's decomposition** (§6.1), which *adds* constructs not in the
spike table (paragraph #27, autolink-literal #16, nested strong/em #9, ampersand-link
#15) and includes sub/sup (#12/#13) that are unreachable from Markdown (finding 1).
The spec over-attributes both the count and the proof to the spike, overstating what
was actually demonstrated.

**Suggested remediation target phase:** specification

**Suggested fix:** Correct the provenance framing: the spike proved *Storage-format*
round-trip fidelity for ~14 construct families (hand-authored XML); **this story**
is what proves the *Markdown→Storage* half. State the construct count as this story's
target decomposition (tied to whatever sub/sup decision lands per finding 1), not as a
spike-given "27". Cross-reference test-plan §6.1's "coder-discretion" caveat in the
spec so the count's origin is honest.

---

### 5. [MINOR] system_spec_consistency — testing-strategy.md line 44 vs architecture-overview §"Module-residence" + spec §7.1 + plan (renderer path)

**Gap:** `testing-strategy.md` line 44 names the Storage renderer at
`src/infra/render/storage-renderer.ts`, but architecture-overview §"Module-residence"
(line 182) and the spec/plan place it at `src/infra/confluence/render/storage.ts`.
Pre-existing stale path; the GH-20 artifacts correctly follow architecture-overview,
but the inconsistency is unflagged in `pm-notes.yaml` `doc_risks`, so phase-7
(`@doc-syncer`) will not catch it.

**Suggested remediation target phase:** delivery_planning

**Suggested fix:** Add `testing-strategy.md` (line 44 path correction →
`src/infra/confluence/render/storage.ts`) to `chg-GH-20-pm-notes.yaml` `doc_risks`
for the phase-7 doc-sync pass.

---

### 6. [MINOR] plan_code_area_coverage — plan §"Constraints" ("check:boundaries enforces the matrix")

**Gap:** The plan asserts dep-cruiser "enforces the matrix" / the tier rules, but
`.dependency-cruiser.cjs` defines only **4** forbidden rules
(`domain→infra`, `domain→app`, `cli→domain`, `cli→infra`). It does **not** forbid
`infra→app` or `infra→cli` (both ✗ in the architecture matrix). The plan's claim is
overstated. The specific AC-Q-1 requirement (infra/confluence/render may import
domain; reverse forbidden) **is** enforced, so this is not blocking for this story,
but "infra imports nothing upward" is currently un-cruised (a pre-existing gap).

**Suggested remediation target phase:** delivery_planning

**Suggested fix:** Soften the plan's claim to "enforces `domain↛infra/app` and
`cli↛domain/infra` (AC-Q-1's load-bearing direction)"; note that `infra↛app/cli` is
not yet cruised (pre-existing dep-cruiser gap) so the visitor's no-app/cli import is
enforced by review, not by the gate. Optionally file a follow-up to extend
dep-cruiser.

---

### 7. [NIT] cross_artifact_consistency — plan PD-0.2 (mdast/hast type-only deps) vs spec §8.4 / NFR-11 (4-dep list)

**Gap:** Plan task 0.2 may add `mdast` and `hast` (type-only, zero-runtime packages)
beyond the spec's explicit 4-dep install list (§8.4 / NFR-11). The plan flags this as
a "justified deviation" to record in the execution log, but the spec / test-plan do
not acknowledge the possibility, so TC-DEP-001 (which checks only the 4 runtime deps
present + 3 absent) would not catch a mis-scoped type-only addition.

**Suggested remediation target phase:** specification

**Suggested fix:** Spec §8.4 / NFR-11: clarify "runtime dependencies" and explicitly
permit zero-runtime type-only `mdast`/`hast` type packages (justified by
`verbatimModuleSyntax`); or have the plan defer their addition until type resolution
fails and re-confirm at delivery.

---

## Re-open decision

- **BLOCKER (finding 1)** — must be fixed before delivery. Re-open **specification**
  (pick a sub/sup position + propagate count/contracts) and **test_planning** (align
  fixtures/§6.1 to the chosen count). This cannot be a documented constraint because
  the resolution changes the central fidelity AC (27 vs 25), the dependency scope
  (4 vs 5/6), and/or the classifier allow-list — all spec-level decisions.
- **MAJOR (finding 2)** — must be fixed before delivery. Re-open **specification** to
  capture a DEC reconciling the `ParseError` drift (lightweight: one DEC + a phase-7
  doc flag for architecture-overview line 219). Cannot stand as-is (silent drift from
  a documented contract + `UnsupportedConstruct` overload).
- MINOR/NIT (findings 3-7) — desirable to fix in the same revision pass; finding 3
  (test_planning) and finding 5 (delivery_planning doc_risk) are cheap to land now.

After the author revises, re-run this gate (≤3 iterations; if the same blocking gap
persists, escalate to the human rather than looping).

## Gate result

NOT_READY — delivery blocked. Re-open `specification` (findings 1, 2, 4, 7) and
`test_planning` (findings 1, 3). Findings 5, 6 are delivery_planning nits that can
ride along.
