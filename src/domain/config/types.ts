// src/domain/config/types.ts
//
// TypeScript mirror of `schema.json` (GH-15 F-2 / blueprint §4). Hand-mirrored
// for v1 (schema→TS code-gen deferred per spec OQ-1); kept in lock-step with
// the schema via the joint valid/invalid unit tests in
// `tests/unit/domain/config/schema.test.ts` (RSK-3 mitigation).
//
// Two flavours:
//   - `ProjectConfig` — the FULLY-populated, defaults-applied config returned
//     by `loadConfig` on success (every field present). This is what every
//     use-case consumes downstream.
//   - `ProjectConfigInput` — the raw shape ajv validates BEFORE defaults are
//     applied (`version`/`root`/`targets` required, the rest optional). Used
//     only at the loader boundary by `applyDefaults`.
//
// Domain tier: imports nothing tiered and no validator (typescript.md tier
// rules / GH-15 NFR-3). Strict-mode safe (`exactOptionalPropertyTypes`: the
// `?` optionals below mean "may be absent", never "present as undefined").

/** Page-tree shape computed from selected files under `root` (F-6). */
export type HierarchyMode = "mirror" | "flat";

/**
 * Sync history granularity. MS-0002 accepts ONLY `squash`; `commit-by-commit`
 * is explicitly deferred (ADR-0010 C-5 / DEC-2 / NFR-5). Single-member literal
 * union for v1.
 */
export type SyncGranularity = "squash";

/** Mermaid render policy. */
export type MermaidPolicy = "render" | "skip";

/** Mermaid security level (mirrors the official Mermaid option). */
export type MermaidSecurityLevel = "strict" | "loose" | "sandbox";

/** Page body representation. Storage Format is the MS-0002 write target (ADR-0005). */
export type OutputFormat = "storage";

/** CLI color output mode. */
export type OutputColor = "auto" | "always" | "never";

/** Per-target system shape within the `targets` map (DM-2). */
export interface TargetConfig {
	type: "confluence";
	spaceKey: string;
	parentPageId: string;
}

/** Sync options (DM: consumed by push-flow / plan / E3-S2/E3-S7). */
export interface SyncConfig {
	allowBranches: string[];
	granularity: SyncGranularity;
	stalePlanMinutes: number;
}

/** Mermaid render options (ADR-0002). */
export interface MermaidRenderConfig {
	policy: MermaidPolicy;
	securityLevel: MermaidSecurityLevel;
	htmlLabels: boolean;
	deterministicIds: boolean;
}

export interface RenderConfig {
	mermaid: MermaidRenderConfig;
}

export interface OutputConfig {
	format: OutputFormat;
	color: OutputColor;
}

export interface ProvenanceConfig {
	visiblePanel: boolean;
}

/**
 * The fully-typed, defaults-applied configuration returned by `loadConfig`
 * (DM-1). Every field is present after `applyDefaults` runs.
 */
export interface ProjectConfig {
	version: number;
	root: string;
	select: string[];
	exclude: string[];
	hierarchy: HierarchyMode;
	targets: Record<string, TargetConfig>;
	sync: SyncConfig;
	render: RenderConfig;
	output: OutputConfig;
	provenance: ProvenanceConfig;
}

/**
 * Raw shape ajv validates (before defaults). Only the schema-required fields
 * (`version`, `root`, `targets`) are mandatory; all defaulted fields are
 * optional. `applyDefaults(input: ProjectConfigInput): ProjectConfig` fills the
 * rest. `exactOptionalPropertyTypes`-safe: optionals are "absent", not
 * `undefined`.
 */
export interface ProjectConfigInput {
	version: number;
	root: string;
	select?: string[];
	exclude?: string[];
	hierarchy?: HierarchyMode;
	targets: Record<string, TargetConfig>;
	sync?: {
		allowBranches?: string[];
		granularity?: SyncGranularity;
		stalePlanMinutes?: number;
	};
	render?: {
		mermaid?: {
			policy?: MermaidPolicy;
			securityLevel?: MermaidSecurityLevel;
			htmlLabels?: boolean;
			deterministicIds?: boolean;
		};
	};
	output?: {
		format?: OutputFormat;
		color?: OutputColor;
	};
	provenance?: {
		visiblePanel?: boolean;
	};
}

// --- Intended hierarchy result types (F-6) ---------------------------------

/**
 * One selected file mapped to its intended Confluence parent path. The parent
 * is a repo-relative directory path (with trailing slash); resolution to a real
 * Confluence page id happens at sync time (E3-S4/E3-S6 — NG-2).
 */
export interface IntendedNode {
	/** Repo-relative source file path. */
	filePath: string;
	/** Intended parent directory path (repo-relative, trailing slash). */
	intendedParent: string;
}

/**
 * The intended page-tree shape computed from selected files under `root`
 * (F-6 / Phase 7). Structure only — no Confluence page ids are resolved.
 */
export interface IntendedHierarchy {
	/** The hierarchy mode used to derive parents. */
	mode: HierarchyMode;
	/** One node per selected file, in input order. */
	nodes: IntendedNode[];
}
