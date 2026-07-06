/**
 * ============================================================================
 *  GH-11 / MS2-E1-S1 — Deterministic SVG normalizer (reusable, pure).
 *  MS2-E4-S1 / the golden-test tier may lift this VERBATIM (spec G-8, DEC-2,
 *  RSK-1 mitigation). The NORMALIZED — not raw — bytes are what byte-stability
 *  is asserted against (mermaid may emit instance-specific ids even with
 *  deterministicIds:true).
 * ============================================================================
 *
 *  NORMALIZATION RULES (applied IN THIS ORDER — test-plan §5.3):
 *
 *  1. XML comments stripped — remove all `<!-- ... -->` (version/build comments
 *     that can drift across runs).
 *  2. Attributes sorted deterministically per element — sort each element's
 *     attributes by a stable key (attribute name; value as a secondary key) so
 *     attribute-order variation never affects the digest.
 *  3. Ephemeral / instance-specific IDs dropped or rewritten deterministically —
 *     collect every `id="..."` in document order and rewrite it to a stable
 *     sequence (`eid0`, `eid1`, …), updating every reference (`url(#…)`,
 *     `href="#…"`, `xlink:href="#…"`) to match. This neutralizes mermaid's
 *     `<base>-<n>` sequence ids, clip-path ids, marker ids, drop-shadow filter
 *     ids, etc., including the render-id prefix embedded throughout the output.
 *  4. Whitespace canonicalization — collapse runs of whitespace, drop whitespace
 *     between adjacent tags (`> <` → `><`), and trim, so insignificant
 *     whitespace variation never affects the digest.
 *  5. Font / system metadata normalized or stripped — canonicalize every
 *     `font-family:…` / `font-family="…"` declaration to a single fixed token,
 *     and strip any renderer version/build strings, timestamps, or
 *     locale-dependent metadata if present. ALSO strips time-dependent layout
 *     markers — notably the gantt `today` line (`<g class="today">…</g>` and
 *     any `class="today"` element), whose coordinates are a function of the
 *     current date/time and therefore drift ACROSS runs even though the
 *     within-run N=5 output is byte-identical. Stripping it from the NORMALIZED
 *     (digest) form does not alter the rendered SVG the user sees — it only
 *     removes an ephemeral time-dependent marker so the golden/digest is
 *     reproducible. (Observed in the spike: x1 drifted −27937 → −27938 between
 *     two runs minutes apart.)
 *
 *  NON-GOAL: normalization is for DIGEST STABILITY, not for altering rendered
 *  semantics. The persisted `fixtures/<name>.expected.svg` is the normalized
 *  form. The function is pure (no side effects, no I/O, no global state).
 * ============================================================================
 */

/** Sort the attributes of a single element tag string deterministically. */
function sortTagAttributes(tag: string): string {
  // tag looks like: <g class="x" id="y">  or  <rect width="1"/>
  const match = /^<(?<name>[a-zA-Z][\w:-]*)(?<rest>.*?)(?<selfclose>\/?)>$/.exec(
    tag,
  );
  if (!match || !match.groups) return tag;
  const { name, rest, selfclose } = match.groups;
  if (rest.trim() === "") return `<${name}${selfclose}>`;
  // Split attributes. Attribute values may not contain a raw `>`.
  const attrRegex = /([\w:-]+)\s*=\s*"([^"]*)"/g;
  const attrs: Array<{ n: string; v: string }> = [];
  let am: RegExpExecArray | null;
  while ((am = attrRegex.exec(rest)) !== null) {
    attrs.push({ n: am[1], v: am[2] });
  }
  attrs.sort((a, b) =>
    a.n === b.n ? a.v < b.v ? -1 : a.v > b.v ? 1 : 0 : a.n < b.n ? -1 : 1,
  );
  const reconcat = attrs.map((a) => `${a.n}="${a.v}"`).join(" ");
  return `<${name}${reconcat ? " " + reconcat : ""}${selfclose}>`;
}

/**
 * Normalize a raw Mermaid SVG string to a canonical, byte-stable form.
 * Pure: same input → same output, no side effects.
 */
export function normalizeSvg(rawSvg: string): string {
  let s = rawSvg;

  // --- Rule 1: XML comments stripped ---
  s = s.replace(/<!--[\s\S]*?-->/g, "");

  // --- Rule 2: attributes sorted deterministically per element ---
  //   Operate only on element tags `<name ...>`. `<style>` content (CSS) has no
  //   `<` so it is untouched by this regex.
  s = s.replace(/<[a-zA-Z][\w:-]*(?:[^>]*[^>/])?>/g, (tag) =>
    sortTagAttributes(tag),
  );

  // --- Rule 3: ephemeral / instance-specific ids rewritten deterministically ---
  const idMatches = [...s.matchAll(/\bid="([^"]+)"/g)];
  const idOrder: string[] = [];
  const idMap = new Map<string, string>();
  for (const m of idMatches) {
    const original = m[1];
    if (!idMap.has(original)) {
      idMap.set(original, `eid${idOrder.length}`);
      idOrder.push(original);
    }
  }
  if (idOrder.length > 0) {
    // Sort originals longest-first so shorter ids that are substrings of longer
    // ones are not accidentally rewritten first (e.g. "fc" vs "fc-drop-shadow").
    const byLongest = [...idOrder].sort((a, b) => b.length - a.length);
    // Rewrite id="..." declarations first (document order → stable eidN).
    s = s.replace(/\bid="([^"]+)"/g, (_full, original: string) =>
      `id="${idMap.get(original) ?? original}"`,
    );
    // Rewrite references: url(#x), href="#x", xlink:href="#x".
    for (const original of byLongest) {
      const replacement = idMap.get(original)!;
      const esc = original.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      s = s.replace(new RegExp(`url\\(#${esc}\\)`, "g"), `url(#${replacement})`);
      s = s.replace(new RegExp(`href="#${esc}"`, "g"), `href="#${replacement}"`);
    }
  }

  // --- Rule 4: whitespace canonicalization ---
  //   Collapse runs of whitespace to a single space; drop inter-tag whitespace;
  //   strip leading/trailing whitespace.
  s = s.replace(/\s+/g, " ").replace(/>\s+</g, "><").trim();

  // --- Rule 5: font / system metadata normalized or stripped ---
  //   Canonicalize every font-family declaration (in CSS and as an attribute)
  //   to a single fixed token so font-policy / fallback-chain drift never
  //   affects the digest.
  s = s.replace(/font-family\s*:\s*[^;"'}]+/gi, "font-family:NORM");
  s = s.replace(/font-family\s*=\s*"[^"]*"/gi, 'font-family="NORM"');
  //   Strip any embedded renderer version / build / timestamp markers if present.
  s = s.replace(/data-mermaid-version="[^"]*"/gi, "");
  s = s.replace(/\b20\d{2}-\d{2}-\d{2}T[\d:.Z+-]+/g, "TS"); // ISO timestamps
  //   Strip time-dependent gantt markers: the `<g class="today">…</g>` group
  //   (whose inner `<line class="today" x1=… x2=…>` coordinates are a function
  //   of the current date/time and drift ACROSS runs). Non-greedy to the first
  //   `</g>` — safe because mermaid's today group contains only a `<line>`, no
  //   nested `<g>`. Operates AFTER Rule 2 (attr sort) so `class="today"` is in
  //   a stable position and AFTER Rule 4 (whitespace) so the block is compact.
  s = s.replace(/<g class="[^"]*today[^"]*">[\s\S]*?<\/g>/g, "");
  //   Defensive: strip any remaining standalone element whose class is EXACTLY
  //   "today" (e.g. a stray `<line class="today" ...>`). Restricted to the exact
  //   token so it does NOT over-match unrelated classes like `class="today-
  //   special"`; the load-bearing gantt `<g class="today">` group is already
  //   removed by the regex above. (Lift verbatim for MS2-E4-S1; revisit only if a
  //   future Mermaid emits a variant today-marker form.)
  s = s.replace(/<[^>]*class="today"[^>]*>(<\/[^>]*>)?/g, "");
  //   Final inter-tag tidy after the above substitutions.
  s = s.replace(/>\s+</g, "><").trim();

  return s;
}
