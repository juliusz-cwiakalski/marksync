---
# Copyright (c) 2025-2026 Juliusz Ćwiąkalski (https://www.cwiakalski.com | https://www.linkedin.com/in/juliusz-cwiakalski | https://www.x.com/cwiakalski)
# MIT License - see LICENSE file for full terms
ados_distribution: project-generated
change:
  ref: GH-104
  type: fix
  status: Proposed
  slug: osv-red-fast-uri-js-yaml
  title: "fix: osv red — bump fast-uri to 3.1.5 and js-yaml to 4.3.1 (both CVSS 7.5)"
  owners: [Juliusz Ćwiąkalski]
  service: marksync-cli
  labels: [MS-0002, security, dependencies, supply-chain, ci, bug]
  version_impact: patch
  audience: internal
  security_impact: medium
  risk_level: low
  dependencies:
    internal: []
    external: [npm registry (fast-uri 3.1.5 / js-yaml 4.3.1 resolution), osv-scanner reusable workflow (existing CI gate, unchanged)]
---

# CHANGE SPECIFICATION

> **PURPOSE**: Eliminate the two CVSS 7.5 dependency vulnerabilities (fast-uri GHSA-7p8r-x3mc-p8w7, js-yaml GHSA-5p4m-2wfm-xmqj) from the committed lockfile via surgical patch-level `overrides` entries, restoring the blocking osv-scanner CI gate to green and unblocking every merge.

## 1. SUMMARY

The `osv-scan` CI job fails on **all** PRs because the committed lockfile pins two packages with published CVSS 7.5 advisories (scan 2026-08-14): fast-uri 3.1.4 (transitive via ajv, runtime chain) and js-yaml 4.3.0 (transitive via the commitlint toolchain, dev chain). This is a lockfile-only fix: bump the existing fast-uri override `^3.1.4` → `^3.1.5`, add a js-yaml override `^4.3.1` (same pattern), regenerate the lockfile, and bump the package version 0.8.1 → 0.8.2 (patch, shipped-fix precedent). No `src/` change of any kind.

## 2. CONTEXT

### 2.1 Current State Snapshot

- Per [doc/guides/security-baseline.md](../../../guides/security-baseline.md) (NFR-SEC-4 supply-chain controls), the osv-scanner vulnerability scan runs on every push in CI and is **blocking at MS-0002** — a red scan fails the PR check suite.
- The dependency manifest carries an `overrides` block with a single entry, `fast-uri: ^3.1.4` — the established mechanism for forcing a transitive-only package to a patched resolution without adding a direct dependency.
- The lockfile pins `fast-uri@3.1.4` and `js-yaml@4.3.0`:
  - **fast-uri** is transitive via ajv (runtime chain; ajv is used for schema validation) and ships inside the published single-binary.
  - **js-yaml** is transitive via the dev toolchain (`@commitlint/load` → cosmiconfig → js-yaml `^4.1.0`); it is **never imported in `src/`** and does not ship in the binary. The direct YAML library is `yaml` `^2.9.0` — a distinct package, unaffected by this advisory.

### 2.2 Pain Points / Gaps

- **CI gate red repo-wide.** The 2026-08-14 scan flags two CVSS 7.5 advisories against the lockfile; the `osv-scan` job fails on every PR, blocking **every** merge (ticket labeled `priority:critical`).
- **Known-fixed, patch-level findings.** Both advisories have published patch fixes (fast-uri 3.1.5, js-yaml 4.3.1) — no major-version jump or code adaptation is required.
- **Ticket wording mismatch.** The ticket's fix direction says "bump direct dependency" for js-yaml, but js-yaml is not a direct dependency (see DEC-1); following that wording literally would add an unused direct dependency.

## 3. PROBLEM STATEMENT

Because the committed lockfile resolves fast-uri 3.1.4 and js-yaml 4.3.0 — both with published CVSS 7.5 fixes — the blocking osv-scanner CI gate fails on every pull request, so no change (including security and feature work) can merge, halting the delivery pipeline while two known-vulnerable package versions remain pinned in the runtime and dev dependency graphs.

## 4. GOALS

- **G-1**: The lockfile resolves fast-uri ≥ 3.1.5, clearing GHSA-7p8r-x3mc-p8w7 from the runtime dependency graph.
- **G-2**: The lockfile resolves js-yaml ≥ 4.3.1, clearing GHSA-5p4m-2wfm-xmqj from the dev dependency graph.
- **G-3**: The CI `osv-scan` job is green on this change's PR, restoring merge capability for the whole repo.
- **G-4**: Zero runtime behavior change — no `src/` modification; both packages remain transitive-only (no new direct dependencies).
- **G-5**: Version bumped 0.8.1 → 0.8.2 (patch) per the shipped-fix precedent, so the next tagged binary release and its SBOM carry the patched dependency set.

### 4.1 Success Metrics / KPIs

| Metric | Target |
|--------|--------|
| osv-scanner findings against the lockfile after this change | 0 |
| PRs blocked by a red `osv-scan` job after this change merges | 0 |
| Failures in the full local quality gate (`bun run check`, ~1310 tests) | 0 |
| `src/` file changes | 0 |
| New direct dependencies | 0 |

### 4.2 Non-Goals

- **NG-1**: No `src/` (or any shipped-code) change — the fix is dependency resolution only.
- **NG-2**: No new direct dependencies — fast-uri stays override-managed (per the ticket's own fix direction), and js-yaml is handled identically (DEC-1).
- **NG-3**: No other dependency updates — no renovate-style mass bump, no toolchain upgrades.
- **NG-4**: No CI workflow changes — the `osv-scan` job and its wiring are already correct; only the scanned artifact (lockfile) changes.
- **NG-5**: No new security tooling or policy changes — the osv-scanner blocking policy (NFR-SEC-4) stays as documented.

## 5. FUNCTIONAL CAPABILITIES

| ID | Capability | Rationale |
|----|------------|-----------|
| F-1 | Runtime dependency graph is free of the fast-uri advisory | fast-uri is transitive via ajv (schema validation) and ships in the binary; pinning ≥ 3.1.5 clears GHSA-7p8r-x3mc-p8w7 (CVSS 7.5) from shipped artifacts. |
| F-2 | Dev dependency graph is free of the js-yaml advisory | js-yaml is transitive via the commitlint toolchain; pinning ≥ 4.3.1 clears GHSA-5p4m-2wfm-xmqj (CVSS 7.5) from the CI/dev surface. |
| F-3 | The blocking vulnerability gate passes | NFR-SEC-4 makes the osv-scan job blocking at MS-0002; a green gate is the repo-wide unblock and the primary ticket outcome. |

### 5.1 Capability Details

**F-1 — fast-uri resolution.** The existing `overrides` entry for fast-uri moves from `^3.1.4` to `^3.1.5`; override semantics are preserved so fast-uri remains transitive-only (the ticket's fix direction explicitly forbids adding it to `dependencies`). The lockfile is regenerated so the resolved pin reflects 3.1.5.

**F-2 — js-yaml resolution.** A new `overrides` entry pins js-yaml to `^4.3.1`, using the same established pattern as fast-uri (DEC-1). The direct YAML library (`yaml` `^2.9.0`) is untouched. The lockfile is regenerated so the resolved pin reflects 4.3.1.

**F-3 — Gate restoration.** With both findings cleared from the lockfile, the unchanged `osv-scan` CI job passes; no scanner configuration, workflow, or exclusion change is involved.

## 6. USER & SYSTEM FLOWS

```
Flow 1 — CI security gate (the fixed path)
  Contributor: opens/updates any PR
  CI: runs the osv-scan job → osv-scanner resolves bun.lock
  Scanner: fast-uri 3.1.5 ✓, js-yaml 4.3.1 ✓ → 0 findings
  Job: green → PR check suite no longer blocked by osv-scan → merge possible

Flow 2 — Local verification (delivery gate)
  Developer: applies the two overrides + regenerates the lockfile
  bun run check: lint + format + typecheck + full test suite + boundaries → all green
  (optional) local osv-scanner run if available → 0 findings; CI osv-scan is the
  authoritative gate (AC-F3-1)
```

## 7. SCOPE & BOUNDARIES

### 7.1 In Scope

- Dependency manifest `overrides`: fast-uri `^3.1.4` → `^3.1.5` (semantics unchanged).
- Dependency manifest `overrides`: add js-yaml `^4.3.1` (DEC-1).
- Lockfile regeneration from the updated manifest.
- Package version bump 0.8.1 → 0.8.2 (patch), following the GH-88 shipped-fix precedent; verified that no README/doc version references require updates (the README's `--version` mention is illustrative, and the 0.8.x mention in TDR-0010 is frozen history).
- Verification: full local gate `bun run check` green; a local osv-scanner run if the tool is available (CI remains the authoritative check).

### 7.2 Out of Scope

- [OUT] Any `src/` change or shipped-code behavior change (NG-1).
- [OUT] Adding fast-uri or js-yaml as direct dependencies (NG-2).
- [OUT] Any other dependency version changes or a mass dependency refresh (NG-3).
- [OUT] CI/workflow or osv-scanner configuration changes (NG-4).
- [OUT] Security-policy or baseline-doc changes — NFR-SEC-4 already documents the blocking posture (NG-5).
- [OUT] Editing frozen history (prior change documents, decisions) — this change cites them, never rewrites them.

### 7.3 Deferred / Maybe-Later

- Removing the js-yaml override once the upstream chain (commitlint/cosmiconfig) naturally requires ≥ 4.3.1 — a cleanup for a future dependency-refresh pass.
- Automated dependency-update automation (e.g., renovate/dependabot) for override maintenance — separate initiative, not part of this hotfix.

## 8. INTERFACES & INTEGRATION CONTRACTS

### 8.1 REST / HTTP Endpoints

N/A — no HTTP surface is added or changed; the CLI's command surface is untouched.

### 8.2 Events / Messages

N/A — no events or messages are produced or consumed.

### 8.3 Data Model Impact

| ID | Element | Description |
|----|---------|-------------|
| DM-1 | `overrides` map (dependency manifest) | **Updated** — fast-uri entry bumped to `^3.1.5`; js-yaml entry `^4.3.1` added. Both remain override-managed (transitive-only). |
| DM-2 | Lockfile resolved pins | **Updated** — fast-uri pins 3.1.5, js-yaml pins 4.3.1; manifest/lockfile consistency (CI lock-must-match check) preserved. |
| DM-3 | Package version field | **Updated** — 0.8.1 → 0.8.2 (patch, DEC-2). |

### 8.4 External Integrations

No new external integrations. Existing ones touched only at the version-resolution level:

| Integration | Change | Contract |
|-------------|--------|----------|
| npm registry | fast-uri resolved 3.1.4 → 3.1.5; js-yaml 4.3.0 → 4.3.1 | Semver-compatible patch resolutions of already-present transitive packages; no new packages. |
| osv-scanner (CI reusable workflow) | None | Scans the regenerated lockfile; expected to report 0 findings (F-3). |

### 8.5 Backward Compatibility

Fully backward compatible:

- No public type, CLI, exit-code, output, or behavioral change; `src/` is untouched (zero diffs).
- `overrides` affect install-time resolution only; both packages remain transitive-only — no consumer-facing dependency surface changes.
- Published binaries are unaffected until the next tagged release, which will embed the patched fast-uri.
- Version impact: **patch** (0.8.1 → 0.8.2).

## 9. NON-FUNCTIONAL REQUIREMENTS (NFRs)

| ID | Requirement | Threshold |
|----|-------------|-----------|
| NFR-1 | Lockfile free of known vulnerabilities per the CI scanner | 0 findings against the lockfile; both target GHSAs resolved (fast-uri ≥ 3.1.5, js-yaml ≥ 4.3.1) |
| NFR-2 | No regression in the existing quality gate | `bun run check` fully green: lint, format, typecheck, all existing tests (0 failures), boundary check |
| NFR-3 | Zero runtime behavior delta | 0 `src/` file changes in the change diff |
| NFR-4 | Manifest/lockfile consistency | CI lock-file-must-match check passes on every push (regenerated lockfile matches the manifest exactly) |

## 10. TELEMETRY & OBSERVABILITY REQUIREMENTS

No new metrics, traces, or alerts. The CI `osv-scan` job result is the observability surface for this change; it transitions red → green and stays in its existing wiring.

## 11. RISKS & MITIGATIONS

| ID | Risk | Impact | Probability | Mitigation | Residual Risk |
|----|------|--------|-------------|------------|---------------|
| RSK-1 | fast-uri 3.1.5 subtly changes URI-normalization behavior in the runtime chain (ajv schema validation) | L | L | Patch-level, semver-compatible bump; the full existing suite (unit, integration, e2e-mock) exercises the ajv validation paths and runs in `bun run check` before merge. | L |
| RSK-2 | js-yaml 4.3.1 subtly changes dev-toolchain behavior (commitlint config loading) | L | L | Dev-chain only, never imported in `src/`; commitlint is exercised by the commit workflow during delivery itself. | L |
| RSK-3 | Lockfile regeneration surfaces additional/new scanner findings | M | L | Overrides are surgical (exactly two packages); the lockfile diff is audited for unintended resolution drift; any unrelated finding is pre-existing and handled as a separate change, not silently scoped in. | L |

## 12. ASSUMPTIONS

- The advisory fixed-in versions are accurate and available on the npm registry: fast-uri 3.1.5 (GHSA-7p8r-x3mc-p8w7) and js-yaml 4.3.1 (GHSA-5p4m-2wfm-xmqj).
- Both patch releases are drop-in compatible with their current consumers (ajv for fast-uri; cosmiconfig for js-yaml) — consistent with semver patch expectations.
- No other code path imports fast-uri or js-yaml directly (verified during clarify_scope: js-yaml never imported in `src/`; fast-uri override-managed as transitive-only).

## 13. DEPENDENCIES

| Direction | Item | Notes |
|-----------|------|-------|
| Depends on | npm registry availability of fast-uri@3.1.5 and js-yaml@4.3.1 | Standard registry resolution; no vendor action needed. |
| Depends on | Existing `osv-scan` CI job (NFR-SEC-4) | Unchanged; it is both the detector that flagged the issue and the gate that verifies the fix. |
| Blocks | All other in-flight PRs (indirectly) | A green `osv-scan` on this change's merge unblocks them; they need rebase/re-run to pick up the fixed lockfile. |

## 14. OPEN QUESTIONS

None at time of writing — the PM clarify_scope pass resolved the only open point (the js-yaml mechanism, captured as DEC-1); the ticket's AC is mechanism-neutral and is preserved verbatim in outcome terms in §17.

## 15. DECISION LOG

| ID | Decision | Rationale | Date |
|----|----------|-----------|------|
| DEC-1 | Pin js-yaml via a manifest `overrides` entry `^4.3.1` (same pattern as fast-uri), **not** as a direct dependency, despite the ticket's "bump direct dependency" wording. | js-yaml is not a direct dependency: `yaml` (`^2.9.0`) is the direct YAML library; js-yaml is transitive via the dev toolchain (`@commitlint/load` → cosmiconfig → js-yaml `^4.1.0`) and never imported in `src/`. Adding an unused direct dependency would worsen the dependency surface and contradict the repo's established override pattern. The ticket's AC is mechanism-neutral ("lockfile pins js-yaml ≥ 4.3.1"), so the override satisfies it without weakening anything. PM-decided during clarify_scope to unblock delivery. | 2026-08-15 |
| DEC-2 | Bump the package version 0.8.1 → 0.8.2 (patch). | Shipped-fix precedent (GH-88: 0.8.0 → 0.8.1 for a behavior fix): the next tag-triggered binary release embeds the patched fast-uri in the single binary, and the release SBOM (syft, GH-32) should map 0.8.2 → the patched dependency set. Verified that no README/doc version references need updating for the bump. | 2026-08-15 |

## 16. AFFECTED COMPONENTS (HIGH-LEVEL)

| Component | Impact |
|-----------|--------|
| Dependency manifest (`overrides` + `version`) | Updated — fast-uri override bumped; js-yaml override added; version 0.8.2 |
| Lockfile | Updated (regenerated) — fast-uri@3.1.5, js-yaml@4.3.1 pinned |
| CI `osv-scan` job | Unchanged — beneficiary; transitions red → green |
| Source code (`src/**`) | Unchanged — zero diffs by design (NFR-3) |
| Test suite | Unchanged — executed as the regression net, not modified |

## 17. ACCEPTANCE CRITERIA

| ID | Criterion | Linked |
|----|-----------|--------|
| AC-F1-1 | **Given** the updated overrides and the regenerated lockfile, **when** the resolved fast-uri version is inspected, **then** the lockfile pins fast-uri ≥ 3.1.5 and fast-uri remains transitive-only (no direct `dependencies` entry). | F-1, DM-1, DM-2, NFR-1 |
| AC-F2-1 | **Given** the updated overrides and the regenerated lockfile, **when** the resolved js-yaml version is inspected, **then** the lockfile pins js-yaml ≥ 4.3.1 (via the override per DEC-1) and js-yaml remains transitive-only. | F-2, DM-1, DM-2, DEC-1, NFR-1 |
| AC-F3-1 | **Given** this change's PR, **when** CI runs the `osv-scan` job, **then** the job is green with 0 findings against the lockfile. | F-3, NFR-1 |
| AC-NFR2-1 | **Given** the lockfile-only change is applied, **when** the full local gate `bun run check` runs, **then** every stage (lint, format, typecheck, full test suite, boundary check) passes with 0 failures. | NFR-2, NFR-3 |
| AC-DEC2-1 | **Given** the change is complete, **when** the package version is inspected, **then** it reads 0.8.2 (patch bump from 0.8.1) and no version-reference docs required updating. | DEC-2, DM-3 |

## 18. ROLLOUT & CHANGE MANAGEMENT (HIGH-LEVEL)

- Single fix PR to `main`; no feature flag, no migration, no config change.
- Immediate merge priority (`priority:critical`): every other PR is blocked on this gate.
- After merge: other open PRs rebase onto `main` (or re-run CI) to pick up the clean lockfile and clear their red `osv-scan` jobs.
- Next tag-triggered release (GH-32 pipeline) ships 0.8.2 binaries with the patched dependency set and a matching SBOM; no release-machinery change.
- Communication: release-note line "fix(deps): clear CVSS 7.5 osv findings — fast-uri 3.1.5, js-yaml 4.3.1 (lockfile-only)".

## 19. DATA MIGRATION / SEEDING (IF APPLICABLE)

N/A — no persisted state is touched. The lockfile is a committed artifact regenerated in place; the disposable `.marksync/` cache and the committed versioned lock are unaffected.

## 20. PRIVACY / COMPLIANCE REVIEW

N/A — no personal data is collected, retained, or transmitted. Neither package change alters any data-handling path; js-yaml is dev-toolchain-only and fast-uri operates inside ajv's URI-resolution internals.

## 21. SECURITY REVIEW HIGHLIGHTS

- **This change is a security fix** (security_impact: medium): it eliminates two CVSS 7.5 supply-chain findings from the dependency graph, honoring the NFR-SEC-4 blocking posture ("blocking at MS-0002") rather than working around it (no scanner exclusion, no policy downgrade).
- **Exposure assessment:** fast-uri is runtime-transitive (via ajv, used for schema validation with controlled inputs) and ships in the binary — the more material of the two. js-yaml is dev-chain-only (commitlint toolchain), never in `src/` or shipped artifacts.
- **No new attack surface:** no new packages introduced — only patch-level version increases of two already-present transitive packages; license posture unchanged (MIT-compatible).
- **Gate integrity:** the detection and blocking mechanism that surfaced this (osv-scanner in CI) is unchanged and remains the recurring detector.

## 22. MAINTENANCE & OPERATIONS IMPACT

- Restores repo-wide merge capability; no new operational burden.
- The `overrides` block grows by one entry (js-yaml); §7.3 records the cleanup trigger (remove when the upstream chain naturally requires ≥ 4.3.1).
- Recurrence handling stays with the existing CI gate: future advisories surface as red `osv-scan` jobs and are triaged as changes like this one.

## 23. GLOSSARY

| Term | Definition |
|------|------------|
| osv-scanner | Vulnerability scanner run in CI against the lockfile; **blocking** at MS-0002 per NFR-SEC-4 (security-baseline.md). |
| Override | A dependency-manifest mechanism forcing a transitive package's resolved version without adding a direct dependency — this repo's established pattern for security pin-bumps. |
| Transitive dependency | A package reached only through another package's dependency graph (fast-uri via ajv — runtime; js-yaml via commitlint/cosmiconfig — dev), not listed in `dependencies`/`devDependencies`. |
| GHSA | GitHub Security Advisory identifier (here: GHSA-7p8r-x3mc-p8w7 fast-uri, GHSA-5p4m-2wfm-xmqj js-yaml; both CVSS 7.5). |
| Lockfile | The committed resolved-dependency artifact (`bun.lock`) the CI scanner evaluates; must match the manifest on every PR. |
| NFR-SEC-4 | The supply-chain control set (vulnerability scan, license audit, SBOM, lockfile pinning) in doc/spec/nonfunctional.md and security-baseline.md. |

## 24. APPENDICES

- **Findings (scan 2026-08-14, ticket GH-104 — authoritative scope):**

  | Advisory | Package | Installed | Fixed | CVSS | Chain |
  |---|---|---|---|---|---|
  | GHSA-7p8r-x3mc-p8w7 | fast-uri (transitive via ajv) | 3.1.4 | 3.1.5 | 7.5 | runtime |
  | GHSA-5p4m-2wfm-xmqj | js-yaml (transitive via commitlint/cosmiconfig) | 4.3.0 | 4.3.1 | 7.5 | dev |

- **Policy:** [doc/guides/security-baseline.md](../../../guides/security-baseline.md) — dependency audit (NFR-SEC-4): osv-scanner every push, blocking at MS-0002.
- **Decision provenance:** `chg-GH-104-pm-notes.yaml` — PM clarify_scope decision (js-yaml override mechanism) and evidence (lockfile pins verified at lines 254/316).
- **Version-bump precedent:** GH-88 (PR #89, merged 2026-07-26) — patch bump 0.8.0 → 0.8.1 for a shipped fix; only the manifest `version` field changed.

## 25. DOCUMENT HISTORY

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-08-15 | spec-writer (GH-104) | Initial specification — lockfile-only fix for two CVSS 7.5 osv findings via overrides; includes DEC-1 (js-yaml override, not direct dep) and DEC-2 (patch 0.8.2). |

---

## AUTHORING GUIDELINES

- Authored from the GH-104 planning-session context (PM clarify_scope summary + `chg-GH-104-pm-notes.yaml`) and verified against repository evidence: ticket #104 body (authoritative scope — no story-file prefix), the manifest `overrides` block, the lockfile pins (fast-uri@3.1.4, js-yaml@4.3.0), the security baseline's NFR-SEC-4 blocking policy, and the GH-88 version-bump precedent (manifest-only patch bump).
- The ticket's acceptance criteria are preserved in outcome terms (mechanism-neutral) in §17; the one deliberate deviation from the ticket's *fix-direction wording* (js-yaml as override, not direct dependency) is recorded as DEC-1 with the PM decision provenance rather than silently applied.
- Intentionally minimal per the change size: a lockfile-only fix warrants no scope inflation — sections that do not apply are marked N/A in one line, and no implementation tasks or file-level code paths appear (those belong to the plan).

## VALIDATION CHECKLIST

- [x] `change.ref` matches provided `workItemRef` (GH-104)
- [x] `owners` has at least one entry (`[Juliusz Ćwiąkalski]`)
- [x] `status` is "Proposed"
- [x] All sections present in order (1-25 + guidelines + checklist)
- [x] ID prefixes consistent and unique (F-1..F-3, AC-F1-1..AC-DEC2-1, NFR-1..NFR-4, RSK-1..RSK-3, DEC-1..DEC-2, DM-1..DM-3)
- [x] Acceptance criteria reference at least one F-/NFR-/DM-/DEC- ID and use Given/When/Then
- [x] NFRs include measurable values
- [x] Risks include Impact & Probability
- [x] No implementation details (no file-level code paths, no step-by-step tasks)
- [x] No content duplicated from linked docs (ticket findings and security policy are cited, not restated beyond the summary table)
- [x] Front matter validates per front_matter_rules
