// Live-sandbox E2E harness helpers (F-3, NFR-CI-3/4, RSK-6, NFR-MAINT-4).

// Canonical E2E env-var set (run-e2e.yml is single source of truth - NG-6)
export const REQUIRED_E2E_VARS = [
	"MARKSYNC_E2E_CONFLUENCE_BASE_URL",
	"MARKSYNC_E2E_USER_EMAIL",
	"MARKSYNC_E2E_API_TOKEN",
	"MARKSYNC_E2E_SPACE_KEY",
	"MARKSYNC_E2E_PARENT_PAGE_ID",
] as const;

export type E2ECredentials = {
	baseUrl: string;
	userEmail: string;
	apiToken: string;
	spaceKey: string;
	parentPageId: string;
};

/**
 * Check if all required E2E secrets are present (all-or-nothing guard - RSK-6).
 */
export function requiredSecretsPresent(): boolean {
	return REQUIRED_E2E_VARS.every((varName) => {
		const value = process.env[varName];
		return value !== undefined && value !== null && value !== "";
	});
}

/**
 * Read E2E credentials from environment (consumes run-e2e.yml env-var names verbatim - NG-6).
 * @throws Error if any required secret is missing (should be guarded by requiredSecretsPresent)
 */
export function readE2ECredentials(): E2ECredentials {
	const credentials = {
		baseUrl: process.env.MARKSYNC_E2E_CONFLUENCE_BASE_URL!,
		userEmail: process.env.MARKSYNC_E2E_USER_EMAIL!,
		apiToken: process.env.MARKSYNC_E2E_API_TOKEN!,
		spaceKey: process.env.MARKSYNC_E2E_SPACE_KEY!,
		parentPageId: process.env.MARKSYNC_E2E_PARENT_PAGE_ID,
	};

	// Validate all are present (defensive; should be caught by requiredSecretsPresent guard)
	for (const [key, value] of Object.entries(credentials)) {
		if (!value) {
			throw new Error(`Missing required E2E credential: ${key}`);
		}
	}

	return credentials;
}

/**
 * Page tracker for run-scoped cleanup (RSK-2, NFR-CI-4).
 * Records every page id created during the run for deletion at the end.
 */
export class CleanupTracker {
	private createdPageIds: string[] = [];

	/**
	 * Record a page id that was created during this run.
	 */
	recordCreatedPage(pageId: string): void {
		this.createdPageIds.push(pageId);
	}

	/**
	 * Get all created page ids.
	 */
	getCreatedPageIds(): readonly string[] {
		return this.createdPageIds;
	}

	/**
	 * Get count of created pages.
	 */
	getCreatedCount(): number {
		return this.createdPageIds.length;
	}

	/**
	 * Clear the tracker (after successful cleanup).
	 */
	clear(): void {
		this.createdPageIds = [];
	}

	/**
	 * Log created page ids for orphan-detection backstop (RSK-2).
	 * Call this on cleanup failure so nightly sweep can find orphans.
	 */
	logCreatedPageIds(): void {
		if (this.createdPageIds.length > 0) {
			console.error(
				`[E2E Cleanup Failed] ${this.createdPageIds.length} created page(s) not deleted:`,
				this.createdPageIds.join(", "),
			);
		}
	}
}
