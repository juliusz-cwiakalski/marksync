// Golden fixture for the provenance panel XHTML output (TC-PROV-001 / NFR-A11Y-3).
// Byte-stable: any change to buildProvenancePanel output is a deliberate
// re-baseline.

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, expect, test } from "bun:test";
import { buildProvenancePanel } from "#infra/confluence/provenance";

const here = dirname(new URL(import.meta.url).pathname);
const fixture = readFileSync(
	join(here, "..", "fixtures", "markdown", "provenance-panel.storage.xhtml"),
	"utf8",
).trim();

describe("TC-PROV-001 golden — provenance panel XHTML", () => {
	test("byte-exact match against committed fixture", () => {
		const panel = buildProvenancePanel({
			sourcePath: "docs/guide/api.md",
			sourceBranch: "main",
			headCommit: "a1b2c3d",
			synchronizedAt: "2026-07-14T12:34:56Z",
		});
		expect(panel).toBe(fixture);
	});

	test("snapshot layer", () => {
		const panel = buildProvenancePanel({
			sourcePath: "docs/guide/api.md",
			sourceBranch: "main",
			headCommit: "a1b2c3d",
			synchronizedAt: "2026-07-14T12:34:56Z",
		});
		expect(panel).toMatchSnapshot("provenance-panel.storage");
	});
});
