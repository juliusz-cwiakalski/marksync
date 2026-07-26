// PII self-audit — verify no PII in corpus (GH-31)
// TC-ADVERSARIAL-008 (AC-F5-1 / NFR-SEC-1 / INV-SEC-1).

import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, expect, test } from "bun:test";

const here = dirname(new URL(import.meta.url).pathname);
const adversarialDir = join(here, "..", "..", "adversarial");

describe("TC-ADVERSARIAL-008 (AC-F5-1 / NFR-SEC-1 / INV-SEC-1) — PII self-audit clean", () => {
	test("email pattern returns 0 matches across all artifacts", () => {
		const files = readdirSync(adversarialDir);
		let emailMatches = 0;
		const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/;

		for (const file of files) {
			const content = readFileSync(join(adversarialDir, file), "utf8");
			const matches = content.match(emailRegex);
			if (matches) {
				emailMatches += matches.length;
				console.warn(`Email pattern found in ${file}: ${matches.join(", ")}`);
			}
		}

		expect(emailMatches).toBe(0);
	});

	test("internal-ticket URL pattern returns 0 matches across all artifacts", () => {
		const files = readdirSync(adversarialDir);
		let ticketUrlMatches = 0;
		const ticketUrlRegex =
			/https?:\/\/[^\s/]+\/(?:browse|projects)\/(?:[A-Z][A-Z0-9_]+-)\d+/;

		for (const file of files) {
			const content = readFileSync(join(adversarialDir, file), "utf8");
			const matches = content.match(ticketUrlRegex);
			if (matches) {
				ticketUrlMatches += matches.length;
				console.warn(
					`Internal-ticket URL found in ${file}: ${matches.join(", ")}`,
				);
			}
		}

		expect(ticketUrlMatches).toBe(0);
	});

	test("bare internal-issue-ref pattern returns 0 matches across all artifacts", () => {
		const files = readdirSync(adversarialDir);
		let bareIdMatches = 0;
		const bareIdRegex = /(?:MS|GH|INT|TICKET|JIRA)[-_]\d{3,}/gi;

		for (const file of files) {
			const content = readFileSync(join(adversarialDir, file), "utf8");
			const matches = content.match(bareIdRegex);
			if (matches) {
				bareIdMatches += matches.length;
				console.warn(
					`Bare internal-issue-ref found in ${file}: ${matches.join(", ")}`,
				);
			}
		}

		expect(bareIdMatches).toBe(0);
	});

	test("total PII patterns return 0 matches", () => {
		const files = readdirSync(adversarialDir);
		let totalMatches = 0;
		const patterns = {
			email: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/,
			ticketUrl:
				/https?:\/\/[^\s/]+\/(?:browse|projects)\/(?:[A-Z][A-Z0-9_]+-)\d+/,
			bareId: /(?:MS|GH|INT|TICKET|JIRA)[-_]\d{3,}/gi,
		};

		for (const file of files) {
			const content = readFileSync(join(adversarialDir, file), "utf8");
			for (const [patternName, regex] of Object.entries(patterns)) {
				const matches = content.match(regex);
				if (matches) {
					totalMatches += matches.length;
					console.warn(
						`${patternName} found in ${file}: ${matches.join(", ")}`,
					);
				}
			}
		}

		expect(totalMatches).toBe(0);
	});
});
