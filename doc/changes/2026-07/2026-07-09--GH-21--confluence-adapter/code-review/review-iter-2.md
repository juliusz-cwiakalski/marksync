# Code Review — GH-21 (iteration 2)

**Date**: 2026-07-10
**Reviewer**: `@reviewer` (ADOS)
**Base → Head**: `main` → `feat/GH-21/confluence-adapter`
**Gate**: `bun run check` = **772 pass / 0 fail**; depcruiser clean (74 modules, 101 deps)
**Verdict**: **FAIL** (2 major — 1 carried from iter-1, 1 newly found)

## Delta from iteration 1

The diff is **unchanged** since iteration 1 — no remediation was applied (the plan
has no Phase 9; `pm-notes` shows `review_fix` started but not completed). All 7
iter-1 findings therefore carry forward as **still-open**. This iteration adds
**4 new findings** (1 major, 2 minor, 1 nit) the first pass missed — the most
important being the duplicated redaction logic on the security path.

## Summary

The transport half of the safe-publish pipeline is delivered to a high standard.
The brand-defining safety properties are correct and proven through real HTTP
traffic (not mocks alone): the 409-conflict parse extracts the right version
numbers across multi-digit fixtures (unit + integration), 403 maps to warn+skip
with **0** delete/recreate requests observed, the no-token-leak and
no-outbound-telemetry invariants hold over captured `Bun.serve` traffic, the
dep-cruiser boundary fires on an ephemeral `src/domain/` probe, and the two
additive error arms keep `assertNeverMarkSyncError` exhaustive. zod validates
every Confluence response at the boundary; schema drift maps to
`RemoteUnreachable`, never a silent misparse. Result discipline is clean (no
throws for expected failures); the infrastructure→domain one-way dependency is
intact; file headers are ≤ 3 lines.

Two majors block a clean pass:

1. **(iter-1, persists)** The `/data` attachment update (AC-F5-1, second clause)
   is implemented and unit-tested on `AttachmentService` but is **not reachable
   through the `TargetSystem` port** — the only seam downstream consumers are
   specified to use.
2. **(new)** Request/response log redaction is **duplicated inline** in
   `client.ts` (ad-hoc `replace` chains) instead of routing through the
   centralized GH-16 layer, and the copy has **already silently drifted** (it
   omits the `env-token` pattern and uses different sentinels). This breaks an
   explicit repo rule ("no ad-hoc `replace` calls") and a spec clause ("route
   through the existing redaction layer"). AC-F2-2 holds today only because the
   default log sink is a no-op and the opaque `authHeader` is caught by the
   mirrored `Authorization:`/`Basic` patterns.

The remaining findings are minor robustness/observability/contract items and nits.

## Severity breakdown

- **Blocker**: 0
- **Major**: 2 (id 1 carried; id 8 new)
- **Minor**: 6 (ids 2, 3, 4, 5 carried; ids 9, 10 new)
- **Nit**: 3 (ids 6, 7 carried; id 11 new)

## Key themes

1. **Contract completeness (AC-F5-1b)** — orphaned `/data` update; needs a
   decision (expose on port / fold into upload / document deferral). *(iter-1)*
2. **Security-defense-in-depth** — duplicated, already-drifted redaction bypassing
   the centralized layer; dormancy hides the gap today. *(new)*
3. **Observability/drift** — hardcoded `User-Agent`; 401 misclassified as
   `RemoteUnreachable`. *(iter-1)*
4. **Robustness** — fabricated attachment id on an edge case; shared 429/5xx retry
   budget undocumented + mixed-status untested; `Retry-After` HTTP-date;
   duplicated cross-tier types with no compatibility test.
5. **Test hygiene** — boundary probe leak blast radius; store-and-echo property RT
   mock.

## Spec / AC compliance

| AC | Status | Note |
|----|--------|------|
| AC-F1-1 (boundary) | ✅ PASS | negative probe + 0 prod breaches; port is the only seam |
| AC-F3-1 (409 parse) | ✅ PASS | correct numbers across fixtures, unit + integration |
| AC-F7-1 (403 warn+skip) | ✅ PASS | Forbidden; 0 delete/recreate observed |
| AC-F5-1 (attach dup + /data) | ⚠️ PARTIAL | 400-dup→already-exists ✅; /data update implemented but unreachable via port ❌ (finding 1) |
| AC-F4-1 (property RT) | ✅ PASS | byte-equal incl. ~8 KB |
| AC-F2-1 (429 backoff) | ✅ PASS | max 3; exhaustion→RateLimited |
| AC-F2-2 (no token leak) | ✅ PASS* | 0 occurrences in captured artifacts; *redaction control is duplicated/drifting — finding 8 — but holds today |
| AC-F2-3 (no telemetry) | ✅ PASS | every host === baseUrl |
| AC-Q-1 (gate green) | ✅ PASS | bun run check = 772/0; typecheck exhaustive |

**8 of 9 ACs fully pass; AC-F5-1 is partially satisfied** (first clause yes,
second clause implemented-but-unreachable-via-port). No BLOCKER; no correctness
defect on the brand-defining paths.

## Plan task audit

All Phase 0–8 tasks are checked (`- [x]`) and backed by corresponding code +
commits. No `OPEN_TASKS`, no `CHECKED_BUT_MISSING`. One `DONE_BUT_UNCHECKED`-
adjacent nuance: `AttachmentService.update` + TC-UPD-001 exist (Phase 5 task 5.3)
but are not wired through the port assembled in Phase 6 — finding 1. No Phase 9
remediation phase exists yet.

## Recommended remediation (Phase 9 — Code Review Remediation, Iteration 2)

Must-fix before merge:
- **Finding 1** — resolve the `/data`-update reachability decision (record a PD/DEC).
- **Finding 8** — collapse the redaction duplication to a single shared source of
  truth (or add a compatibility test + restore the missing `env-token` pattern);
  stop bypassing the centralized layer.

Should-fix (opportunistic, same phase):
- Findings 2, 3, 9, 10 (User-Agent drift guard; 401 diagnostic; fabricated
  attachment id; document/test the shared retry budget).

Nice-to-have (nits): findings 4, 5, 6, 7, 11.

**Status: FAIL → Phase 9 remediation required. Next step: EXECUTE_REMEDIATION_PHASE (CALL_CODER).**
