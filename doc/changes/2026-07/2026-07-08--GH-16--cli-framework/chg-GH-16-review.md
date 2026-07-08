# Code Review — GH-16: [MS2-E2-S3] CLI framework + CommandResult&lt;T&gt;

| | |
|---|---|
| **Reviewer** | `@reviewer` (lifecycle phase 8, local mode) |
| **Date** | 2026-07-08 |
| **Branch** | `feat/GH-16/cli-framework` (pushed to `origin`) |
| **Base** | `main` |
| **Verdict** | **PASS_WITH_RISKS** — meets spec / all 8 ACs / security / architecture; advisory nits + two tracked risks (non-blocking). **PR may proceed** after CI verifies the Bun-lockfile concern (see R-2). |
| **AC pass/fail** | **8 / 8 PASS** |
| **Quality gate (re-run)** | `bun run check` → 370 pass / 0 fail; `tsc --noEmit` clean; Biome lint clean (1 pre-existing warning); `depcruise src` → **no violations (32 modules, 39 deps)**. |
| **Findings** | 0 critical · 0 major · 3 minor · 4 nit (all advisory / non-blocking) |

---

## 1. Verdict Summary

GH-16 delivers the ADR-0011 hybrid output pipeline **correctly and completely**. The
five load-bearing constraints the spec hangs on are all genuinely satisfied and
**independently verified by reading source + re-running the gate**, not taken on
the plan's word:

- **INV-SEC-1 (the security invariant)** — redaction is centralized in
  `OutputService.emit` and applied to the *serialized string* on **every** format
  path (`index.ts:89` JSON, `:94` NDJSON, `:101` human). The integration test
  `TC-INT-001` greps **real captured subprocess bytes** (`Bun.spawnSync` of
  `tests/integration/fixtures/emit-result.ts`), not a mock. The 40-char-hex over-
  redaction guard is structurally sound (prefix-discriminated patterns; no bare
  long-hex catch-all — `TC-RED-006`).
- **DEC-1 (the architecture invariant)** — `rg '@cliffy|#domain|#infra' src/cli/`
  returns **comment text only, zero imports**. The `MarkSyncError.kind → code`
  translation lives **only** in `src/app/cli-error-map.ts`; `src/cli/output/exit-codes.ts`
  is pure data keyed by the stable string. dep-cruiser confirms (32 modules clean).
- **ADR-0011 C-3 (no central coupling)** — `TC-C3-001` snapshots `json.ts` /
  `human.ts` / `redact.ts`, defines a new stub inline, routes it through the real
  renderers + `OutputService`, and asserts the three modules are byte-unchanged.
- **C-4 (contract stability)** — golden snapshot pins byte-exact snake_case JSON
  with stable alphabetical key order and `schema_version: 1` (two layers: committed
  fixture + `toMatchSnapshot`).
- **Code quality (functional)** — no `any` in production, strict TS clean, ESM
  with `#`-aliases, `Result<T,E>` discipline preserved, `process.exit` confined to
  the single entrypoint.

The implementation is **architecturally clean and security-correct**. The
findings below are advisory style/risk items — none block the PR. The single
hard prerequisite before merge is letting CI confirm the Bun-lockfile interop
(R-2); everything else is deferrable.

---

## 2. Acceptance Criteria — 8 / 8 PASS

| AC | Spec ID | Claim | Verdict | Evidence (read + verified) |
|----|---------|-------|---------|-----------------------------|
| **AC-1** | AC-F4-1 / AC-F4-2 | Token in any field → no token in output; 40-char hex SHA survives | **PASS** | `redact.test.ts` (24 tests, TC-RED-001..009); **`TC-INT-001`** greps real `Bun.spawnSync` stdout/stderr (`cli-output.test.ts:46`); TC-RED-006 sha-survives; TC-RED-007 nested-token-post-serialize proves DEC-4 |
| **AC-2** | AC-F2-1 | Every stub under `--json` → valid JSON matching snapshot | **PASS** | `cli-output.snapshot.test.ts` byte-exact fixtures (success + error); `entrypoint.test.ts:63` loops all 4 stubs asserting valid JSON + `INTERNAL`; `stubs.test.ts` |
| **AC-3** | AC-F6-1 | Piped → 0 ANSI; `--color` forces on; `--no-color` forces off | **PASS** | `color.test.ts` full env matrix; **`TC-INT-002`** real `bun src/cli/index.ts plan \| pipe` assertions (`cli-output.test.ts:67`) |
| **AC-4** | AC-F6-2 | `--no-color --output=human` → no box-drawing, no ANSI | **PASS** | `human.test.ts` ESC-scan + U+2500–U+257F scan on fallback/error/registered paths |
| **AC-5** | AC-F7-1 | New command → zero changes to json/human/redact | **PASS** | `cli-add-command.test.ts:48` (TC-C3-001) byte-snapshot before/after |
| **AC-6** | AC-F5-1 | `{error:{code:"CONFLICT"}}` → exit 30 | **PASS** | `exit-codes.test.ts`; `cli-error-map.test.ts` (Conflict→CONFLICT, 13-kind exhaustive); **`TC-INT-003`** real spawn exit code === 30 |
| **AC-7** | AC-F3-1 | Registered formatter > fallback; unregistered → fallback | **PASS** | `human.test.ts` (richer-by-chars+lines, command-scoped, replace) |
| **AC-8** | AC-F10-1 | `bun run check` exits 0; contract snapshot green | **PASS** | **Re-run by reviewer**: 370 pass / 0 fail; dep-cruiser clean; typecheck clean; snapshot green |

**Plan task audit:** Phase 2–6 tasks are all marked complete with matching commits
(`8d2e426`, `697610f`, `ce8193b`, `44de22c`, `9870837`). Phases 7–8 task checkboxes
are still `[ ]` in the plan even though the work is demonstrably done (integration
tests at `aaeb9be`, version bump to `0.2.0` at `e58846d`, snapshot at `3a9dbd7`) —
**OPEN_TASKS gap** (cosmetic; the deliverables exist). The Execution Log table still
lists Phases 1, 7, 8 as `pending` despite evidence they executed — same cosmetic
stale-state. No `CHECKED_BUT_MISSING` or `DONE_BUT_UNCHECKED` code gaps found.

---

## 3. Review-Focus Verification (the 6 load-bearing risks)

### 3.1 INV-SEC-1 — centralized redaction on every path ✓

`src/cli/output/index.ts` `emit()` switch:
```
case "json":   this.stdout.write(redactString(renderJson(result)));        // :89
case "ndjson": this.stdout.write(redactString(renderNdjson(result)));      // :94
case "human":  ... const redacted = redactString(renderHumanForCommand(...)) // :101
```
- Redaction targets the **serialized string** (DEC-4) — a token nested in `data`
  is caught only post-`JSON.stringify`, which is exactly the leak this design
  prevents. `TC-RED-007` proves it on `data.pageBody` (2 levels deep).
- `TC-INT-001` spawns `tests/integration/fixtures/emit-result.ts` (which routes a
  real `CommandResult` through the **real** `OutputService`) and greps the captured
  pipe — no mock in the INV-SEC-1 path (honors the over-mocking guardrail).
- Over-redaction guard: patterns are prefix-discriminated (`gh[opsur]_`, `AT(ATT|STS)`,
  `Bearer `/`Basic `, `Authorization:`, `MARKSYNC_…_TOKEN=`, email `@domain.tld`);
  none matches bare hex. Value classes exclude `"`/whitespace so JSON structure is
  never corrupted. `TC-RED-006` confirms a 40-char SHA survives.

### 3.2 DEC-1 — tier isolation ✓

```
rg '@cliffy|#domain|#infra' src/cli/   → comment text only (zero imports)
rg '@cliffy|@jsr/cliffy' src/app src/domain src/infra  → empty (exit 1)
rg 'process\.exit' src/cli/             → only src/cli/index.ts (the entrypoint)
depcruise src                           → no violations (32 modules)
```
The `kind → {code,message,retryable}` translation lives **only** in
`src/app/cli-error-map.ts` (imports `#domain/errors` + `#domain/result`, defines its
own `ResultError` structurally so it never imports the presentation tier). The
presentation `exit-codes.ts` is pure data keyed by the stable string. The
`resultErrorFromAppResult<T>` bridge correctly lives in the **presentation** tier
(`src/cli/commands/result-adapter.ts`) — placing it in `src/app/` would have
created an app→presentation violation; the plan revision log 1.3 documents this
justified deviation well.

### 3.3 ADR-0011 C-3 — no central coupling ✓
`cli-add-command.test.ts` (first test) is a genuine proof: snapshots the three
central modules, defines `pingResult` inline, renders via the real `renderJson` /
`renderHuman` / `OutputService.emit`, then re-reads and asserts byte-equality.

### 3.4 C-4 — contract stability ✓
Golden snapshot is two-layer (committed `.json` fixtures + `toMatchSnapshot`),
uses a fixed `runId` (no RNG), asserts recursive alphabetical key order, and pins
`schema_version === 1`. Snake_case verified at every object depth
(`schema_version`/`run_id`/`exit_code`/`duration_ms`/`started_at`/`page_id`/`word_count`).

### 3.5 Code quality (functional) ✓
No `any` in production (`rg '\bany\b' src/` → prose only). Strict TS clean.
`Result<T,E>` discipline preserved (the app-tier mapper returns a structural
`ResultError`, never throws). ESM `#`-aliases throughout. Single `process.exit`
site. No `TODO/FIXME/HACK/XXX` in `src/`.

### 3.6 AC coverage ✓ — all 8 ACs traceable to passing tests (table in §2).

---

## 4. Findings (advisory — none blocking)

> Severity scale: critical / major / minor / nit. All findings below are
> **non-blocking**; they are recorded so they can be addressed in a voluntary
> follow-up or folded into the next touch of these files.

### F-1 [minor] Comment verbosity violates the stricter `typescript.md` rules that landed on this same branch

The concurrent-editor commits `bcacc18` + `c1c094b` rewrote `.ai/rules/typescript.md`
"Comments" section and added "Code style principles" + "Code quality patterns", and
`code-review-instructions.md` now has a comment-discipline checklist. The GH-16
source (written *before* those commits, under the older permissive rules) now
retroactively violates them:

- **File headers far exceed the ≤3-line cap.** Measured leading comment blocks:
  `cli-error-map.ts` ≈ 54 lines, `exit-codes.ts` ≈ 52 lines, `output/index.ts` ≈ 22
  lines, `redact.ts` ≈ 30 lines, `human.ts` ≈ 20 lines, `json.ts` ≈ 23 lines,
  `color.ts` ≈ 13 lines. The new rule: *"Cap at 3 lines; link the spec/ADR for the rest."*
- **ASCII tables embedded in headers.** `exit-codes.ts` and `cli-error-map.ts` both
  carry a full copy of the DEC-2 `kind → code → exit` table. The new rule: *"no
  ASCII tables"* in headers and *"don't duplicate specs in comments — link them."*
- **Bare alphabet-soup tags scattered.** Headers/inline comments bristle with
  `(DEC-1)`, `(DEC-4)`, `(RSK-1)`, `(RSK-4)`, `(NFR-OBS-1)`, `(NFR-SEC-2)`,
  `(AC-6)`, `(C-3)`, `(C-5)`, `(INV-SEC-1)`, `(TC-RED-006)`, etc. The new rule:
  *"A reference must carry context; a bare tag is noise. Cite the authority once,
  with explanation, at the load-bearing point."*
- **DEC-2 table duplicated** verbatim in two source files (and also in the spec +
  plan) — the rule says link, don't copy.

**Why non-blocking:** purely stylistic; the code is functionally correct and the
*content* of the comments is accurate and useful. The tension is an artifact of
concurrent editing (code delivered under old rules, rules tightened on the same
branch afterward). **Fix (advisory):** a single comment-trim pass across the 7
output/app files — reduce headers to ≤3 lines citing `chg-GH-16-spec.md §15` +
`ADR-0011`, delete the in-source DEC-2 tables (link instead), and collapse the tag
soup into one contextual citation per decision. Could be a voluntary `@coder`
follow-up; not required to merge.

### F-2 [minor] One tautological test in `cli-add-command.test.ts`

The second test, *"a registered human formatter is used without touching the
central human renderer"* (`cli-add-command.test.ts:78-88`), snapshots the central
modules twice with **nothing in between** — it never calls `registerHumanFormatter`,
never invokes `renderHumanForCommand`, and asserts only `after === before` on
untouched files. It cannot fail unless the filesystem changes mid-test. It proves
nothing its description claims.

**Why non-blocking:** AC-7 / C-3 for the registry is genuinely proven elsewhere
(`human.test.ts`: registered formatter is richer + scoped + replaces). This is just
a dead supplemental assertion. **Fix:** either delete it, or make it actually
exercise the registry (register a formatter, call `renderHumanForCommand`, assert
the output differs from `renderHuman` fallback, then re-snapshot the modules).

### F-3 [minor] Inconsistent test import convention (`../../src/...` vs `#cli/output`)

`code-review-instructions.md` (TypeScript & style checklist) says: *"Test imports:
use `#`-prefixed aliases from `package.json` imports, not deep relative paths."*
The new `#cli/*` + `#cli/output` aliases exist and are used in some tests, but 10
test files still use `../../src/cli/output/...` deep relative paths — including
every file under `tests/unit/cli/output/`, the golden snapshot, and
`cli-add-command.test.ts` (4 occurrences). Inconsistent with both the rule and the
intra-file mix (e.g. `entrypoint.test.ts` correctly uses `#cli/index`).

**Why non-blocking:** functional; Biome doesn't enforce import-source. **Fix:**
mechanical sweep converting `../../src/<tier>/...` → `#<tier>/...` in tests.

### F-4 [nit] Email redaction is global, not "auth/error-context" scoped

Spec F-4 specifies *"Email addresses in auth/error context → [REDACTED]."* The
implementation (`redact.ts:94`) matches **all** emails globally:
`\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b`. A legitimate email surfaced
in `data` (e.g. a page author/owner field) would be scrubbed.

**Why non-blocking / actually defensible:** this is a conservative *over-redaction*
in the safe direction (RSK-1 is about *under*-redaction). The plan's Task 3.1
dropped the "auth/error context" qualifier, so it matches the plan; it just reads
broader than spec F-4's literal wording. **Fix (optional):** either (a) document
the intentional broadening in `redact.ts` ("emails are scrubbed everywhere —
security-conservative; revisit if a command must surface a legitimate email"), or
(b) if a future command needs to emit an email, scope the pattern then.

### F-5 [nit] USAGE/INTERNAL catch path always emits `human`, ignoring a possibly-passed `--json`

`src/cli/index.ts:68` — on a Cliffy parse error the catch emits the USAGE result
with `format: "human"` regardless of whether the user passed `--json`. So
`marksync plan --json --bogus-flag` yields human text on stderr, not JSON. This is
defensible (parse errors fire before the action resolves/captures the format, so
the intended format isn't cleanly known), and no AC requires JSON on parse error.
**Why non-blocking:** acceptable MS-0002 behavior; flag for reconsideration if a
future CI consumer expects machine-parseable output even on arg errors.

### F-6 [nit] `isCliffyParseError` duck-types by `constructor.name`
`src/cli/index.ts:94` classifies parse errors via `e.constructor.name ===
"ValidationError"` / `"UnknownCommandError"` plus an `exitCode === 2` fallback.
Importing Cliffy's exported `ValidationError` would be cleaner (and is permitted —
Cliffy is already confined to `src/cli/`), but the duck-type + fallback works and
the comment explains the choice. Non-blocking; revisit if Cliffy renames these.

### F-7 [nit] Phase 1 compile-smoke not re-evidenced for GH-16 in pm-notes
TDR-0002 C-1 mandates a `bun build --compile` + binary `--help` smoke before
locking the Cliffy version. The MS-0001 spike evidence exists
(`spikes/bun-compile-smoke/evidence/`), and `scripts/build-binaries.sh` is
present, but GH-16's pm-notes record only the JSR-registry discovery and Bun
upgrade — not a Phase-1-specific compile binary + `--help` render result. Thin
process evidence; not an AC. **Fix (optional):** add a one-line smoke-result note
to pm-notes or wire `scripts/build-binaries.sh` into CI.

---

## 5. Known-Issues Assessment (flagged in pm-notes — not re-counted as findings)

### KI-1. Concurrent-editor commits `30138d4` + `bcacc18` (+ `c1c094b`) — **recommend KEEP**

These are out-of-scope ADOS-framework doc changes: they restructure `AGENTS.md`
(229→177 lines), rewrite `.ai/rules/typescript.md` comments/style rules, add the
`code-review-instructions.md` comment-discipline checklist, and delete
`.opencode/agent/ceo.md` (moving to the global `@ceo` agent).

**Assessment:** The *content* is beneficial — the tightened rules are good
engineering hygiene and are in fact the criteria this review applies (focus #5).
The PR will squash, so branch history is clean regardless. **Recommendation: keep
the doc content** but be aware it retroactively makes the GH-16 source comments
non-compliant (→ finding F-1). The alternative (reverting and re-doing the doc
update in a dedicated framework PR) is cleaner scope hygiene but loses good rules
that are already load-bearing for review. Net call: **keep**, and address F-1 as a
voluntary follow-up so the code and its rules converge.

### KI-2. Cliffy installed from JSR (`@jsr/cliffy__command`) — **acceptable, documented**

`.npmrc` adds `@jsr:registry=https://npm.jsr.io`; deps are `@jsr/cliffy__command` /
`@jsr/cliffy__flags` at `^1.2.1`. This is the same c4spar/cliffy 1.2.1 library
TDR-0002 selected — only the resolution mechanism changed (c4spar moved to
JSR-only publishing; the npm `cliffy` is an unrelated REPL tool). The import path
`@jsr/cliffy__command` is correct and confined to `src/cli/`. Flagged for phase-7
doc-sync (typescript.md allowed-deps framing + TDR-0002 registry note). Not a
blocker.

### KI-3. Bun runtime skew (local 1.3.14 vs `engines.bun` 1.2.23 vs CI pins 1.2.23) — **REAL RISK, verify in CI**

This is the one item I want explicitly confirmed before/at PR. `bun.lock` was
regenerated by Bun **1.3.14** (text format); `package.json#engines.bun` is still
`1.2.23`; CI (`ci.yml`, `run-e2e.yml`) installs `bun-version: "1.2.23"` and runs
`bun install --frozen-lockfile`. The risk: a 1.3.14-generated lockfile may not be
accepted unchanged by 1.2.23's `--frozen-lockfile`, or may resolve transitive deps
differently — surfacing as a CI failure not seen locally (`bun run check` is green
on 1.3.14, but that's not the CI Bun).

**This is not blocking the verdict** (it's an environment interop risk, not a
defect in the delivered code), **but CI must be allowed to run on the PR and
confirm green** before merge. If CI fails on the lockfile, the fix is either
`engines.bun` → `^1.3` + CI pin → `1.3.x`, OR regenerate the lockfile on 1.2.23.
Track as R-2 below.

---

## 6. Risks to Track (non-blocking)

| ID | Risk | Severity | Action |
|----|------|----------|--------|
| **R-1** | Comment-style non-compliance (F-1) is pervasive across the new output files; future contributors may copy the verbose pattern. | low | Voluntary `@coder` comment-trim pass (≤3-line headers, link-not-copy DEC-2 table, collapse tag soup). Not required to merge. |
| **R-2** | Bun 1.3.14 lockfile vs CI's 1.2.23 `--frozen-lockfile` interop unverified. | medium | **Let CI run on the PR.** If red on install, bump `engines.bun` + CI pin to 1.3.x, or regen lockfile on 1.2.23. |
| **R-3** | Phases 7–8 task checkboxes + Execution Log still show `pending` despite completed work (cosmetic plan/execution-log staleness). | low | Optional: tick the boxes / update the Execution Log for record accuracy. |

---

## 7. Recommendation

**PR may proceed.** The delivered CLI framework is correct, secure (INV-SEC-1
enforced by construction on a single non-bypassable chokepoint, verified on real
captured bytes), architecturally clean (DEC-1 honored — dep-cruiser clean, no
domain/infra imports in the presentation tier), and contract-stable (golden
byte-exact snapshot). All 8 ACs pass with traceable tests; `bun run check` is green
(re-run by the reviewer: 370/0).

The verdict is **PASS_WITH_RISKS** rather than clean PASS only because of:
(i) the advisory comment-style findings (F-1, a consequence of the concurrent
editor tightening the rules mid-branch), (ii) one tautological test (F-2) and
minor import-convention drift (F-3), and (iii) the Bun-lockfile/CI interop risk
(R-2) that needs a green CI run to retire. None are blocking; none require a
remediation phase before merge. F-1/F-2/F-3 can be folded into a voluntary
`@coder` touch-up or deferred to the next time these files are edited.

**Next step:** `@pr-manager` may create the PR. Request CI confirmation of the
install/lockfile step (R-2) before human merge.

---

*Reviewed by `@reviewer` (ADOS lifecycle phase 8). Methodology: spec/plan/test-plan
loaded as contract authority; source + tests read in full; `bun run check` re-run
independently; architecture boundaries verified via `rg` + `depcruise`; AC
traceability cross-checked against the test-plan coverage matrix.*
