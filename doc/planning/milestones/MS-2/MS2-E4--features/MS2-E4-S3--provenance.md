---
id: MS2-E4-S3
title: "provenance"
status: todo
type: story
priority: high
epic: MS2-E4
milestone: MS-0002
estimate: 1d
gh_issue: GH-27
feature_spec: doc/spec/features/feature-safe-publish.md
decisions: [ADR-0010]
dependencies: { blocks: [], blocked_by: [MS2-E3-S6] }
cross_cutting: [NFR-REL-9, NFR-A11Y-3]
---

# MS2-E4-S3 — Provenance (visible panel + machine metadata)

## Goal
Every managed page carries **visible provenance** (a panel/footer: source path + Git revision + last-sync timestamp) readable by non-technical stakeholders, AND machine-readable `marksync.metadata` content property + `version.message` history (per ADR-0010 / NFR-REL-9 / NFR-A11Y-3).

## Background
ADR-0010 + ADR-0006: `version.message` carries per-version Git provenance (the squash prefix + compact summary, blueprint §5, implemented in E3-S4/E3-S6). This story adds the **visible** panel/footer on the page body and ensures the `marksync.metadata` property is fully populated + readable. Direct Confluence edits remain identifiable by the absence of the MarkSync prefix (NFR-REL-9).

## Detailed scope (deliverables)
1. **`src/infra/confluence/provenance.ts`** — extend (seeded in E3-S4): `formatVersionMessage(...)` (blueprint §5) + `buildProvenancePanel(meta): string` → a Storage XHTML panel (Confluence `{info}` macro or a styled `<div>` with a stable marker class) showing source path, head commit, branch, last-sync time. Keep it minimal + accessible (NFR-A11Y-3).
2. **Pipeline injection** — the markdown pipeline (E3-S3) appends the provenance panel to the rendered Storage body before write (configurable via `provenance.visiblePanel`, default true). The panel is part of the rendered body hash EXCEPT it's excluded from the content-hash comparison (so updating last-sync time alone doesn't trigger false drift) — the hash canonicalization (E3-S5) must normalize out the timestamp.
3. **`marksync.metadata` property** — fully populated after apply (E3-S6): `{projectId, uuid, sourceCommit, sourceBranch, sourceContentHash, renderedBodyHash, operationId, synchronizedAt, toolVersion, commitCount, trimMarker}`. **Privacy:** commit subjects are NOT stored in the property (only count + marker); full list stays local (ADR-0010).
4. **Direct-edit detection helper** — a `classifyVersion(version): "marksync"|"direct"` predicate: presence of the `marksync:` prefix in `version.message` → marksync-authored; absence → direct edit. Used by `doctor`/future reverse-sync.

## Technical approach
- Panel via `{info}` macro: `<ac:structured-macro ac:name="info"><ac:rich-text-body>…</ac:rich-text-body></ac:structured-macro>` (omit schema-version/macro-id per spike rule).
- Exclude the timestamp from the canonical hash: the canonicalizer (E3-S5) strips a known marker block before hashing.
- Property value is a JSON **string** (spike H2 v2 accepts strings).

## Interface contracts (what other stories consume)
- `buildProvenancePanel` consumed by E3-S3/E3-S6 (body assembly).
- `marksync.metadata` schema consumed by E3-S2 (lock cross-check), E3-S6 (write), E5-S2 (doctor).
- `classifyVersion` consumed by E5-S2/MS-0004+.

## Acceptance criteria (testable)
- [ ] **NFR-A11Y-3:** every managed page renders a visible provenance panel with source path + Git revision + last-sync.
- [ ] **NFR-REL-9:** `version.message` carries the `marksync:squash` prefix + head SHA + path (from E3-S6); a direct Confluence edit produces a version WITHOUT the prefix → `classifyVersion` returns "direct".
- [ ] **Privacy:** `marksync.metadata` contains NO commit subjects (only count + trim marker); full list appears only in local plan/apply output.
- [ ] Timestamp in the panel does NOT cause false drift: two syncs at different times with identical content → `NO_CHANGE` (the canonicalizer normalizes the timestamp).
- [ ] 100% managed pages have valid provenance after sync (integration assertion).
- [ ] `bun run check` green.

## Test matrix
| Tier | This story |
|---|---|
| Unit | panel builder output (golden snapshot), property schema validation, classifyVersion (prefix vs none), hash-normalization of timestamp |
| Integration | full apply → page body has panel + property populated; second sync (same content) → NO_CHANGE |

## Definition of Done
Visible provenance panel on every managed page; `marksync.metadata` populated; version.message provenance (via E3-S6); direct-edit classifiable; privacy (no commit subjects in Confluence). AC list is the DoD.

## Out of scope
- Commit-by-commit history (ADR-0010 C-5 deferred).
- Reverse-sync provenance (MS-0005+).
- A GUI/editor for provenance.

## Risks / open questions (CEO-resolved)
- **R1:** Panel could bloat small pages. → Minimal `{info}` macro; configurable off via `provenance.visiblePanel:false`. CEO-recorded.
- **Q1:** Where to place the panel. → Footer (end of body) by default; non-disruptive. Confirmed.
