---
# Copyright (c) 2025-2026 Juliusz Ćwiąkalski (https://www.cwiakalski.com | https://www.linkedin.com/in/juliusz-cwiakalski/ | https://x.com/cwiakalski)
# MIT License - see LICENSE file for full terms
source: https://github.com/juliusz-cwiakalski/agentic-delivery-os/blob/main/doc/templates/change-spec-template.md
ados_distribution: redistributable
change:
  ref: GH-63
  type: fix
  status: Proposed
  slug: frontmatter-strip
  title: "[MS2-E4] YAML front-matter leaks into rendered Confluence content (P0)"
  owners: [Juliusz Ćwiąkalski]
  service: marksync-cli
  labels: [bug, MS-0002, priority:high]
  version_impact: patch
  audience: internal
  security_impact: none
  risk_level: low
  dependencies:
    internal: []
    external: [remark-frontmatter]
---

# CHANGE SPECIFICATION

> **PURPOSE**: Ensure YAML front-matter used for document identity (`marksync.uuid`) is stripped from the rendered Confluence page body while preserving UUID read functionality.

## 1. SUMMARY

This change fixes a P0 bug where YAML front-matter (the `marksync.uuid` identity block) is rendered as visible content on Confluence pages. The root cause is that the markdown parser does not recognize and skip front-matter blocks, so remark interprets the `---` delimiters as thematic breaks and the YAML body as headings/paragraphs. The fix installs the `remark-frontmatter` plugin and wires it into the markdown processor, causing remark to recognize and exclude document-leading YAML front-matter from the MDAST tree before rendering.

## 2. CONTEXT

### 2.1 Current State Snapshot

The markdown pipeline in `src/domain/markdown/parse.ts` builds a remark processor as `remark().use(remarkGfm)` without the `remark-frontmatter` plugin. When a Markdown file begins with:

```yaml
---
marksync:
  uuid: 019f5a2c-4a59-77aa-96ad-70f3719c2d1e
---
# Hello World
```

The parser treats the opening `---` as a thematic break, the YAML body as headings/paragraphs, and the closing `---` as another thematic break. This produces `<hr/><h2>marksync:\nuuid: ...</h2><hr/>` at the top of every managed page in Confluence. The identity service reads UUIDs via `readUuid()` in `src/domain/identity/frontmatter.ts`, which uses its own independent front-matter parser and is unaffected by this rendering bug.

### 2.2 Pain Points / Gaps

- Every managed page displays visible front-matter content (`<hr/>` + YAML-as-heading) at the top, polluting the page body.
- The visible content includes the UUID, which is internal metadata and should not be exposed to end users.
- The bug affects all pages managed by MarkSync, since `init`/`injectUuid` adds `marksync.uuid` front-matter to all managed documents.
- This violates NFR-REL-4 (conversion fidelity) — the rendered output should match the user's Markdown intent, not include internal metadata.

## 3. PROBLEM STATEMENT

Because the markdown parser does not recognize YAML front-matter blocks, the `marksync.uuid` identity block is rendered as visible thematic breaks and headings on the Confluence page, resulting in polluted page bodies and exposed internal metadata.

## 4. GOALS

- **G-1**: Front-matter is stripped from the rendered Confluence Storage XHTML body (no `<hr/>`/YAML leak).
- **G-2**: `readUuid()` continues to correctly read the UUID from front-matter (unchanged behavior).
- **G-3**: Existing golden fixture tests pass with updated snapshots reflecting the fix.

### 4.1 Success Metrics / KPIs

| Metric | Target |
|--------|--------|
| Front-matter visibility in rendered Storage XHTML | 0 occurrences (fully stripped) |
| UUID read accuracy | 100% (same as before) |
| Test suite pass rate | 100% (golden fixtures updated) |

### 4.2 Non-Goals

- **NG-1**: No change to `src/domain/identity/frontmatter.ts` (`readUuid`/`injectUuid`) — they use their own parser and must remain unchanged.
- **NG-2**: No change to the HAST bridge, storage renderer, or canonicalizer.
- **NG-3**: No support for TOML or other front-matter formats — only YAML (`---`), which is what MarkSync emits.
- **NG-4**: No change to the identity/init flow.

## 5. FUNCTIONAL CAPABILITIES

| ID | Capability | Rationale |
|----|------------|-----------|
| F-1 | Front-matter stripping in markdown parser | Ensures document-leading YAML front-matter is excluded from MDAST before rendering |
| F-2 | Thematic-break (`---`) behavior preserved | Ensures `remark-frontmatter` only consumes a valid front-matter block (opening `---` + closing `---`/`...`); a lone document-leading `---` with no closing fence (the `hr.md` fixture) and any mid-document `---` are handled deterministically (verified empirically) |
| F-3 | UUID read continuity | Ensures `readUuid()` behavior is unchanged (regression guard) |

### 5.1 Capability Details

**F-1: Front-matter stripping in markdown parser**
The markdown processor recognizes YAML front-matter blocks delimited by `---` at the very start of the document and excludes them from the MDAST tree. The front-matter content is never passed to the MDAST→HAST bridge or Storage renderer, so it does not appear in the Confluence page body.

**F-2: Thematic-break (`---`) behavior preserved**
`remark-frontmatter` recognizes a front-matter block only when an opening `---` at document start is followed by a closing `---` or `...` fence. The `hr.md` golden fixture contains exactly a single document-leading `---` with **no** closing fence — an edge case whose rendered output under `remark-frontmatter` (thematic break vs. consumed front-matter) is **verified empirically** during implementation. If `remark-frontmatter` consumes the lone `---`, the fixture is updated (per AC-F3-2's golden-update clause) so the test still proves deterministic `---` handling. Any genuinely mid-document `---` continues to render as `<hr/>`.

**F-3: UUID read continuity**
The identity service reads UUIDs via `readUuid()` in `src/domain/identity/frontmatter.ts`, which uses an independent front-matter parser (`findFrontMatter`). This behavior is unchanged; the fix only affects rendering, not identity reads.

## 6. USER & SYSTEM FLOWS

```
Flow 1: Markdown file with front-matter → Confluence
  User: run `marksync sync`
  System: parseMarkdown reads source → remark-frontmatter strips front-matter → MDAST→HAST → Storage render → Confluence body (no front-matter visible)
  Identity: readUuid still extracts UUID from source (unchanged)

Flow 2: Mid-document thematic break (regression guard)
  User: Markdown with `---` mid-document
  System: parseMarkdown → remark treats as thematic break → Storage render → `<hr/>` in Confluence (unchanged)
```

## 7. SCOPE & BOUNDARIES

### 7.1 In Scope

- Wire `remark-frontmatter` into the markdown processor in `src/domain/markdown/parse.ts`
- Add `remark-frontmatter` dependency to `package.json` / `bun.lock`
- Add a golden fixture proving front-matter is stripped
- Ensure `readUuid()` still reads UUID (regression test)
- Update existing golden fixtures where the fix changes behavior

### 7.2 Out of Scope

- [OUT] Any change to `src/domain/identity/frontmatter.ts` (`readUuid`/`injectUuid`)
- [OUT] Any change to the HAST bridge, storage renderer, or canonicalizer
- [OUT] TOML or other front-matter formats (only YAML `---`)
- [OUT] Changes to the identity/init flow

### 7.3 Deferred / Maybe-Later

None — this is a focused P0 bug fix with clear scope boundaries.

## 8. INTERFACES & INTEGRATION CONTRACTS

### 8.1 REST / HTTP Endpoints

N/A — no Confluence API changes.

### 8.2 Events / Messages

N/A — no new events or message formats.

### 8.3 Data Model Impact

| ID | Element | Description |
|----|---------|-------------|
| DM-1 | MDAST output from parseMarkdown | No longer includes front-matter nodes (YAML becomes invisible to downstream stages) |

### 8.4 External Integrations

| Integration | Impact |
|-------------|--------|
| remark-frontmatter (npm package) | New dependency; compatible with remark 15 |

### 8.5 Backward Compatibility

- **Output:** Storage XHTML output changes for documents with front-matter (the fix improves correctness). Existing pages without front-matter are unaffected.
- **Identity:** No change to `readUuid()` behavior — UUIDs are still read correctly from front-matter.
- **Lock file:** No change to lock file schema or binding logic.

## 9. NON-FUNCTIONAL REQUIREMENTS (NFRs)

| ID | Requirement | Threshold |
|----|-------------|-----------|
| NFR-REL-4 | Conversion fidelity | 100% of canonical GFM fixtures survive round-trip (this fix IMPROVES fidelity) |
| NFR-PERF-5 | Conversion latency | No measurable impact (one plugin addition is negligible) |

## 10. TELEMETRY & OBSERVABILITY REQUIREMENTS

N/A — no new telemetry or observability requirements. This is a correctness fix with no observable behavior changes except the output.

## 11. RISKS & MITIGATIONS

| ID | Risk | Impact | Probability | Mitigation | Residual Risk |
|----|------|--------|-------------|------------|---------------|
| RSK-1 | `remark-frontmatter` incorrectly consumes mid-document `---` fences | H | L | Test with `hr.md` golden fixture (thematic break mid-document) | L |
| RSK-2 | Dependency compatibility issue with remark 15 | H | L | Verify `remark-frontmatter` v5 targets unified 11 / remark 15 | L |
| RSK-3 | Regression in `readUuid()` behavior | M | L | Add regression test verifying UUID read returns same value before/after fix | L |

## 12. ASSUMPTIONS

- `remark-frontmatter` v5 is compatible with remark ^15.0.1 and remark-gfm ^4.0.1 (confirmed by compatibility matrix).
- The `hr.md` golden fixture uses `---` as a mid-document thematic rule, which is the regression guard case.
- `readUuid()` uses its own parser and is unaffected by changes to the markdown processor.

## 13. DEPENDENCIES

| Direction | Item | Notes |
|-----------|------|-------|
| Depends on | remark-frontmatter npm package | New dependency; install via `bun add remark-frontmatter` |

## 14. OPEN QUESTIONS

None — the problem, root cause, and fix path are clear.

## 15. DECISION LOG

| ID | Decision | Rationale | Date |
|----|----------|-----------|------|
| DEC-1 | Use `remark-frontmatter` plugin | It is the standard, well-maintained solution for YAML front-matter stripping in the remark ecosystem; targets remark 15 | 2026-07-13 |
| DEC-2 | No changes to `readUuid()` / identity service | The identity service uses an independent parser; changing it would introduce unnecessary risk | 2026-07-13 |

## 16. AFFECTED COMPONENTS (HIGH-LEVEL)

| Component | Impact |
|-----------|--------|
| Markdown pipeline (src/domain/markdown/parse.ts) | Updated (wire in `remark-frontmatter`) |
| Golden fixture tests (tests/golden/markdown/storage-renderer.test.ts) | Updated (new fixture + snapshot updates) |
| package.json / bun.lock | Updated (add `remark-frontmatter`) |

## 17. ACCEPTANCE CRITERIA

| ID | Criterion | Linked |
|----|-----------|--------|
| AC-F1-1 | **Given** a Markdown source beginning with `---\nmarksync:\n  uuid: <uuid>\n---\n` followed by content, **when** parsed and rendered to Storage XHTML, **then** the rendered body contains NO front-matter content (no `<hr/>` immediately following the open, no YAML-as-heading text, no leading whitespace leak). The body renders only the Markdown content after the closing `---`. | F-1 |
| AC-F1-2 | **Given** a Markdown source with `---` at line 0 followed by content, **when** parsed, **then** the MDAST tree excludes the front-matter block (no nodes for YAML or the opening/closing `---` fences). | F-1 |
| AC-F2-1 | **Given** a Markdown source with `marksync.uuid` front-matter, **when** `readUuid()` is called, **then** it returns the same UUID before and after the fix (regression guard — `src/domain/identity/frontmatter.ts` is unchanged per NG-1; existing identity tests TC-FM-001/002 in `tests/unit/domain/identity/frontmatter.test.ts` already cover this and continue to pass). | F-3 |
| AC-F2-2 | **Given** the full existing test suite, **when** run, **then** all tests pass with golden snapshots/fixture counts updated to reflect the fix. The `hr.md` fixture (a document-leading **lone** `---` with no closing fence — an edge case, NOT a mid-document rule) must produce a deterministic, verified result; if `remark-frontmatter` changes its output, the fixture is updated per the golden-update clause below. | F-2 |
| AC-F3-2 | Golden snapshots/fixture counts may be updated to reflect the corrected behavior; any fixture change must be reviewed and intentional (no silent snapshot regeneration). | F-1, F-2 |

## 18. ROLLOUT & CHANGE MANAGEMENT (HIGH-LEVEL)

- **Delivery order:** Install dependency → update processor → add tests → update fixtures → verify all tests pass.
- **Merge strategy:** Single PR squashed to `main`; branch protection requires review.
- **Communication:** No user-facing communication needed (this fixes a P0 bug that users would see immediately).

## 19. DATA MIGRATION / SEEDING (IF APPLICABLE)

N/A — no data migration or seeding required. The fix affects rendering only; no data stores change.

## 20. PRIVACY / COMPLIANCE REVIEW

N/A — no privacy or compliance implications.

## 21. SECURITY REVIEW HIGHLIGHTS

N/A — no security impact. The fix removes visible UUID metadata from pages, which is a minor security improvement.

## 22. MAINTENANCE & OPERATIONS IMPACT

- **Dependency addition:** `remark-frontmatter` becomes a dependency with minimal maintenance surface (well-maintained plugin).
- **Test maintenance:** One new golden fixture; existing fixture count increases from 26 to 27.

## 23. GLOSSARY

| Term | Definition |
|------|------------|
| Front-matter | YAML metadata block at the start of a Markdown document, delimited by `---` lines. MarkSync uses it for `marksync.uuid`. |
| MDAST | Markdown Abstract Syntax Tree — the intermediate representation produced by remark. |
| Storage XHTML | Confluence's internal HTML-based storage format, the write target per ADR-0005. |

## 24. APPENDICES

### Appendix A: Root cause analysis

The root cause is confirmed in `src/domain/markdown/parse.ts`:

```typescript
const processor = remark().use(remarkGfm);  // Missing remark-frontmatter
```

Without `remark-frontmatter`, the raw front-matter text is parsed as markdown, producing `<hr/>` (thematic break) + YAML-as-heading nodes.

### Appendix B: Compatibility verification

`remark-frontmatter` v5 targets unified 11 / remark 15, matching the project's `remark` ^15.0.1 and `remark-gfm` ^4.0.1. Verified via compatibility matrix.

## 25. DOCUMENT HISTORY

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-07-13 | Juliusz Ćwiąkalski | Initial specification |

---

## AUTHORING GUIDELINES

This spec was authored following the template at `doc/templates/change-spec-template.md` and the change lifecycle in `doc/guides/change-lifecycle.md`. The problem, root cause, and fix path are derived from GitHub Issue GH-63 and the planning summary provided. The spec references ADR-0005 (Storage Format as write target), the markdown pipeline section of `feature-safe-publish.md`, and the relevant NFRs in `nonfunctional.md`.

## VALIDATION CHECKLIST

- [x] `change.ref` matches provided `workItemRef` (GH-63)
- [x] `owners` has at least one entry (Juliusz Ćwiąkalski)
- [x] `status` is "Proposed"
- [x] All sections present in order (1-25 + guidelines + checklist)
- [x] ID prefixes consistent and unique (F-, AC-, NFR-, RSK-, DEC-, DM-)
- [x] Acceptance criteria reference at least one F-/NFR- ID and use Given/When/Then
- [x] NFRs include measurable values
- [x] Risks include Impact & Probability
- [x] No implementation details (no file-level code paths, no step-by-step tasks)
- [x] No content duplicated from linked docs
- [x] Front matter validates per front_matter_rules