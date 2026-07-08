---
# Copyright (c) 2025-2026 Juliusz Ćwiąkalski (https://www.cwiakalski.com | https://www.linkedin.com/in/juliusz-cwiakalski/ | https://x.com/cwiakalski)
# MIT License - see LICENSE file for full terms
id: chg-GH-16-readiness-iter-1
status: complete
created: 2026-07-08T17:45:00Z
work_item: GH-16
iteration: 1
verdict: NOT_READY
pause_required: false
reviewer: readiness-reviewer
---

# Readiness Review Iteration 1

Verdict: NOT_READY
Work Item: GH-16 (`[MS2-E2-S3] CLI framework + CommandResult<T>`)
Date: 2026-07-08
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

> Overall: 8 of 10 facets PASS. The two FAILs are `cross_artifact_consistency`
> (highest-value facet) and `plan_coverage` (driven by the same root cause: the
> plan's `CommandResult<T>` type definition contradicts the spec's contract on
> two fields). The load-bearing work — the DEC-1 tier split that sank GH-15
> iter-1 — is encoded **consistently** across all three artifacts; the failures
> are narrow contract-field and label-drift defects, cheap to fix on a plan
> revision pass. No pause flag; no `needs_human_input` decision.

## Context

Adversarial critique of the GH-16 artifact set (spec 474L + test-plan 800L +
plan 922L) against the authoritative story `MS2-E2-S3--cli-framework.md`
(10 deliverables, 8 ACs, CEO-resolved Q1/Q2/R1), GitHub issue #16, ADR-0011
(C-1..C-5), TDR-0002 (Cliffy, C-1 smoke gate), `.ai/rules/typescript.md`
(tier rules, picocolors, allowed-deps), `.ai/rules/testing-strategy.md`
(over-mocking guardrail), `doc/overview/architecture-overview.md`
(dependency-direction matrix, rows 197–202), `.dependency-cruiser.cjs`
(`presentation-may-not-import-domain|-infra`, severity `error`), the live
`src/domain/errors.ts` (13-kind union + `assertNeverMarkSyncError`),
`src/domain/result.ts`, `src/cli/commands/init.ts` (GH-15 tier-correct
precedent), `src/cli/index.ts` (trivial stub), and `feature-cli.md`. The GH-15
DoR iter-1/iter-2 records were consulted for precedent (the iter-1
tier-placement FAIL is the directly analogous risk here).

## What passed (highlights — no findings)

- **DEC-1 tier split is consistent across all three artifacts.** This is the
  exact risk that failed GH-15 iter-1 (module placed in two different tiers).
  Here the spec (§2.1, §16, DEC-1, DM-4, NFR-11, RSK-2), the plan (DEC-1,
  Phase 5 `src/app/cli-error-map.ts`, Phase 2.2 `src/cli/output/exit-codes.ts`
  "Zero tier imports — pure data", Critical ordering constraint Phase 5 ≺
  Phase 6), and the test plan (§4 layout, TC-MAP-001..007 →
  `tests/unit/app/cli-error-map.test.ts`, TC-BND-003, TC-MAP-007) all place the
  `MarkSyncError.kind → {code,message,retryable}` translation in the
  **application** tier and the numeric constants + `codeToExitCode(code)`
  keyed-by-stable-string in the **presentation** tier. Verified against the
  live `init.ts` precedent and dep-cruiser rules. RSK-2 closed.
- **AC→TC traceability is complete and real.** All 8 story ACs map to ≥1
  traceable TC (§3.1 matrix + Appendix A). TCs are substantive, not
  tautological — e.g. TC-RED-007 proves DEC-4 by embedding a token in a nested
  `data` field only exposed post-`JSON.stringify`; TC-C3-001 proves C-3 by
  hashing `json.ts`/`human.ts`/`redact.ts` before/after adding a stub.
- **ADR-0011 C-1..C-5 each have a concrete test** (spec Appendix B + test-plan
  §3.1): C-1→TC-JSON-001..007/TC-INT-001; C-2→TC-COLOR-001..008/TC-INT-002;
  C-3→TC-C3-001; C-4→TC-CONTRACT-001..002/TC-JSON-002; C-5→TC-RED-*/TC-OUT-001.
- **INV-SEC-1 rigor honored (over-mocking guardrail).** Redaction is validated
  on **real captured output** via grep (TC-RED-001..009, TC-OUT-001,
  TC-INT-001 `Bun.spawn` real process), never via a "redact was called" mock.
  The R1 over-redaction guard (40-char hex SHA survives) is TC-RED-006.
- **TDR-0002 smoke gate is not skipped.** Plan Phase 1.3 makes
  `bun build --compile` + binary `--help` a prerequisite **before** the Cliffy
  version lock, with explicit `@decision-advisor` fallback-watchlist escalation
  on failure. The test plan correctly scopes it as a plan prerequisite (not a
  duplicated test scenario).
- **Out-of-scope clarity.** Stub handlers only (NG-1); NDJSON wired, no watch
  command (NG-2); `init` rewired not rewritten (Phase 6.3 / TC-CMD-004);
  `@cliffy/prompt` deferred (NG-4).
- **Dependencies resolved.** GH-14 + GH-15 merged (pm-notes); `Result<T,E>`,
  13-kind `MarkSyncError` (incl. `InvalidConfig`), `assertNeverMarkSyncError`,
  and the `init.ts` precedent all present in `src/`.
- **DoD defined.** Spec §17 AC table (AC-F*-1 → story AC-1..AC-8) is the
  testable Definition of Done; story confirms "AC list is the DoD."

## Findings

### 1. [major] cross_artifact_consistency — `CommandResult.warnings` shape contradicts across spec and plan

**Artifact**: `chg-GH-16-plan.md` Phase 2.1 task 2.1 (line 399:
`warnings?: string[]`).
**Contradicts**: `chg-GH-16-spec.md` F-1 (line 116:
`warnings?: [{ code, message }]` — non-fatal advisories `{code,message}`) and
DM-1 (line 238). Test plan TC-CR-003 (line 254) says only "warnings[] optional
array present" — it does not disambiguate the element shape.

**Gap**: The spec mandates a **structured** warnings element
(`{ code, message }`) as part of the C-4 stable JSON schema; the plan
implements an **unstructured** `string[]`. These cannot both be pinned by the
F-10 contract snapshot (TC-CONTRACT-001/002, AC-F2-1/AC-8). Whichever shape
the `@coder` implements, one artifact becomes stale — and a re-pinned snapshot
that silently drifts from the spec is precisely the failure C-4 exists to
prevent. This is a direct spec↔plan contradiction on a contract field, not a
casing/conversion artifact (the snake_case conversion in DEC-2/plan DEC-4 does
not reconcile it).

**Suggested remediation target phase**: delivery_planning

**Suggested fix**: In `chg-GH-16-plan.md` Phase 2.1, conform the type to the
spec (the spec is the contract authority and is self-consistent): change
`warnings?: string[]` → `warnings?: Array<{ code: string; message: string }>`.
The contract snapshot (Phase 7) then pins the structured shape. (No spec or
test-plan change required; optionally tighten TC-CR-003 to assert the
`{code,message}` element shape so the contract is pinned at unit tier too.)

---

### 2. [minor] cross_artifact_consistency — `timing` duration field name mismatch (`duration_ms` vs `elapsedMs`)

**Artifact**: `chg-GH-16-plan.md` Phase 2.1 task 2.1 (line 397:
`timing?: { startedAt: string; elapsedMs: number }`).
**Contradicts**: `chg-GH-16-spec.md` F-1 (line 113:
`timing?: { started_at, duration_ms }`) and §10 (line 271:
"`timing` ... provides `started_at`/`duration_ms`"); test plan TC-CR-004
(line 255: "`timing` optional `{started_at,duration_ms}` (snake_case on wire)").

**Gap**: The plan's camelCase `elapsedMs` converts to **`elapsed_ms`** on the
wire (per DEC-2/plan-DEC-4 snake_case conversion), but the spec **and** the
test plan both pin the wire field name as **`duration_ms`**. This is a
field-name mismatch, not a casing-conversion artifact: `elapsed_ms ≠
duration_ms`. The spec and test plan agree, so the plan is the outlier. Same
C-4/F-10 stability risk as Finding 1, lower severity (optional observability
field, not security-critical).

**Suggested remediation target phase**: delivery_planning

**Suggested fix**: In `chg-GH-16-plan.md` Phase 2.1, rename `elapsedMs` →
`durationMs` (so the snake_case wire field is `duration_ms`, matching spec +
test plan). No spec/test-plan change needed.

---

### 3. [minor] cross_artifact_consistency — DEC numbering drift between spec and plan (only DEC-1 aligns)

**Artifact**: `chg-GH-16-plan.md` "Binding decisions" (DEC-1..DEC-6,
lines 78–149); `chg-GH-16-test-plan.md` TC-JSON-003 (line 412),
TC-EXIT-001 (line 517), TC-MAP-001 (line 535).
**Contradicts**: `chg-GH-16-spec.md` §15 Decision Log (DEC-1..DEC-6,
lines 320–325).

**Gap**: The DEC identifiers are overloaded. Only **DEC-1** (tier placement)
means the same thing in both artifacts. The rest diverge:

| ID | Spec sense | Plan sense |
|----|------------|------------|
| DEC-2 | snake_case JSON | full `kind→code→exit` mapping table |
| DEC-3 | top-level error `{code,message,retryable}` | picocolors |
| DEC-4 | redact serialized output | JSON casing + schema stability |
| DEC-5 | picocolors + Cliffy confined | error representation |
| DEC-6 | `error.code` stable string | Cliffy pin deferred post-smoke |

The **decisions themselves are consistent** (the plan implements every spec
decision; snake_case is snake_case in both). Only the **labels** drifted
because the plan's DEC block was authored without aligning to the spec's
numbering (see Finding 4). The test plan inherits the ambiguity: it cites
"DEC-2" in the **spec** sense for snake_case (TC-JSON-003 line 412, DM-1
line 158) but in the **plan** sense for the mapping table (TC-EXIT-001
line 517, TC-MAP-001 line 535) — an internal inconsistency within the test
plan. Not `@coder`-blocking (context disambiguates), but it violates the
"same ID = same concept" traceability discipline and will confuse `@reviewer`.

**Suggested remediation target phase**: delivery_planning (primary) +
test_planning (minor cleanup)

**Suggested fix**: Align the plan's DEC numbering to the spec's (spec authored
first per pm-notes; test plan already mostly follows the spec). Either
renumber the plan's DEC-2..DEC-6 to match the spec, or add a one-line
cross-reference table ("plan DEC-x = spec DEC-y"). Then update the two test-
plan TCs that cite "DEC-2" in the plan's mapping-table sense (TC-EXIT-001,
TC-MAP-001) so every "DEC-n" reference resolves to one concept.

---

### 4. [minor] cross_artifact_consistency / plan_coverage — plan "Scope-source note" is stale and self-contradictory

**Artifact**: `chg-GH-16-plan.md` "Scope-source note" (lines 68–74):
*"At plan-authoring time no `chg-GH-16-spec.md` exists (PM delegated delivery
planning directly from the story ... the `change_spec` link above is the
conventional placeholder for the spec once authored ...)."*

**Gap**: The spec **does** exist — `chg-GH-16-spec.md` (474 lines, front-matter
created 2026-07-08) is present in the change folder, and `pm-notes.yaml`
records `specification.completed: 2026-07-08T00:10:00Z` (before
`delivery_planning.completed`). The note is factually incorrect and
contradicts the plan's own YAML `links.change_spec: ./chg-GH-16-spec.md`.
It also signals the root cause of Findings 1–3: the plan was authored without
treating the spec as the binding contract source, so its `CommandResult<T>`
type and DEC block drifted. A `@coder` reading this note could wrongly assume
the story (not the spec) is the contract authority and prefer the plan's
`string[]`/`elapsedMs` over the spec's shapes.

**Suggested remediation target phase**: delivery_planning

**Suggested fix**: Delete or rewrite the "Scope-source note" to state that the
spec is authored, is the binding contract authority, and the plan conforms to
it (cite `chg-GH-16-spec.md` F-1/DM-1 for the `CommandResult<T>` shape).

---

## Advisory notes (non-blocking — do not fail any facet)

> Recorded for `@coder`/`@reviewer` awareness; no artifact revision required
> to clear DoR. Each is a defensible, documented deviation.

1. **[nit] system_spec_consistency / test_traceability** — INV-SEC-1 is
   validated via **Unit + Integration** (TC-RED-*, TC-OUT-001, TC-INT-001
   `Bun.spawn` real process + grep), not **Unit + Gherkin** as the
   testing-strategy.md "What MUST be tested (release-blocking)" row prescribes.
   The test plan §1.2 documents the deviation with rationale (this story
   protects the *output layer*, not a publish-flow invariant; a formal Gherkin
   scenario attaches when the first credential-handling command lands). The
   **hard** over-mocking guardrail clause ("MUST be validated at least once
   through integration or E2E paths, never through mocks alone") **is**
   satisfied by TC-INT-001. Non-blocking.

2. **[nit] plan_code_area_coverage / system_spec_consistency** — TDR-0002 C-1
   smoke gate (Phase 1.3) runs `bun build --compile` + binary `--help` on the
   **host OS**, whereas TDR-0002's verification metric specifies a **clean OS
   image (Linux/macOS/Windows)**. Cross-OS matrix coverage is a release-
   engineering concern beyond MS-0002 MVP scope, and Phase 1 "Should" retains
   the harness under `scripts/` for CI propagation. Non-blocking for MVP; flag
   for the release gate.

3. **[nit] cross_artifact_consistency** — Spec DM-4 says exit-code numeric
   constants are "pure values importable by any tier that needs them"; the plan
   places them in `src/cli/output/exit-codes.ts` (presentation) and DEC-1
   explicitly considers/rejects `src/shared/`. Defensible (only the CLI
   entrypoint calls `process.exit`, so "any tier that needs them" =
   presentation), but the spec wording loosely implies shared-tier residence.
   Non-blocking; the plan's DEC-1 rationale closes it.

## Decision Routing

- All findings are `change`-scoped. No `system`/precedent-setting decision
  requires a new ADR: DEC-1 is a change-scoped application of the existing
  TDR-0006 / dep-cruiser rules (not a new architectural decision), exactly as
  the spec §22 ("first post-GH-15 case") describes.
- No `needs_human_input` — `Pause Required: no`. All findings have a clear,
  cheap, artifact-only fix.

## Gate Result

**NOT_READY.** 8 of 10 facets PASS. The single blocking facet is
`cross_artifact_consistency`, with `plan_coverage` co-failing on the same root
cause: the plan's `CommandResult<T>` type (Phase 2.1) contradicts the spec's
C-4 contract on two fields (`warnings` shape [Finding 1, major] and the
`timing` duration field name [Finding 2, minor]), plus DEC-label drift
[Finding 3] and a stale/incorrect scope-source note [Finding 4]. The
load-bearing DEC-1 tier split — the exact risk that failed GH-15 iter-1 — is
encoded consistently across all three artifacts and is NOT in question.

The fixes are narrow and surgical (a single plan revision pass; the spec is
the contract authority and is self-consistent; the test plan agrees with the
spec except for two "DEC-2" references that need a one-word touch). Catching
this at DoR is cheap; catching it after the F-10 contract snapshot is pinned
(Phase 7) would be exactly the silent-schema-drift failure C-4 guards
against.

## Next Steps

On `NOT_READY`, `@pm` reopens **`delivery_planning`** (Findings 1, 2, 4 are
plan-side; Finding 3 is primarily plan-side) with a minor **`test_planning`**
cleanup (Finding 3: the two TC "DEC-2" references in TC-EXIT-001 / TC-MAP-001).
Concretely:

1. Plan Phase 2.1: `warnings?: string[]` → `warnings?: Array<{ code: string;
   message: string }>` (conform to spec F-1/DM-1). **[Finding 1 — blocking]**
2. Plan Phase 2.1: rename `elapsedMs` → `durationMs` (wire `duration_ms`,
   matching spec + TC-CR-004). **[Finding 2]**
3. Plan "Binding decisions": align DEC-2..DEC-6 numbering to the spec (or add a
   cross-reference table). **[Finding 3]**
4. Test plan: update the "DEC-2" references in TC-EXIT-001 / TC-MAP-001 to the
   aligned label. **[Finding 3 — test_planning]**
5. Plan: delete/rewrite the stale "Scope-source note" (the spec exists and is
   the contract authority). **[Finding 4]**

After the plan-writer applies 1/2/3/5 and the test-plan-writer applies 4,
re-run `/check-readiness GH-16` (iteration 2). Expected: `READY` (no new
blocking contradiction should be introduced by these narrow edits; the
load-bearing architecture is already consistent).
