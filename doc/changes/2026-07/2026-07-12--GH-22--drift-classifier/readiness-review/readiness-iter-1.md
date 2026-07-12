# Readiness Review Iteration 1

Verdict: NOT_READY
Work Item: GH-22
Date: 2026-07-12
Pause Required: no

## Facet Summary
- spec_completeness: PASS
- ac_quality: PASS
- plan_coverage: PASS
- test_traceability: FAIL
- cross_artifact_consistency: PASS (with minor caveat — Finding 3)
- decision_capture: PASS
- system_spec_consistency: PASS
- plan_doc_update_coverage: PASS
- plan_code_area_coverage: PASS
- dod_defined: PASS

## Gate Result

Delivery is **blocked**. One major finding (Finding 1) defects the test plan:
two false-positive fixtures assert `NO_CHANGE` for document differences the
verified GH-20 canonicalizer does **not** normalize to identity. As written,
those fixtures either fail at delivery or — worse — pressure the coder to
modify `src/domain/render/canonicalize.ts` to make the literal tests pass,
breaching DEC-2 ("re-implements no sha256/canonicalization") and the "DO NOT
re-implement" reuse contract. The remaining findings are minor/nit and
non-blocking.

**Phase to reopen:** `test_planning` (the single blocker lives there).
Findings 2 and 3 also touch `specification` but are non-blocking and can be
folded into the same revision pass.

## Verification performed (adversarial)

Reuse claims were checked against the **actual source**, not the artifacts'
assertions:

- `src/domain/render/canonicalize.ts` — `canonicalize(hast: Root): CanonicalHast`
  and `contentHash(canonical): string` exist with the exact signatures claimed.
  Header L40-41 defers the wire-prefix to E3-S5 verbatim → **DEC-2 delegation
  valid**. `contentHash` returns bare lowercase-hex sha256 → **PD-2 prefix
  needed**. The canonicalizer's `isStructuralWhitespace` (L77-79) drops a text
  node **only** when `value.trim() === "" && value.includes("\n")`; it does
  **not** collapse internal whitespace and does **not** trim code-block text.
  This asymmetry is the root of Finding 1.
- `src/domain/binding/page-binding.ts` — `PageBinding` carries `pageId`,
  `parentPageId`, `pageVersion`, `uuid`, `renderedBodyHash`,
  `attachmentHashes`, … and **no `title`** → **PD-3 sound**; SharedBase view is
  a valid structural projection.
- `src/domain/errors.ts` — `Conflict { pageId; baseVersion; remoteVersion }`,
  `RemoteMissing { pageId }`, `Forbidden { pageId; operation }` all exist with
  the exact fields assumed → **DEC-3 sound**; `assertNeverMarkSyncError`
  present and would require no change.
- `src/domain/result.ts` — `Result<T,E>` + `Result.ok`/`Result.err` confirmed
  (namespace call style, matching `reconcile.ts`).
- `src/domain/state/reconcile.ts` — pure sibling, imports only `#domain/*`,
  returns `Result<_, MarkSyncError>` → residence pattern confirmed.
- `src/domain/identity/document-id.ts` — branded `DocumentId` exists.
- `tests/unit/domain/target/boundary-negative.test.ts` — the purity-probe
  pattern matches PD-4 exactly (ephemeral probe, `bunx depcruise src`, JSON
  violations, belt-and-suspenders cleanup). `.gitignore` lists
  `src/domain/__boundary_probe__.ts` only; the plan's Phase 4 task 4.1 correctly
  adds the state-scoped probe path.
- `.dependency-cruiser.cjs` — `domain-may-not-import-infra` is `severity:
  "error"` with `from.path: "src/domain/"` (matches the state-scoped probe).
- `package.json` — **both** `zod ^4.4.3` and `ajv ^8.20.0` are installed. zod is
  already used in `src/infra/confluence/schemas/**` (GH-21); ajv is confined to
  `src/app/{config,lock}.ts`. **The plan's use of zod for the SyncState
  output-boundary schema is consistent with the established stack** (GH-21
  precedent), NOT an unexplained new dependency. No finding.
- UL §Sync State (ubiquitous-language.md L63, L207-209) — normative 6-value
  enum + binding rule 3 mandating zod output validation → **NFR-10 sound**.
- `architecture-overview.md` L~239 — `classify(local, base, remote) → SyncState`
  with `—` errors (positional sketch) → **DEC-4 reconciliation is a real
  doc-drift**, correctly routed to lifecycle phase 7.
- `feature-safe-publish.md` §3.1, §4.2 (stub), §5 — consistent with the 6-state
  model; the §4.2 stub is correctly flagged for phase-7 tagging.
- NFR-REL-1/2/3/6, NFR-PERF-4, NFR-MAINT-1 — wording consistent with the spec.
- Dependencies — GH-18 (c4b6648), GH-19 (d21320a), GH-20 (be0bf90), GH-21
  (d53a8ff) all merged on `main`.
- Issue-body 5-state divergence (`NO_CHANGE / REMOTE_BEHIND / REMOTE_AHEAD /
  DIVERGED / REMOTE_MISSING`, omitting `LOCAL_MISSING`) — the pm-notes
  resolution (UL/story-file authoritative → 6 states) is **sound** per
  pm-instructions ("Git files are authoritative for story scope; GitHub Issues
  are short summaries"). UL §Sync State, the story file, feature spec §3.1, and
  ADR-0006 all agree on 6 states including `LOCAL_MISSING`. Resolution
  verified-correct (see nit Finding 4 for a documentation-completeness note).

## Findings

### 1. [major/blocker] test_traceability — chg-GH-22-test-plan.md §5.2 (TC-FALSEPOS-001, TC-FALSEPOS-004; also review TC-FALSEPOS-002)

**Gap.** The false-positive suite asserts `ok(NO_CHANGE)` for document
differences the **verified** GH-20 canonicalizer does not normalize to
identity:

- **TC-FALSEPOS-001** — "Paragraph internal whitespace change (multiple spaces
  collapsed to one) → NO_CHANGE". The classifier consumes `ContentHash` derived
  from HAST (not Markdown source). At the HAST level, `canonicalize` preserves
  text-node values verbatim: `isStructuralWhitespace` (canonicalize.ts L77-79)
  drops a text node only when it is whitespace-only **and** contains a newline.
  "a  b" vs "a b" as HAST text values serialize differently → different
  `canonicalHash` → **NOT `NO_CHANGE`**. The asserted result holds only if the
  fixture feeds Markdown source through the full remark→HAST parse (where
  CommonMark collapses internal spaces) — but the test plan frames TC-FALSEPOS
  as **"Unit, pure fixtures, no mocks"** in `classifier.test.ts`, which
  operates on HAST-derived `ContentHash`, not Markdown source. Framing
  mismatch.
- **TC-FALSEPOS-004** — "Trailing/leading whitespace in code blocks (ignored by
  canonicalization) → NO_CHANGE". The parenthetical claim "(ignored by
  canonicalization)" is **false** for the verified implementation: code-block
  text with trailing/leading whitespace (absent a newline-only structural node)
  is preserved verbatim → different `canonicalHash` → **NOT `NO_CHANGE`**.
- **TC-FALSEPOS-002** — "Indentation change (tabs vs spaces, or different
  nesting levels)". Ambiguous: valid only if the indentation manifests as
  structural whitespace text nodes (newline-containing); needs sharpening.

TC-FALSEPOS-003 (attribute order — `sortProperties` confirmed) and
TC-FALSEPOS-005 (empty lines = whitespace + newline = structural = dropped)
**are** sound.

**Risk.** If the coder implements TC-FALSEPOS-001/004 as literally described at
HAST level, the tests fail. The dangerous failure mode: the coder "fixes"
`canonicalize.ts` to collapse internal whitespace / trim code-block text so the
literal tests pass — breaching DEC-2 ("re-implements no sha256/canonicalization")
and the plan's "DO NOT re-implement" contract over a settled GH-20 module. In a
critical-domain story (the trust wedge), this is exactly the silent
contract-violation an adversarial DoR must catch.

**Suggested remediation target phase:** test_planning

**Suggested fix.** Rewrite the false-positive fixture descriptions to use diffs
the verified GH-20 canonicalizer **actually** normalizes — i.e. differences that
produce byte-identical `canonicalize(hast)` output:
1. Structural-whitespace text nodes between block siblings (whitespace-only +
   newline — provably dropped by `isStructuralWhitespace`).
2. HTML/element attribute ordering (provably normalized by `sortProperties`).
3. `raw`-HTML-vs-text equivalence for the same literal value (provably
   normalized by the `raw`→`text` branch).
4. Source-position differences (provably absent — `canonicalize` never copies
   `position`).

Either (a) reframe TC-FALSEPOS-001/002/004 to the above HAST-level invariants,
or (b) if Markdown-source-level normalization (parser-driven) is intended,
explicitly reclassify those cases as **integration** fixtures (Markdown → parse
→ canonicalize → `ContentHash`) and move them out of the pure-unit
`classifier.test.ts` — stating that the Markdown parser, not GH-20, is the
normalizer for those cases. Do not ship TC descriptions that assert
GH-20-driven `NO_CHANGE` for diffs GH-20 does not normalize.

---

### 2. [minor] system_spec_consistency / cross_artifact_consistency — chg-GH-22-spec.md §2.1 (paragraph 7, "The boundary is already enforced")

**Gap.** The spec states: *".dependency-cruiser.cjs declares
`domain-may-not-not-import-infra` at severity `error`"*. The verified rule name
(`.dependency-cruiser.cjs` L17) is **`domain-may-not-import-infra`** (no double
"not"). AC-F1-1 and the test plan reference the correct name; only this spec
prose sentence has the typo. Non-blocking but could confuse a reader checking
the contract.

**Suggested remediation target phase:** specification

**Suggested fix.** Correct the rule name to `domain-may-not-import-infra` in
§2.1 paragraph 7.

---

### 3. [minor] cross_artifact_consistency — chg-GH-22-spec.md §5.1 (F-2), §8.3 (DM-2) vs chg-GH-22-plan.md PD-1

**Gap.** The spec defines `ContentHash` (F-2 / DM-2) as three hash facets —
`{ rawHash; canonicalHash; attachmentHash }`. Yet the spec's own F-1, R1, and
AC-F5-1 require `title` and `parentPageId` as comparison facets on the `local`
input, and the test plan's TC-METADATA-001 reads "`local.title` differs". The
spec never resolves **where** `title`/`parentPageId` live on `local:
ContentHash`. The plan closes the gap with PD-1 (ContentHash carries the three
hash facets **plus** `title` + `parentPageId`), which is a sound and
well-justified resolution — but the result is a data-model mismatch: spec DM-2
= 3 fields, plan PD-1 = 5 fields. The plan is making a data-model decision the
spec left open. Since the spec is the contract authority, the spec should own
the resolved shape.

**Suggested remediation target phase:** specification

**Suggested fix.** Reconcile spec DM-2 / F-2 with the plan's PD-1 resolution:
either (a) extend the spec's `ContentHash` definition to list `title` +
`parentPageId` alongside the three hash facets (matching PD-1 and making
TC-METADATA-001's `local.title` directly expressible from the spec), or (b)
introduce a separate local-snapshot type carrying the metadata and keep
`ContentHash` as the three hash facets. Either way, the spec — not the plan —
should be the authority on the `local` input shape.

---

### 4. [nit] decision_capture — chg-GH-22-pm-notes.yaml decisions[0]

**Gap.** The pm-notes decision #0 records the issue-body "5-state" count drift
and the 6-state resolution, but understates the divergence: the issue body also
(a) uses `REMOTE_BEHIND` (not `LOCAL_AHEAD`) and (b) omits `LOCAL_MISSING`
entirely. The resolution (UL-authoritative 6 states) is **correct and
complete** — the UL, story file, feature spec §3.1, and ADR-0006 unanimously
define the 6 values including `LOCAL_MISSING`, and `REMOTE_BEHIND` is treated
as a stale alias for `LOCAL_AHEAD`. No human input was needed (the
pm-instructions authority rule covers it). This is purely a
documentation-completeness observation: recording the name/omission delta
explicitly would make the resolution easier to audit.

**Suggested remediation target phase:** specification (pm-notes amendment; non-blocking)

**Suggested fix.** Optionally expand pm-notes decision #0 to note the
`REMOTE_BEHIND`→`LOCAL_AHEAD` rename and the `LOCAL_MISSING` omission, in
addition to the count drift, for audit clarity.

---

## What passed (not re-litigated)

- **spec_completeness** — every story deliverable (classifier, hashes, actions,
  RemoteState union, 6-state enum, false-positive guard, REMOTE_MISSING
  invariant) is addressed; OQ-1..OQ-4 all resolved at clarify_scope; no
  decision-advisor escalation needed (verified: ADR-0006 + UL settled, GH-20
  canonicalizer verified conservative, all error arms pre-exist).
- **ac_quality** — 13 ACs (AC-F1-1, AC-F3-1..F3-6, AC-F4-1, AC-F2-1, AC-F2-2,
  AC-F5-1, AC-F6-1, AC-Q-1) are Given/When/Then, concrete, non-overlapping.
- **plan_coverage** — every AC + every TC maps to a plan phase (Phase 1
  foundation; Phase 2 classify core + fixtures; Phase 3 Action mapping; Phase 4
  boundary negative; Phase 5 gate + handoff). Code-area blast radius explicit
  per phase.
- **decision_capture** — DEC-1..DEC-6 (spec), PD-1..PD-5 (plan), R1/Q1
  (story-CEO, captured in pm-notes + spec OQ-1/OQ-2). None require an ADR
  (DEC-4 signature reconciliation is a doc-drift fix; PD-2 wire-prefix
  operationalizes the existing lock convention; PD-3 is acknowledged
  post-MS-0002-improvable).
- **system_spec_consistency** — consistent with UL §Sync State, ADR-0006
  INV-SAFE-1/2, feature-safe-publish §3.1/§5, NFRs; the §4.2 stub and the
  architecture-overview classify sketch are correctly routed to lifecycle
  phase 7.
- **plan_doc_update_coverage** — Phase 5 task 5.4 explicitly enumerates the
  system docs to update (feature-safe-publish §4.2, architecture-overview,
  UL bindings, related_changes) and correctly defers them to `@doc-syncer`
  phase 7 (coder touches only `src/` + `tests/`).
- **plan_code_area_coverage** — four new modules + four test files listed with
  exact paths; reused contracts enumerated under "DO NOT re-implement".
- **dod_defined** — spec §17 AC table = the DoD (story file confirms "AC list
  is the DoD"); testable and complete.
- **Quantitative AC testability** — NFR-REL-3 (<5%) and NFR-REL-2 (100%) are
  correctly framed as concrete fixture suites (not unmeasurable percentages)
  in spec §4.1 / NFR-4 / NFR-5; the test plan operationalizes them as
  TC-FALSEPOS-001..005 + TC-REALCHG-001..005 (modulo Finding 1's
  fixture-accuracy defect).

## Next step

Reopen **test_planning**. Revise the false-positive suite per Finding 1
(rewrite TC-FALSEPOS-001/004 — and sharpen TC-FALSEPOS-002 — to assert
`NO_CHANGE` only for diffs the verified GH-20 canonicalizer actually
normalizes, or explicitly reclassify Markdown-parser-driven cases as
integration fixtures). Findings 2 and 3 (spec) are non-blocking but should be
folded into the same revision pass for a clean iter-2. Re-run this gate after
revision.
