---
change:
  ref: GH-74
  type: fix
  status: Proposed
  slug: init-existing-config-uuid-warnings
  title: "Fix init with existing config and UUID-less file warnings"
  owners: ["Juliusz Ćwiąkalski"]
  service: marksync-cli
  labels: [bug, cli, identity, sync]
  version_impact: patch
  audience: mixed
  security_impact: none
  risk_level: low
  dependencies:
    internal: [CLI initialization, document identity, safe publish planning]
    external: []
---

# CHANGE SPECIFICATION

> **PURPOSE**: Ensure initialization preserves an existing configuration while assigning document identities, and make committed documents without identity visible to sync operators.

## 1. SUMMARY

This focused bug fix makes `marksync init` continue UUID assignment when a configuration already exists, without changing that file. It also makes planning warn, once per affected committed discovered document, when a document lacks a `marksync:uuid` identity and is therefore excluded from plan entries.

## 2. CONTEXT

### 2.1 Current State Snapshot

The CLI specification describes initialization as creating a starter configuration and then assigning UUID v7 identities to discovered managed documents. Current behavior treats an existing configuration as a refusal to overwrite and stops before identity assignment. The safe-publish planning flow already exposes plan warnings, but UUID-less documents are currently omitted without a warning.

### 2.2 Pain Points / Gaps

- An existing `marksync.yml` prevents `marksync init` from assigning UUIDs to newly discovered files.
- Operators cannot distinguish a UUID-less committed discovered file from a file that was intentionally not included in a plan.
- Silent omission undermines the source-side immutable identity model established by ADR-0006.

## 3. PROBLEM STATEMENT

Because initialization aborts its identity-assignment work when configuration already exists and planning silently excludes committed discovered UUID-less files, users cannot reliably prepare documents for synchronization or identify why documents are absent from a plan, resulting in incomplete and non-transparent publishing preparation.

## 4. GOALS

- **G-1**: Preserve an existing configuration while allowing initialization to assign missing document identities.
- **G-2**: Retain initialization behavior for repositories without a configuration.
- **G-3**: Surface every committed discovered UUID-less document as an actionable plan warning while excluding it from plan entries.
- **G-4**: Preserve the fatal duplicate-UUID safeguard before render or write activity.

### 4.1 Success Metrics / KPIs

| Metric | Target |
|---|---|
| Existing-configuration initialization | 100% of tested runs retain the existing configuration and assign UUIDs to eligible identity-less documents |
| Missing-configuration initialization | 100% of tested runs create the starter configuration and assign UUIDs to eligible identity-less documents |
| UUID-less document visibility | 100% of committed discovered documents lacking `marksync:uuid` produce exactly one warning with the specified text |

### 4.2 Non-Goals

- **NG-1**: Assign UUIDs automatically during planning or synchronization.
- **NG-2**: Change the configuration content when an existing `marksync.yml` is present.
- **NG-3**: Change duplicate-UUID handling.

## 5. FUNCTIONAL CAPABILITIES

| ID | Capability | Rationale |
|---|---|---|
| F-1 | Initialization continues to assign missing UUIDs when `marksync.yml` already exists, leaving that configuration untouched. | An existing configuration must not block preparation of new documents for the identity model. |
| F-2 | Initialization creates the starter configuration and assigns missing UUIDs when `marksync.yml` is absent. | Existing first-time initialization behavior must remain available. |
| F-3 | Planning excludes each committed discovered document without `marksync:uuid` from entries and emits one exact, actionable warning for it. | Operators need clear visibility into documents that cannot participate in identity-based synchronization. |
| F-4 | Duplicate UUIDs remain fatal before render or write activity. | ADR-0006 requires durable, unambiguous document identity as a safety control. |

### 5.1 Capability Details

**F-1 — Existing configuration initialization.** An existing `marksync.yml` is preserved. Its presence means configuration creation is skipped, not that UUID assignment is aborted. Eligible discovered documents that lack identity receive UUID assignment through initialization.

**F-2 — First-time initialization.** If `marksync.yml` is absent, initialization retains the existing sequence of creating the starter configuration and assigning UUIDs to eligible discovered documents.

**F-3 — UUID-less plan warning.** For every committed discovered document that lacks `marksync:uuid`, planning does not create a plan entry and adds exactly one warning using this exact message, with `{path}` replaced by the document path:

`{path}: no marksync:uuid — run 'marksync init' to assign identity, then commit and re-sync`

**F-4 — Identity integrity.** The new handling does not relax the existing duplicate-UUID fatal gate; duplicates remain an error before render or write activity.

## 6. USER & SYSTEM FLOWS

```text
Existing configuration:
User runs init → existing configuration remains untouched → eligible identity-less documents receive UUIDs

Missing configuration:
User runs init → starter configuration is created → eligible identity-less documents receive UUIDs

Planning UUID-less documents:
Plan discovers committed document without UUID → document is omitted from entries → one actionable warning is included in the plan
```

## 7. SCOPE & BOUNDARIES

### 7.1 In Scope

- Continue UUID assignment during initialization when configuration already exists.
- Preserve first-time configuration creation and UUID assignment.
- Emit the specified per-file plan warning for committed discovered UUID-less documents.
- Preserve exclusion of UUID-less documents from plan entries and the duplicate-UUID fatal safeguard.

### 7.2 Out of Scope

- [OUT] Automatic UUID assignment during planning or synchronization.
- [OUT] Changes to the content of an existing configuration.
- [OUT] Changes to configuration schema, lock state, or remote synchronization behavior for identified documents.

### 7.3 Deferred / Maybe-Later

- No deferred scope identified for this focused fix.

## 8. INTERFACES & INTEGRATION CONTRACTS

### 8.1 REST / HTTP Endpoints

Not applicable. This change does not alter HTTP contracts.

### 8.2 Events / Messages

| ID | Message | Contract |
|---|---|---|
| EVT-1 | UUID-less document plan warning | For each committed discovered document lacking `marksync:uuid`, the Plan warning text is exactly `{path}: no marksync:uuid — run 'marksync init' to assign identity, then commit and re-sync`. |

### 8.3 Data Model Impact

| ID | Element | Description |
|---|---|---|
| DM-1 | `marksync:uuid` document identity | No schema change. Documents without this existing source-side identity are excluded from plan entries and reported by EVT-1. |

### 8.4 External Integrations

Not applicable. No external integration contract changes.

### 8.5 Backward Compatibility

Existing configuration files remain untouched. Repositories without configuration retain current initialization behavior. Identified documents retain existing planning behavior; previously silent UUID-less exclusions become visible warnings without automatic identity mutation.

## 9. NON-FUNCTIONAL REQUIREMENTS (NFRs)

| ID | Requirement | Threshold |
|---|---|---|
| NFR-1 | Existing configuration preservation | 100% of initialization runs with an existing `marksync.yml` leave that file unchanged. |
| NFR-2 | Warning completeness and uniqueness | 100% of committed discovered UUID-less documents produce exactly one EVT-1 warning per plan. |
| NFR-3 | Warning text stability | 100% of EVT-1 warnings match the specified text exactly, apart from `{path}` substitution. |

## 10. TELEMETRY & OBSERVABILITY REQUIREMENTS

Plan warnings are the operator-visible diagnostic for this change. EVT-1 must be included in the existing Plan warning aggregation, allowing users and automated consumers to identify each excluded UUID-less document.

## 11. RISKS & MITIGATIONS

| ID | Risk | Impact | Probability | Mitigation | Residual Risk |
|---|---|---|---|---|---|
| RSK-1 | Existing configuration could still prevent UUID assignment. | M | L | Verify F-1 with an existing configuration and identity-less discovered files. | L |
| RSK-2 | UUID-less documents could remain invisible or receive duplicate warnings. | M | L | Verify one exact EVT-1 warning and no plan entry per affected document. | L |
| RSK-3 | The fix could weaken duplicate-UUID safety. | H | L | Retain and verify F-4. | L |

## 12. ASSUMPTIONS

- `marksync:uuid` remains the authoritative source-side document identity under ADR-0006.
- Plan warnings and their aggregation are available to carry EVT-1 without a new output contract.
- “Committed discovered” has its existing planning meaning.

## 13. DEPENDENCIES

| Direction | Item | Notes |
|---|---|---|
| Depends on | CLI initialization behavior | Provides configuration handling and UUID assignment. |
| Depends on | Safe-publish planning | Discovers committed documents and exposes Plan warnings and entries. |
| Depends on | ADR-0006 identity model | Defines UUID identity authority and duplicate-UUID fatality. |
| Blocks | Reliable sync preparation | Documents must be initialized and committed before they can be synchronized. |

## 14. OPEN QUESTIONS

No open questions identified from the planning context.

## 15. DECISION LOG

| ID | Decision | Rationale | Date |
|---|---|---|---|
| DEC-1 | Existing configuration is skipped for creation but does not terminate UUID assignment. | Preserves user configuration while meeting the required initialization outcome. | 2026-07-14 |
| DEC-2 | UUID-less committed discovered documents remain excluded from plan entries and receive one exact warning each. | Makes identity gaps actionable without introducing automatic mutation during sync. | 2026-07-14 |
| DEC-3 | Duplicate UUIDs remain fatal before render or write activity. | Preserves ADR-0006 identity safety. | 2026-07-14 |

## 16. AFFECTED COMPONENTS (HIGH-LEVEL)

| Component | Impact |
|---|---|
| CLI initialization | Updated behavior for existing versus absent configuration. |
| Document identity service | UUID assignment is reached when configuration already exists. |
| Safe-publish planning | UUID-less committed discovered documents generate warnings and no entries. |
| Plan output | Existing warning aggregation exposes EVT-1. |

## 17. ACCEPTANCE CRITERIA

| ID | Criterion | Linked |
|---|---|---|
| AC-F-1-1 | **Given** an existing `marksync.yml` and a newly discovered eligible document without `marksync:uuid`, **when** the user runs `marksync init`, **then** the configuration remains untouched and the document receives a UUID. *(Ticket AC-1)* | F-1, NFR-1 |
| AC-F-2-1 | **Given** no `marksync.yml` and a newly discovered eligible document without `marksync:uuid`, **when** the user runs `marksync init`, **then** a starter configuration is created and the document receives a UUID. *(Ticket AC-2)* | F-2 |
| AC-F-3-1 | **Given** one or more committed discovered documents without `marksync:uuid`, **when** a plan is computed, **then** each such document has no plan entry and produces exactly one warning with the EVT-1 text and its path substituted. *(Ticket AC-3)* | F-3, EVT-1, DM-1, NFR-2, NFR-3 |
| AC-F-4-1 | **Given** discovered documents with duplicate UUIDs, **when** a plan is computed, **then** planning fails before render or write activity. | F-4 |
| AC-F-1-2 | **Given** the existing test suite and tests covering F-1, F-2, and F-3, **when** the change is verified, **then** all existing tests pass and the new coverage demonstrates both fixes. *(Ticket AC-4)* | F-1, F-2, F-3 |

## 18. ROLLOUT & CHANGE MANAGEMENT (HIGH-LEVEL)

No special rollout is required. Users with existing UUID-less documents run `marksync init`, commit the resulting identity assignments, and then re-sync; planning warns until that preparation is complete.

## 19. DATA MIGRATION / SEEDING (IF APPLICABLE)

No data migration or seeding is required. UUID assignment remains an explicit initialization action, not a sync-time migration.

## 20. PRIVACY / COMPLIANCE REVIEW

No privacy or compliance impact identified. The warning contains only a document path and prescribed remediation text.

## 21. SECURITY REVIEW HIGHLIGHTS

No new security impact identified. The change preserves ADR-0006’s duplicate-identity fatal safeguard and does not introduce new credentials, external calls, or permission changes.

## 22. MAINTENANCE & OPERATIONS IMPACT

Operators gain an actionable plan diagnostic for identity-less committed documents. Existing configuration is protected during initialization, reducing manual intervention needed before synchronization.

## 23. GLOSSARY

| Term | Definition |
|---|---|
| Document identity | The immutable source-side UUID v7 stored as `marksync:uuid`. |
| UUID-less document | A committed discovered document that lacks `marksync:uuid`. |
| Plan warning | A diagnostic included in the computed Plan without creating a plan entry. |
| Starter configuration | The configuration created by initialization when `marksync.yml` is absent. |

## 24. APPENDICES

### A. Authoritative References

- CLI feature specification: initialization behavior and configuration overwrite protection.
- Safe-publish feature specification: planning, Plan warnings, and duplicate-UUID safety.
- ADR-0006: immutable source-side UUID identity and fatal duplicate detection.

## 25. DOCUMENT HISTORY

| Version | Date | Author | Changes |
|---|---|---|
| 1.0 | 2026-07-14 | Juliusz Ćwiąkalski | Initial specification for GH-74. |

---

## AUTHORING GUIDELINES

This specification is limited to the GH-74 ticket requirements and supplied planning context. It uses the repository change-spec template and records no implementation tasks or source-level instructions. Current-truth documentation is referenced as context and is not modified by this change.

## VALIDATION CHECKLIST

- [x] `change.ref` matches `GH-74`.
- [x] `owners` has at least one entry.
- [x] `status` is `Proposed`.
- [x] All required sections are present in the required order.
- [x] ID prefixes are consistent and unique within each category.
- [x] Acceptance criteria use Given/When/Then and link to requirement IDs.
- [x] NFRs include measurable thresholds.
- [x] Risks include impact, probability, mitigation, and residual risk.
- [x] No implementation details, file-level paths, or step-by-step tasks are included.
