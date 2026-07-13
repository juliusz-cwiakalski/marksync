# Readiness Review Iteration 1

Verdict: NOT_READY
Work Item: GH-66
Date: 2026-07-13
Pause Required: no

## Facet Summary

- spec_completeness: FAIL
- ac_quality: PASS
- plan_coverage: FAIL
- test_traceability: FAIL
- cross_artifact_consistency: FAIL
- decision_capture: PASS
- system_spec_consistency: PASS
- plan_doc_update_coverage: FAIL
- plan_code_area_coverage: PASS
- dod_defined: PASS

## Blocking Findings

### 1. [major] cross_artifact_consistency — spec §14 OQ-2 / §11 RSK-4 / Appendix B vs plan Phase 2 vs test-plan

**Gap:** The spec resolves OQ-2 and RSK-4 and Appendix B (line 346) to "surface
PUT 409 as `Conflict` to caller" (the racy concurrent-update edge case — the
central technical risk flagged by PM notes). This resolution does NOT propagate
to either the plan or the test plan:

- **Plan Phase 2** acceptance criteria (line 146) and task 2.2 error-mapping
  list (line 133) enumerate only `403→Forbidden, 404(GET)→ok(undefined),
  413→TooLarge, schema-fail→RemoteUnreachable`. The `409→Conflict` mapping is
  absent. The current `updateByKey()` falls through to the catch-all
  `RemoteUnreachable` for 409; the plan does not add a 409→Conflict branch, so
  delivery would preserve the wrong behavior the spec explicitly overrode.
- **Test plan** has zero test cases for PUT 409→Conflict or GET-failure-during-
  fallback→Conflict. Every 409 in the test plan is the POST-create 409 (the
  happy-path trigger for the GET→PUT fallback), never the PUT 409. NFR-3 ("no
  409 loops") is marked "Covered" by TC-PROP-V1-VERSION-001/002, but those tests
  only exercise PUT→200, not PUT→409.
- The `Conflict` error kind
  (`{kind:"Conflict"; pageId; baseVersion; remoteVersion}`) is page-shaped; the
  spec never defines how `baseVersion`/`remoteVersion` are populated for a
  property conflict (which property version numbers map to which fields).

**Suggested remediation target phase:** delivery_planning
**Suggested fix:** (a) Plan Phase 2 task 2.3 must add a `409→Conflict` branch to
`updateByKey()` and define the `Conflict` payload fields for properties
(`baseVersion` = version sent in the PUT body, `remoteVersion` = version from
the 409 response or a re-GET). (b) Add a test case TC-PROP-V1-VERSION-003 (and
integration TC-INT-PROP-V1-003) for PUT→409→Conflict. (c) Spec §17 should add
an explicit AC for the concurrent-409→Conflict behavior so the chain
spec→plan→test is closed. If PM intends to DEFER the 409→Conflict behavior
(simplest MVP path), then the spec OQ-2/RSK-4/Appendix B must be re-resolved to
say so explicitly and the residual risk re-evaluated — silent omission is not
acceptable.

---

### 2. [major] test_traceability — test-plan TC-PROP-V1-ERR-002 (line 120, 574)

**Gap:** TC-PROP-V1-ERR-002 asserts "v1 **GET** 413 → TooLarge." This is
technically wrong: the current `get()` (properties.ts L33-38) maps every
non-2xx status except 404/403 to `RemoteUnreachable` — there is no 413 branch
in `get()`, and neither the spec nor the plan adds one. The `413→TooLarge`
mapping exists ONLY in `put()` (L82-88, via `isTooLargeBody`). A GET request
never sends a large body, so a GET 413 is not a meaningful path.

The test as written would FAIL against the actual/planned implementation, or
would force an unplanned behavior change (adding 413→TooLarge to `get()`). Both
outcomes contradict the spec and plan.

Simultaneously, the REAL 413→TooLarge path — `put()` POST-create 413 — has NO
test case anywhere in the test plan. TC-PROP-V1-ERR-002 should test PUT/POST
413, not GET 413.

**Suggested remediation target phase:** test_planning
**Suggested fix:** Rewrite TC-PROP-V1-ERR-002 to test `put()` POST 413 →
TooLarge (the actual code path in properties.ts L82-88). Either remove the GET
413 assertion or change it to assert GET 413 → RemoteUnreachable (the real
catch-all behavior). Update the plan's test-scenario table (line 332) and Phase
3 task 3.8 accordingly.

---

### 3. [major] plan_coverage — plan Phase 2 task 2.2 (line 129-133)

**Gap:** The plan's central-risk task is under-specified for implementation.
Task 2.2 says "GET current version via v1, then PUT with `{key, value,
version:{number: currentVersion+1}}`" but does not specify the version-
extraction mechanism. The public `get()` method returns `Result<string |
undefined, MarkSyncError>` — it discards `version.number` and cannot provide it
to `put()`. The plan therefore leaves ambiguous whether `put()`:

(a) calls `get()` (useless — returns only the value string, not the version), or
(b) issues its own raw `this.client.request("GET", ...)` and parses the response
    with `PropertyV1Response` to extract `version.number`, or
(c) refactors `get()` to also return the version.

Task 2.3 says updateByKey's signature changes to accept `currentVersion: number`
"extracted from GET response in put()" — confirming put() must obtain the
version itself — but the HOW is not specified. This is the single non-trivial
implementation detail (PM notes explicitly flag it: "the fix is NOT a one-line
path swap for the PUT arm"), and the plan does not make it check-listable.

**Suggested remediation target phase:** delivery_planning
**Suggested fix:** Phase 2 task 2.2 must specify: put() issues a raw v1 GET
(`this.client.request("GET", this.client.v1(...))`), validates the response with
`PropertyV1Response`, extracts `version.number`, and passes it to
`updateByKey(pageId, key, value, currentVersion)`. Alternatively, if a shared
helper is preferred, specify it. The task should also define what happens when
this fallback GET returns non-200 (tie to finding 1).

---

## Non-Blocking Findings

### 4. [minor] plan_doc_update_coverage — plan Phase 5 task 5.2 (line 287, 305)

**Gap:** The plan lists `feature-confluence-adapter.md` §3.1 (L55-57), §3.2
table (L78), §4.2 (L127) for update by doc-syncer. It MISSES §5 line 154-155 —
a checked system-spec AC: `[x] v2 used for content/properties; v1 only for
attachments/search/restrictions`. This AC becomes FALSE after this change. A
checked AC that contradicts the implementation is a latent consistency defect.

**Suggested remediation target phase:** delivery_planning
**Suggested fix:** Add §5 L154-155 to the doc-update list in Phase 5 task 5.2
and the "System docs to update" block.

---

### 5. [minor] test_traceability — test-plan §3.1 AC-F3-1 row (line 68)

**Gap:** AC-F3-1 ("sync produces NoOp on second unchanged sync") traces to
TC-PROP-V1-IDEM-001, marked "Covered (reference)" — but TC-PROP-V1-IDEM-001 does
NOT appear in the scenario index (§5.1) and has no scenario detail anywhere in
the test plan. It is a phantom reference. Every other AC traces to fully
defined TCs; AC-F3-1 alone defers to an undefined reference.

**Suggested remediation target phase:** test_planning
**Suggested fix:** Either define TC-PROP-V1-IDEM-001 as a concrete scenario
(which existing sync integration test covers it, what it asserts) or explicitly
mark AC-F3-1 as "Covered by pre-existing sync-engine tests — out of scope for
this change's test additions" with a pointer to the covering test file/test
name.

---

### 6. [minor] spec_completeness — spec §8.3 DM-1 / plan Phase 1 task 1.1 (line 87)

**Gap:** The new `PropertyV1Response` schema is specified as
`{id, key, value, version: {number, when}}` with both `number` and `when`
implicitly required (the plan task 1.1 lists the shape with no `.optional()`).
The code never reads `when` — only `version.number` is used for optimistic
concurrency. If Confluence v1 occasionally omits `when` (plausible — the field
is a timestamp that may be absent on create or vary by endpoint), every GET
would fail schema validation → spurious `RemoteUnreachable`. The current
`PropertyV2Response` correctly has `version.optional()`; the v1 schema tightens
this without justification. (Note: TC-PROP-V1-SCHEMA-001 tests that missing
`version` → RemoteUnreachable, but this conflates "version absent" with
"`when` absent within version" — the latter is an over-constraint.)

**Suggested remediation target phase:** specification
**Suggested fix:** Specify `when` as optional in `PropertyV1Response.version`
(or omit `when` entirely from the schema since it is unused). Keep `number`
required. Update DM-1 and plan task 1.1 to reflect optionality.

---

### 7. [nit] cross_artifact_consistency — pm-notes.yaml (line 19-20)

**Gap:** `chg-GH-66-pm-notes.yaml` has `decisions: []` and
`open_questions: []`, while the spec records 5 decisions (DEC-1..5) and 2
resolved open questions (OQ-1, OQ-2). The spec is the authoritative decision
log so this is cosmetic, but the pm-notes should at minimum reference the spec
decisions for traceability.

**Suggested remediation target phase:** specification
**Suggested fix:** Populate pm-notes decisions/open_questions with cross-
references to spec DEC-1..5 / OQ-1..2, or add a note that decisions are
captured in the spec.

---

## What Passes

- **Root-cause diagnosis** is correct and consistent across ticket → spec →
  plan: v2 `/pages/{id}/properties/{key}` expects a property ID, not a key →
  400; v1 `/content/{id}/property/{key}` accepts keys → 200. Verified against
  source code (properties.ts L22, L103).
- **Happy-path version flow** (POST create → 409 → GET version → PUT with
  incremented version → 200) is well-specified (spec F-3, Appendix B), planned
  (Phase 2 task 2.2), and tested (TC-PROP-V1-VERSION-001/002) with exact
  request-sequence and body assertions.
- **Schema migration** (Phase 1) is cleanly separated from the core fix
  (Phase 2) and tests (Phase 3). The build-red-between-phases is acknowledged.
- **Error semantics for the common cases** (403→Forbidden, 404→ok(undefined),
  schema-fail→RemoteUnreachable) are consistent across spec/plan/test.
- **Code-area coverage** is explicit per phase; blast radius is scoped to
  properties.ts, schemas/property.ts, and two test files. target.ts needs no
  changes (updateByKey is private; port interface unchanged).
- **Decisions** are change-scoped and correctly captured in the spec; no
  system-level precedent requires an ADR.

## Recommended Reopen Targets

Reopen **delivery_planning** (findings 1, 3, 4) and **test_planning** (findings
1, 2, 5). Finding 6 and 7 touch the spec but are non-blocking — address in
specification if convenient. After revisions, re-run this gate.
