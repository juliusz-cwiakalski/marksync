# Code Review — GH-20 (Iteration 1)

- **Date:** 2026-07-09
- **Reviewer:** @reviewer (local mode)
- **workItemRef:** GH-20 — [MS2-E3-S3] Markdown pipeline
- **Base:** `main` · **Head:** `feat/GH-20/markdown-pipeline`
- **Status:** **PASS**
- **Findings:** 3 issues (0 BLOCKER / 0 MAJOR / 3 MINOR / 0 NIT)
- **Severity breakdown:** 0 critical · 0 major · 3 minor · 0 nit
- **Plan status:** ALL_TASKS_DONE (phases 0-8 checked; execution log complete)
- **Plan gaps:** none (no OPEN_TASKS, no DONE_BUT_UNCHECKED, no CHECKED_BUT_MISSING)
- **Gate:** `bun run check` = 692 pass / 0 fail; dep-cruiser clean (59 modules, 78 deps)
- **Next step:** PROCEED to quality gates (phase 9)

## Key themes

The implementation is faithful to the spec and plan across all 7 capabilities and 8
ACs. Contracts are honoured exactly: `src/domain/errors.ts` and `src/domain/result.ts`
are **unchanged** on this branch, the pre-existing `UnsupportedConstruct` arm is
**reused** (not redefined), and `assertNeverMarkSyncError` is untouched (DEC-2 ✓).
Both PM decisions are implemented as specified:

- **PM-DEC-1 (sub/sup):** the visitor emits `<sub>`/`<sup>` defensively
  (`storage.ts` lines 95-98) but no golden Markdown fixture claims them; coverage is a
  hand-constructed-node unit test (`storage-defensive.test.ts`). ✓
- **PM-DEC-2 (ParseError):** `parseMarkdown` keeps the `Result<MdastRoot, MarkSyncError>`
  signature for port-contract alignment but is total in practice — no try/catch, always
  returns `Result.ok`; a genuine `processor.parse()` throw propagates as an invariant
  violation and is **never** mapped to `UnsupportedConstruct`. ✓

The spike-H6 mapping is implemented verbatim (headings, strong/em, del, code, links,
remote + attachment images, nested lists, task-lists, blockquote, code macro w/ CDATA,
hr, tables) with the three converter rules enforced (CDATA code bodies; omitted
`ac:schema-version`/`ac:macro-id`; task-list as its own block). Tier purity holds: the
four domain modules import nothing outside `#domain/*` + type-only packages +
`node:crypto`; only `src/infra/confluence/render/storage.ts` adds the one-way
infra→domain edge (5 `#domain/*` imports), and dep-cruiser's load-bearing
`domain-may-not-import-infra` rule passes. Security (NFR-SEC-5), determinism, and hash
determinism are all strongly evidenced with real parser/bridge/renderer (no mocks —
TDR-0004 guardrail respected).

## AC evidence assessment

| AC | Verdict | Evidence strength |
|----|---------|-------------------|
| AC-F4-1 (25/25 byte-match) | PASS | Strong — 25 fixtures byte-exact + snapshot layer; set count locked at 25. |
| AC-F4-2 (CDATA + 0× schema/macro-id) | PASS | Strong — regex + `not.toContain` across all 25 bodies. |
| AC-F4-3 (well-formed XML) | PASS | Strong — PD-4 checker + 11-test negative suite (independence) + 25 fixtures. |
| AC-F5-1 (no silent drop) | PASS | Adequate — unsupported nodes are hand-constructed (unavoidable: remark-gfm cannot produce footnote/math/dl). Classifier is provably generic (allow-list). |
| AC-F4-4 (injection-safe) | PASS | Strong — TC-INJECT-001..003 + TC-RAWHTML-001. |
| AC-F4-5 (determinism) | PASS | Strong — 3 renders × 25 fixtures byte-identical. |
| AC-F3-1 (hash determinism) | PASS | Strong — TC-HASH-001..004 + pinned digest + TC-DETERM-002. |
| AC-Q-1 (gate + boundaries) | PASS | Strong (gate); boundary enforcement has a documented matrix gap (no infra→app/cli rule) — out of scope per plan Finding 6; load-bearing domain→infra direction IS enforced. |

## Findings (non-blocking)

All three are MINOR polish items. None gate quality gates; the PM may address them
opportunistically via the boy-scout rule on next touch or a trivial cleanup commit.

1. **MINOR** `src/infra/confluence/render/storage.ts:8` — duplicate import from
   `#domain/render/canonicalize` (type + value on two lines); combine into one statement
   with inline `type` modifier.
2. **MINOR** `src/infra/confluence/render/storage.ts:1` — file header is 5 comment lines,
   exceeding the ≤ 3-line cap (AGENTS.md / typescript.md).
3. **MINOR** `package.json:53` — `rehype` is a direct runtime dependency (spec/NFR-11
   mandate) but is never imported in `src/`; the bridge uses `unified`+`remark-rehype`.
   Reconcile (drop + doc-sync, or note why it is a direct dep).

Full structured findings: `findings-iter-1.json`.

## Remediation

No remediation phase appended — verdict is PASS with only MINOR polish findings. The
PM may proceed to quality gates (phase 9). The three MINOR items can be folded into a
trivial `style(render)` cleanup commit or deferred to the boy-scout rule.
