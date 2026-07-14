// Unit tests for provenance formatter, panel builder, and classifier
// (TC-PROV-001/003/008/009/010 / ADR-0010 privacy).

import { describe, expect, test } from "bun:test";
import {
	buildProvenancePanel,
	classifyVersion,
	formatVersionMessage,
	formatVersionMessageWithMeta,
	MAX_VERSION_MESSAGE_LEN,
	PROVENANCE_PANEL_MARKER,
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
		const body = out.slice("marksync git abcdef0123456789 (50): ".length, -1);
		const kept = body.split("; ");
		for (const s of kept) expect(longSubjects).toContain(s);
	});

	test("the limit is a single named constant", () => {
		expect(MAX_VERSION_MESSAGE_LEN).toBeGreaterThan(0);
		expect(Number.isInteger(MAX_VERSION_MESSAGE_LEN)).toBe(true);
	});
});

describe("formatVersionMessageWithMeta — trimMarker", () => {
	test("returns empty trimMarker when no truncation", () => {
		const { trimMarker } = formatVersionMessageWithMeta({
			headCommit: "abc1234",
			commitCount: 2,
			subjects: ["feat: a", "fix: b"],
		});
		expect(trimMarker).toBe("");
	});

	test("returns +N more when subjects are dropped", () => {
		const longSubjects = Array.from(
			{ length: 50 },
			(_, i) => `subject number ${i}`,
		);
		const { trimMarker } = formatVersionMessageWithMeta({
			headCommit: "abcdef0123456789",
			commitCount: 50,
			subjects: longSubjects,
		});
		expect(trimMarker).toMatch(/^\+\d+ more$/);
		expect(trimMarker).not.toBe("");
	});
});

describe("TC-PROV-001 — buildProvenancePanel", () => {
	const sampleMeta = {
		sourcePath: "docs/guide/api.md",
		sourceBranch: "main",
		headCommit: "a1b2c3d",
		synchronizedAt: "2026-07-14T12:34:56Z",
	};

	test("returns valid Storage XHTML info macro", () => {
		const panel = buildProvenancePanel(sampleMeta);
		expect(panel).toContain('<ac:structured-macro ac:name="info">');
		expect(panel).toContain("<ac:rich-text-body>");
		expect(panel).toContain("</ac:rich-text-body></ac:structured-macro>");
	});

	test("includes all four fields", () => {
		const panel = buildProvenancePanel(sampleMeta);
		expect(panel).toContain("docs/guide/api.md");
		expect(panel).toContain("a1b2c3d");
		expect(panel).toContain("(main)");
		expect(panel).toContain("2026-07-14T12:34:56Z");
	});

	test("omits schema-version and macro-id attributes", () => {
		const panel = buildProvenancePanel(sampleMeta);
		expect(panel).not.toContain("ac:schema-version");
		expect(panel).not.toContain("ac:macro-id");
	});

	test("contains a stable marker comment for identification", () => {
		const panel = buildProvenancePanel(sampleMeta);
		expect(panel).toContain(`<!-- ${PROVENANCE_PANEL_MARKER} -->`);
	});
});

describe("TC-PROV-010 — buildProvenancePanel edge cases", () => {
	test("empty sourcePath renders empty field", () => {
		const panel = buildProvenancePanel({
			sourcePath: "",
			sourceBranch: "main",
			headCommit: "abc123",
			synchronizedAt: "2026-07-14T00:00:00Z",
		});
		expect(panel).toContain("<strong>Source:</strong> </p>");
	});

	test("preserves uppercase branch name", () => {
		const panel = buildProvenancePanel({
			sourcePath: "doc.md",
			sourceBranch: "MAIN",
			headCommit: "abc",
			synchronizedAt: "2026-07-14T00:00:00Z",
		});
		expect(panel).toContain("(MAIN)");
	});

	test("XML-escapes special characters in sourcePath", () => {
		const panel = buildProvenancePanel({
			sourcePath: 'docs/<evil>"&test".md',
			sourceBranch: "main",
			headCommit: "abc",
			synchronizedAt: "2026-07-14T00:00:00Z",
		});
		expect(panel).not.toContain("<evil>");
		expect(panel).toContain("&lt;evil&gt;");
		expect(panel).toContain("&amp;");
		expect(panel).toContain("&quot;");
	});

	test("renders unicode paths without escaping issues", () => {
		const panel = buildProvenancePanel({
			sourcePath: "docs/path/with spaces/测试.md",
			sourceBranch: "main",
			headCommit: "abc",
			synchronizedAt: "2026-07-14T00:00:00Z",
		});
		expect(panel).toContain("docs/path/with spaces/测试.md");
	});
});

describe("TC-PROV-008 — classifyVersion returns marksync", () => {
	test("matches standard marksync git prefix", () => {
		expect(
			classifyVersion({
				message: "marksync git abc1234 (2): feat: add panel; fix: typo",
			}),
		).toBe("marksync");
	});

	test("matches without count", () => {
		expect(
			classifyVersion({ message: "marksync git abc123 source=test.md" }),
		).toBe("marksync");
	});

	test("matches with long subject list", () => {
		expect(
			classifyVersion({
				message:
					"marksync git def5678 (5): feat: A; fix: B; docs: C; refactor: D; chore: E",
			}),
		).toBe("marksync");
	});

	test("matches header-only (no subjects)", () => {
		expect(classifyVersion({ message: "marksync git deadbeef" })).toBe(
			"marksync",
		);
	});
});

describe("TC-PROV-009 — classifyVersion returns direct", () => {
	test("non-MarkSync message", () => {
		expect(classifyVersion({ message: "Edited via Confluence UI" })).toBe(
			"direct",
		);
	});

	test("empty message", () => {
		expect(classifyVersion({ message: "" })).toBe("direct");
	});

	test("undefined message", () => {
		expect(classifyVersion({})).toBe("direct");
	});

	test("case sensitivity — MarkSync git is not marksync git", () => {
		expect(classifyVersion({ message: "MarkSync git abc123" })).toBe("direct");
	});

	test("hyphen variant — marksync-git is not marksync git", () => {
		expect(classifyVersion({ message: "marksync-git abc123" })).toBe("direct");
	});

	test("colon variant — marksync: is not marksync git", () => {
		expect(classifyVersion({ message: "marksync:abc123" })).toBe("direct");
	});

	test("leading whitespace — must start with prefix", () => {
		expect(classifyVersion({ message: " marksync git abc123" })).toBe("direct");
	});
});

describe("TC-PROV-003 — property schema privacy (ADR-0010)", () => {
	test("formatVersionMessageWithMeta output never contains a subjects array", () => {
		const { message, trimMarker } = formatVersionMessageWithMeta({
			headCommit: "abc123",
			commitCount: 3,
			subjects: ["secret-ticket-123", "customer-name-leak", "incident-456"],
		});
		// The message may contain subjects (per ADR-0010 C-2), but the
		// trimMarker is always a count-based string, never the subjects.
		expect(trimMarker).not.toContain("secret");
		expect(trimMarker).not.toContain("customer");
		expect(trimMarker).not.toContain("incident");
		// trimMarker is either empty or "+N more"
		expect(trimMarker === "" || /^\+\d+ more$/.test(trimMarker)).toBe(true);
		// message starts with the prefix (proves it's version.message, not property)
		expect(message.startsWith("marksync git")).toBe(true);
	});
});
