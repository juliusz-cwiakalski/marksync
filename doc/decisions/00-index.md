---
# Copyright (c) 2025-2026 Juliusz Ćwiąkalski (https://www.cwiakalski.com | https://www.linkedin.com/in/juliusz-cwiakalski/ | https://x.com/cwiakalski)
# MIT License - see LICENSE file for full terms
source: https://github.com/juliusz-cwiakalski/agentic-delivery-os/blob/main/doc/decisions/00-index.md
---
# Decision Records Index

All decision records for this repository, ordered by number.

> **Migration note (Phase 3, 2026-07-04; reclassified 2026-07-05).** ADR-0001
> and ADR-0002 were authored pre-inception in `doc/inception/decisions/` and
> migrated to this canonical home (`doc/decisions/`). Subsequent records were
> created during Phase 3 inception. On 2026-07-05, records were reclassified
> per the updated ADOS decision-making guide: each type has its own sequence
> (ADR, PDR, TDR). All remain `status: Proposed` pending human confirmation.

| ID | Type | Title | Status | Date | Owners |
|----|------|-------|--------|------|--------|
| [ADR-0001](./ADR-0001-implementation-language-and-runtime.md) | ADR | Implementation language and runtime — TypeScript (single-binary) over Go | Proposed | 2026-07-03 | Juliusz Ćwiąkalski |
| [ADR-0002](./ADR-0002-mermaid-rendering-strategy.md) | ADR | Mermaid rendering strategy | Proposed | 2026-07-03 | Juliusz Ćwiąkalski |
| [PDR-0001](./PDR-0001-product-naming-confluence-adapter.md) | PDR | Product naming and architecture — "MarkSync" core with Confluence as the first adapter | Proposed | 2026-07-03 | Juliusz Ćwiąkalski |
| [TDR-0001](./TDR-0001-confluence-api-validation-spike.md) | TDR | Run a scoped Atlassian Confluence Cloud API validation spike before implementation | Proposed | 2026-07-03 | Juliusz Ćwiąkalski |
| [ADR-0005](./ADR-0005-page-body-representation-storage-not-adf.md) | ADR | Page body representation — write Storage Format, not ADF | Proposed | 2026-07-03 | Juliusz Ćwiąkalski |
| [ADR-0006](./ADR-0006-document-identity-and-shared-base-state-model.md) | ADR | Document identity and shared-base state model — source-side UUID v7 + committed lock + disposable cache | Proposed | 2026-07-04 | Juliusz Ćwiąkalski |
| [TDR-0002](./TDR-0002-cli-framework.md) | TDR | CLI framework — Cliffy | Proposed | 2026-07-04 | Juliusz Ćwiąkalski |
| [TDR-0003](./TDR-0003-git-adapter.md) | TDR | Git adapter — shell-Git behind the Repository interface | Proposed | 2026-07-04 | Juliusz Ćwiąkalski |
| [TDR-0004](./TDR-0004-testing-runner.md) | TDR | Testing runner — bun:test + thin E2E runner | Proposed | 2026-07-04 | Juliusz Ćwiąkalski |
| [TDR-0005](./TDR-0005-linter-and-formatter.md) | TDR | Linter and formatter — Biome for lint + format in one tool | Proposed | 2026-07-05 | Juliusz Ćwiąkalski |
| [TDR-0006](./TDR-0006-import-boundary-enforcement.md) | TDR | Import-boundary enforcement — dependency-cruiser for architecture rules | Proposed | 2026-07-05 | Juliusz Ćwiąkalski |
| [TDR-0007](./TDR-0007-gherkin-bdd-runner.md) | TDR | Gherkin/BDD runner — @cucumber/cucumber for lifecycle-invariant tests | Proposed | 2026-07-05 | Juliusz Ćwiąkalski |
| [TDR-0008](./TDR-0008-conventional-commits-enforcement.md) | TDR | Conventional Commits enforcement — commitlint + husky commit-msg hook + CI lint job | Proposed | 2026-07-05 | Juliusz Ćwiąkalski |
| [ADR-0010](./ADR-0010-confluence-page-history-provenance-and-sync-granularity.md) | ADR | Confluence page history provenance and sync granularity — squash by default, commit-by-commit deferred | Proposed | 2026-07-04 | Juliusz Ćwiąkalski |
| [ADR-0011](./ADR-0011-cli-output-strategy.md) | ADR | CLI output strategy — structured results + generic JSON renderer + optional per-command human formatter | Proposed | 2026-07-05 | Juliusz Ćwiąkalski |
