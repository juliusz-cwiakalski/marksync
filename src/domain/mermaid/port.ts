// Mermaid renderer port — the adapter-agnostic contract every renderer
// backend implements (ADR-0002 rung 6 public Kroki; mmdc deferred per DEC-5).

import type { Artifact } from "#domain/target/port";
import type { MermaidRenderConfig } from "#domain/config/types";
import type { MarkSyncError } from "#domain/errors";
import type { Result } from "#domain/result";

/**
 * Renders a mermaid diagram source string into an SVG artifact.
 * Implementations live in the infra tier (e.g. {@linkcode KrokiClient}); the
 * domain transform depends on this port, never on a concrete adapter.
 */
export interface Renderer {
	render(
		source: string,
		config: MermaidRenderConfig,
	): Promise<Result<Artifact, MarkSyncError>>;
}
