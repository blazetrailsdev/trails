import { File, Dir } from "@blazetrails/ruby-compat";
import { registerSpecType } from "@blazetrails/activesupport/testing/autorun";
import { afterEach, beforeAll, beforeEach, describe, it } from "vitest";
import { Application } from "../../lib/application.js";
import { Trails } from "../../lib/trails.js";
import "../../lib/test-unit/trailtie.js";
import { TestCase } from "../../lib/generators/test-case.js";

class SystemTestGeneratorApp extends Application {}
class SystemTestGeneratorTest extends TestCase {}
SystemTestGeneratorTest.destination(Dir.mktmpdir());
registerSpecType(/^SystemTestGeneratorTest$/, SystemTestGeneratorTest);
let t: TestCase;

beforeAll(async () => {
  await SystemTestGeneratorApp.instance().loadGenerators();
  const { SystemTestGenerator } =
    await import("../../lib/generators/trails/system-test/system-test-generator.js");
  SystemTestGeneratorTest.tests(SystemTestGenerator);
});

beforeEach((context) => {
  t = context.testCase as TestCase;
  t.prepareDestination();
  Trails.application = SystemTestGeneratorApp.instance();
  File.write(File.join(t.destinationRoot, "tsconfig.json"), "{}");
});

afterEach(() => {
  Trails.application = null;
});

describe("SystemTestGeneratorTest", () => {
  it("system test skeleton is created", async () => {
    await t.runGenerator(["user"]);
    await t.assertFile(
      "test/system/users.test.ts",
      /class UsersTest extends ApplicationSystemTestCase/,
    );
  });

  it("namespaced system test skeleton is created", async () => {
    await t.runGenerator(["admin/user"]);
    await t.assertFile(
      "test/system/admin/users.test.ts",
      /class UsersTest extends ApplicationSystemTestCase/,
    );
  });

  it("test name is pluralized", async () => {
    await t.runGenerator(["user"]);

    await t.assertNoFile("test/system/user.test.ts");
    await t.assertFile("test/system/users.test.ts");
  });

  it("test suffix is not duplicated", async () => {
    await t.runGenerator(["users_test"]);

    await t.assertNoFile("test/system/users-test.test.ts");
    await t.assertFile("test/system/users.test.ts");
  });
});
