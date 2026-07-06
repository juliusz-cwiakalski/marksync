---
id: MS2-E5-S2
title: "doctor-health-check"
status: todo
type: story
priority: medium
epic: MS2-E5
milestone: MS-0002
estimate: 1.5d
gh_issue: GH-30
feature_spec: doc/spec/features/feature-cli.md
decisions: []
dependencies: { blocks: [], blocked_by: [MS2-E2-S3] }
cross_cutting: [R-USA-1, R-FEA-10, NFR-OBS-4]
---

# MS2-E5-S2 — `doctor` health-check

## Goal
A `marksync doctor` command that verifies the environment before any create/adopt: auth, base URL, space access, permissions, config validity, Git availability, and capability discovery — with AI-readable pass/fail diagnostics and suggested fixes.

## Background
NFR-OBS-4 (`doctor` minimal in MS-0002, full in MS-0003). R-FEA-10 (permission asymmetry: doctor surfaces visibility gaps so a 403 isn't misclassified as deleted). R-USA-1 (setup friction). This story is the MS-0002 minimal version: enough checks to diagnose the common setup-failure classes.

## Detailed scope (deliverables)
1. **`marksync doctor` command** — runs a checklist, each check producing `{check, status:pass|fail|warn, detail, fix?}`:
   - **Git available** on `$PATH` + a valid repo (TDR-0003 prereq, NFR-COMP-4).
   - **Config valid** (`loadConfig` — E2-S2; surface `ConfigError` AI-readable).
   - **Credentials resolve** (`resolveCredentials` — E2-S4) + **validate** (`validateCredentials` — E2-S4, real `GET /user/by-me`).
   - **Base URL reachable** + **space access** (can read the configured `spaceKey`).
   - **Parent page exists + writable** (the configured `parentPageId`).
   - **Content-property capability** (can write a `marksync.metadata` test property on a scratch page — optional; or at least confirm the property API responds).
   - **Attachment capability** (v1 attachment endpoint reachable).
   - **Permission/visibility completeness** (R-FEA-10): warn if the account cannot read some pages in the subtree (the doctor notes "assuming operator has full read access; 403 will be treated as warn+skip, not delete").
   - **Renderer availability** (happy-dom/mermaid load) — informational.
2. **`CommandResult<DoctorReport>`** — structured for CI/agents; a registered human formatter (E2-S3) renders a table.
3. **Exit code** — non-zero if any `fail` (so CI can gate on `doctor`).

## Technical approach
- Each check is a small function returning the result tuple; run them in sequence (bounded; fail-fast optional).
- The auth/space checks reuse E2-S4 + a light E3-S4 client call (no full adapter needed — direct `GET` via the credential).
- A scratch page for capability probes is created+deleted in the sandbox/parent subtree; cleaned up.

## Interface contracts (what other stories consume)
- `doctor` is the user-facing pre-flight; CI can run `marksync doctor` before `sync`.
- `DoctorReport` schema reusable by MS-0003 fuller diagnostics.

## Acceptance criteria (testable)
- [ ] **NFR-OBS-4:** doctor verifies auth, base URL, space access, parent page, config validity, Git availability.
- [ ] **R-FEA-10:** doctor warns about permission/visibility assumptions (the 403→warn+skip policy is surfaced).
- [ ] Each check returns pass/fail/warn + a suggested fix on failure (AI-readable).
- [ ] **INV-SEC-1:** no check output contains the token (redaction via E2-S3).
- [ ] Exit code non-zero on any `fail`.
- [ ] `doctor` produces valid JSON with `--json`.
- [ ] `bun run check` green.

## Test matrix
| Tier | This story |
|---|---|
| Unit | each check function (pass/fail/warn paths with mocked client), report assembly, exit-code mapping |
| Integration | doctor against `Bun.serve` mock (healthy + various failures); redaction assertion |

## Definition of Done
`doctor` runs the minimal MS-0002 checklist; AI-readable diagnostics + fixes; permission-asymmetry warning; no token leak; CI-gateable exit code. AC list is the DoD.

## Out of scope
- Full MS-0003 doctor (proxy/CA hints, deeper capability discovery, setup-failure taxonomy, guided remediation).
- Auto-remediation (diagnose + suggest only).

## Risks / open questions (CEO-resolved)
- **R1:** Doctor writes a scratch page → side-effect. → Only when `--probe-capabilities` is set; default doctor is read-only (auth GET + space GET + parent GET). CEO-recorded.
- **Q1:** Should `sync` require `doctor` to pass first? → No (MS-0002 keeps them independent; MS-0003 may wire a pre-sync check). Confirmed.
