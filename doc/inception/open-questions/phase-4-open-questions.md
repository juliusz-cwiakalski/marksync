---
# Copyright (c) 2025-2026 Juliusz Ćwiąkalski (https://www.cwiakalski.com | https://www.linkedin.com/in/juliusz-cwiakalski/ | https://x.com/cwiakalski)
# MIT License - see LICENSE file for full terms
ados_distribution: project
id: PHASE-4-OPEN-QUESTIONS
status: Draft
created: 2026-07-05
last_updated: 2026-07-05
owners: [Juliusz Ćwiąkalski]
area: process
document_classification: current-truth
summary: "Phase 4 open questions — persisted in-git so answers are durable and reviewable. Answer inline; the bootstrapper incorporates answers into artifacts."
ai_assistance: "AI-assisted drafting; human-authored and approved by Juliusz Ćwiąkalski."
---

# Phase 4 Open Questions

_Open questions for inception Phase 4 (Domain, conventions & quality baseline).
Each item has a stable `OPEN-Q<N>` ID and a status. **To answer:** edit this file
inline under the `### Answer` heading for the relevant question, then the
bootstrapper will incorporate the answer into the affected artifacts and flip
the status to `ANSWERED`._

_Status values: `OPEN` (awaiting answer) · `ANSWERED` (incorporated) · `DEFERRED` (parked for a later phase)._

---

## Open questions

### [OPEN-Q1] Linter/formatter pick — Biome vs ESLint+Prettier

**Status:** DEFERRED

**Question:** The FSE audit (Attribute 6) flags the linter pick as a Phase 4
sub-decision. The typescript.md conventions file records Biome as preferred
(single tool, Rust-fast, Bun-compatible) with ESLint+Prettier as fallback. No
source code exists yet to lint. Should we pick now, or defer to `MS-0002`
implementation start when there is actual code to format?

**Context:**

- Biome: one tool for lint+format, zero config, Rust-fast, but smaller plugin
  ecosystem.
- ESLint+Prettier: mature, huge ecosystem, separate tools with heavier config.
- Import-boundary enforcement (tier rules) is available in both: Biome
  `noRestrictedImports` / ESLint `no-restricted-imports`.
- The choice has no effect on Phase 4 artifacts; CI is scaffolded with
  `continue-on-error` so it works either way.

**Recommendation:** Defer to `MS-0002` start. Pick Biome first; fall back to
ESLint+Prettier only if a needed plugin is unavailable.

### Answer

_Deferred to `MS-0002` implementation start._

_→ If you want to pick now, edit this section. Otherwise, the default is Biome at
`MS-0002` start unless you say otherwise._

---

### [OPEN-Q2] Import-boundary enforcement mechanism

**Status:** DEFERRED

**Question:** The architecture defines tier rules (presentation → application →
domain → infrastructure) and the dependency-direction matrix forbids upward
imports. The typescript.md conventions file says "import-boundary enforcement:
ESLint `no-restricted-imports` or Biome `noRestrictedImports`" — but the exact
mechanism (linter rule vs `dependency-cruiser` vs custom check) is not pinned.

**Options:**

1. **Linter rule** (Biome/ESLint `no-restricted-imports`) — simplest; regex-based
   glob patterns; may be fragile for complex rules.
2. **`dependency-cruiser`** — purpose-built; supports architecture rules as code;
   more setup but more precise.
3. **Custom script** — full control; most maintenance.

**Context:**

- The tier rules are well-defined in `architecture-overview.md`; the question is
  enforcement precision vs setup cost.
- This matters because a solo maintainer (A-VIA-2) can't manually police every
  import.

**Recommendation:** Start with linter rule (option 1); escalate to
`dependency-cruiser` (option 2) if the linter rule produces false
positives/negatives.

### Answer

_Deferred to `MS-0002` implementation start._

_→ If you want to pick now, edit this section. Otherwise, the default is linter
rule at `MS-0002` start._

---

### [OPEN-Q3] Gherkin runner — `@cucumber/cucumber` vs thin wrapper

**Status:** DEFERRED

**Question:** TDR-0004 specifies lifecycle-invariant BDD (INV-SAFE-1/2/3,
INV-SEC-1) via `@cucumber/cucumber` "or a thin wrapper." The testing-strategy.md
records the same. Should we use the full Cucumber library (adds a dependency but
gives `.feature` parsing for free), or write a thin wrapper around `bun:test`
that reads `.feature`-like specs (avoids the dependency)?

**Context:**

- Only 4 invariants → small surface.
- `@cucumber/cucumber` is active (docs updated Jul 2026) and adds `.feature`
  parsing, step definitions, and reporting.
- A thin wrapper is ~50-100 lines of code but avoids the dependency.
- This is a `MS-0002` implementation decision, not a Phase 4 blocker.

**Recommendation:** Defer to `MS-0002` start. Start with
`@cucumber/cucumber` for the ecosystem fit; consider the thin wrapper only if
the dependency proves heavy.

### Answer

_Deferred to `MS-0002` implementation start._

_→ If you want to pick now, edit this section._

---

## Answered this phase

_(None yet.)_

---

## Unknown-unknowns captured (red-team findings M5–M8, L5)

_The Phase 4 anti-sycophancy technique is "unknown-unknowns." The red-team
review identified gaps that are not Phase 4 blockers but must be tracked so
they become known-knowns before `MS-0002` implementation._

### [OPEN-Q4] Accessibility baseline for NFR-A11Y-2/3 — DEFERRED

**Status:** DEFERRED

**Question:** NFR-A11Y-1 (no color dependency) is partially covered by
`MARKSYNC_NO_COLOR` in `.env.example` and the non-interactive auto-detect in
ADR-0011. But **NFR-A11Y-2 (plain-log / screen-reader output mode)** has no
implementation guidance, and **NFR-A11Y-3 (visible provenance panel/footer)**
has no design note for how the Confluence-side panel is structured.

**Context:** The output service (ADR-0011) is a first-class component. A
`--plain` or screen-reader-friendly output path needs design: how it interacts
with redaction, JSON vs human output, and how it is tested. The provenance
panel/footer needs a content contract (what fields, what format, where placed).

**Recommendation:** Create `doc/guides/accessibility-baseline.md` at `MS-0002`
start covering: `--no-color`/auto-detect, a `--plain`/screen-reader output
path, and the provenance panel/footer content contract. Wire a
`MARKSYNC_NO_COLOR`-driven test into the redaction suite.

### Answer

_Deferred to `MS-0002` implementation start._

---

### [OPEN-Q5] Performance measurement baseline for product NFRs — DEFERRED

**Status:** DEFERRED

**Question:** `testing-strategy.md` defines a repo-local **test-suite**
benchmark (TDR-0004 §8) but there is no methodology or target artifact for the
**product** NFRs: NFR-PERF-1 (binary ~90 MB), NFR-PERF-2 (cold start ~2 s),
NFR-PERF-5 (conversion ≤200 ms p95 at ≤500 pages). These are "desired, not
hard" targets but even soft targets need a measurement plan to detect
regressions.

**Context:** Without a measurement harness, binary-size creep and conversion
latency regressions will go unnoticed until users complain. The harness needs:
binary-size measurement per OS/arch, cold-start measurement on a reference
runner, and a representative ~500-page conversion-latency test.

**Recommendation:** Add a `performance-baseline.md` (or a section in
`testing-strategy.md`) at `MS-0002` start defining how binary size, cold-start,
and conversion latency are measured and tracked. Commit to a "first measurement
at `MS-0002` end" even if targets are soft.

### Answer

_Deferred to `MS-0002` implementation start._

---

### [OPEN-Q6] Provenance `version.message` length-limit spike — DEFERRED

**Status:** DEFERRED

**Question:** ADR-0006, ADR-0010, NFR-REL-9/11, and UNCERT-3 all depend on a
**verification spike** for the Confluence `version.message` /
history-description length limit and the deterministic trimming strategy. It
is load-bearing for provenance correctness and explicitly required before
implementation.

**Context:** The spike needs to determine: (a) the exact character/byte limit
on `version.message` and history-description fields in Confluence Cloud REST
v2; (b) the deterministic trimming rule when the provenance string exceeds the
limit; (c) how squashed summaries (ADR-0010) and potential future
commit-by-commit summaries interact with the limit.

**Recommendation:** Schedule this spike as a `MS-0002` prerequisite backlog
item (`SPIKE-N`). The spike output is a deterministic trimming strategy +
the verified limit number, which feeds NFR-REL-11 acceptance criteria.

### Answer

_Deferred to `MS-0002` backlog planning._

---

### [OPEN-Q7] Conventional Commits enforcement — DEFERRED

**Status:** DEFERRED

**Question:** `typescript.md` §"Git conventions" mandates Conventional Commits
(`type(scope): description`, ≤72 chars), but there is no `commitlint`, no CI
check, and no PR template enforcing it. The inception squash-merge commits
themselves deviate (e.g. `dfa3ce5 Inception Phase 3 — …`).

**Context:** For a solo+AI workflow, a machine-checked commit convention is
the cheapest, highest-signal governance gate. AI agents especially benefit
from a linted convention (they can be told to follow it and verified
automatically).

**Recommendation:** Two options: (a) wire a lightweight `commitlint` +
Conventional-Commits CI check at `MS-0002` start; or (b) defer enforcement to
Phase 5 (PR template + code-review-instructions). Decide and record the
decision. Inception-phase squash-merge commits are exempt (they are
human-authored summaries, not per-commit messages).

### Answer

_Deferred — enforcement at Phase 5 (PR template) or `MS-0002` start (commitlint)._

---

### [OPEN-Q8] `keytar`-under-Bun-compile spike — DEFERRED

**Status:** DEFERRED

**Question:** Three Phase 4 docs (`typescript.md`, `security-baseline.md`,
`dev-environment.md`) make the auth-path decision contingent on the keytar
spike: `keytar` is a native module that may conflict with Bun
`build --compile`. If it fails, env-token is the guaranteed `MS-0002` path.
But the spike itself is not scheduled or tracked.

**Context:** The spike needs to verify: (a) does `keytar` compile under
`bun build --compile` for Linux + Windows (the `MS-0002` target OSes)? (b) if
not, is there an alternative keyring library that does? (c) what is the
fallback UX for users without keyring?

**Recommendation:** Schedule as a `MS-0002` prerequisite backlog item
(`SPIKE-N`). The env-token path is guaranteed regardless of the spike outcome;
keyring support is optional until the spike passes.

### Answer

_Deferred to `MS-0002` backlog planning._

---

## Notes

- All three open questions are **deferred to `MS-0002` implementation start**
  because no source code exists yet. The Phase 4 artifacts (conventions,
  testing-strategy, CI) are scaffolded to work with any choice, and the CI uses
  `continue-on-error` guards during inception.
- If you prefer to resolve any of these now, edit the relevant `### Answer`
  section above. The bootstrapper will incorporate the answer into
  `typescript.md`, `testing-strategy.md`, and the CI workflow as needed.
