import { describe, test, expect } from "bun:test";
import { assetFilename } from "#domain/assets/naming";
import { attachmentFilename } from "#infra/confluence/attachments";

describe("domain assets naming", () => {
	const hash = "a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0u1v2w3x4y5z6";

	test("PNG image → correct extension and marksync-asset- prefix", () => {
		const result = assetFilename({ hash, mime: "image/png" });
		expect(result).toBe(`marksync-asset-${hash}.png`);
	});

	test("JPEG image → .jpg extension", () => {
		const result = assetFilename({ hash, mime: "image/jpeg" });
		expect(result).toBe(`marksync-asset-${hash}.jpg`);
	});

	test("GIF image → .gif extension", () => {
		const result = assetFilename({ hash, mime: "image/gif" });
		expect(result).toBe(`marksync-asset-${hash}.gif`);
	});

	test("SVG image → .svg extension with marksync-asset- prefix", () => {
		const result = assetFilename({ hash, mime: "image/svg+xml" });
		expect(result).toBe(`marksync-asset-${hash}.svg`);
	});

	test("WebP image → .webp extension", () => {
		const result = assetFilename({ hash, mime: "image/webp" });
		expect(result).toBe(`marksync-asset-${hash}.webp`);
	});

	test("Unknown MIME → .bin extension", () => {
		const result = assetFilename({ hash, mime: "application/octet-stream" });
		expect(result).toBe(`marksync-asset-${hash}.bin`);
	});

	test("TC-UNIT-010 naming-agreement invariant: domain === infra for non-SVG", () => {
		// For each non-SVG MIME, assetFilename must agree with attachmentFilename
		const bytes = new Uint8Array([1, 2, 3, 4]);
		const nonSvgMimes = ["image/png", "image/jpeg", "image/gif", "image/webp"];

		for (const mime of nonSvgMimes) {
			const domainName = assetFilename({ hash, mime });
			const infraName = attachmentFilename({ bytes, mime, hash });
			expect(domainName).toBe(infraName);
		}
	});

	test("TC-UNIT-010 SVG: domain uses marksync-asset-, infra uses marksync-mermaid-", () => {
		// SVG has documented divergence: domain = marksync-asset- for user-authored images,
		// infra = marksync-mermaid- reserved for E4-S1 (mermaid manager)
		const bytes = new Uint8Array([1, 2, 3, 4]);
		const domainName = assetFilename({ hash, mime: "image/svg+xml" });
		const infraName = attachmentFilename({
			bytes,
			mime: "image/svg+xml",
			hash,
		});

		// Domain uses marksync-asset- prefix
		expect(domainName).toBe(`marksync-asset-${hash}.svg`);
		// Infra uses marksync-mermaid- prefix (reserved for mermaid diagrams)
		expect(infraName).toBe(`marksync-mermaid-${hash}.svg`);
		// They differ (documented divergence)
		expect(domainName).not.toBe(infraName);
	});
});
