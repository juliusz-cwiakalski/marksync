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
	const corpusDir = `tests/e2e-mock/fixtures/corpus/${scenario}`;

	// Read all .md files in the corpus directory using glob
	const glob = new Bun.Glob(`**/*.md`);
	for await (const path of glob.scan(corpusDir)) {
		const filename = path.split("/").pop()!;
		const fullPath = `${corpusDir}/${path}`;
		const content = await Bun.file(fullPath).text();
		corpus.set(filename, content);
	}

	return corpus;
}