---
# Copyright (c) 2025-2026 Juliusz Ćwiąkalski (https://www.cwiakalski.com | https://www.linkedin.com/in/juliusz-cwiakalski/ | https://x.com/cwiakalski)
# MIT License - see LICENSE file for full terms
source: https://github.com/juliusz-cwiakalski/agentic-delivery-os/blob/main/doc/templates/persona-jtbd-template.md
ados_distribution: redistributable
id: PERSONA-JTBD
status: Draft
created: 2026-07-03
last_updated: 2026-07-03
owners: [Juliusz Ćwiąkalski]
area: discovery
document_classification: current-truth
links:
  related_decisions: [ADR-0001, ADR-0003]
  related_changes: []
summary: "MarkSync personas + Jobs To Be Done — the operator types that hire MarkSync."
ai_assistance: "AI-assisted drafting; human-authored and approved by Juliusz Ćwiąkalski."
---

# Personas & JTBD (Inception)

_Conditional — produced because `multi_user: true`. MarkSync has several distinct
operator types (Personas 1–4). Each sync run is single-operator (one author, one
repo), but the *kind* of operator varies, so operators are modelled explicitly.
**Persona 5 is a sponsoring stakeholder** — a non-technical role that does **not**
run the CLI but drives adoption and depends on its output; it is enumerated
because it is often the primary reason the operator personas adopt MarkSync at
all. General Confluence readers (analysts, support, end customers) remain
beneficiaries and are not enumerated individually._

> **Relationship to other templates.** This is the lightweight inception combined
> view used at project level. For business-profile deep dives use
> `persona-template.md` and `jobs-to-be-done-template.md` separately.

---

## Persona 1 — Software architect / technical lead  *(PRIMARY)*

### Role and context
- Maintains architecture-as-code: ADRs, C4 diagrams, runbooks, and API contracts that live beside the source they describe.
- Works in a Git-native, AI-heavy team inside a larger organization that mandates Confluence for broad readership.
- Constraints: must keep docs current with code; must satisfy org publication/governance expectations.

### Goals and motivations
- Keep documentation evolving with the system it describes — so docs stay trustworthy, not stale.
- Publish to Confluence without copy-paste — so the team's review work isn't duplicated by hand.
- Preserve diagrams (Mermaid) as rendered images — so readers see the visual, not the source code.

### Frictions and blockers
- Manual copy breaks formatting/diagrams and loses provenance — creates two competing sources of truth.
- Re-publishing after a Confluence edit silently overwrites a colleague's contribution — destroys trust.
- Existing converters drop or mangle diagrams — the most useful content never arrives.

### Decision criteria
- Safety: never silently overwrite remote work.
- Fidelity: code blocks, tables, links, and diagrams survive intact.
- Provenance: every page traces back to a file + commit.

### Job To Be Done

**Job statement**
- When the architecture changes, I want to update docs in the same branch and have them published to Confluence automatically, so I can keep one reviewed source of truth without manual copy.

**Functional, emotional, social outcomes**
- Functional: docs ship with code, reviewed in the same PR.
- Emotional: confidence that nothing was lost or silently overwritten.
- Social: the wider org sees current, professional documentation.

**Current alternatives**
- Manual copy-paste — slow, lossy, no provenance.
- One-way converters (e.g. `mark`, `md2conf`) — limited fidelity, no drift detection, opaque in CI.

**Success criteria**
- A merged doc change appears in Confluence with no manual step.
- A diagram renders to an image and is reused when unchanged.
- Pushing unchanged content makes zero writes.

---

## Persona 2 — Platform / DevX engineer

### Role and context
- Standardizes tooling across many repositories and CI systems (GitHub Actions, GitLab, Jenkins, Azure DevOps).
- Operates a dedicated least-privilege service account for automation.
- Constraints: non-interactive runs; auditable, reproducible pipelines; protected secrets.

### Goals and motivations
- One repeatable publishing step across the org — so every team gets the same safe behaviour.
- Deterministic, scriptable output — so pipelines can gate on it.

### Frictions and blockers
- Tools that hang on prompts or require terminal scraping — break CI.
- Outputs that differ run-to-run — make pipeline gating unreliable.

### Decision criteria
- Stable exit codes + JSON/NDJSON contracts.
- Non-interactive mode that never prompts.
- Credentials from environment/secrets, never from the repo.

### Job To Be Done

**Job statement**
- When docs merge to main, I want CI to publish them deterministically and report a machine-readable result, so the pipeline stays green and auditable without human babysitting.

**Outcomes**
- Functional: a clean `push --non-interactive --format json` step with a structured result.
- Emotional: trust that a green pipeline means the publish actually happened correctly.
- Social: platform team ships a reliable standard the whole org adopts.

**Current alternatives**
- Hand-rolled scripts wrapping converters — brittle, no drift handling, no provenance.

**Success criteria**
- Same config works locally and in CI with only auth differing.
- Partial failures return a distinct exit code and a complete result.

---

## Persona 3 — Documentation owner / technical writer

### Role and context
- Owns a living docs-as-code tree: hierarchy, cross-links, assets, and labels.
- Cares about navigation, discoverability, and consistency across many pages.
- Constraints: needs folder→hierarchy mirroring and per-document overrides.

### Goals and motivations
- Reflect the repo's structure in Confluence navigation — so readers find things.
- Detect and report drift — so nothing is silently lost or stale.

### Frictions and blockers
- Reorganizing files breaks page identity (duplicates appear) — breaks links and history.
- No visibility into what would change before publishing — scary to run in CI.

### Decision criteria
- Stable page identity across renames/moves.
- Dry-run / plan / diff before any write.
- Clear drift/conflict reporting.

### Job To Be Done

**Job statement**
- When I reorganize or update the docs, I want to preview the exact plan and have page identity preserved, so navigation and links stay intact and nothing is overwritten by surprise.

**Outcomes**
- Functional: a plan that shows CREATE/UPDATE/MOVE/NOOP/CONFLICT before writing.
- Emotional: safety to run publishing without fear.

**Current alternatives**
- Converters that create a new page on every change — no identity, broken history.

**Success criteria**
- A renamed file updates its existing page instead of creating a duplicate.
- Drift is detected and reported, not silently overwritten.

---

## Persona 4 — AI coding / documentation agent  *(non-human operator)*

### Role and context
- An AI agent (e.g. OpenCode, Claude Code) operating MarkSync on a human's behalf via the CLI.
- Reads a skill/SKILL document and drives non-interactive commands.
- Constraints: cannot scrape terminals; needs explicit schemas, safe defaults, stable exits.

### Goals and motivations
- Discover and operate the CLI safely without human hand-holding.
- Always validate and dry-run before mutating.

### Frictions and blockers
- Tools with no JSON output or unstable exit codes — agents cannot reason about results.
- Destructive defaults — agents can cause damage silently.

### Decision criteria
- A discoverable skill document + published JSON schemas.
- Read-only defaults; explicit risk classification per command.
- Conflicts escalated, never auto-resolved.

### Job To Be Done

**Job statement**
- When asked to publish or validate documentation, I want to drive MarkSync via JSON and non-interactive flags with safe defaults, so I can complete the task reliably and escalate anything risky to a human.

**Outcomes**
- Functional: every needed ID/URL/diagnostic is in the JSON output.
- Emotional (for the supervising human): confidence the agent will not destroy work.

**Current alternatives**
- Driving existing GUI/web tools — not agent-operable.

**Success criteria**
- The agent can plan, validate, and (with approval) publish using only JSON I/O.
- Unsafe operations are refused or flagged, never performed silently.

---

## Persona 5 — Business owner / Product manager / Executive  *(sponsoring stakeholder, non-operator)*

### Role and context
- Non-technical stakeholder accountable for organizational knowledge, compliance, onboarding, or delivery readiness (business owner, PM, department head, or even CEO).
- Does **not** run MarkSync or Git directly; depends on engineering teams to keep Confluence current.
- Context: the organization mandates Confluence as the system of record, while engineering prefers Git. This persona is the bridge's "demand side" and frequently the one who *mandates* that the dev team adopt a sync tool.

### Goals and motivations
- Assure the org has current, trustworthy documentation in Confluence — for audits, onboarding, support, and compliance.
- Reduce the risk of decisions made on stale information.
- Let engineers work the way they prefer (Git) without losing organizational visibility.

### Frictions and blockers
- Confluence docs drift stale because engineers dislike editing there — so the org operates on outdated information.
- No visibility into whether the Git→Confluence publish pipeline ran, succeeded, or failed.
- Cannot tell which Confluence page is authoritative or when it was last synced.

### Decision criteria (for sponsoring / championing adoption)
- Trust that published docs are current and traceable to a source.
- Low burden on engineering (so the team actually adopts it).
- Assurance signals a non-technical reviewer can read: provenance, last-sync status, staleness/drift reports.

### Job To Be Done

**Job statement**
- When my organization needs reliable documentation in Confluence, I want my engineering teams to publish from their preferred Git workflow automatically and verifiably, so the whole org can trust Confluence is current without forcing developers out of Git.

**Functional, emotional, social outcomes**
- Functional: a verifiable signal that documentation was published and is traceable to its source.
- Emotional: confidence that the organization is not operating on stale information.
- Social: cross-team alignment — engineers keep their workflow; the org keeps its system of record.

**Current alternatives**
- Mandating direct Confluence editing — engineers comply reluctantly, docs drift from code, quality erodes.
- Periodic manual doc-refresh sprints — expensive, and still stale between sprints.

**Success criteria**
- Managed Confluence pages carry provenance (source path + commit + sync time) a non-technical reviewer can see.
- Staleness and drift are detectable/reportable so this persona can govern documentation currency.

