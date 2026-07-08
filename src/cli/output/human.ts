// src/cli/output/human.ts
//
// Generic human renderer + per-command formatter registry (GH-16 D-3 / F-3 /
// AC-7 / ADR-0011 C-3). The generic `renderHuman` fallback renders ANY
// `CommandResult<T>` as readable key-value plain text with NO box-drawing
// characters (NFR-A11Y-2). The registry lets a command register a richer
// formatter that overrides the fallback FOR THAT COMMAND ONLY — adding a
// command never touches this file's render logic (C-3 / AC-5).
//
// Color is applied via the `color.ts` kit (DEC-3 / ADR-0011 C-2): every color
// method is an identity no-op when the policy is disabled, so when
// `colorEnabled === false` (plain-log mode) the output contains NO ANSI codes
// (NFR-A11Y-2 / RSK-6). The fallback never emits box-drawing characters
// regardless of color, so `--no-color --output=human` is fully plain-text and
// screen-reader friendly.
//
// Tier rule: presentation output. Imports only sibling output modules
// (`./command-result` type-only, `./color`) — no `#domain/*` / `#infra/*`
// (DEC-1 / dep-cruiser). Redaction is NOT applied here — the OutputService
// chokepoint (Phase 4 `index.ts`) redacts the rendered string per DEC-4.

import type { ColorKit } from "./color";
import { createColor } from "./color";
import type { CommandResult } from "./command-result";

/** Options accepted by `renderHuman` / the registry formatters. */
export interface HumanRenderOptions {
	/** Whether color codes may be emitted (false in plain-log/`--no-color` mode). */
	colorEnabled: boolean;
}

/**
 * A per-command human formatter. Receives the resolved `CommandResult<T>` and
 * the color kit (no-op when disabled) and returns the rendered human string.
 * The formatter MUST NOT emit box-drawing characters; it SHOULD use the kit for
 * any coloring so `--no-color` produces plain text (NFR-A11Y-2).
 */
export type HumanFormatter<T = unknown> = (
	result: CommandResult<T>,
	colors: ColorKit,
) => string;

// The per-command registry (module-level; additive — C-3). A command registers
// its formatter once at import time; `renderHumanForCommand` resolves it.
const registry = new Map<string, HumanFormatter>();

/**
 * Register a richer human formatter for `command`, overriding the generic
 * fallback FOR THAT COMMAND ONLY (AC-7). Additive: registering a new command's
 * formatter never edits the generic render path (C-3 / AC-5). Re-registering the
 * same command replaces the prior formatter (last-write-wins).
 */
export function registerHumanFormatter<T>(
	command: string,
	formatter: HumanFormatter<T>,
): void {
	registry.set(command, formatter as HumanFormatter);
}

/** Look up the registered formatter for `command` (or `undefined`). */
export function getHumanFormatter(command: string): HumanFormatter | undefined {
	return registry.get(command);
}

/** Clear the registry (test-only — keeps registry tests hermetic). */
export function clearHumanFormatterRegistry(): void {
	registry.clear();
}

/**
 * Render a primitive/structured `value` as a single human-readable line for the
 * generic fallback. Strings render verbatim; everything else uses compact JSON.
 */
function renderValue(value: unknown): string {
	if (typeof value === "string") {
		return value;
	}
	if (value === undefined) {
		return "";
	}
	return JSON.stringify(value);
}

/**
 * The GENERIC human fallback: renders any `CommandResult<T>` as key-value plain
 * text (no box-drawing chars — NFR-A11Y-2). Color is applied through the kit
 * and is a no-op when `colorEnabled === false`, so `--no-color` output contains
 * zero ANSI. Used directly when no formatter is registered for the command, and
 * as the base that registered formatters build on (AC-7 / TS-11).
 */
export function renderHuman(
	result: CommandResult<unknown>,
	opts: HumanRenderOptions,
): string {
	const colors = createColor(opts.colorEnabled);
	const lines: string[] = [];
	lines.push(`run: ${result.runId}`);
	lines.push(`exit: ${result.exitCode}`);
	if (result.timing) {
		lines.push(`started: ${result.timing.startedAt}`);
		lines.push(`duration: ${result.timing.durationMs}ms`);
	}
	if (result.data !== undefined) {
		lines.push(`data: ${renderValue(result.data)}`);
	}
	if (result.error) {
		const retryable = result.error.retryable ? " (retryable)" : "";
		lines.push(
			`error: ${result.error.code} — ${result.error.message}${retryable}`,
		);
	}
	if (result.warnings) {
		for (const w of result.warnings) {
			lines.push(`warning: ${w.code} — ${w.message}`);
		}
	}
	// Color the headline lines via the kit (no-op when disabled). Applied to the
	// assembled lines so the color never leaks into data/error payloads that may
	// be redacted downstream — the OutputService redacts the final string.
	if (result.error) {
		lines[0] = colors.red(lines[0] ?? "");
	} else {
		lines[0] = colors.green(lines[0] ?? "");
	}
	return lines.join("\n");
}

/**
 * Resolve the human output for a command: prefer a registered formatter
 * (`getHumanFormatter(command)`) and fall back to the generic `renderHuman`
 * when none is registered (AC-7). This is the entry point the OutputService uses
 * for `format: "human"`. When `command` is absent/unregistered, the generic
 * fallback is always used.
 */
export function renderHumanForCommand(
	command: string | undefined,
	result: CommandResult<unknown>,
	opts: HumanRenderOptions,
): string {
	const formatter = command ? registry.get(command) : undefined;
	if (formatter) {
		const colors = createColor(opts.colorEnabled);
		return formatter(result, colors);
	}
	return renderHuman(result, opts);
}
