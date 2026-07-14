// SVG normalizer — strip non-deterministic elements for stable digests
// (feature-mermaid-rendering.md §3.3; DEC-5).

/**
 * Sort the attributes of a single element tag string deterministically.
 */
function sortTagAttributes(tag: string): string {
	const match =
		/^<(?<name>[a-zA-Z][\w:-]*)(?<rest>.*?)(?<selfclose>\/?)>$/.exec(tag);
	if (!match?.groups) return tag;
	const { name, rest, selfclose } = match.groups;
	if (!rest) return `<${name}${selfclose}>`;
	if (rest.trim() === "") return `<${name}${selfclose}>`;
	const attrRegex = /([\w:-]+)\s*=\s*"([^"]*)"/g;
	const attrs: Array<{ n: string; v: string }> = [];
	let am: RegExpExecArray | null;
	// biome-ignore lint/suspicious/noAssignInExpressions: regex.exec loop pattern
	while ((am = attrRegex.exec(rest)) !== null) {
		const n = am[1];
		const v = am[2];
		if (n && v) attrs.push({ n, v });
	}
	attrs.sort((a, b) => {
		if (a.n === b.n) {
			if (a.v < b.v) return -1;
			if (a.v > b.v) return 1;
			return 0;
		}
		return a.n < b.n ? -1 : 1;
	});
	const reconcat = attrs.map((a) => `${a.n}="${a.v}"`).join(" ");
	return `<${name}${reconcat ? ` ${reconcat}` : ""}${selfclose}>`;
}

/**
 * Normalize a raw Mermaid SVG string to a canonical, byte-stable form.
 * Pure: same input → same output, no side effects.
 *
 * Normalization rules (§3.3, applied in order):
 * 1. Strip XML comments
 * 2. Sort attributes per element
 * 3. Rewrite ephemeral IDs to stable sequence (eid0, eid1, …)
 * 4. Canonicalize whitespace
 * 5. Normalize font metadata and strip time-dependent gantt today-line
 */
export function normalizeSvg(rawSvg: string): string {
	let s = rawSvg;

	// Rule 1: XML comments stripped
	s = s.replace(/<!--[\s\S]*?-->/g, "");

	// Rule 2: attributes sorted deterministically per element
	s = s.replace(/<[a-zA-Z][\w:-]*[^>]*>/g, (tag) => sortTagAttributes(tag));

	// Rule 3: ephemeral / instance-specific ids rewritten deterministically
	const idMatches = [...s.matchAll(/\bid="([^"]+)"/g)];
	const idOrder: string[] = [];
	const idMap = new Map<string, string>();
	for (const m of idMatches) {
		const original = m[1];
		if (original && !idMap.has(original)) {
			idMap.set(original, `eid${idOrder.length}`);
			idOrder.push(original);
		}
	}
	if (idOrder.length > 0) {
		const byLongest = [...idOrder].sort((a, b) => b.length - a.length);
		s = s.replace(
			/\bid="([^"]+)"/g,
			(_full, original: string) => `id="${idMap.get(original) ?? original}"`,
		);
		for (const original of byLongest) {
			const replacement = idMap.get(original);
			if (!replacement) continue;
			const esc = original.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
			s = s.replace(
				new RegExp(`url\\(#${esc}\\)`, "g"),
				`url(#${replacement})`,
			);
			s = s.replace(new RegExp(`href="#${esc}"`, "g"), `href="#${replacement}`);
		}
	}

	// Rule 4: whitespace canonicalization
	s = s.replace(/\s+/g, " ").replace(/>\s+</g, "><").trim();

	// Rule 5: font / system metadata normalized or stripped
	s = s.replace(/font-family\s*:\s*[^;"'}]+/gi, "font-family:NORM");
	s = s.replace(/font-family\s*=\s*"[^"]*"/gi, 'font-family="NORM"');
	s = s.replace(/data-mermaid-version="[^"]*"/gi, "");
	s = s.replace(/\b20\d{2}-\d{2}-\d{2}T[\d:.Z+-]+/g, "TS");
	s = s.replace(/<g class="[^"]*today[^"]*">[\s\S]*?<\/g>/g, "");
	s = s.replace(/<[^>]*class="today"[^>]*>(<\/[^>]*>)?/g, "");
	s = s.replace(/>\s+</g, "><").trim();

	return s;
}
