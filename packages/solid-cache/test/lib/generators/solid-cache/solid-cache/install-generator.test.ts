import { beforeEach, describe, it } from "vitest";
import { registerSpecType } from "@blazetrails/activesupport/testing/autorun";
import { TestCase } from "@blazetrails/trailties/generators/test-case";
import { Dir, File, FileUtils } from "@blazetrails/ruby-compat";
import { InstallGenerator } from "../../../../../lib/generators/solid-cache/install/install-generator.js";

class InstallGeneratorTest extends TestCase {}
InstallGeneratorTest.tests(InstallGenerator);
InstallGeneratorTest.destination(Dir.mktmpdir());
registerSpecType(/^SolidCache::InstallGeneratorTest$/, InstallGeneratorTest);

let testCase: TestCase;

beforeEach(async (context) => {
  testCase = context.testCase as TestCase;
  testCase.prepareDestination();
  const dummyAppFixture = File.expandPath(
    "../../../../fixtures/generators/dummy_app",
    import.meta.dirname,
  );
  const files = await Dir.globAsync(`${dummyAppFixture}/*`);
  await FileUtils.cpRAsync(files, testCase.destinationRoot);
});

describe("SolidCache::InstallGeneratorTest", () => {
  it("generator updates environment config", async () => {
    await testCase.runGenerator();
    await testCase.assertFile(`${testCase.destinationRoot}/config/cache.ts`, expectedCacheConfig());
    await testCase.assertFile(`${testCase.destinationRoot}/db/cache_schema.ts`);
    await testCase.assertFile(
      `${testCase.destinationRoot}/config/environments/development.ts`,
      /this.config.cacheStore = ":memory_store";\n/,
    );
    await testCase.assertFile(
      `${testCase.destinationRoot}/config/environments/development.ts`,
      /this.config.cacheStore = ":null_store";\n/,
    );
    await testCase.assertFile(
      `${testCase.destinationRoot}/config/environments/test.ts`,
      /this.config.cacheStore = ":null_store";\n/,
    );
    await testCase.assertFile(
      `${testCase.destinationRoot}/config/environments/production.ts`,
      /this.config.cacheStore = ":solid_cache_store";\n/,
    );
  });
});

function expectedCacheConfig(): string {
  return `import { Trails } from "@blazetrails/trailties";

const defaults = {
  storeOptions: {
    // Cap age of oldest cache entry to fulfill retention policies
    // maxAge: 60 * 24 * 60 * 60,
    maxSize: 256 * 1024 * 1024,
    namespace: Trails.env.toString(),
  },
};

export default {
  development: {
    ...defaults,
  },

  test: {
    ...defaults,
  },

  production: {
    database: "cache",
    ...defaults,
  },
};
`;
}
