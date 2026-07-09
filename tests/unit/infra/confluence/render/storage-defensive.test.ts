// tests/unit/infra/confluence/render/storage-defensive.test.ts
//
// Defensive <sub>/<sup> visitor arm (GH-20 F-4 / PM-DEC-1). remark-gfm cannot
// produce ~text~/^text^ (non-GFM), so there is no markdown golden fixture; the
// spike proved these survive a Storage round-trip when present, so the visitor
// maps them defensively. Verified here with a hand-constructed HAST node, NOT a
// markdown→golden round-trip. TC-SUBSUP-DEF-001.

import type { Root } from "hast";
import { describe, expect, test } from "bun:test";
import { renderStorage } from "#infra/confluence/render/storage";

/** Hand-construct a HAST tree containing <sub> and <sup> element nodes. */
function subSupTree(): Root {
	return {
		type: "root",
		children: [
			{
				type: "element",
				tagName: "p",
				properties: {},
				children: [
					{ type: "text", value: "H" },
					{
						type: "element",
						tagName: "sub",
						properties: {},
						children: [{ type: "text", value: "2" }],
					},
					{ type: "text", value: "O and E=mc" },
					{
						type: "element",
						tagName: "sup",
						properties: {},
						children: [{ type: "text", value: "2" }],
					},
				],
			},
		],
	};
}

describe("TC-SUBSUP-DEF-001 (PM-DEC-1) — defensive <sub>/<sup> visitor arm", () => {
	const result = renderStorage(subSupTree(), { sourcePath: "hand-built" });

	test("renders ok (sub/sup are allowed, never classified)", () => {
		expect(result.ok).toBe(true);
	});

	test("emits <sub>…</sub> and <sup>…</sup> verbatim for hand-constructed HAST", () => {
		if (!result.ok) throw new Error("expected ok");
		// No golden markdown round-trip is claimed (remark-gfm cannot produce these);
		// the defensive arm proves correct IF a future extension ever yields such nodes.
		expect(result.value.body).toBe(
			"<p>H<sub>2</sub>O and E=mc<sup>2</sup></p>",
		);
		expect(result.value.warnings).toEqual([]);
	});
});
