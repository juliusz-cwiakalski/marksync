// src/cli/output/json.ts
//
// JSON + NDJSON renderers for the `CommandResult<T>` envelope (GH-16 D-2 /
// F-2 / F-8 / DEC-2 / DEC-4 / RSK-4 / ADR-0011 C-1 + C-4). The renderer is
// GENERIC: it serializes any `CommandResult<T>` with zero per-command code
// (C-1), so adding a command never touches this file (AC-5 / C-3).
//
// DEC-2 (CEO Q1 / blueprint §9): the JSON WIRE format is snake_case. The
// TypeScript type stays idiomatic camelCase; THIS RENDERER owns the
// camelCase→snake_case key conversion — `schemaVersion`→`schema_version`,
// `runId`→`run_id`, `exitCode`→`exit_code`, `timing.startedAt`→`started_at`,
// `timing.durationMs`→`duration_ms` (and recursively for any `data` keys so the
// whole payload is consistently snake_case).
//
// RSK-4 / C-4 — contract stability: `renderJson` produces STABLE key order
// (every object's keys sorted alphabetically) so the golden snapshot is
// deterministic across runs and PR diffs stay reviewable. The schema version is
// pinned by `CommandResult.schemaVersion` (constant 1).
//
// Tier rule: presentation output. Imports only a sibling output module
// (`./command-result`, type-only) — no `#domain/*` / `#infra/*` (DEC-1 /
// dep-cruiser). Redaction is NOT applied here — the OutputService chokepoint
// (Phase 4 `index.ts`) redacts the SERIALIZED string per DEC-4 (INV-SEC-1).

import type { CommandResult } from "./command-result";

/**
 * Convert a camelCase identifier to snake_case. Single-word and already-
 * snake_case identifiers pass through unchanged (idempotent). Handles the
 * envelope fields: `schemaVersion`, `runId`, `exitCode`, `startedAt`,
 * `durationMs` → snake_case.
 */
function toSnakeCase(key: string): string {
	return key.replace(/([a-z0-9])([A-Z])/g, "$1_$2").toLowerCase();
}

/**
 * Recursively produce a canonical copy of `value` with every object key
 * converted to snake_case and sorted alphabetically (stable key order). Arrays
 * and primitives pass through structurally. Returns a fresh tree so the input
 * `CommandResult` is never mutated.
 */
function toStableSnakeCase(value: unknown): unknown {
	if (Array.isArray(value)) {
		return value.map(toStableSnakeCase);
	}
	if (value !== null && typeof value === "object") {
		const obj = value as Record<string, unknown>;
		const entries = Object.keys(obj)
			.sort()
			.map((k) => [toSnakeCase(k), toStableSnakeCase(obj[k])] as const);
		return Object.fromEntries(entries);
	}
	return value;
}

/**
 * Render a `CommandResult<T>` as a deterministic JSON string (DEC-2 snake_case
 * keys + stable alphabetical key order, RSK-4). Deterministic: two structurally
 * equal results serialize to byte-identical output regardless of insertion
 * order, so the golden snapshot (C-4) and PR diffs are stable. Redaction of the
 * serialized string is the OutputService's job (DEC-4).
 */
export function renderJson(result: CommandResult<unknown>): string {
	return JSON.stringify(toStableSnakeCase(result));
}

/**
 * Render one or more `CommandResult`s as newline-delimited JSON (one JSON
 * object per line) for future streaming use (e.g. `sync --watch`, post-MS-0002 —
 * Out of Scope here; the renderer is wired but no watch command exists yet).
 * Each line is independently `renderJson`-stable. Accepts a single result or an
 * array for ergonomics.
 */
export function renderNdjson(
	results: CommandResult<unknown> | CommandResult<unknown>[],
): string {
	const arr = Array.isArray(results) ? results : [results];
	return arr.map(renderJson).join("\n");
}
