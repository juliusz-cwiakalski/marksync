# Contributing BDD scenario for INV-SAFE-3 (duplicate-UUID fatal before any write).
# Authored in GH-18 (MS2-E3-S1); step definitions are wired in E5-S1 (GH-29) where
# they drive the REAL sync engine (plan → apply). The fixture + detector-level
# assertion originate here (TC-BDD-001, TC-DUP-001).

Feature: Duplicate UUID halts the sync with zero writes
  Invariant: INV-SAFE-3 (ADR-0006 C-4) — two source documents sharing the same
  marksync.uuid must abort the entire plan before any Confluence write.

  Scenario: Two docs share a marksync.uuid
    Given a corpus with two documents sharing the same marksync.uuid
    When a sync is run
    Then detectDuplicateUuids returns err(DuplicateUuid) naming both source paths
    And zero pages are written to Confluence
