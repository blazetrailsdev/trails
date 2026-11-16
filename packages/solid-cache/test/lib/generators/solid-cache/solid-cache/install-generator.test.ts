import { afterEach, beforeAll, beforeEach, describe, it } from "vitest";
import { Base } from "@blazetrails/activerecord";
import { assertMatch } from "@blazetrails/activesupport/testing/assertions";
import { registerSpecType } from "@blazetrails/activesupport/testing/autorun";
import { Application, Trails } from "@blazetrails/trailties";
import "@blazetrails/trailties/trailties/active-record";
import { TestCase } from "@blazetrails/trailties/generators/test-case";
import { Dir, File, FileUtils } from "@blazetrails/ruby-compat";
import { InstallGenerator } from "../../../../../lib/generators/solid-cache/install/install-generator.js";

class DummyApp extends Application {}
class InstallGeneratorTest extends TestCase {}
InstallGeneratorTest.tests(InstallGenerator);
InstallGeneratorTest.destination(Dir.mktmpdir());
registerSpecType(/^SolidCache::InstallGeneratorTest$/, InstallGeneratorTest);

beforeAll(async () => {
  await Base.establishConnection({ adapter: "sqlite3", database: ":memory:" });
});

let testCase: TestCase;
let oldSchemaFormat: string | undefined;

beforeEach(async (context) => {
  testCase = context.testCase as TestCase;
  testCase.prepareDestination();
  const dummyAppFixture = File.expandPath(
    "../../../../fixtures/generators/dummy_app",
    import.meta.dirname,
  );
  const files = await Dir.globAsync(`${dummyAppFixture}/*`);
  await FileUtils.cpRAsync(files, testCase.destinationRoot);
  Trails.application = DummyApp.instance();
  oldSchemaFormat = Trails.application.config.activeRecord.schemaFormat;
});

afterEach(() => {
  Trails.application!.config.activeRecord.schemaFormat = oldSchemaFormat;
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
  it("generator creates SQL structure file when schema_format is sql", async () => {
    Trails.application!.config.activeRecord.schemaFormat = "sql";

    await testCase.runGenerator();

    await testCase.assertFile(`${testCase.destinationRoot}/config/cache.ts`, expectedCacheConfig());
    testCase.assertNoFile(`${testCase.destinationRoot}/db/cache_schema.ts`);

    await testCase.assertFile(`${testCase.destinationRoot}/db/cache_structure.sql`, (content) => {
      assertMatch(/CREATE TABLE.*solid_cache_entries/, content);

      switch (Base.connectionDbConfig().adapter) {
        case "postgresql":
          assertMatch(/key.*bytea/, content);
          assertMatch(/value.*bytea/, content);
          assertMatch(/key_hash.*bigint/, content);
          assertMatch(/byte_size.*integer/, content);
          break;
        case "mysql2":
        case "trilogy":
          assertMatch(/key.*varbinary/, content);
          assertMatch(/value.*longblob/, content);
          assertMatch(/key_hash.*bigint/, content);
          assertMatch(/byte_size.*int/, content);
          break;
        case "sqlite3":
          assertMatch(/key.*blob/, content);
          assertMatch(/value.*blob/, content);
          assertMatch(/key_hash.*integer/, content);
          assertMatch(/byte_size.*integer/, content);
          break;
      }

      assertMatch(/index.*key_hash/, content);
    });

    await testCase.assertFile(
      `${testCase.destinationRoot}/config/environments/production.ts`,
      /this.config.cacheStore = ":solid_cache_store";\n/,
    );
  });
});

function expectedCacheConfig(): string {
  return `import { Trails } from "@blazetrails/trailties";

const defaults = {
  database: "cache",
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
    ...defaults,
  },
};
`;
}
