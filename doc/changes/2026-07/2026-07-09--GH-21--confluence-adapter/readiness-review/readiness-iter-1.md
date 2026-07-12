# Readiness Review Iteration 1

Verdict: NOT_READY
Work Item: GH-21
Date: 2026-07-10
Pause Required: no

## Facet Summary
- spec_completeness: FAIL
- ac_quality: PASS
- plan_coverage: PASS
- test_traceability: FAIL
- cross_artifact_consistency: FAIL
- decision_capture: FAIL
- system_spec_consistency: FAIL
- plan_doc_update_coverage: PASS
- plan_code_area_coverage: PASS
- dod_defined: PASS

## Overall Assessment

The artifact set is unusually thorough: every story AC (GH-21 issue + `MS2-E3-S4--confluence-adapter.md`
AC1–AC9) maps to a spec AC, every spec AC traces to test cases, the plan implements all F-1..F-9
capabilities with sound phase ordering (error-model-first for typecheck safety; zod-before-schemas), each
phase pairs code with tests, blast radius is explicit per phase, and doc-update coverage is comprehensive.
The two PM-resolved open questions (OQ-1 `RemoteUnreachable`, OQ-2 `RateLimited` shape) are sound and are
reflected across pm-notes → spec DEC-2/DM-3 → plan Phase 1 → test plan TC-RATE/TC-UNREACH/TC-ERR. The plan
correctly catches and works around a factual error in the spec (zod not installed) and the test plan
acknowledges it.

**However, four findings fail three facets and block READY.** They are all cheap, author-revisable defects
in `specification` and `test_planning` — **none** require reopening `delivery` (the plan itself is sound and
needs no revision). This is iteration 1; the gate is expected to pass on a light revision pass.

## Findings

### 1. [MAJOR] cross_artifact_consistency / system_spec_consistency — spec §8.4 / §13 / §21

**Gap:** The spec (the declared *contract authority* — plan §Context: "The change spec is the contract
authority; this plan operationalizes it") asserts in three places that **"`zod` is already a project
dependency (used by GH-15 config schemas)"** (§8.4 line 269, §13 line 336 "Reuses | `zod` (GH-15)", §21
line 422 "zod already present (GH-15)"). This is **verifiably false**: `package.json` has **no** `zod`
(GH-15 used `ajv`, which is what `package.json` lists); `.ai/rules/typescript.md` line 350 states
"`zod` is planned but not yet installed — install when the first consuming story lands" and line 678
lists `zod` under "MS-0002 E3" (planned). The plan (PD-2 / Phase 0), the test plan (TC-DEP-001, §8.2
assumptions), and pm-notes all **contradict** the spec and install/verify zod themselves. So the trio is
internally inconsistent on a load-bearing dependency fact, and the spec contradicts the live codebase +
the authoritative coding rules.

**Suggested remediation target phase:** specification
**Suggested fix:** Correct spec §8.4/§13/§21 to state zod is *not yet* installed and is added by this story
(first consuming story per typescript.md). Move the "correct the spec + flip typescript.md Planned→Installed"
item out of "lifecycle phase 7 only" so the spec stops asserting the falsehood now. (The plan's Phase 0
behaviour is already correct and unchanged.)

---

### 2. [MAJOR] test_traceability / plan_code_area_coverage — AC-F1-1 / TC-BND-001 (boundary negative test)

**Gap:** AC-F1-1 (spec §17) literally requires: "when a scratch file under `src/domain/` (or `src/cli/`)
imports anything from `src/infra/confluence/`, then dep-cruiser (`check:boundaries`) **fails**."
TC-BND-001 + plan PD-4 implement this as a **static fixture under `tests/_fixtures/boundary/`** cruised
with "the repo's `.dependency-cruiser.cjs` ruleset (or a copy)". This **cannot fire the production
`domain-may-not-import-infra` rule**: that rule's `from: { path: "src/domain/" }` filter
(`.dependency-cruiser.cjs`) matches only files under `src/domain/`, and `check:boundaries` runs
`depcruise src` (excludes `tests/`). A fixture at `tests/_fixtures/…` has `from.path = tests/…`, so the
production rule will **not** report a violation on it — yet TC-BND-001 step 2 asserts it does, "with the
expected `from` (the fixture)". The "(or a copy naming the same rule)" hedge is unexplained: a copy would
need a *different* `from` to match the fixture, at which point it is a **proxy** rule, not the production
invariant. There is no existing repo precedent for cruising a fixture (no boundary negative test exists
under `tests/` today). The task asked me to confirm this approach is viable: **as specified, it is not** —
the test either won't fire (production ruleset) or tests a modified rule (copy), and in neither case
literally satisfies "a `src/domain/` scratch file fails `check:boundaries`".

**Suggested remediation target phase:** test_planning
**Suggested fix:** Specify a mechanism that actually exercises the production rule, e.g. an **ephemeral
runtime-created** violating file written into `src/domain/` at test time, cruised via the programmatic
`cruise(...)` API with the repo ruleset, asserted to report `domain-may-not-import-infra`, then removed in
a `finally` (keeps `src/` clean post-run). Alternatively, explicitly document + justify the adapted-ruleset
proxy and reword TC-BND-001's assertion so it no longer claims the *production* `domain-may-not-import-infra`
rule fires on a `tests/` fixture. Either way, reconcile AC-F1-1's literal wording with what the test proves.

---

### 3. [MAJOR] decision_capture / cross_artifact_consistency — `DEC-5` ID collision

**Gap:** `DEC-5` is used as the ID for **two unrelated decisions** across the artifacts. The spec defines
DEC-5 = "The port's `renderBody` op delegates to the GH-20 `renderStorage`" (line 360). But the plan and
test plan **also** cite "DEC-5" for a *different*, security-relevant rule — "CLI messages use only
structural identifiers; **never interpolate `cause`/`retryAfterMs`**" (plan lines 143, 294, 477, 491, 498;
test-plan lines 353, 589, 608, 613, 1603). That no-secret-in-message rule **does not exist as a DEC in the
spec** at all (DEC-1..DEC-8 contain no such decision), yet it is treated as an established decision
("DEC-5") in 9+ citations. This is a traceability-collapsing ID clash on a rule that exists *precisely* to
prevent transport text from leaking into CLI output (NFR-SEC-1 / RSK-3) — the kind of rule that most needs
a stable, correct authority.

**Suggested remediation target phase:** specification
**Suggested fix:** Add a new DEC (e.g. DEC-9) to the spec for "CLI-facing messages use only structural
identifiers; `cause`/`retryAfterMs` stay in the typed error for redacted logging only" (justified by
NFR-SEC-1 / RSK-3). Then fix the plan + test-plan citations so "DEC-5" refers only to the renderBody
delegation and the new DEC number refers to the no-interpolation rule.

---

### 4. [MINOR] cross_artifact_consistency — spec internal inconsistency on error-arm count

**Gap:** When OQ-1 added `RemoteUnreachable`, not all summary text in the spec was updated. The
authoritative sections correctly state **two** additive arms (§1.6 line 35, §5.1 F-9 detail lines 147–151,
DM-3 line 262, DEC-2 line 357, OQ-1 line 347, §7.2 line 221). But several other locations still describe
**only** `RateLimited`: G-9 (line 84 "the **one** story-mandated addition"), the F-9 capability table row
(line 127 "The **one** story-mandated error-model change: the `RateLimited` arm"), NG-9 (line 113 "New
error arms beyond `RateLimited`" — omits `RemoteUnreachable`), and the Glossary (line 440 "the only
error-model change in this story"). A reader cross-checking arm count gets contradictory answers from the
same document.

**Suggested remediation target phase:** specification
**Suggested fix:** Update G-9, the F-9 table row, NG-9, and the `RateLimited` glossary entry to reflect
that **both** `RateLimited` and `RemoteUnreachable` are added (the story-mandated one is `RateLimited`;
`RemoteUnreachable` is the PM-decided OQ-1 addition).

---

### 5. [NIT] cross_artifact_consistency — `RemoteUnreachable` is beyond literal story scope (record only)

The story file + issue mandate only `RateLimited` (exhausted-429). `RemoteUnreachable` (exhausted-5xx /
network / schema-drift) is a PM-decided extension that fills a genuine gap (the story says "5xx retry max 3"
but is silent on exhaustion). It is well-justified (distinct recovery action; `AuthUnreachable` precedent
verified present in `src/domain/errors.ts:77`), decision-captured (OQ-1 / DEC-2 / DM-3), and exhaustiveness-
safe. No action — recorded only so the scope extension is explicit.

---

### 6. [NIT] cross_artifact_consistency — labels appear in story/issue scope (record only)

The story Goal + the GH-21 issue scope list "attachments/**labels**/search/restrictions". Labels are
deferred to post-MS-0002 (DEC-8 / NG-3 / feature-spec §3.1 lists `LabelService`). The deferral is
documented and justified (NFR-MAINT-2; no MS-0002 flow uses labels). No action — the deferral is consistent
across all three artifacts.

## Positive Confirmations (no action needed)

- **All 9 story ACs → spec ACs → test cases** trace cleanly (test plan §3.1: AC-F1-1..AC-Q-1 all "Covered").
- **OQ-1 / OQ-2 resolutions are sound** and consistently reflected in pm-notes, spec (DEC-2/DM-3/OQ table),
  plan (Phase 1, tasks 1.1–1.3), and test plan (TC-RATE-002, TC-UNREACH-001..003, TC-ERR-001..003).
- **zod-not-installed is operationally handled** by plan Phase 0 + test plan TC-DEP-001 + pm-notes — the
  *only* defect is the spec text (Finding 1); delivery is not impeded by the dependency itself.
- **Phase ordering is sound**: Phase 0 (zod) → Phase 1 (error arms = typecheck safety net before any
  producer) → Phase 2 (port) → Phase 3 (client) → Phase 4 (pages/409/403) → … with tests alongside every
  phase and `check:boundaries` at every commit.
- **Critical-safety paths** (409 parse, 403 warn+skip with 0 delete/recreate, no-token-leak grep,
  no-outbound-telemetry host check) are proven at the **integration** tier over a real `Bun.serve` mock,
  satisfying the over-mocking guardrail.
- **DoD is clear and testable** (story DoD + AC-Q-1 gate). **plan_doc_update_coverage** and
  **plan_code_area_coverage** both PASS (explicit file lists + doc-sync handoff per phase).

## Reopen Recommendation

- **specification** — Findings 1, 3, 4 (zod factual correction; DEC-5 collision → add DEC-9 + fix
  citations; error-arm count consistency).
- **test_planning** — Finding 2 (AC-F1-1 / TC-BND-001 boundary mechanism: specify a viable approach that
  exercises the production rule, or reconcile the AC wording with an explicitly-justified proxy).
- **delivery_planning** — no reopen (plan is sound; it correctly handles zod and inherits only the
  boundary-test ambiguity from the AC/test-plan).
- **delivery** — never reopened by DoR.

No human input required (Pause Required: no). Expected to pass on iteration 2 after a light revision pass.
