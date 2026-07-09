// tests/_helpers/assert-well-formed-xml.ts
//
// A small assertion-only XML well-formedness checker (PD-4). Lives under tests/
// (test-tier — excluded from tsc --rootDir src and depcruise src); no production
// import. Independence from the converter is proven by the negative-test suite
// in tests/unit/_helpers/assert-well-formed-xml.test.ts, which exercises every
// malformed shape BEFORE the checker ever validates converter output.

export interface WellFormedOptions {
	/** Tag names that the renderer emits self-closing even without a slash (none by default). */
	knownVoidTags?: readonly string[];
}

/**
 * Assert `body` is well-formed XML: balanced tags, valid entities, terminated
 * CDATA/comments, no raw `<`/`&` outside valid contexts. Namespaced
 * (`ac:`/`ri:`) and self-closing tags are recognized. Throws on any violation.
 */
export function assertWellFormedXml(
	body: string,
	options: WellFormedOptions = {},
): void {
	const voidTags = new Set(options.knownVoidTags ?? []);
	const stack: string[] = [];
	const n = body.length;
	let i = 0;
	while (i < n) {
		const c = body[i];
		if (c === "<") {
			i = handleAngle(body, i, stack, voidTags);
			continue;
		}
		if (c === "&") {
			i = handleEntity(body, i);
			continue;
		}
		i++;
	}
	if (stack.length > 0) {
		throw new Error(`unclosed tag(s): ${stack.join(", ")}`);
	}
}

function handleAngle(
	body: string,
	i: number,
	stack: string[],
	voidTags: Set<string>,
): number {
	if (body.startsWith("<!--", i))
		return skipUntil(body, i + 4, "-->", "unterminated comment");
	if (body.startsWith("<![CDATA[", i))
		return skipUntil(body, i + 9, "]]>", "unterminated CDATA");
	if (body.startsWith("<!", i) || body.startsWith("<?", i))
		return skipUntil(body, i, ">", "unterminated declaration");

	if (body[i + 1] === "/") {
		const end = body.indexOf(">", i);
		if (end === -1) throw new Error("unterminated close tag");
		const name = body.slice(i + 2, end).trim();
		const top = stack.pop();
		if (top !== name) {
			const expected = top ?? "(none)";
			throw new Error(
				`mismatched close tag: expected </${expected}>, got </${name}>`,
			);
		}
		return end + 1;
	}

	// Opening tag: scan to its closing '>' respecting attribute-value quotes.
	let j = i + 1;
	let quote: string | null = null;
	while (j < body.length) {
		const cj = body[j];
		if (quote !== null) {
			if (cj === quote) quote = null;
		} else if (cj === '"' || cj === "'") quote = cj;
		else if (cj === ">") break;
		j++;
	}
	if (j >= body.length) throw new Error("unterminated open tag");
	const inner = body.slice(i + 1, j);
	const selfClosing = inner.endsWith("/");
	const tagBody = selfClosing ? inner.slice(0, -1) : inner;
	const match = tagBody.match(/^([a-zA-Z_][\w:.-]*)/);
	if (!match) throw new Error(`malformed start tag: <${inner}>`);
	const name = match[1];
	if (!selfClosing && !voidTags.has(name)) stack.push(name);
	return j + 1;
}

/** Validate an `&…;` entity at position `i`; return the index past the `;`. */
function handleEntity(body: string, i: number): number {
	const semi = body.indexOf(";", i);
	if (semi === -1) throw new Error("unterminated entity reference");
	const ent = body.slice(i + 1, semi);
	const valid =
		/^#[0-9]+$/.test(ent) ||
		/^#x[0-9a-fA-F]+$/.test(ent) ||
		/^[a-zA-Z][a-zA-Z0-9]*$/.test(ent);
	if (!valid) throw new Error(`invalid entity reference: &${ent};`);
	return semi + 1;
}

/** Advance past `marker` starting the search at `from`; throw if not found. */
function skipUntil(
	body: string,
	from: number,
	marker: string,
	err: string,
): number {
	const at = body.indexOf(marker, from);
	if (at === -1) throw new Error(err);
	return at + marker.length;
}
