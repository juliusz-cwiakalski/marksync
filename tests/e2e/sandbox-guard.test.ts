// Live-sandbox guard test (TC-E2E-001, AC-F3-1, NFR-CI-3).

import { describe, expect, test } from "bun:test";
import { requiredSecretsPresent } from "./helpers";

describe("E2E sandbox guard", () => {
	test("TC-E2E-001: skip without secrets (exit 0)", () => {
		// Given: no MARKSYNC_E2E_* secrets are set (this is the default in CI/local runs)
		// When: requiredSecretsPresent() is called
		// Then: it returns false, and we skip the E2E test (exit 0)

		// In practice, this function is called in sandbox-smoke.test.ts
		// This test validates the guard logic itself is correct

		// Simulate secrets-absent environment (all vars unset/empty)
		const originalEnv = { ...process.env };
		try {
			// Clear all E2E vars
			delete process.env.MARKSYNC_E2E_CONFLUENCE_BASE_URL;
			delete process.env.MARKSYNC_E2E_USER_EMAIL;
			delete process.env.MARKSYNC_E2E_API_TOKEN;
			delete process.env.MARKSYNC_E2E_SPACE_KEY;
			delete process.env.MARKSYNC_E2E_PARENT_PAGE_ID;

			// Assert guard returns false (secrets not present)
			expect(requiredSecretsPresent()).toBe(false);

			// This would cause sandbox-smoke.test.ts to skip (exit 0)
			// The skip message is logged by the actual test, not here
		} finally {
			// Restore original environment
			process.env = originalEnv;
		}
	});

	test("TC-E2E-001: all-or-nothing guard (partial secrets = false)", () => {
		// Verify that partial credential sets do NOT pass the guard (RSK-6)
		const originalEnv = { ...process.env };
		try {
			// Set only 2 of 5 required secrets
			process.env.MARKSYNC_E2E_CONFLUENCE_BASE_URL = "https://example.com";
			process.env.MARKSYNC_E2E_USER_EMAIL = "test@example.com";

			// Assert guard returns false (partial = not enough)
			expect(requiredSecretsPresent()).toBe(false);
		} finally {
			// Restore original environment
			process.env = originalEnv;
		}
	});
});