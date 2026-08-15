---
# Copyright (c) 2025-2026 Juliusz Ćwiąkalski (https://www.cwiakalski.com | https://www.linkedin.com/in/juliusz-cwiakalski | https://www.x.com/cwiakalski)
# MIT License - see LICENSE file for full terms
ados_distribution: project-generated
id: TDR-0013
decision_type: tdr
status: Proposed
created: 2026-08-15
decision_date: null
last_updated: 2026-08-15
summary: "GH-92 canonical HAST→Markdown serializer substrate: hast-util-to-mdast (HAST→MDAST) + the locked remark/remark-gfm stringifier with a two-knob options layer (bullet '-', rule '-') — Appendix B's canonical form is then remark defaults by construction, shared byte-identically by the reverse serializer and the round-trip normalizer (spec DEC-3). Runner-up: hand-built MDAST + same stringifier (spike fallback). Full hand-written string builder rejected: it must re-derive remark's escaping/delimiter engine byte-for-byte by hand (RSK-P1)."
owners:
  - Juliusz Ćwiąkalski
service: marksync-cli
decision_area: markdown-pipeline
decision_scope: repo
reversibility: easy
review_date: null
business_impact: "Unblocks GH-92 Phase 4 (MS-0003 E1) and structurally mitigates the plan's highest delivery risk (RSK-P1 byte-form edge cases) by reusing the battle-tested stringifier instead of hand-rolling it."
customer_impact: "Indirect: reverse-converted Markdown is byte-stable and deterministic because serializer and normalizer share one implementation of the canonical form."
classification:
  domains: [architecture]
  archetype: selection
  environment: complicated
  rigor: R2
  reversibility: easy
  stakes: low
  urgency: medium
  uncertainty: low
  blast_radius: local
  recurrence: one-off
governance:
  driver: decision-advisor (AI)
  decider: Juliusz Ćwiąkalski
  contributors: [GH-92 delivery planning (PD-3/OQ-P1), GH-92 spec-writer (DEC-3/Appendix B)]
  reviewers: [Juliusz Ćwiąkalski]
  performers: [GH-92 coder]
  informed: [pm]
ai_assistance:
  used: true
  roles: [analyst, record-writer]
  external_data_shared: false
  citations_verified: false
  human_decider: Juliusz Ćwiąkalski
  reviewers: []
revisit_triggers:
  - "hast-util-to-mdast hits a security advisory, maintenance stall, or Bun/bun-build-compile incompatibility — descend to Alt 3 (hand HAST→MDAST mapping + same locked stringifier); the options layer and corpus locks survive the swap."
  - "The golden round-trip corpus exposes a hast-util-to-mdast mapping divergence that a small mapping pre-pass cannot fix (e.g. task-list checked-shape mismatch, RSK-P2) — descend to Alt 3 rather than full-hand (Alt 2)."
  - "Appendix B is amended (e.g. pinning bulletOther or bare-link autolink form) — the options layer is re-derived in this record's Implementation Plan step 3, not ad hoc."
links:
  related_changes: [GH-92]
  supersedes: []
  superseded_by: []
  spec: [doc/changes/2026-08/2026-08-15--GH-92--reverse-converter-storage-to-markdown/chg-GH-92-spec.md]
  contracts: []
  diagrams: []
  decisions: [TDR-0012, ADR-0001, ADR-0005, TDR-0006]
  experiments: []
  metrics: []
  roadmap_items: [MS-0003]
---

# TDR-0013: GH-92 canonical HAST→Markdown serializer substrate — hast-util-to-mdast + remark-gfm stringifier

## Context

This record resolves **OQ-P1** of the GH-92 implementation plan (chg-GH-92-plan.md) ahead of Phase 4: the substrate for the canonical HAST→Markdown serializer (PD-1 `src/domain/markdown/hast-to-markdown.ts`) and the round-trip normalizer that must share its definition. It is the delivery-symmetry companion to TDR-0012 (which selected the Storage→HAST parser front-end); smaller stakes, hence a compact record.

Situational facts:

- FACT: Spec DEC-3 defines ONE canonical Markdown emission form (spec Appendix B, normative) that the reverse serializer and the round-trip normalizer MUST share; the form is "byte-compatible with the repo's existing remark-based stringification defaults". RSK-1 calls the two disagreeing the top spec-level risk.
- FACT: The plan's PD-3 proposes `canonicalize(hast)` → `hast-util-to-mdast` → `remark().use(remarkGfm).stringify`; `normalizeMarkdown(md)` = the same pipeline downstream of the forward parse — serializer and normalizer then share **every stage downstream of MDAST**, making DEC-3 hold by construction. Task 4.1 gates it with a spike; the stated fallback is a hand-written Appendix B serializer (the plan's own "highest-risk path", RSK-P1).
- FACT (lockfile, read 2026-08-15): `remark@15.0.1`, `remark-stringify@11.0.0`, `remark-gfm@4.0.1`, `mdast-util-to-markdown@2.1.2`, `mdast-util-to-hast@13.2.1` (forward MDAST→HAST bridge) are locked. `hast-util-to-mdast` is **absent from `bun.lock` AND from `node_modules`** (not even a stale artifact — unlike the parse5 family TDR-0012 found). Adopting it is one genuinely new direct dependency.
- FACT (option surface, verified against the exact locked versions in `node_modules`): `remark-stringify` `Settings extends Options` from `mdast-util-to-markdown`, whose `Options` (lib/types.d.ts) includes `bullet` (default `'*'`), `rule` (default `'*'`), `emphasis` (`'*'`), `strong` (`'*'` → `**`), `fence` (`` ` ``), `fences` (`true`), `setext` (`false` → ATX), `bulletOrdered` (`'.'`), `incrementListMarker` (`true`), `listItemIndent` (`'one'` — bullet size + one space), `ruleRepetition` (`3`), `resourceLink` (`false`), `bulletOther` (derived: `'-'` when bullet is `'*'`, `'*'` otherwise).
- FACT (canonical-form mapping): Appendix B equals remark-gfm stringification defaults **plus exactly two knobs** — `bullet: '-'` and `rule: '-'`. Every other Appendix B clause is the default: `*`/`**`/`~~` emphasis markers, backtick fences (never tilde), ATX headings, `1.` dot form with increments, `- [ ]`/`- [x]` task items, `---` breaks, blank-line block separation, and nested indentation "2 spaces under `-`, 3 under `1.`" = `listItemIndent: 'one'` arithmetic. Fixture spot-checks agree (`ordered-list-nested.md`: `1. one` / `2. two` / 3-space nested `-` items; `strong.md`/`em.md`: `**`/`*`; `hr.md`: `---`; link fixtures use `[text](url)` with text ≠ url, so the default autolink path never fires on corpus A).
- FACT (task-list path): `mdast-util-gfm-task-list-item@2.0.0` (locked, via remark-gfm) stringifies `listItem.checked` (boolean, first child paragraph) as `[x] ` / `[ ] ` — verified in its locked source. The open half is HAST-side (RSK-P2, below).
- FACT: The forward converter's Storage renderer is a hand-written HAST visitor (`src/infra/confluence/render/storage.ts`) — no ecosystem HAST→Storage library exists; Markdown stringification is the mirror case where the ecosystem canonical tool is already the repo's forward parse authority (ADR-0005).

## Problem Framing (Clarified)

The surface question is "library or hand-written serializer?". The load-bearing question is: **what makes Appendix B mechanically binding rather than aspirational?** Appendix B's final clause anchors the whole form to "the repo's existing remark-based stringification defaults" — a hand-written serializer must then *reproduce* the locked stringifier's output byte-for-byte (escaping tables, delimiter-run logic, backtick-run sizing, nested-indent arithmetic, pipe escaping) without being that stringifier: re-deriving RSK-P1's exact edge-case burden by hand, twice over (any hand normalizer must call the same hand code to satisfy DEC-3, or the form splits). Using the actual locked stringifier makes the anchor definitional: Appendix B = defaults + two pinned knobs, one shared code path, zero re-derivation.

## Constraints (Hard Requirements)

### C-1: Single-definition sharing (DEC-3)

- **Statement:** The reverse serializer and the round-trip normalizer share ONE implementation of the canonical form — mechanically (same code path), not by duplicated conformance.
- **Source:** chg-GH-92-spec.md DEC-3, F-5, DM-3, RSK-1.
- **Verification:** Code review — `normalizeMarkdown` routes through the serializer (`hastToMarkdown`); TC-NORM-002 fixed-point tripwire.
- **Negotiable:** no.

### C-2: Appendix B byte-exact

- **Statement:** Output conforms to Appendix B on every clause (ATX, `-` bullets, `1.` ordered, `*`/`**`/`~~`, backtick fences, `- [ ]`/`- [x]`, `---`, single blank-line separation, 2/3-space nesting, standard remark-gfm escaping).
- **Source:** chg-GH-92-spec.md Appendix B (normative), DEC-3.
- **Verification:** TC-NORM-001 Appendix B spot-checks; corpus-A golden round-trip (AC-F1-1); idempotence `N(N(md)) === N(md)`.
- **Negotiable:** no.

### C-3: Determinism

- **Statement:** Same input → byte-identical Markdown, in-process and across runs; zero map-iteration/timestamp effects (NFR-2).
- **Source:** chg-GH-92-spec.md NFR-2, AC-F1-2.
- **Verification:** TC-RT-003/004.
- **Negotiable:** no.

### C-4: Domain-tier placement

- **Statement:** The serializer lives in the domain tier, importing only external libs and domain siblings (spec DEC-4; TDR-0006).
- **Source:** chg-GH-92-spec.md DEC-4; plan Constraints (depcruise).
- **Verification:** `bun run check:boundaries`.
- **Negotiable:** no.

### C-5: Bun + single-binary compatible

- **Statement:** Pure JS, no native modules, survives `bun build --compile` (ADR-0001).
- **Source:** ADR-0001; plan Constraints.
- **Verification:** CI (Bun 1.2.23) + binary release pipeline.
- **Negotiable:** no.

### C-6: Supply-chain clean; license recorded and accepted by the human decider

- **Statement:** Any new dependency passes NFR-SEC-4 scans (push vuln/license, release SBOM); license string recorded; compatibility acceptance is the human decider's at PR.
- **Source:** plan Constraints (NFR-SEC-4); TDR-0012 C-7 precedent.
- **Verification:** CI scans on the GH-92 branch once declared.
- **Negotiable:** no.

## Decision Drivers

1. **DEC-3 mechanical single-definition** (RSK-1): sharing the stringifier stage between serializer and normalizer is structural mitigation, not discipline.
2. **RSK-P1 byte-form edge-case correctness**: escaping/delimiter-run/backtick-run/indent behavior — battle-tested locked engine vs hand code newly exposed to exactly the ticket's hardest cases.
3. **Determinism** (NFR-2): a pure MDAST→string function with no ambient state.
4. **Supply-chain delta**: new direct dependency count and transitive additions.
5. **Task-list round-trip** (RSK-P2): `listItem.checked` must render `- [ ]`/`- [x]` through remark-gfm defaults.
6. **Maintenance symmetry** with the hand-written forward Storage visitor.

## Decision Rights (DACI)

- **Driver:** decision-advisor (AI). — **Decider/Approver:** Juliusz Ćwiąkalski (PR review; record flips Accepted at merge). — **Contributors:** GH-92 delivery planning (PD-3/OQ-P1), spec-writer (DEC-3/Appendix B). — **Required reviewers:** Juliusz Ćwiąkalski (incl. license acceptance, C-6). — **Performers:** GH-92 coder (Phase 4, task 4.1/4.2). — **Informed:** pm.

## Evidence, Assumptions & Unknowns

| Item | Label | Source | Impact if false | Confidence |
|------|-------|--------|-----------------|------------|
| Options surface + defaults verified at locked versions (bullet `*`, rule `*`, emphasis `*`, fence `` ` ``, fences, ATX, `bulletOrdered '.'`, `incrementListMarker`, `listItemIndent 'one'`, `resourceLink false`) | FACT | `node_modules/mdast-util-to-markdown@2.1.2/lib/types.d.ts`; `remark-stringify@11.0.0` Settings extends Options (read 2026-08-15) | Options layer mis-sized → C-2 spike failures | High |
| Appendix B = defaults + `{bullet:'-', rule:'-'}` exactly; fixtures corroborate | FACT | Spec Appendix B vs locked Options; fixture spot-checks (2026-08-15) | Additional knobs needed (spike catches) | High |
| `listItem.checked` → `[x]`/`[ ]` via locked remark-gfm stack | FACT | `mdast-util-gfm-task-list-item@2.0.0` source (locked) | Task-list round-trip fails → spike maps input shape | High |
| `bulletOther` auto-derives to `'*'` when `bullet:'-'`; fires only in 3 pathological cases (trailing empty item + rule-char bullet, thematic break as first child, adjacent unordered lists) | FACT (behavior) / TO-CONFIRM (corpus absence) | locked types.d.ts; corpus scan pending | Rare fixture emits `*` marker — Appendix B deviation (see Unresolved #1) | Medium |
| `hast-util-to-mdast`: MIT, unified/syntax-tree family, maintained, small pure-JS util deps, Bun-compatible, maps task-list HAST shape (RSK-P2) to `listItem.checked` | ASSUMPTION (research-directional — package absent locally; not re-verified externally) | unified ecosystem reputation; plan task 4.1 probes exactly this | Wrong on any count → descend to Alt 3 (runner-up) at spike | Medium |
| Transitive additions of `hast-util-to-mdast` are small unified-family utils | TO-CONFIRM | `bun.lock` diff at task 4.1 | Larger-than-expected dep delta → weigh vs Alt 3 at spike | Medium |

### Technical-Selection Evidence Pack (archetype: selection)

Researched via `@external-researcher`: **no** — local evidence only. The only candidate introducing a dependency is `hast-util-to-mdast`; the alternatives add none (hand code). Data minimization: public package identifier only.

| Signal | Label | Canonical source | As-of | Confidence |
|--------|-------|------------------|-------|------------|
| License (MIT recorded; acceptance = human decider, C-6) | TO-CONFIRM | github.com/syntax-tree/hast-util-to-mdast | 2026-08-15 (unverified) | Medium |
| Maintenance/activity | ASSUMPTION: active | repo history | TO-CONFIRM at 4.1 | Low |
| Runtime deps (expected small, unified-family) | TO-CONFIRM | package manifest at pin | at 4.1 | Medium |
| Security advisories | TO-CONFIRM | osv.dev via CI on declare | on branch | — |
| Integration fit (HAST→MDAST for the ADR-0005 subset; RSK-P2 shape) | ASSUMPTION | README + spike probe | 4.1 | Medium |
| Lock-in / migration cost | FACT: low — module-isolated, corpus-locked | plan PD-1/PD-3 | 2026-08-15 | High |

## Mental Models & Techniques Used

- **First Principles:** Appendix B is not an arbitrary style guide — it is *defined as* remark stringification output. Any substrate other than the locked stringifier must emulate it; emulation is re-implementation.
- **Inversion:** "How does each option corrupt bytes silently?" Hand builder: subtle escaping/delimiter/indent divergence — and if the normalizer shares it, both sides agree *wrongly* (RSK-1's worst case: AC passes against a weakened shared form). Library: mapping gaps are loud (round-trip mismatch), not normalized-away.
- **Opportunity Cost:** the new dependency buys the entire RSK-P1 surface (escaping engine, delimiter runs, backtick sizing, pipe escaping) as already-locked, already-CI-scanned code.
- **KISS:** two knobs and one shared pipeline beat one bespoke serializer plus a conformance test suite that re-encodes the same rules.

## Alternatives Considered

Legend: ✅ passes · ❌ fails · ⚠️ passes only via accepted-risk exception. All constraints non-negotiable.

|          | C-1 (shared def) | C-2 (Appendix B) | C-3 (determinism) | C-4 (tier) | C-5 (Bun) | C-6 (supply chain) |
|----------|------------------|-------------------|--------------------|------------|-----------|---------------------|
| Alt 0 — defer / no substrate | ❌ | ❌ | — | — | — | ✅ |
| Alt 1 — hast-util-to-mdast + remark-gfm stringifier (RECOMMENDED) | ✅ | ✅ (two-knob layer) | ✅ | ✅ | ✅ (pending spike) | ✅ (pending scans + license acceptance) |
| Alt 2 — hand-written HAST→Markdown string builder | ✅ (shares itself) | ⚠️ must re-derive remark defaults byte-for-byte | ✅ | ✅ | ✅ | ✅ (no new dep) |
| Alt 3 — hand-built MDAST + mdast-util-to-markdown (RUNNER-UP) | ✅ | ✅ (same stringifier/options) | ✅ | ✅ | ✅ | ✅ (no new dep) |

### Alternative 0 — Do nothing

Not eligible (fails C-1/C-2): GH-92 Phase 4 and the MS-0003 critical path have no serializer. Baseline only.

### Alternative 1 — hast-util-to-mdast + locked remark-gfm stringifier (RECOMMENDED)

Eligible pending routine completion (spike + scans + license acceptance). `canonicalize` → `hast-util-to-mdast` → `remark().use(remarkGfm).stringify` with `{bullet:'-', rule:'-'}`; the normalizer prepends only the forward parse + `mdastToHast`. DEC-3 holds by construction (one stringifier, one options object, shared by both callers — RSK-1 structurally closed); Appendix B is defaults-plus-two-knobs (FACT above); RSK-P1 collapses into already-locked code. Cons: one new direct dependency; HAST-side mapping behavior (task-list shape, RSK-P2) TO-CONFIRM at the 4.1 spike.

### Alternative 2 — Hand-written HAST→Markdown string builder (forward-visitor symmetry)

Eligible only via accepted-risk exception on C-2: it can *target* Appendix B but must reproduce the locked stringifier's escaping/delimiter/indent behavior byte-for-byte by hand — precisely the RSK-P1 edge-case burden, with every bug shared silently by the normalizer (single-definition makes wrongness consistent, not absent). No new dependency and full control are real but unpriced advantages; the corpus would eventually re-price them. Rejected as primary; retained as the plan's last-resort fallback if both Alt 1 and Alt 3 fail.

### Alternative 3 — Hand-built MDAST + mdast-util-to-markdown directly (RUNNER-UP)

Write the HAST→MDAST node mapping by hand; keep the locked stringifier + options layer for bytes. Keeps every C-2/C-3 advantage of Alt 1 (the byte-form engine stays library), drops the new dependency, and costs only the mapping layer — the moderate slice of Alt 2 without its hardest part. Dominated by Alt 1 on driver 4 (mapping code we maintain that `hast-util-to-mdast` provides) but strictly dominates Alt 2. **Designated spike fallback**: if task 4.1 fails on `hast-util-to-mdast` specifically (license/advisory/deps/Bun/mapping gap), descend here — the options layer, corpus locks, and normalizer sharing all survive.

## Decision

- **Decision:** **Alternative 1** — the canonical serializer substrate is `hast-util-to-mdast` + the locked remark/remark-gfm stringifier with a pinned options layer `{bullet: '-', rule: '-'}`; the normalizer routes through the identical pipeline (PD-3 as planned). Alt 3 is the designated fallback on a 4.1-spike failure; Alt 2 only if both library paths fail.
- **Rationale (tied to drivers):** Appendix B anchors the canonical form to remark stringification output (FACT) — only the actual locked stringifier makes that definitional (driver 1 closed structurally); the RSK-P1 engine arrives as already-locked, already-scanned code (driver 2); determinism is a pure function property of the locked stack (driver 3); the supply-chain delta is one small unified-family dependency, spike- and scan-gated (driver 4, C-6). The forward asymmetry argument fails because the situations are not mirrors: Storage has no ecosystem stringifier (hand-writing was *forced* forward), while the ecosystem's Markdown authority is already this repo's forward parse engine — symmetry lives in the architecture (visitor, tiering, construct mirror, harness), not the substrate. The harness makes both directions fail loudly together regardless (spec RSK-6 mechanism).
- **Decider:** Juliusz Ćwiąkalski (pending — `Proposed` until GH-92 PR merge, jointly with license acceptance per C-6).
- **Conditions for revisit:** see `revisit_triggers` (advisory/stall/incompatibility; unfixable mapping divergence; Appendix B amendment).

### Constraint Compliance Attestation

Alt 1 satisfies all constraints: **C-1 ✅** one stringifier + one options object shared by serializer and normalizer (review + TC-NORM-002). **C-2 ✅** Appendix B = defaults + two verified knobs; spot-checked spot clauses verified at locked versions; corpus-enforced. **C-3 ✅** pure function, no ambient state. **C-4 ✅** domain module importing only external libs + domain siblings. **C-5 ✅** pending routine confirmation (pure-JS expectation; 4.1 spike + CI). **C-6 ✅** pending routine completion (NFR-SEC-4 scans on declare; MIT string to be recorded at pin; **acceptance expressly reserved to the human decider**). No accepted-risk exceptions.

> **AI-assistance disclosure:** option-surface and task-list facts verified locally against the **exact locked versions** in `node_modules`; `hast-util-to-mdast` signals are research-directional and unverified (`citations_verified: false`) — plan task 4.1 closes them before the pin is final. `status: Proposed` until human sign-off at merge.

## Trade-offs & Consequences

### Positive Outcomes

- DEC-3's single-definition requirement holds by construction; RSK-1 (serializer/normalizer divergence) and RSK-P1 (byte-form edge cases) both close structurally rather than by discipline.
- The canonical form is pinned by two option values instead of a bespoke serializer + conformance suite.
- Swappable: the substrate hides behind one domain function; corpus + harness locks survive any swap (revisit triggers).

### Negative Outcomes

- One new direct dependency (`hast-util-to-mdast`) with its transitive additions — bounded and scan-gated, but real (TDR-0012 already added saxes; this is the second GH-92 dependency).
- Substrate asymmetry with the hand-written forward Storage visitor — accepted and argued above; the mental-model cost is contained by the shared-harness guarantee.
- Two corner-form deltas from pure defaults (`bulletOther` derivation; bare-text-link autolink under `resourceLink: false`) — corpus A currently triggers neither (link fixtures verified), but they are latent Appendix B questions (Unresolved #1).

### Unresolved Questions

- [ ] Spike-check corner forms (owner: GH-92 coder; gate: task 4.1): (a) confirm no corpus-A/Storage-remap input reaches the three `bulletOther` trigger cases — else pin `bulletOther` or amend Appendix B; (b) confirm bare-text links (`text === url`) cannot arise from the reverse mapper — else set `resourceLink: true` or amend Appendix B.
- [ ] Record `hast-util-to-mdast` resolved version, license string, and transitive-dep delta from the `bun.lock` diff in the plan Execution Log (owner: GH-92 coder; gate: dependency pin).

## Implementation Plan

1. Task 4.1 as planned (spike gate): pin `hast-util-to-mdast` exact; probe under Bun the exact shapes Phase 4 emits — GFM tables with alignment, task-list HAST shape (RSK-P2: `ul.contains-task-list` → `li.task-list-item` → leading `input[checked]` → `listItem.checked`), fenced code with language, nested strong/em/del, inline-code backtick runs, links/images.
2. Task 4.2 as planned: `hastToMarkdown` = `canonicalize` → `hast-util-to-mdast` → `remark().use(remarkGfm).stringify` — with the **options layer `{bullet: '-', rule: '-'}` pinned at the single load-bearing point** (file header cites spec Appendix B once, per code style).
3. Derive the options layer ONLY from this record + Appendix B; any additional knob (e.g. `bulletOther`, `resourceLink`) requires recording it here (revisit trigger 3), not discovering it in fixture diffs.
4. Normalizer (task 4.3) routes through `hastToMarkdown` — no separate stringification path may exist (C-1).
5. Fallback order on spike failure: Alt 3 (hand MDAST mapping + same stringifier/options) → Alt 2 (full hand, last resort — record the gap and risk acceptance in the plan Execution Log).

## Verification Criteria

- **Metric: corpus-A round-trip byte fidelity** — Target: 26/26, 0 mismatches vs `normalize(md)` — Window: GH-92 Phase 5 (AC-F1-1/NFR-1).
- **Metric: normalizer idempotence + reverse fixed point** — Target: 100% corpus A — Window: GH-92 Phase 4/5 (AC-F5-1; TC-NORM-001/002 — the RSK-1 tripwire).
- **Metric: determinism** — Target: byte-identical convert-twice and cross-run — Window: GH-92 (AC-F1-2/NFR-2).
- **Metric: supply chain** — Target: scans clean with the dependency declared; transitive delta recorded — Window: GH-92 branch onward (NFR-SEC-4).
- **Metric: task-list round-trip** — Target: `- [ ]`/`- [x]` byte-exact on the task-list + kitchensink fixtures — Window: GH-92 (RSK-P2; TC-RT-001).

## Confidence Rating

**High** on the ranking's substance: the decisive facts (Appendix B = defaults + two knobs; stringifier/task-list behavior) are verified against the exact locked versions locally — version-independent, since the stringifier is already the repo's forward-stack authority. **Medium** on the candidate package's own signals (license, maintenance, transitive delta, Bun fit) — unverified externally and closed by the already-mandated 4.1 spike, with a strictly-dominating fallback (Alt 3) that preserves every byte-form advantage. No ranking position depends on an unverified signal.

## References

- chg-GH-92-spec.md §15 DEC-3, Appendix B (normative canonical form), F-5, RSK-1 — `doc/changes/2026-08/2026-08-15--GH-92--reverse-converter-storage-to-markdown/`
- chg-GH-92-plan.md PD-3, OQ-P1, RSK-P1/P2, tasks 4.1–4.3 (same directory)
- TDR-0012 (parser substrate precedent, supply-chain posture, numbering context) — `doc/decisions/TDR-0012-reverse-storage-xml-parser-saxes.md`
- ADR-0005 (canonical GFM subset), ADR-0001 (Bun/single-binary), TDR-0006 (tier boundaries)
- Verified locally (exact locked versions): `node_modules/mdast-util-to-markdown@2.1.2/lib/types.d.ts` (Options), `node_modules/remark-stringify@11.0.0` (Settings extends Options), `node_modules/mdast-util-gfm-task-list-item@2.0.0/lib/index.js` (checked → `[x]`/`[ ]`); `bun.lock` (hast-util-to-mdast absent); fixture corpus spot-checks
- External (research-directional, re-verify at pin): github.com/syntax-tree/hast-util-to-mdast
