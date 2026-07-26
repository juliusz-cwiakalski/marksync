---
# Copyright (c) 2025-2026 Juliusz Ćwiąkalski (https://www.cwiakalski.com | https://www.linkedin.com/in/juliusz-cwiakalski/ | https://www.x.com/cwiakalski)
# MIT License - see LICENSE file for full terms
id: TDR-0009
decision_type: tdr
status: Proposed
created: 2026-07-15
decision_date: null
last_updated: 2026-07-15
summary: "Doctor's non-zero exit (any check `fail`) uses a NEW dedicated exit class `EXIT_HEALTH = 60` with stable code string `DOCTOR_FAIL` — not a reused class. Doctor aggregates many check types (auth/config/Git/network/permissions), so no single existing class honestly describes 'a health check failed'; a dedicated, additive class avoids conflation and fits the tens-scheme. Reusing EXIT_CONFIG(10) mischaracterizes non-config failures; reusing EXIT_INTERNAL(99) pollutes the catch-all with an expected, structured failure."
owners:
  - Juliusz Ćwiąkalski
service: marksync-cli
decision_scope: repo
review_date: null
business_impact: "Indirect: enables reliable CI pre-flight gating (`marksync doctor && marksync sync`) with an honest, non-conflated exit code; no runtime effect beyond the documented exit-code contract."
customer_impact: "CI/agents keying on exit codes can distinguish 'a health check found a problem' from every domain error class (config/auth/conflict/invariant/internal); no breaking change to existing consumers (additive)."
classification:
  domains: [operations, observability]
  archetype: design
  environment: clear
  rigor: R2
  reversibility: moderate
  stakes: low
  urgency: medium
  uncertainty: low
  blast_radius: local
  recurrence: one-off
governance:
  driver: decision-advisor
  decider: Juliusz Ćwiąkalski
  contributors: ["pm (DEC-4 design point)", "spec-writer (GH-30 spec)"]
  reviewers: [Juliusz Ćwiąkalski]
  performers: ["coder (GH-30 delivery — implements exit-codes.ts; this record only chooses the value)"]
  informed: []
ai_assistance:
  used: true
  roles: [analyst, record-writer]
  external_data_shared: false
  citations_verified: true
  human_decider: null
  reviewers: []
revisit_triggers:
  - "A second command needs the same 'succeeded with a report but CI should gate' semantics — generalize the class name/policy rather than per-command codes (consider whether EXIT_HEALTH stays doctor-specific or becomes a shared 'diagnostic-fail' class)."
  - "The exit-code contract is bumped (SCHEMA/contract major version) — reconfirm 60 is still the right slot and that DOCTOR_FAIL still resolves through CODE_TO_EXIT."
  - "An external consumer reports that exit 60 collides with a shell/CI convention we did not anticipate — reconfirm the numeric."
links:
  related_changes: ["GH-30"]
  supersedes: []
  superseded_by: []
  spec:
    - "doc/changes/2026-07/2026-07-15--GH-30--doctor-health-check/chg-GH-30-spec.md"
  contracts:
    - "src/cli/output/exit-codes.ts"
    - "src/cli/output/command-result.ts"
    - "src/app/cli-error-map.ts"
  diagrams: []
  decisions: ["ADR-0011"]
  experiments: []
  metrics: []
  roadmap_items: ["MS-0002"]
---

# TDR-0009: Doctor health-check exit code — dedicated `EXIT_HEALTH` (60) / `DOCTOR_FAIL`

## Context

`marksync doctor` (GH-30, `[MS2-E5-S2]`) replaces the current `doctor` **stub** (which returns an `INTERNAL` error → exit 99) with a real pre-flight health check. It aggregates many independent checks — Git availability, config validity, credential resolution + validation, base-URL/space reachability, parent-page existence/writability, (opt-in) capability probes, plus `warn`-only advisories (permission/visibility, renderer). Each check yields `{ check, status, detail, fix? }` assembled into a structured `CommandResult<DoctorReport>`.

CI must be able to gate on doctor: `marksync doctor && marksync sync`. That requires doctor to **exit non-zero when any gating check reports `fail`** — while **still carrying `data=DoctorReport`** in the envelope (a health report is useful even when a check fails; `--json` must show it).

**The mechanism is already decided (DEC-4 in the GH-30 spec; do NOT revisit here):** doctor constructs `CommandResult<DoctorReport>` **directly** — not via `ok()` (which hardcodes `exitCode: 0`) nor via `err()` (which produces `CommandResult<never>` with no `data`). `data` is always the report; `error` is never set; `exitCode` is derived from the report's worst status. See Appendix B of the spec for the resolution table.

The **open question (OQ-1)** — the sole subject of this record — is: **what numeric exit code + stable code string should doctor use for the non-zero (failure) case?** That choice touches the shared, documented exit-code contract, so it is recorded here.

Relevant facts from the codebase (FACT, all verified 2026-07-15):

- **FACT:** `src/cli/output/exit-codes.ts` documents a **9-class** exit-code set: `EXIT_OK`(0), `EXIT_USAGE`(2), `EXIT_CONFIG`(10), `EXIT_AUTH`(20), `EXIT_CONFLICT`(30), `EXIT_REMOTE_MISSING`(40), `EXIT_INVARIANT`(50), `EXIT_RENDER_UNAVAILABLE`(70), `EXIT_INTERNAL`(99). The set is "documented but extensible": `codeToExitCode()` falls back to `EXIT_INTERNAL`(99) for any unknown code, and several codes already use 99 as a best-fit catch-all (`UNSUPPORTED_CONSTRUCT`, `TOO_LARGE`, `UNRESOLVED_LINK`, `RATE_LIMITED`, `REMOTE_UNREACHABLE`, `INTERNAL`).
- **FACT:** The stable contract is the `code` **string** (DEC-6 — machine consumers key on `code`, not the numeric). The numeric is secondary but documented and consumed by shell-level CI gating (`$?`).
- **FACT:** Doctor does **not** flow through `mapMarkSyncErrorToCommandError` (`src/app/cli-error-map.ts`) — it builds `CommandResult` directly. Therefore `DOCTOR_FAIL` would be a new code string that lives **only** in `CODE_TO_EXIT`, not in the error-kind→code mapper and not as a `MarkSyncError.kind`.
- **FACT:** `60` is an unused tens-slot in the scheme (between `EXIT_INVARIANT`=50 and `EXIT_RENDER_UNAVAILABLE`=70). The scheme is categorical, not strictly severity-ordered (e.g. `RENDER_UNAVAILABLE`=70 is arguably less severe than `CONFLICT`=30).
- **FACT:** The AC-load-bearing mapping is only `Conflict → CONFLICT → 30` (AC-6 / NFR-OBS-1). Any additive code is safe as long as it does not reclassify that mapping.

## Problem Framing (Clarified)

The mechanism (how doctor produces a non-zero exit while keeping `data`) is settled. The remaining question is a **contract-naming** problem: which exit class should represent *"the command succeeded at producing a report, but a health check found a problem so CI should gate"*?

Doctor is unlike every other command's failure mode. Other commands fail with a **single** typed `MarkSyncError` (one kind → one honest exit class: auth→20, config→10, conflict→30, …). Doctor **aggregates many check types into one report**; its non-zero exit is not "one domain error" but "at least one of N heterogeneous preconditions is unmet." Therefore no single existing class — auth, config, conflict, invariant, remote-missing, render, or internal — honestly describes it. The decision is whether to (a) introduce a dedicated class for this aggregate semantics, or (b) overload an existing class and accept the mischaracterization on the non-matching checks.

Separating facts from assumptions:

- **FACT:** Reusing `EXIT_CONFIG`(10) is honest *only* when the failing check is `config-valid`; for `credentials` (auth), `space-access` (network/forbidden), `git-available` (prereq), or `parent-page` (topology), exit 10 mischaracterizes the failure.
- **FACT:** Reusing `EXIT_INTERNAL`(99) routes an *expected, structured, diagnosed* failure through the class reserved for *unexpected* throws — and 99 is already a multi-code catch-all, so adding `DOCTOR_FAIL` there further erodes its meaning.
- **ASSUMPTION:** No external (non-MarkSync) tooling today depends on doctor's exit code (it is currently a stub returning 99). The exit-code contract is internal to this CLI and pre-release (MS-0002). Impact-if-false: low — changing the numeric later is an additive/reclassifying contract bump, cheap before release.

## Constraints (Hard Requirements)

Most gates are **table-stakes** that every alternative already satisfies: the chosen code must be registered in `CODE_TO_EXIT` (so doctor resolves via the single `codeToExitCode()` path — no parallel exit-resolution mechanism, per DEC-1/DEC-2 architecture), must not reclassify the AC-load-bearing `CONFLICT → 30` mapping (AC-6), and must keep `error` unset / `data=DoctorReport` present (the fixed DEC-4 mechanism). Two non-trivial gates remain:

### C-1: Non-zero on any `fail`; zero on no `fail`

- **Statement:** When at least one gating check has status `fail`, the process exit code is non-zero; when zero checks are `fail`, the exit code is `0` (EXIT_OK).
- **Source:** AC-F7-1, NFR-OBS-1 (stable exit codes), the CI-gating requirement (`doctor && sync`).
- **Verification:** Unit/integration tests assert `exitCode === 0` on an all-pass/warn/skipped report and `exitCode !== 0` when any gating check is `fail` (GH-30 test matrix).
- **Negotiable:** no.

### C-2: Resolvable through the single `codeToExitCode()` path

- **Statement:** Doctor's non-zero exit must be produced by resolving a stable `code` string through the existing `CODE_TO_EXIT` map + `codeToExitCode()` (i.e. doctor sets `exitCode: codeToExitCode("<code>")`), not by hardcoding a magic numeric or introducing a parallel resolution path.
- **Source:** DEC-1/DEC-2 architecture (one exit-resolution site); DEC-6 (the `code` string is the stable contract).
- **Verification:** `codeToExitCode("<chosen code>")` returns the documented numeric; doctor's `CommandResult.exitCode` equals that value; `CODE_TO_EXIT` contains the entry.
- **Negotiable:** no.

## Decision Drivers

(Prioritized; continuous preferences used to rank the eligible alternatives.)

**Technical drivers:**

1. **Contract honesty / no conflation (highest).** Doctor aggregates many check types; the exit class should not imply a single domain (config/auth/conflict/…) that mischaracterizes the *actual* failing check. Honest contracts reduce operator confusion and silent misclassification (spec RSK-4).
2. **CI/agent distinguishability.** Consumers keying on the numeric (shell `$?`, CI matrix) must distinguish "config broken" (a real `INVALID_CONFIG` during a command) from "doctor found a pre-flight problem." Overloading an existing numeric destroys that signal at the shell layer.
3. **Additive-contract discipline.** The exit-code set is a documented stable contract (NFR-OBS-1, DEC-2). Extending it additively (new class) is preferable to overloading an existing class's semantics; the set already self-describes as extensible (unknown → 99 fallback).
4. **Fit with the existing tens-scheme.** The numeric should occupy an unused categorical slot and not collide with a documented class.

**Counter-driver:**

5. **Minimal contract surface.** Fewer documented classes = less to maintain. Reusing keeps the set at 9. (This is the sole appeal of Option B; it is real but lower-weight than honesty/distinguishability for a contract whose entire purpose is machine-readable failure classification.)

## Decision Rights (DACI)

- **Driver:** `@decision-advisor` (this process).
- **Decider / Approver:** Juliusz Ćwiąkalski (owner). R2 — AI does **not** auto-Accept; the human Accepts at PR review/merge (`status: Proposed` on this feature branch → `Accepted` on merge).
- **Contributors:** PM (flagged the DEC-4 design point); spec-writer (GH-30 spec author).
- **Required reviewers:** Juliusz Ćwiąkalski (tech lead / solo owner).
- **Performers:** `@coder` (GH-30 delivery — implements `exit-codes.ts`; this record only chooses the value, it does not modify source).
- **Informed:** none beyond the change stakeholders.

## Evidence, Assumptions & Unknowns

| Item | Label | Source | Impact if false | Confidence |
|------|-------|--------|-----------------|------------|
| 9-class exit set; 60 is an unused tens-slot; unknown codes fall back to 99 | FACT | `src/cli/output/exit-codes.ts` (read 2026-07-15) | n/a (foundational) | High |
| The `code` string is the stable machine contract (DEC-6); numeric is secondary but documented | FACT | `exit-codes.ts` comments, `command-result.ts`, DEC-6 | n/a (foundational) | High |
| Doctor builds `CommandResult` directly and does not use the error-kind→code mapper | FACT | spec DEC-4 / F-7; `cli-error-map.ts` (mapper covers `MarkSyncError.kind` only) | n/a | High |
| No external consumer depends on doctor's exit code today (stub → 99) | ASSUMPTION | doctor is a stub pre-GH-30; contract is internal, pre-release | Low — changing the numeric later is a cheap, additive contract bump before MS-0002 release | High |
| Reusing EXIT_CONFIG(10) for an auth/network/Git failure misleads shell-level CI | FACT (by construction) | the documented semantics of class 10 = "config" | n/a | High |
| Reusing EXIT_INTERNAL(99) erodes the catch-all's "unexpected throw" meaning | FACT (by construction) | 99 = "internal/unexpected"; doctor fail is expected + structured | n/a | High |

No external research is required (no library/vendor selection). All evidence is local to the repo.

## Mental Models & Techniques Used

- **First Principles:** What is the irreducible semantics of doctor's non-zero exit? "The command succeeded at producing a report, but ≥1 precondition is unmet." That is neither "a domain error" (single kind) nor "an unexpected throw." It is its own class — a *diagnostic/health* failure aggregating heterogeneous checks. Naming it honestly is the whole decision.
- **Inversion:** "How does this contract fail a CI/agent?" → (a) reusing `10` makes `marksync doctor` indistinguishable from a real config error in a CI matrix that greps `$?`; (b) reusing `99` makes a *diagnosed, expected* failure indistinguishable from a crash, and further crowds the catch-all; (c) a dedicated honest class avoids both. Inversion points squarely at a new class.
- **Second-Order Thinking:** Adding a class extends the documented set (9→10). Second order: that is the *point* of an extensible, documented contract — and it is additive, so no existing consumer's handling changes. The maintenance cost of one more documented constant is negligible next to the confusion cost of an overloaded class.
- **Opportunity Cost:** The cost of Option A is "one more line in `CODE_TO_EXIT` + one paragraph of docs." The cost of Option B is "permanently misleading exit codes on every non-config doctor failure." The trade is clearly in A's favor.
- **KISS:** A single dedicated numeric + one code string is simpler than overloading semantics and reasoning about "which checks does 10 honestly cover."

## Alternatives Considered

### Per-Alternative Constraint-Compliance Evaluation

Legend: ✅ = passes · ❌ = fails · ⚠️ = passes only via an accepted-risk exception (constraint must be `Negotiable: yes`).

|          | C-1 (non-zero on fail) | C-2 (resolvable via `codeToExitCode`) |
|----------|------------------------|----------------------------------------|
| Alt 0 — Do nothing (stub returns `INTERNAL`→99) | ❌ (no `data=DoctorReport`; not the real command) | n/a |
| Alt 1 — `EXIT_HEALTH`=60 / `DOCTOR_FAIL` (new class) | ✅ | ✅ |
| Alt 2 — reuse `EXIT_CONFIG`=10 | ✅ | ✅ |
| Alt 3 — reuse `EXIT_INTERNAL`=99 / `DOCTOR_FAIL` | ✅ | ✅ |

C-1 and C-2 are satisfied by every substantive alternative; the table-stakes gates (additive vs `CONFLICT→30`; `error` unset / `data` present) are likewise satisfied by all three. **This decision is therefore driver-driven, not elimination-driven** — the alternatives diverge on Driver #1 (honesty), #2 (distinguishability), and #5 (minimal surface).

### Alternative 0 — Do Nothing / keep the stub

- **Eligibility:** Not eligible (fails C-1 — the stub returns `INTERNAL`→99 with no `DoctorReport`; it is not the real command).
- **Summary:** Leave `doctor` as the unimplemented stub.
- **Why rejected:** GH-30's entire purpose is to implement doctor. Included only as the do-nothing baseline.

### Alternative 1 — New dedicated class `EXIT_HEALTH` = 60, code `DOCTOR_FAIL` (RECOMMENDED)

- **Eligibility:** Eligible (passes C-1, C-2, and all table-stakes gates).
- **Summary:** Add `export const EXIT_HEALTH = 60;` and register `DOCTOR_FAIL: EXIT_HEALTH` in `CODE_TO_EXIT`. Doctor sets `exitCode: codeToExitCode("DOCTOR_FAIL")` when any gating check is `fail`. Additive — no existing code reclassified; the AC-load-bearing `CONFLICT→30` is untouched.
- **Constraint compliance:** C-1 ✅; C-2 ✅; `CONFLICT→30` untouched ✅.
- **Driver fit:** Best. Driver #1 (honesty): a health-check failure is its own semantic class — no mischaracterization. Driver #2 (distinguishability): shell/CI consumers see a numeric distinct from every domain error. Driver #3 (additive discipline): purely additive. Driver #4 (tens-scheme fit): 60 is a clean unused slot between INVARIANT(50) and RENDER_UNAVAILABLE(70). Driver #5 (minimal surface): the only driver it loses — one more documented class — and that cost is negligible here.
- **Pros:** Honest; non-conflating; additive (zero breaking change); fits the scheme; matches the spec's own terminology (`EXIT_HEALTH` is used consistently in DEC-4 / F-7 / Appendix B / NFR-OBS-1 / glossary).
- **Cons:** Extends the documented 9-class set to 10 — one more constant + doc line to maintain.
- **Why chosen:** It is the only option that keeps the contract honest across *all* doctor failure modes (auth, config, Git, network, permissions, topology). The maintenance cost of one additive class is trivial next to the permanent confusion of an overloaded class.

### Alternative 2 — Reuse `EXIT_CONFIG` = 10

- **Eligibility:** Eligible (passes C-1, C-2). (Two sub-variants: map a new `DOCTOR_FAIL`→10, or surface the failing check's own code, e.g. `INVALID_CONFIG`/`AUTH_*`. Either way the numeric is 10 or another existing class's numeric.)
- **Summary:** Doctor's non-zero exit resolves to an existing class — most naturally `EXIT_CONFIG`(10), since config is the "closest" precondition.
- **Constraint compliance:** C-1 ✅; C-2 ✅.
- **Driver fit:** Weak. Driver #1 (honesty): **fails for every non-config check** — when `credentials`, `space-access`, `git-available`, or `parent-page` fails, exit 10 ("config") mischaracterizes it. Driver #2 (distinguishability): a CI matrix cannot tell "config broken during sync" from "doctor found a pre-flight problem." Driver #5 (minimal surface): the one driver it wins — keeps the set at 9.
- **Pros:** No new exit class; the documented set stays at 9.
- **Cons:** Misleading on the majority of doctor failure modes (most checks are *not* config); destroys CI/agent distinguishability at the shell layer; the DEC-6 defense ("consumers key on `code`, not numeric") does not help shell-level `$?` gating.
- **Why rejected:** The honesty and distinguishability drivers dominate the minimal-surface counter-driver for a contract whose purpose is machine-readable failure classification. Reusing 10 trades a one-line maintenance saving for permanent mischaracterization.

### Alternative 3 — Reuse `EXIT_INTERNAL` = 99 with code `DOCTOR_FAIL`

- **Eligibility:** Eligible (passes C-1, C-2). This is the variant the task prompt flagged for explicit consideration ("reusing 99 with a distinct code string").
- **Summary:** Register `DOCTOR_FAIL: EXIT_INTERNAL` so the `code` string carries the precise semantics (satisfying DEC-6 machine consumers) while the numeric stays within the existing catch-all.
- **Constraint compliance:** C-1 ✅; C-2 ✅.
- **Driver fit:** Mixed-to-weak. Driver #1 (honesty): 99 is documented as "internal/**unexpected** throw" — but a doctor fail is *expected and structured* (a diagnosed report with suggested fixes). Routing an expected failure through the "unexpected" class is a real, different conflation. Driver #2 (distinguishability): 99 is already the best-fit home for six codes (`UNSUPPORTED_CONSTRUCT`, `TOO_LARGE`, `UNRESOLVED_LINK`, `RATE_LIMITED`, `REMOTE_UNREACHABLE`, `INTERNAL`); adding `DOCTOR_FAIL` makes 99 a dumping ground where a shell consumer cannot separate "crash" from "rate-limited" from "doctor fail." The DEC-6 defense holds for JSON consumers but **not** for `$?`-based CI gating.
- **Pros:** No new numeric class; the `code` string preserves semantics for JSON/agent consumers.
- **Cons:** Erodes the meaning of the catch-all; conflates "expected/diagnosed" with "unexpected throw"; degrades shell-level distinguishability.
- **Why rejected:** It trades a clean dedicated class for further pollution of the catch-all. If a new class is to be avoided *and* honesty preserved, 99 is the wrong reuse target — it is worse than Option 1 on Driver #1 and no better on Driver #5 (the *code string* `DOCTOR_FAIL` is added either way; only the numeric differs). Option 1 strictly dominates Option 3.

## Decision

- **Decision:** **Alternative 1.** Add a **new dedicated exit class `EXIT_HEALTH = 60`** and register the **stable code string `DOCTOR_FAIL`** → `EXIT_HEALTH` in `CODE_TO_EXIT`. Doctor derives its non-zero exit via `codeToExitCode("DOCTOR_FAIL")` when any gating check reports `fail`; `data=DoctorReport` is always present and `error` is never set (the fixed DEC-4 mechanism). The existing `ok()`/`err()` factories and the error-kind→code mapper are unchanged.
- **Exact identifiers:**
  - **Constant:** `export const EXIT_HEALTH = 60;`
  - **Numeric:** `60` (unused tens-slot; between `EXIT_INVARIANT`=50 and `EXIT_RENDER_UNAVAILABLE`=70; categorical, not severity-ordered).
  - **Code string:** `DOCTOR_FAIL` (lives **only** in `CODE_TO_EXIT`; not a `MarkSyncError.kind`; not in `cli-error-map.ts`).
  - **Constant name rationale:** `EXIT_HEALTH` matches the spec's consistent usage (DEC-4 / F-7 / Appendix B / NFR-OBS-1 / glossary) and the terse-noun subset of the existing set (`EXIT_CONFIG`, `EXIT_AUTH`, `EXIT_CONFLICT`, `EXIT_INVARIANT`). `EXIT_HEALTH_CHECK` (more explicit) and `EXIT_DOCTOR` (command-named, breaks the "semantic category not command" convention) were considered and rejected for consistency.
- **Rationale (tied to drivers):** Doctor aggregates many check types, so no single existing class honestly describes "a health check failed" (Driver #1). A dedicated numeric lets shell/CI consumers distinguish doctor's pre-flight signal from every domain error class (Driver #2). The addition is purely additive (Driver #3) and slots cleanly into the tens-scheme (Driver #4). The only counter-driver — minimal contract surface (Driver #5) — is outweighed: the cost of one more documented constant is trivial next to the permanent confusion of overloading `EXIT_CONFIG`(10) (mischaracterizes non-config failures) or `EXIT_INTERNAL`(99) (conflates an expected/diagnosed failure with an unexpected throw and crowds the catch-all).
- **Decider:** Juliusz Ćwiąkalski (human Acceptance at PR review/merge — R2; AI does not auto-Accept).
- **Conditions for revisit:** see `revisit_triggers` front matter (a second command needing the same semantics; a contract major-version bump; an unanticipated shell/CI collision).

### Constraint Compliance Attestation

The chosen alternative (Alt 1) satisfies every documented constraint:

- **C-1 — ✅ Full compliance:** `codeToExitCode("DOCTOR_FAIL")` returns `60` (non-zero) on any `fail`; doctor returns `EXIT_OK`(0) when no check is `fail`. Asserted by the GH-30 test matrix (AC-F7-1).
- **C-2 — ✅ Full compliance:** `DOCTOR_FAIL` is registered in `CODE_TO_EXIT` and resolved via the single `codeToExitCode()` path; no parallel mechanism, no hardcoded magic numeric.

Table-stakes gates: `CONFLICT → 30` (AC-6) is untouched (additive); `error` is unset and `data=DoctorReport` is present on every path (the fixed DEC-4 mechanism). **No accepted-risk exceptions are required.**

## Trade-offs & Consequences

### Positive Outcomes

- Honest, non-conflated exit semantics for doctor across all check types.
- Shell/CI consumers can distinguish doctor's pre-flight signal from every domain error class via `$?` alone.
- Purely additive — zero breaking change to existing consumers (unknown codes already fell back to 99; this adds a *known* mapping).
- Matches the spec's own `EXIT_HEALTH` / `DOCTOR_FAIL` terminology, so docs/code/tests stay aligned.

### Negative Outcomes

- The documented exit-code set grows from 9 to 10 classes — one more constant + one doc line to maintain. (Mitigated: trivial; the set is explicitly extensible.)
- `DOCTOR_FAIL` exists only in `CODE_TO_EXIT`, not in the error-kind→code mapper — a reviewer must understand doctor's direct-`CommandResult` path to find it. (Mitigated: documented in `exit-codes.ts` comments + this record + the GH-30 spec DEC-4.)

### Unresolved Questions

- [ ] **Generalization:** if a future command needs the same "succeeded-with-a-report but CI should gate" semantics, decide whether `EXIT_HEALTH` stays doctor-specific or becomes a shared "diagnostic-fail" class. (owner: Juliusz Ćwiąkalski — revisit trigger)
- [ ] None blocking GH-30 delivery — the numeric, constant, and code string are fully specified here.

## Implementation Plan

This record **does not modify source** — it records the choice. The implementation is the coder's job in GH-30 delivery (per the task scope). For traceability, the coder's steps implied by this decision are:

1. In `src/cli/output/exit-codes.ts`: add `export const EXIT_HEALTH = 60;` alongside the other `EXIT_*` constants, and add `DOCTOR_FAIL: EXIT_HEALTH,` to `CODE_TO_EXIT` (with a comment noting it is doctor-only and not a `MarkSyncError.kind`).
2. Update the DEC-2 comment table in `exit-codes.ts` to document the new class (and adjust the "9 classes" framing to 10).
3. Doctor handler: set `exitCode: codeToExitCode("DOCTOR_FAIL")` when the report's worst status is `fail`; `EXIT_OK`(0) otherwise. Do **not** route through `ok()`/`err()`.
4. Tests: assert `codeToExitCode("DOCTOR_FAIL") === 60`; assert doctor's `exitCode` is 0 on all-pass and 60 on any-fail (AC-F7-1).

**Rollout / guardrails:** additive; no migration. CI's `marksync doctor && marksync sync` gating benefits immediately. Doctor is **not** wired as a mandatory pre-sync gate in MS-0002 (DEC-5).

**Risk mitigation during implementation:** if `check:boundaries` or any lint flags the new constant, confirm `EXIT_HEALTH` is defined in the pure-data `exit-codes.ts` module (no tier import) — it is presentation-tier data, same as its siblings.

## Verification Criteria

- **Metric: exit-code mapping** — Target: `codeToExitCode("DOCTOR_FAIL") === 60` and `CODE_TO_EXIT.DOCTOR_FAIL === EXIT_HEALTH === 60` — Window: GH-30 (C-2).
- **Metric: doctor all-pass** — Target: with zero `fail` checks, doctor's `exitCode === 0` and `data === DoctorReport`, `error` unset — Window: GH-30 (C-1, AC-F7-1).
- **Metric: doctor any-fail** — Target: with ≥1 gating `fail` check, doctor's `exitCode === 60` and `data === DoctorReport`, `error` unset — Window: GH-30 (C-1, AC-F7-1).
- **Metric: additive safety** — Target: `codeToExitCode("CONFLICT") === 30` unchanged (AC-6); no existing `CODE_TO_EXIT` entry reclassified — Window: GH-30 (table-stakes gate).

## Confidence Rating

**High.** The decision is a contract-naming choice with all evidence local and verified (`exit-codes.ts`, `command-result.ts`, `cli-error-map.ts`, the GH-30 spec). The analysis is structural: doctor aggregates heterogeneous checks, so no single existing class is honest, and a dedicated additive class dominates on every driver except minimal-surface (which is negligible here). Reversibility is moderate (additive to a pre-release contract); stakes are low. Residual uncertainty is limited to the generalization question (whether `EXIT_HEALTH` stays doctor-specific) — captured as a revisit trigger, not a blocker.

## References

- **GH-30 spec** — `doc/changes/2026-07/2026-07-15--GH-30--doctor-health-check/chg-GH-30-spec.md` (§15 DEC-4, §14 OQ-1, Appendix B exit-code resolution, §16 affected components, §9 NFR-OBS-1, §11 RSK-4/RSK-5).
- **Exit-code contract** — `src/cli/output/exit-codes.ts` (`EXIT_*` constants, `CODE_TO_EXIT`, `codeToExitCode()`, DEC-2 comment table).
- **Output envelope** — `src/cli/output/command-result.ts` (`CommandResult<T>`, `ok()`/`err()` factories — neither used by doctor).
- **Error-kind→code bridge** — `src/app/cli-error-map.ts` (DEC-2 table; doctor bypasses this mapper).
- **ADR-0011** — `doc/decisions/ADR-0011-cli-output-strategy.md` (structured `CommandResult<T>` output strategy).
- **Decision-making guide** — `doc/guides/decision-making.md` (process); `doc/guides/decision-records-management.md` (artifact format).
