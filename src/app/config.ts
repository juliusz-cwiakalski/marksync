// src/app/config.ts
//
// The pure, typed config loader (GH-15 F-3 / F-7 — Phase 4). Reads
// `marksync.yml`, parses it with `yaml` (DEC-1), validates with ajv
// (`allErrors` + `verbose`), applies defaults, and returns a typed
// `Result<ProjectConfig, ConfigError>`.
//
// Purity (NFR-4 / DEC-4): the ONLY I/O inside this loader is reading the single
// `marksync.yml` file. There is no Git/tree access — the Git adapter (E3-S3)
// supplies the path list to `selectFiles`. Expected failures (missing file,
// malformed YAML, schema violation) are channelled through `Result.err`
// (never `throw`); `throw` is reserved for invariant violations
// (typescript.md §"Error handling").
//
// Application tier: imports `domain` only (+ `ajv`/`yaml`/`node:fs` for I/O and
// validation); never `cli`/`infra`. The schema JSON is imported via a relative
// path because the `#domain/*` alias appends `.ts` (JSON cannot go through it);
// this is the documented, single justified deviation from the `#imports`
// convention.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import Ajv from "ajv";
import { parse as parseYaml } from "yaml";
import { formatConfigErrors, mapAjvErrors } from "#app/config-errors";
import type { ConfigAjvError, ConfigError } from "#domain/errors";
import type { ProjectConfig, ProjectConfigInput } from "#domain/config/types";
import { Result } from "#domain/result";
import schema from "../domain/config/schema.json" with { type: "json" };

/**
 * Compiled once (module singleton). `allErrors` collects every violation, not
 * just the first; `verbose` exposes the offending `data` value so the formatter
 * can produce expected-vs-actual messages and detect the deferred
 * `commit-by-commit` granularity (DEC-2 / NFR-5).
 */
const validateConfig = new Ajv({ allErrors: true, verbose: true }).compile(
	schema,
);

/** Build a ConfigError with the given structured entries + AI-readable message. */
function configError(
	path: string,
	ajvErrors: ConfigAjvError[],
	humanMessage: string,
): ConfigError {
	return { kind: "InvalidConfig", path, ajvErrors, humanMessage };
}

/**
 * Load and validate `marksync.yml` from `cwd`.
 *
 * Flow: read → YAML parse → ajv `allErrors` → `applyDefaults`.
 * Returns `Result.ok(ProjectConfig)` on success or `Result.err(ConfigError)`
 * for any expected failure (missing file, malformed YAML, schema violation).
 */
export function loadConfig(cwd: string): Result<ProjectConfig, ConfigError> {
	const configPath = join(cwd, "marksync.yml");

	let rawText: string;
	try {
		rawText = readFileSync(configPath, "utf-8");
	} catch (e) {
		const err = e as NodeJS.ErrnoException;
		if (err.code === "ENOENT") {
			return Result.err(
				configError(
					configPath,
					[],
					`marksync.yml not found at ${configPath}. Suggested fix: run 'marksync init' to create a starter config, or run marksync from the repository root containing marksync.yml.`,
				),
			);
		}
		return Result.err(
			configError(configPath, [], `cannot read ${configPath}: ${err.message}`),
		);
	}

	let parsed: unknown;
	try {
		parsed = parseYaml(rawText);
	} catch (e) {
		const msg = e instanceof Error ? e.message : String(e);
		return Result.err(
			configError(
				configPath,
				[],
				`invalid YAML in ${configPath}: ${msg}. Suggested fix: check indentation, quoting, and that the document is valid YAML.`,
			),
		);
	}

	if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
		const got =
			parsed === null
				? "null"
				: Array.isArray(parsed)
					? "array"
					: typeof parsed;
		return Result.err(
			configError(
				configPath,
				[],
				`marksync.yml must contain a YAML object at the top level (got ${got}). Suggested fix: ensure the root of marksync.yml is a mapping of key: value pairs.`,
			),
		);
	}

	if (!validateConfig(parsed)) {
		const ajvErrors = validateConfig.errors ?? [];
		return Result.err(
			configError(
				configPath,
				mapAjvErrors(ajvErrors),
				formatConfigErrors(ajvErrors),
			),
		);
	}

	return Result.ok(applyDefaults(parsed as unknown as ProjectConfigInput));
}

/**
 * Apply the v1 schema defaults to a validated raw config and return a
 * fully-populated, typed `ProjectConfig`.
 *
 * Defaults live HERE (single TS source of truth) rather than in the JSON Schema
 * to avoid a third source of drift alongside the schema and the types (RSK-3).
 * The schema describes shape/optionality; this function fills values.
 */
export function applyDefaults(input: ProjectConfigInput): ProjectConfig {
	return {
		version: input.version,
		root: input.root,
		select: input.select ?? ["**/*.md"],
		exclude: input.exclude ?? [],
		hierarchy: input.hierarchy ?? "mirror",
		targets: input.targets,
		sync: {
			allowBranches: input.sync?.allowBranches ?? ["main"],
			granularity: input.sync?.granularity ?? "squash",
			stalePlanMinutes: input.sync?.stalePlanMinutes ?? 15,
		},
		render: {
			mermaid: {
				policy: input.render?.mermaid?.policy ?? "render",
				securityLevel: input.render?.mermaid?.securityLevel ?? "strict",
				htmlLabels: input.render?.mermaid?.htmlLabels ?? false,
				deterministicIds: input.render?.mermaid?.deterministicIds ?? true,
			},
		},
		output: {
			format: input.output?.format ?? "storage",
			color: input.output?.color ?? "auto",
		},
		provenance: {
			visiblePanel: input.provenance?.visiblePanel ?? true,
		},
	};
}
