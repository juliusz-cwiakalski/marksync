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

### Orchestration
- `pm` — orchestrate changes; manage tickets via MCP; never implements code
- `decision-advisor` — decisions of all types (architecture, product, business, technical, operating); decision record authoring (ADR/PDR/TDR/BDR/ODR) _(formerly `architect`)_

### Decision review
- `decision-critic` — independent, read-only decision challenger; tri-state verdict (PASS / PASS_WITH_RISKS / REWORK)

### Onboarding
- `bootstrapper` — run ADOS project inception for new or legacy projects

### Artifact creation
- `spec-writer` — author change specifications
- `plan-writer` — author implementation plans
- `test-plan-writer` — author test plans with traceable coverage

### Implementation
- `coder` — execute plan phases; delegates to `@designer`, `@decision-advisor`, `@committer`, `@runner`
- `designer` — visual design and UI implementation
- `editor` — content rewrites and translations

### Verification
- `readiness-reviewer` — adversarial Definition of Ready gate; critiques change artifacts before delivery
- `review-feedback-applier` — classify and apply accepted review feedback from PR/MR
- `reviewer` — review changes against spec, plan, code quality heuristics, and repo rules (local + remote modes)
- `fixer` — reproduce failures and apply targeted fixes
- `runner` — execute commands, capture logs (subagent)

### Documentation & release
- `doc-syncer` — reconcile system docs with completed changes
- `meeting-organizer` — prepare agendas and summarize meeting docs
- `committer` — create one Conventional Commit
- `pr-manager` — create/update PR/MR; enrich with ticket context via MCP

### Specialized
- `external-researcher` — research external sources via MCP
- `image-generator` — generate AI images via text-to-image CLI
- `image-reviewer` — analyze images, screenshots, and visual artifacts
- `toolsmith` — create and tune agents, commands, and skills

Full definitions: `~/.ados/repo/.opencode/agent/*.md` (global install)

## Commands

| Command | Purpose |
|---------|---------|
| `/apply-review-feedback` | Classify and apply accepted PR/MR review feedback locally |
| `/bootstrap` | Scaffold ADOS artifacts for an existing project |
| `/plan-change` | Interactive planning session (prep context for /write-spec) |
| `/write-spec <ref>` | Generate change specification |
| `/write-test-plan <ref>` | Generate test plan |
| `/write-plan <ref>` | Generate implementation plan |
| `/check-readiness <ref>` | Run the Definition of Ready gate for a change |
| `/run-plan <ref>` | Execute plan phases |
| `/review <ref>` | Review change vs spec/plan |
| `/review-deep <ref>` | Deep review with stronger reasoning model |
| `/review-remote` | Review open PR/MR diff and optionally publish findings |
| `/sync-docs <ref>` | Reconcile system docs from a change |
| `/check` | Run quality gates (no fixes) |
| `/check-fix` | Run quality gates and fix failures |
| `/commit` | Create one Conventional Commit |
| `/pr` | Create/update PR/MR |
| `/plan-decision` | Interactive decision session (any type: architecture, product, business, technical, operating) |
| `/write-decision` | Generate Decision Record (ADR/PDR/TDR/BDR/ODR) |
| `/review-decision` | Independent decision challenge (delegates to `@decision-critic`) |
| `/design` | Generate/update visual design assets |

Full definitions: `~/.ados/repo/.opencode/command/*.md` (global install)

## Using the system

**Autopilot** (recommended) — `@pm` orchestrates all 11 phases:

```
@pm deliver change GH-<number>
```

**Manual** — you trigger each step:

```
/plan-change → /write-spec <ref> → /write-test-plan <ref> → /write-plan <ref>
→ /check-readiness <ref> → /run-plan <ref> → /sync-docs <ref> → /review <ref> → /check → /pr
```

> `dod_check` (phase 10) is run by `@pm` before `/pr`; it has no dedicated
> command — see [definition-of-done.md](doc/guides/definition-of-done.md).

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
.
├── AGENTS.md                        # this file — delivery system bootstrap
├── .ai/
│   ├── agent/                        # PM/PR/decision/code-review instructions (committed)
│   ├── local/                        # git-ignored ephemeral agent state
│   └── rules/                        # TypeScript + testing coding rules
│       ├── README.md                 # rule index / routing table
│       ├── typescript.md             # TS module structure, naming, Result<T,E>, Biome
│       └── testing-strategy.md       # 6 test tiers, coverage rules, over-mocking guardrail
├── .github/
│   └── workflows/
│       ├── ci.yml                    # fast loop: lint + typecheck + test + BDD + audit + link-check
│       └── run-e2e.yml               # live-sandbox E2E gate (scheduled + label + manual)
├── .editorconfig
├── .env.example                      # canonical environment variable list (no values)
├── scripts/                          # repo-internal automation (.sh extension)
├── tools/                            # PATH-able CLI utilities (no .sh extension)
└── doc/
    ├── 00-index.md                   # documentation landing page
    ├── documentation-profile.md      # write-safety contract (engineering-repo)
    ├── documentation-handbook.md     # docs structure, conventions, workflow
    ├── changes/                      # change artifacts (spec, plan, test-plan per workItemRef)
    ├── decisions/                    # decision records (ADR/PDR/TDR/BDR/ODR)
    │   ├── README.md
    │   └── 00-index.md               # registry of all decisions
    ├── guides/                       # how-to guides + project baselines (dev-env, security, a11y)
    ├── inception/                    # project inception workspace (state, analysis, inputs)
    ├── overview/                     # north star, roadmap, tech-stack, architecture, glossary, UL
    ├── spec/                         # current system spec (features + nonfunctional)
    └── templates/                    # core + profile-aware templates
```

## Key references

| Document | Description |
|----------|-------------|
| [doc/overview/01-north-star.md](doc/overview/01-north-star.md) | Product north star, proxy metrics, guardrails |
| [doc/overview/02-roadmap.md](doc/overview/02-roadmap.md) | Milestone roadmap (MS-0001 spike done; MS-0002 MVP active) |
| [doc/overview/tech-stack.md](doc/overview/tech-stack.md) | Technology stack decisions |
| [doc/overview/architecture-overview.md](doc/overview/architecture-overview.md) | Ports-and-adapters architecture, C4 diagrams, dependency matrix |
| [doc/overview/glossary.md](doc/overview/glossary.md) | Terms and acronyms |
| [doc/overview/ubiquitous-language.md](doc/overview/ubiquitous-language.md) | Bounded context — aggregates, entities, VOs, events, services |
| [doc/spec/nonfunctional.md](doc/spec/nonfunctional.md) | NFRs (performance, security, reliability) |
| [.ai/rules/typescript.md](.ai/rules/typescript.md) | TypeScript coding conventions (module tiers, Result<T,E>, Biome) |
| [.ai/rules/testing-strategy.md](.ai/rules/testing-strategy.md) | 6-tier testing strategy and coverage rules |
| [.ai/agent/pm-instructions.md](.ai/agent/pm-instructions.md) | PM tracker configuration (GitHub Issues) |
| [.ai/agent/decision-instructions.md](.ai/agent/decision-instructions.md) | Decision tracking conventions + strategic context |
| [.ai/agent/pr-instructions.md](.ai/agent/pr-instructions.md) | PR/MR platform configuration (GitHub CLI) |
| [.ai/agent/code-review-instructions.md](.ai/agent/code-review-instructions.md) | Repo-specific code review checklist |
| [doc/guides/change-lifecycle.md](doc/guides/change-lifecycle.md) | Change delivery lifecycle (11-phase workflow, detailed) |
| [doc/guides/definition-of-ready.md](doc/guides/definition-of-ready.md) | Definition of Ready gate (dor_check) |
| [doc/guides/dev-environment.md](doc/guides/dev-environment.md) | Local dev setup, prerequisites, scripts |
| [doc/guides/security-baseline.md](doc/guides/security-baseline.md) | Secret management, redaction, dependency audit |
| [doc/guides/accessibility-baseline.md](doc/guides/accessibility-baseline.md) | CLI output accessibility, provenance panel contract |
| [doc/decisions/00-index.md](doc/decisions/00-index.md) | Decision records index (ADR/PDR/TDR registry) |
| [doc/documentation-handbook.md](doc/documentation-handbook.md) | Documentation layout standard |
| [.env.example](.env.example) | Canonical environment variable list (no values) |
