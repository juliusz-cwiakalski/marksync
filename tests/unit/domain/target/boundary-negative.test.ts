// Boundary negative test (AC-F1-1 / PD-4): proves the production dep-cruiser
// rule `domain-may-not-import-infra` fires on a real `src/domain/**` →
// `src/infra/**` breach. Per PD-4 the probe must live under `src/domain/` at
// cruise time (a `tests/` fixture cannot fire the production rule, which runs
// `depcruise src`). The probe is ephemeral — created at runtime and deleted in
// `afterEach`; cleanup is load-bearing (a leaked probe permanently breaks
// `depcruise src`).

import {
	afterAll,
	afterEach,
	beforeAll,
	describe,
	expect,
	test,
} from "bun:test";
import { existsSync, rmSync, writeFileSync } from "node:fs";

const PROBE_PATH = "src/domain/__boundary_probe__.ts";
const PROBE_BODY = `import { renderStorage } from "#infra/confluence/render/storage";\nexport const _probe = renderStorage;\n`;

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

describe("TC-BND-001 — dep-cruiser catches a src/domain → src/infra breach (AC-F1-1)", () => {
	test("a src/domain probe importing #infra/* fires domain-may-not-import-infra", () => {
		writeFileSync(PROBE_PATH, PROBE_BODY);
		const violations = depcruiseSrc();

		const breach = violations.find(
			(v) => v.rule.name === "domain-may-not-import-infra",
		);
		expect(breach).toBeDefined();
		expect(breach?.from).toBe(PROBE_PATH);
		expect(breach?.to).toMatch(/^src\/infra\//);
	});

	test("the probe is gone and depcruise src is clean (clean-state positive)", () => {
		// afterEach from the previous test already removed it; assert explicitly.
		removeProbe();
		const violations = depcruiseSrc();
		const domainInfraBreaches = violations.filter(
			(v) => v.rule.name === "domain-may-not-import-infra",
		);
		expect(domainInfraBreaches).toHaveLength(0);
	});
});
