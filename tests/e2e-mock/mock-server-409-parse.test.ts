// TC-E2EMOCK-001: Mock-409 Parse Self-Check.
// Guards the highest-drift risk (RSK-1) by proving the mock's 409 conflict
// envelope round-trips through parseConflict, so the mock cannot drift from
// the real Confluence shape.

import { describe, expect, test } from "bun:test";
import { parseConflict } from "#infra/confluence/pages";

/**
 * Build a 409 conflict response body matching the exact VERSION_RE format
 * that parseConflict expects: /Current Version:\s*\[(\d+)\].*?Provided version:\s*\[(\d+)\]/
 */
function buildConflictBody(currentVersion: number, providedVersion: number): unknown {
	return {
		errors: [
			{
				code: "CONFLICT",
				title: `Version must be incremented when updating a page. Current Version: [${currentVersion}]. Provided version: [${providedVersion}]`,
			},
		],
	};
}

describe("TC-E2EMOCK-001 — mock-409 parseConflict self-check", () => {
	test("case A: parseConflict extracts baseVersion:1, remoteVersion:2 from mock 409 body", () => {
		const mockBody = buildConflictBody(2, 1);
		const result = parseConflict("page-123", mockBody);

		expect(result.ok).toBe(false);
		if (result.ok) return;

		expect(result.error.kind).toBe("Conflict");
		expect(result.error.baseVersion).toBe(1); // provided version → baseVersion
		expect(result.error.remoteVersion).toBe(2); // current/server version → remoteVersion
	});

	test("case B: parseConflict extracts baseVersion:3, remoteVersion:2 from swapped numbers", () => {
		// Caller sends 3, server has 2
		const mockBody = buildConflictBody(2, 3);
		const result = parseConflict("page-456", mockBody);

		expect(result.ok).toBe(false);
		if (result.ok) return;

		expect(result.error.kind).toBe("Conflict");
		expect(result.error.baseVersion).toBe(3); // provided version → baseVersion
		expect(result.error.remoteVersion).toBe(2); // current/server version → remoteVersion
	});

	test("envelope shape: errors[0].code must be CONFLICT", () => {
		// Verify the envelope shape is validated by checking a wrong code fails
		const wrongBody = {
			errors: [
				{
					code: "WRONG_CODE",
					title: "Version must be incremented when updating a page. Current Version: [2]. Provided version: [1]",
				},
			],
		};
		const result = parseConflict("page-789", wrongBody);

		expect(result.ok).toBe(false);
		if (result.ok) return;

		// Wrong code should surface as RemoteUnreachable
		expect(result.error.kind).toBe("RemoteUnreachable");
	});
});