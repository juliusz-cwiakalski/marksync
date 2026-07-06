/**
 * GH-11 / MS2-E1-S1 — Mermaid headless-render spike: shared render entrypoint.
 *
 * DESIGN (load-bearing — C-SPIKE-3, no mocking):
 *   1. The happy-dom global registrant is registered BEFORE the `mermaid` module is
 *      imported. Mermaid probes `window`/`document` at import time, so the DOM MUST be
 *      present first. ESM static imports are hoisted, so mermaid is imported DYNAMICLY
 *      (await import) only after `GlobalRegistrator.register()` has run.
 *   2. Mermaid is initialized EXACTLY ONCE with the safe ADR-0002 config.
 *
 * SAFE CONFIG (ADR-0002 Security Requirements):
 *   - startOnLoad: false        — we render explicitly, never on DOM scan.
 *   - securityLevel: "strict"   — encodes HTML, disables click; safe default.
 *   - htmlLabels: false         — no raw HTML in labels (defense in depth).
 *   - deterministicIds: true    — request stable element ids (normalizer is the backup).
 *   - fontFamily: "<fixed policy>" — see FIXED_FONT_FAMILY below; part of the
 *     ADR-0002 content-hash input (marksync-mermaid-render-v1 + ... + font_policy).
 *
 * MERMAID 11.x API used:
 *   - render(id, text) -> { svg, bindFunctions }   (RenderResult)
 *   - mermaidAPI.getConfig()                       (read back the ACTIVE config —
 *                                                   confirms "strict" was not silently
 *                                                   overridden; used by the security probe)
 *
 * No mocking anywhere: the REAL mermaid.render() runs against the REAL happy-dom global.
 */
import { GlobalRegistrator } from "@happy-dom/global-registrator";

/**
 * The fixed font policy for this spike. Part of the ADR-0002 content-hash input.
 * Chosen to be OS-agnostic (a CSS generic family) so the same logical hash input is
 * reproducible across OSes; downstream E4-S1 may pin a concrete bundled font instead.
 */
export const FIXED_FONT_FAMILY = "sans-serif";

/** The safe ADR-0002 Mermaid config object (immutable). */
export const SAFE_CONFIG = {
  startOnLoad: false,
  securityLevel: "strict" as const,
  htmlLabels: false,
  deterministicIds: true,
  fontFamily: FIXED_FONT_FAMILY,
};

export type Mermaid = typeof import("mermaid")["default"];

/** Resolves to the initialized mermaid instance (initialized exactly once). */
const mermaidPromise: Promise<Mermaid> = (async () => {
  // 1) Register the REAL happy-dom global BEFORE mermaid sees window/document.
  GlobalRegistrator.register();
  // 2) DYNAMICALLY import mermaid so its module top-level runs post-registration.
  const mod = await import("mermaid");
  const mermaid = mod.default;
  // 3) Initialize exactly once with the safe config.
  mermaid.initialize(SAFE_CONFIG);
  return mermaid;
})();

/**
 * Ensure mermaid is initialized and return the instance. Shared by every probe.
 */
export async function getMermaid(): Promise<Mermaid> {
  return mermaidPromise;
}

/**
 * Read back the ACTIVE mermaid config (confirms the safe config was accepted, not
 * silently overridden). Uses mermaidAPI.getConfig() — the typed 11.x accessor.
 */
export async function getActiveConfig() {
  const mermaid = await getMermaid();
  return mermaid.mermaidAPI.getConfig();
}

/**
 * Render a Mermaid source string to an SVG string using the REAL mermaid.render()
 * against the REAL happy-dom global. No mocking (C-SPIKE-3).
 *
 * @param source Mermaid diagram source (e.g. contents of a .mmd fixture).
 * @param id     The id passed to mermaid.render(id, source). Mermaid uses it to
 *               derive element ids (the normalizer rewrites these deterministically).
 * @returns The raw SVG string.
 */
export async function render(source: string, id: string): Promise<string> {
  const mermaid = await getMermaid();
  // mermaid.render(id, text) -> RenderResult { svg, bindFunctions }
  const result = await mermaid.render(id, source);
  return result.svg;
}

// --- Smoke entrypoint: `bun run render` ---------------------------------
if (import.meta.main) {
  const mermaid = await getMermaid();
  const cfg = mermaid.mermaidAPI.getConfig();
  const smoke = `graph TD
    A[Smoke] --> B[Check]`;
  const { svg } = await mermaid.render("spike-smoke", smoke);
  const bunVersion = typeof Bun !== "undefined" ? Bun.version : "unknown";
  console.log(JSON.stringify(
    {
      ok: true,
      runtime: "bun",
      bunVersion,
      mermaidInitialized: true,
      activeSecurityLevel: cfg.securityLevel,
      htmlLabels: cfg.htmlLabels,
      deterministicIds: cfg.deterministicIds,
      fontFamily: cfg.fontFamily,
      smokeSvgLength: svg.length,
    },
    null,
    2,
  ));
}
