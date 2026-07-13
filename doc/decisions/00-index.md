---
# Copyright (c) 2025-2026 Juliusz Ćwiąkalski (https://www.cwiakalski.com | https://www.linkedin.com/in/juliusz-cwiakalski/ | https://x.com/cwiakalski)
# MIT License - see LICENSE file for full terms
source: https://github.com/juliusz-cwiakalski/agentic-delivery-os/blob/main/doc/decisions/00-index.md
---
# Decision Records Index

All decision records for this repository, ordered by number.

> **Migration note (Phase 3, 2026-07-04; reclassified 2026-07-05; statuses
> corrected 2026-07-06; ADR-0001/ADR-0002/TDR-0004 reconciled with the Mermaid
> spike 2026-07-06).** ADR-0001 and ADR-0002 were authored pre-inception in
> `doc/inception/decisions/` and migrated to this canonical home
> (`doc/decisions/`). Subsequent records were created during Phase 3 inception.
> On 2026-07-05, records were reclassified per the updated ADOS decision-making
> guide: each type has its own sequence (ADR, PDR, TDR). On 2026-07-06 (Phase 6
> readiness check), all records were flipped from `Proposed` to `Accepted` —
> their containing PRs had merged to `main`, which per the corrected lifecycle
> (Phase 5) means they are final. Later on 2026-07-06 (GH-11 lifecycle phase 7),
> ADR-0001, ADR-0002, and TDR-0004 were reconciled with the Mermaid headless-render
> spike outcome: ADR-0002 Part B stays spike-gated (H4 fidelity FAIL → MS-0002
> ships fallback rung 7 `code` policy; Part B does **not** advance to
> `spike-validated`); ADR-0001's revisit trigger is activated for owner review
> (catastrophic-FAIL escalation not triggered); TDR-0004's default happy-dom path
> runs but is insufficient for faithful rendering. Governance statuses remain
> `Accepted`; the spike changed the substantive Part B / revisit-trigger state,
> recorded in each record's body and Revision History.
>
> **Update 2026-07-13 (GH-25, lifecycle phase 7).** **CEO-DEC-1** resolved the
> owner-level decision left open by the GH-11 spike: MS-0002 ships the `code`
> policy (ADR-0002 rung 7) as the default; full in-process Mermaid SVG rendering
> deferred to MS-0003+; TypeScript/Bun locked in — ADR-0001 NOT revisited (the
> revisit trigger is resolved without fundamental reconsideration; catastrophic-FAIL
> escalation never triggered). The `code` policy is implemented, tested, and
> correctly defaulted under GH-25. ADR-0001/ADR-0002 governance statuses remain
> `Accepted`; the open-question/resolution state is recorded in each record's body
> and Revision History.
>
> **Update 2026-07-13 (GH-69, lifecycle phase 7).** MS-0002 also wires the
> `render` policy (ADR-0002 rung 6) to the public Kroki API behind the domain
> `Renderer` port — an opt-in remote SVG renderer with a one-time privacy warning
> (NFR-PRIV-2) and per-fence fallback to `code` on network failure (C-2). The
> default remains `code` (no remote egress). The in-process official-library
> renderer (Part B, rungs 1–5) remains deferred to MS-0003+. ADR-0002 governance
> status remains `Accepted`; the revision history records the GH-69 update.

| ID | Type | Title | Status | Date | Owners |
|----|------|-------|--------|------|--------|
| [ADR-0001](./ADR-0001-implementation-language-and-runtime.md) | ADR | Implementation language and runtime — TypeScript (single-binary) over Go | Accepted | 2026-07-03 | Juliusz Ćwiąkalski |
| [ADR-0002](./ADR-0002-mermaid-rendering-strategy.md) | ADR | Mermaid rendering strategy | Accepted | 2026-07-03 | Juliusz Ćwiąkalski |
| [PDR-0001](./PDR-0001-product-naming-confluence-adapter.md) | PDR | Product naming and architecture — "MarkSync" core with Confluence as the first adapter | Accepted | 2026-07-03 | Juliusz Ćwiąkalski |
| [TDR-0001](./TDR-0001-confluence-api-validation-spike.md) | TDR | Run a scoped Atlassian Confluence Cloud API validation spike before implementation | Accepted | 2026-07-03 | Juliusz Ćwiąkalski |
| [ADR-0005](./ADR-0005-page-body-representation-storage-not-adf.md) | ADR | Page body representation — write Storage Format, not ADF | Accepted | 2026-07-03 | Juliusz Ćwiąkalski |
| [ADR-0006](./ADR-0006-document-identity-and-shared-base-state-model.md) | ADR | Document identity and shared-base state model — source-side UUID v7 + committed lock + disposable cache | Accepted | 2026-07-04 | Juliusz Ćwiąkalski |
| [TDR-0002](./TDR-0002-cli-framework.md) | TDR | CLI framework — Cliffy | Accepted | 2026-07-04 | Juliusz Ćwiąkalski |
| [TDR-0003](./TDR-0003-git-adapter.md) | TDR | Git adapter — shell-Git behind the Repository interface | Accepted | 2026-07-04 | Juliusz Ćwiąkalski |
| [TDR-0004](./TDR-0004-testing-runner.md) | TDR | Testing runner — bun:test + thin E2E runner | Accepted | 2026-07-04 | Juliusz Ćwiąkalski |
| [TDR-0005](./TDR-0005-linter-and-formatter.md) | TDR | Linter and formatter — Biome for lint + format in one tool | Accepted | 2026-07-05 | Juliusz Ćwiąkalski |
| [TDR-0006](./TDR-0006-import-boundary-enforcement.md) | TDR | Import-boundary enforcement — dependency-cruiser for architecture rules | Accepted | 2026-07-05 | Juliusz Ćwiąkalski |
| [TDR-0007](./TDR-0007-gherkin-bdd-runner.md) | TDR | Gherkin/BDD runner — @cucumber/cucumber for lifecycle-invariant tests | Accepted | 2026-07-05 | Juliusz Ćwiąkalski |
| [TDR-0008](./TDR-0008-conventional-commits-enforcement.md) | TDR | Conventional Commits enforcement — commitlint + husky commit-msg hook + CI lint job | Accepted | 2026-07-05 | Juliusz Ćwiąkalski |
| [ADR-0010](./ADR-0010-confluence-page-history-provenance-and-sync-granularity.md) | ADR | Confluence page history provenance and sync granularity — squash by default, commit-by-commit deferred | Accepted | 2026-07-04 | Juliusz Ćwiąkalski |
| [ADR-0011](./ADR-0011-cli-output-strategy.md) | ADR | CLI output strategy — structured results + generic JSON renderer + optional per-command human formatter | Accepted | 2026-07-05 | Juliusz Ćwiąkalski |
