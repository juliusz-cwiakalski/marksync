---
id: MS2-E5-S3
title: "adversarial-public-corpus"
status: todo
type: story
priority: medium
epic: MS2-E5
milestone: MS-0002
estimate: 2d
gh_issue: GH-31
feature_spec: ""
decisions: []
dependencies: { blocks: [], blocked_by: [MS2-E3-S3, MS2-E3-S5] }
cross_cutting: [A-VAL-2, R-FEA-9, NFR-REL-4]
---

# MS2-E5-S3 — Adversarial public corpus

## Goal
A sanitized adversarial test corpus (seeded from real/sanitized design-partner pages) covering macros, nested tables, app content, and edge cases the canonical GFM subset excludes — to stress-test drift detection (E3-S5) and conversion fidelity (E3-S3) against realistic content, and to publish a classification of how unsupported nodes are handled.

## Background
A-VAL-2 / R-FEA-9 / NFR-REL-4. The premortem (§17.2) and roadmap call for an adversarial corpus seeded by real pages so the converter's "unsupported node" handling is exercised against real-world content (not just synthetic GFM). This story produces the corpus + classification; it does NOT expand the canonical subset.

## Detailed scope (deliverables)
1. **Corpus collection** — gather/sanitize representative pages: nested tables, Confluence macros (`{toc}`, `{info}`, `{code}`, Jira macro, expand), app/gliffy content, emoji, very long pages, pages with mixed task-lists + regular lists, pages with raw HTML. **Sanitize** all PII/customer data before committing.
2. **`tests/adversarial/`** — fixtures `*.md` (source) + expected classification `*.classification.json` (which nodes are supported-converted / unsupported-classified / escaped).
3. **Classification runner** — a test that runs each corpus doc through the markdown pipeline (E3-S3) + classifier (E3-S5) and asserts: (a) NO supported construct is mis-converted (fidelity); (b) NO unsupported node is silently dropped (E3-S5 must classify it); (c) drift detection is stable (re-running yields the same classification — no flaky drift).
4. **Published classification** — `doc/quality/adversarial-corpus-classification.md` (or under `doc/spec/`): a table of unsupported node types and MarkSync's handling (escaped / warned / requires macro). This is user-facing documentation.

## Technical approach
- Reuse the golden-fixture runner (E5-S1) infrastructure.
- Classification files are reviewed artifacts (committed).
- Sanitization: a review checklist (names/emails/IDs/Internal-ticket-URLs redacted) before commit; a grep self-audit.

## Interface contracts (what other stories consume)
- The corpus is a regression suite for E3-S3/E3-S5 (any converter/classifier change must keep the corpus green).
- The classification doc informs users what's supported.

## Acceptance criteria (testable)
- [ ] Corpus covers: nested tables, ≥3 macro types, app content, emoji, long pages, mixed task/regular lists, raw HTML.
- [ ] **NFR-REL-4 (fidelity):** supported constructs in the corpus convert correctly (golden match).
- [ ] **No silent drop:** every unsupported node in the corpus is classified (assert each appears in the classification output).
- [ ] Drift stability: classifying the same corpus twice yields identical results.
- [ ] Classification doc published; no PII in any committed artifact (self-audit grep).
- [ ] `bun run check` green.

## Test matrix
| Tier | This story |
|---|---|
| Golden + Integration | corpus → conversion → classification assertions |

## Definition of Done
Sanitized adversarial corpus committed; classification runner green; unsupported nodes never silently dropped; classification doc published; no PII. AC list is the DoD.

## Out of scope
- Expanding the canonical GFM subset to support more constructs (that's a per-construct MS-0003+ decision driven by this corpus's findings).
- Design-partner recruitment (separate track).

## Risks / open questions (CEO-resolved)
- **R1:** Sanitization missing PII. → Two-pass: automated grep (email/ID patterns) + human review checklist; the self-audit grep must return clean. CEO-recorded.
- **Q1:** Corpus size. → ~20-40 fixtures (enough to cover the categories; not exhaustive). Confirmed.
