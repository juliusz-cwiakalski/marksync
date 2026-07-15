// Test helpers for e2e-mock scenarios. Mirrors the pattern from
// tests/integration/confluence/confluence-target.test.ts.

import type { ConfluenceCredentials } from "#domain/credentials";
import { ConfluenceTarget } from "#infra/confluence/target";

const TOKEN = "ATATT3xFfGF0SECRET_TOKEN_VALUE_x9";
const EMAIL = "juliusz@cwiakalski.com";
const AUTH_HEADER = `Basic ${Buffer.from(`${EMAIL}:${TOKEN}`).toString("base64")}`;
const SPACE_ID = "123";

/**
 * Build ConfluenceCredentials for a mock origin.
 * Mirrors the creds() helper from integration tests.
 */
export function creds(baseUrl: string): ConfluenceCredentials {
	return {
		baseUrl,
		authHeader: AUTH_HEADER,
		email: "j***@cwiakalski.com",
		mode: "api-token",
	};
}

/**
 * Build a ConfluenceTarget against an origin with an instant-delay seam.
 * Mirrors targetFor() from integration tests.
 */
export function targetFor(origin: string, logs?: string[]): ConfluenceTarget {
	return ConfluenceTarget.fromCredentials(creds(origin), SPACE_ID, {
		delay: () => Promise.resolve(),
		log: (msg) => {
			logs?.push(msg);
		},
	});
}

/**
 * Load corpus fixtures from tests/e2e-mock/fixtures/corpus/{scenario}/.
 * Returns a map of filename → content.
 */
export async function loadCorpus(scenario: string): Promise<Map<string, string>> {
	const corpus = new Map<string, string>();
	const _corpusDir = `tests/e2e-mock/fixtures/corpus/${scenario}`;

	// For simplicity, we'll use Bun's file system API
	// In a real scenario, this would read from the filesystem
	// For now, we'll return an empty map and populate scenarios directly

	return corpus;
}