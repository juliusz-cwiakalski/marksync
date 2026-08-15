# Readiness Review Iteration 1 (DoR Gate — GH-92)

Verdict: NOT_READY
Work Item: GH-92
Date: 2026-08-15
Pause Required: no

Reviewer: `@readiness-reviewer` (adversarial DoR gate, lifecycle phase 5)
Inputs: ticket GH-92 (`gh issue view 92`, scope authority with PDR-0002), `chg-GH-92-spec.md` v0.1, `chg-GH-92-test-plan.md` v0.2, `chg-GH-92-plan.md` v1.0, `chg-GH-92-pm-notes.yaml` (PM-DEC-1/2/3, TDR-0012/0013 logged), `doc/decisions/TDR-0012-reverse-storage-xml-parser-saxes.md`, `doc/decisions/TDR-0013-reverse-markdown-serializer-substrate.md`, tree @ `main 80065a4` (working tree; no delivery branch yet).

## Facet Summary

- spec_completeness: PASS
- ac_quality: PASS
- plan_coverage: PASS
- test_traceability: PASS
- cross_artifact_consistency: **FAIL**
- decision_capture: PASS
- system_spec_consistency: PASS
- plan_doc_update_coverage: PASS
- plan_code_area_coverage: PASS
- dod_defined: PASS

Blocking findings: 1 major, 1 minor (blocking-by-facet). Non-blocking: 1 minor, 2 nits.
Reopen target: **delivery_planning** (single artifact — the plan; spec and test plan pass all facets).

## Ticket → Spec AC Traceability (facet: spec_completeness)

| Ticket AC / scope row | Spec AC / F | Verdict |
|---|---|---|
| 100% round-trip: "for every canonical fixture, `reverse(forward(md))` equals normalized `md`" | AC-F1-1 (corpus A), AC-F1-1 corpus-B arm via TC-RT-002 | Covered — see DEC-7 honesty audit below |
| Deterministic output (same input → byte-identical) | AC-F1-2 (in-process + across-run snapshot layer) | Covered — stronger than ticket (across-run made mechanical) |
| Panel + mermaid wrappers stripped before conversion, verified by fixtures | AC-F3-1, AC-F3-2 (+ AC-F3-3 K1) | Covered |
| Construct coverage (ticket Scope list) | F-1 + Appendix A mirror | Covered — enumerated per family; maps onto exactly the 26 corpus-A fixtures on disk |
| Round-trip harness | F-2, AC-F2-1 (mechanical guardrail) | Covered — stronger than ticket |
| PM-DEC-1 diagnostics (PDR-0002 C-4) | F-4, DM-2, AC-F4-1/F4-2 | Covered — two-class taxonomy, fast-fail/collect-all parity |
| PM-DEC-2 no CLI | F-6, AC-F6-1 (+ TC-REG-001 structural checks, zero `src/cli/` delta) | Covered |

### DEC-7 corpus A/B partition — honesty audit (adversarial probe #1)

Not a weakening. Verified against the on-disk corpus (33 `.md` / 34 `.storage.xhtml` / 2 `.unsupported.txt` in `tests/golden/fixtures/markdown/`): the 7 corpus-B fixtures are not round-trippable *by construction* — `frontmatter`/comment fixtures' annotations never reach Storage (forward parse strips them, GH-63/GH-77 carve-out); `raw-html-inline-real` is forward-classified unsupported; `mixed-html-comment` converts to empty; `raw-html-block-real` has no Storage twin at all (verified on disk). Forcing raw equality on them would require the reverse converter to *synthesize* annotations — violating DEC-6 and weakening the normalizer, exactly what DEC-7's rationale states. Corpus B instead gets **explicit pinned expected bytes + diagnostics sidecars** (stronger than nothing, weaker than vacuous equality). Corpus A (26) was name-by-name verified to match the on-disk canonical fixtures exactly. The ticket's "every canonical fixture" is honestly read as canonical-construct fixtures; nothing canonical was moved out of the equality arm.

## Grounding Verification (facets: test_traceability, plan_code_area_coverage, system_spec_consistency)

Verified against the tree, not taken on faith:

- Corpus inventory: 33 `.md`, 34 `.storage.xhtml`, 2 `.unsupported.txt`; corpus A list (26 names) and corpus B (7) in test-plan §6.2 match disk exactly; `raw-html-block-real` has no Storage twin (34 = 32 twins + `provenance-panel` + `mermaid-render-policy`). ✓
- Loader invisibility (NG-3): `storage-renderer.test.ts:31` and `tests/integration/markdown/pipeline-roundtrip.test.ts` both `readdirSync(...).filter(f => f.endsWith(".md"))` before reading — the `reverse/` subdir, manifest JSON, and new `.storage.xhtml` files are invisible to both; the `exactly 33` locks exist (`expect(fixtures.length).toBe(n/33)`). ✓
- Well-formed-XML helper (`tests/unit/_helpers/assert-well-formed-xml.test.ts`): filters `*.storage.xhtml`, asserts `≥ 25` goldens and well-formedness — the 3 new Storage-only fixtures will be (correctly) picked up; the malformed fixture lives in `tests/adversarial-storage/`, outside the scan. ✓
- PD-5 EISDIR claim reproduced structurally: `tests/golden/adversarial/pii-audit.test.ts` does unfiltered `readdirSync(tests/adversarial)` → `readFileSync(every entry)` ×4 scan loops — a subdirectory throws EISDIR; top-level `tests/adversarial-storage/` is invisible to it and to the GH-31 runner. ✓
- `package.json`: version 0.8.2 ✓; `saxes` and `hast-util-to-mdast` absent from `package.json` and `bun.lock` ✓ (matches plan Phases 1/4 as new pins); TDR-0013's lockfile FACTs (`remark@15.0.1`, `remark-stringify@11.0.0`, `remark-gfm@4.0.1`, `mdast-util-to-markdown@2.1.2` locked) spot-checked present.
- CHANGELOG latest entry `0.7.0` vs `package.json` 0.8.2 — plan 6.2's lag note is accurate and honestly defers backfill to PM. ✓
- TDR-0013's decisive facts re-verified indirectly: `unordered-list.md` uses `- alpha` markers and `hr.md` uses `---` — while `mdast-util-to-markdown` defaults are `bullet: '*'` / `rule: '*'`. **The two-knob options layer is load-bearing, and it is absent from the plan** (see Finding 1).
- Snapshot/determinism posture matches `.ai/rules/testing-strategy.md` lines 64–71 (explicit `--update-snapshots` only, never CI; Bun pinned per release); A-4 is consistent with existing practice.
- `src/domain/render/canonicalize.ts`, `mdastToHast`, `renderStorage`, `PROVENANCE_PANEL_MARKER` all exist at the cited paths. ✓
- NFR-REL-4 (`doc/spec/nonfunctional.md:58`) is currently forward-only; the spec extends it reverse-direction and routes the doc note to phase 7 — consistent, not silent drift. ✓

## Cross-Artifact Consistency (facet: cross_artifact_consistency)

- Same AC IDs (AC-F1-1..AC-F6-1) across spec §17, test-plan §3.1, plan AC-coverage check — no orphan AC, no orphan TC (19/19 mapped to phases; all 36 plan tasks map to TC/spec IDs). ✓
- Fixture counts 33/34/35: self-documented and resolved — TDR-0012's "35" is nominal (33+2); the plan corrects to 34 parseable and says why; disk confirms 34. Not a finding. ✓
- PD-5 path convention: test plan v0.2 and plan 5.6 agree on `tests/adversarial-storage/` (no stale `tests/adversarial/storage/` references found). ✓
- Panel-strip (silent, DEC-6) vs mermaid render artifact (informational, DEC-1) classification is consistent across spec F-3, plan 3.4/4.4, TC-RT-006 (0 diagnostics) vs TC-RT-009 (exactly 1 informational). ✓
- **Plan ↔ TDR-0013: FAIL** (Finding 1) — the plan predates TDR-0013 and was never amended (unlike the test plan, which was amended for PD-5).
- TDR-0012 ↔ PM-DEC-3: stale wording (Finding 2, minor).

## Phase Sequencing Soundness (facets: plan_coverage, dod_defined)

Phase 1 (saxes pre-lock spike, go/no-go per TDR-0012 C-1..C-7, @xmldom/xmldom descent) → 2 (additive diagnostic model) → 3 (parser + strip/tolerance) → 4 (serializer + normalizer + DM-1) → 5 (harness + fixtures) → 6 (0.9.0 + structural checks) is correctly ordered, each phase a green commit with explicit code areas. RSK-P2 (task-list HAST shape) and RSK-P5 (strict entities) are surfaced with mitigations; the EISDIR fix is verified correct. DoD is derivable (all §17 ACs testable; AC-F6-1 includes existing tiers green). The only executability defect is the TDR-0013 non-incorporation (Finding 1), which breaks Phase 4 as written.

## Risk Blind-Spot Sweep (adversarial probe #5 — items checked and cleared)

- **Windows line endings**: non-issue — both comparison sides are derived in-process from the same fixture bytes; corpus verified LF; CI runs ubuntu with Bun pinned; snapshots committed from local runs on the same OS matrix as existing practice.
- **Table edge cases**: pipe escaping + alignment row named in RSK-P1 and probed in the 4.1 spike checklist (GFM table alignment path). Covered.
- **Fixed-point provability**: empirically pinned (TC-NORM-002 directly on reverse output — the RSK-1 tripwire), not claimed as a proof; honest posture.
- **Determinism across Bun versions**: A-4 + strategy snapshot rules (pin per release; explicit re-baseline); consistent.
- **`bulletOther` / bare-text-link corner forms**: identified in TDR-0013 Unresolved #1 — but not carried into the plan's 4.1 spike checklist (folded into Finding 1).

## Findings

1. [major] cross_artifact_consistency — chg-GH-92-plan.md "Binding inputs" / OQ-P1 / PD-3 / tasks 4.1–4.3 vs `doc/decisions/TDR-0013-reverse-markdown-serializer-substrate.md`
   Gap: The plan (v1.0, written before TDR-0013 landed) was never amended for the binding serializer decision that pm-notes says "resolves plan OQ-P1/PD-3" — `rg TDR-0013 chg-GH-92-plan.md` returns zero hits. Concretely: (a) the **options layer `{bullet: '-', rule: '-'}` appears nowhere in the plan** — task 4.2 as written (`canonicalize → hast-util-to-mdast → remark().use(remarkGfm).stringify`) emits remark defaults (`*` bullets, `*` rules), which violates normative Appendix B (`-` markers, `---` breaks; fixtures verified `- alpha` / `---` on disk) and fails task 4.6's own Appendix B spot-checks; the plan is therefore internally inconsistent as well as inconsistent with TDR-0013; (b) **fallback order contradicts TDR-0013**: plan 4.1's fallback is the full hand-written HAST→Markdown visitor (= TDR-0013 Alt 2, designated *last resort*), whereas TDR-0013's decision is descend to Alt 3 (hand HAST→MDAST mapping + the same locked stringifier/options) first — following the plan on a 4.1 spike failure would jump straight to the highest-risk path; (c) TDR-0013's spike corner-checks (`bulletOther`'s three trigger cases; `resourceLink: false` bare-text-link autolink) are missing from task 4.1's probe list; (d) OQ-P1 is presented as unresolved ("default pinned… if PM wants formality") when TDR-0013 has since resolved it, and TDR-0013 is absent from Binding inputs and the Artifacts table.
   Suggested remediation target phase: delivery_planning
   Suggested fix: plan v1.1 amendment (single edit, no spec/test-plan impact): add TDR-0013 to Binding inputs + Artifacts; close OQ-P1 as resolved-by-TDR-0013; pin the options layer `{bullet:'-', rule:'-'}` at the single load-bearing point in tasks 4.2/4.3 (citing TDR-0013 Implementation Plan #2–3: additional knobs require recording in the TDR, not fixture diffs); rewrite task 4.1's fallback to Alt-3-first → Alt-2-last-resort per TDR-0013; extend the 4.1 spike checklist with the two corner-form checks.

2. [minor] cross_artifact_consistency — doc/decisions/TDR-0012 §Implementation Plan #3
   Gap: TDR-0012 instructs "parser errors wrapped into the **existing MarkSyncError model's** parse-error arm", contradicting the later PM-DEC-3/PD-2 decision (standalone `ReverseError` union, expressly *not* MarkSyncError kinds, because the adding-a-kind rule would force `src/cli/` exit-code edits and violate AC-F6-1). The plan (Phase 3.3) is correct; the TDR text is stale — but the coder is directed to read TDR-0012 in Phases 1 and 3 and receives contradictory instruction from a binding-linked record.
   Suggested remediation target phase: delivery_planning
   Suggested fix: record precedence explicitly — a one-line cross-reference in pm-notes ("PM-DEC-3 supersedes TDR-0012 Impl. Plan #3's MarkSyncError wording") and/or a note in TDR-0012's revisit log when the record flips to Accepted at merge. No structural change; plan already implements the correct shape.

3. [minor] test_traceability — chg-GH-92-test-plan.md §6.2 / TC-RT-005 preconditions + chg-GH-92-plan.md task 5.1
   Gap: `raw-html-block-real` is listed in **both** `corpusB` [7] and `excluded` in the manifest design (both artifacts), with the exclusion from reverse iteration handled only prose-wise ("except raw-html-block-real" in TC-RT-002 step 1). Dual bucket membership leaves the manifest semantics ambiguous for the coder implementing task 5.3's loops (which bucket drives iteration; whether excluded-wins is a rule or a special case) and invites a harness that silently skips or double-processes the fixture.
   Suggested remediation target phase: test_planning
   Suggested fix: pin manifest semantics — either remove it from `corpusB` (corpusB = 6 with-Storage annotation fixtures; excluded = 1) or state the rule once ("`excluded` overrides partition membership for reverse assertions; `corpusB` membership is inventory accounting only") in §6.2 and task 5.1.

4. [nit] test_traceability — chg-GH-92-test-plan.md §4.3 / TC-RADV-001 (PD-5 side effect)
   Gap: relocating the adversarial set to top-level `tests/adversarial-storage/` (correctly, per the verified EISDIR defect) also places it permanently outside `pii-audit.test.ts`'s PII self-audit — the new 18-file set ships with no equivalent self-scan (deliberate for the bare-ID `JIRA-\d+` regex, but the PII loss is unexamined).
   Suggested remediation target phase: test_planning
   Suggested fix: have the new reverse-classification runner assert the same email/internal-URL PII patterns over `tests/adversarial-storage/` (skipping or scoping the bare-ID pattern, with a comment why); zero-cost addition to task 5.7.

5. [nit] plan_code_area_coverage — chg-GH-92-plan.md Constraints ("Forward-loader invisibility")
   Gap: loader files are cited by bare name — `pipeline-roundtrip.test.ts` (actually `tests/integration/markdown/`) and `assert-well-formed-xml.test.ts` (actually `tests/unit/_helpers/`); both verified to exist and behave as claimed, but the bare names send the coder scanning `tests/golden/markdown/` first.
   Suggested remediation target phase: delivery_planning
   Suggested fix: full paths when amending the plan for Finding 1.

## Override / Gate Decision

No override requested or needed — full DoR applied. **NOT_READY**: Finding 1 is a genuine cross-artifact contradiction on the delivery plan's highest-risk phase (Phase 4, RSK-P1/P2 territory), and as written task 4.2 produces Appendix-B-violating output. Reopen **delivery_planning** only; spec and test plan pass all facets (findings 3–4 are non-blocking polish that may ride along with the test plan's next touch but do not require a reopen on their own). Re-run this gate after the plan v1.1 amendment; expected outcome READY at iteration 2. No human input required (Pause: no) — TDR-0013 already records the human license-acceptance reservation at PR, which is the correct deferral point.
