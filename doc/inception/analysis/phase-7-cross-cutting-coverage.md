# Phase 7 — Cross-cutting Backlog Coverage Verification

> Verify that every cross-cutting concern from
> `doc/inception/analysis/backlog-reconciliation.md` has representation in the
> initial feature specs or explicit backlog tickets.

## Coverage matrix

| Concern | Backlog-reconciliation source | Feature spec representation | Status |
|---|---|---|---|
| Zero silent overwrite | North star guardrail; R-VAL-4 | feature-safe-publish: INV-SAFE-1, drift classification, unsafe overwrite blocked | ✅ Covered |
| Drift detection 100% | Roadmap metric; R-FEA-7/R-FEA-8 | feature-safe-publish: drift classification AC, 5 states | ✅ Covered |
| Conflict false-positive <5% | Roadmap metric | feature-safe-publish: KPI | ✅ Covered |
| Semantic idempotency | Roadmap metric; R-FEA-8 | feature-safe-publish: AC "second unchanged push writes 0" | ✅ Covered |
| Secret redaction | R-SEC-1 | feature-cli: INV-SEC-1; feature-safe-publish: INV-SEC-1 | ✅ Covered |
| Visible provenance | Persona 5; roadmap | feature-safe-publish: provenance capability (panel/footer + metadata) | ✅ Covered |
| Observability / diagnostics | North star guardrail | feature-cli: `CommandResult<T>` structured output | ✅ Covered |
| Performance / scale budget | A-FEA-10 | NFRs (NFR-PERF-*); referenced in all feature specs | ✅ Covered (NFR) |
| Accessibility / plain logs | North star / NFR-A11Y-* | feature-cli: NFR-A11Y-1 (color auto-detect, NO_COLOR) | ✅ Covered |
| Mermaid determinism | ADR-0002; R-FEA-1 | feature-mermaid-rendering: determinism AC | ✅ Covered |
| Mermaid security | ADR-0002; NFR-SEC-5 | feature-mermaid-rendering: securityLevel strict, SVG sanitization, adversarial fixtures | ✅ Covered |
| Concurrency control | R-FEA-7; ADR-0006 C-6 | feature-safe-publish: INV-SAFE-3, decentralized 409 + dedup | ✅ Covered |
| Duplicate UUID fatal | Premortem §5.2 | feature-safe-publish: INV-SAFE-2 | ✅ Covered |
| Adapter isolation | R-FEA-6; architecture | feature-confluence-adapter: dependency-cruiser boundary, no leak AC | ✅ Covered |

## Deferred concerns (not MS-0002)

| Concern | Deferred to | Status |
|---|---|---|
| OSS sustainability / maintainer load | MS-0008 governance | Triggered before public launch |
| Trademark risk | MS-0008 legal | Triggered before public launch |
| Migration (existing corpus adoption) | MS-0003 | Triggered by MS-0002 beta feedback |
| OAuth 3LO | Post-MS-0002 | Later browser-based feature |

## Conclusion

**All 14 cross-cutting concerns for MS-0002 have explicit representation** in the
4 initial feature specs as acceptance criteria, capabilities, or NFR references.
No concern is "folded invisibly into a slice." The deferred concerns have
documented trigger conditions tied to milestones.
