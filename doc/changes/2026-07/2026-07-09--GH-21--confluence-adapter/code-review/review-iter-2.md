# Code Review — GH-21 (iteration 2)

**Date**: 2026-07-10
**Reviewer**: `@reviewer` (ADOS)
**Base → Head**: `main` → `feat/GH-21/confluence-adapter`
**Remediation commit under review**: `91363a5` (fix(confluence): address review iter-1 findings)
**Gate**: `bun run check` = **772 pass / 0 fail**; depcruiser clean (75 modules, 107 deps)
**Verdict**: **FAIL** (2 major — 1 carried/partial from iter-1, 1 newly re-verified; 3 minor; 1 nit)

## Delta from iteration 1

Remediation commit `91363a5` cleanly closed **6 of 7** iter-1 findings (2–7).
Finding 1 (the MAJOR, AC-F5-1b) is only **partially** resolved, and the
pre-existing security-path MAJOR (redaction duplication/drift, finding 8 — flagged
by a stale pre-remediation iter-2 draft) remains **unaddressed**. Two carry-forward
minors (9, 10), one new minor (12 — vestigial `/data` test scaffolding left by the
partial removal), and one nit (11) round out the open set.

### Iter-1 finding resolution status

| # | Iter-1 finding | Status | Evidence |
|---|----------------|--------|----------|
| 1 | MAJOR — AC-F5-1b `/data` unreachable via port | ⚠️ **PARTIAL** | Orphaned `AttachmentService.update()` + `TC-UPD-001` removed; hash-naming decision recorded in code + pm-notes. But the option-(c) **spec reconciliation was never done** — AC-F5-1 (spec L391) + ~12 refs + DEC-3 + NFR-4 + system spec still require `/data` update; AC-F5-1 as-written unmet. Plan task 9.1 itself flagged this as a deferred follow-up. |
| 2 | MINOR — hardcoded `USER_AGENT` | ✅ RESOLVED | `marksync/${pkg.version}` from `package.json` (client.ts:9,15). |
| 3 | MINOR — 401 → `RemoteUnreachable` | ✅ RESOLVED | `unreachableCause()` returns `"HTTP 401 Unauthorized (token expired?)"`; wired across pages/properties/attachments/search/restrictions. |
| 4 | MINOR — `Retry-After` HTTP-date | ✅ RESOLVED | Comment in `parseRetryAfterMs` documents the integer-seconds limitation + exponential-backoff fallback. |
| 5 | MINOR — duplicated `RenderedBody` types | ✅ RESOLVED | Cross-tier note on `port.ts` + `TC-RENDER-TYPES-001` mutual-assignability witness. |
| 6 | NIT — boundary probe leak blast radius | ✅ RESOLVED | `beforeAll`/`afterEach`/`afterAll` cleanup + `.gitignore` entry for the probe path. |
| 7 | NIT — awkward double import | ✅ RESOLVED | Single `ConfluenceClient` value import in `target.ts`. |

## Summary

The remediation is high-quality on the six findings it fully tackled — `User-Agent`
now derives from `package.json`, the 401 diagnostic is distinctive across every
service, the boundary probe is triple-guarded against leaks, and the duplicated
`RenderedBody` types now carry a compatibility test. The brand-defining safety
properties remain correct and proven: 409-conflict parsing, 403 warn+skip with 0
delete/recreate, no-token-leak / no-outbound-telemetry over captured traffic, the
dep-cruiser boundary probe, zod-at-the-boundary, and exhaustive `never`. Gate is
green (772/0; depcruiser clean). `bun run check` re-run by the reviewer confirms
the reported numbers.

Two majors block a clean pass:

1. **(iter-1, partial)** The `/data` attachment update was *removed* (option c)
   but the **spec was never reconciled**. AC-F5-1 still literally requires
   "update-via-`/data` bumps the attachment version," as do F-5, G-5, NFR-4,
   DEC-3, two spec tables, the system spec, and — confusingly — the integration
   test `TC-INT-ATT-DUP` title + mock. The hash-naming rationale is sound and the
   port is now honest, but the **contract (AC) and the implementation disagree**;
   AC-F5-1 as-written is unmet. Option (c)'s own definition required "adjust
   AC-F5-1(b) accordingly" — that step is the missing work.
2. **(re-verified)** Request/response log redaction is **duplicated inline** in
   `client.ts` (`redactLog()`, 5 ad-hoc `replace` chains) instead of routing
   through the centralized GH-16 layer, and the mirror has **already silently
   drifted** — it omits the `env-token` pattern and uses non-canonical sentinels.
   This breaks Review Priority #2 and the explicit Security checklist ("no ad-hoc
   `replace` calls"). Latent today (no-op sink; AC-F2-2 holds), but it is exactly
   the two-evolving-regex-sets failure centralized redaction (DEC-4) exists to
   prevent.

## Severity breakdown

- **Blocker**: 0
- **Major**: 2 (id 1 partial-carried; id 8 re-verified)
- **Minor**: 3 (ids 9, 10 carried; id 12 new)
- **Nit**: 1 (id 11 carried)

## Spec / AC compliance

| AC | Status | Note |
|----|--------|------|
| AC-F1-1 (boundary) | ✅ PASS | negative probe + 0 prod breaches; port is the only seam |
| AC-F3-1 (409 parse) | ✅ PASS | correct numbers across fixtures, unit + integration |
| AC-F7-1 (403 warn+skip) | ✅ PASS | Forbidden; 0 delete/recreate observed |
| AC-F5-1 (attach dup + /data) | ❌ **FAIL (as written)** | 400-dup→already-exists ✅; second clause ("update-via-/data bumps version") removed but spec unreconciled — finding 1 |
| AC-F4-1 (property RT) | ✅ PASS | byte-equal incl. ~8 KB (mock is store-and-echo — nit, finding 11) |
| AC-F2-1 (429 backoff) | ✅ PASS | max 3; exhaustion→RateLimited (shared 429/5xx budget — minor, finding 10) |
| AC-F2-2 (no token leak) | ✅ PASS* | 0 occurrences in captured artifacts; *redaction control duplicated/drifting — finding 8 — but holds today |
| AC-F2-3 (no telemetry) | ✅ PASS | every host === baseUrl |
| AC-Q-1 (gate green) | ✅ PASS | bun run check = 772/0; typecheck exhaustive; depcruiser clean |

**8 of 9 ACs pass; AC-F5-1 does NOT pass as written** (second clause unmet +
spec/impl drift). No correctness defect on the brand-defining paths; no blocker.

## Plan task audit

Phases 0–9 all checked and backed by code + commits. Phase 9 (iter-1 remediation)
task 9.1 itself records the open defer: *"Spec/doc-sync of AC-F5-1's second clause
is a `system_spec_update` / `review_fix` follow-up."* That follow-up is the
outstanding MAJOR (finding 1). A new Phase 10 is appended below for the iter-2
remediation.

## Recommended remediation (Phase 10 — Code Review Remediation, Iteration 2)

Must-fix before merge:
- **Finding 1** — reconcile the spec to current truth in one pass (rewrite
  AC-F5-1's second clause to "changed bytes → fresh create via new hash-derived
  filename"; update F-5/G-5/NFR-4/DEC-3/tables + system spec
  `feature-confluence-adapter.md:125`; promote the decision to a PDR/ADR or the
  pm-notes note). Then AC-F5-1 passes by design.
- **Finding 8** — collapse the redaction duplication to a single shared source
  (lift patterns/Redactor to a tier both infra and presentation may import), or
  minimally restore the `env-token` pattern + canonical sentinels AND add a
  compatibility test asserting parity with `DEFAULT_PATTERNS`. Stop bypassing the
  centralized layer.

Should-fix (opportunistic, same phase):
- **Finding 12** — remove the vestigial `/data` mock + retitle `TC-INT-ATT-DUP`;
  optionally add an idempotent-rerun (0-write) integration case.
- **Finding 10** — correct the `MAX_RETRIES` comment to describe the shared budget
  (or split per-status) + add a mixed 429/5xx test.
- **Finding 9** — extract the `"unknown"` magic string to a named constant /
  document id is best-effort on the unresolvable edge (lowest effort).

Nice-to-have (nit): finding 11.

**Status: FAIL → Phase 10 remediation required. Next step: EXECUTE_REMEDIATION_PHASE (CALL_CODER).**
