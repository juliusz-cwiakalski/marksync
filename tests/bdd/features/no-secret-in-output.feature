# INV-SEC-1: No secrets in any output path.
# Invariant: INV-SEC-1 — secrets in document content must not leak into
# plan, journal, lock, diagnostics, version.message, or cache.

Feature: No secrets in output paths
  Invariant: INV-SEC-1 — secrets planted in document content must not appear in
  any output path (plan, apply journal, lock, diagnostics, version.message, cache).

  Scenario: Sentinel secret in document content does not leak to outputs
    Given a corpus with one managed document containing a secret sentinel in body content
    When computePlan + applyPlan run
    Then the sentinel does not appear in the plan JSON
    And the sentinel does not appear in the apply journal
    And the sentinel does not appear in the lock file
    And the sentinel does not appear in diagnostic messages
    And the sentinel does not appear in version.message
    And the sentinel does not appear in the cache