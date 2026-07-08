---
# Copyright (c) 2025-2026 Juliusz Ćwiąkalski (https://www.cwiakalski.com | https://www.linkedin.com/in/juliusz-cwiakalski/ | https://www.x.com/cwiakalski)
# MIT License - see LICENSE file for full terms
id: chg-GH-17-readiness-iter-1
status: complete
created: 2026-07-08T23:38:00Z
reviewer: readiness-reviewer
work_item: GH-17
iteration: 1
verdict: NOT_READY
pause_required: false
---

# Readiness Review Iteration 1

Verdict: NOT_READY
Work Item: GH-17
Date: 2026-07-08
Pause Required: no

## Facet Summary

- spec_completeness: PASS
- ac_quality: PASS
- plan_coverage: FAIL
- test_traceability: FAIL
- cross_artifact_consistency: FAIL
- decision_capture: PASS
- system_spec_consistency: FAIL
- plan_doc_update_coverage: PASS
- plan_code_area_coverage: PASS
- dod_defined: PASS

## Blocking Findings (MUST-FIX before delivery)

### 1. [critical] cross_artifact_consistency / test_traceability — test-plan#§5.2 + §3.1 + §7

**Gap:** The test plan is built on the **explicitly rejected** four-top-level-arms union
shape, contradicting DEC-2 as settled identically and independently in the spec, the plan,
AND the PM notes.

- **Spec DEC-2** (chg-GH-17-spec.md L293), **DM-2** (L210), **F-3** (L113), **Appendix B**
  (L393): ONE `{ kind: "Auth"; authKind: …; …payload }` arm; "union grows 13 → 14 (one
  arm), **not 13 → 17**".
- **PM notes DEC-2** (chg-GH-17-pm-notes.yaml L23): "single new arm `{kind:'Auth';
  authKind:…}` … union 13→14, **not 17**".
- **Plan DEC-2** (chg-GH-17-plan.md L48, L119, L142): one `Auth` arm (13→14).
- **Test plan** (chg-GH-17-test-plan.md): assumes FOUR arms and union **13 → 17** —
  - L70 / L164 / L184: "the 4 new arms/kinds of the exhaustive MarkSyncError union";
  - L325, L357, L387, L414: `error.kind === "MissingCredentials"`;
  - L444, L475: `error.kind === "InvalidBaseUrl"`;
  - L595, L624: `error.kind === "InvalidCredentials"`;
  - L688: `error.kind === "AuthUnreachable"`;
  - L785: "Assert the table now covers exactly the full kind set (**13 + 4 = 17**)";
  - L1030: "Existing – Update (**13 → 17 kinds**)".

Under the chosen DEC-2 shape, `error.kind === "Auth"` for every auth failure — every
`error.kind === "MissingCredentials"` assertion in the test plan would **fail** against the
delivered code, and the "13+4=17" exhaustiveness assertion is wrong (it is 13+1=14). A coder
cannot execute the test plan as written; it guarantees rework.

**Root cause:** the test plan predates the spec (its own frontmatter L14 + §3.1 + OQ-TP-3
still state "no `chg-GH-17-spec.md` yet"). The reconciliation the test plan promised in
OQ-TP-3 ("Reconcile when the spec lands; update the coverage tables") was never performed
even though the spec has landed (437 lines, status Proposed, pm-notes `specification:
completed 23:33`).

**Suggested remediation target phase:** test_planning
**Suggested fix:** Rewrite the test plan to the DEC-2 single-arm shape: every auth error is
`{ kind: "Auth"; authKind: "…" }` (flat, per spec) — assert `error.kind === "Auth"` and
`error.authKind === "MissingCredentials"|…`; correct "13+4=17" → "13+1=14" everywhere
(TC-ERRMAP-001 step 3, §7 automation row, §1.1, DM-AUTH-2). Reconcile the provisional
`F-AUTH-*` codes against the spec's F-1..F-6 / AC-F*-* codes (OQ-TP-3 closure).

---

### 2. [major] cross_artifact_consistency / plan_coverage — spec#F-2+DEC-5+RSK-6 vs plan#Open-Questions + test-plan#TC-VALIDATE

**Gap:** The v1 `user/current` fallback is **in scope + claimed tested** in the spec, but
**deferred** in the plan and **untested** in the test plan — so the spec's own risk
mitigation (RSK-6) is unmet.

- **Spec F-2** (L111): "Issues `GET /wiki/api/v2/user/by-me` (primary), **falling back to
  the v1 `user/current` endpoint if v2 is unavailable**";
- **Spec DEC-5** (L296): "v2 `user/by-me` primary, **v1 `user/current` fallback** …";
- **Spec RSK-6** (L253): mitigation = "Probe falls back to v1 `user/current` (F-2); **both
  paths are exercised against the `Bun.serve` mock in integration**";
- **Spec §8.1** (L197) + DM (L218): v1 endpoint listed as a consumed (fallback) endpoint.
- **Plan Open Questions** (L189–191): "the v1 `user/current` **fallback is deferred** (v2 is
  the guaranteed MS-0002 path per the spike)";
- **Test plan TC-VALIDATE-001..007**: no v1-fallback scenario;
- **Plan Phase 4 TC-INT-AUTH-001..006**: no v1-fallback scenario.

The coder following the plan would ship **no** v1 fallback and **no** v1 test, directly
contradicting spec F-2/DEC-5 and leaving RSK-6's stated mitigation ("both paths exercised")
unverified.

**Suggested remediation target phase:** delivery_planning (+ specification if v1 is to be
genuinely dropped rather than built)
**Suggested fix:** Reconcile the authoritative reading of the story's "`GET /wiki/api/v2/
user/by-me` (or v1 `user/current`)". Either (a) plan builds v1 fallback + adds an
integration TC for "v2 unavailable → v1 fallback → identity" so RSK-6 holds, or (b) the spec
is revised to defer v1 (move F-2/DEC-5/RSK-6/§8.1 v1 rows to Deferred) and the story's "(or
v1)" is re-read as "v2 only for MS-0002". The two artifacts must agree before delivery.

## Non-Blocking Findings (should-fix; do not gate delivery)

### 3. [major→mitigated] system_spec_consistency / plan_code_area_coverage — plan#Constraints (L253–262) + Phase 2/6 AC vs `.dependency-cruiser.cjs`

**Gap:** The plan repeatedly asserts that `check:boundaries` **enforces** DEC-1
("`src/app/credentials.ts` imports `#domain/*` only — never `#infra/*`") and the "app may
not import cli" rule. The **actual** `.dependency-cruiser.cjs` ships only **4** rules:
`domain→infra`, `domain→app`, `cli→domain`, `cli→infra`. There is **no** `app-may-not-import-
infra` rule and **no** `app-may-not-import-cli` rule (the 9-rule snippet in
`.ai/rules/typescript.md` §"Import-boundary enforcement" is aspirational, not the live
config). So `check:boundaries` would NOT catch an `#infra/*` import in
`src/app/credentials.ts`; only the manual `rg '#infra' src/app/credentials.ts` grep (plan
tasks 2.2 / 6.1) actually guards DEC-1.

Mitigated: the `rg` guard IS present in the plan's task list, so the invariant is enforceable
if the coder runs it. But the plan's characterization ("`check:boundaries` runs every phase
so the dep-cruiser invariant holds", Phase 1 AC "`check:boundaries` clean — DEC-1") overstates
what dep-cruiser currently enforces and could mislead a coder into trusting `check:boundaries`
alone.

**Suggested remediation target phase:** delivery_planning
**Suggested fix:** Correct the plan's enforcement wording: state plainly that the app→infra
(app→cli) direction is NOT yet a dep-cruiser rule and that the `rg '#infra'
src/app/credentials.ts → empty` check (tasks 2.2/6.1) is the load-bearing DEC-1 guard for
this story. (Separately, consider a repo-wide follow-up to add the missing dep-cruiser rules —
out of scope for GH-17.)

### 4. [minor, resolved-by-PM] cross_artifact_consistency — plan#DEC-2 table (L134–139) + tasks 1.3/1.4/D-4 vs spec#DM-4/Appendix-B

**Gap:** `error.code` string divergence. Spec DM-4 (L212) + Appendix B (L388–391) +
§22 (L353) + DEC-2 (L293) use **`AUTH_`-prefixed** codes (`AUTH_MISSING_CREDENTIALS`,
`AUTH_INVALID_BASE_URL`, `AUTH_INVALID_CREDENTIALS`, `AUTH_UNREACHABLE`). The plan's DEC-2
table (L136–138) and actionable tasks 1.3 (L379–386), 1.4 (L395–396), D-4 (L212–213) instruct
the coder to write **unprefixed** keys (`MISSING_CREDENTIALS`, `INVALID_BASE_URL`,
`INVALID_CREDENTIALS`). PM notes (L25) endorse the spec's prefixed codes as authoritative.

Per review brief: this does NOT cause non-compiling tests (codes are runtime string values;
TC-ERRMAP-001/002 pin "whatever is chosen"). It is therefore **resolved-by-PM**. However, a
coder executing the plan's task 1.4 verbatim would write unprefixed keys into `CODE_TO_EXIT`,
producing a **contract** that diverges from the spec/PM-endorsed prefixed codes — so the plan
text should be synced to the spec.

**Suggested remediation target phase:** delivery_planning
**Suggested fix:** Update the plan's DEC-2 table + tasks 1.3/1.4/D-4 to the `AUTH_`-prefixed
codes so the plan's instructions match the contract the spec and PM settled on.

### 5. [minor] plan executability — plan#task 2.2 vs plan#DEC-2 type (L122–126)

**Gap:** Internal plan ambiguity on `AuthErrorDetail.AuthUnreachable.cause`. The DEC-2 type
listing (L126) declares `{ authKind: "AuthUnreachable"; cause: string }` (a stored field),
but task 2.2 says the error is built with "`cause: <redacted/omitted>`". The coder cannot
tell whether `cause` is a retained field or omitted. (The Phase-5 INV-SEC-1 capture-and-grep
would catch any token-shaped leak in `cause`, so this is not security-blocking.)

**Suggested remediation target phase:** delivery_planning
**Suggested fix:** Decide once: either drop `cause` from the `AuthUnreachable` arm (matching
"omitted") or keep it but specify it holds a redacted/generic transport label (never raw
fetch text). Align the type listing and task 2.2.

### 6. [nit] spec_completeness — spec#F-1/G-1/DEC-1 vs plan#task 2.2

**Gap:** `resolveCredentials` performs **no network I/O** (env read + base64 + mask), yet
both spec DEC-1/F-5 and plan task 2.2 give it an injectable `fetch` param via
`AuthProviderOptions`. The `fetch` is unused on the resolve path. Spec↔plan are consistent,
so this is not a contradiction — just an unnecessary surface.

**Suggested remediation target phase:** specification
**Suggested fix:** Consider restricting `AuthProviderOptions { fetch? }` to
`validateCredentials` only (resolveCredentials has no network seam to inject). Optional.

## What passes (confirmation)

- **spec_completeness / ac_quality / dod_defined:** All 6 story ACs are present, testable,
  non-overlapping, and mapped to spec AC-F1-1..AC-F3-1 + Appendix-A traceability; DoD is
  explicitly "the 6 ACs" (spec §17 / story DoD). Scope IN/OUT is crisp (keytar/OAuth/PAT/
  scoped/`--token-file`/doctor-UI/adapter all explicitly OUT).
- **decision_capture:** DEC-1..DEC-5 captured in spec §15; PM notes capture DEC-1/DEC-2 and
  the PM-resolved code-prefix decision. Routed correctly (all are change-scoped technical
  decisions; no precedent-setting item requires an ADR).
- **plan_doc_update_coverage:** Plan Phase 6.3 + spec §18 explicitly enumerate the docs to
  update at lifecycle phase 7 (`feature-cli.md` §3.3, `security-baseline.md`,
  `ubiquitous-language.md`, `nonfunctional.md` NFR-SEC-6, `typescript.md` error-handling).
- **plan_code_area_coverage:** All affected code areas are named per phase: `errors.ts`,
  `cli-error-map.ts`, `exit-codes.ts` (the three exhaustive sites), new
  `src/domain/credentials.ts` + `src/app/credentials.ts`, and the test files — blast radius
  is explicit. Phase 1's atomic-exhaustiveness ordering constraint is correct (GH-15
  precedent verified against the live `errors.ts`/`cli-error-map.ts`/`exit-codes.ts`).
- **Security (INV-SEC-1):** Secret isolation is **structural**, not convention-only —
  `ConfluenceCredentials` carries only `{ baseUrl; authHeader(opaque); email(masked);
  mode }`; the raw token is a local variable consumed by base64 and never a field
  (spec F-4/DEC-3; plan RSK-1). INV-SEC-1 is validated at **Integration** level via real
  captured serialized output (test-plan TC-SEC-001 + plan Phase 5), NOT mock-only — honoring
  the testing-strategy over-mocking guardrail (TDR-0004). The "no token in any captured
  output" assertion is concrete: a distinctive fake token
  (`ATATT3xFfGF0SECRET_TOKEN_VALUE_x9`) grepped across every `CommandResult` JSON + error
  message string. Tier placement is correct (Unit for resolve/masking/header; Integration
  `Bun.serve` for validate). `EXIT_AUTH = 20` and the `ConfigError = Extract<…>` narrowed-
  channel precedent both confirmed against live source.

## Next remediation targets (reopen)

1. **test_planning** — rewrite test plan to DEC-2 single-arm shape (Finding 1, critical).
2. **delivery_planning** — reconcile v1 fallback scope with the spec (Finding 2); correct
   dep-cruiser enforcement wording (Finding 3); sync error.code prefix to spec (Finding 4);
   resolve `cause` ambiguity (Finding 5).
3. *(optional)* **specification** — narrow `fetch` to `validateCredentials` (Finding 6, nit).

Re-run this gate after the test plan and plan are reconciled. Cap re-runs at ~3 iterations;
escalate to the human on stalemate.
