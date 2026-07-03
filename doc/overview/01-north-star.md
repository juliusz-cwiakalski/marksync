---
# Copyright (c) 2025-2026 Juliusz Ćwiąkalski (https://www.cwiakalski.com | https://www.linkedin.com/in/juliusz-cwiakalski/ | https://x.com/cwiakalski)
# MIT License - see LICENSE file for full terms
source: https://github.com/juliusz-cwiakalski/agentic-delivery-os/blob/main/doc/templates/north-star-template.md
ados_distribution: redistributable
id: NORTH-STAR
status: Draft
created: 2026-07-03
last_updated: 2026-07-03
owners: ["juliusz-cwiakalski"]
summary: "North Star for MarkSync — a safe, Git-native bridge that publishes Markdown documentation to Confluence (and, later, other surfaces) without losing work."
ai_assistance: "AI-assisted drafting; human-authored and approved by Juliusz Ćwiąkalski."
---

# MarkSync: North Star

> **Strategic pyramid.** This north star sits atop a pyramid —
> **mission → vision → strategy → outcome**. Mission is what we do today; vision
> is the world if we succeed; strategy is how we get there; the outcome (North
> Star Metric below) is how we measure success. When layers conflict, fix the
> higher layer first.
>
> **Reconciliation note.** This is the canonical north star. It supersedes the
> older `doc/inception/north-star-draft-to-be-refined.md`, which predates the
> motivation brain dump and the pre-inception decisions. Two material changes
> from that draft: (1) the implementation language is **TypeScript compiled to a
> single binary** (ADR-0001), not Go; (2) the product/brand is **"MarkSync"**
> with Confluence as the **first adapter** (ADR-0003), so "Confluence" appears
> only as a descriptor under nominative use.
>
> **Trademark.** "Confluence" and Atlassian are trademarks of Atlassian Pty Ltd.
> MarkSync is not affiliated with or endorsed by Atlassian; "Confluence" is used
> nominatively to indicate the integration target.

## Vision

Engineering teams no longer choose between Git-native documentation workflows and organization-wide access through Confluence. Documentation stays versioned, reviewable, automatable, and AI-operable in Git, while Confluence shows a faithful, current, and traceable representation of its source — with knowledge loss minimized, not eliminated, where the two worlds meet (achieved progressively: safe one-way publish first, controlled reverse sync later).

## Mission

We enable software teams to author and govern documentation in Markdown and Git, then publish it safely to Confluence through deterministic local and CI workflows, with drift detection from day one. Controlled **reverse sync** — bringing Confluence-side edits back as reviewable patches — is added later, only once the one-way wedge has earned trust. The result: engineers and AI agents work efficiently while the wider organization keeps accessible, trusted documentation.

## Target Users

MarkSync serves several distinct **operator** personas (full detail in
[personas-jtbd.md](./personas-jtbd.md)); Confluence readers are beneficiaries
who never run the tool. A fifth, **non-operator** persona — the *sponsoring
stakeholder* (business owner / PM / executive) — does not run MarkSync but
frequently drives its adoption; it is modelled as Persona 5 in
[personas-jtbd.md](./personas-jtbd.md) and reflected under Stakeholders below.

- **Primary — Software architect / technical lead:** maintains architecture-as-code, ADRs, and Mermaid diagrams that must reach Confluence without manual copy.
- **Platform / DevX engineer:** standardizes Git→Confluence publishing across many repositories and CI pipelines.
- **Documentation owner / technical writer:** owns hierarchy, links, assets, and drift reporting for a living docs-as-code tree.
- **AI coding/documentation agent:** a non-human operator that needs stable JSON, safe defaults, and non-interactive commands.

> **Single operator, many personas.** Each sync run is driven by one author for
> one repository; MarkSync is not a multi-tenant service. But the *kind* of
> person (or agent) who hires it varies, which is why personas are modelled
> explicitly (`multi_user: true`).

## Problem We Solve

- **Two poor choices today** — author in Confluence and lose Git review/diffs/AI access, or author in Git and fail the org's publication expectation — so teams maintain duplicate, drifting copies.
- **Edits in Confluence get silently overwritten** when a Git change is re-published — so knowledge contributed by non-Git colleagues is lost and trust in automation collapses.
- **Diagrams (Mermaid/PlantUML) break or disappear** in conversion, and orgs often lack the Confluence diagram plugins — so the most useful visuals never make it to readers.
- **Existing tools are opaque, one-way, and hard to automate** — no dependable hierarchy mapping, dry-run/diff, provenance, or agent-friendly output — so teams cannot trust them in CI.
- **Setup is painful and platform-fragile** — so the tool never gets adopted past one enthusiast.
- **Closest incumbents** (e.g. `kovetskiy/mark`, `md2conf`, `markdown-confluence`) are one-way converters that lack drift detection, provenance, and agent-operable output — the specific gaps MarkSync targets.

## North Star Metric

**Automation coverage of documentation publishing** — the share of configured Git documentation changes destined for Confluence that MarkSync publishes faithfully **without manual copy-and-paste**.

A change counts as *successfully published* only when the target page is updated, the published content is traceable to its source file and Git revision, and no unresolved conflict or conversion failure remains.

**Guardrails** (must hold while optimizing the NSM):

- Zero silent content loss or overwrite.
- Conflicts and external Confluence changes are surfaced explicitly, never auto-resolved.
- Repeated synchronization is deterministic and idempotent.
- Published pages stay readable and useful to Confluence readers.
- Failures are diagnosable from human- **and** machine-readable output.

> Outcome, not output: the NSM measures a change in user behaviour (copy-paste
> eliminated), not features shipped.

**Measurement.** As a no-telemetry OSS CLI, MarkSync will not collect population
data, so the NSM above is a *directional* north-star. We track two proximate,
CLI-derivable metrics from the plan/exec report: (a) **publish success rate** =
`published` ÷ **all** plan entries (CONFLICT/ERROR kept in the denominator —
target ≥95%); and (b) **drift-detection effectiveness** — drift correctly
detected and blocked in supported remote-edit scenarios (target 100%,
guardrail), with a **conflict false-positive rate** target <5%. Splitting these
matters: a CONFLICT is the wedge *working*, so it must stay in the denominator
to keep the metric honest. True adoption breadth — the NSM denominator — is
gauged qualitatively via beta feedback and GitHub adoption signals, and feeds
Phase 2's assumption register.

## Guiding Principles

- **Git is the authoritative engineering workspace** — documentation is authored, reviewed, versioned, and approved in Git beside the code it describes.
- **Confluence is a first-class publication surface** — published pages must stay readable, navigable, and useful to people who never touch Git.
- **Safe synchronization beats magical synchronization** — prefer explicit diffs, dry runs, drift detection, and human reconciliation over silent overwrites or speculative merges.
- **Fidelity and provenance are non-negotiable for the supported canonical subset** — structure, code, tables, links, images, attachments, and diagrams are preserved; every managed page identifies its source and revision.
- **Humans and AI agents are equal operators** — commands, help, diagnostics, exit codes, and structured output serve interactive use *and* reliable automation.
- **Local-first and CI-ready** — identical core behaviour from a workstation, an agent session, a container, or a pipeline, with no required hosted control plane.

## Decision Filter

When two good options compete, prefer the one that:

1. Prevents content loss and preserves trust over maximizing automatic behaviour.
2. Keeps Git authoritative over introducing Confluence-first editing semantics.
3. Improves publishing fidelity and traceability over supporting more syntax or platforms superficially.
4. Produces deterministic, scriptable behaviour over hidden heuristics or interactive-only workflows.
5. Reduces setup and operating friction over introducing a central service or complex infrastructure.
6. Serves both human and AI-agent workflows over optimizing for one interface.
7. Serves the product contract (safety, fidelity, DX for users) over demonstrating AI-delivery velocity or feature breadth.

## Four-Risk Awareness

The top risks behind these north-star decisions (detailed in Phase 2's assumption and risk registers):

- **Value risk** — will users want it? *Yes, if* we nail the trust wedge (safe publish + drift detection). The differentiator is safety/fidelity, not raw conversion breadth.
- **Usability risk** — can users use it? *Risky.* Setup friction and platform fragility are adoption killers → the MLP exists specifically to make first-publish under ~10 minutes (excluding Atlassian credential creation).
- **Feasibility risk** — can we build it? *Mostly de-risked for the Confluence contract* (the API validation spike proved it). The **TypeScript/Bun stack itself remains contingent** on the ADR-0002 Mermaid headless-render spike (OST E3.1) and on Bun single-binary signing/trust.
- **Viability risk** — does it make business sense? *Sustainable as OSS.* No hosted backend for core value; secondary goal is the owner's personal brand / AI-delivery demonstration, which does not distort the product contract.

## Scope

**In scope (product, all phases):**

- Repository-owned YAML configuration selecting Markdown files/folders and mapping them to Confluence.
- Mirroring folder structure to a Confluence page hierarchy by default, with per-document overrides.
- Markdown → Confluence Storage Format conversion (ADR-0005) for a documented canonical subset.
- Publishing images, attachments, and rendered Mermaid diagrams (ADR-0002).
- Dry-run / plan / diff before any write; stable exit codes and JSON/NDJSON output.
- Source-path + Git-revision provenance on every managed page; drift/conflict detection that refuses unsafe overwrites.
- Local + CI operation with personal or service-account credentials.
- A controlled **reverse sync** path (Confluence→Git) that produces reviewable patches and **never** auto-commits.

**Out of scope (for now):**

- Replacing Confluence or Git hosting; a WYSIWYG editor; real-time collaborative editing.
- Automatic semantic conflict resolution; automatic Git commits/pushes; default destructive deletion.
- Perfect round-trip of arbitrary Confluence layouts (only the canonical subset is promised).
- A mandatory hosted SaaS control plane; Data Center support and other knowledge platforms before Confluence Cloud is mature.
- **Adopting/importing an existing Confluence corpus** into MarkSync's managed set (a safe first-publish over pre-existing pages) — this depends on the deferred reverse-sync path (OST O5) and is tracked as an assumption for Phase 2.

## Current Focus

Deliver the **smallest trustworthy Git→Confluence publishing loop** (the MVP),
then the **Minimum Lovable Product (MLP)** focused on exceptional DX and easy
setup. Reverse sync is staged only after the one-way wedge earns
trust. Phase boundaries are defined in Phase 2's roadmap.

Key MVP deliverables:

- A portable **TypeScript** CLI compiled to a single self-contained binary per OS/arch (ADR-0001), runnable on Linux/macOS/Windows with no language runtime for end users.
- Repository-owned YAML config with file selection, hierarchy mapping, and document-level overrides.
- Deterministic Markdown→Storage conversion and page create/update with provenance.
- Authentication for local users and non-interactive CI service accounts.
- Dry-run, diff, diagnostics, structured output, and source-revision metadata.
- A visible provenance panel/footer on each managed page (source path + Git revision + last-sync time) so non-Git readers can see provenance, not just machine metadata.
- Local assets and Mermaid diagrams (rendered via the official library, ADR-0001/0002).
- Drift/version detection that blocks unsafe overwrites.

MVP success criteria:

- A user can initialize MarkSync, configure a documentation tree, and publish to Confluence without manual copy.
- Re-running with no source changes produces zero unnecessary Confluence writes.
- Every managed page is traceable to its repository, source file, and Git revision, **and shows that provenance visibly** (panel/footer) so non-Git stakeholders can trust it.
- Dry-run output accurately reports every page/asset that would be created or updated.
- The same configuration works locally and in CI, with only authentication differing.
- Conversion/sync failures never silently corrupt or overwrite existing content.

See [02-roadmap.md](./02-roadmap.md) for the full multi-phase plan (drafted in Phase 2).

## Stakeholders

- **Software architects & technical leads** — define documentation structure, governance, and source-of-truth rules.
- **Developers & documentation authors** — create and review Markdown alongside code changes.
- **Platform & DevX teams** — standardize configuration, credentials, and CI rollout across repositories.
- **Confluence readers (PMs, analysts, support, auditors, customers)** — consume current documentation without Git access.
- **Sponsoring stakeholders (business owners, product managers, executives)** — depend on current Confluence documentation for decisions, audits, and onboarding; champion adoption so engineering keeps it current without leaving Git. They do not run the CLI but are often the reason a team adopts MarkSync.
- **AI coding/documentation agents** — create, validate, compare, and publish documentation through predictable CLI operations.
- **Open-source contributors & project owner (Juliusz Ćwiąkalski)** — evolve MarkSync while protecting safety, interoperability, and maintainability; the project also serves as a demonstration of high-quality AI-native delivery.

---

## Document History

| Date       | Author             | Change |
| ---------- | ------------------ | ------ |
| 2026-07-03 | Juliusz Ćwiąkalski | Canonical north star: reconciled motivation brain dump + 2026-06-16 draft + ADR-0001 (TypeScript) + ADR-0003 (MarkSync brand). Replaced Go-specific framing; added personas, four-risk awareness, OST link. |
| 2026-07-03 | Juliusz Ćwiąkalski | Red-team pass: added NSM measurement proxy, visible-provenance MVP deliverable, existing-corpus migration assumption, sponsor-persona cross-reference, trademark + AI-assistance notices; softened vision/feasibility/principle over-reach; standardized "reverse sync"; added competitor naming + decision-filter guardrail. |
