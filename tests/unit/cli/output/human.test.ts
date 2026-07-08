// tests/unit/cli/output/human.test.ts
//
// Unit tests for the generic human renderer + per-command registry (GH-16 D-3 /
// F-3 / AC-7 / AC-4 / NFR-A11Y-2 / RSK-6 / TS-11). Asserts: the generic fallback
// renders unregistered commands as key-value text; a registered formatter's
// output differs from (and is richer than) the fallback (AC-7); `--no-color` /
// plain-log mode produces NO ANSI codes and NO box-drawing characters
// (NFR-A11Y-2 / RSK-6).

import { afterEach, describe, expect, test } from "bun:test";
import {
	ok,
	err,
	type CommandResult,
} from "../../../../src/cli/output/command-result.ts";
import {
	clearHumanFormatterRegistry,
	getHumanFormatter,
	renderHuman,
	renderHumanForCommand,
	registerHumanFormatter,
} from "../../../../src/cli/output/human.ts";

// ANSI escape detector: ESC (0x1b) followed by '['. Detected via codePointAt so
// no control-char literal lives in source (Biome noControlCharactersInRegex).
const ANSI_ESC = 0x1b;
function containsAnsi(s: string): boolean {
	for (let i = 0; i < s.length; i++) {
		if (s.codePointAt(i) === ANSI_ESC && s[i + 1] === "[") {
			return true;
		}
	}
	return false;
}

// Box-drawing characters (U+2500–U+257F) — present in tables/boxes.
const BOX_DRAWING = /[\u2500-\u257F]/;

// Registry tests mutate module state; reset after each so they don't leak.
afterEach(() => clearHumanFormatterRegistry());

describe("renderHuman — generic fallback (unregistered command)", () => {
	test("renders a CommandResult as key-value plain text", () => {
		const result = ok({ pageId: "123" }, { runId: "run-1" });
		const out = renderHuman(result, { colorEnabled: false });
		expect(out).toContain("run: run-1");
		expect(out).toContain("exit: 0");
		expect(out).toContain("data:");
		expect(out).toContain("123");
	});

	test("renders timing when present", () => {
		const result = ok("ok", {
			runId: "r",
			timing: { startedAt: "2026-07-08T10:00:00Z", durationMs: 42 },
		});
		const out = renderHuman(result, { colorEnabled: false });
		expect(out).toContain("started: 2026-07-08T10:00:00Z");
		expect(out).toContain("duration: 42ms");
	});

	test("renders error block (code + message + retryable)", () => {
		const result = err("CONFLICT", "remote ahead", true, { runId: "r" });
		const out = renderHuman(result, { colorEnabled: false });
		expect(out).toContain("error: CONFLICT — remote ahead (retryable)");
	});

	test("renders non-retryable error without (retryable)", () => {
		const result = err("INVALID_CONFIG", "bad config", false, { runId: "r" });
		const out = renderHuman(result, { colorEnabled: false });
		expect(out).toContain("error: INVALID_CONFIG — bad config");
		expect(out).not.toContain("(retryable)");
	});

	test("renders warnings when present", () => {
		const result = ok("ok", {
			runId: "r",
			warnings: [{ code: "DEPRECATED", message: "field x is deprecated" }],
		});
		const out = renderHuman(result, { colorEnabled: false });
		expect(out).toContain("warning: DEPRECATED — field x is deprecated");
	});

	test("never emits box-drawing characters (NFR-A11Y-2)", () => {
		const results: CommandResult<unknown>[] = [
			ok({ a: 1 }, { runId: "r" }),
			err("CONFLICT", "x", true, { runId: "r" }),
		];
		for (const r of results) {
			expect(BOX_DRAWING.test(renderHuman(r, { colorEnabled: true }))).toBe(
				false,
			);
			expect(BOX_DRAWING.test(renderHuman(r, { colorEnabled: false }))).toBe(
				false,
			);
		}
	});
});

describe("registerHumanFormatter / getHumanFormatter — registry (AC-7)", () => {
	test("getHumanFormatter returns undefined for an unregistered command", () => {
		expect(getHumanFormatter("definitely-not-registered")).toBeUndefined();
	});

	test("a registered formatter overrides the generic fallback for that command", () => {
		const result = ok(
			{ pageId: "123", title: "Home", n: 3 },
			{ runId: "run-1" },
		);
		registerHumanFormatter<{ pageId: string; title: string; n: number }>(
			"plan",
			(r) => {
				const d = r.data;
				if (!d) return "no data";
				return [
					`=== plan report (run ${r.runId}) ===`,
					"pages to publish:",
					`  - ${d.pageId} — ${d.title}`,
					`  count: ${d.n} page(s)`,
					"next step: review and run 'marksync sync'",
				].join("\n");
			},
		);
		const registered = renderHumanForCommand("plan", result, {
			colorEnabled: false,
		});
		const fallback = renderHuman(result, { colorEnabled: false });

		// AC-7: registered output differs from AND is richer than the fallback.
		expect(registered).not.toBe(fallback);
		expect(registered).toContain("=== plan report (run run-1) ===");
		expect(registered).toContain("pages to publish:");
		expect(registered).toContain("- 123 — Home");
		expect(registered).toContain("count: 3 page(s)");
		expect(registered).toContain("next step:");
		// Richer = strictly more output than the generic key-value fallback.
		expect(registered.length).toBeGreaterThan(fallback.length);
		expect(registered.split("\n").length).toBeGreaterThan(
			fallback.split("\n").length,
		);
		// An unregistered command still gets the generic fallback.
		expect(renderHumanForCommand("sync", result, { colorEnabled: false })).toBe(
			fallback,
		);
	});

	test("the override is scoped to the registered command only (C-3)", () => {
		registerHumanFormatter("plan", () => "PLAN-RICH");
		expect(
			renderHumanForCommand("plan", ok("x", { runId: "r" }), {
				colorEnabled: false,
			}),
		).toBe("PLAN-RICH");
		// 'sync' is NOT registered → generic fallback.
		const syncOut = renderHumanForCommand("sync", ok("x", { runId: "r" }), {
			colorEnabled: false,
		});
		expect(syncOut).not.toBe("PLAN-RICH");
		expect(syncOut).toContain("run:");
	});

	test("renderHumanForCommand falls back to generic when command is undefined", () => {
		const result = ok("x", { runId: "r" });
		const out = renderHumanForCommand(undefined, result, {
			colorEnabled: false,
		});
		expect(out).toBe(renderHuman(result, { colorEnabled: false }));
	});

	test("re-registering the same command replaces the prior formatter", () => {
		registerHumanFormatter("plan", () => "FIRST");
		expect(
			renderHumanForCommand("plan", ok("x", { runId: "r" }), {
				colorEnabled: false,
			}),
		).toBe("FIRST");
		registerHumanFormatter("plan", () => "SECOND");
		expect(
			renderHumanForCommand("plan", ok("x", { runId: "r" }), {
				colorEnabled: false,
			}),
		).toBe("SECOND");
	});
});

describe("--no-color / plain-log mode — no ANSI, no box-drawing (AC-4 / NFR-A11Y-2 / RSK-6)", () => {
	test("disabled-color fallback contains no ANSI and no box-drawing", () => {
		const result = ok({ pageId: "123" }, { runId: "run-1" });
		const out = renderHuman(result, { colorEnabled: false });
		expect(containsAnsi(out)).toBe(false);
		expect(BOX_DRAWING.test(out)).toBe(false);
	});

	test("disabled-color error result contains no ANSI and no box-drawing", () => {
		const result = err("CONFLICT", "remote ahead", true, { runId: "r" });
		const out = renderHuman(result, { colorEnabled: false });
		expect(containsAnsi(out)).toBe(false);
		expect(BOX_DRAWING.test(out)).toBe(false);
	});

	test("disabled-color registered formatter output contains no ANSI (formatter honors kit)", () => {
		registerHumanFormatter("plan", (_r, colors) => colors.green("headline"));
		const out = renderHumanForCommand("plan", ok("x", { runId: "r" }), {
			colorEnabled: false,
		});
		expect(containsAnsi(out)).toBe(false);
		expect(out).toBe("headline");
	});

	test("enabled-color output DOES emit ANSI (proves the kit is wired, not a hard no-op)", () => {
		const result = ok({ pageId: "123" }, { runId: "run-1" });
		const out = renderHuman(result, { colorEnabled: true });
		expect(containsAnsi(out)).toBe(true);
	});
});
