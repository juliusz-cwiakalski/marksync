// src/cli/output/color.ts
//
// Color policy + non-interactive auto-detection (GH-16 D-6 / DEC-3 /
// ADR-0011 C-2 / NFR-A11Y-1). `picocolors` is the coloring lib — never
// `chalk` (typescript.md allowed-dependency list; ADR-0011 C-2). The output
// service (Phase 4) resolves the policy ONCE from the global flags and threads
// it into the human renderer; command code never imports a color lib directly.
//
// Tier rule: presentation output. The only import is `picocolors` (a runtime
// dep confined to `src/cli/`) — no `#domain/*` / `#infra/*` (DEC-1 /
// dep-cruiser). In plain-log mode (`--no-color --output=human`) the kit is
// disabled so output contains no ANSI codes and no box-drawing chars
// (NFR-A11Y-2 — the renderer side of that guarantee lands in Phase 4).

import { createColors } from "picocolors";

/** A resolved color policy: whether color codes may be emitted. */
export interface ColorPolicy {
	enabled: boolean;
}

/** Options accepted by `resolveColorPolicy` (mirrors the `--color`/`--no-color` flags). */
export interface ColorPolicyOptions {
	/** `--color` — force color on, even when piped/non-interactive. */
	color?: boolean;
	/** `--no-color` — force color off, even on a TTY. */
	noColor?: boolean;
}

/**
 * Resolve the color policy honoring `--color` / `--no-color` overrides, else
 * non-interactive auto-detect (ADR-0011 C-2 / NFR-A11Y-1). Color is disabled
 * when stdout is not a TTY, or `CI` / `NO_COLOR` is set, or `TERM` is `dumb`.
 *
 * Precedence: `--color` wins; then `--no-color`; then auto-detect. (`--color`
 * forces on even when piped; `--no-color` forces off even on a TTY.)
 */
export function resolveColorPolicy(opts: ColorPolicyOptions = {}): ColorPolicy {
	if (opts.color) {
		return { enabled: true };
	}
	if (opts.noColor) {
		return { enabled: false };
	}
	const nonInteractive =
		!process.stdout.isTTY ||
		!!process.env.CI ||
		!!process.env.NO_COLOR ||
		process.env.TERM === "dumb";
	return { enabled: !nonInteractive };
}

/**
 * The picocolors color kit type (derived so we don't reach into picocolors'
 * internal `types` module). All methods take a string and return a string.
 */
export type ColorKit = ReturnType<typeof createColors>;

/**
 * Create a picocolors color kit bound to `enabled`. When `enabled === false`
 * every color method is an identity no-op (returns its input unchanged), so
 * human renderers call color unconditionally and the policy decides whether
 * ANSI codes actually emit. Use the `ColorPolicy` from `resolveColorPolicy`:
 *
 *   const colors = createColor(resolveColorPolicy({ color: true }).enabled);
 *   line(colors.red("conflict"));
 */
export function createColor(enabled: boolean): ColorKit {
	return createColors(enabled);
}
