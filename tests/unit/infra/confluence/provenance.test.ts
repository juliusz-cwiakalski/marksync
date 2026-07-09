// Unit tests for the provenance formatter (F-8 / TC-PROV-001): deterministic
// MarkSync/Git prefix + head commit + compact subject summary, trimmed to
// MAX_VERSION_MESSAGE_LEN (PD-6).

import { describe, expect, test } from "bun:test";
import {
	formatVersionMessage,
	MAX_VERSION_MESSAGE_LEN,
} from "#infra/confluence/provenance";

describe("TC-PROV-001 — formatVersionMessage", () => {
	test("produces the marksync git prefix + head + count + subjects", () => {
		const out = formatVersionMessage({
			headCommit: "abc1234",
			commitCount: 2,
			subjects: ["feat: add thing", "fix: edge case"],
		});
		expect(out).toBe(
			"marksync git abc1234 (2): feat: add thing; fix: edge case",
		);
	});

	test("without subjects — header only", () => {
		expect(formatVersionMessage({ headCommit: "abc1234" })).toBe(
			"marksync git abc1234",
		);
	});

	test("deterministic — same input → same output", () => {
		const input = {
			headCommit: "deadbeef",
			commitCount: 3,
			subjects: ["a", "b", "c"],
		};
		expect(formatVersionMessage(input)).toBe(formatVersionMessage(input));
	});

	test("payload exceeding the limit is trimmed without truncating mid-token", () => {
		const longSubjects = Array.from(
			{ length: 50 },
			(_, i) => `subject number ${i}`,
		);
		const out = formatVersionMessage({
			headCommit: "abcdef0123456789",
			commitCount: 50,
			subjects: longSubjects,
		});
		expect(out.length).toBeLessThanOrEqual(MAX_VERSION_MESSAGE_LEN);
		expect(out.endsWith("…")).toBe(true);
		// Kept subjects are a whole contiguous prefix — no subject is sliced
		// mid-word. Split the body back out and confirm each is a complete entry.
		const body = out.slice("marksync git abcdef0123456789 (50): ".length, -1);
		const kept = body.split("; ");
		for (const s of kept) expect(longSubjects).toContain(s);
	});

	test("the limit is a single named constant", () => {
		expect(MAX_VERSION_MESSAGE_LEN).toBeGreaterThan(0);
		expect(Number.isInteger(MAX_VERSION_MESSAGE_LEN)).toBe(true);
	});
});
