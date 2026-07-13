// tests/unit/domain/state/classifier.test.ts
//
// Unit tests for classify() three-way drift classifier (GH-22).
// Pure fixtures — no mocks.

import { describe, expect, test } from "bun:test";
import { classify, type ClassifyInput } from "#domain/state/classifier";
import { buildContentHash, canonicalHash } from "#domain/state/hashes";
import {
	SyncStateSchema,
	type SharedBase,
	type RemoteState,
} from "#domain/state/sync-state";
import type { Root, Element } from "hast";

const UUID = "0192b3d4-5e6f-7000-8000-00000000000a" as const;

/** Test fixtures. */
function mockSharedBase(overrides?: Partial<SharedBase>): SharedBase {
	return {
		uuid: UUID,
		pageId: "12345",
		parentPageId: "98765",
		pageVersion: 5,
		renderedBodyHash: "",
		attachmentHashes: { "img.png": "sha256:img" },
		...overrides,
	};
}

function mockRemote(overrides?: Partial<RemoteState>): RemoteState {
	return {
		kind: "present",
		bodyHash: "",
		version: 5,
		title: "Test Title",
		parentPageId: "98765",
		...overrides,
	};
}

/** HAST builder helpers. */
function text(value: string): Element {
	return {
		type: "element",
		tagName: "p",
		properties: {},
		children: [{ type: "text", value }],
	};
}

function heading(value: string): Element {
	return {
		type: "element",
		tagName: "h1",
		properties: {},
		children: [{ type: "text", value }],
	};
}

function link(href: string, text: string): Element {
	return {
		type: "element",
		tagName: "a",
		properties: { href },
		children: [{ type: "text", value: text }],
	};
}

function tableCell(value: string): Element {
	return {
		type: "element",
		tagName: "td",
		properties: {},
		children: [{ type: "text", value }],
	};
}

function codeBlock(language: string): Element {
	return {
		type: "element",
		tagName: "pre",
		properties: {},
		children: [
			{
				type: "element",
				tagName: "code",
				properties: { class: `language-${language}` },
				children: [{ type: "text", value: "const x = 1;" }],
			},
		],
	};
}

function root(children: Element[]): Root {
	return { type: "root", children };
}

/** Build input for classify() where remote and base share the same hash. */
function buildInput(baseHast: Root, localHast: Root): ClassifyInput {
	const baseHash = canonicalHash(baseHast);

	const local = buildContentHash({
		source: "local",
		hast: localHast,
		attachmentHashes: { "img.png": "sha256:img" },
		title: "Test Title",
		parentPageId: "98765",
	});

	return {
		local,
		base: mockSharedBase({ renderedBodyHash: baseHash }),
		remote: mockRemote({ bodyHash: baseHash }),
	};
}

/** STATE fixtures. */
describe("TC-STATE-001 through TC-STATE-006", () => {
	test("TC-STATE-001: all three agree on canonical hash + title + parent + attachments → NO_CHANGE", () => {
		const contentHast = root([text("Content")]);
		const hash = canonicalHash(contentHast);

		const input: ClassifyInput = {
			local: buildContentHash({
				source: "local",
				hast: contentHast,
				attachmentHashes: { "img.png": "sha256:img" },
				title: "Test Title",
				parentPageId: "98765",
			}),
			base: mockSharedBase({ renderedBodyHash: hash }),
			remote: mockRemote({ bodyHash: hash }),
		};
		const result = classify(input);
		expect(result.ok).toBe(true);
		if (result.ok) expect(result.value).toBe("NO_CHANGE");
	});

	test("TC-STATE-002: local changed, remote == base → LOCAL_AHEAD", () => {
		const baseHast = root([text("Base content")]);
		const localHast = root([text("Modified content")]);

		const input = buildInput(baseHast, localHast);
		const result = classify(input);
		expect(result.ok).toBe(true);
		if (result.ok) expect(result.value).toBe("LOCAL_AHEAD");
	});

	test("TC-STATE-003: local == base, remote changed → REMOTE_AHEAD (INV-SAFE-1)", () => {
		const baseHast = root([text("Base content")]);
		const hash = canonicalHash(baseHast);
		const remoteHast = root([text("Remote modified")]);

		const input: ClassifyInput = {
			local: buildContentHash({
				source: "local",
				hast: baseHast,
				attachmentHashes: { "img.png": "sha256:img" },
				title: "Test Title",
				parentPageId: "98765",
			}),
			base: mockSharedBase({ renderedBodyHash: hash }),
			remote: mockRemote({ bodyHash: canonicalHash(remoteHast) }),
		};
		const result = classify(input);
		expect(result.ok).toBe(true);
		if (result.ok) expect(result.value).toBe("REMOTE_AHEAD");
	});

	test("TC-STATE-004: both local and remote changed vs base → DIVERGED (INV-SAFE-1)", () => {
		const baseHast = root([text("Base content")]);
		const hash = canonicalHash(baseHast);
		const localHast = root([text("Local modified")]);
		const remoteHast = root([text("Remote modified")]);

		const input: ClassifyInput = {
			local: buildContentHash({
				source: "local",
				hast: localHast,
				attachmentHashes: { "img.png": "sha256:img" },
				title: "Test Title",
				parentPageId: "98765",
			}),
			base: mockSharedBase({ renderedBodyHash: hash }),
			remote: mockRemote({ bodyHash: canonicalHash(remoteHast) }),
		};
		const result = classify(input);
		expect(result.ok).toBe(true);
		if (result.ok) expect(result.value).toBe("DIVERGED");
	});

	test("TC-STATE-005: binding present, remote.kind == 'missing' → REMOTE_MISSING (INV-SAFE-2)", () => {
		const input: ClassifyInput = {
			local: buildContentHash({
				source: "local",
				hast: root([text("Content")]),
				attachmentHashes: { "img.png": "sha256:img" },
				title: "Test Title",
				parentPageId: "98765",
			}),
			base: mockSharedBase(),
			remote: { kind: "missing" },
		};
		const result = classify(input);
		expect(result.ok).toBe(true);
		if (result.ok) expect(result.value).toBe("REMOTE_MISSING");
	});

	test("TC-STATE-006: binding present, local absent → LOCAL_MISSING (DEC-1)", () => {
		const input: ClassifyInput = {
			base: mockSharedBase(),
			remote: mockRemote(),
		};
		const result = classify(input);
		expect(result.ok).toBe(true);
		if (result.ok) expect(result.value).toBe("LOCAL_MISSING");
	});
});

/** FORBIDDEN path. */
describe("TC-FORBIDDEN-001", () => {
	test("remote.kind == 'forbidden' → err(Forbidden), not a SyncState", () => {
		const input: ClassifyInput = {
			local: buildContentHash({
				source: "local",
				hast: root([text("Content")]),
				attachmentHashes: { "img.png": "sha256:img" },
				title: "Test Title",
				parentPageId: "98765",
			}),
			base: mockSharedBase(),
			remote: { kind: "forbidden", pageId: "12345" },
		};
		const result = classify(input);
		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.error.kind).toBe("Forbidden");
			expect(result.error.pageId).toBe("12345");
			expect(result.error.operation).toBe("read");
		}
	});
});

/** FALSE-POSITIVE suite — semantically-unchanged-but-superficially-different docs. */
describe("TC-FALSEPOS-001 through TC-FALSEPOS-005", () => {
	test("TC-FALSEPOS-001: structural-whitespace text node count change → NO_CHANGE", () => {
		const baseHast = root([text("First paragraph"), text("Second paragraph")]);

		const variantHast = root([
			text("First paragraph"),
			{ type: "text", value: "\n" },
			text("Second paragraph"),
		]);

		expect(canonicalHash(baseHast)).toBe(canonicalHash(variantHast));

		const input = buildInput(baseHast, variantHast);
		const result = classify(input);
		expect(result.ok).toBe(true);
		if (result.ok) expect(result.value).toBe("NO_CHANGE");
	});

	test("TC-FALSEPOS-002: multiple newline-containing ws nodes collapsed → NO_CHANGE", () => {
		const baseHast = root([text("Content")]);
		const variantHast = root([
			{ type: "text", value: "\n\n\n" },
			text("Content"),
		]);

		expect(canonicalHash(baseHast)).toBe(canonicalHash(variantHast));

		const input = buildInput(baseHast, variantHast);
		const result = classify(input);
		expect(result.ok).toBe(true);
		if (result.ok) expect(result.value).toBe("NO_CHANGE");
	});

	test("TC-FALSEPOS-003: HTML attribute order diff → NO_CHANGE", () => {
		const baseHast = root([
			{
				type: "element",
				tagName: "a",
				properties: { href: "/link", target: "_blank" },
				children: [{ type: "text", value: "Link" }],
			},
		]);

		const variantHast = root([
			{
				type: "element",
				tagName: "a",
				properties: { target: "_blank", href: "/link" },
				children: [{ type: "text", value: "Link" }],
			},
		]);

		expect(canonicalHash(baseHast)).toBe(canonicalHash(variantHast));

		const input = buildInput(baseHast, variantHast);
		const result = classify(input);
		expect(result.ok).toBe(true);
		if (result.ok) expect(result.value).toBe("NO_CHANGE");
	});

	test("TC-FALSEPOS-004: raw-HTML node vs text node for same literal → NO_CHANGE", () => {
		const baseHast = root([
			{
				type: "element",
				tagName: "p",
				properties: {},
				children: [{ type: "text", value: "Text" }],
			},
		]);

		const variantHast = root([
			{
				type: "element",
				tagName: "p",
				properties: {},
				children: [{ type: "raw", value: "Text" }],
			},
		]);

		expect(canonicalHash(baseHast)).toBe(canonicalHash(variantHast));

		const input = buildInput(baseHast, variantHast);
		const result = classify(input);
		expect(result.ok).toBe(true);
		if (result.ok) expect(result.value).toBe("NO_CHANGE");
	});

	test("TC-FALSEPOS-005: empty line count change → NO_CHANGE", () => {
		const baseHast = root([
			{ type: "text", value: "Line 1" },
			{ type: "text", value: "Line 2" },
		]);

		const variantHast = root([
			{ type: "text", value: "Line 1" },
			{ type: "text", value: "\n\n" },
			{ type: "text", value: "Line 2" },
		]);

		expect(canonicalHash(baseHast)).toBe(canonicalHash(variantHast));

		const input = buildInput(baseHast, variantHast);
		const result = classify(input);
		expect(result.ok).toBe(true);
		if (result.ok) expect(result.value).toBe("NO_CHANGE");
	});
});

/** REAL-CHANGE suite — genuine content edits. */
describe("TC-REALCHG-001 through TC-REALCHG-005", () => {
	test("TC-REALCHG-001: text content change → NOT NO_CHANGE", () => {
		const baseHast = root([text("Original text")]);
		const editHast = root([text("Modified text")]);

		expect(canonicalHash(baseHast)).not.toBe(canonicalHash(editHast));

		const input = buildInput(baseHast, editHast);
		const result = classify(input);
		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(result.value).not.toBe("NO_CHANGE");
			expect(result.value).toBe("LOCAL_AHEAD");
		}
	});

	test("TC-REALCHG-002: heading addition → NOT NO_CHANGE", () => {
		const baseHast = root([text("Content")]);
		const editHast = root([heading("Title"), text("Content")]);

		expect(canonicalHash(baseHast)).not.toBe(canonicalHash(editHast));

		const input = buildInput(baseHast, editHast);
		const result = classify(input);
		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(result.value).not.toBe("NO_CHANGE");
			expect(result.value).toBe("LOCAL_AHEAD");
		}
	});

	test("TC-REALCHG-003: link URL change → NOT NO_CHANGE", () => {
		const baseHast = root([link("/old", "Link")]);
		const editHast = root([link("/new", "Link")]);

		expect(canonicalHash(baseHast)).not.toBe(canonicalHash(editHast));

		const input = buildInput(baseHast, editHast);
		const result = classify(input);
		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(result.value).not.toBe("NO_CHANGE");
			expect(result.value).toBe("LOCAL_AHEAD");
		}
	});

	test("TC-REALCHG-004: table cell content change → NOT NO_CHANGE", () => {
		const baseHast = root([
			{
				type: "element",
				tagName: "table",
				properties: {},
				children: [
					{
						type: "element",
						tagName: "tr",
						properties: {},
						children: [tableCell("Old")],
					},
				],
			},
		]);

		const editHast = root([
			{
				type: "element",
				tagName: "table",
				properties: {},
				children: [
					{
						type: "element",
						tagName: "tr",
						properties: {},
						children: [tableCell("New")],
					},
				],
			},
		]);

		expect(canonicalHash(baseHast)).not.toBe(canonicalHash(editHast));

		const input = buildInput(baseHast, editHast);
		const result = classify(input);
		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(result.value).not.toBe("NO_CHANGE");
			expect(result.value).toBe("LOCAL_AHEAD");
		}
	});

	test("TC-REALCHG-005: code block language change → NOT NO_CHANGE", () => {
		const baseHast = root([codeBlock("javascript")]);
		const editHast = root([codeBlock("typescript")]);

		expect(canonicalHash(baseHast)).not.toBe(canonicalHash(editHast));

		const input = buildInput(baseHast, editHast);
		const result = classify(input);
		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(result.value).not.toBe("NO_CHANGE");
			expect(result.value).toBe("LOCAL_AHEAD");
		}
	});
});

/** METADATA drift tests (R1/PD-3). */
describe("TC-METADATA-001, TC-METADATA-002, TC-NO-CHANGE-001", () => {
	test("TC-METADATA-001: title change only (body identical) → LOCAL_AHEAD (R1)", () => {
		const contentHast = root([text("Content")]);
		const hash = canonicalHash(contentHast);

		const input: ClassifyInput = {
			local: buildContentHash({
				source: "local",
				hast: contentHast,
				attachmentHashes: { "img.png": "sha256:img" },
				title: "New Title",
				parentPageId: "98765",
			}),
			base: mockSharedBase({ renderedBodyHash: hash }),
			remote: mockRemote({ bodyHash: hash, title: "Test Title" }),
		};
		const result = classify(input);
		expect(result.ok).toBe(true);
		if (result.ok) expect(result.value).toBe("LOCAL_AHEAD");
	});

	test("TC-METADATA-002: parent page id change only (body identical) → LOCAL_AHEAD (R1)", () => {
		const contentHast = root([text("Content")]);
		const hash = canonicalHash(contentHast);

		const input: ClassifyInput = {
			local: buildContentHash({
				source: "local",
				hast: contentHast,
				attachmentHashes: { "img.png": "sha256:img" },
				title: "Test Title",
				parentPageId: "99999",
			}),
			base: mockSharedBase({ renderedBodyHash: hash }),
			remote: mockRemote({ bodyHash: hash, parentPageId: "98765" }),
		};
		const result = classify(input);
		expect(result.ok).toBe(true);
		if (result.ok) expect(result.value).toBe("LOCAL_AHEAD");
	});

	test("TC-NO-CHANGE-001: title-less present remote → NO_CHANGE (NFR-PERF-4)", () => {
		const contentHast = root([text("Content")]);
		const hash = canonicalHash(contentHast);

		const input: ClassifyInput = {
			local: buildContentHash({
				source: "local",
				hast: contentHast,
				attachmentHashes: { "img.png": "sha256:img" },
				title: "Test Title",
				parentPageId: "98765",
			}),
			base: mockSharedBase({ renderedBodyHash: hash }),
			remote: {
				kind: "present",
				bodyHash: hash,
				version: 5,
				parentPageId: "98765",
				// title omitted (undefined) — should NOT trigger drift
			},
		};
		const result = classify(input);
		expect(result.ok).toBe(true);
		if (result.ok) expect(result.value).toBe("NO_CHANGE");
	});
});

/** ATTACHMENT drift tests (GH-26, NFR-3). */
describe("TC-UNIT-009", () => {
	test("TC-UNIT-009: attachmentHashes change only (same body) → NOT NO_CHANGE", () => {
		const contentHast = root([text("Content")]);
		const hash = canonicalHash(contentHast);

		const input: ClassifyInput = {
			local: buildContentHash({
				source: "local",
				hast: contentHast,
				attachmentHashes: { "img.png": "sha256:newhash" }, // Different hash
				title: "Test Title",
				parentPageId: "98765",
			}),
			base: mockSharedBase({
				renderedBodyHash: hash,
				attachmentHashes: { "img.png": "sha256:oldhash" }, // Old hash
			}),
			remote: mockRemote({ bodyHash: hash }),
		};
		const result = classify(input);
		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(result.value).not.toBe("NO_CHANGE");
			expect(result.value).toBe("LOCAL_AHEAD");
		}
	});
});

/** EDGE case: both missing. */
describe("TC-EDGE-001", () => {
	test("TC-EDGE-001: local absent + remote.kind == 'missing' + binding → LOCAL_MISSING (DEC-6)", () => {
		const input: ClassifyInput = {
			base: mockSharedBase(),
			remote: { kind: "missing" },
		};
		const result = classify(input);
		expect(result.ok).toBe(true);
		if (result.ok) expect(result.value).toBe("LOCAL_MISSING");
	});
});

/** BOUNDARY test: zod schema rejects ad-hoc state strings. */
describe("TC-BOUNDARY-001", () => {
	test("TC-BOUNDARY-001: SyncStateSchema rejects ad-hoc state string", () => {
		expect(() => SyncStateSchema.parse("SOMETHING_ELSE")).toThrow();
		expect(() => SyncStateSchema.parse("NO_CHANGE")).not.toThrow();
		expect(() => SyncStateSchema.parse("LOCAL_AHEAD")).not.toThrow();
		expect(() => SyncStateSchema.parse("REMOTE_AHEAD")).not.toThrow();
		expect(() => SyncStateSchema.parse("DIVERGED")).not.toThrow();
		expect(() => SyncStateSchema.parse("REMOTE_MISSING")).not.toThrow();
		expect(() => SyncStateSchema.parse("LOCAL_MISSING")).not.toThrow();
	});
});
