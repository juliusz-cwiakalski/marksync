---
# Copyright (c) 2025-2026 Juliusz Ćwiąkalski (https://www.cwiakalski.com | https://www.linkedin.com/in/juliusz-cwiakalski/ | https://x.com/cwiakalski)
# MIT License - see LICENSE file for full terms
id: TDR-0008
decision_type: tdr
status: Proposed
created: 2026-07-05
decision_date: null
last_updated: 2026-07-05
summary: "Use commitlint (Conventional Commits config) as the linter, wired via husky's commit-msg hook for local pre-push feedback AND as a CI commit-message-lint job for the authoritative gate. Answers the owner's question: commitlint is NOT itself a hook — it is the linter; a git hook (husky) runs it locally, and CI runs it on push/PR. Biome has no commit-message linting capability. Inception squash-merge commits are grandfathered (not retroactively linted)."
owners:
  - Juliusz Ćwiąkalski
service: marksync-cli
decision_area: tooling
decision_scope: repo
reversibility: easy
review_date: null
business_impact: "Lowest-cost, highest-signal governance gate for a solo+AI workflow: machine-checked Conventional Commits unlock reliable changelog/release automation and give AI agents an unambiguous, auto-verified convention to follow."
customer_impact: "Indirect: clean conventional history enables deterministic release notes and SemVer derivation (release tooling); no runtime effect."
classification:
  domains: [operations]
  archetype: selection
  environment: clear
  rigor: R2
  reversibility: easy
  stakes: low
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
  citations_verified: false
  human_decider: Juliusz Ćwiąkalski
  reviewers: []
revisit_triggers:
  - "husky maintenance stalls or a Bun/Git change breaks the commit-msg hook installation, and simple-git-hooks is a lighter replacement."
  - "The project adopts a release tool that requires a stricter Conventional Commits variant (e.g., scope rules, body-max-length) — extend the commitlint config rather than replace the tool."
  - "Biome adds native commit-message linting with feature parity and the maintainer wants to consolidate tools."
links:
  related_changes: []
  supersedes: []
  superseded_by: []
  spec: []
  contracts: []
  diagrams: []
  decisions: [TDR-0005, TDR-0006, TDR-0007]
  experiments: []
  metrics: []
  roadmap_items: [MS-0002]
---

# TDR-0008: Conventional Commits enforcement — commitlint + husky commit-msg hook + CI lint job

## Context

This decision resolves **OPEN-Q7** (Phase 4 open questions). The `typescript.md` conventions file mandates **Conventional Commits** (`type(scope): description`, ≤72 chars, imperative mood, lowercase) for all commit messages, but there is currently **no enforcement** — no `commitlint`, no CI check, no hook. For a solo+AI workflow, a machine-checked commit convention is the cheapest, highest-signal governance gate available: AI agents especially benefit, because they can be instructed to follow the convention and then **verified automatically** rather than corrected in review.

FACT: `typescript.md` §"Git conventions" mandates Conventional Commits with examples (`feat(state): …`, `fix(confluence): …`, `docs(glossary): …`). FACT: no enforcement exists today. FACT: the inception-phase squash-merge commits themselves deviate (e.g., `Inception Phase 3 — …`) because they are human-authored merge summaries, not per-commit messages — these must be **exempt**, not retroactively linted (C-5). FACT: MarkSync is AI-agent-operable; agents author many commits, so an auto-verified convention is disproportionately valuable. FACT: Biome (TDR-0005) is a **source-file** linter/formatter — it does not lint commit messages (re-verify against current Biome docs, but no commit-message capability is expected).

ASSUMPTION (research-directional, re-verify before lock): `commitlint` + `@commitlint/config-conventional` is the standard, battle-tested JS ecosystem choice for Conventional Commits enforcement; `husky` is the standard git-hook manager; both are actively maintained and run under Bun. A GitHub Action (e.g., `wagoid/commitlint-github-action`) provides CI-side commit-message linting. Re-verify before lock.

**User direction (OPEN-Q7 answer):** "I like the idea of commitlint tooling. We can enable it (guess it's some sort of pre-commit hook?). Record this as decision record."

**Answer to the owner's question (in the record, per request):** **No — `commitlint` is not itself a hook.** `commitlint` is the **linter** (it checks the commit message format against a config). It is run automatically by a **git hook** — specifically the **`commit-msg` hook** (not `pre-commit`), which fires after the commit message is written — managed by **husky** for local feedback before push, and it is also run as a **CI job** that lints commit messages on a push/PR for the authoritative gate. So the full picture is: **commitlint (linter) + husky (`commit-msg` hook, local) + a CI commit-message-lint job (authoritative)**.

## Problem Framing (Clarified)

The surface question ("is commitlint a hook?") is a category confusion worth resolving precisely, because it determines the architecture of the enforcement. The real question is: **what is the minimal, low-friction enforcement that gives both local-before-push feedback (for humans and agents) and an authoritative CI gate — with clear errors when the format is wrong, and an exemption for historical inception merge commits?**

The precise decomposition:

- **commitlint** is a **linter** (a CLI that reads a commit message and validates it against `@commitlint/config-conventional`). It is not a hook and not a CI runner — it is the **engine**.
- A **git hook** is what runs commitlint **automatically at commit time**. The correct hook for message validation is **`commit-msg`** (fires once the message file exists), **not** `pre-commit` (fires before the message editor). A hook manager (**husky**) installs and manages that hook.
- **CI** is the **authoritative** gate: even if a local hook is bypassed (`--no-verify`) or absent (a fresh clone, or an AI agent without hooks installed), the CI commit-message-lint job catches violations on push/PR.

Reframed: adopt **commitlint (linter) + husky (`commit-msg` hook, local feedback) + a CI commit-message-lint job (authoritative gate)**. This gives defense-in-depth: local feedback for fast iteration, CI as the non-bypassable gate. The inception squash-merge commits are grandfathered (enforcement applies to new commits from `MS-0002` start; history is not retroactively linted).

## Constraints (Hard Requirements)

### C-1: Enforces Conventional Commits format on commit messages

- **Statement:** The mechanism must validate commit messages against Conventional Commits (`type(scope): description`, with the standard types `feat|fix|docs|style| refactor|perf|test|build|ci|chore|revert`, ≤72-char subject, imperative mood) using the `@commitlint/config-conventional` preset (or an equivalent rules-as-code config).
- **Source:** `typescript.md` §"Git conventions"; Conventional Commits 1.0 spec.
- **Verification:** A malformed commit message (`updated the thing`, missing type) is rejected with a clear error; a well-formed one (`feat(state): classify three-way sync state`) is accepted.
- **Negotiable:** no.

### C-2: Runs as a local hook AND in CI

- **Statement:** Enforcement must run (a) as a local git hook (`commit-msg`) so humans and agents get feedback **before push**, and (b) as a CI job that lints commit messages on push/PR as the **authoritative** gate (local hooks can be bypassed with `--no-verify` or be absent on a fresh clone / an agent without hooks).
- **Source:** User direction (local hook + CI); defense-in-depth principle; AI-agent-operable requirement (agents may not have hooks installed → CI must be authoritative).
- **Verification:** A bad commit made with `--no-verify` is still rejected by the CI commit-message-lint job.
- **Negotiable:** no (both layers required).

### C-3: Clear feedback to AI agents when the format is wrong

- **Statement:** The rejection message must name the rule that failed, show the offending text, and show the expected shape — so an AI agent can rewrite the message in one pass.
- **Source:** AI-agent-operable requirement; A-VIA-2.
- **Verification:** A deliberately bad message yields a commitlint diagnostic with the rule id (e.g., `type-enum`, `subject-empty`), the offending segment, and the expected format.
- **Negotiable:** no.

### C-4: Low-friction (does not block legitimate commits with confusing errors)

- **Statement:** The default rules must match the convention already documented in `typescript.md` (standard Conventional Commits, no exotic extra rules) so legitimate conventional commits pass on the first try; merge commits and automated commits are exempt so they do not trigger confusing failures.
- **Source:** User direction ("low-friction, not block legitimate commits with confusing errors"); `typescript.md` convention.
- **Verification:** All commit examples in `typescript.md` pass; a `Merge branch …` commit and a `[skip ci]` automated commit are exempt by config.
- **Negotiable:** no.

### C-5: Inception-phase squash-merge commits are exempt

- **Statement:** Existing inception squash-merge commits (human-authored summaries like `Inception Phase 3 — …`) are **grandfathered** — enforcement applies to new commits from `MS-0002` start; history is not retroactively linted. Merge commits generally are exempt via config.
- **Source:** OPEN-Q7 context ("inception squash-merge commits are exempt… human-authored summaries, not per-commit messages").
- **Verification:** `git log --format=%s` on existing history is not run through commitlint; a new `Merge …` commit does not fail the gate.
- **Negotiable:** no.

## Decision Drivers

**Business / product drivers:**
- Machine-checked Conventional Commits unlock reliable changelog generation and SemVer derivation for release automation (the lowest-cost governance gate with the highest downstream leverage).
- Solo+AI workflow: an auto-verified convention removes a whole class of review back-and-forth.

**Technical drivers:**
- Rules-as-code (`commitlint` config) — the convention is reviewable in a config file, not folklore.
- Local + CI defense-in-depth: fast iteration locally, non-bypassable gate in CI.
- Clear, structured diagnostics for agents.

**Operational drivers:**
- Low-friction: standard preset, merge/automated commits exempt.
- Reversible: a commit-convention tool swap is config + hook removal — among the lowest-stakes choices.
- Composes with the existing GitHub Actions CI (TDR-0004/0005).

## Mental Models & Techniques Used

- **First Principles:** What is irreducible? A linter that validates a commit message against rules, triggered automatically at commit time and authoritatively in CI. commitlint is the linter; the hook and CI are the triggers. Separating these three is the key insight (it answers the owner's question).
- **Inversion:** "How does commit enforcement fail an AI agent?" → (a) local hook absent on the agent's clone → bad commit pushed; (b) cryptic rejection → agent rewrites blindly; (c) legitimate merge commit blocked → agent force-skips the gate. CI-authoritative linting closes (a); commitlint's rule-named diagnostics close (b); merge/automated-commit exemptions close (c).
- **Defense in Depth:** Local hook (fast, bypassable) + CI gate (authoritative, non-bypassable). Neither alone is sufficient — `--no-verify` defeats the hook; a skipped CI defeats the gate. Together they cover both.
- **Opportunity Cost:** husky vs simple-git-hooks: husky is more battle-tested and standard (larger docs/training-data footprint → better for AI-agent clarity); simple-git-hooks is lighter. The cost of husky's slightly larger footprint is outweighed by its standardness for an agent-operable repo.
- **KISS:** Use the standard `@commitlint/config-conventional` preset — do not invent custom rules. The convention is already documented; the preset encodes it exactly.
- **Evidence weighting:** commitlint/husky "standard/battle-tested" status is research-directional; re-verify before lock. Biome's lack of commit-message linting is a structural fact of its scope (source-file linter/formatter), re-verify against current docs.

## Alternatives Considered

### Maturity & Adoption (ecosystem health)

Commit-message linting is a small, stable niche. Figures are **research-directional** (2026-07-05) and **must be re-verified** before lock — `citations_verified: false`. License strings are FACT; **license compatibility is a human determination**.

| Signal | commitlint | husky | simple-git-hooks | CI commit-lint Action | Biome (commit-msg) |
|---|---|---|---|---|---|
| License string | FACT: MIT | FACT: MIT | FACT: MIT | varies by Action (re-verify) | FACT: MIT |
| Maturity | The Conventional Commits linting standard | The JS git-hook standard | Mature, lighter alternative | Mature Actions exist | No commit-message linting capability (re-verify) |
| Approach | Rules-as-code linter | Hook manager (`commit-msg`, etc.) | Hook manager (package.json config) | CI-side commit-message lint | Source-file linter only |
| Risk | None specific | Slightly heavier than simple-git-hooks | Smaller community than husky | CI-only (no local feedback) | Fails C-1 |

Sources: commitlint.js.org, github.com/typicode/husky, github.com/toplenboren/simple-git-hooks, biomejs.dev (re-verify before lock).

### Per-Alternative Constraint-Compliance Evaluation

Legend: ✅ = passes · ❌ = fails · ⚠️ = passes only via an accepted-risk exception (constraint must be `Negotiable: no`).

|          | C-1 (Conventional Commits) | C-2 (local hook AND CI) | C-3 (clear agent feedback) | C-4 (low-friction) | C-5 (inception exempt) |
|----------|----------------------------|--------------------------|----------------------------|--------------------|------------------------|
| Alt 0 (no enforcement) | ❌ | ❌ | ❌ | n/a | n/a |
| Alt 1 — commitlint + husky + CI job | ✅ | ✅ | ✅ | ✅ | ✅ |
| Alt 2 — commitlint + simple-git-hooks + CI job | ✅ | ✅ | ✅ | ✅ | ✅ |
| Alt 3 — CI-only commit-lint Action (no local hook) | ✅ | ⚠️ (no local feedback — fails "AND") | ✅ | ✅ | ✅ |
| Alt 4 — Biome commit-message lint | ❌ (no such capability) | ❌ | ❌ | n/a | n/a |

### Alternative 0 — Do Nothing / No enforcement

- **Eligibility:** Not eligible (fails C-1, C-2, C-3).
- **Summary:** Rely on the `typescript.md` convention and human/agent discipline alone.
- **Constraint compliance:** C-1 ❌; C-2 ❌; C-3 ❌.
- **Why rejected:** On an agent-operable codebase where agents author many commits, unenforced conventions drift immediately. This is precisely the gap OPEN-Q7 flags.

### Alternative 1 — commitlint + husky + CI commit-lint job (RECOMMENDED)

- **Eligibility:** Eligible (passes all five constraints).
- **Summary:** `commitlint` + `@commitlint/config-conventional` as the linter; `husky` managing the `commit-msg` hook for local feedback; a CI commit-message-lint job (e.g., a commitlint GitHub Action) for the authoritative gate. Merge/automated commits exempt via config.
- **Constraint compliance:** C-1 ✅; C-2 ✅ (local hook + CI); C-3 ✅ (rule-named diagnostics); C-4 ✅ (standard preset, merge/automated exempt); C-5 ✅ (history grandfathered; merge commits exempt).
- **Driver fit:** Best — battle-tested standard (husky is the JS hook standard; commitlint is the Conventional Commits standard), AI-clear diagnostics, defense-in-depth. husky's larger community/docs footprint aids agent clarity.
- **Pros:** Standard, battle-tested, well-documented; defense-in-depth (local + CI); clear rule-named errors; merge/automated-commit exemptions built in.
- **Cons:** husky is slightly heavier than simple-git-hooks (a `.husky/` directory + a `prepare` script) — acceptable for the standardness/agent-clarity benefit.
- **Why chosen:** The standard, battle-tested combination that satisfies all five constraints with defense-in-depth. Matches the owner's "commitlint tooling… pre-commit hook" intent, corrected to the precise `commit-msg` hook.

### Alternative 2 — commitlint + simple-git-hooks + CI job

- **Eligibility:** Eligible (passes all five constraints).
- **Summary:** Same commitlint + CI job, but with `simple-git-hooks` instead of husky — package.json-config hook management, lighter footprint.
- **Constraint compliance:** C-1 ✅; C-2 ✅; C-3 ✅; C-4 ✅; C-5 ✅.
- **Driver fit:** Strong, but simple-git-hooks has a smaller community/docs footprint than husky — marginally worse for AI-agent clarity (less training data).
- **Pros:** Lighter than husky; single-file config.
- **Cons:** Smaller ecosystem; fewer examples for agents to learn from.
- **Why rejected as primary:** Eligible, but loses the "battle-tested / standard" driver marginally to husky. Retained as the fallback if husky's footprint ever proves bothersome or husky stalls (revisit trigger).

### Alternative 3 — CI-only commit-lint Action (no local hook)

- **Eligibility:** Not eligible (fails C-2's "AND" — no local feedback).
- **Summary:** A GitHub Action that lints commit messages on push/PR, with no local hook.
- **Constraint compliance:** C-1 ✅; C-2 ⚠️ (CI-only — no local-before-push feedback; the constraint requires both); C-3 ✅; C-4 ✅; C-5 ✅.
- **Why rejected:** Fails C-2 (non-negotiable "AND") — the owner explicitly wants a local hook ("some sort of pre-commit hook"). CI-only also degrades the agent loop (the agent discovers the violation only after push). The CI job is retained as the **authoritative half** of Alt 1, not a standalone.

### Alternative 4 — Biome commit-message lint

- **Eligibility:** Not eligible (fails C-1, C-2, C-3).
- **Summary:** Hypothetical use of Biome to lint commit messages.
- **Constraint compliance:** C-1 ❌ (Biome is a source-file linter/formatter; it has **no commit-message linting capability** — re-verify against current Biome docs, but none is expected); C-2 ❌; C-3 ❌.
- **Why rejected:** Biome does not lint commit messages. This alternative exists only to document that the tool chosen in TDR-0005 does not cover this concern — preventing a "did you consider Biome?" reopening.

## Decision

**Recommendation: Alternative 1 — `commitlint` + `@commitlint/config-conventional` (linter), wired via `husky`'s `commit-msg` hook for local feedback, plus a CI commit-message-lint job for the authoritative gate.**

The decision is driven by **C-2 (local hook AND CI — defense-in-depth)** and **C-3 (clear, rule-named agent feedback)**, with the standard `@commitlint/config-conventional` preset satisfying C-1 and C-4, and the grandfathering/merge-exempt config satisfying C-5.

**Direct answer to the owner's question:** commitlint is **not** a hook. It is the **linter** (validates the message against `@commitlint/config-conventional`). It is run automatically by a git hook — the **`commit-msg`** hook (not `pre-commit`), which fires after the message is written — managed by **husky** for local feedback, and it is also run as a **CI commit-message-lint job** that provides the authoritative, non-bypassable gate. So the full enforcement is a **three-part composition**: commitlint (engine) + husky `commit-msg` (local trigger) + CI lint job (authoritative trigger).

Two design consequences:

1. **husky over simple-git-hooks** for the standardness/agent-clarity benefit (larger docs/training footprint). simple-git-hooks is the documented fallback (revisit trigger).
2. **CI is authoritative.** Because local hooks are bypassable (`--no-verify`) and may be absent on a fresh clone or an AI agent without hooks installed, the CI commit-message-lint job is the gate that actually enforces the convention. The local hook is for fast feedback, not enforcement.

> **AI-assistance disclosure:** This analysis is AI-assisted, grounded in the
> `typescript.md` Git-conventions section, the OPEN-Q7 context, and
> research-directional findings on the 2026 commit-linting ecosystem. The
> "commitlint/husky standard/battle-tested" claims are **research-directional**
> and **must be re-verified** against canonical sources (commitlint.js.org,
> github.com/typicode/husky, npm) before the tool is locked.
> `citations_verified: false`. Biome's lack of commit-message linting is a
> scope statement — re-verify against current Biome docs. License strings
> recorded as FACT (MIT); **license compatibility is a human determination**.
> `status: Proposed` until human sign-off at merge.

### Constraint Compliance Attestation

The recommended alternative (Alt 1 — commitlint + husky + CI job) satisfies all documented constraints:

- **C-1 — ✅ Full compliance:** `commitlint` + `@commitlint/config-conventional` validates the full Conventional Commits shape (`type(scope): description`, standard type enum, ≤72-char subject, imperative mood) exactly as documented in `typescript.md`.
- **C-2 — ✅ Full compliance:** husky installs the `commit-msg` hook (local feedback before push) **and** a CI commit-message-lint job lints commits on push/PR (authoritative gate). A `--no-verify` local bypass is still caught by CI.
- **C-3 — ✅ Full compliance:** commitlint emits rule-named diagnostics (`type-enum`, `subject-empty`, `header-max-length`, etc.) with the offending text and the expected shape — directly actionable by an AI agent.
- **C-4 — ✅ Full compliance:** the standard preset matches `typescript.md` exactly (no exotic rules); merge commits and automated commits (`[skip ci]`, bot commits) are exempt via config so legitimate commits are not blocked.
- **C-5 — ✅ Full compliance:** enforcement applies to new commits from `MS-0002` start; existing inception squash-merge commits are grandfathered (not retroactively linted); `Merge …` commits are exempt by config.

No accepted-risk exceptions are required.

## Trade-offs & Consequences

### Positive Outcomes

- Machine-checked Conventional Commits — the cheapest governance gate with the highest downstream leverage (changelog/SemVer automation).
- Defense-in-depth: fast local feedback + authoritative CI gate.
- Clear, rule-named diagnostics — agents self-correct in one pass.
- Standard preset — low-friction, matches the documented convention.
- Reversible: hook + config removal is trivial.

### Negative Outcomes

- husky adds a `.husky/` directory + a `prepare` script (mitigated: standard, well-understood; simple-git-hooks is the lighter fallback).
- A CI job for commit-message linting adds a small amount of CI configuration (mitigated: a single reusable Action).
- Contributors/agents must have husky hooks installed locally to get local feedback — but CI is authoritative regardless, so this is a feedback-latency trade-off, not an enforcement gap.

### Unresolved Questions

- [ ] **CI Action selection:** pick a specific commitlint GitHub Action (e.g., `wagoid/commitlint-github-action`) or run commitlint directly in a step — confirm license + maintenance before lock. (owner: Juliusz Ćwiąkalski)
- [ ] **Scope enforcement:** decide whether to enforce a closed scope enum (e.g., `state|confluence|cli|render|config|lock|git|mermaid|docs|ci|…`) or leave scope free-form. Free-form is lower-friction; a closed enum is stricter. (owner: Juliusz Ćwiąkalski)
- [ ] **Body/footer rules:** decide whether to enforce body line-length (72) and footer-reference conventions (`Closes #123`, `Refs ADR-0006`) as commitlint rules or leave them advisory. (owner: Juliusz Ćwiąkalski)

### Four-risk awareness

- **Value** — enables release automation (changelog/SemVer from conventional history); no value-driver regression.
- **Usability** — strong: local feedback + clear errors; low-friction standard preset.
- **Feasibility** — low uncertainty: commitlint/husky are standard, proven under Node-compatible runtimes; re-verify Bun-pin compat before lock.
- **Viability** — strong for a solo+AI workflow: auto-verified convention removes a class of review friction; reversible.

## Implementation Plan

1. **Add commitlint** (`@commitlint/cli`, `@commitlint/config-conventional`) and **husky** to `devDependencies`; add a `prepare` script that installs hooks.
2. **commitlint config:** `commitlint.config.js` extending `@commitlint/config-conventional`; configure `header-max-length: 72`, imperative-mood rule, and merge/automated-commit exemptions (`ignores` for `Merge …`, bot commits).
3. **husky `commit-msg` hook:** `echo 'bunx commitlint --edit "$1"' > .husky/commit-msg` (runs commitlint on the message file). Note: this is the `commit-msg` hook, not `pre-commit`.
4. **CI job:** add a commit-message-lint step/job to the push + PR pipeline (via a commitlint Action or a direct `bunx commitlint --from=HEAD~N --to=HEAD` step); unguard at `MS-0002` start (OPEN-Q9 checklist).
5. **Grandfathering:** do not retroactively lint existing history; enforcement applies to new commits from `MS-0002` start (document in the repo's contributing/README pointer).
6. **Scope policy:** (defer to Unresolved Question) start free-form; tighten to a closed enum only if drift becomes noisy.
7. **README pointer:** document the convention + the `--no-verify` escape hatch + that CI is authoritative.

**Risk mitigation during implementation:** if a legitimate automated workflow (e.g., a bot commit, a dependabot bump) is blocked, add it to the `ignores` list rather than weakening the convention. If an AI agent repeatedly produces a specific malformed shape, add a clearer `helpUrl` to the relevant commitlint rule.

## Verification Criteria

- **Metric: Local hook** — Target: a malformed commit message is rejected by the husky `commit-msg` hook before push — Window: `MS-0002` (C-2).
- **Metric: CI authoritative gate** — Target: a bad commit made with `--no-verify` is rejected by the CI commit-message-lint job — Window: `MS-0002` (C-2).
- **Metric: Conventional validity** — Target: all commit examples in `typescript.md` pass; a missing-type / over-length / non-imperative message is rejected — Window: `MS-0002` (C-1).
- **Metric: Exemptions** — Target: `Merge …` and automated `[skip ci]` commits pass without confusing errors — Window: `MS-0002` (C-4, C-5).
- **Metric: Agent feedback clarity** — Target: a deliberately bad message yields a rule-named diagnostic with offending text + expected shape — Window: `MS-0002` (C-3).

## Confidence Rating

**High.** commitlint + husky + a CI job cleanly satisfies all five constraints and matches the owner's intent (corrected precisely: `commit-msg` hook, not `pre-commit`). The decision is among the lowest-stakes (reversibility: easy; stakes: low). Residual uncertainty is low: re-verify the specific CI Action's license/maintenance and the current versions' Bun-pin compatibility before lock. Biome does not cover this concern (Alt 4 fails C-1 structurally).

## Lessons Learned (Retrospective)

TODO: Populate after implementation.

## References

- TDR-0005 — `doc/decisions/TDR-0005-linter-and-formatter.md` (Biome owns source-file lint+format; does NOT lint commit messages — Alt 4 here).
- TDR-0006 — `doc/decisions/TDR-0006-import-boundary-enforcement.md` (companion Phase-4 tooling decision).
- TDR-0007 — `doc/decisions/TDR-0007-gherkin-bdd-runner.md` (companion Phase-4 tooling decision).
- `.ai/rules/typescript.md` — §"Git conventions" (Conventional Commits mandate + examples).
- `doc/inception/open-questions/phase-4-open-questions.md` — OPEN-Q7 (Conventional Commits enforcement).
- Conventional Commits 1.0 spec — conventionalcommits.org.
- External research (directional, re-verify): commitlint.js.org, github.com/typicode/husky, github.com/toplenboren/simple-git-hooks, github.com/wagoid/commitlint-github-action, biomejs.dev.
