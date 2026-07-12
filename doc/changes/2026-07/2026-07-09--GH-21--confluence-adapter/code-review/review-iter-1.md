# Code Review — GH-21 (iteration 1)

**Date**: 2026-07-10
**Reviewer**: `@reviewer` (ADOS)
**Base → Head**: `main` → `feat/GH-21/confluence-adapter`
**Gate**: `bun run check` = **772 pass / 0 fail**; depcruiser clean (74 modules, 101 deps)
**Verdict**: **FAIL** (1 major — a spec AC clause unreachable via the port)

## Summary

The transport half of the safe-publish pipeline is delivered to a high standard.
The brand-defining safety properties are correct and proven through real HTTP
traffic (not mocks alone): the 409-conflict parse extracts the right version
numbers across multi-digit fixtures (unit + integration), 403 maps to
warn+skip with **0** delete/recreate requests observed, the no-token-leak and
no-outbound-telemetry invariants hold over captured `Bun.serve` traffic, the
dep-cruiser boundary fires on an ephemeral `src/domain/` probe, and the two
additive error arms keep `assertNeverMarkSyncError` exhaustive (typecheck green).
zod validates every Confluence response at the boundary; schema drift maps to
`RemoteUnreachable`, never a silent misparse. File headers are ≤ 3 lines,
Result discipline is clean (no throws for expected failures), and the
infrastructure→domain one-way dependency is intact.

The one major finding is a contract-level gap, not a correctness defect: the
attachment `/data` update (AC-F5-1, second clause) is implemented and unit-tested
on `AttachmentService` but is **not reachable through the `TargetSystem` port**
— the only seam downstream consumers (E4-S1/E4-S2) are specified to use. The
remaining findings are minor robustness/observability items and two nits.

## Severity breakdown

- **Blocker**: 0
- **Major**: 1
- **Minor**: 4
- **Nit**: 2

## Key themes

1. **Contract gap (AC-F5-1b)** — orphaned `/data` update capability; needs a
   decision (expose on port / fold into upload / document deferral).
2. **Observability/drift** — hardcoded `User-Agent` version; 401 misclassified
   as `RemoteUnreachable`.
3. **Robustness** — `Retry-After` HTTP-date; duplicated cross-tier types with
   no compatibility test.
4. **Test hygiene** — boundary probe leak blast radius.

## Spec / AC compliance

| AC | Status | Note |
|----|--------|------|
| AC-F1-1 (boundary) | ✅ PASS | negative probe + 0 prod breaches; port is the only seam |
| AC-F3-1 (409 parse) | ✅ PASS | correct numbers across fixtures, unit + integration |
| AC-F7-1 (403 warn+skip) | ✅ PASS | Forbidden; 0 delete/recreate observed |
| AC-F5-1 (attach dup + /data) | ⚠️ PARTIAL | 400-dup→already-exists ✅; /data update unreachable via port ❌ (finding 1) |
| AC-F4-1 (property RT) | ✅ PASS | byte-equal incl. ~8 KB |
| AC-F2-1 (429 backoff) | ✅ PASS | max 3; exhaustion→RateLimited |
| AC-F2-2 (no token leak) | ✅ PASS | 0 occurrences in captured artifacts |
| AC-F2-3 (no telemetry) | ✅ PASS | every host === baseUrl |
| AC-Q-1 (gate green) | ✅ PASS | bun run check = 772/0; typecheck exhaustive |

**8 of 9 ACs fully pass; AC-F5-1 is partially satisfied** (first clause yes,
second clause implemented-but-unreachable-via-port).

## Plan task audit

All Phase 0–8 tasks are checked (`- [x]`) and backed by corresponding code +
commits. No `OPEN_TASKS`, no `CHECKED_BUT_MISSING`. One `DONE_BUT_UNCHECKED`
nuance: `AttachmentService.update` + TC-UPD-001 exist (Phase 5 task 5.3) but are
not wired through the port assembled in Phase 6 — see finding 1.

**Status: FAIL → remediation phase required (see plan revision log / Phase 9).**
