// tests/unit/cli/output/redact.test.ts
//
// Unit tests for the centralized redaction layer (GH-16 D-4 / F-4 / AC-1 /
// INV-SEC-1 / DEC-4 / RSK-1). Per-pattern assertions cover each documented
// secret shape on BOTH the serialized JSON string and the human string. Two
// load-bearing corner cases are pinned:
//
//   - TC-RED-006 (RSK-1 / AC-F4-2): a 40-char hex Git SHA is NOT redacted.
//   - TC-RED-007 (DEC-4): a token nested in `data` (only exposed after
//     JSON.stringify) IS redacted — proves redaction runs on the serialized
//     string, not the typed object.
//
// Over-mocking guardrail: these tests grep the REDACTED OUTPUT for the raw
// token substring (never a mock call) — INV-SEC-1 is asserted on real output.

import { describe, expect, test } from "bun:test";
import {
	createRedactor,
	DEFAULT_PATTERNS,
	DEFAULT_REDACTOR,
	type RedactionPattern,
	Redactor,
	redactJson,
	redactString,
} from "../../../../src/cli/output/redact.ts";

// --- synthetic fixtures (clearly fake; never a live credential) ------------

const BEARER_JWT = "eyJhbGciOiJIUzI1NiJ9.example.payload.sig";
const BEARER_OPAQUE = "abcdef0123456789ABCDEFghijklmnop";
const GHO = "gho_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"; // 36 chars after prefix
const GHP = "ghp_BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB";
const GHS = "ghs_CCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCC";
const GHU = "ghu_DDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDD";
const GHR = "ghr_EEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEE";
const ATATT = "ATATT3xFfGF0ABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890xyz";
const ATSTS = "ATSTS3xFfGF0ABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890xyz";
const ENV_VALUE = "abcdefghijklmnopqrstuvwxyz1234567890abcd"; // 40 chars, > 20
const EMAIL = "alice.secret@example.com";
// A legitimate 40-char lowercase hex Git SHA (RSK-1 / R1 guard fixture).
const GIT_SHA = "a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0";

describe("redactString — per-pattern secret shapes (AC-1 / INV-SEC-1)", () => {
	test("TC-RED-001: `Authorization: Bearer <tok>` redacted on JSON + human", () => {
		const json = JSON.stringify({
			header: `Authorization: Bearer ${BEARER_JWT}`,
		});
		const redactedJson = redactString(json);
		expect(redactedJson).not.toContain(BEARER_JWT);
		expect(redactedJson).toContain("[REDACTED:");

		const human = `sending Authorization: Bearer ${BEARER_JWT} now`;
		const redactedHuman = redactString(human);
		expect(redactedHuman).not.toContain(BEARER_JWT);
		expect(redactedHuman).toContain("[REDACTED:");
	});

	test("TC-RED-001b: `Authorization: Basic <tok>` redacted", () => {
		const s = `Authorization: Basic ${BEARER_OPAQUE}`;
		expect(redactString(s)).not.toContain(BEARER_OPAQUE);
	});

	test("standalone `Bearer <tok>` (no Authorization prefix) redacted", () => {
		const s = `token=Bearer ${BEARER_OPAQUE}`;
		const out = redactString(s);
		expect(out).not.toContain(BEARER_OPAQUE);
		expect(out).toContain("[REDACTED:bearer]");
	});

	test("TC-RED-002: GitHub tokens gho_/ghp_/ghs_/ghu_/ghr_ redacted", () => {
		for (const tok of [GHO, GHP, GHS, GHU, GHR]) {
			const out = redactString(`pushed with ${tok} on main`);
			expect(out).not.toContain(tok);
			expect(out).toContain("[REDACTED:github-token]");
		}
	});

	test("TC-RED-003: Atlassian tokens ATATT…/ATSTS… redacted", () => {
		for (const tok of [ATATT, ATSTS]) {
			const out = redactString(`confluence_token=${tok}`);
			expect(out).not.toContain(tok);
			expect(out).toContain("[REDACTED:atlassian-token]");
		}
	});

	test("TC-RED-004: email-shaped value redacted (full email)", () => {
		const json = JSON.stringify({ author: EMAIL });
		expect(redactString(json)).not.toContain(EMAIL);
		const human = `contact owner at ${EMAIL} please`;
		const out = redactString(human);
		expect(out).not.toContain(EMAIL);
		expect(out).not.toContain("alice.secret");
		expect(out).toContain("[REDACTED:email]");
	});

	test("TC-RED-005: `MARKSYNC_*_TOKEN` value >20 chars redacted (env-style)", () => {
		const line = `MARKSYNC_API_TOKEN=${ENV_VALUE}`;
		const out = redactString(line);
		expect(out).not.toContain(ENV_VALUE);
		expect(out).toContain("[REDACTED:env-token]");
	});

	test("TC-RED-005b: value with exactly 20 chars (length NOT > 20) is left alone", () => {
		// Story R1: only values STRICTLY longer than 20 chars are scrubbed, so a
		// short dummy/test value is not over-redacted.
		const short = "01234567890123456789"; // exactly 20 chars
		expect(short).toHaveLength(20);
		const line = `MARKSYNC_API_TOKEN=${short}`;
		expect(redactString(line)).toContain(short);
	});

	test("TC-RED-005c: env-token redacted with `:` separator and inside a JSON string", () => {
		// JSON-stringified: the assignment lives inside a string value; structural
		// quotes around the value must survive unmodified.
		const serialized = JSON.stringify({
			dump: `MARKSYNC_CONFLUENCE_TOKEN:${ENV_VALUE}`,
		});
		const out = redactString(serialized);
		expect(out).not.toContain(ENV_VALUE);
		// JSON still parseable (no structural quote consumed).
		expect(() => JSON.parse(out)).not.toThrow();
	});

	test("TC-RED-009: multiple distinct secrets in one output all redacted", () => {
		const blob = `headers: Authorization: Bearer ${BEARER_JWT}; gh=${GHO}; at=${ATATT}; mail=${EMAIL}`;
		const out = redactString(blob);
		expect(out).not.toContain(BEARER_JWT);
		expect(out).not.toContain(GHO);
		expect(out).not.toContain(ATATT);
		expect(out).not.toContain(EMAIL);
	});

	test("string interpolation `error at gho_xxx` redacted", () => {
		const out = redactString(`error at ${GHO} (see logs)`);
		expect(out).not.toContain(GHO);
		expect(out).toContain("[REDACTED:github-token]");
	});
});

describe("TC-RED-006 — 40-char hex Git SHA is NOT redacted (RSK-1 / AC-F4-2)", () => {
	test("bare lowercase hex sha survives unmodified", () => {
		expect(GIT_SHA).toMatch(/^[0-9a-f]{40}$/);
		const out = redactString(`commit ${GIT_SHA} on main`);
		expect(out).toContain(GIT_SHA);
		expect(out).toBe(`commit ${GIT_SHA} on main`);
	});

	test("uppercase hex sha survives (hex-only class never matches)", () => {
		const upper = "A1B2C3D4E5F6A7B8C9D0E1F2A3B4C5D6E7F8A9B0";
		expect(upper).toMatch(/^[0-9A-F]{40}$/);
		expect(redactString(`merge ${upper}`)).toContain(upper);
	});

	test("sha co-existing with a real secret: secret redacted, sha survives", () => {
		const out = redactString(`commit ${GIT_SHA} auth=Bearer ${BEARER_OPAQUE}`);
		expect(out).toContain(GIT_SHA);
		expect(out).not.toContain(BEARER_OPAQUE);
	});
});

describe("TC-RED-007 — token nested in data redacted after serialization (DEC-4)", () => {
	test("gho_ nested in data.pageBody is caught on the serialized string", () => {
		// The token only appears as a substring AFTER JSON.stringify. Redacting the
		// typed object would miss it; redacting the serialized string catches it.
		const result = { data: { pageBody: `see ${GHO} embedded here` } };
		const serialized = JSON.stringify(result);
		expect(serialized).toContain(GHO); // present pre-redaction
		expect(redactString(serialized)).not.toContain(GHO);
	});

	test("ATATT nested two levels deep is caught (DEC-4 depth-independence)", () => {
		const result = {
			data: { remote: { headers: { auth: `Bearer ${BEARER_JWT}` } } },
			meta: { token: ATATT },
		};
		const serialized = JSON.stringify(result);
		const out = redactString(serialized);
		expect(out).not.toContain(BEARER_JWT);
		expect(out).not.toContain(ATATT);
		// And the JSON remains structurally valid (no quote damage).
		expect(() => JSON.parse(out)).not.toThrow();
	});

	test("human string with a nested token is caught (DEC-4 covers human path too)", () => {
		const human = `synced page; owner token ${GHO} leaked in body`;
		expect(redactString(human)).not.toContain(GHO);
	});
});

describe("redactJson — DEC-4 serialize-then-redact (AC-1 / INV-SEC-1)", () => {
	test("returns the serialized + redacted JSON text (a string); clean value stays valid JSON", () => {
		const out = redactJson({
			schemaVersion: 1,
			runId: "r",
			exitCode: 0,
			data: { ok: true },
		});
		expect(typeof out).toBe("string");
		// no secret present → output is still parseable JSON
		const parsed = JSON.parse(out) as { data: { ok: boolean } };
		expect(parsed.data.ok).toBe(true);
	});

	test("TC-RED-007 via redactJson: token nested in data caught AFTER serialization", () => {
		// The token lives inside data.pageBody and only surfaces as a substring
		// AFTER JSON.stringify. redactJson serializes FIRST, then redacts the
		// string (DEC-4) — so the nested token is caught. This is the load-bearing
		// DEC-4 case: it proves redaction runs on the serialized output, not the
		// typed object.
		const result = { data: { pageBody: `see ${GHO} embedded here` } };
		expect(JSON.stringify(result)).toContain(GHO); // present pre-redaction
		const out = redactJson(result);
		expect(out).not.toContain(GHO);
		expect(out).toContain("[REDACTED:github-token]");
	});

	test("a redacted JSON string value stays valid JSON (sentinel lives inside the quotes)", () => {
		const out = redactJson({ token: GHO });
		const parsed = JSON.parse(out) as { token: string };
		expect(parsed.token).toBe("[REDACTED:github-token]");
	});

	test("redactJson catches a deeply-nested token (DEC-4 depth-independence)", () => {
		const result = {
			data: { remote: { headers: { auth: `Bearer ${BEARER_OPAQUE}` } } },
			meta: { token: ATATT },
		};
		const out = redactJson(result);
		expect(out).not.toContain(BEARER_OPAQUE);
		expect(out).not.toContain(ATATT);
		// and the JSON stays structurally valid (no quote damage)
		expect(() => JSON.parse(out)).not.toThrow();
	});

	test("redactJson never throws — circular reference falls back to String()", () => {
		const circular: Record<string, unknown> = {};
		circular.self = circular;
		expect(() => redactJson(circular)).not.toThrow();
		expect(typeof redactJson(circular)).toBe("string");
	});

	test("DEFAULT_REDACTOR.redactJson matches the module-level redactJson", () => {
		const value = { a: GHO, b: ATATT };
		expect(DEFAULT_REDACTOR.redactJson(value)).toBe(redactJson(value));
	});
});

describe("Redactor — configurability + defaults", () => {
	test("DEFAULT_PATTERNS covers all six documented kinds", () => {
		const kinds = DEFAULT_PATTERNS.map((p) => p.kind);
		expect(kinds).toEqual(
			expect.arrayContaining([
				"authorization",
				"bearer",
				"github-token",
				"atlassian-token",
				"env-token",
				"email",
			]),
		);
	});

	test("every default pattern carries the global flag", () => {
		for (const { pattern } of DEFAULT_PATTERNS) {
			expect(pattern.global).toBe(true);
		}
	});

	test("DEFAULT_REDACTOR.redactString matches the module-level redactString", () => {
		const s = `Authorization: Bearer ${BEARER_JWT} ${GHO}`;
		expect(DEFAULT_REDACTOR.redactString(s)).toBe(redactString(s));
	});

	test("createRedactor with a custom pattern scrubs only that shape", () => {
		const custom: RedactionPattern = {
			kind: "email",
			pattern: /\balice\.secret@example\.com\b/g,
		};
		const r = createRedactor([custom]);
		const out = r.redactString(`mail ${EMAIL} gh=${GHO}`);
		expect(out).not.toContain(EMAIL); // custom pattern hit
		// Built-in github pattern is NOT in this custom redactor → gho_ survives.
		expect(out).toContain(GHO);
	});

	test("an empty/custom redactor with no patterns is a no-op", () => {
		const r = new Redactor([]);
		const s = `Bearer ${BEARER_OPAQUE} ${GHO}`;
		expect(r.redactString(s)).toBe(s);
	});

	test("a Redactor instance is safe to reuse across calls (no lastIndex leak)", () => {
		const r = new Redactor();
		const a = r.redactString(`Bearer ${BEARER_OPAQUE}`);
		const b = r.redactString(`Bearer ${BEARER_OPAQUE}`);
		expect(a).toBe(b);
		expect(a).not.toContain(BEARER_OPAQUE);
	});

	test("redacting an empty string / clean string is a no-op", () => {
		expect(redactString("")).toBe("");
		expect(redactString("nothing to redact here")).toBe(
			"nothing to redact here",
		);
	});
});
