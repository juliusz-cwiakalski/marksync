# Inception Workspace — `doc/inception/tmp/`

This folder is a **temporary staging area for project inception**. It holds raw
brain dumps, AI-assisted drafts, and research used to bootstrap
**MarkSync for Confluence**. Nothing here is canonical yet; the artifacts are
inputs that will be refined into the official `doc/overview/` and `doc/specs/`
documents.

---

## Files in this folder

### 1. Motivation & goals (start here)

| File | Role | Priority / Recency |
|---|---|---|
| **`motivation-and-goal-notes-brain-dump.md`** | Voice-note transcript from the project owner. **The single source of truth for *why* this project exists and *what* it must achieve.** Explicitly directs that MVP and MLP scope be defined from the two strategy reports below. | **PRIMARY — read this first. Most recent and most authoritative statement of motivation and goals.** |

> **If you read only one file, read
> `motivation-and-goal-notes-brain-dump.md`.** It is the most recent and most
> important explanation of the project's motivation and goals, transcribed
> directly from the owner's voice notes. Treat transcript typos with charity
> and read between the lines.

### 2. Vision & specification (drafts, predate the brain dump)

| File | Role | Priority / Recency |
|---|---|---|
| `north-star-draft-to-be-refined.md` | Early North Star draft: vision, mission, target users, problem, north star metric, guiding principles, decision filter, scope, current focus. | Superseded in motivation by the brain dump; still useful for vision framing. |
| `system-specification-draft-from-ai-brainstorm.md` | Extensive AI-generated system specification (20 sections): scope, FRs/NFRs, architecture, CLI, state model, test strategy, delivery plan. | Reference draft — large, detailed, needs reconciliation with the brain dump and the strategy reports. |

### 3. Research & strategy (scope-defining inputs)

| File | Role | Priority / Recency |
|---|---|---|
| `open-source-git-markdown-confluence-sync-report-2026-07-02.md` | Competitive landscape report: 39 tools analyzed, directionality matrix, why bidirectional sync is unsolved, product-gap analysis, evaluation framework. | Foundational research input. |
| `marksync-category-leadership-strategy-report-2026-07-02.md` | **NEW.** Competitive success analysis + execution playbook for becoming the category leader. | Strategy input — defines how to win the category. |
| `marksync-failure-premortem-and-anti-failure-playbook-2026-07-02.md` | **NEW.** Pre-mortem of how MarkSync fails, competitive failure analysis, and an anti-failure playbook. | Strategy input — defines what to avoid and the safe wedge. |

### 4. Other

| File | Role |
|---|---|
| `README.md` | This index and project summary. |
| `ideas.md` | Running scratchpad of ideas, questions, and candidate work items. |
| `LICENSE` | License for the inception materials (the project itself is MIT). |
| `archive/` | Reserved for superseded/processed materials. Currently empty. |

### 5. Decisions, analysis & API validation (inception outputs)

These are **newer** artifacts produced during inception, layered on top of the
motivation/spec/strategy inputs above.

| Path | Role | Priority / Recency |
|---|---|---|
| `decisions/` | Pre-inception **decision records** (`00-index.md` + ADR-0001…ADR-0005), all `status: Proposed`, pending human confirmation during formal ADOS inception. Covers: implementation language/runtime — TypeScript (ADR-0001); Mermaid rendering strategy (ADR-0002); product naming & architecture — "MarkSync" core + Confluence adapter (ADR-0003); run a scoped Confluence API validation spike (ADR-0004); page-body representation — write Storage, not ADF (ADR-0005, evidence-backed). | **Newest.** The first output of the validation spike. |
| `integration-scenarios/` | **Evidence-backed Confluence Cloud integration scenarios** — index (`00-index.md`) + 18 scenario docs (auth, spaces, page create/read/update/delete, hierarchy, move, versions, Markdown→Storage rendering, content properties, attachments, labels, version-conflict/drift, CQL search, reverse sync, restrictions, pagination/errors/rate limits, OAuth 3LO). Each gives the current (non-deprecated) endpoint, a verbatim request, and a verbatim captured response, suitable for exact implementation and mocking integration tests. | **Newest.** Derived from the live spike. |
| `tmp/confluence-api-validation-spike/` | Throwaway **live-validation spike** (gitignored via `doc/**/tmp/`) that produced the evidence behind the integration scenarios and ADR-0005. Holds runnable `.mjs` scenarios (`src/run.mjs`, `src/coverage.mjs`), captured redacted evidence (`evidence/raw/`), findings (`findings/`), the official API reference (`doc/research/atlassian-confluence-api-reference.md`), spike-local decisions (`doc/decisions/SPIKE-DEC-01…04`), and credentials guidance (`CREDENTIALS.md`). | **Newest.** Working artifact, not committed. |

---

## Short extracts — the two new strategy reports

These two reports are the **scope-defining inputs** the brain dump explicitly
references for shaping the MVP (Minimum Viable Product) and MLP (Minimum
Lovable Product) phases. Read them together — one argues *how to win*, the
other *how to avoid losing*.

### `marksync-category-leadership-strategy-report-2026-07-02.md`
*Building the World's Leading Open-Source Git ↔ Confluence Synchronizer —
competitive success analysis and an execution playbook.*

- **Headline finding:** the open-source Git/Markdown ↔ Confluence market has
  several successful tools but **no project has yet won the complete category**.
  Success has clustered into four narrow jobs (publish, maximize fidelity,
  export, ecosystem integration); **true bidirectional synchronization remains
  an unclaimed position** (strongest attempt, `atlcli`, ~29 stars).
- **Central recommendation:** do **not** launch by promising magical fully
  automatic two-way sync. Win via a **progressive trust ladder**:
  1. easiest + safest Git → Confluence publisher;
  2. detect and explain Confluence drift without overwriting;
  3. pull Confluence changes into a reviewable branch/PR;
  4. deterministic three-way structural merge where safe;
  5. explicit resolution for ambiguous changes;
  6. continuous bidirectional operation only after a strong compatibility
     corpus and production evidence exist.
- **Recommended category position:** Git-native documentation synchronization
  for Confluence; primary promise = *safe, reviewable, deterministic* sync;
  differentiator = *every change explainable, every conflict reviewable,
  unsupported content preserved or blocked rather than silently discarded.*
- **Twelve leadership principles**, e.g. trust before automation; immutable
  identity; canonical intermediate representation (never merge rendered XHTML);
  preserve what cannot be represented; ship a compatibility laboratory;
  optimize first-run success; treat Atlassian change as permanent.
- **Execution content:** deep success analyses of 10 projects, cross-project
  success/failure patterns, why no bidirectional project has reached 50 stars,
  recommended architecture, CLI/DX, content-fidelity and enterprise-readiness
  strategy, open-source/distribution/community strategy, leadership metrics,
  recommended roadmap, a 90-day plan, a "steal/avoid" appendix, and PoC
  evaluation scenarios.
- **Highest-leverage positioning:** *"the safe Git-native bridge to Confluence:
  publish reviewed Markdown, detect remote edits, and bring them back through
  pull requests — without silent overwrites or lost content."*

### `marksync-failure-premortem-and-anti-failure-playbook-2026-07-02.md`
*How MarkSync Fails — a unified pre-mortem, competitive failure analysis, and
anti-failure playbook.*

- **Central pre-mortem conclusion:** MarkSync fails if it tries to deliver the
  **end-state category vision before proving the narrow trust wedge**. The most
  likely failure is *not* conversion difficulty — it is a causal chain from
  broad vision → too many promises → long inception → late narrow delivery →
  few design partners → mocks pass while real tenants expose edge cases →
  false conflicts / formatting loss / duplicates / partial writes → damaged
  trust → maintainer overload → abandonment.
- **The correct wedge** (not "perfect two-way sync"):
  > *Publish Markdown from Git to native Confluence pages without ever silently
  > overwriting remote work, and explain every intended mutation before
  > applying it.*
- **Ten highest-risk failure modes:** scope explosion; no validated beachhead;
  trust promise exceeds evidence; wrong state model; conversion masquerading as
  synchronization; AI-generated false confidence; maintainer overload; no
  compelling migration path; failure to manage Atlassian drift; silent/ambiguous
  data loss.
- **Distinguishes five forms of "failure":** operational, adoption, trust,
  category-ceiling, and promise failure — several "failed" researched projects
  are actually successful *within a disciplined scope*; MarkSync should copy
  their focus, not dismiss them.
- **Execution content:** strategic / product-UX / sync-engine / content /
  auth-platform / delivery / open-source failure modes; FMEA; an **anti-roadmap**
  (what *not* to build first — e.g. no full auto bidirectional, no all auth
  methods, no Cloud+DC as equal v1, no watch/webhook service, no auto deletion,
  no MCP/GUI/SaaS); a **recommended narrow product contract**; **phase gates**
  (Gates 0–6) that prevent premature complexity; recommended corrections to the
  current project summary (clarify authority, narrow v1 matrix, fix atomicity
  language, separate cache from state, add ownership modes); an adversarial
  testing strategy; adoption/community controls; an early-warning metrics
  dashboard; a 90-day anti-failure execution plan; and a "do not do" checklist.
- **Core discipline is subtraction:** narrow the first platform, content model,
  ownership model, auth path, and diagram path; delay automatic merge; prove
  every safety claim on real tenants; build repair before magic; build
  governance before popularity.

---

# MarkSync for Confluence — Cleaned Project Summary

> *Write documentation where engineers and AI work best: Git. Publish it where
> the organization consumes it: Confluence.*

## What it is

**MarkSync for Confluence** is an open-source, Git-native documentation
synchronization tool. It will ship as a portable **Go CLI** (`marksync`)
distributed as native binaries and a container image, plus a documented skill
so AI agents can operate it safely.

It keeps **Markdown in Git as the authoritative engineering workspace** and
treats **Confluence as a first-class publication surface** — bridging the two
without forcing teams to choose between them.

## The core problem (the false choice)

Engineering teams face a painful dilemma:

1. **Author in Confluence** and lose Git-native workflows — diffs, branches,
   pull-request review, automation, full history, and direct access for coding
   agents. Documentation drifts away from the code it describes and goes stale.
2. **Author in Git** and fail organizational mandates that require Confluence
   as the shared, governed, discoverable knowledge base for non-engineers
   (product, ops, support, security, auditors, customers).

Manual copy/paste between the two destroys provenance, breaks formatting and
diagrams, creates two competing versions of the truth, and wastes time.
MarkSync removes that false choice.

But the real problem is **not merely Markdown conversion** — it is maintaining
one trustworthy documentation lifecycle across two environments with
incompatible editing models. That includes:

- **Loss-of-knowledge risk:** a Git-native team publishes to Confluence; someone
  edits the Confluence page directly; the next sync would silently overwrite
  that change. The tool must detect this and force explicit reconciliation
  rather than blindly overwriting.
- **Diagram workflow gap:** AI and developers work effectively with text-based
  diagrams (Mermaid, PlantUML); Confluence often lacks the plugins to render
  them. These must be rendered to images and attached with content hashing.
- **Operational friction:** setup, cross-platform distribution, CI integration,
  incremental (no-op) publishing, and machine-readable output for agents all
  need to be first-class.

## What MarkSync solves

### Core value

- **Git owns authoring and approval.** Documentation evolves with the system it
  describes, reviewed through pull requests, validated in CI, versioned, and
  reusable by AI agents.
- **Confluence owns broad consumption.** Non-engineering stakeholders keep a
  readable, navigable, discoverable, governed view without touching Git.
- **MarkSync owns the bridge:** deterministic conversion, mapping, provenance,
  drift detection, idempotent publishing, and (later) controlled
  reconciliation. **Humans or supervised AI own conflict decisions.**

### Key capabilities (MVP focus)

- **Repository-owned YAML configuration** (`marksync.yaml`) with
  include/exclude globs, multiple named Confluence targets, and per-document
  front-matter overrides. No credentials ever enter the repo.
- **Hierarchy mirroring** — source folder structure becomes a Confluence page
  tree by default, with overrides for exceptional mappings (e.g., routing
  support docs vs. SRE docs to different spaces).
- **Stable document identity** — IDs survive edits, renames, and moves; never
  rely on page title as identity (a documented cause of duplicates and
  ambiguity in existing tools).
- **Markdown → Confluence Storage Format** rendering for a documented canonical
  subset (headings, lists, tables, code fences, links, images, blockquotes,
  rules, task lists, front matter).
- **Assets and Mermaid diagrams** — images and attachments resolved, hashed,
  and uploaded only when changed; Mermaid rendered to images via an adapter
  (local `mmdc`, container, or opt-in remote renderer) and embedded as
  attachments, so it works even **without organizational Confluence Mermaid
  plugins**. Hash-based naming avoids needless re-renders and version spam.
- **Plan / dry-run / diff first** — every mutation has a preview: `status`,
  `plan`, `diff`, `push --dry-run`. No unsafe writes; any structural error
  means zero writes.
- **Drift detection** — remote Confluence edits are detected before update;
  blind overwrites are refused (`REMOTE_AHEAD`, `DIVERGED`).
- **Provenance** — every managed page records its repository, source path, and
  Git commit SHA, both in the lock file and as a Confluence content property,
  so pages stay traceable to an exact source version.
- **Idempotency** — re-running without source changes sends **zero** Confluence
  writes (avoids watcher notifications and version spam).
- **Human + machine + AI parity** — `--format human|json|ndjson`, stable exit
  codes, non-interactive mode, and a `skills/marksync/SKILL.md` so OpenCode,
  Claude Code, and similar agents can validate, dry-run, and escalate safely.
- **Runs everywhere** — local workstation, CI pipeline, container, or agent
  session; same behavior, only credentials supplied differently. Cross-platform
  single binaries for Linux/macOS/Windows (amd64, arm64).
- **Incremental and efficient** — local Git-ignored cache, modification-aware
  planning, handles large repositories without fetching everything.

### Later phases (explicitly staged)

1. **Controlled reverse sync** — Confluence edits reverse-converted to Markdown
   and surfaced as an **uncommitted** patch / three-way conflict bundle
   (base/local/remote) for human or AI review. **Never auto-commits, never
   silently merges.**
2. OAuth 2.0 (3LO) browser login, enhanced enterprise auth/proxy/CA support.
3. Opt-in archive/trash lifecycle, bulk adoption, stale reporting.
4. Data Center adapter, optional MCP server, package-manager distribution,
   reusable CI components.
5. Selective automatic merging for constructs with proven round-trip semantics,
   and assisted (AI-suggested) conflict resolution — always with reviewable
   evidence.

## What MarkSync does NOT do (non-goals)

- **Replace Confluence or Git hosting** — it bridges an existing
  organizational requirement, not replaces it.
- **Provide a WYSIWYG / rich-text editor** — authoring stays in Markdown tools.
- **Real-time collaborative editing** between Git and Confluence.
- **Perfect lossless round-trip of arbitrary Confluence layouts** — Confluence
  carries macros, ADF extensions, inline comments, smart links, restrictions,
  and app-specific content that Markdown cannot represent perfectly. MarkSync
  promises a documented **canonical subset** and refuses to silently discard
  or flatten unsupported content.
- **Automatic semantic merge decisions** or silent last-writer-wins.
- **Automatic Git commit, push, tag, fetch, or PR creation** — review is always
  mandatory.
- **Automatic page deletion in MVP** — destructive and needs explicit policy;
  defaults to `ignore`.
- **Sync comments, whiteboards, databases, blog posts, or all custom content.**
- **Require a hosted SaaS control plane** — core value is local-first with no
  mandatory backend.
- **Support Confluence Data Center or other knowledge platforms in MVP.**
- **Send telemetry by default** — local-first privacy.

## Why build it now (the market gap)

The competitive research report analyzed **39 open-source tools** and found a
crowded one-way publishing market but an **open workflow market**:

- **Mature one-way publishers exist** (`kovetskiy/mark`, `hunyadi/md2conf`,
  `markdown-confluence`, `text2confl`) but generally lack deterministic
  hierarchy mapping, stable identity through renames/moves, source provenance,
  dry-run/diff workflows, conflict safeguards, and AI-agent-friendly output.
- **Reliable reverse exporters exist** (`Spenhouet/confluence-markdown-exporter`,
  `gkoos/confluence2md`) but export is not synchronization.
- **True bidirectional synchronization remains immature.** `BjoernSchotte/atlcli`
  is the most credible attempt (pull, push, common-base tracking, conflict
  detection, watch mode) but has small adoption and limited independent
  production evidence. `PatD42/confluence-bidir-sync` is still a prototype.
- Many tools advertising "two-way" actually provide **separate push/pull
  operations** with no common base, no three-way merge, and no conflict
  protocol.

Recurring community pain points MarkSync is designed to address:

- Manual Confluence edits overwritten by the next Git sync.
- Duplicates and ambiguity from title-based page matching.
- Rename/move/delete handled as delete-plus-create.
- Tables, links, and macros breaking in generic conversion pipelines.
- Version spam and watcher emails from tools that re-publish unchanged pages.
- REST API v1→v2 migrations and auth variations causing breakage.
- Diagram support (Mermaid/PlantUML/D2) being a decision-driving feature that
  plain converters miss.

**The defensible gap is a safe workflow and identity system spanning Git and
Confluence** — not "convert `.md` and call the API." MarkSync's
differentiators: Git-first one-way excellence, stable IDs, semantic diffs,
drift detection, three-way state, pull-into-review (never auto-commit),
round-trip-safe handling of unsupported nodes, deletion safety, provenance in
both systems, and agent-friendly operation.

## Target users

- **Primary:** software architects, technical leads, developers, and
  documentation owners in Git-native, AI-heavy teams inside organizations that
  mandate Confluence.
- **Secondary:** platform / developer-experience teams standardizing
  docs-as-code publishing across repositories and CI pipelines.
- **Beneficiaries (Confluence readers):** product managers, analysts, QA,
  operations, support, security/compliance/auditors, and customers.
- **Operators:** AI coding/documentation agents that need explicit schemas,
  safe defaults, and non-interactive commands.

## Guiding principles / guardrails

1. **Git is the authoritative engineering workspace.**
2. **Confluence is a first-class publication surface** — pages must remain
   readable and useful to non-engineers.
3. **Safe synchronization beats magical synchronization** — prefer explicit
   diffs, dry runs, conflict detection, and manual reconciliation over silent
   overwrites.
4. **Fidelity and provenance are non-negotiable.**
5. **Configuration is versioned with the documentation.**
6. **Humans and AI agents are equal operators.**
7. **Local-first and CI-ready** — no required hosted control plane.
8. **Trust outranks feature count.** Never weaken safety to pass tests.

**Decision filter** (when choosing between options, prefer the one that):
prevents content loss over maximizing automation; keeps Git authoritative;
improves fidelity/traceability; produces deterministic scriptable behavior;
reduces setup friction; and serves both human and AI workflows.

## North star metric

**Automation coverage of documentation publishing** — the percentage of
configured Git documentation changes intended for Confluence that are
successfully and faithfully published by MarkSync **without manual
copy-and-paste**, where "successfully" means the page is updated, content is
traceable to its source file and Git revision, and no unresolved conflict or
conversion failure remains.

## Delivery approach

- **TDD + BDD + specification-driven**, delivered largely by autonomous AI
  agents against executable specifications.
- **Ports-and-adapters architecture** in Go so Git, Confluence, HTTP, keyring,
  filesystem, clock, and Mermaid renderer stay behind interfaces and
  testable with fakes.
- **Test layers:** unit, golden, fuzz/property, integration (mocked Confluence
  API), Gherkin/BDD, E2E CLI, and a protected **disposable live Confluence
  sandbox** (space created and torn down per suite run).
- **Phased delivery:** bootstrap → config/identity → Markdown → planning →
  Confluence adapter → safe push → assets/Mermaid → automation/skill →
  beta → reverse sync.
- **Dogfooding:** MarkSync will publish its own `doc/` tree.
- **Delivery framework:** [agentic-delivery-os (ADOS)](https://github.com/juliusz-cwiakalski/agentic-delivery-os).

## Status

**Greenfield / inception.** The repository currently contains only these
inception materials. No production code yet.

Reading order and authority of the artifacts:

1. **`motivation-and-goal-notes-brain-dump.md`** is the freshest, authoritative
   statement of motivation and goals.
2. The two **strategy reports** (category leadership + failure pre-mortem) are
   the scope-defining inputs the brain dump explicitly references for shaping
   the **MVP** (one-way Git → Confluence) and **MLP** (Minimum Lovable Product:
   exceptional DX and easy setup) phases. They converge on one strategic
   conclusion: **win the narrow trust wedge first** (safest publisher + drift
   detection), and stage bidirectional sync only after earned trust and
   evidence.
3. The **system specification** and **North Star** drafts predate the brain dump
   and must be reconciled with it (and with the strategy reports' recommended
   corrections: narrow the v1 support matrix, fix atomicity language, separate
   cache from state, add ownership modes, remove universal claims) before
   implementation begins.
4. The **inception outputs** in `decisions/` (ADR-0001…0005, all `Proposed`)
   and `integration-scenarios/` (evidence-backed Confluence Cloud API scenarios)
   are the newest, most concrete artifacts: they encode the validated technical
   decisions and the proven integration contract for implementation. The
   `tmp/confluence-api-validation-spike/` is the (gitignored) working evidence
   behind them. Treat the ADRs as `Proposed` until confirmed during formal ADOS
   inception, but treat the integration-scenario docs as the authoritative API
   reference.
