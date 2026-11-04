import { File, Dir, TopLevel } from "@blazetrails/ruby-compat";
import { capture } from "@blazetrails/activesupport";
import { registerSpecType } from "@blazetrails/activesupport/testing/autorun";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { Application } from "../../../application.js";
import "../../../test-unit/trailtie.js";
import { copyRoutes } from "../../generators-test-helper.js";
import { TestCase } from "../../test-case.js";

class ControllerGeneratorApp extends Application {}
class ControllerGeneratorTest extends TestCase {}
ControllerGeneratorTest.destination(Dir.mktmpdir());
ControllerGeneratorTest.arguments(["Account", "foo", "bar"]);
registerSpecType(/^ControllerGeneratorTest$/, ControllerGeneratorTest);
let t: TestCase;

beforeAll(async () => {
  await ControllerGeneratorApp.instance().loadGenerators();
  const { ControllerGenerator } = await import("./controller-generator.js");
  ControllerGeneratorTest.tests(ControllerGenerator);
});

beforeEach(async (context) => {
  t = context.testCase as TestCase;
  t.prepareDestination();
  File.write(File.join(t.destinationRoot, "tsconfig.json"), "{}");
  await copyRoutes.call(t);
});

describe("ControllerGeneratorTest", () => {
  it("help does not show invoked generators options if they already exist", async () => {
    const content = await t.runGenerator(["--help"]);
    expect(content).not.toMatch(/Helper options:/);
  });

  it("controller skeleton is created", async () => {
    await t.runGenerator();
    await t.assertFile(
      "app/controllers/account-controller.ts",
      /class AccountController extends ApplicationController/,
    );
  });

  it("check class collision", async () => {
    (TopLevel as Record<string, unknown>).ObjectController = class {};
    try {
      const content = await capture("stderr", () => t.runGenerator(["object"]));
      expect(content).toMatch(
        /The name 'ObjectController' is either already used in your application or reserved/,
      );
    } finally {
      delete (TopLevel as Record<string, unknown>).ObjectController;
    }
  });

  it("invokes helper", async () => {
    await t.runGenerator();
    await t.assertFile("app/helpers/account-helper.ts");
  });

  it("does not invoke helper if required", async () => {
    await t.runGenerator(["account", "--skip-helper"]);
    t.assertNoFile("app/helpers/account-helper.ts");
  });

  it("invokes default test framework", async () => {
    await t.runGenerator();
    await t.assertFile("test/controllers/account-controller.test.ts");
  });

  it("does not invoke test framework if required", async () => {
    await t.runGenerator(["account", "--no-test-framework"]);
    t.assertNoFile("test/controllers/account-controller.test.ts");
  });

  it("invokes default template engine", async () => {
    await t.runGenerator();
    await t.assertFile("app/views/account/foo.html.tse", /app\/views\/account\/foo\.html\.tse/);
    await t.assertFile("app/views/account/bar.html.tse", /app\/views\/account\/bar\.html\.tse/);
  });

  it("add routes", async () => {
    await t.runGenerator();
    await t.assertFile(
      "config/routes.ts",
      /^ {2}this\.get\("account\/foo"\)/m,
      /^ {2}this\.get\("account\/bar"\)/m,
    );
  });

  it("skip routes", async () => {
    await t.runGenerator(["account", "foo", "--skip-routes"]);
    await t.assertFile("config/routes.ts", (routes) => {
      expect(routes).not.toMatch(/get\("account\/foo"\)/);
    });
  });

  it("skip routes prevents generating tests with routes", async () => {
    await t.runGenerator(["account", "foo", "--skip-routes"]);
    await t.assertFile("test/controllers/account-controller.test.ts", (controllerTest) => {
      expect(controllerTest).not.toMatch(/accountFoo(Url|Path)/);
    });
  });

  it("invokes default template engine even with no action", async () => {
    await t.runGenerator(["account"]);
    await t.assertFile("app/views/account");
  });

  it("template engine with class path", async () => {
    await t.runGenerator(["admin/account"]);
    await t.assertFile("app/views/admin/account");
  });

  it("actions are turned into methods", async () => {
    await t.runGenerator();

    await t.assertFile("app/controllers/account-controller.ts", async (controller) => {
      await t.assertInstanceMethod("foo", controller);
      await t.assertInstanceMethod("bar", controller);
    });
  });

  it("namespaced routes are created in routes", async () => {
    await t.runGenerator(["admin/dashboard", "index"]);
    await t.assertFile("config/routes.ts", (route) => {
      expect(route).toMatch(
        /^ {2}this\.namespace\("admin", \(\) => \{\n {4}this\.get\("dashboard\/index"\);\n {2}\}\);$/m,
      );
    });
  });

  it("namespaced routes with multiple actions are created in routes", async () => {
    await t.runGenerator(["admin/dashboard", "index", "show"]);
    await t.assertFile("config/routes.ts", (route) => {
      expect(route).toMatch(
        /^ {2}this\.namespace\("admin", \(\) => \{\n {4}this\.get\("dashboard\/index"\);\n {4}this\.get\("dashboard\/show"\);\n {2}\}\);$/m,
      );
    });
  });

  it("does not add routes when action is not specified", async () => {
    await t.runGenerator(["admin/dashboard"]);
    await t.assertFile("config/routes.ts", (routes) => {
      expect(routes).not.toMatch(/namespace\("admin"/);
    });
  });

  it("controller parent param", async () => {
    await t.runGenerator(["admin/dashboard", "--parent", "admin_controller"]);
    await t.assertFile("app/controllers/admin/dashboard-controller.ts", (controller) => {
      expect(controller).toMatch(/class DashboardController extends AdminController/);
    });
  });

  it("controller suffix is not duplicated", async () => {
    await t.runGenerator(["account_controller"]);

    t.assertNoFile("app/controllers/account-controller-controller.ts");
    await t.assertFile("app/controllers/account-controller.ts");

    t.assertNoFile("app/views/account-controller/");
    await t.assertFile("app/views/account/");

    t.assertNoFile("test/controllers/account-controller-controller.test.ts");
    await t.assertFile("test/controllers/account-controller.test.ts");

    t.assertNoFile("app/helpers/account-controller-helper.ts");
    await t.assertFile("app/helpers/account-helper.ts");
  });
});
