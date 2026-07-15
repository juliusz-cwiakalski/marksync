# Readiness Review Iteration 1

Verdict: NOT_READY
Work Item: GH-81
Date: 2026-07-15
Pause Required: no

## Facet Summary
- spec_completeness: FAIL
- ac_quality: FAIL
- plan_coverage: PASS
- test_traceability: FAIL
- cross_artifact_consistency: FAIL
- decision_capture: PASS
- system_spec_consistency: FAIL
- plan_doc_update_coverage: PASS
- plan_code_area_coverage: PASS
- dod_defined: PASS

## Method note

The "corrected endpoint list" (spec §8.1) was verified line-by-line against the
actual adapter source (`src/infra/confluence/{client,pages,properties,attachments,
search,restrictions,target}.ts`, `src/app/{credentials,push-flow}.ts`) and the zod
schemas (`schemas/{page,property,attachment}.ts`). The paths, methods, and most
envelopes are **correct** (pages v2 create/get/put, the 409 `parseConflict`
envelope + `VERSION_RE`, attachment `{results:[...]}` unwrap + 400 dedup signal,
property endpoint family + the POST-409→GET→PUT recovery design). DEC-1/2/3 are
sound and correctly captured. However, three blocking defects were found where
the artifacts contradict either each other or the actual runtime behavior. All
three would make a mandatory scenario fail as written.

## Findings

### 1. [major] cross_artifact_consistency / test_traceability — test-plan §5.2 TC-E2EMOCK-002 step 5 + plan §Phase 3 task 3.1

**Gap:** The create-flow scenario asserts `1× GET /wiki/api/v2/user/by-me
(credential validation)` is captured, but under DEC-1 (programmatic e2e) that
request is **never made**. Verified: the sole caller of `user/by-me` is
`validateCredentials` in `src/app/credentials.ts`; `computePlan`/`applyPlan`
never call it, and `ConfluenceTarget.fromCredentials` performs no I/O. The spec
itself acknowledges this — §8.1 explicitly states `user/by-me` is "implemented
for realism, NOT on the e2e critical path (DEC-1 bypasses resolveCredentials)".
So spec §8.1 directly contradicts test-plan TC-002 step 5 and plan Phase 3.1,
both of which list the call as a captured assertion. TC-E2EMOCK-002 is the
critical create-flow anchor (AC-F2-1, AC-F1-1, AC-4 GH-71) and would fail on
this assertion at runtime.

**Suggested remediation target phase:** test_planning (root), then
delivery_planning to align.

**Suggested fix:** Drop the `1× GET user/by-me` assertion from TC-E2EMOCK-002
step 5 and from plan Phase 3 task 3.1. Correct the §3.2 interface-coverage row
API-F1-9 (user/by-me is implemented by the mock for completeness/realism but is
not exercised by any pipeline scenario — trace it to the Phase 1 ad-hoc smoke
probe, not TC-002). Spec §8.1 is already correct; no spec change needed here.

---

### 2. [major] ac_quality / cross_artifact_consistency — test-plan §5.2 TC-E2EMOCK-008 (preconditions vs steps) + plan §Phase 4 task 4.1

**Gap:** TC-E2EMOCK-008 (the GH-66 regression anchor, AC-4) is internally
contradictory. Preconditions say "Fresh mock server instance (state reset)";
steps then expect `POST /property → mock 409 (property already exists) → GET →
PUT`. Verified against `src/infra/confluence/properties.ts`: `put()` POSTs
first; on a **fresh** mock the `marksync.metadata` key does not yet exist, so
POST returns 2xx and the flow ends — the 409→GET→PUT path is only reached when
the key **pre-exists**. Plan Phase 4 task 4.1 repeats the identical
contradiction ("Fresh mock; 1 UUID'd page … POST → mock 409 → GET → PUT"). The
scenario cannot pass as written.

Note: the GH-66 regression lock itself is **not** lost — the v1 content-property
endpoint being used + jsongraphs never being called both hold even when POST
succeeds on a fresh mock. The defect is the asserted 409→GET→PUT flow being
unreachable under the stated preconditions.

**Suggested remediation target phase:** test_planning (root), then
delivery_planning to align.

**Suggested fix:** Pick one and make preconditions + expected flow consistent:
(a) pre-seed the mock's property map with `marksync.metadata` so POST hits an
existing key → 409 → GET → PUT; or (b) run a first sync (POST succeeds, creates
the property), then modify the source and re-sync so the Update path's
`finalizeSuccessfulUpdate` → `putProperty` hits the now-existing key (POST → 409
→ GET → PUT). Keep the primary GH-66 assertions (v1 endpoints used; jsongraphs
endpoint never requested; property ultimately set). Mirror the chosen shape in
plan Phase 4.1.

---

### 3. [major] spec_completeness / system_spec_consistency — spec §8.1 "Properties" (GET + PUT response shape) + plan Phase 1 task 1.5

**Gap:** Spec §8.1 specifies the v1 content-property GET/PUT response as
`{ key, value, version:{number} }`, omitting `id`. Verified against
`src/infra/confluence/schemas/property.ts`: `PropertyV1Response` declares
`id: z.union([z.string(), z.number()])` as **required** (no `.optional()`). If
the mock is built to the spec's explicit shape, `PropertyV1Response.safeParse`
fails → `RemoteUnreachable`, which breaks the property GET path (the Update
operation-freshness `getProperty` gate in `push-flow.ts` blocks the entry; the
property 409-recovery `fetchCurrentVersion` fails). Plan Phase 1 task 1.5
repeats the omission verbatim. (Partial safety net: Phase 1 AC says envelopes
must "satisfy the adapter's zod schemas (PropertyV1Response)" — a careful coder
could infer `id` from the schema, but the explicit contract shape is wrong and
must not rely on coder inference.)

**Suggested remediation target phase:** specification (root), then
delivery_planning to align Phase 1 task 1.5.

**Suggested fix:** Amend spec §8.1 property GET/PUT response to
`{ id, key, value, version:{number} }` (id is `string | number`, required by the
zod schema). Mirror in plan Phase 1 task 1.5.

---

### 4. [minor] test_traceability — test-plan §3.2 (API-F1-10 search, API-F1-11 restrictions → TC-E2EMOCK-002)

**Gap:** `searchPages` and `getRestrictions` are never invoked by
`computePlan`/`applyPlan` (confirmed: neither appears in `push-flow.ts`). So no
pipeline scenario drives a search or restrictions call; the stubs are validated
only by the Phase 1 ad-hoc "fire one request per endpoint" smoke, which is not a
traced TC. The §3.2 matrix tracing API-F1-10/11 to TC-002 overstates TC-002's
coverage. Low risk (empty `results` stubs, low drift), but the traceability is
loose.

**Suggested remediation target phase:** test_planning.

**Suggested fix:** Re-trace API-F1-10/11 to the Phase 1 endpoint smoke probe
(add it as an explicit low-priority TC, or annotate the matrix that these are
validated by the mock-skeleton smoke, not by a pipeline scenario).

---

### 5. [minor] ac_quality / test_traceability — test-plan §5.2 TC-E2EMOCK-005 (attachment dedup)

**Gap:** TC-005 frames dedup as "unchanged source → second applyPlan". On an
unchanged source the classifier yields NoOp, so `processEntry` returns `noop`
**before** `uploadAssets` runs — meaning 0 POST attachment is vacuous and the
dedup mechanism (`attachmentExists` hash precheck / 400 "same file name") is
never actually exercised. The GH-71 unwrap lock is in fact held by TC-002 (real
uploads of 2 new attachments, with `results[0].id` unwrap asserted), not TC-005.
AC-F2-4 / AC-4 (GH-71) coverage via TC-005 is therefore overstated.

**Suggested remediation target phase:** test_planning.

**Suggested fix:** Either reframe TC-005 to use an Update with an unchanged
asset (changed page body, same attachment) so `uploadAssets` runs and the
`attachmentExists` precheck skips the existing asset, or temper the TC-005
coverage claim (the dedup *mechanism* is exercised during Create/Update asset
processing, not on a no-op rerun) and keep TC-002 as the primary GH-71 anchor.

---

### 6. [minor] ac_quality — spec §17 AC-4 (GH-66 → AC-F2-5 linkage)

**Gap:** AC-4 asserts a reintroduced GH-66 property-API regression makes
AC-F2-5 (provenance panel) fail. But AC-F2-5 asserts the visible panel in the
page **body** (written via `createPage`, independent of `putProperty`). A GH-66
regression blocks the entry (so AC-F2-1's writes-count fails), yet the panel is
still present in the captured create body, so AC-F2-5 may still pass. GH-66 is
reliably caught by AC-F2-1 (blocked entry → writes ≠ N) and TC-008 (jsongraphs
never called), not by AC-F2-5.

**Suggested remediation target phase:** specification.

**Suggested fix:** In AC-4, drop the "AC-F2-5 fails" clause for the GH-66 case
(keep "AC-F2-1 fails" + the TC-008 direct check); or clarify that the GH-66
failure surfaces via the blocked-entry writes-count mismatch, not the panel
assertion.

---

## Non-finding notes (verified sound, not re-litigated)

- **DEC-1 / DEC-2 / DEC-3** are sound, correctly captured in `pm-notes.yaml`
  and spec §15, and consistent with the codebase (programmatic target
  construction is the established `tests/integration/confluence/` pattern; the
  `https:`-gate in `credentials.ts` is genuinely untouched by the pipeline).
- **Over-mocking guardrail** (`.ai/rules/testing-strategy.md`): satisfied — the
  mock is an adapter-boundary HTTP mock (explicitly allowed), not a domain-logic
  or lifecycle-invariant mock.
- **Plan guardrails** (no `src/**` changes, RSK-5 escalate-adapter-bugs,
  `git diff --stat main -- src/` check in Phase 6.4, DEC-2 tier separation,
  pinned-Bun matrix match) are explicit and check-listable.
- **409 conflict envelope** (§8.1 / AC-F1-2 / TC-001 / Phase 2): verified
  correct — `VERSION_RE`, the `Current Version:[N]`→remote / `Provided
  version:[M]`→base mapping, and the `code:"CONFLICT"` requirement all match
  `pages.ts` `parseConflict` and `schemas/page.ts` `Conflict409Envelope`.
- **Attachment `{results:[...]}` unwrap + 400 dedup**: verified correct against
  `attachments.ts` (`mapCreate` / `hasWrappedResults` / `isDuplicateFilename`).
- **plan_coverage / plan_code_area_coverage / plan_doc_update_coverage /
  decision_capture / dod_defined**: PASS — ACs are testable Given/When/Then,
  phases map to TC IDs and AC IDs, affected files are listed per phase, and the
  optional testing-strategy.md note is flagged for lifecycle phase 7.

## Next steps

Reopen **test_planning** (findings 1, 2, 4, 5) and **specification** (findings 3,
6), then re-align **delivery_planning** (Phase 1 task 1.5, Phase 3 task 3.1,
Phase 4 task 4.1). No `delivery` reopening. No human input required (Pause
Required: no). Re-run this gate after revision; this is iteration 1 of ~3.
