---
# Copyright (c) 2025-2026 Juliusz Ćwiąkalski (https://www.cwiakalski.com | https://www.linkedin.com/in/juliusz-cwiakalski/ | https://x.com/cwiakalski)
# MIT License - see LICENSE file for full terms
id: ADR-0008
decision_type: adr
status: Proposed
created: 2026-07-04
decision_date: null
last_updated: 2026-07-04
summary: "Use Shell-Git (Bun.spawn + args array) behind the Repository interface: 100% feature coverage, zero bundle/compat risk, git already a prereq for target users. isomorphic-git is the swap option if zero-external-binary becomes a hard requirement; doctor checks git on $PATH."
owners:
  - Juliusz Ćwiąkalski
service: marksync-cli
decision_area: architecture
decision_scope: repo
reversibility: moderate
review_date: null
business_impact: "Determines how MarkSync reads its source of truth (Git) and whether an external git binary is a hard prerequisite for users."
customer_impact: "Affects install prerequisites (git on $PATH) and the reliability of rename detection + worktree status across all supported platforms."
classification:
  domains: [architecture, operations, security]
  archetype: selection
  environment: complicated
  rigor: R2
  reversibility: moderate
  stakes: medium
  urgency: medium
  uncertainty: low
  blast_radius: team
  recurrence: one-off
governance:
  driver: Juliusz Ćwiąkalski
  decider: Juliusz Ćwiąkalski
  contributors: []
  reviewers: []
  performers: [Juliusz Ćwiąkalski]
  informed: []
ai_assistance:
  used: true
  roles: [analyst, record-writer]
  external_data_shared: false
  citations_verified: true
  human_decider: Juliusz Ćwiąkalski
  reviewers: []
revisit_triggers:
  - "A zero-external-binary requirement becomes hard (e.g., a supported platform where git is unavailable or an enterprise lockdown forbids shelling out)."
  - "isomorphic-git resolves the Bun `fs/promises` incompatibility (oven-sh/bun#7818) and reaches feature parity on worktree status + rename detection."
  - "Git CLI introduces a breaking change to the read-only commands MarkSync relies on (`show`, `ls-tree`, `status`, `log --follow`)."
  - "A security review flags the shell-out surface as unacceptable even with args-array + `--` + path validation hardening."
links:
  related_changes: []
  supersedes: []
  superseded_by: []
  spec: ["../inception/system-specification-draft-from-ai-brainstorm.md"]
  contracts: []
  diagrams: []
  decisions: [ADR-0001]
  experiments: []
  metrics: []
  roadmap_items: [MS-0002]
---

# ADR-0008: Git adapter — Shell-Git behind the Repository interface

## Context

This is a sub-decision of ADR-0001 (implementation language and runtime). ADR-0001's Implementation Plan table parks the Git adapter choice: "go-git or shell-git (§9.4) → `isomorphic-git` or shell-git behind the existing `Repository` interface". The tech-stack draft (`doc/overview/tech-stack.md`) lists "Git CLI — external prereq… Behind `Repository` interface. _(Shell-git vs `isomorphic-git` — see OPEN-Q3)_" and flags `[UNCERT-4] Git adapter choice` (medium confidence) in the architecture overview.

MarkSync's source of truth is a Git repository. The Git adapter sits behind the `Repository` port (spec §9.4; architecture-overview.md internal contracts: `readCommitted(ref, patterns)`, `worktreeStatus(paths)`). The adapter's responsibilities are strictly **read-only**:

- Read **committed snapshots at a ref** (no network git operations — no fetch/push/pull).
- **List files at a commit** and read **worktree status**.
- **Rename detection** across commits (needed so a moved Markdown file retains its identity — ADR-0006 C-1).
- Read the **remote URL** (for target/source provenance).

FACT: the spec (§9.4) defaults to shell-git. FACT: the architecture overview records `[UNCERT-4]` shell-git vs `isomorphic-git` at medium confidence. FACT: the `Repository` interface already exists in the spec and architecture-overview.md, so the implementation is swappable by design. FACT: MarkSync never pushes/pulls/fetches — Git is read-only from MarkSync's perspective (architecture-overview.md system context).

**User direction (OPEN-Q3 answer):** "probably any user of this tool would already have git, but maybe it would be easier to integrate with some native library for better git handling (+ it would result in less dependencies and keep the single binary). Create decision record, list all the alternatives and recommend the best one — I'll review."

## Problem Framing (Clarified)

The surface question ("shell-git vs native library") obscures the real trade-off. The real question is: **given that MarkSync's Git access is strictly read-only and the `Repository` interface already makes the implementation swappable, which adapter minimizes bundle/compat risk and maximizes feature coverage (especially rename detection and worktree status) without introducing an unproven dependency or a native binding that breaks the single binary?**

The user's intuition ("a native library might give better git handling + fewer dependencies + keep the single binary") is the right hypothesis to test — but the evidence (below) shows the leading pure-JS option (`isomorphic-git`) has a known Bun incompatibility and weaker rename detection, while the leading native binding (`nodegit`) is unmaintained and breaks the single-binary promise. Shell-git, behind the interface, gives 100% coverage at zero bundle/compat cost — at the price of requiring `git` on `$PATH`, which target users (devs/CI running a git→Confluence sync tool) already have.

Reframed: pick the adapter that (a) passes every constraint, (b) keeps the single binary pure, (c) maximizes feature coverage, and (d) preserves swap optionality to `isomorphic-git` later if zero-external-binary becomes a hard requirement.

## Constraints (Hard Requirements)

### C-1: Read committed snapshots at a ref (no network git operations)

- **Statement:** The adapter must read committed blobs/trees at an arbitrary ref without performing any network git operation (no fetch/push/pull/clone).
- **Source:** Spec §9.4 (read-only Git); architecture-overview.md (Git is read-only from MarkSync's perspective); ADR-0001 (local-first, decentralized via Git + Confluence only).
- **Verification:** An integration test reads a committed snapshot at `HEAD` and at a named ref with the network disabled; no network call is attempted.
- **Negotiable:** no.

### C-2: Worktree status + rename detection across commits

- **Statement:** The adapter must report worktree status (modified/added/deleted/untracked) and detect renames across commits (so a moved Markdown file retains its UUID identity per ADR-0006 C-1).
- **Source:** ADR-0006 C-1 (identity survives renames); spec §9.4; R-FEA-3 (rename detection).
- **Verification:** A fixture with a renamed Markdown file is recognized as the same document across commits; worktree status reflects staged/unstaged changes.
- **Negotiable:** no.

### C-3: Bun `build --compile` compatibility (single binary; no native bindings)

- **Statement:** The adapter must compile into the single self-contained binary via `bun build --compile` with no native C/C++ bindings and no dependency that breaks compilation.
- **Source:** ADR-0001 (C-2 single binary, no mandatory runtime; C-3 cross-compile).
- **Verification:** Release-smoke build produces a runnable binary; `otool`/`ldd` shows no libgit2 or other native binding linked.
- **Negotiable:** no.

### C-4: No shell-injection surface (args array, `--`, path validation)

- **Statement:** Any shell-out to git must use an args array (never shell string interpolation), pass `--` before paths, validate repo-relative paths, and run in a non-interactive git environment. No untrusted input reaches a shell.
- **Source:** R-SEC-1 (supply-chain/security controls); INV-SEC-1 (no secrets in output); internal security standard.
- **Verification:** Code review + a fuzz fixture with malicious path/ref strings (`../`, `;`, backticks, `$()`) confirms no shell execution and paths are rejected.
- **Negotiable:** no.

## Decision Drivers

**Business / product drivers:**
- Target users (developers/CI running a git→Confluence sync tool) already have git installed — requiring it is not a meaningful adoption friction.
- Feature completeness (rename detection, worktree status) is a correctness concern (ADR-0006 identity) and a usability concern (R-USA-1 doctor diagnostics).

**Technical drivers:**
- Single-binary purity (ADR-0001 C-2/C-3): no native bindings.
- Minimal bundle weight and zero compat risk inside the single binary.
- Feature coverage: 100% coverage of read-only Git operations including rename detection.

**Operational drivers:**
- Maintainability: an adapter that is swappable behind the `Repository` interface keeps the swap cost low.
- Operability: a `doctor` check for `git` on `$PATH` makes the prerequisite explicit and diagnosable (R-USA-1).

## Mental Models & Techniques Used

- **First Principles:** What is irreducible? Reading committed snapshots, worktree status, and rename detection — read-only. Which adapter provides all three at zero compat cost?
- **Inversion:** "How does a Git adapter choice break the single binary or leak a secret?" → a native binding (nodegit) breaks the binary; shell string interpolation leaks injection surface. Each is closed by a control below (C-3, C-4).
- **Opportunity Cost:** Shell-git costs an external `git` prerequisite; `isomorphic-git` costs a known Bun incompatibility + weaker rename detection + ~500 KB bundle. Which cost is cheaper to carry and to reverse? The `Repository` interface makes shell-git reversible for free.
- **Second-Order Thinking:** A Bun `fs/promises` incompatibility in `isomorphic-git` (oven-sh/bun#7818) cascades into either patching the library or waiting on Bun — a fragile primary path. Shell-git has no such cascade.
- **Defense in depth:** shell-injection risk is closed by four layered controls (args array, `--`, path validation, non-interactive env), not one.
- **Evidence weighting:** `isomorphic-git`'s Bun incompatibility is a documented open issue (oven-sh/bun#7818); `nodegit` is effectively unmaintained (~2023). These are FACTs that downgrade those alternatives.

## Alternatives Considered

### Per-Alternative Constraint-Compliance Evaluation

Legend: ✅ = passes · ❌ = fails · ⚠️ = passes only via an accepted-risk exception (constraint must be `Negotiable: yes`). Research data: external-researcher, 2026-07-04.

|          | C-1 (read committed snapshots, no network) | C-2 (worktree status + rename detection) | C-3 (bun compile, no native bindings) | C-4 (no shell-injection surface) |
|----------|--------------------------------------------|------------------------------------------|---------------------------------------|----------------------------------|
| Alt 0 (inline shell-git, no interface) | ✅ | ✅ (scattered) | ✅ | ❌ (no centralized path validation) |
| Alt 1 — Shell-Git behind `Repository`  | ✅ | ✅ | ✅ | ✅ |
| Alt 2 — isomorphic-git                  | ⚠️ (reads committed blobs w/o git binary, but Bun `fs/promises` issue #7818) | ⚠️ (limited worktree status; rename detection less mature) | ⚠️ (~500 KB bundle; community-maintained; Bun compat open) | ✅ (no shell) |
| Alt 3 — simple-git                      | ✅ | ✅ | ✅ | ✅ (args array) |
| Alt 4 — nodegit                         | ✅ | ✅ | ❌ (libgit2 native binding; Bun-incompatible) | ✅ (no shell) |
| Alt 5 — just-git                        | ✅ | ❌ (lacks rename detection) | ✅ | ✅ (no shell — pure TS) |
| Alt 6 — WASM git                        | ❌ (no production-ready option in 2026) | ❌ | ⚠️ (no production option) | ✅ |

### Alternative 0 — Do Nothing / Inline shell-git with no `Repository` interface

- **Summary:** Call `Bun.spawn('git', ...)` inline wherever Git access is needed, with no `Repository` port and no centralized path validation.
- **Pros:** No design effort; immediate access.
- **Cons:** Scatters shell-injection surface across the codebase; no centralized path validation; couples business logic to git CLI quirks; violates the ports-and-adapters architecture (architecture-overview.md module governance).
- **Constraint compliance:** C-1 ✅; C-2 ✅ (but scattered); C-3 ✅; **C-4 ❌** (no centralized injection-surface control).
- **Why rejected:** Fails C-4 (non-negotiable) and breaks the hexagonal boundary. This is the lazy baseline the spec's `Repository` interface exists to prevent.

### Alternative 1 — Shell-Git behind the `Repository` interface (RECOMMENDED)

- **Summary:** Wrap the git CLI via `Bun.spawn` with an args array (spec §9.4 default). 100% feature coverage: committed blobs, worktree status, rename detection via `git log --follow`. Zero bundle cost. Requires `git` on `$PATH`. Shell-injection-safe with args array + `--` before paths. Add a `doctor` check for git on `$PATH`.
- **Pros:** 100% coverage; zero bundle/compat risk; proven under Bun; the `Repository` interface preserves swap optionality to `isomorphic-git` later; `doctor` makes the prerequisite diagnosable.
- **Cons:** Requires `git` on `$PATH` (acceptable: target users already have it); shell-out surface (mitigated by C-4 controls).
- **Constraint compliance:** C-1 ✅; C-2 ✅; C-3 ✅; C-4 ✅.
- **Why chosen:** The only alternative that satisfies all four constraints with zero bundle/compat risk and full feature coverage. The interface preserves the swap option the user's intuition asked about.

### Alternative 2 — isomorphic-git (pure JS)

- **Summary:** `isomorphic-git` 1.x — pure JS, reads committed blobs WITHOUT a git binary. Known Bun `fs/promises` compatibility issue (oven-sh/bun#7818); limited worktree-status support; ~500 KB bundle; rename detection (`log` + `follow:true`) less mature than git CLI. Community-maintained.
- **Pros:** No external `git` binary required (best single-binary purity); pure JS.
- **Cons:** Bun `fs/promises` incompatibility (#7818) is a documented open issue; weaker worktree status and rename detection; larger bundle; community-maintained (slower bug fixes).
- **Constraint compliance:** C-1 ⚠️ (reads committed blobs but Bun compat open); C-2 ⚠️ (limited worktree status; rename detection less mature); C-3 ⚠️ (~500 KB; community-maintained; Bun compat open); C-4 ✅.
- **Why rejected as primary:** Three ⚠️ on non-negotiable constraints is unacceptable for a primary choice. Retained as the **swap option** behind the `Repository` interface if zero-external-binary becomes a hard requirement and the Bun incompatibility is resolved.

### Alternative 3 — simple-git

- **Summary:** `simple-git` 3.x — shell-wrapper library, ~30 KB, active 2025.
- **Pros:** Ergonomic API over the git CLI; active.
- **Cons:** Same external `git` dependency as shell-git; adds a dependency for ergonomics only; no feature gain over shell-git behind the interface.
- **Constraint compliance:** C-1 ✅; C-2 ✅; C-3 ✅; C-4 ✅.
- **Why rejected:** No marginal benefit over Alt 1 — same external dependency, same coverage, plus a dependency. The `Repository` interface already provides the ergonomics seam.

### Alternative 4 — nodegit (libgit2 native binding)

- **Summary:** `nodegit` 0.28.x — libgit2 native binding. Effectively unmaintained (~2023).
- **Pros:** Native libgit2 performance; no external git binary.
- **Cons:** Native C binding breaks the single-binary promise (ADR-0001 C-2); Bun-incompatible; unmaintained.
- **Constraint compliance:** C-1 ✅; C-2 ✅; **C-3 ❌** (native binding; Bun-incompatible); C-4 ✅.
- **Why rejected:** Fails C-3 (non-negotiable) — the native binding breaks the single binary and is Bun-incompatible. This is the disqualifying case the user's "native library" hypothesis runs into.

### Alternative 5 — just-git (pure TS)

- **Summary:** `just-git` 0.x — new pure TS, ~20 KB. Lacks rename detection.
- **Pros:** Pure TS, tiny, no external binary.
- **Cons:** Lacks rename detection — a non-negotiable requirement (ADR-0006 C-1); 0.x maturity.
- **Constraint compliance:** C-1 ✅; **C-2 ❌** (no rename detection); C-3 ✅; C-4 ✅.
- **Why rejected:** Fails C-2 (non-negotiable). Rename detection is load-bearing for document identity.

### Alternative 6 — WASM git

- **Summary:** A WebAssembly git implementation. No production-ready option in 2026.
- **Pros:** Would offer pure-WASM single-binary purity if mature.
- **Cons:** No production-ready WASM git exists in 2026.
- **Constraint compliance:** **C-1 ❌**; **C-2 ❌**; C-3 ⚠️; C-4 ✅.
- **Why rejected:** No production-ready option. Not viable in 2026.

## Decision

**Recommendation: Alternative 1 — Shell-Git (Bun.spawn + args array) behind the `Repository` interface.**

Shell-git is the only alternative that satisfies all four constraints with zero bundle/compat risk and 100% feature coverage. The user's hypothesis ("a native library might give better git handling + keep the single binary") is tested and **not borne out by the evidence**: the leading pure-JS option (`isomorphic-git`) has a documented Bun incompatibility (#7818) and weaker rename detection; the leading native binding (`nodegit`) is unmaintained and breaks the single binary. Shell-git, behind the `Repository` interface, gives the best of both — full coverage now, and a free swap to `isomorphic-git` later if zero-external-binary becomes a hard requirement and the Bun issue is resolved.

Four controls close the shell-injection surface (C-4):

1. **Args array** via `Bun.spawn` — never shell string interpolation.
2. **`--`** before every path argument to stop option injection.
3. **Repo-relative path validation** — reject `../`, absolute paths, and non-path strings before reaching git.
4. **Non-interactive git environment** — `GIT_TERMINAL_PROMPT=0`, `GIT_ASKPASS=echo`, no credential helpers invoked.

A **`doctor` check** for `git` on `$PATH` (R-USA-1) makes the prerequisite explicit and diagnosable; a missing git halts with a clear diagnostic before any operation.

> **AI-assistance disclosure:** This analysis is AI-assisted, grounded in
> external-researcher findings (2026-07-04) and the existing ADR-0001
> constraints. The human decider (Juliusz Ćwiąkalski) has **not yet** confirmed.
> `status: Proposed` until human review and confirmation. The
> `isomorphic-git` Bun incompatibility (oven-sh/bun#7818) and `nodegit`
> maintenance status are research-sourced and should be re-verified before the
> adapter is locked.

### Constraint Compliance Attestation

The recommended alternative (Alt 1 — Shell-Git behind the `Repository` interface) satisfies all documented constraints:

- **C-1 — ✅ Full compliance:** Reads committed snapshots at a ref via `git show`/`git ls-tree`; no network git operations (no fetch/push/pull/clone).
- **C-2 — ✅ Full compliance:** Worktree status via `git status`; rename detection via `git log --follow` — 100% coverage of read-only Git operations.
- **C-3 — ✅ Full compliance:** No native bindings; `Bun.spawn` calls the external `git` binary; compiles cleanly into the single binary with zero bundle cost.
- **C-4 — ✅ Full compliance:** Args array + `--` before paths + repo-relative path validation + non-interactive git environment. No shell string interpolation; no untrusted input reaches a shell.

No accepted-risk exceptions are required. The external `git` prerequisite is a driver-level trade-off (not a constraint violation) and is mitigated by the `doctor` check and the target-user profile.

## Trade-offs & Consequences

### Positive Outcomes

- 100% feature coverage (rename detection, worktree status) at zero bundle/compat risk.
- The `Repository` interface preserves a free swap to `isomorphic-git` if zero-external-binary becomes a hard requirement.
- No native bindings — single-binary purity intact (ADR-0001 C-2/C-3).
- The `doctor` check makes the `git` prerequisite explicit and diagnosable.

### Negative Outcomes

- Requires `git` on `$PATH` — an external prerequisite (acceptable for target users: devs/CI running a git→Confluence sync tool).
- Shell-out surface exists (mitigated by four layered C-4 controls).
- Rename detection relies on `git log --follow` heuristics (same as the git CLI's behavior — no regression vs. the spec default).

### Unresolved Questions

- [ ] **Zero-external-binary future:** define the criteria at which `isomorphic-git` becomes a viable swap (Bun #7818 resolved + rename-detection parity). (owner: Juliusz Ćwiąkalski)
- [ ] **Path-validation strictness:** finalize the repo-relative path grammar (reject `../`, absolute, NUL, etc.) and encode it as a reusable validator. (owner: Juliusz Ćwiąkalski)
- [ ] **`doctor` git check depth:** version-floor check (minimum git version for `--follow`/`ls-tree` behavior) vs presence-only. (owner: Juliusz Ćwiąkalski)

### Four-risk awareness

- **Value** — the adapter reads the source of truth (Git) correctly; rename detection protects document identity (ADR-0006 C-1). No value-driver regression.
- **Usability** — the `git` prerequisite is acceptable for target users; the `doctor` check makes it diagnosable rather than a silent failure (R-USA-1).
- **Feasibility** — low uncertainty: shell-git is the spec default, proven under Bun, with 100% coverage. The `isomorphic-git` Bun incompatibility (#7818) is the reason its feasibility is downgraded.
- **Viability** — the `Repository` interface keeps the support matrix narrow (swap adapters, not core) and preserves the zero-external-binary option as a future swap, not a rewrite (R-VIA-1 mitigation).

## Implementation Plan

1. **`Repository` port:** define the interface in `src/domain/` (or `src/app/` per architecture-overview.md) with `readCommitted(ref, patterns)`, `worktreeStatus(paths)`, rename-detection, and remote-URL operations; the adapter implementation lives in `src/infra/git/`.
2. **Shell-Git adapter:** implement via `Bun.spawn('git', [...args, '--', ...paths])`; centralize all shell-out in `src/infra/git/shell-git.ts`.
3. **Path validator:** implement a reusable repo-relative path validator; reject `../`, absolute paths, NUL bytes, and non-path strings before any git call.
4. **Non-interactive environment:** set `GIT_TERMINAL_PROMPT=0`, `GIT_ASKPASS=echo`, and disable credential helpers for all MarkSync-invoked git operations.
5. **`doctor` check:** add a `git` on `$PATH` check (R-USA-1) with a clear diagnostic; halt before any operation if missing.
6. **Read-only enforcement:** the adapter exposes no mutate operations (no add/commit/push/pull/fetch); enforce via the interface and code review.
7. **Swap-cost guardrail:** keep the `Repository` interface stable so `isomorphic-git` can be slotted in later without touching application/domain code.

**Risk mitigation during implementation:** a fuzz fixture with malicious path/ref strings (`../`, `;`, backticks, `$()`) is an acceptance test for C-4; a network-disabled integration test is an acceptance test for C-1.

## Verification Criteria

- **Metric: Read-only, network-disabled** — Target: read a committed snapshot at `HEAD` with the network disabled; no network call attempted — Window: `MS-0002`.
- **Metric: Rename detection** — Target: a renamed Markdown fixture is recognized as the same document (same UUID) across commits — Window: `MS-0002` (ADR-0006 C-1).
- **Metric: Single-binary purity** — Target: compiled binary has no libgit2/native binding linked (`otool`/`ldd` clean) — Window: first release.
- **Metric: Shell-injection safety** — Target: malicious path/ref fuzz fixture is rejected with zero shell execution — Window: `MS-0002`.
- **Metric: `doctor` git check** — Target: `marksync doctor` reports git presence/version and halts with a clear diagnostic if missing — Window: `MS-0002` (R-USA-1).

## Confidence Rating

**High.** Shell-git is the spec default, proven under Bun, with 100% feature coverage and zero bundle/compat risk. The uncertainty is low: the alternatives' disqualifying issues (`isomorphic-git` Bun #7818; `nodegit` unmaintained + native binding; `just-git` no rename detection; WASM git absent) are documented FACTs. The `Repository` interface preserves swap optionality, so the decision is reversible at low cost if zero-external-binary becomes a hard requirement. The `isomorphic-git` Bun incompatibility and `nodegit` maintenance status should be re-verified before the adapter is locked.

## Lessons Learned (Retrospective)

TODO: Populate after implementation.

## References

- ADR-0001 — `doc/decisions/ADR-0001-implementation-language-and-runtime.md` (parent decision; Implementation Plan table parks the Git adapter choice).
- ADR-0006 — `doc/decisions/ADR-0006-document-identity-and-shared-base-state-model.md` (C-1 identity survives renames — load-bearing for rename detection).
- `doc/inception/system-specification-draft-from-ai-brainstorm.md` — §9.4 (Git adapter; shell-git default; `Repository` interface).
- `doc/overview/tech-stack.md` — Git CLI external prereq; shell-git vs `isomorphic-git` (OPEN-Q3).
- `doc/overview/architecture-overview.md` — `[UNCERT-4]` Git adapter choice; module governance (`src/infra/git/` behind `Repository`); internal interface contracts (`readCommitted`, `worktreeStatus`).
- `doc/inception/analysis/id-prefix-catalog.md` — R-SEC-1, R-USA-1, R-FEA-3, INV-SEC-1, MS-0002 identifiers.
- External research (2026-07-04): isomorphic-git.org, github.com/steveukx/git-js, github.com/oven-sh/bun/issues/7818.
