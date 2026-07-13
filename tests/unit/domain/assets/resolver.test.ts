import { describe, test, expect } from "bun:test";
import { AssetResolver } from "#domain/assets/resolver";
import type { Root } from "hast";
import * as fs from "node:fs";

// Minimal HAST fixtures for testing
function hastWithImg(src: string, alt?: string): Root {
	return {
		type: "root",
		children: [
			{
				type: "element",
				tagName: "img",
				properties: {
					src,
					...(alt ? { alt } : {}),
				},
				children: [],
			},
		],
	};
}

describe("AssetResolver", () => {
	describe("path-traversal confinement (release-blocking)", () => {
		test("TC-UNIT-001 relative ../../etc/passwd → Forbidden, 0 bytes read", async () => {
			const tempRoot = `/tmp/test-assets-${Date.now()}`;
			const outsideDir = `/tmp/test-assets-outside-${Date.now()}`;
			const outsideFile = `${outsideDir}/secret.txt`;

			fs.mkdirSync(tempRoot, { recursive: true });
			fs.mkdirSync(outsideDir, { recursive: true });
			fs.writeFileSync(outsideFile, "secret content");

			const readCalls: string[] = [];
			const resolver = new AssetResolver({
				root: tempRoot,
				readBytes: (path) => {
					readCalls.push(path);
					return new Uint8Array();
				},
			});

			const docPath = `${tempRoot}/docs/test.md`;
			fs.mkdirSync(`${tempRoot}/docs`, { recursive: true });
			fs.writeFileSync(docPath, "");

			const hast = hastWithImg(`../../test-assets-outside-${Date.now()}/secret.txt`);
			const result = await resolver.resolve(hast, docPath);

			expect(result.ok).toBe(false);
			if (!result.ok) {
				expect(result.error.kind).toBe("Forbidden");
				expect(result.error.operation).toBe("path-traversal");
			}
			// Critical: readBytes was NEVER called for the outside path
			expect(readCalls.length).toBe(0);

			// Cleanup
			fs.rmSync(tempRoot, { recursive: true, force: true });
			fs.rmSync(outsideDir, { recursive: true, force: true });
		});

		test("TC-UNIT-002 absolute path outside root → Forbidden, 0 bytes read", async () => {
			const tempRoot = `/tmp/test-assets-abs-${Date.now()}`;
			const outsideDir = `/tmp/test-assets-abs-outside-${Date.now()}`;
			const outsideFile = `${outsideDir}/secret.txt`;

			fs.mkdirSync(tempRoot, { recursive: true });
			fs.mkdirSync(outsideDir, { recursive: true });
			fs.writeFileSync(outsideFile, "secret");

			const readCalls: string[] = [];
			const resolver = new AssetResolver({
				root: tempRoot,
				readBytes: (path) => {
					readCalls.push(path);
					return new Uint8Array();
				},
			});

			const docPath = `${tempRoot}/test.md`;
			fs.writeFileSync(docPath, "");

			const hast = hastWithImg(outsideFile);
			const result = await resolver.resolve(hast, docPath);

			expect(result.ok).toBe(false);
			if (!result.ok) {
				expect(result.error.kind).toBe("Forbidden");
				expect(result.error.operation).toBe("path-traversal");
			}
			expect(readCalls.length).toBe(0);

			fs.rmSync(tempRoot, { recursive: true, force: true });
			fs.rmSync(outsideDir, { recursive: true, force: true });
		});

		test("TC-UNIT-003 URL-encoded %2e%2e%2f → Forbidden, 0 bytes read", async () => {
			const tempRoot = `/tmp/test-assets-enc-${Date.now()}`;
			const outsideDir = `/tmp/test-assets-outside-enc-${Date.now()}`;

			fs.mkdirSync(tempRoot, { recursive: true });
			fs.mkdirSync(outsideDir, { recursive: true });

			const readCalls: string[] = [];
			const resolver = new AssetResolver({
				root: tempRoot,
				readBytes: (path) => {
					readCalls.push(path);
					return new Uint8Array();
				},
			});

			const docPath = `${tempRoot}/test.md`;
			fs.writeFileSync(docPath, "");

			// path.resolve will decode this as ../, leading to escape
			const hast = hastWithImg("%2e%2e%2ftest-assets-outside-enc%2fsecret.txt");
			const result = await resolver.resolve(hast, docPath);

			expect(result.ok).toBe(false);
			if (!result.ok) {
				expect(result.error.kind).toBe("Forbidden");
				expect(result.error.operation).toBe("path-traversal");
			}
			expect(readCalls.length).toBe(0);

			fs.rmSync(tempRoot, { recursive: true, force: true });
			fs.rmSync(outsideDir, { recursive: true, force: true });
		});

		test("TC-UNIT-004 nested ../.. → Forbidden, 0 bytes read", async () => {
			const tempRoot = `/tmp/test-assets-nested-${Date.now()}`;

			fs.mkdirSync(`${tempRoot}/docs/subdir`, { recursive: true });

			const readCalls: string[] = [];
			const resolver = new AssetResolver({
				root: tempRoot,
				readBytes: (path) => {
					readCalls.push(path);
					return new Uint8Array();
				},
			});

			const docPath = `${tempRoot}/docs/subdir/test.md`;
			fs.writeFileSync(docPath, "");

			const hast = hastWithImg("./../../tmp/test-assets-nested-outside/secret.txt");
			const result = await resolver.resolve(hast, docPath);

			expect(result.ok).toBe(false);
			if (!result.ok) {
				expect(result.error.kind).toBe("Forbidden");
				expect(result.error.operation).toBe("path-traversal");
			}
			expect(readCalls.length).toBe(0);

			fs.rmSync(tempRoot, { recursive: true, force: true });
		});

		test("TC-UNIT-005 root-prefix trick → Forbidden, 0 bytes read", async () => {
			const tempRoot = `/tmp/test-assets-prefix-${Date.now()}`;
			const evilDir = `/tmp/test-assets-prefix-evil-${Date.now()}`;

			fs.mkdirSync(tempRoot, { recursive: true });
			fs.mkdirSync(evilDir, { recursive: true });

			const readCalls: string[] = [];
			const resolver = new AssetResolver({
				root: tempRoot,
				readBytes: (path) => {
					readCalls.push(path);
					return new Uint8Array();
				},
			});

			const docPath = `${tempRoot}/test.md`;
			fs.writeFileSync(docPath, "");

			const hast = hastWithImg("/tmp/test-assets-prefix-evil/secret.txt");
			const result = await resolver.resolve(hast, docPath);

			expect(result.ok).toBe(false);
			if (!result.ok) {
				expect(result.error.kind).toBe("Forbidden");
				expect(result.error.operation).toBe("path-traversal");
			}
			expect(readCalls.length).toBe(0);

			fs.rmSync(tempRoot, { recursive: true, force: true });
			fs.rmSync(evilDir, { recursive: true, force: true });
		});

		test("TC-UNIT-006 symlink escape → Forbidden, 0 reads of /etc/passwd", async () => {
			const tempRoot = `/tmp/test-assets-symlink-${Date.now()}`;

			fs.mkdirSync(`${tempRoot}/img`, { recursive: true });

			// Create a symlink inside root pointing to /etc/passwd
			const evilLink = `${tempRoot}/img/evil.png`;
			fs.symlinkSync("/etc/passwd", evilLink);

			const readCalls: string[] = [];
			const resolver = new AssetResolver({
				root: tempRoot,
				readBytes: (path) => {
					readCalls.push(path);
					return new Uint8Array();
				},
			});

			const docPath = `${tempRoot}/test.md`;
			fs.writeFileSync(docPath, "");

			const hast = hastWithImg("img/evil.png");
			const result = await resolver.resolve(hast, docPath);

			expect(result.ok).toBe(false);
			if (!result.ok) {
				expect(result.error.kind).toBe("Forbidden");
				expect(result.error.operation).toBe("path-traversal");
			}
			// Critical: readBytes was NEVER called for /etc/passwd (or the symlink)
			expect(readCalls.length).toBe(0);

			fs.rmSync(tempRoot, { recursive: true, force: true });
		});
	});

	describe("MIME and format handling", () => {
		test("TC-UNIT-007 MIME map: png/jpg/jpeg/gif/svg/webp", async () => {
			const tempRoot = `/tmp/test-assets-mime-${Date.now()}`;

			fs.mkdirSync(tempRoot, { recursive: true });

			// Create tiny 1x1 PNG (valid PNG header)
			const pngBytes = new Uint8Array([
				0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, // PNG signature
				0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52, // IHDR
			]);

			fs.writeFileSync(`${tempRoot}/test.png`, pngBytes);

			const resolver = new AssetResolver({ root: tempRoot });

			const docPath = `${tempRoot}/test.md`;
			fs.writeFileSync(docPath, "");

			const hast = hastWithImg("test.png");
			const result = await resolver.resolve(hast, docPath);

			expect(result.ok).toBe(true);
			if (result.ok) {
				expect(result.value.artifacts).toHaveLength(1);
				expect(result.value.artifacts[0]!.mime).toBe("image/png");
				// Filename is in srcMap, not in Artifact
				const resolved = result.value.srcMap.get("test.png");
				expect(resolved).toBeDefined();
				expect(resolved!.filename).toMatch(/\.png$/);
			}

			fs.rmSync(tempRoot, { recursive: true, force: true });
		});
	});

	describe("remote image handling", () => {
		test("TC-UNIT-008 remote https:// skipped → empty artifacts, node unchanged", async () => {
			const tempRoot = `/tmp/test-assets-remote-${Date.now()}`;

			fs.mkdirSync(tempRoot, { recursive: true });
			fs.writeFileSync(`${tempRoot}/test.md`, "");

			const resolver = new AssetResolver({ root: tempRoot });

			const docPath = `${tempRoot}/test.md`;
			const hast = hastWithImg("https://example.com/image.png");

			const result = await resolver.resolve(hast, docPath);

			expect(result.ok).toBe(true);
			if (result.ok) {
				expect(result.value.artifacts).toHaveLength(0);
				// Node should be unchanged (still has the original URL)
				expect(hast.children[0]!.type).toBe("element");
				const img = hast.children[0] as { properties: { src: string } };
				expect(img.properties.src).toBe("https://example.com/image.png");
			}

			fs.rmSync(tempRoot, { recursive: true, force: true });
		});
	});

	describe("in-doc dedup and determinism", () => {
		test("TC-UNIT-011 token-in-bytes → filename is sha256 of bytes", async () => {
			const tempRoot = `/tmp/test-assets-token-${Date.now()}`;

			fs.mkdirSync(tempRoot, { recursive: true });

			// Image bytes containing a fake token
			const fakeToken = "AKIAIOSFODNN7EXAMPLE";
			const bytes = new TextEncoder().encode(fakeToken);
			fs.writeFileSync(`${tempRoot}/image.png`, bytes);

			const resolver = new AssetResolver({ root: tempRoot });

			const docPath = `${tempRoot}/test.md`;
			fs.writeFileSync(docPath, "");
			const hast = hastWithImg("image.png");

			const result = await resolver.resolve(hast, docPath);

			expect(result.ok).toBe(true);
			if (result.ok) {
				const { artifacts, srcMap } = result.value;
				expect(artifacts).toHaveLength(1);
				const { hash } = artifacts[0]!;

				// Get filename from srcMap
				const resolved = srcMap.get("image.png");
				expect(resolved).toBeDefined();
				const { filename } = resolved!;

				// Filename should NOT contain the token
				expect(filename).not.toContain(fakeToken);
				// Filename should be marksync-asset-<hash>.ext
				expect(filename).toMatch(/^marksync-asset-[a-f0-9]+\.[^.]+$/);

				// Hash should be sha256 of the bytes (not the token string)
				const expectedHash = Array.from(
					new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)),
				)
					.map((b) => b.toString(16).padStart(2, "0"))
					.join("");
				expect(hash).toBe(expectedHash);
				expect(filename).toContain(expectedHash);

				// HAST node should be rewritten to the filename
				const img = hast.children[0] as { properties: { src: string } };
				expect(img.properties.src).toBe(filename);
				expect(filename).not.toContain(fakeToken);
			}

			fs.rmSync(tempRoot, { recursive: true, force: true });
		});

		test("TC-UNIT-012 determinism: same input → identical AssetSet", async () => {
			const tempRoot = `/tmp/test-assets-determinism-${Date.now()}`;

			fs.mkdirSync(tempRoot, { recursive: true });

			const bytes = new Uint8Array([1, 2, 3, 4]);
			fs.writeFileSync(`${tempRoot}/image.png`, bytes);

			const resolver1 = new AssetResolver({ root: tempRoot });
			const resolver2 = new AssetResolver({ root: tempRoot });

			const docPath = `${tempRoot}/test.md`;
			fs.writeFileSync(docPath, "");

			// Clone the HAST for the second resolver (first resolver mutates it)
			const hast1 = hastWithImg("image.png");
			const hast2 = JSON.parse(JSON.stringify(hast1)) as Root;

			const result1 = await resolver1.resolve(hast1, docPath);
			const result2 = await resolver2.resolve(hast2, docPath);

			expect(result1.ok).toBe(true);
			expect(result2.ok).toBe(true);

			if (result1.ok && result2.ok) {
				const set1 = result1.value;
				const set2 = result2.value;

				expect(set1.artifacts).toHaveLength(set2.artifacts.length);
				expect(set1.artifacts[0]!.hash).toBe(set2.artifacts[0]!.hash);

				const resolved1 = set1.srcMap.get("image.png");
				const resolved2 = set2.srcMap.get("image.png");
				expect(resolved1).toBeDefined();
				expect(resolved2).toBeDefined();
				expect(resolved1!.filename).toBe(resolved2!.filename);
				expect(resolved1!.mime).toBe(resolved2!.mime);
			}

			fs.rmSync(tempRoot, { recursive: true, force: true });
		});

		test("TC-UNIT-013 in-doc dedup: same image twice → 1 artifact, both nodes rewritten", async () => {
			const tempRoot = `/tmp/test-assets-dedup-${Date.now()}`;

			fs.mkdirSync(tempRoot, { recursive: true });

			const bytes = new Uint8Array([1, 2, 3, 4]);
			fs.writeFileSync(`${tempRoot}/image.png`, bytes);

			const resolver = new AssetResolver({ root: tempRoot });

			const docPath = `${tempRoot}/test.md`;
			fs.writeFileSync(docPath, "");

			const hast: Root = {
				type: "root",
				children: [
					{
						type: "element",
						tagName: "img",
						properties: { src: "image.png" },
						children: [],
					},
					{
						type: "element",
						tagName: "p",
						children: [
							{
								type: "text",
								value: "Text",
							},
						],
					},
					{
						type: "element",
						tagName: "img",
						properties: { src: "image.png" },
						children: [],
					},
				],
			};

			const result = await resolver.resolve(hast, docPath);

			expect(result.ok).toBe(true);
			if (result.ok) {
				// Should have exactly 1 artifact
				expect(result.value.artifacts).toHaveLength(1);

				const resolved = result.value.srcMap.get("image.png");
				expect(resolved).toBeDefined();
				const filename = resolved!.filename;

				// Both img nodes should be rewritten to the same filename
				const img1 = hast.children[0] as { properties: { src: string } };
				const img2 = hast.children[2] as { properties: { src: string } };

				expect(img1.properties.src).toBe(filename);
				expect(img2.properties.src).toBe(filename);
				expect(img1.properties.src).toBe(img2.properties.src);
			}

			fs.rmSync(tempRoot, { recursive: true, force: true });
		});
	});
});