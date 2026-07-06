# Decision Instructions

> `@decision-advisor` and `@decision-critic` read this file to ground
> recommendations in MarkSync's context. This supplements the generic guides; it
> does not replace them.

## Strategic Context

### Mission

MarkSync for Confluence is a CLI tool that synchronizes a Git-tracked Markdown
corpus to Atlassian Confluence Cloud — deterministically, safely, and with a
clear audit trail. It is the first adapter of the MarkSync core; future adapters
may target other wiki platforms.

### Core priorities (ranked)

1. **Safety & determinism** — sync must never silently overwrite or lose content;
   every change is auditable and reversible (Git is the source of truth).
2. **Trust wedge first** — the MVP (`MS-0002`) is a safe one-way publisher that
   earns user trust before any reverse-sync or bidirectional features.
3. **AI-agent friendliness** — clear error messages, structured output, and
   predictable behavior so AI coding agents and CI pipelines can drive MarkSync.
4. **Maintainability** — battle-tested, easily replaceable dependencies over
   clever custom code; ports-and-adapters keeps the Confluence adapter swappable.
5. **Cross-platform reach** — Linux + Windows in `MS-0002`; macOS deferred to
   `MS-0003`.

### Decision principles

- **Reversibility trumps theoretical optimality** — ship the simpler option,
  measure, adjust. Prefer options that are easy to swap later (adapter ports,
  disposable caches).
- **Buy over build for non-core capabilities** — Mermaid rendering, CLI prompts,
  Git access, linting: use battle-tested libraries, not hand-rolled code.
- **Security and privacy are non-negotiable** — credentials never logged, redaction
  centralized, Git history never embedded without branch restriction.
- **The spike before the commitment** — high-uncertainty areas get a time-boxed
  spike (see `MS-0001` API validation pattern) before a binding decision.
- **One adapter at a time** — Confluence first; do not generalize prematurely.
  The core/adapters split exists so future adapters are possible, not required.

### Key constraints

- **Runtime**: TypeScript + Bun single-binary (`ADR-0001`); no Node, no Go.
- **Target platform**: Confluence Cloud (v2 REST API primary; v1 for
  attachments/labels/search only).
- **Team**: solo developer + AI agents.
- **Binary budget**: ~90 MB / ~2 s cold start are desired, not hard constraints.
- **Milestone discipline**: `MS-0002` = MVP safe one-way publisher. Reverse-sync,
  bidirectional, and multi-adapter features are explicitly out of scope until later
  milestones.

## Operational: Decision Tracking

### Tracker

- **Issue tracker**: GitHub Issues (`juliusz-cwiakalski/marksync`)
- **Decision tracking**: Sequential files in `doc/decisions/`
- **workItemRef prefix**: `GH-<number>`

### Decision identifier scheme

- **Format**: `<TYPE>-<zeroPad4>` where TYPE ∈ {ADR, PDR, TDR, BDR, ODR}
- **Numbering**: Sequential **per type** (ADR, PDR, TDR each have independent
  sequences). Numbers are never reused or renumbered.
- **Resolution**: Scan `doc/decisions/` for the highest existing number within
  the target type, then increment. See [00-index.md](../../doc/decisions/00-index.md)
  for the current registry.

### File location and naming

```
doc/decisions/<TYPE>-<zeroPad4>-<slug>.md
```

Examples: `ADR-0006-document-identity-and-shared-base-state-model.md`,
`TDR-0005-linter-and-formatter.md`.

### Status lifecycle

```
Proposed → Under Review → Accepted → (Deprecated | Superseded)
```

> During inception, records are `Proposed` until the human gate (PR merge)
> confirms them. All current records remain `Proposed` pending human
> confirmation at the readiness check (Phase 6).

### Labels and linking

- Decision → implementation: link via change front-matter `links.decisions`.
- Decision → affected components: noted in the decision body's "Consequences"
  section.
- Decision ↔ decision: `Supersedes` / `Superseded by` fields in front-matter.

## Decision-type guidance (MarkSync-specific)

| Type | When it applies | Examples in this repo |
|---|---|---|
| **ADR** | Architecture, runtime, data model, cross-cutting structure | ADR-0001 (TS+Bun), ADR-0005 (Storage), ADR-0006 (state model), ADR-0010 (provenance), ADR-0011 (CLI output) |
| **PDR** | Product naming, scope, positioning, adapter strategy | PDR-0001 (MarkSync brand + Confluence-first) |
| **TDR** | Library/tool/framework selection within an ADR boundary | TDR-0001 (spike), TDR-0002 (Cliffy), TDR-0005 (Biome), TDR-0006 (dependency-cruiser), TDR-0007 (Cucumber), TDR-0008 (commitlint) |
| **BDR** | Business model, pricing, market (none yet — business docs disabled) | — |
| **ODR** | Operations, deployment, runbooks (none yet) | — |

## References

- [Decision-Making Guide](../../doc/guides/decision-making.md) — the decision *process*
- [Decision Records Management Guide](../../doc/guides/decision-records-management.md) — the record *artifact*
- [Decision Record Template](../../doc/templates/decision-record-template.md)
- [Decision Records Index](../../doc/decisions/00-index.md) — current registry
