// Unit tests for the DocumentId branded VO + parseDocumentId (GH-18 F-2 /
// TC-DOCID-001..003 / DEC-6 — DocumentIdError is domain-local, not a union arm).

import { describe, expect, test } from "bun:test";
import {
	type DocumentId,
	type DocumentIdError,
	parseDocumentId,
} from "#domain/identity/document-id";
import { generateUuidV7, isUuidV7 } from "#domain/identity/uuid";

describe("DocumentId value object", () => {
	test("TC-DOCID-001: a DocumentId is assignable to string; a bare string is NOT assignable to DocumentId", () => {
		const id: DocumentId = generateUuidV7();
		const s: string = id; // DocumentId extends string — OK
		expect(typeof s).toBe("string");

		// @ts-expect-error — the brand is nominal; a bare string is rejected.
		const bad: DocumentId = "0192b3d4-5e6f-7a8b-9c0d-1e2f3a4b5c6d";
		void bad;
	});

	test("TC-DOCID-002: parseDocumentId ok on a valid v7; err on a malformed value", () => {
		const valid = generateUuidV7();
		const ok = parseDocumentId(valid);
		if (ok.ok) {
			expect(isUuidV7(ok.value)).toBe(true);
			expect(ok.value).toBe(valid);
		} else {
			expect.unreachable("expected ok for a valid v7");
		}

		const err = parseDocumentId("not-a-uuid");
		if (err.ok) {
			expect.unreachable("expected err for a malformed value");
		} else {
			const expected: DocumentIdError = {
				kind: "InvalidDocumentId",
				value: "not-a-uuid",
			};
			expect(err.error).toEqual(expected);
		}
	});

	test("TC-DOCID-003: generateUuidV7() output parses via parseDocumentId → ok (the seams agree)", () => {
		for (let i = 0; i < 50; i++) {
			const r = parseDocumentId(generateUuidV7());
			expect(r.ok).toBe(true);
		}
	});
});
