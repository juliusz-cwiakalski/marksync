// Bun-native BDD runner entry point (RSK-1 fallback for cucumber-cli transpilation issue).

import { runCucumber, loadConfiguration } from "@cucumber/cucumber/api";

const run = async () => {
	try {
		// Load cucumber configuration with provided options
		const configuration = await loadConfiguration({
			provided: {
				paths: ["tests/bdd/features"],
				require: ["tests/bdd/steps/*.ts", "tests/bdd/support/*.ts"],
				strict: true,
			},
		});

		// Run the tests using the API directly
		const result = await runCucumber(configuration.runConfiguration);
		process.exit(result.success ? 0 : 1);
	} catch (error) {
		console.error("BDD runner error:", error);
		process.exit(1);
	}
};

run();