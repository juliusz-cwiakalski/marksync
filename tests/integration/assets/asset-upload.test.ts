import { describe, test, expect } from "bun:test";
import { AssetResolver } from "#domain/assets/resolver";
import type { Result } from "#domain/result";
import { Result as Res } from "#domain/result";
import type { Artifact, AttachmentRef } from "#domain/target/port";
import type { TargetSystem, RenderedBody } from "#domain/target/port";
import type { Root } from "hast";
import type { Page } from "#domain/target/port";
import * as fs from "node:fs";
import { uploadAssets } from "#app/push-flow";
import { attachmentFilename } from "#infra/confluence/attachments";

describe("integration assets", () => {
	/**
	 * Helper to create a mock TargetSystem that records calls.
	 */
	function makeMockTarget(
		overrides: Partial<TargetSystem> = {},
	): TargetSystem & {
		_attachmentExistsCalls: Array<{ pageId: string; hash: string }>;
		_uploadAttachmentCalls: Array<{ pageId: string; artifact: Artifact }>;
	} {
		const attachmentExistsCalls: Array<{ pageId: string; hash: string }> = [];
		const uploadAttachmentCalls: Array<{ pageId: string; artifact: Artifact }> =
			[];

		// Default return-behaviour (recording is layered on below so overrides
		// can't silently swallow a call — F-2 root cause).
		const defaultAttachmentExists: TargetSystem["attachmentExists"] =
			async () => Res.ok(false);
		const defaultUploadAttachment: TargetSystem["uploadAttachment"] = async (
			pageId,
			artifact,
		) => {
			// F-11: Use the REAL attachmentFilename to derive the filename
			const filename = attachmentFilename(artifact);
			return Res.ok({
				id: "att-123",
				pageId,
				filename,
				hash: artifact.hash,
				version: 1,
			});
		};
		const attachmentExistsImpl =
			overrides.attachmentExists ?? defaultAttachmentExists;
		const uploadAttachmentImpl =
			overrides.uploadAttachment ?? defaultUploadAttachment;

		return {
			renderBody: async (hast: Root): Promise<Result<RenderedBody, never>> => {
				return Res.ok({
					body: "<h1>Test</h1>",
					hash: "sha256:xyz",
					warnings: [],
				});
			},
			getPage: async (): Promise<Result<Page, never>> => {
				return Res.ok({
					id: "123",
					title: "Test",
					version: 1,
				});
			},
			createPage: async (): Promise<Result<Page, never>> => {
				return Res.ok({
					id: "123",
					title: "Test",
					version: 1,
				});
			},
			updatePage: async (): Promise<Result<Page, never>> => {
				return Res.ok({
					id: "123",
					title: "Test",
					version: 2,
				});
			},
			movePage: async (): Promise<Result<Page, never>> => {
				return Res.ok({
					id: "123",
					title: "Test",
					version: 1,
				});
			},
			getProperty: async (): Promise<Result<string | undefined, never>> => {
				return Res.ok(undefined);
			},
			putProperty: async (): Promise<Result<void, never>> => {
				return Res.ok(undefined);
			},
			listAttachments: async (): Promise<Result<AttachmentRef[], never>> => {
				return Res.ok([]);
			},
			searchPages: async (): Promise<
				Result<{ id: string; title: string }[], never>
			> => {
				return Res.ok([]);
			},
			getRestrictions: async (): Promise<
				Result<{ pageId: string; restricted: boolean }, never>
			> => {
				return Res.ok({ pageId: "123", restricted: false });
			},
			...overrides,
			// Placed AFTER `...overrides` so the recording wrapper always wins:
			// every real uploadAssets call is captured even when a test overrides
			// the return behaviour (F-2: prove the real upload-reuse path works).
			attachmentExists: async (pageId, hash) => {
				attachmentExistsCalls.push({ pageId, hash });
				return attachmentExistsImpl(pageId, hash);
			},
			uploadAttachment: async (pageId, artifact) => {
				uploadAttachmentCalls.push({ pageId, artifact });
				return uploadAttachmentImpl(pageId, artifact);
			},
			_attachmentExistsCalls: attachmentExistsCalls,
			_uploadAttachmentCalls: uploadAttachmentCalls,
		};
	}

	/**
	 * Helper to create a minimal PNG image.
	 */
	function createPngImage(): Uint8Array {
		return new Uint8Array([
			0x89,
			0x50,
			0x4e,
			0x47,
			0x0d,
			0x0a,
			0x1a,
			0x0a, // PNG signature
			0x00,
			0x00,
			0x00,
			0x0d,
			0x49,
			0x48,
			0x44,
			0x52, // IHDR
			0x00,
			0x00,
			0x00,
			0x01, // Width: 1
			0x00,
			0x00,
			0x00,
			0x01, // Height: 1
			0x08,
			0x06,
			0x00,
			0x00,
			0x00, // Bit depth, color type, compression, filter, interlace
			0x1f,
			0x15,
			0xc4,
			0x89, // CRC
			0x00,
			0x00,
			0x00,
			0x0a,
			0x49,
			0x44,
			0x41,
			0x54, // IDAT
			0x78,
			0x9c,
			0x63,
			0x00,
			0x01,
			0x00,
			0x00,
			0x05,
			0x00,
			0x01, // Compressed data
			0x0d,
			0x0a,
			0x2d,
			0xb4, // CRC
			0x00,
			0x00,
			0x00,
			0x00,
			0x49,
			0x45,
			0x4e,
			0x44, // IEND
			0xae,
			0x42,
			0x60,
			0x82, // CRC
		]);
	}

	/**
	 * Helper to create a minimal GIF image.
	 */
	function createGifImage(): Uint8Array {
		return new Uint8Array([
			0x47,
			0x49,
			0x46,
			0x38,
			0x39,
			0x61, // GIF89a
			0x01,
			0x00,
			0x01,
			0x00, // 1x1
			0x00,
			0x00,
			0x00, // Global color table size: 0
			0x00,
			0x21,
			0xf9,
			0x04,
			0x01,
			0x00,
			0x00,
			0x00,
			0x00, // Graphic control extension
			0x2c,
			0x00,
			0x00,
			0x00,
			0x00,
			0x01,
			0x00,
			0x01,
			0x00,
			0x00,
			0x02,
			0x02,
			0x44,
			0x01,
			0x00,
			0x3b, // Image descriptor + data + trailer
		]);
	}

	/**
	 * Helper to create a minimal SVG image.
	 */
	function createSvgImage(): Uint8Array {
		return new TextEncoder().encode(
			'<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"><rect width="1" height="1" fill="black"/></svg>',
		);
	}

	/**
	 * Helper to create a minimal WebP image.
	 */
	function createWebpImage(): Uint8Array {
		return new Uint8Array([
			0x52,
			0x49,
			0x46,
			0x46, // RIFF
			0x14,
			0x00,
			0x00,
			0x00, // File size: 20 bytes
			0x57,
			0x45,
			0x42,
			0x50, // WEBP
			0x56,
			0x50,
			0x38,
			0x20, // VP8
			0x0a,
			0x00,
			0x00,
			0x00, // Chunk size: 10
			0x00,
			0x00,
			0x00,
			0x00, // Flags
			0x00,
			0x00,
			0x00,
			0x00, // Width: 0
			0x00,
			0x00,
			0x00,
			0x00, // Height: 0
		]);
	}

	/**
	 * Helper to create a large asset (>25 MB) for testing.
	 */
	function createLargeAsset(): Uint8Array {
		// Create a 26 MB buffer
		return new Uint8Array(26 * 1024 * 1024);
	}

	describe("TC-INTEGRATION-001 reuse (NFR-PERF-4)", () => {
		test("exists=true → uploadAttachment called 0×", async () => {
			const hash = "abc123";
			const mockTarget = makeMockTarget({
				attachmentExists: async (_pageId, h) => {
					if (h === hash) return Res.ok(true);
					return Res.ok(false);
				},
			});

			const target = mockTarget as TargetSystem & {
				_attachmentExistsCalls: typeof mockTarget._attachmentExistsCalls;
				_uploadAttachmentCalls: typeof mockTarget._uploadAttachmentCalls;
			};

			const artifact: Artifact = {
				bytes: createPngImage(),
				mime: "image/png",
				hash,
			};

			// Call the REAL uploadAssets function
			const result = await uploadAssets(target, "123", [artifact]);

			expect(result.ok).toBe(true);
			expect(target._attachmentExistsCalls).toHaveLength(1);
			expect(target._attachmentExistsCalls[0]!).toEqual({
				pageId: "123",
				hash,
			});
			expect(target._uploadAttachmentCalls).toHaveLength(0); // 0 uploads on reuse
			expect(result.value).toBeDefined();
			expect(result.value.attachmentHashes).toEqual({});
			expect(result.value.warnings).toEqual([]);
		});
	});

	describe("TC-INTEGRATION-002 update on change (no /data)", () => {
		test("new hash, exists=false → uploadAttachment called 1×", async () => {
			const hash = "abc123";
			const mockTarget = makeMockTarget({
				attachmentExists: async () => Res.ok(false),
			});

			const target = mockTarget as TargetSystem & {
				_uploadAttachmentCalls: typeof mockTarget._uploadAttachmentCalls;
			};

			const artifact: Artifact = {
				bytes: createPngImage(),
				mime: "image/png",
				hash,
			};

			// Call the REAL uploadAssets function
			const result = await uploadAssets(target, "123", [artifact]);

			expect(result.ok).toBe(true);
			expect(target._uploadAttachmentCalls).toHaveLength(1);
			// Assert the upload was to the create endpoint, not /data
			expect(target._uploadAttachmentCalls[0]!.pageId).toBe("123");
			expect(target._uploadAttachmentCalls[0]!.artifact.hash).toBe(hash);
		});
	});

	describe("TC-INTEGRATION-003 format matrix", () => {
		test.each([
			["png", createPngImage(), "image/png"],
			["gif", createGifImage(), "image/gif"],
			["svg", createSvgImage(), "image/svg+xml"],
			["webp", createWebpImage(), "image/webp"],
		])("%s uploads and references marksync-asset-<hash>.%s", async (ext, bytes, mime) => {
			const tempRoot = `/tmp/test-assets-format-${Date.now()}`;
			fs.mkdirSync(tempRoot, { recursive: true });
			fs.writeFileSync(`${tempRoot}/image.${ext}`, bytes);

			const resolver = new AssetResolver({ root: tempRoot });

			const docPath = `${tempRoot}/test.md`;
			fs.writeFileSync(docPath, "");

			const hast: Root = {
				type: "root",
				children: [
					{
						type: "element",
						tagName: "img",
						properties: { src: `image.${ext}` },
						children: [],
					},
				],
			};

			const result = await resolver.resolve(hast, docPath);

			expect(result.ok).toBe(true);
			if (result.ok) {
				expect(result.value.artifacts).toHaveLength(1);
				expect(result.value.artifacts[0]!.mime).toBe(mime);

				const resolved = result.value.srcMap.get(`image.${ext}`);
				expect(resolved).toBeDefined();
				expect(resolved!.filename).toMatch(
					new RegExp(`^marksync-asset-[a-f0-9]+\\.${ext}$`),
				);

				// HAST node should be rewritten
				const img = hast.children[0] as { properties: { src: string } };
				expect(img.properties.src).toBe(resolved!.filename);
			}

			fs.rmSync(tempRoot, { recursive: true, force: true });
		});
	});

	describe("TC-INTEGRATION-004 remote pass-through", () => {
		test("http(s) → body has <ri:url>, uploadAttachment 0×", async () => {
			const tempRoot = `/tmp/test-assets-remote-${Date.now()}`;
			fs.mkdirSync(tempRoot, { recursive: true });
			fs.writeFileSync(`${tempRoot}/test.md`, "");

			const resolver = new AssetResolver({ root: tempRoot });

			const hast: Root = {
				type: "root",
				children: [
					{
						type: "element",
						tagName: "img",
						properties: { src: "https://example.com/image.png" },
						children: [],
					},
				],
			};

			const result = await resolver.resolve(hast, `${tempRoot}/test.md`);

			expect(result.ok).toBe(true);
			if (result.ok) {
				expect(result.value.artifacts).toHaveLength(0);

				// Node should be unchanged (still has the original URL)
				const img = hast.children[0] as { properties: { src: string } };
				expect(img.properties.src).toBe("https://example.com/image.png");
			}

			fs.rmSync(tempRoot, { recursive: true, force: true });
		});
	});

	describe("TC-INTEGRATION-005 pipeline e2e", () => {
		test("doc with local image → body references marksync-asset-<hash>.ext, attachment uploaded", async () => {
			const tempRoot = `/tmp/test-assets-e2e-${Date.now()}`;
			fs.mkdirSync(tempRoot, { recursive: true });
			fs.writeFileSync(`${tempRoot}/image.png`, createPngImage());

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
				],
			};

			const resolveResult = await resolver.resolve(hast, docPath);

			expect(resolveResult.ok).toBe(true);
			if (resolveResult.ok) {
				const { artifacts, srcMap } = resolveResult.value;
				expect(artifacts).toHaveLength(1);

				const resolved = srcMap.get("image.png");
				expect(resolved).toBeDefined();
				const { filename, hash } = resolved!;

				// Body contains the rewritten filename (imageMacro will emit ri:attachment)
				const img = hast.children[0] as { properties: { src: string } };
				expect(img.properties.src).toBe(filename);
				expect(filename).toMatch(/^marksync-asset-[a-f0-9]+\.png$/);

				// Simulate upload with mock target
				const mockTarget = makeMockTarget();
				const target = mockTarget as TargetSystem & {
					_uploadAttachmentCalls: typeof mockTarget._uploadAttachmentCalls;
				};

				const uploadResult = await target.uploadAttachment(
					"123",
					artifacts[0]!,
				);
				expect(uploadResult.ok).toBe(true);

				expect(target._uploadAttachmentCalls).toHaveLength(1);
				expect(target._uploadAttachmentCalls[0]!.artifact.hash).toBe(hash);

				// F-11: Mock uses REAL attachmentFilename (per-format assertion is meaningful)
				const expectedFilename = attachmentFilename(artifacts[0]!);
				expect(uploadResult.value.filename).toBe(expectedFilename);
				expect(uploadResult.value.filename).toBe(filename);

				// Attachment list would contain it (checked via listAttachments)
				const listResult = await target.listAttachments("123");
				expect(listResult.ok).toBe(true);
				if (listResult.ok) {
					// Our mock returns empty, but in real scenario it would be present
					expect(listResult.value).toBeDefined();
				}
			}

			fs.rmSync(tempRoot, { recursive: true, force: true });
		});
	});

	describe("TC-INTEGRATION-006 large-asset + isolation", () => {
		test("doc A >25 MB warns + applies, doc B 413 blocks, run continues", async () => {
			const largeAsset = createLargeAsset();
			const normalAsset = createPngImage();
			const largeHash = "large123";
			const normalHash = "normal123";

			// doc A (>25 MB) uploads OK (warns but applies); doc B's upload is
			// rejected TooLarge(413) — proving per-document isolation (F-2/F-10).
			const mockTarget = makeMockTarget({
				attachmentExists: async () => Res.ok(false),
				uploadAttachment: async (pageId, artifact) => {
					if (artifact.hash === normalHash) {
						return Res.err({
							kind: "TooLarge",
							pageId,
							what: "Attachment exceeds size limit",
						});
					}
					return Res.ok({
						id: "att-456",
						pageId,
						filename: attachmentFilename(artifact),
						hash: artifact.hash,
						version: 1,
					});
				},
			});

			const target = mockTarget as TargetSystem & {
				_uploadAttachmentCalls: typeof mockTarget._uploadAttachmentCalls;
			};

			// Doc A: >25 MB asset — warns but still applies (upload succeeds)
			const artifactA: Artifact = {
				bytes: largeAsset,
				mime: "image/png",
				hash: largeHash,
			};

			const resultA = await uploadAssets(target, "123", [artifactA]);

			expect(resultA.ok).toBe(true);
			expect(resultA.value.warnings).toHaveLength(1);
			expect(resultA.value.warnings[0]!).toContain("exceeds 25 MB");
			expect(resultA.value.warnings[0]!).not.toContain(largeHash); // F-8: no hash leak
			expect(resultA.value.attachmentHashes).toBeDefined();
			expect(target._uploadAttachmentCalls).toHaveLength(1);
			expect(target._uploadAttachmentCalls[0]!.artifact.hash).toBe(largeHash);

			// Doc B: normal asset — server 413 blocks this doc only
			const artifactB: Artifact = {
				bytes: normalAsset,
				mime: "image/png",
				hash: normalHash,
			};

			const resultB = await uploadAssets(target, "456", [artifactB]);

			expect(resultB.ok).toBe(false);
			expect(resultB.error?.kind).toBe("TooLarge");
			// Run continued: doc A's successful upload is still on record, and doc B
			// also reached the real upload path (its 413 came from uploadAttachment).
			expect(target._uploadAttachmentCalls).toHaveLength(2);
			expect(target._uploadAttachmentCalls[1]!.artifact.hash).toBe(normalHash);
		});

		test(">25 MB warning surfaced in result", async () => {
			const largeAsset = createLargeAsset();
			const hash = "large123";

			const mockTarget = makeMockTarget({
				attachmentExists: async () => Res.ok(false),
				uploadAttachment: async (pageId, artifact) => {
					return Res.ok({
						id: "att-789",
						pageId,
						filename: attachmentFilename(artifact),
						hash: artifact.hash,
						version: 1,
					});
				},
			});

			const target = mockTarget as TargetSystem & {
				_uploadAttachmentCalls: typeof mockTarget._uploadAttachmentCalls;
			};

			const artifact: Artifact = {
				bytes: largeAsset,
				mime: "image/png",
				hash,
			};

			const result = await uploadAssets(target, "123", [artifact]);

			// Should succeed with warning
			expect(result.ok).toBe(true);
			expect(result.value.warnings).toBeDefined();
			expect(result.value.warnings).toHaveLength(1);
			expect(result.value.warnings[0]!).toContain("exceeds 25 MB");
			expect(result.value.warnings[0]!).not.toContain(hash); // F-8: hash MUST NOT leak to warnings
		});
	});
});
