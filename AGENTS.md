# AGENTS.md

Quick-reference for AI coding agents and human contributors working in this repo.

## What this repo is

**MarkSync for Confluence** is a CLI tool that synchronizes a Git-tracked
Markdown corpus to Atlassian Confluence Cloud — deterministically, safely, and
with a clear audit trail. It is the first adapter of the MarkSync core; other
wiki/adapters may follow.

- **Language / runtime**: TypeScript on a Bun single-binary (`ADR-0001`).
- **Markdown pipeline**: remark / HAST; Storage Format is the write target
  (`ADR-0005`).
- **Render**: official Mermaid in-process, deterministically (`ADR-0002`).
- **State model**: source-side immutable UUID v7 + committed versioned lock +
  disposable `.marksync/` cache (`ADR-0006`).

The repo is currently **post-inception, pre-implementation**: `MS-0001` (API
validation spike) is complete; `MS-0002` (MVP safe one-way publisher) is the
active milestone. See [doc/overview/02-roadmap.md](doc/overview/02-roadmap.md).

> **New to ADOS?** See [doc/guides/onboarding-existing-project.md](doc/guides/onboarding-existing-project.md) or run `/bootstrap` to get started.

## Code style

MarkSync code is **AI-authored and human-reviewed**. The guiding principle:
**self-documenting code, minimal comments, no spec restatements.**

- **Code first, prose second.** Types, names, and structure carry meaning. A
  comment explains only what the code cannot — a non-obvious decision, a
  Confluence quirk, a security boundary.
- **File headers ≤ 3 lines.** What the module is + one link to the spec/ADR if
  load-bearing. No tier-rule essays, no ASCII tables, no design-decision
  restatements.
- **Cite the authority once.** When a choice is load-bearing, reference the
  ADR/spec at the decision point and stop. Do not scatter `(DEC-x)`,
  `(NFR-x)`, `(AC-x)` tags across every function and field — that is
  alphabet-soup noise. References to docs/ADRs/tickets are encouraged when
  they carry context.
- **No JSDoc that restates the signature.** Reserve JSDoc for `@throws`,
  `@example`, or invariants invisible from the type. `/** Resolve the output
  format. */` above `resolveOutputFormat(...)` is noise.
- **No duplicating specs in comments.** If it lives in the spec or ADR, link
  it — don't copy it into a comment block.

Authoritative detail and before/after examples:
[.ai/rules/typescript.md](.ai/rules/typescript.md) → **Code style principles**
and **Comments** sections.

## Delivery process

Every change flows through 11 phases. `@pm` orchestrates; phases are gated but can be reopened when gaps are discovered.

| Phase | Agent | What happens |
|-------|-------|--------------|
| 1. clarify_scope | `@pm` | Read ticket via MCP, cross-check against system spec (`doc/spec/**`), STOP if questions |
| 2. specification | `@spec-writer` | Create `chg-<ref>-spec.md` (problem, goals, AC) |
| 3. test_planning | `@test-plan-writer` | Create `chg-<ref>-test-plan.md` (traceable to AC) |
| 4. delivery_planning | `@plan-writer` | Create `chg-<ref>-plan.md` (phased tasks) |
| 5. dor_check | `@readiness-reviewer` | Adversarially critique spec+test-plan+plan vs ticket before delivery (DoR gate) |
| 6. delivery | `@coder` | Execute plan phases, commit per phase |
| 7. system_spec_update | `@doc-syncer` | Reconcile `doc/spec/**` with implementation |
| 8. review_fix | `@reviewer` | Audit vs spec/plan; if FAIL → `@coder` remediates → re-review |
| 9. quality_gates | `@runner` | Build/test/lint; if failures → `@fixer` → re-run |
| 10. dod_check | `@pm` | Verify all AC met, all plan tasks done |
| 11. pr_creation | `@pr-manager` | Create PR, assign to human, STOP |

Detail: [doc/guides/change-lifecycle.md](doc/guides/change-lifecycle.md)

## Agent team

**Orchestration:**
- `ceo` — autonomous executive: backlog, ticket delivery, PR review/merge. `@ceo continue project delivery`
- `pm` — orchestrates 11-phase lifecycle; manages tickets via MCP; never implements code
- `decision-advisor` — all decision types (ADR/PDR/TDR/BDR/ODR) _(formerly `architect`)_
- `decision-critic` — independent read-only challenger (PASS / PASS_WITH_RISKS / REWORK)

**Delivery:** `spec-writer` · `plan-writer` · `test-plan-writer` · `coder` (delegates to `@designer`, `@decision-advisor`, `@committer`, `@runner`) · `readiness-reviewer` (DoR gate) · `reviewer` (spec/plan/quality, local + remote) · `review-feedback-applier` · `fixer` · `runner` · `doc-syncer` · `committer` · `pr-manager`

**Specialized:** `bootstrapper` · `designer` · `editor` · `meeting-organizer` · `external-researcher` · `image-generator` · `image-reviewer` · `toolsmith`

Full definitions: `~/.ados/repo/.opencode/agent/*.md`

## Commands

**Change delivery:** `/plan-change` · `/write-spec <ref>` · `/write-test-plan <ref>` · `/write-plan <ref>` · `/check-readiness <ref>` · `/run-plan <ref>` · `/sync-docs <ref>` · `/review <ref>` (`/review-deep` for stronger model) · `/review-remote` · `/check` · `/check-fix` · `/commit` · `/pr` · `/apply-review-feedback`

**Decisions:** `/plan-decision` · `/write-decision` · `/review-decision`

**Other:** `/bootstrap` · `/design`

Full definitions: `~/.ados/repo/.opencode/command/*.md`

## Using the system

**Autopilot:** `@pm deliver change GH-<number>` — orchestrates all 11 phases.

**Autonomous CEO:** `@ceo continue project delivery` — full loop (backlog → ticket → PR → review → merge).

**Manual:** `/plan-change` → `/write-spec` → `/write-test-plan` → `/write-plan` → `/check-readiness` → `/run-plan` → `/sync-docs` → `/review` → `/check` → `/pr`

> `dod_check` (phase 10) is run by `@pm` before `/pr` — see [definition-of-done.md](doc/guides/definition-of-done.md).

Guide: [doc/guides/opencode-agents-and-commands-guide.md](doc/guides/opencode-agents-and-commands-guide.md)

## Change artifacts

Changes are identified by `workItemRef` (`GH-<number>` for this repo).

```
doc/changes/YYYY-MM/YYYY-MM-DD--<workItemRef>--<slug>/
  ├── chg-<workItemRef>-spec.md
  ├── chg-<workItemRef>-plan.md
  ├── chg-<workItemRef>-test-plan.md
  └── chg-<workItemRef>-pm-notes.yaml
```

Branches: `<type>/<workItemRef>/<slug>` (e.g., `feat/GH-123/some-feature`)

Detail: [doc/guides/unified-change-convention-tracker-agnostic-specification.md](doc/guides/unified-change-convention-tracker-agnostic-specification.md)

### Profile-aware documentation safety

Before creating new documentation areas, agents should inspect [doc/documentation-profile.md](doc/documentation-profile.md).

- If missing, assume `engineering-repo` behavior.
- If present but malformed, unparseable, missing required fields, or contains conflicting write roots, treat the repository as `engineering-repo` (business docs disabled) and ask the user to fix the profile before proceeding; do not guess which root wins.
- Do not create `doc/business/**` content unless profile enables it or the user explicitly requests a profile change.

## Repo structure

```
AGENTS.md                         # this file
README.md
.ai/
  agent/                          # PM/PR/decision/code-review instructions (committed)
  local/                          # git-ignored ephemeral agent state
  rules/                          # typescript.md, testing-strategy.md
.github/workflows/                # ci.yml (fast loop), run-e2e.yml (live-sandbox)
.env.example                      # canonical env vars (no values)
scripts/                          # repo-internal automation (.sh extension)
tools/                            # PATH-able CLI utilities (no .sh extension)
doc/
  00-index.md                     # docs landing page
  documentation-profile.md        # write-safety contract (engineering-repo)
  documentation-handbook.md       # docs structure, conventions, workflow
  changes/                        # change artifacts (spec, plan, test-plan per workItemRef)
  decisions/                      # ADR/PDR/TDR/BDR/ODR + 00-index.md registry
  guides/                         # dev-env, security, a11y baselines
  inception/                      # inception workspace (state, analysis, inputs)
  overview/                       # north star, roadmap, tech-stack, architecture, glossary, UL
  spec/                           # current system spec (features + nonfunctional)
  templates/                      # core + profile-aware templates
```

## Key references

| Document | Description |
|----------|-------------|
| [doc/overview/01-north-star.md](doc/overview/01-north-star.md) | Product north star, proxy metrics, guardrails |
| [doc/overview/tech-stack.md](doc/overview/tech-stack.md) | Technology stack decisions |
| [doc/overview/architecture-overview.md](doc/overview/architecture-overview.md) | Ports-and-adapters, C4 diagrams, dependency matrix |
| [doc/overview/glossary.md](doc/overview/glossary.md) | Terms and acronyms |
| [doc/overview/ubiquitous-language.md](doc/overview/ubiquitous-language.md) | Bounded context — aggregates, entities, VOs, events |
| [doc/spec/nonfunctional.md](doc/spec/nonfunctional.md) | NFRs (performance, security, reliability) |
| [.ai/rules/testing-strategy.md](.ai/rules/testing-strategy.md) | 7-tier testing strategy and coverage rules |
| [.ai/agent/pm-instructions.md](.ai/agent/pm-instructions.md) | PM tracker configuration (GitHub Issues) |
| [.ai/agent/decision-instructions.md](.ai/agent/decision-instructions.md) | Decision tracking conventions + strategic context |
| [.ai/agent/pr-instructions.md](.ai/agent/pr-instructions.md) | PR/MR platform configuration (GitHub CLI) |
| [.ai/agent/code-review-instructions.md](.ai/agent/code-review-instructions.md) | Repo-specific code review checklist |
| [doc/guides/dev-environment.md](doc/guides/dev-environment.md) | Local dev setup, prerequisites, scripts |
| [doc/guides/security-baseline.md](doc/guides/security-baseline.md) | Secret management, redaction, dependency audit |
| [doc/guides/accessibility-baseline.md](doc/guides/accessibility-baseline.md) | CLI output accessibility, provenance panel contract |
| [doc/decisions/00-index.md](doc/decisions/00-index.md) | Decision records index (ADR/PDR/TDR registry) |
| [.env.example](.env.example) | Canonical environment variable list (no values) |
