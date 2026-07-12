// Boundary negative test (AC-F1-1 / TC-PURITY-001/002): proves the production dep-cruiser
// rule `domain-may-not-import-infra` fires on a real `src/domain/state/**` →
// `src/infra/**` breach. Per PD-4 the probe must live under `src/domain/state/`
// at cruise time (state-scoped to avoid parallel-run collision with the GH-21
// target-layer probe). The probe is ephemeral — created at runtime and deleted in
// `beforeAll`/`afterEach`/`afterAll`; cleanup is load-bearing (a leaked probe
// permanently breaks `depcruise src`).

import {
	afterAll,
	afterEach,
	beforeAll,
	describe,
	expect,
	test,
} from "bun:test";
import { existsSync, rmSync, writeFileSync } from "node:fs";

const PROBE_PATH = "src/domain/state/__boundary_probe__.ts";
const PROBE_BODY = `import { ConfluenceClient } from "#infra/confluence/client";\nexport const _probe = ConfluenceClient;\n`;

interface DepcruiseViolation {
	rule: { name: string };
	from: string;
	to: string;
}

/** Run the production ruleset over `src` and return parsed violations. */
function depcruiseSrc(): DepcruiseViolation[] {
	const result = Bun.spawnSync({
		cmd: ["bunx", "depcruise", "src", "--output-type", "json"],
		stdout: "pipe",
		stderr: "pipe",
	});
	const stdout = result.stdout.toString();
	// dependency-cruiser JSON: { summary: { violations: [...] }, modules: [...] }
	const parsed = JSON.parse(stdout) as {
		summary?: { violations?: DepcruiseViolation[] };
	};
	return parsed.summary?.violations ?? [];
}

/** Remove the probe if it exists — load-bearing cleanup (PD-4). */
function removeProbe(): void {
	if (existsSync(PROBE_PATH)) rmSync(PROBE_PATH, { force: true });
}

// Belt-and-suspenders against a killed prior run: a stale probe on disk would
// permanently poison `depcruise src` for everyone. Cleared on entry (beforeAll),
// on every test boundary (afterEach), and on exit (afterAll). The probe path is
// also gitignored so it can never be committed.
beforeAll(removeProbe);
afterEach(removeProbe);
afterAll(removeProbe);

describe("TC-PURITY-001, TC-PURITY-002 — boundary proof for src/domain/state/**", () => {
	test("TC-PURITY-001: a src/domain/state probe importing #infra/* fires domain-may-not-import-infra", () => {
		writeFileSync(PROBE_PATH, PROBE_BODY);
		const violations = depcruiseSrc();

		const breach = violations.find(
			(v) => v.rule.name === "domain-may-not-import-infra",
		);
		expect(breach).toBeDefined();
		expect(breach?.from).toBe(PROBE_PATH);
		expect(breach?.to).toMatch(/^src\/infra\//);
	});

	test("TC-PURITY-002: production code has 0 infra imports under src/domain/state/** (clean-state positive)", () => {
		removeProbe();
		const violations = depcruiseSrc();
		const domainInfraBreaches = violations.filter(
			(v) =>
				v.rule.name === "domain-may-not-import-infra" &&
				v.from.startsWith("src/domain/state/"),
		);
		expect(domainInfraBreaches).toHaveLength(0);
	});
});