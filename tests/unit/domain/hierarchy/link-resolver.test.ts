import { describe, test, expect } from "bun:test";
import { resolveLink } from "#domain/hierarchy/link-resolver";

describe("cross-page link resolver", () => {
	const bindings = {
		"doc-b.md": { id: "123", title: "Doc B" },
		"docs/doc-c.md": { id: "456", title: "Doc C" },
	};

	test("resolves same-directory .md link", () => {
		const result = resolveLink("doc-a.md", "doc-b.md", bindings);
		expect(result.ok).toBe(true);
		if (!result.ok) return;

		expect(result.value).toEqual({ id: "123", title: "Doc B" });
	});

	test("resolves sub-directory relative .md link", () => {
		const result = resolveLink("docs/sub/x.md", "../doc-c.md", bindings);
		expect(result.ok).toBe(true);
		if (!result.ok) return;

		expect(result.value).toEqual({ id: "456", title: "Doc C" });
	});

	test("resolves absolute path .md link", () => {
		const result = resolveLink("doc-a.md", "/docs/doc-c.md", bindings);
		expect(result.ok).toBe(true);
		if (!result.ok) return;

		expect(result.value).toEqual({ id: "456", title: "Doc C" });
	});

	test("returns error for unresolvable .md link", () => {
		const result = resolveLink("doc-a.md", "missing-doc.md", bindings);
		expect(result.ok).toBe(false);

		if (!result.ok) {
			expect(result.error).toEqual({
				kind: "UnresolvedLink",
				sourcePath: "doc-a.md",
				target: "missing-doc.md",
			});
		}
	});

	test("passes through external http link", () => {
		const result = resolveLink("doc-a.md", "https://example.com", bindings);
		expect(result.ok).toBe(true);
		if (!result.ok) return;

		expect(result.value).toBe("https://example.com");
	});

	test("passes through external https link", () => {
		const result = resolveLink("doc-a.md", "https://example.com", bindings);
		expect(result.ok).toBe(true);
		if (!result.ok) return;

		expect(result.value).toBe("https://example.com");
	});

	test("passes through mailto link", () => {
		const result = resolveLink("doc-a.md", "mailto:user@example.com", bindings);
		expect(result.ok).toBe(true);
		if (!result.ok) return;

		expect(result.value).toBe("mailto:user@example.com");
	});

	test("passes through anchor-only link", () => {
		const result = resolveLink("doc-a.md", "#section", bindings);
		expect(result.ok).toBe(true);
		if (!result.ok) return;

		expect(result.value).toBe("#section");
	});

	test("passes through non-.md file link", () => {
		const result = resolveLink("doc-a.md", "image.png", bindings);
		expect(result.ok).toBe(true);
		if (!result.ok) return;

		expect(result.value).toBe("image.png");
	});

	test("normalizes .. references correctly", () => {
		const result = resolveLink(
			"docs/sub/deep/x.md",
			"../../doc-c.md",
			bindings,
		);
		expect(result.ok).toBe(true); // docs/doc-c.md is in bindings
		if (!result.ok) return;

		expect(result.value).toEqual({ id: "456", title: "Doc C" });
	});

	test("handles . and current directory references", () => {
		const result = resolveLink("doc-a.md", "./doc-b.md", bindings);
		expect(result.ok).toBe(true);
		if (!result.ok) return;

		expect(result.value).toEqual({ id: "123", title: "Doc B" });
	});
});
