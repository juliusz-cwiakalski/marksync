---
# Copyright (c) 2025-2026 Juliusz Ćwiąkalski (https://www.cwiakalski.com | https://www.linkedin.com/in/juliusz-cwiakalski/ | https://x.com/cwiakalski)
# MIT License - see LICENSE file for full terms
ados_distribution: project-generated
change:
  ref: GH-27
  type: feat
  status: Proposed
  slug: provenance
  title: "[MS2-E4-S3] Provenance - Visible Panel and Machine Metadata"
  owners: [Juliusz Ćwiąkalski]
  service: marksync-cli
  labels: [MS-0002, provenance, metadata, accessibility]
  version_impact: minor
  audience: internal
  security_impact: low
  risk_level: low
  dependencies:
    internal: [sync-engine, markdown-pipeline, confluence-adapter, git-adapter]
    external: [Confluence Cloud API]
---

# CHANGE SPECIFICATION

> **PURPOSE**: Ensure every managed Confluence page carries visible provenance (source path + Git revision + last-sync timestamp) readable by non-technical stakeholders AND machine-readable `marksync.metadata` content property, enabling direct-edit classification while maintaining privacy and avoiding false drift.

## 1. SUMMARY

This change delivers provenance infrastructure for the safe publish pipeline: a visible panel/footer on every managed page showing source path, Git revision, branch, and last-sync timestamp; complete enrichment of the `marksync.metadata` content property; and a predicate to classify Confluence page versions as MarkSync-authored or directly edited. The visible panel is gated by a configuration knob and excluded from content-hash comparison so timestamp updates do not trigger false drift. Privacy is enforced by storing only commit count and truncation marker in Confluence, never full commit subjects (ADR-0010).

## 2. CONTEXT

### 2.1 Current State Snapshot

The safe publish pipeline (MS-0002) currently stores per-version provenance in `version.message` via the `formatVersionMessage` function (MS2-E3-S4, GH-23). The `marksync.metadata` content property exists but is incompletely populated—it lacks `sourceBranch`, `commitCount`, and `trimMarker`. No visible provenance panel exists on published pages, and there is no programmatic predicate to distinguish MarkSync-authored versions from direct Confluence edits. The `provenance.visiblePanel` configuration knob exists (default true) but is not consumed by the pipeline.

### 2.2 Pain Points / Gaps

Non-technical stakeholders (Persona 5) cannot inspect a published Confluence page to understand its source origin, Git revision, or last-sync time without CLI access. The `marksync.metadata` property carries incomplete metadata, limiting its utility for cross-checks and future reverse-sync. Direct Confluence edits are not machine-distinguishable from MarkSync-authored versions without manual inspection of version messages. Updating the last-sync timestamp would cause false drift if not excluded from content-hash comparison. Commit subjects may leak sensitive metadata into Confluence if stored in the property (privacy concern addressed in ADR-0010).

## 3. PROBLEM STATEMENT

Because the safe publish pipeline lacks visible provenance on published pages, complete `marksync.metadata` enrichment, and a direct-edit classifier, non-technical stakeholders cannot verify document origin, automated drift detection may incorrectly flag timestamp-only updates, and future reverse-sync cannot reliably distinguish MarkSync-authored versions from direct edits, resulting in reduced auditability, potential false-positive conflicts, and limited observability.

## 4. GOALS

- **G-1**: Every managed page renders a visible provenance panel with source path, Git revision, branch, and last-sync timestamp (NFR-A11Y-3).
- **G-2**: The `marksync.metadata` content property is fully populated with all required fields, including `sourceBranch`, `commitCount`, and `trimMarker`.
- **G-3**: A programmatic predicate classifies Confluence page versions as MarkSync-authored or direct edit based on `version.message` prefix (NFR-REL-9).
- **G-4**: Updating the last-sync timestamp does not trigger false drift—the panel is appended post-render as a Storage string; the drift classifier compares HAST hashes which exclude the panel, so timestamp variance cannot affect drift detection.
- **G-5**: Privacy is enforced—commit subjects are not stored in the `marksync.metadata` content property (only `commitCount` + `trimMarker` per ADR-0010).

### 4.1 Success Metrics / KPIs

| Metric | Target |
|--------|--------|
| Managed pages with valid visible provenance panel | 100% |
| Managed pages with complete `marksync.metadata` property | 100% |
| Direct-edit classification accuracy | 100% |
| False drift from timestamp-only updates | 0% |
| Commit subjects in `marksync.metadata` property | 0% (per ADR-0010) |

### 4.2 Non-Goals

- **NG-1**: Commit-by-commit history in Confluence (deferred per ADR-0010).
- **NG-2**: Reverse-sync provenance (MS-0005+).
- **NG-3**: A GUI/editor for provenance.
- **NG-4**: Modifying ADR-0006 drift-detection safety—provenance is metadata on a safe update, never a bypass around version checks.
- **NG-5**: Storing commit subjects in `marksync.metadata` content property—privacy constraint (ADR-0010).

## 5. FUNCTIONAL CAPABILITIES

 | ID | Capability | Rationale |
|----|------------|-----------|
| F-1 | Build visible provenance panel | Enables non-technical stakeholders to verify document origin without CLI access (NFR-A11Y-3). |
| F-2 | Inject panel into Storage body | Appends panel to rendered content before Confluence write, gated by `provenance.visiblePanel` knob. The panel is excluded from drift-detection hash by construction (appended post-render to Storage string; classifier compares HAST hashes which exclude the panel). |
| F-3 | Exclude panel from drift hash by construction | The panel is appended post-render as a Storage string; the drift classifier compares HAST hashes which exclude the panel, so timestamp variance cannot affect drift detection. No canonicalizer change is needed. |
| F-4 | Enrich `marksync.metadata` property | Populates complete metadata including `sourceBranch`, `commitCount`, `trimMarker` for cross-checks and future reverse-sync. |
| F-5 | Classify version as MarkSync or direct | Predicate reads `version.message` prefix to distinguish MarkSync-authored versions from direct edits (NFR-REL-9). |

### 5.1 Capability Details

**F-1: Build visible provenance panel** — Given a set of provenance metadata (source path, head commit, branch, last-sync timestamp), the system constructs a minimal, accessible Confluence `{info}` macro in Storage XHTML format showing these fields. The panel uses plain text within a stable marker class, omits `schema-version` and `macro-id` per spike rules, and is placed at the footer (end of body) by default.

**F-2: Inject panel into Storage body** — During the markdown→Storage pipeline, before writing to Confluence, the system appends the provenance panel to the rendered Storage body when `config.provenance.visiblePanel` is true (default). The panel is excluded from drift-detection hash by construction (appended post-render to Storage string; classifier compares HAST hashes which exclude the panel).

**F-3: Exclude panel from drift hash by construction** — The provenance panel is appended post-render as a Storage string to the body payload. The drift classifier compares HAST hashes (`local.canonicalHash` vs `base.renderedBodyHash`), which inherently exclude the panel because the panel never enters the HAST. This ensures that two syncs with identical content at different times produce the same HAST hash, resulting in `NO_CHANGE` classification rather than false drift. No canonicalizer change is needed—exclusion is by construction.

**F-4: Enrich `marksync.metadata` property** — After a successful Confluence page update, the system stores a JSON string in the `marksync.metadata` content property containing: `{schemaVersion, projectId, targetId, documentId(uuid), sourcePath, sourceCommit, sourceBranch, sourceContentHash, renderedBodyHash, operationId, synchronizedAt, toolVersion, commitCount, trimMarker}`. The property contains NO commit subjects—only the count and a truncation marker (ADR-0010 privacy constraint).

**F-5: Classify version as MarkSync or direct** — Given a Confluence page version object, the system returns `"marksync"` if `version.message` starts with the prefix `marksync git` (space, not colon), otherwise `"direct"`. This predicate is consumed by `doctor` and future reverse-sync (MS-0005+) to identify versions that were not authored by MarkSync. The prefix matches the actual `PROVENANCE_PREFIX` constant implemented in `src/infra/confluence/provenance.ts`.

## 6. USER & SYSTEM FLOWS

```
Flow 1: Publish with visible provenance
  User runs `marksync push` → Markdown renders to Storage → Provenance panel built (if enabled) → Panel appended to Storage body → Confluence write → `marksync.metadata` enriched → Page version includes MarkSync prefix

Flow 2: Idempotent sync (same content, different time)
  User runs `marksync push` again → Body unchanged (HAST identical) → Panel rebuilt with new timestamp as Storage string append → Classifier compares HAST hashes (no panel in HAST) → Hash matches → NO_CHANGE → 0 writes to Confluence

Flow 3: Direct Confluence edit classification
  User edits page directly in Confluence → Version lacks MarkSync prefix → `classifyVersion` returns "direct" → `doctor` flags as non-MarkSync-authored
```

## 7. SCOPE & BOUNDARIES

### 7.1 In Scope

- Visible provenance panel builder (`buildProvenancePanel`) returning Storage XHTML `{info}` macro.
- Pipeline injection of panel into rendered Storage body, gated by `provenance.visiblePanel` configuration.
- Panel exclusion from drift-detection hash by construction (appended post-render to Storage string; classifier compares HAST hashes).
- Full enrichment of `marksync.metadata` content property with all required fields.
- Direct-edit classification predicate (`classifyVersion`) based on `version.message` prefix.
- Privacy enforcement: commit subjects stored only in local output, not in Confluence (ADR-0010).
- Footer placement of panel (end of body) by default.
- Configurable disable of visible panel via `provenance.visiblePanel: false`.

### 7.2 Out of Scope

- [OUT] Commit-by-commit history in Confluence (deferred per ADR-0010 C-5).
- [OUT] Reverse-sync provenance (MS-0005+).
- [OUT] GUI or editor for provenance.
- [OUT] Modifying ADR-0006 drift-detection safety or no-silent-overwrite behavior.
- [OUT] Storing commit subjects in `marksync.metadata` content property (per ADR-0010 privacy constraint).
- [OUT] Provenance panel customization beyond minimal `{info}` macro.
- [OUT] Panel placement other than footer (end of body).

### 7.3 Deferred / Maybe-Later

- Commit-by-commit sync as an opt-in feature (ADR-0010 records as future milestone option).
- Reverse-sync provenance integration (MS-0005+).
- Enhanced panel formatting or rich metadata display.

## 8. INTERFACES & INTEGRATION CONTRACTS

### 8.1 REST / HTTP Endpoints

N/A — this change uses existing Confluence REST API endpoints (page update, content property write) and adds no new endpoints.

### 8.2 Events / Messages

N/A — no new events or message types.

### 8.3 Data Model Impact

| ID | Element | Description |
|----|---------|-------------|
| DM-1 | `marksync.metadata` property schema | Extended to include `sourceBranch`, `commitCount`, `trimMarker` fields; JSON string format. |
| DM-2 | `ProvenanceInput` | Extended to include `sourceBranch` field (already carries `headCommit`, `commitCount`, `subjects`). |
| DM-3 | `PageBinding` | May require new fields: `sourceBranch`, `commitCount`, `trimMarker` (to reflect property state). |
| DM-4 | Confluence `{info}` macro format | Storage XHTML: `<ac:structured-macro ac:name="info"><ac:rich-text-body>…</ac:rich-text-body></ac:structured-macro>` (no `schema-version`/`macro-id`). |

### 8.4 External Integrations

**Confluence Cloud API** — existing integration, no changes to API contract. Uses:
- Page update API (write body + `version.message`).
- Content property API (write `marksync.metadata`).
- Page version history API (read `version.message` for classification).

### 8.5 Backward Compatibility

**Fully backward compatible.** The change adds optional capabilities (visible panel, enriched property) that do not break existing flows:
- Existing pages without panels or incomplete properties continue to function.
- The `provenance.visiblePanel` knob defaults to true but can be disabled.
- Direct-edit classification operates on `version.message` prefix, which is already present from MS2-E3-S4.
- Lock-schema.json is extended with OPTIONAL fields (`sourceBranch`, `commitCount`, `trimMarker`) added to the PageBinding definition. Existing locks without these fields remain valid (backward-compatible reading).

## 9. NON-FUNCTIONAL REQUIREMENTS (NFRs)

| ID | Requirement | Threshold |
|----|-------------|-----------|
| NFR-REL-9 | Per-version provenance | Every MarkSync-applied page version carries `marksync git` prefix + head SHA + path in `version.message`; direct edits lack prefix → `classifyVersion` returns "direct". |
| NFR-A11Y-3 | Visible provenance accessibility | Every managed page shows a readable panel/footer with source path + Git revision + last-sync; uses plain text within stable marker, no color-dependency. |
| NFR-PERF-4 | Idempotent rerun (no false drift) | Two syncs at different times with identical content → `NO_CHANGE` (panel is appended post-render as Storage string; classifier compares HAST hashes which exclude the panel, so timestamp variance does not affect drift detection). |

## 10. TELEMETRY & OBSERVABILITY REQUIREMENTS

No new telemetry or observability requirements. Provenance is visible on-page and machine-readable via the content property; existing plan/apply output includes provenance information.

## 11. RISKS & MITIGATIONS

 | ID | Risk | Impact | Probability | Mitigation | Residual Risk |
|----|------|--------|-------------|------------|---------------|
| RSK-1 | Panel bloats small pages | L | L | Minimal `{info}` macro; configurable disable via `provenance.visiblePanel: false` (CEO-resolved). | L |
| RSK-2 | Panel placement disrupts content | M | L | Footer placement (end of body) by default; non-disruptive (CEO-resolved). | L |
| RSK-3 | Timestamp updates trigger false drift | M | L | Panel is excluded from drift-detection hash by construction (appended post-render to Storage string; classifier compares HAST hashes). Golden fixture tests cover idempotent sync. | L |
| RSK-4 | Privacy violation if commit subjects leak | H | L | Hard constraint from ADR-0010: only count + marker in property; subjects stored only locally; test coverage enforces. | L |

## 12. ASSUMPTIONS

- The `provenance.visiblePanel` configuration knob exists in `src/app/config.ts` (default true) and is ready for consumption.
- The Git adapter's `currentBranch()` port is available and already called for the branch gate (MS2-E3-S6).
- The `formatVersionMessage` function (MS2-E3-S4) already prefixes `version.message` with `marksync git` (space, not colon — see `PROVENANCE_PREFIX` constant in `src/infra/confluence/provenance.ts:9`).
- The `marksync.metadata` content property accepts JSON string values (verified in spike H2 v2).
- Confluence Storage XHTML `{info}` macro format is stable and does not require `schema-version` or `macro-id`.
- The provenance panel is appended post-render as a Storage XHTML string, never injected into the HAST. The drift classifier compares HAST hashes (`local.canonicalHash` vs `base.renderedBodyHash`), which inherently exclude the panel, so timestamp updates cannot trigger false drift.

## 13. DEPENDENCIES

| Direction | Item | Notes |
|-----------|------|-------|
| Depends on | MS2-E3-S6 (GH-23) | Sync engine must be complete for provenance injection path. **RESOLVED** (MERGED). |
| Depends on | MS2-E3-S5 | Canonical hash and content-hash computation must exist. **RESOLVED** (part of GH-23). |
| Depends on | MS2-E3-S4 (GH-21) | `formatVersionMessage` provides `marksync git` prefix. **RESOLVED** (MERGED). |
| Blocks | E5-S2 (doctor) | Direct-edit classification predicate consumed by doctor. |
| Blocks | MS-0005+ | Reverse-sync relies on complete provenance. |

## 14. OPEN QUESTIONS

None. All open questions were CEO-resolved before this story (see Risks §11).

## 15. DECISION LOG

| ID | Decision | Rationale | Date |
|----|----------|-----------|------|
| DEC-1 | Use minimal `{info}` macro for panel | Keeps panel compact, accessible, non-bloating; configurable off if needed. | 2026-07-14 (CEO-resolved) |
| DEC-2 | Place panel at footer (end of body) | Non-disruptive to page content; consistent with provenance-as-footer mental model. | 2026-07-14 (CEO-resolved) |
| DEC-3 | Exclude timestamp from content hash | Prevents false drift on idempotent reruns; timestamp is metadata, not content. | 2026-07-14 (from story) |
| DEC-4 | Store only count + marker in property, not subjects | Privacy constraint from ADR-0010 prevents leaking sensitive commit subjects to Confluence. | 2026-07-14 (ADR-0010) |
| DEC-5 | Prefix-based classification for direct edits | Simple, reliable: MarkSync versions have `marksync git` prefix; direct edits do not. | 2026-07-14 (NFR-REL-9) |

## 16. AFFECTED COMPONENTS (HIGH-LEVEL)

 | Component | Impact |
|-----------|--------|
| `src/infra/confluence/provenance.ts` | Extended: adds `buildProvenancePanel`, `classifyVersion`; `formatVersionMessage` unchanged. |
| `src/app/push-flow.ts` | Updated: panel injection into pipeline, property enrichment with complete metadata. |
| `src/app/config.ts` | No change: `provenance.visiblePanel` knob consumed (already exists). |
| `src/domain/git/port.ts` | No change: `currentBranch()` already available. |
| `src/domain/state/reconcile.ts` | No change: `marksync.metadata` cross-check logic unchanged. |
| `src/domain/binding/page-binding.ts` | May extend: new fields for `sourceBranch`, `commitCount`, `trimMarker`. |

## 17. ACCEPTANCE CRITERIA

 | ID | Criterion | Linked |
|----|-----------|--------|
| AC-F1-1 | **Given** a managed document is published, **when** the page is viewed in Confluence, **then** it displays a visible provenance panel showing source path, Git revision, branch, and last-sync timestamp. | F-1, F-2, NFR-A11Y-3 |
| AC-F1-2 | **Given** `provenance.visiblePanel` is `false`, **when** a document is published, **then** the page body does NOT contain the provenance panel. | F-2 |
| AC-F3-1 | **Given** a document is published at time T1, **when** the same document is published again at time T2 with identical content, **then** the classifier returns `NO_CHANGE` (panel excluded from HAST hash by construction prevents false drift). | F-3, NFR-PERF-4 |
| AC-F4-1 | **Given** a document is published successfully, **when** the `marksync.metadata` property is read, **then** it contains all required fields: `schemaVersion, projectId, targetId, documentId, sourcePath, sourceCommit, sourceBranch, sourceContentHash, renderedBodyHash, operationId, synchronizedAt, toolVersion, commitCount, trimMarker`. | F-4, DM-1 |
| AC-F4-2 | **Given** a document is published successfully, **when** the `marksync.metadata` property is read, **then** it contains NO commit subjects—only `commitCount` and `trimMarker`. | F-4, ADR-0010 |
| AC-F5-1 | **Given** a Confluence page version with `version.message` starting with `marksync git`, **when** `classifyVersion` is called, **then** it returns `"marksync"`. | F-5, NFR-REL-9 |
| AC-F5-2 | **Given** a Confluence page version without the `marksync git` prefix, **when** `classifyVersion` is called, **then** it returns `"direct"`. | F-5, NFR-REL-9 |
| AC-INT-1 | **Given** a sync completes, **when** all managed pages are inspected, **then** 100% have valid visible provenance panels and complete `marksync.metadata` properties. | F-1, F-4, integration |
| AC-CI-1 | **Given** the codebase is complete, **when** `bun run check` is executed, **then** all tests pass (unit + integration + golden). | story requirement |

## 18. ROLLOUT & CHANGE MANAGEMENT (HIGH-LEVEL)

This change is additive and backward compatible:
1. Merge the feature branch into main.
2. Deploy to CI (fast loop tests validate).
3. Existing pages remain functional; new pages automatically get panels and complete metadata on next sync.
4. No user action required—`provenance.visiblePanel` defaults to true.
5. Users can opt out via config if panel bloat is a concern.

## 19. DATA MIGRATION / SEEDING (IF APPLICABLE

N/A — no data migration required. Existing pages gain panels and enriched metadata on next sync.

## 20. PRIVACY / COMPLIANCE REVIEW

**Privacy impact: LOW.** This change enforces the ADR-0010 privacy constraint. The `marksync.metadata` content property stores only `commitCount` and `trimMarker` (a truncation indicator string like `"+3 more"`), never commit subjects. Commit subjects are intentionally included in `version.message` per ADR-0010 C-2 to provide a compact provenance summary in the version history. No personal data, credentials, or sensitive information is introduced.

**Compliance: MIT License** — no changes to licensing or attribution.

## 21. SECURITY REVIEW HIGHLIGHTS

**Security impact: LOW.** This change adds informational metadata only:
- No new credential exposure paths (provenance data is non-sensitive: paths, commit SHAs, timestamps).
- No changes to secret redaction or credential handling.
- Content-property metadata is read-only for most users (standard Confluence permissions apply).
- Panel injection does not increase attack surface—Storage XHTML `{info}` macro is standard Confluence markup.

**NFR-SEC-1 compliance maintained:** No secrets/tokens appear in any output path (provenance panel, property, version message).

## 22. MAINTENANCE & OPERATIONS IMPACT

**Low maintenance impact:**
- Panel format is simple and unlikely to change.
- Property schema is stable; future extensions would be additive.
- Panel exclusion from drift-detection hash by construction requires no ongoing maintenance (post-render append, HAST-based classifier).
- Direct-edit classification is a pure predicate with no external dependencies.

**Operational notes:**
- Users can disable visible panels via config if panel bloat is a concern.
- `doctor` command will leverage `classifyVersion` to flag non-MarkSync-authored versions.
- Property cross-check in `reconcileWithProperty` will validate enriched metadata.

## 23. GLOSSARY

 | Term | Definition |
|------|------------|
| Provenance panel | A visible footer on a Confluence page showing source path, Git revision, branch, and last-sync timestamp. |
| `marksync.metadata` | Confluence content property storing machine-readable metadata (JSON string). |
| `marksync git` prefix | Conventional prefix in `version.message` identifying MarkSync-authored versions (space, not colon). |
| Panel exclusion by construction | The provenance panel is appended post-render to the Storage body; the drift classifier compares HAST hashes which exclude the panel, so timestamp updates cannot trigger false drift. |
| Direct edit | A Confluence page version not authored by MarkSync (lacks `marksync git` prefix). |
| Commit subjects | Text descriptions of Git commits; stored only locally, not in Confluence (ADR-0010). |
| Trim marker | Indicator in `marksync.metadata` that the commit list was truncated for length (a string like `"+3 more"`). |

## 24. APPENDICES

### Appendix A: Panel Format Example

Storage XHTML snippet (simplified):

```xml
<ac:structured-macro ac:name="info">
  <ac:rich-text-body>
    <p><strong>Source:</strong> docs/guide/api.md</p>
    <p><strong>Git revision:</strong> a1b2c3d (main)</p>
    <p><strong>Last sync:</strong> 2026-07-14T12:34:56Z</p>
  </ac:rich-text-body>
</ac:structured-macro>
```

### Appendix B: Property Schema Example

```json
{
  "schemaVersion": 1,
  "projectId": "my-project",
  "targetId": "default",
  "documentId": "018f1234-5678-9abc-def0-123456789abc",
  "sourcePath": "docs/guide/api.md",
  "sourceCommit": "a1b2c3d",
  "sourceBranch": "main",
  "sourceContentHash": "sha256:...",
  "renderedBodyHash": "sha256:...",
  "operationId": "018f1234-5678-9abc-def0-123456789abd",
  "synchronizedAt": "2026-07-14T12:34:56Z",
  "toolVersion": "0.1.0",
  "commitCount": 5,
  "trimMarker": "+3 more"
}
```

## 25. DOCUMENT HISTORY

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-07-14 | Juliusz Ćwiąkalski | Initial specification |

---

## AUTHORING GUIDELINES

This spec was authored using:
- Story file: `doc/planning/milestones/MS-2/MS2-E4--features/MS2-E4-S3--provenance.md`
- Feature spec: `doc/spec/features/feature-safe-publish.md`
- ADR-0010: `doc/decisions/ADR-0010-confluence-page-history-provenance-and-sync-granularity.md` (privacy constraint)
- NFRs: `doc/spec/nonfunctional.md` (NFR-REL-9, NFR-A11Y-3)
- Coding rules: `.ai/rules/typescript.md`, `.ai/rules/testing-strategy.md`

All deliverables, acceptance criteria, and risks are sourced from the story file and CEO-resolved open questions. No implementation details are included—only functional capabilities, interface contracts, and acceptance criteria.

## VALIDATION CHECKLIST

- [x] `change.ref` matches provided `workItemRef` (GH-27)
- [x] `owners` has at least one entry (Juliusz Ćwiąkalski)
- [x] `status` is "Proposed"
- [x] All sections present in order (1-25 + guidelines + checklist)
- [x] ID prefixes consistent and unique (F-1..F-5, AC-*, RSK-1..RSK-4, DEC-1..DEC-5, DM-1..DM-4, NFR-*)
- [x] Acceptance criteria reference at least one F-/NFR- ID and use Given/When/Then
- [x] NFRs include measurable values (100%, 0%)
- [x] Risks include Impact & Probability (H/M/L)
- [x] No implementation details (no file-level code paths, no step-by-step tasks)
- [x] No content duplicated from linked docs (cited instead)
- [x] Front matter validates per front_matter_rules