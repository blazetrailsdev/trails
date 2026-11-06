import { File, Dir } from "@blazetrails/ruby-compat";
import { assertMatch } from "@blazetrails/activesupport";
import { registerSpecType } from "@blazetrails/activesupport/testing/autorun";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { Application } from "../application.js";
import { Trails } from "../trails.js";
import "../trailties/active-record.js";
import "../test-unit/trailtie.js";
import { TestCase } from "./test-case.js";

class MigrationGeneratorForceApp extends Application {}
class MigrationGeneratorForceTest extends TestCase {}
MigrationGeneratorForceTest.destination(Dir.mktmpdir());
registerSpecType(/^MigrationGeneratorForceTest$/, MigrationGeneratorForceTest);
let t: TestCase;

beforeAll(async () => {
  await MigrationGeneratorForceApp.instance().loadGenerators();
  const { MigrationGenerator } = await import("./trails/migration/migration-generator.js");
  MigrationGeneratorForceTest.tests(MigrationGenerator);
});

beforeEach((context) => {
  t = context.testCase as TestCase;
  t.prepareDestination();
  File.write(File.join(t.destinationRoot, "tsconfig.json"), "{}");
  Trails.application = MigrationGeneratorForceApp.instance();
});

describe("MigrationGeneratorForceTest", () => {
  it("--force replaces an existing create_users migration", async () => {
    const args = [
      "CreateUsers",
      "email_address:string!:uniq",
      "password_digest:string!",
      "--force",
    ];
    await t.runGenerator(args);
    await t.runGenerator(args);

    expect(Dir.glob(`${t.destinationRoot}/db/migrate/*_create_users.ts`)).toHaveLength(1);
    await t.assertMigration("db/migrate/create_users.ts", (content) =>
      t.assertMethod("change", content, (change) => {
        assertMatch(/t\.string\("email_address", \{ null: false \}\)/, change);
        assertMatch(/addIndex\("users", "email_address", \{ unique: true \}\)/, change);
      }),
    );
  });
});
