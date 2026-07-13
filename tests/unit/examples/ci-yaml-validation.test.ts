import { describe, it, expect, beforeAll } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parse as parseYaml } from "yaml";

describe("CI concurrency-group templates", () => {
	let templateYaml: string;
	let templateParsed: unknown;

	beforeAll(() => {
		templateYaml = readFileSync(
			join(process.cwd(), "examples/ci/github-actions-concurrency.yml"),
			"utf-8",
		);
		templateParsed = parseYaml(templateYaml);
	});

	it("TC-CI-001: parses as valid YAML", () => {
		expect(templateYaml).toBeTruthy();
		expect(typeof templateYaml).toBe("string");
		expect(templateYaml.length).toBeGreaterThan(0);
	});

	it("TC-CI-001: contains concurrency block with group key", () => {
		expect(templateParsed).toHaveProperty("concurrency");
		const concurrency = (templateParsed as { concurrency: unknown })
			.concurrency;
		expect(typeof concurrency).toBe("object");
		expect(concurrency).toHaveProperty("group");
	});

	it("TC-CI-001: contains concurrency block with cancel-in-progress", () => {
		const concurrency = (templateParsed as { concurrency: unknown })
			.concurrency;
		expect(typeof concurrency).toBe("object");
		expect(concurrency).toHaveProperty("cancel-in-progress");
	});

	it("TC-CI-001: README documents required elements", () => {
		const readme = readFileSync(
			join(process.cwd(), "examples/ci/README.md"),
			"utf-8",
		);

		// Check for key sections
		expect(readme).toContain("## Why Use Concurrency Groups?");
		expect(readme).toContain("## Group Key Strategy");
		expect(readme).toContain("## Cancel-in-Progress Tradeoff");
		expect(readme).toContain("## Example Usage");

		// Check for references to ADR-0006
		expect(readme).toContain("ADR-0006");
	});
});
