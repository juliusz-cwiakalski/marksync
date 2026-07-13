# Readiness Review Iteration 1

Verdict: NOT_READY
Work Item: GH-69
Date: 2026-07-13
Pause Required: no

## Facet Summary

- spec_completeness: PASS
- ac_quality: PASS
- plan_coverage: FAIL
- test_traceability: PASS (with 1 minor edge-case gap)
- cross_artifact_consistency: FAIL
- decision_capture: PASS
- system_spec_consistency: PASS (with 2 minor ADR-0002 tensions, documented)
- plan_doc_update_coverage: FAIL (minor)
- plan_code_area_coverage: PASS
- dod_defined: PASS

## Findings

### 1. [BLOCKER] plan_coverage / cross_artifact_consistency — plan#Phase-3 (P3.1 code sketch)

**Gap:** The plan's P3.1 code sketch places the mermaid HAST transform BEFORE
`resolver.resolve(hast, path)`. The `AssetResolver`
(`src/domain/assets/resolver.ts:50-68`) walks ALL `<img>` nodes; for any non-http
`src` it calls `path.resolve(docDir, src)` then `fs.realpathSync(target)`, which
throws on non-existent paths and returns `Forbidden(path-traversal)` — aborting
the entire plan. A mermaid `img` node with
`src = "marksync-mermaid-<hash>.svg"` (a content-addressed attachment name, not
a local file) would be caught, treated as a local file path, fail `realpathSync`,
and abort `computePlan` on every document containing a mermaid fence. The primary
happy-path scenario (TC-MERM-001 / AC-1) would never succeed.

The spec F-3 (line 126) correctly implies resolver-first ("append to existing
assets from AssetResolver if present"), but the plan inverts this ordering. The
plan's bottom note ("The mermaid transform runs AFTER mdastToHast and BEFORE
target.renderBody") reinforces the wrong placement without mentioning
`resolver.resolve()`.

**Suggested remediation target phase:** delivery_planning

**Suggested fix:** Revise P3.1 so the mermaid transform runs AFTER
`resolver.resolve()` and BEFORE `target.renderBody()`. The resolver must not see
mermaid-generated `img` nodes (they are content-addressed attachment references,
not local file paths). The existing `imageMacro` in `storage.ts` already emits
`<ri:attachment ri:filename="..."/>` for non-http `<img>` `src` values, so no
resolver pass is needed for mermaid nodes. Add an explicit note to the plan
explaining the ordering constraint and why.

---

### 2. [MAJOR] cross_artifact_consistency — spec#G-4/F-4/AC-5/DEC-4/DM-5/glossary/§7.1 vs test-plan#TC-MERM-001/TC-MERM-007 + plan#summary/notes

**Gap:** The PM decision (pm-notes decision 3) supersedes spec DEC-4: the
mermaid artifact filename uses the FULL 64-char sha256 hex, NOT truncated to 24
chars. The test plan and plan correctly reflect this (TC-MERM-007: "The hash is
64 hex characters (full sha256), NOT truncated to 24 chars"; plan: "FULL sha256
hash, NOT truncated"). However, the spec body was never reconciled and still
says truncated in 8+ locations:
  - G-4 (line 59): "marksync-mermaid-<first-24-hex>.svg"
  - F-4 (line 95): "marksync-mermaid-<first-24-hex>.svg"
  - F-4 detail (line 132): "truncated to 24 chars for filename"
  - F-4 detail (line 133): "The truncated form is only for display/filename"
  - AC-5 (line 368): "same filename marksync-mermaid-<first-24-hex>.svg"
  - DEC-4 (line 343): "truncated to 24 chars for filename"
  - DM-5 (line 260): "marksync-mermaid-<first-24-hex>.svg"
  - §7.1 In Scope (line 216): "marksync-mermaid-<first-24-hex>.svg"
  - Glossary (line 417): "marksync-mermaid-<first-24-hex>.svg"

A coder reading spec AC-5 ("same filename marksync-mermaid-<first-24-hex>.svg")
would implement truncation and fail TC-MERM-007 ("NOT truncated to 24 chars").

**Suggested remediation target phase:** specification

**Suggested fix:** Update all 8+ locations in the spec body to use the full
sha256 hash. Mark DEC-4 as "SUPERSEDED by PM decision (pm-notes decision 3):
full hash, not truncated." Update AC-5, G-4, F-4, DM-5, glossary, and §7.1 to
say "marksync-mermaid-<full-sha256>.svg".

---

### 3. [MAJOR] cross_artifact_consistency — spec#DM-5/§16 vs plan#Files-touched/notes

**Gap:** Spec DM-5 (line 260) proposes a NEW helper
`mermaidFilename(hash: string)` in `src/domain/assets/naming.ts`, and §16 (line
355) lists `src/domain/assets/naming.ts` as UPDATED. The existing
`naming.ts` only has `assetFilename()` (no mermaid variant). The plan correctly
omits this — per PM decision 4, the coder must reuse the existing
`attachmentFilename()` in `src/infra/confluence/attachments.ts` (which already
produces `marksync-mermaid-<hash>.svg` for `kind === "mermaid"`). The plan's
"Files touched" section does not include `naming.ts`, and the plan notes
explicitly say "Do NOT add a truncating helper or modify the existing
`attachmentFilename()`." A coder reading the spec's DM-5/§16 would create a
new `mermaidFilename()` helper that the plan says not to create.

**Suggested remediation target phase:** specification

**Suggested fix:** Remove DM-5's `mermaidFilename()` proposal and §16's
`src/domain/assets/naming.ts` entry. Replace with a note that the existing
`attachmentFilename()` in `src/infra/confluence/attachments.ts` handles mermaid
naming via the `kind: "mermaid"` marker (no new helper needed).

---

### 4. [MINOR] system_spec_consistency — spec#F-4 vs ADR-0002#Attachment-identity-hash-formula

**Gap:** ADR-0002's hash formula hashes the **normalized logical render input**
(`marksync-mermaid-render-v1` + normalized source + renderer family/version +
output format + theme + security config + font policy + scale + background).
The spec F-4 hashes the **SVG bytes** (output) instead. This divergence is
reasonable for the Kroki path (single-server, same Kroki version → stable bytes),
but the spec does not acknowledge or justify it. If Kroki upgrades its bundled
Mermaid version, same-source diagrams would produce different SVG bytes →
different hash → re-upload (violating NFR-PERF-4 intent), whereas ADR-0002's
logical-input formula would be stable.

**Suggested remediation target phase:** specification

**Suggested fix:** Add a note in F-4 acknowledging the divergence from
ADR-0002's logical-input hash formula and justifying the byte-level hashing
for the Kroki path (e.g., "Kroki is a single-server remote service; byte-level
hashing is stable within a Kroki version; cross-version re-upload is acceptable
for MS-0002; ADR-0002's logical-input formula applies to the in-process renderer
where cross-OS byte drift is expected").

---

### 5. [MINOR] system_spec_consistency — spec#NG-3 vs ADR-0002#Security-Requirements

**Gap:** ADR-0002 Security Requirements states "SVG sanitization before
attaching to Confluence" is a hard requirement "for every renderer rung" and
"If a fallback rung cannot satisfy them, it is downgraded in the fallback
ladder." Spec NG-3 defers sanitization to MS-0003+ without recording an
explicit accepted-risk exception (ADR-0002 §Constraint Compliance Attestation
says "accepted-risk exceptions may be required if MVP ships on a fallback rung
whose [security] is weaker").

**Suggested remediation target phase:** specification

**Suggested fix:** Add an explicit accepted-risk note in NG-3 / §21 referencing
ADR-0002 Security Requirements, stating that Kroki is trusted for MS-0002, the
risk is accepted for the demo milestone, and sanitization is tracked for MS-0003+.

---

### 6. [MINOR] plan_doc_update_coverage — plan#(missing doc-update section)

**Gap:** The pm-notes has a "Doc-impact preview" (lines 106-117) listing docs
to update: `feature-mermaid-rendering.md` (render policy now implemented),
`ADR-0002` (rung 6 wired — revision-history entry), `nonfunctional.md`
(NFR-PRIV-2 evidence), `architecture-overview.md` (new domain/mermaid module).
The plan does not carry this forward into any phase or section. The coder has
no visibility of doc-update obligations.

**Suggested remediation target phase:** delivery_planning

**Suggested fix:** Add a "Documentation updates" section (or a Phase 5.5 task)
listing the system docs that the @doc-syncer phase 7 must update, so the
obligation is visible in the plan.

---

### 7. [MINOR] test_traceability — test-plan#TC-scenarios (no empty-source edge case)

**Gap:** No test case covers an empty mermaid fence (`` ```mermaid ```` with no
source). The transform would extract `source = ""`, POST an empty body to
Kroki, and likely receive an error → fallback to code block (F-6). This path is
implicitly covered by the fallback mechanism but not explicitly tested.

**Suggested remediation target phase:** test_planning

**Suggested fix:** Add a unit test case (TC-MERM-012) for empty mermaid source
→ fallback to code block + warning, asserting no crash and no upload.

---

### 8. [MINOR] plan_coverage — plan#P2.1 (transform HAST walking)

**Gap:** The transform's P2.1 code sketch says "Walk HAST for element nodes with
tagName === pre" but does not specify recursive walking. Mermaid fences can
appear inside blockquotes, list items, or table cells (nested HAST structures).
The AssetResolver uses a recursive `walkElements` generator; the mermaid
transform should do the same. A non-recursive walk would miss mermaid fences
inside blockquotes/lists.

**Suggested remediation target phase:** delivery_planning

**Suggested fix:** Specify in P2.1 that the HAST walk must recurse into all
element children (like `AssetResolver.walkElements`), not just top-level
children.
