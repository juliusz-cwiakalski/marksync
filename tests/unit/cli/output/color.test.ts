// tests/unit/cli/output/color.test.ts
//
// Unit tests for the color policy + non-interactive auto-detection (GH-16 D-6
// / DEC-3 / ADR-0011 C-2 / NFR-A11Y-1 / TS-10 / AC-3). Exercises the matrix:
//   - isTTY true  → enabled
//   - isTTY false → disabled (piped)
//   - NO_COLOR    → disabled (even on a TTY)
//   - CI          → disabled
//   - TERM=dumb   → disabled
//   - --color     → forced on  (even piped/non-interactive)
//   - --no-color  → forced off (even on a TTY)
//
// Only the boundary signals are stubbed (`process.stdout.isTTY`, the relevant
// `process.env` keys); they are restored after each test so nothing leaks.

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import {
	createColor,
	resolveColorPolicy,
} from "../../../../src/cli/output/color.ts";

interface Scenario {
	isTTY?: boolean;
	ci?: string;
	noColor?: string;
	term?: string;
}

// --- boundary stubbing (save / restore) -------------------------------------

const originalIsTtyDescr = Object.getOwnPropertyDescriptor(
	process.stdout,
	"isTTY",
);
const originalEnv = {
	CI: process.env.CI,
	NO_COLOR: process.env.NO_COLOR,
	TERM: process.env.TERM,
};

function setScenario(s: Scenario): void {
	Object.defineProperty(process.stdout, "isTTY", {
		value: s.isTTY,
		configurable: true,
		writable: true,
	});
	if (s.ci === undefined) {
		delete process.env.CI;
	} else {
		process.env.CI = s.ci;
	}
	if (s.noColor === undefined) {
		delete process.env.NO_COLOR;
	} else {
		process.env.NO_COLOR = s.noColor;
	}
	if (s.term === undefined) {
		delete process.env.TERM;
	} else {
		process.env.TERM = s.term;
	}
}

function restoreBoundary(): void {
	if (originalIsTtyDescr) {
		Object.defineProperty(process.stdout, "isTTY", originalIsTtyDescr);
	} else {
		// isTTY wasn't an own property on stdout originally; remove our override.
		delete (process.stdout as { isTTY?: boolean }).isTTY;
	}
	for (const [key, value] of Object.entries(originalEnv)) {
		if (value === undefined) {
			delete process.env[key];
		} else {
			process.env[key] = value;
		}
	}
}

// --- tests ------------------------------------------------------------------

describe("resolveColorPolicy — non-interactive auto-detect (NFR-A11Y-1)", () => {
	beforeEach(() => restoreBoundary());
	afterEach(() => restoreBoundary());

	test("interactive TTY → enabled", () => {
		setScenario({ isTTY: true });
		expect(resolveColorPolicy().enabled).toBe(true);
	});

	test("piped (no TTY) → disabled", () => {
		setScenario({ isTTY: false });
		expect(resolveColorPolicy().enabled).toBe(false);
	});

	test("stdout not present as isTTY → disabled (treats undefined as non-interactive)", () => {
		setScenario({ isTTY: undefined });
		expect(resolveColorPolicy().enabled).toBe(false);
	});

	test("NO_COLOR set (even on a TTY) → disabled", () => {
		setScenario({ isTTY: true, noColor: "1" });
		expect(resolveColorPolicy().enabled).toBe(false);
	});

	test("CI set (even on a TTY) → disabled", () => {
		setScenario({ isTTY: true, ci: "true" });
		expect(resolveColorPolicy().enabled).toBe(false);
	});

	test("TERM=dumb (even on a TTY) → disabled", () => {
		setScenario({ isTTY: true, term: "dumb" });
		expect(resolveColorPolicy().enabled).toBe(false);
	});

	test("TERM is a normal value on a TTY → enabled", () => {
		setScenario({ isTTY: true, term: "xterm-256color" });
		expect(resolveColorPolicy().enabled).toBe(true);
	});

	test("every non-interactive signal stacks on a non-TTY → disabled", () => {
		setScenario({ isTTY: false, ci: "1", noColor: "1", term: "dumb" });
		expect(resolveColorPolicy().enabled).toBe(false);
	});
});

describe("resolveColorPolicy — --color / --no-color overrides (AC-3)", () => {
	beforeEach(() => restoreBoundary());
	afterEach(() => restoreBoundary());

	test("--color forces ON even when piped (no TTY)", () => {
		setScenario({ isTTY: false });
		expect(resolveColorPolicy({ color: true }).enabled).toBe(true);
	});

	test("--color forces ON even when CI is set", () => {
		setScenario({ isTTY: false, ci: "true", noColor: "1", term: "dumb" });
		expect(resolveColorPolicy({ color: true }).enabled).toBe(true);
	});

	test("--no-color forces OFF even on a TTY", () => {
		setScenario({ isTTY: true });
		expect(resolveColorPolicy({ noColor: true }).enabled).toBe(false);
	});

	test("--color wins over NO_COLOR env (explicit flag beats env)", () => {
		setScenario({ isTTY: true, noColor: "1" });
		expect(resolveColorPolicy({ color: true }).enabled).toBe(true);
	});

	test("--no-color wins over an interactive TTY", () => {
		setScenario({ isTTY: true });
		expect(resolveColorPolicy({ noColor: true }).enabled).toBe(false);
	});

	test("no flags + clean TTY → enabled (overrides absent)", () => {
		setScenario({ isTTY: true });
		expect(resolveColorPolicy({}).enabled).toBe(true);
		expect(resolveColorPolicy().enabled).toBe(true);
	});
});

describe("createColor(enabled) — picocolors kit (DEC-3)", () => {
	test("disabled kit color methods are identity no-ops (no ANSI)", () => {
		const colors = createColor(false);
		expect(colors.red("x")).toBe("x");
		expect(colors.bold("y")).toBe("y");
		expect(colors.green("z")).toBe("z");
	});

	test("enabled kit color methods emit ANSI escape codes", () => {
		const colors = createColor(true);
		const out = colors.red("token");
		expect(out).not.toBe("token");
		expect(out).toContain("token");
		// ANSI SGR sequence: begins with ESC (0x1b) then '[' ... 'm'. Asserted
		// via codePointAt (no control-char literal in source) so Biome's
		// noControlCharactersInRegex stays clean.
		expect(out.codePointAt(0)).toBe(0x1b);
		expect(out).toContain("[");
		expect(out).toContain("m");
	});

	test("isColorSupported reflects the enabled flag", () => {
		expect(createColor(true).isColorSupported).toBe(true);
		expect(createColor(false).isColorSupported).toBe(false);
	});
});
