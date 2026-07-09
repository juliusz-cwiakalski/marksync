// src/app/config-errors.ts
//
// The ajv error formatter (GH-15 F-7 / Phase 4.1). Maps ajv `ErrorObject[]`
// into the domain-owned `ConfigAjvError[]` shape AND builds the AI-readable
// `humanMessage` (field path + expected vs actual + suggested fix — NFR-2 /
// RSK-1 closure).
//
// Application tier: imports ajv (allowed) + the domain `ConfigAjvError` type
// only. This is the ONLY place that imports ajv — the domain tier stays pure
// (GH-15 NFR-3: the `InvalidConfig` arm carries the already-mapped
// `ConfigAjvError[]`, never an ajv `ErrorObject`).
//
// The granularity `commit-by-commit` case gets a dedicated "deferred to a
// future milestone" message (DEC-2 / ADR-0010 C-5 / NFR-5), distinct from a
// plain enum violation.

import type { ErrorObject } from "ajv";
import type { ConfigAjvError } from "#domain/errors";

/**
 * Map ajv's structured errors to the serializable domain shape. `params` is
 * always a plain record so the value can cross the `Result` channel and be
 * JSON-serialized for AI consumption.
 */
export function mapAjvErrors(errors: readonly ErrorObject[]): ConfigAjvError[] {
	return errors.map((e) => ({
		instancePath: e.instancePath,
		schemaPath: e.schemaPath,
		keyword: e.keyword,
		message: e.message ?? "",
		params: e.params as Record<string, unknown>,
	}));
}

/** Convert a JSON pointer (`/sync/granularity`) to a dotted field path (`sync.granularity`). */
function dottedPath(instancePath: string): string {
	if (instancePath === "" || instancePath === "/") return "";
	return instancePath.replace(/^\//, "").split("/").join(".");
}

/** Human label for the offending instance path (`(root)` when empty). */
function fieldLabel(instancePath: string): string {
	return dottedPath(instancePath) || "(root)";
}

/** Short description of the actual data value ajv saw (`verbose: true`). */
function describeData(data: unknown): string {
	if (typeof data === "string") return `string ${JSON.stringify(data)}`;
	if (typeof data === "number") return `number ${data}`;
	if (typeof data === "boolean") return `boolean ${data}`;
	if (data === null) return "null";
	if (Array.isArray(data)) return "array";
	if (typeof data === "object") return "object";
	return typeof data;
}

/** Format a single ajv error as an AI-actionable line. */
function formatOneError(e: ErrorObject): string {
	const field = fieldLabel(e.instancePath);
	const params = e.params as Record<string, unknown>;
	switch (e.keyword) {
		case "required": {
			const missing = String(params.missingProperty ?? "<unknown>");
			return `${field}: missing required field '${missing}'. Suggested fix: add '${missing}' with the expected value.`;
		}
		case "type": {
			const expected = String(params.type ?? "the expected type");
			return `${field}: expected ${expected}, got ${describeData(e.data)}. Suggested fix: set '${field}' to a ${expected} value.`;
		}
		case "enum": {
			const allowed = (params.allowedValues as unknown[] | undefined) ?? [];
			const allowedList = allowed.map((v) => JSON.stringify(v)).join(", ");
			let line = `${field}: must be one of [${allowedList}], got ${describeData(e.data)}. Suggested fix: set '${field}' to one of the allowed values.`;
			// DEC-2 / ADR-0010 C-5 — commit-by-commit is deferred, not merely
			// an unknown value. Call this out explicitly (NFR-5).
			if (e.data === "commit-by-commit") {
				line +=
					" Note: 'commit-by-commit' is deferred to a future milestone (ADR-0010 C-5); use 'squash' for MS-0002.";
			}
			return line;
		}
		case "const": {
			const allowedValue = params.allowedValue;
			return `${field}: must be ${JSON.stringify(allowedValue)}, got ${describeData(e.data)}. Suggested fix: set '${field}' to ${JSON.stringify(allowedValue)}.`;
		}
		case "additionalProperties": {
			const prop = String(params.additionalProperty ?? "<unknown>");
			return `${field}: unknown property '${prop}' is not allowed (marksync.yml v1 disallows extra fields). Suggested fix: remove '${prop}' or correct the field name.`;
		}
		case "minLength": {
			return `${field}: must not be empty (minLength). Suggested fix: provide a non-empty value.`;
		}
		case "minProperties": {
			return `${field}: must contain at least one entry. Suggested fix: add at least one target.`;
		}
		case "uniqueItems": {
			return `${field}: contains duplicate entries (uniqueItems). Suggested fix: remove duplicates.`;
		}
		default:
			return `${field}: ${e.message ?? e.keyword}.`;
	}
}

/**
 * Build the AI-readable `humanMessage` for a schema-validation failure against
 * `fileLabel` (the on-disk artifact name, e.g. `marksync.yml` /
 * `marksync.lock.yml`). Aggregates every violation (ajv runs with
 * `allErrors: true`), each line carrying field path + expected vs actual + a
 * suggested fix (NFR-2). The message is self-contained — an agent can act on it
 * without extra context. Shared by the config and lock loaders.
 */
export function formatAjvErrors(
	errors: readonly ErrorObject[],
	fileLabel: string,
): string {
	if (errors.length === 0) return `invalid ${fileLabel}.`;
	const noun = errors.length === 1 ? "error" : "errors";
	const lines = errors.map((e) => `  - ${formatOneError(e)}`);
	return [
		`${errors.length} validation ${noun} in ${fileLabel}:`,
		...lines,
	].join("\n");
}

/**
 * Build the AI-readable `humanMessage` for a `ConfigError` (GH-15). Thin wrapper
 * over {@link formatAjvErrors} pinned to the config file label.
 */
export function formatConfigErrors(errors: readonly ErrorObject[]): string {
	return formatAjvErrors(errors, "marksync.yml");
}
