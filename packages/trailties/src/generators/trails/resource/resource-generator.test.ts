import { File, Dir } from "@blazetrails/ruby-compat";
import { registerSpecType } from "@blazetrails/activesupport/testing/autorun";
import { assertMatch, assertNoMatch } from "@blazetrails/activesupport";
import { beforeAll, beforeEach, describe, it } from "vitest";
import { Application } from "../../../application.js";
import "../../../trailties/active-record.js";
import "../../../test-unit/trailtie.js";
import { copyRoutes } from "../../generators-test-helper.js";
import { ModelHelpers } from "../../model-helpers.js";
import { TestCase } from "../../test-case.js";

class ResourceGeneratorApp extends Application {}
class ResourceGeneratorTest extends TestCase {}
ResourceGeneratorTest.destination(Dir.mktmpdir());
ResourceGeneratorTest.arguments(["account"]);
registerSpecType(/^ResourceGeneratorTest$/, ResourceGeneratorTest);
let t: TestCase;

beforeAll(async () => {
  await ResourceGeneratorApp.instance().loadGenerators();
  const { ResourceGenerator } = await import("./resource-generator.js");
  ResourceGeneratorTest.tests(ResourceGenerator);
});

beforeEach(async (context) => {
  t = context.testCase as TestCase;
  t.prepareDestination();
  File.write(File.join(t.destinationRoot, "tsconfig.json"), "{}");
  await copyRoutes.call(t);
  ModelHelpers.skipWarn = false;
});

describe("ResourceGeneratorTest", () => {
  it("help with usage description", async () => {
    const content = await t.runGenerator(["--help"]);
    assertMatch(/Generates a new resource/, content as string);
  });

  it("help with inherited options", async () => {
    const content = await t.runGenerator(["--help"]);
    assertMatch(/ActiveRecord options:/, content as string);
    assertMatch(/TestUnit options:/, content as string);
  });

  it("files from inherited invocation", async () => {
    await t.runGenerator();

    for (const path of [
      "app/models/account.ts",
      "test/models/account.test.ts",
      "test/fixtures/accounts.yml",
    ]) {
      await t.assertFile(path);
    }

    await t.assertMigration("db/migrate/create_accounts.ts");
  });

  it("inherited invocations with attributes", async () => {
    await t.runGenerator(["account", "name:string"]);
    await t.assertMigration("db/migrate/create_accounts.ts", /string\("name"/);
  });

  it("resource controller with pluralized class name", async () => {
    await t.runGenerator();
    await t.assertFile(
      "app/controllers/accounts-controller.ts",
      /class AccountsController extends ApplicationController/,
    );
    await t.assertFile(
      "test/controllers/accounts-controller.test.ts",
      /describe\("AccountsController"/,
    );

    await t.assertFile("app/helpers/accounts-helper.ts", /AccountsHelper/);
  });

  it("resource controller with actions", async () => {
    await t.runGenerator(["account", "--actions", "index", "new"]);

    await t.assertFile("app/controllers/accounts-controller.ts", async (controller) => {
      await t.assertInstanceMethod("index", controller);
      await t.assertInstanceMethod("new", controller);
    });

    await t.assertFile("app/views/accounts/index.html.tse");
    await t.assertFile("app/views/accounts/new.html.tse");
  });

  it("resource routes are added", async () => {
    await t.runGenerator();

    await t.assertFile("config/routes.ts", (route) => {
      assertMatch(/this\.resources\("accounts"\);$/m, route);
    });
  });

  it("plural names are singularized", async () => {
    const content = await t.runGenerator(["accounts"]);
    await t.assertFile("app/models/account.ts", /class Account extends ApplicationRecord/);
    await t.assertFile("test/models/account.test.ts", /AccountTest/);
    assertMatch(
      /\[WARNING\] The model name 'accounts' was recognized as a plural, using the singular 'account' instead\. Override with --force-plural or setup custom inflection rules for this noun before running the generator\./,
      content as string,
    );
  });

  it("plural names can be forced", async () => {
    const content = await t.runGenerator(["accounts", "--force-plural"]);
    await t.assertFile("app/models/accounts.ts", /class Accounts extends ApplicationRecord/);
    await t.assertFile("test/models/accounts.test.ts", /AccountsTest/);
    assertNoMatch(/\[WARNING\]/, content as string);
  });

  it("mass nouns do not throw warnings", async () => {
    const content = await t.runGenerator(["sheep"]);
    assertNoMatch(/\[WARNING\]/, content as string);
  });

  it("route is removed on revoke", async () => {
    await t.runGenerator();
    await t.runGenerator(["account"], { behavior: "revoke" });

    await t.assertFile("config/routes.ts", (route) => {
      assertNoMatch(/this\.resources\("accounts"\);$/m, route);
    });
  });
});
