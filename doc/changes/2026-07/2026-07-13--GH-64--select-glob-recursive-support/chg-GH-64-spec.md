---
# Copyright (c) 2025-2026 Juliusz Ćwiąkalski (https://www.cwiakalski.com | https://www.linkedin.com/in/juliusz-cwiakalski/ | https://x.com/cwiakalski)
# MIT License - see LICENSE file for full terms
change:
  ref: GH-64
  type: fix
  status: Proposed
  slug: select-glob-recursive-support
  title: "[MS2-E4] Glob patterns with ** not supported by git ls-tree pathspec (P1)"
  owners: [Juliusz Ćwiąkalski]
  service: marksync-core
  labels: [bug, MS-0002, priority:medium]
  version_impact: patch
  audience: internal
  security_impact: low
  risk_level: medium
  dependencies:
    internal: [src/infra/git/shell-git, src/shared/glob]
    external: [git CLI]
---

# CHANGE SPECIFICATION

> **PURPOSE**: Fix recursive glob pattern (`**`) support in `config.select` to enable the default starter config pattern `docs/**/*.md` to work correctly.

## 1. SUMMARY

Fix the shell-git adapter's `readCommitted` implementation to support recursive glob patterns using `**`. The current implementation passes glob patterns directly to `git ls-tree` as pathspecs, but git pathspec does not support recursive `**` (only single-segment `*`). This causes the default starter config pattern `docs/**/*.md` to match zero files, breaking `marksync init` out of the box. The fix lists all committed files without pathspec filtering and applies in-memory glob matching using the existing `src/shared/glob.ts` matcher, which correctly implements `**` semantics.

## 2. CONTEXT

### 2.1 Current State Snapshot

MarkSync uses git as the source of truth for discovering Markdown documents. The `Repository` port (`src/domain/git/port.ts`) provides a `readCommitted(ref, patterns): Result<Map<string, Uint8Array>>` method that returns committed files matching a set of patterns. The shell-git adapter (`src/infra/git/shell-git.ts`) implements this port by spawning the git CLI and passing the patterns as pathspecs to `git ls-tree -r --name-only ref -- ...patterns`.

The default starter config template created by `marksync init` uses `select: ["docs/**/*.md"]`, which is intended to match all `.md` files under the `docs/` directory at any depth. However, git pathspec semantics treat `*` as a single-segment wildcard (no `/`), and `**` is treated identically to `*`, not as a recursive wildcard.

### 2.2 Pain Points / Gaps

- **Silent failure**: The default config pattern produces zero results with no clear error message. Users see an empty plan and may not immediately realize their pattern is malformed for git pathspec.
- **Broken first-time experience**: `marksync init` creates a non-working starter config, contradicting the north star goal of "just works" local-first tooling.
- **Unexpected behavior**: Users familiar with glob patterns from other tools (e.g., npm, TypeScript tsconfig, most build tools) expect `**` to work recursively, leading to confusion.
- **Workaround is non-obvious**: The workaround is to use directory prefixes like `docs/` instead of `docs/**/*.md`, but this is not documented and defeats the purpose of the `.md` extension filter.

## 3. PROBLEM STATEMENT

Because git pathspec does not support recursive `**` glob patterns and MarkSync's shell-git adapter passes `config.select` patterns directly to `git ls-tree`, users cannot use `docs/**/*.md` to discover nested Markdown files. This results in the starter config's default pattern matching zero files, causing `marksync init` to produce a broken out-of-the-box experience.

## 4. GOALS

- **G-1**: Enable recursive glob pattern `**` in `config.select` to correctly match files at any depth (e.g., `docs/**/*.md` matches `docs/a.md`, `docs/a/b.md`, `docs/a/b/c.md`).
- **G-2**: Ensure the starter config template produced by `marksync init` works out of the box without manual pattern modification.
- **G-3**: Maintain the existing security invariant that malicious patterns are rejected before any git spawn occurs.

### 4.1 Success Metrics / KPIs

| Metric | Target |
|--------|--------|
| Pattern match accuracy | 100% of standard glob patterns (`**`, `*`, `?`) work as expected |
| Starter config functionality | `marksync init` produces a working config that discovers files without manual edits |
| Safety test pass rate | 100% of existing safety fuzz tests (TC-INTEGRATION-009) remain passing |
| Performance impact (informational) | No noticeable latency for typical MS-0002 corpus (≤500 files) — informational only, not a gating metric |

### 4.2 Non-Goals

- **NG-1**: No changes to the `Repository` port contract — `readCommitted(ref, patterns)` signature and semantics remain unchanged.
- **NG-2**: No changes to config loading, validation, or the `selectFiles` utility in `src/app/config.ts`.
- **NG-3**: No new dependencies — use the existing `src/shared/glob.ts` matcher.
- **NG-4**: No changes to the starter config template content — the default pattern remains `docs/**/*.md`.

## 5. FUNCTIONAL CAPABILITIES

| ID | Capability | Rationale |
|----|------------|-----------|
| F-1 | Recursive glob pattern matching | Enables users to express nested file selection concisely (`docs/**/*.md`) |
| F-2 | In-memory glob filtering with union semantics | Allows multiple patterns in `select` to collectively match files (any pattern match includes the file) |
| F-3 | Security validation before git operations | Maintains the invariant that malicious patterns are caught before shell spawn |

### 5.1 Capability Details

**F-1: Recursive glob pattern matching** — The system supports micromatch-style glob patterns including `**` (matches any number of path segments, including zero) when occupying a full segment. For example:
- `docs/**/*.md` matches `docs/a.md`, `docs/a/b.md`, `docs/a/b/c.md`
- `**/test.ts` matches `test.ts` at any depth
- `a/**/b` matches `a/b` and `a/x/y/b`

**F-2: In-memory glob filtering with union semantics** — When multiple patterns are provided in `config.select`, a file is included if it matches ANY pattern. This is consistent with the existing `selectFiles` behavior in the config layer. The implementation lists all committed files and applies the glob matcher to each pattern, collecting the union of matches.

**F-3: Security validation before git operations** — Before any git command is spawned, each pattern is validated using `validateRepoRelative` to reject malicious paths containing `..`, absolute paths, control bytes, or shell metacharacters. This validation is retained in the updated implementation, even though patterns are no longer passed as git pathspecs.

## 6. USER & SYSTEM FLOWS

**Flow 1: User runs `marksync plan` with recursive glob pattern**
  1. User configures `select: ["docs/**/*.md"]` in `marksync.yml`
  2. User runs `marksync plan`
  3. Push-flow orchestrator calls `git.readCommitted("HEAD", config.select)`
  4. Shell-git adapter validates each pattern via `validateRepoRelative`
  5. Shell-git adapter spawns `git ls-tree -r --name-only HEAD` (no pathspec)
  6. Shell-git adapter receives list of all committed file paths
  7. Shell-git adapter filters the list in-memory using `src/shared/glob.ts`
  8. Matching files are read via `git show ref:path` and returned as `Map<string, Uint8Array>`
  9. Plan contains expected entries from nested subdirectories

**Flow 2: New user runs `marksync init`**
  1. User runs `marksync init`
  2. Starter config template is written with `select: ["docs/**/*.md"]`
  3. User runs `marksync plan`
  4. Discovery returns nested markdown files (not empty set)
  5. User sees non-zero plan and proceeds without manual pattern changes

## 7. SCOPE & BOUNDARIES

### 7.1 In Scope

- Fix `readCommitted` in `src/infra/git/shell-git.ts` to stop passing glob patterns as git pathspecs
- List all committed files via `git ls-tree -r --name-only ref` (no pathspec argument)
- Filter the file list in-memory using `filterByGlob` from `src/shared/glob.ts`
- Support union semantics for multiple patterns (file included if ANY pattern matches)
- Retain `validateRepoRelative` pattern validation before git spawn
- Retain per-filename validation when reading individual files via `git show`

### 7.2 Out of Scope

- [OUT] Changes to the `Repository` port contract — signature and semantics unchanged
- [OUT] Changes to config loading, schema, or validation
- [OUT] Changes to the `selectFiles` utility in `src/app/config.ts`
- [OUT] Changes to the starter config template content
- [OUT] New dependencies or third-party glob libraries
- [OUT] Git pathspec translation or normalization

### 7.3 Deferred / Maybe-Later

- Performance optimization for very large repos (>10,000 files) — future milestone if needed
- Glob pattern caching across multiple `readCommitted` calls — not needed for MS-0002 scale

## 8. INTERFACES & INTEGRATION CONTRACTS

### 8.1 REST / HTTP Endpoints

N/A — this change does not involve HTTP endpoints.

### 8.2 Events / Messages

N/A — this change does not involve event or message handling.

### 8.3 Data Model Impact

N/A — no data model changes. The `readCommitted` return type `Result<Map<string, Uint8Array>, MarkSyncError>` is unchanged.

### 8.4 External Integrations

| Integration | Impact |
|-------------|--------|
| git CLI | Change in command arguments: `git ls-tree` no longer receives pathspec arguments |

### 8.5 Backward Compatibility

**Fully backward compatible with one intentional correction.** The `readCommitted` method signature and semantics are unchanged. Existing patterns that work today (e.g., directory prefixes like `docs/`) continue to work. The fix expands the set of supported patterns to include recursive globs (`**`), which previously silently matched nothing.

**One intentional edge-case change:** When called with an empty patterns array (`readCommitted(ref, [])`), the current implementation returns all committed files (an accidental side-effect of `git ls-tree` with no pathspec). After this fix, empty patterns correctly return an empty map — this is intentional and aligns with the app-layer `selectFiles` semantics where empty select → empty result. The old "all files" behavior was not a designed contract and was inconsistent with standard glob semantics.

## 9. NON-FUNCTIONAL REQUIREMENTS (NFRs)

| ID | Requirement | Threshold |
|----|-------------|-----------|
| NFR-SEC-7 | Path-traversal confinement | Malicious patterns rejected before git spawn; `validateRepoRelative` retains same rejection set (0 bytes read outside root) |
| NFR-PERF-5 | Conversion latency (informational) | `readCommitted` for typical MS-0002 corpus (≤500 files) should not introduce noticeable latency. Performance is informational, not a hard gate — this is a P1 correctness fix, and MS-0002 corpus sizes make O(files × patterns) negligible. |
| NFR-MAINT-1 | Adapter isolation | All glob pattern logic remains isolated behind the `Repository` port; application layer unchanged |

## 10. TELEMETRY & OBSERVABILITY REQUIREMENTS

N/A — this is a correctness fix with no new telemetry requirements. Existing error paths and logging in `readCommitted` remain unchanged.

## 11. RISKS & MITIGATIONS

| ID | Risk | Impact | Probability | Mitigation | Residual Risk |
|----|------|--------|-------------|------------|---------------|
| RSK-1 | Security regression from losing pattern validation | H | L | Retain `validateRepoRelative` on each pattern before git spawn; patterns are now consumed by in-memory matcher only, but validation guard stays in place | L |
| RSK-2 | Performance regression from listing all files | M | L | For MS-0002 corpus sizes (≤500 files), O(files × patterns) is negligible; no optimization needed | L |
| RSK-3 | Tier rule violation from infra importing shared | M | L | Verify `src/infra/git/shell-git.ts` importing `src/shared/glob.ts` is allowed per architecture rules (shared tier imports nothing, may be imported by any tier) | L |
| RSK-4 | Test coverage gaps for union semantics | L | M | Add unit tests covering multiple patterns with union behavior (file matching ANY pattern is included) | L |

## 12. ASSUMPTIONS

- The existing `src/shared/glob.ts` matcher correctly implements `**` semantics as documented (tested and verified).
- The `validateRepoRelative` function's rejection set is sufficient for security (no additional malicious patterns are needed for the new implementation).
- MS-0002 corpus sizes remain modest (≤500 files), making the O(files × patterns) in-memory filter acceptable.
- The single production caller (`src/app/push-flow.ts:154`) does not rely on git pathspec-specific behavior beyond file listing.
- Empty patterns (`[]`) should return an empty result map, not all files — this is an intentional correction of an accidental behavior in the current implementation.

## 13. DEPENDENCIES

| Direction | Item | Notes |
|-----------|------|-------|
| Depends on | `src/shared/glob.ts` | Provides `filterByGlob` and `matchGlob` functions |
| Depends on | `src/domain/git/paths.ts` | Provides `validateRepoRelative` function |
| Blocks | GH-64 delivery plan | This spec must be accepted before implementation begins |

## 14. OPEN QUESTIONS

N/A — all questions resolved during scope clarification.

## 15. DECISION LOG

| ID | Decision | Rationale | Date |
|----|----------|-----------|------|
| DEC-1 | Use in-memory glob filtering instead of git pathspec translation | Translation would require mapping `**` to git's complex pathspec syntax (wildcards, charsets, etc.) and would be fragile. In-memory filtering uses the existing, tested glob matcher and is simple and maintainable. | 2026-07-13 |
| DEC-2 | Retain `validateRepoRelative` pattern validation | Even though patterns are no longer passed to git as pathspecs, the validation guard provides defense-in-depth and maintains the invariant that malicious patterns are caught before any git spawn. | 2026-07-13 |
| DEC-3 | Use union semantics for multiple patterns | Consistent with existing `selectFiles` behavior in the config layer; a file is included if it matches ANY pattern. | 2026-07-13 |
| DEC-4 | Empty patterns return empty map (intentional correction) | The current implementation returns all files when `patterns=[]` (accidental git behavior). This is inconsistent with app-layer `selectFiles` semantics where empty select → empty result. The fix makes empty patterns return an empty map, aligning with standard glob semantics and the designed contract. | 2026-07-13 |

## 16. AFFECTED COMPONENTS (HIGH-LEVEL)

| Component | Impact |
|-----------|--------|
| `src/infra/git/shell-git.ts` | Updated — `readCommitted` implementation changed to list all files and filter in-memory |
| `tests/unit/infra/git/shell-git.test.ts` | Updated — add tests for `**` pattern matching and union semantics |
| `tests/integration/app/shell-git-safety-fuzz.test.ts` | No changes — existing safety fuzz tests must remain passing |

## 17. ACCEPTANCE CRITERIA

### Pattern matching correctness

| ID | Criterion | Linked |
|----|-----------|--------|
| AC-F1-1 | **Given** a repository with nested markdown files (e.g., `docs/a.md`, `docs/b/c.md`, `docs/d/e/f.md`), **when** `readCommitted("HEAD", ["docs/**/*.md"])` is called, **then** all three files are returned in the result map. | F-1 |
| AC-F1-2 | **Given** a repository with both markdown and non-markdown files, **when** `readCommitted("HEAD", ["docs/**/*.md"])` is called, **then** only `.md` files are returned (e.g., `docs/image.png` is excluded). | F-1 |
| AC-F1-3 | **Given** a repository with files at multiple depths, **when** `readCommitted("HEAD", ["**/test.md"])` is called, **then** `test.md` at root and any nested `test.md` files are returned. | F-1 |

### Union semantics

| ID | Criterion | Linked |
|----|-----------|--------|
| AC-F2-1 | **Given** a repository with files `docs/a.md` and `README.md`, **when** `readCommitted("HEAD", ["docs/**/*.md", "README.md"])` is called, **then** both files are returned. | F-2 |
| AC-F2-2 | **Given** a repository with files `docs/a.md`, `docs/b/c.md`, and `src/d.md`, **when** `readCommitted("HEAD", ["docs/**/*.md", "src/**/*.md"])` is called, **then** `docs/a.md`, `docs/b/c.md`, and `src/d.md` are all returned. | F-2 |

### Starter config functionality

| ID | Criterion | Linked |
|----|-----------|--------|
| AC-G2-1 | **Given** a new user runs `marksync init`, which creates a starter config with `select: ["docs/**/*.md"]`, **when** the user has nested markdown files under `docs/`, **then** `marksync plan` produces a non-empty plan with the expected files. | G-2 |
| AC-G2-2 | **Given** a repository with a flat `docs/` directory containing `intro.md` and `guide.md`, **when** the starter config pattern `docs/**/*.md` is used, **then** both files are discovered. | G-2 |

### Security regression guard

| ID | Criterion | Linked |
|----|-----------|--------|
| AC-F3-1 | **Given** a malicious pattern containing `..` (e.g., `docs/../../etc/passwd`), **when** `readCommitted` is called with this pattern, **then** an error is thrown before any git spawn occurs. | F-3, NFR-SEC-7 |
| AC-F3-2 | **Given** a malicious pattern containing shell metacharacters (e.g., `docs;rm-rf/`), **when** `readCommitted` is called with this pattern, **then** an error is thrown before any git spawn occurs. | F-3, NFR-SEC-7 |
| AC-F3-3 | **Given** the existing safety fuzz test suite (TC-INTEGRATION-009), **when** all tests are run after the fix, **then** 100% of tests pass with no regressions. | F-3, NFR-SEC-7 |

## 18. ROLLOUT & CHANGE MANAGEMENT (HIGH-LEVEL)

This is a bug fix with no breaking changes. The rollout strategy is:

1. **Merge**: Merge the fix as a standard feature branch PR to `main`.
2. **Verification**: Run the full CI suite (unit, integration, golden fixture, E2E).
3. **Release**: Include the fix in the next patch release (e.g., v0.1.1 if v0.1.0 is the current release).
4. **Communication**: No special communication needed — this is a transparent fix that restores expected behavior.

## 19. DATA MIGRATION / SEEDING (IF APPLICABLE)

N/A — no data migration required. This is a runtime behavior fix with no persistent state impact.

## 20. PRIVACY / COMPLIANCE REVIEW

N/A — no privacy or compliance implications. The change affects only local git file listing and glob matching.

## 21. SECURITY REVIEW HIGHLIGHTS

The primary security concern is maintaining the invariant that malicious patterns are rejected before git spawn. The fix addresses this by:

1. **Retaining `validateRepoRelative`**: Pattern validation is unchanged and still called before git spawn.
2. **No new attack surface**: In-memory glob matching operates on strings returned by git, not on user-supplied data.
3. **No changes to per-filename validation**: When reading individual files via `git show`, each filename is still validated via `validateRepoRelative`.

The existing safety fuzz test suite (TC-INTEGRATION-009) validates the malicious-path invariant and must remain passing.

## 22. MAINTENANCE & OPERATIONS IMPACT

**Positive maintenance impact**: The fix simplifies the implementation by removing the git pathspec dependency for glob matching. The glob semantics are now centralized in `src/shared/glob.ts`, which is easier to test and maintain.

**No operational impact**: No changes to deployment, monitoring, or operational procedures. The fix is transparent to end users — existing patterns continue to work, and previously broken patterns (`**`) now work as expected.

## 23. GLOSSARY

| Term | Definition |
|------|------------|
| Git pathspec | The pattern syntax used by git commands (e.g., `git ls-tree`) to filter paths. Pathspec `*` matches non-`/` characters only; `**` is not a special recursive wildcard in git pathspec. |
| Glob pattern | A pattern matching syntax for file paths, popularized by tools like npm, TypeScript, and shell wildcards. In micromatch-style globs, `**` matches any number of path segments, including zero. |
| Union semantics | When multiple selection patterns are provided, a file is included if it matches ANY pattern (logical OR). |
| Repo-relative path | A file path relative to the git repository root (e.g., `docs/intro.md`), not an absolute path. |

## 24. APPENDICES

### A.1 Git pathspec vs glob pattern examples

| Pattern | Git pathspec result | Glob matcher result (target) |
|---------|---------------------|------------------------------|
| `docs/**/*.md` | Matches nothing (`**` treated as `*`, no `/` allowed) | Matches `docs/a.md`, `docs/a/b.md`, `docs/a/b/c.md` |
| `docs/*` | Matches `docs/a.md`, `docs/b.md` | Same as git pathspec |
| `**/test.md` | Matches nothing (`**` treated as `*`) | Matches `test.md` at any depth |

### A.2 Test fixture structure (for new tests)

```text
test-repo/
  docs/
    a.md
    b/
      c.md
      d/
        e.md
    image.png
  README.md
  src/
    d.md
```

## 25. DOCUMENT HISTORY

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-07-13 | Juliusz Ćwiąkalski | Initial specification |
| 1.1 | 2026-07-13 | Juliusz Ćwiąkalski | Minor DoR fixes: clarified empty-patterns edge case as intentional correction (DEC-4), reclassified NFR-PERF-5 as informational |

---

## AUTHORING GUIDELINES

This specification was authored based on:
- The GitHub issue GH-64 with reproduction steps and root cause analysis
- Code inspection of `src/infra/git/shell-git.ts`, `src/shared/glob.ts`, `src/domain/git/port.ts`, and `src/domain/git/paths.ts`
- Context from the MarkSync architecture overview (ADR-0001, ADR-0006, TDR-0003)
- Testing strategy from `.ai/rules/testing-strategy.md` and existing test files

## VALIDATION CHECKLIST

- [x] `change.ref` matches provided `workItemRef` (GH-64)
- [x] `owners` has at least one entry
- [x] `status` is "Proposed"
- [x] All sections present in order (1-25 + guidelines + checklist)
- [x] ID prefixes consistent and unique (F-, AC-, NFR-, RSK-, DEC-, DM-, OQ-)
- [x] Acceptance criteria reference at least one F-/NFR- ID and use Given/When/Then
- [x] NFRs include measurable values
- [x] Risks include Impact & Probability
- [x] No implementation details (no file-level code paths, no step-by-step tasks)
- [x] No content duplicated from linked docs
- [x] Front matter validates per front_matter_rules