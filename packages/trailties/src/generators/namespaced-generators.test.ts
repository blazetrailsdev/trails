import { Base } from "@blazetrails/activerecord";
import { registerSpecType } from "@blazetrails/activesupport/testing/autorun";
import { Dir, File } from "@blazetrails/ruby-compat";
import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { Application } from "../application.js";
import { Generators } from "../generators.js";
import "../test-unit/trailtie.js";
import "../trailties/active-record.js";
import { copyRoutes } from "./generators-test-helper.js";
import { TestCase } from "./test-case.js";

class NamespacedGeneratorsApp extends Application {}
class TestApp {}

class NamespacedGeneratorTestCase extends TestCase {}
class NamespacedControllerGeneratorTest extends NamespacedGeneratorTestCase {}
class NamespacedModelGeneratorTest extends NamespacedGeneratorTestCase {}
class NamespacedMailerGeneratorTest extends NamespacedGeneratorTestCase {}
class NamespacedScaffoldGeneratorTest extends NamespacedGeneratorTestCase {}
class NamespacedApplicationRecordGeneratorTest extends NamespacedGeneratorTestCase {}

NamespacedGeneratorTestCase.destination(Dir.mktmpdir());
NamespacedControllerGeneratorTest.arguments(["Account", "foo", "bar"]);
NamespacedModelGeneratorTest.arguments(["Account", "name:string", "age:integer"]);
NamespacedMailerGeneratorTest.arguments(["notifier", "foo", "bar"]);
NamespacedScaffoldGeneratorTest.arguments(["product_line", "title:string", "price:integer"]);
for (const klass of [
  NamespacedControllerGeneratorTest,
  NamespacedModelGeneratorTest,
  NamespacedMailerGeneratorTest,
  NamespacedScaffoldGeneratorTest,
  NamespacedApplicationRecordGeneratorTest,
]) {
  registerSpecType(new RegExp(`^${klass.name}$`), klass);
}

let t: TestCase;
let oldNamespace: typeof Generators.namespace;

beforeAll(async () => {
  await NamespacedGeneratorsApp.instance().loadGenerators();
  const { ControllerGenerator } = await import("./rails/controller/controller-generator.js");
  const { ModelGenerator } = await import("./rails/model/model-generator.js");
  const { ScaffoldGenerator } = await import("./rails/scaffold/scaffold-generator.js");
  NamespacedControllerGeneratorTest.tests(ControllerGenerator);
  NamespacedModelGeneratorTest.tests(ModelGenerator);
  NamespacedScaffoldGeneratorTest.tests(ScaffoldGenerator);
});

beforeEach(async (context) => {
  t = context.testCase as TestCase;
  oldNamespace = Generators.namespace;
  Generators.namespace = TestApp;
  t.prepareDestination();
  File.write(File.join(t.destinationRoot, "tsconfig.json"), "{}");
  await copyRoutes.call(t);
});

afterEach(() => {
  Generators.namespace = oldNamespace;
});

describe("NamespacedControllerGeneratorTest", () => {
  it.skip("namespaced controller skeleton is created", async () => {
    await t.runGenerator();
    await t.assertFile(
      "app/controllers/test_app/account-controller.ts",
      /namespace TestApp/,
      / {2}class AccountController extends ApplicationController/,
    );

    await t.assertFile(
      "test/controllers/test_app/account-controller.test.ts",
      /namespace TestApp/,
      / {2}class AccountControllerTest/,
    );
  });

  it("skipping namespace", async () => {
    await t.runGenerator(["Account", "--skip-namespace"]);
    await t.assertFile(
      "app/controllers/account-controller.ts",
      /class AccountController extends ApplicationController/,
    );
    await t.assertFile("app/helpers/account-helper.ts", /AccountHelper/);
  });

  it.skip("namespaced controller with additional namespace", async () => {
    await t.runGenerator(["admin/account"]);
    await t.assertFile(
      "app/controllers/test_app/admin/account-controller.ts",
      /namespace TestApp/,
      / {2}class Admin::AccountController extends ApplicationController/,
    );
  });

  it.skip("helper is also namespaced", async () => {
    await t.runGenerator();
    await t.assertFile(
      "app/helpers/test_app/account-helper.ts",
      /namespace TestApp/,
      / {2}AccountHelper/,
    );
  });

  it.skip("invokes default test framework", async () => {
    await t.runGenerator();
    await t.assertFile("test/controllers/test_app/account-controller.test.ts");
  });

  it.skip("invokes default template engine", async () => {
    await t.runGenerator();
    await t.assertFile(
      "app/views/test_app/account/foo.html.tse",
      /app\/views\/test_app\/account\/foo\.html\.tse/,
    );
    await t.assertFile(
      "app/views/test_app/account/bar.html.tse",
      /app\/views\/test_app\/account\/bar\.html\.tse/,
    );
  });

  it("routes should not be namespaced", async () => {
    await t.runGenerator();
    await t.assertFile("config/routes.ts", /get\("account\/foo"\)/, /get\("account\/bar"\)/);
  });

  it.skip("invokes default template engine even with no action", async () => {
    await t.runGenerator(["account"]);
    await t.assertFile("app/views/test_app/account");
  });

  it.skip("namespaced controller dont indent blank lines", async () => {
    await t.runGenerator();
    await t.assertFile("app/controllers/test_app/account-controller.ts", (content: string) => {
      for (const line of content.split("\n")) {
        expect(line, "Don't indent blank lines").not.toMatch(/^\s+$/);
      }
    });
  });
});

describe("NamespacedModelGeneratorTest", () => {
  it("module file is not created", async () => {
    await t.runGenerator();
    t.assertNoFile("app/models/test_app.ts");
  });

  it.skip("adds namespace to model", async () => {
    await t.runGenerator();
    await t.assertFile(
      "app/models/test_app/account.ts",
      /namespace TestApp/,
      / {2}class Account extends ApplicationRecord/,
    );
  });

  it.skip("model with namespace", async () => {
    await t.runGenerator(["admin/account"]);
    await t.assertFile("app/models/test_app/admin.ts", /namespace TestApp/, /namespace Admin/);
    await t.assertFile("app/models/test_app/admin.ts", /tableNamePrefix/);
    await t.assertFile("app/models/test_app/admin.ts", /"test_app_admin_"/);
    await t.assertFile(
      "app/models/test_app/admin/account.ts",
      /namespace TestApp/,
      /class Admin::Account extends ApplicationRecord/,
    );
  });

  it("migration", async () => {
    await t.runGenerator();
    await t.assertMigration(
      "db/migrate/create_test_app_accounts.ts",
      /createTable\("test_app_accounts"/,
      /class CreateTestAppAccounts extends Migration/,
    );
  });

  it("migration with namespace", async () => {
    await t.runGenerator(["Gallery::Image"]);
    await t.assertMigration(
      "db/migrate/create_test_app_gallery_images",
      /class CreateTestAppGalleryImages extends Migration/,
    );
    t.assertNoMigration("db/migrate/create_test_app_images");
  });

  it("migration with nested namespace", async () => {
    await t.runGenerator(["Admin::Gallery::Image"]);
    t.assertNoMigration("db/migrate/create_images");
    t.assertNoMigration("db/migrate/create_gallery_images");
    await t.assertMigration(
      "db/migrate/create_test_app_admin_gallery_images",
      /class CreateTestAppAdminGalleryImages extends Migration/,
    );
    await t.assertMigration(
      "db/migrate/create_test_app_admin_gallery_images",
      /createTable\("test_app_admin_gallery_images"/,
    );
  });

  it("migration with nested namespace without pluralization", async () => {
    Base.pluralizeTableNames = false;
    try {
      await t.runGenerator(["Admin::Gallery::Image"]);
      t.assertNoMigration("db/migrate/create_images");
      t.assertNoMigration("db/migrate/create_gallery_images");
      t.assertNoMigration("db/migrate/create_test_app_admin_gallery_images");
      await t.assertMigration(
        "db/migrate/create_test_app_admin_gallery_image",
        /class CreateTestAppAdminGalleryImage extends Migration/,
      );
      await t.assertMigration(
        "db/migrate/create_test_app_admin_gallery_image",
        /createTable\("test_app_admin_gallery_image"/,
      );
    } finally {
      Base.pluralizeTableNames = true;
    }
  });

  it.skip("invokes default test framework", async () => {
    await t.runGenerator();
    await t.assertFile(
      "test/models/test_app/account.test.ts",
      /namespace TestApp/,
      /class AccountTest extends TestCase/,
    );
    await t.assertFile("test/fixtures/test_app/accounts.yml", /name: MyString/, /age: 1/);
  });
});

describe("NamespacedMailerGeneratorTest", () => {
  it.skip("mailer skeleton is created", async () => {
    await t.runGenerator();
    await t.assertFile("app/mailers/test_app/notifier-mailer.ts", (mailer: string) => {
      expect(mailer).toMatch(/namespace TestApp/);
      expect(mailer).toMatch(/class NotifierMailer extends ApplicationMailer/);
      expect(mailer).not.toMatch(/default\(\{ from: "from@example\.com" \}\)/);
    });
  });

  it.skip("mailer with i18n helper", async () => {
    await t.runGenerator();
    await t.assertFile("app/mailers/test_app/notifier-mailer.ts", (mailer: string) => {
      expect(mailer).toMatch(/en\.notifier_mailer\.foo\.subject/);
      expect(mailer).toMatch(/en\.notifier_mailer\.bar\.subject/);
    });
  });

  it.skip("invokes default test framework", async () => {
    await t.runGenerator();
    await t.assertFile("test/mailers/test_app/notifier-mailer.test.ts", (test: string) => {
      expect(test).toMatch(/namespace TestApp/);
      expect(test).toMatch(/class NotifierMailerTest extends TestCase/);
      expect(test).toMatch(/"foo"/);
      expect(test).toMatch(/"bar"/);
    });
  });

  it.skip("invokes default template engine", async () => {
    await t.runGenerator();
    await t.assertFile("app/views/test_app/notifier-mailer/foo.text.tse", (view: string) => {
      expect(view).toMatch(/app\/views\/test_app\/notifier-mailer\/foo\.text\.tse/);
      expect(view).toMatch(/<%= this\.greeting %>/);
    });

    await t.assertFile("app/views/test_app/notifier-mailer/bar.text.tse", (view: string) => {
      expect(view).toMatch(/app\/views\/test_app\/notifier-mailer\/bar\.text\.tse/);
      expect(view).toMatch(/<%= this\.greeting %>/);
    });
  });

  it.skip("invokes default template engine even with no action", async () => {
    await t.runGenerator(["notifier"]);
    await t.assertFile("app/views/test_app/notifier-mailer");
  });
});

describe("NamespacedScaffoldGeneratorTest", () => {
  it.skip("scaffold on invoke", async () => {
    await t.runGenerator();

    await t.assertFile(
      "app/models/test_app/product-line.ts",
      /namespace TestApp \{\n {2}class ProductLine extends ApplicationRecord/,
    );
    await t.assertFile(
      "test/models/test_app/product-line.test.ts",
      /namespace TestApp \{\n {2}class ProductLineTest extends TestCase/,
    );
    await t.assertFile("test/fixtures/test_app/product_lines.yml");
    await t.assertMigration("db/migrate/create_test_app_product_lines.ts");

    await t.assertFile("config/routes.ts", (route: string) => {
      expect(route).toMatch(/resources\("product_lines"\)/);
    });

    await t.assertFile(
      "app/controllers/test_app/product-lines-controller.ts",
      /namespace TestApp/,
      /class ProductLinesController extends ApplicationController/,
    );

    await t.assertFile(
      "test/controllers/test_app/product-lines-controller.test.ts",
      /namespace TestApp \{\n {2}class ProductLinesControllerTest extends IntegrationTest/,
    );

    for (const view of ["index", "edit", "new", "show", "_form"]) {
      await t.assertFile(`app/views/test_app/product-lines/${view}.html.tse`);
    }
    t.assertNoFile("app/views/layouts/test_app/product-lines.html.tse");

    await t.assertFile("app/helpers/test_app/product-lines-helper.ts");
  });

  it("scaffold on revoke", async () => {
    await t.runGenerator();
    await t.runGenerator(["product_line"], { behavior: "revoke" });

    t.assertNoFile("app/models/test_app/product-line.ts");
    t.assertNoFile("test/models/test_app/product-line.test.ts");
    t.assertNoFile("test/fixtures/test_app/product_lines.yml");
    t.assertNoMigration("db/migrate/create_test_app_product_lines.ts");

    await t.assertFile("config/routes.ts", (route: string) => {
      expect(route).not.toMatch(/resources\("product_lines"\)/);
    });

    t.assertNoFile("app/controllers/test_app/product-lines-controller.ts");
    t.assertNoFile("test/controllers/test_app/product-lines-controller.test.ts");

    t.assertNoFile("app/views/test_app/product-lines");
    t.assertNoFile("app/views/test_app/layouts/product-lines.html.tse");

    t.assertNoFile("app/helpers/test_app/product-lines-helper.ts");
  });

  it.skip("scaffold with namespace on invoke", async () => {
    await t.runGenerator(["admin/role", "name:string", "description:string"]);

    await t.assertFile("app/models/test_app/admin.ts", /namespace TestApp \{\n {2}namespace Admin/);
    await t.assertFile(
      "app/models/test_app/admin/role.ts",
      /namespace TestApp \{\n {2}class Admin::Role extends ApplicationRecord/,
    );
    await t.assertFile(
      "test/models/test_app/admin/role.test.ts",
      /namespace TestApp \{\n {2}class Admin::RoleTest extends TestCase/,
    );
    await t.assertFile("test/fixtures/test_app/admin/roles.yml");
    await t.assertMigration("db/migrate/create_test_app_admin_roles.ts");
    await t.assertFile("config/routes.ts", (route: string) => {
      expect(route).toMatch(
        /^ {2}this\.namespace\("admin", \(\) => \{\n {4}this\.resources\("roles"\);\n {2}\}\);$/m,
      );
    });
    await t.assertFile("app/controllers/test_app/admin/roles-controller.ts", (content: string) => {
      expect(content).toMatch(
        /namespace TestApp \{\n {2}class Admin::RolesController extends ApplicationController/,
      );
    });
    await t.assertFile(
      "test/controllers/test_app/admin/roles-controller.test.ts",
      /namespace TestApp \{\n {2}class Admin::RolesControllerTest extends IntegrationTest/,
    );
    for (const view of ["index", "edit", "new", "show", "_form"]) {
      await t.assertFile(`app/views/test_app/admin/roles/${view}.html.tse`);
    }
    t.assertNoFile("app/views/layouts/admin/roles.html.tse");
    await t.assertFile("app/helpers/test_app/admin/roles-helper.ts");
  });

  it.skip("scaffold with namespace on revoke", async () => {
    await t.runGenerator(["admin/role", "name:string", "description:string"]);
    await t.runGenerator(["admin/role"], { behavior: "revoke" });

    await t.assertFile("app/models/test_app/admin.ts");
    t.assertNoFile("app/models/test_app/admin/role.ts");
    t.assertNoFile("test/models/test_app/admin/role.test.ts");
    t.assertNoFile("test/fixtures/test_app/admin/roles.yml");
    t.assertNoMigration("db/migrate/create_test_app_admin_roles.ts");
    await t.assertFile("config/routes.ts", (route: string) => {
      expect(route).not.toMatch(/this\.namespace\("admin"/);
    });
    t.assertNoFile("app/controllers/test_app/admin/roles-controller.ts");
    t.assertNoFile("test/controllers/test_app/admin/roles-controller.test.ts");
    t.assertNoFile("app/views/test_app/admin/roles");
    t.assertNoFile("app/helpers/test_app/admin/roles-helper.ts");
  });

  it.skip("scaffold with nested namespace on invoke", async () => {
    await t.runGenerator(["admin/user/special/role", "name:string", "description:string"]);

    await t.assertFile(
      "app/models/test_app/admin/user/special.ts",
      /namespace TestApp \{\n {2}namespace Admin/,
    );
    await t.assertFile(
      "app/models/test_app/admin/user/special/role.ts",
      /namespace TestApp \{\n {2}class Admin::User::Special::Role extends ApplicationRecord/,
    );
    await t.assertFile(
      "test/models/test_app/admin/user/special/role.test.ts",
      /namespace TestApp \{\n {2}class Admin::User::Special::RoleTest extends TestCase/,
    );
    await t.assertFile("test/fixtures/test_app/admin/user/special/roles.yml");
    await t.assertMigration("db/migrate/create_test_app_admin_user_special_roles.ts");
    await t.assertFile("config/routes.ts", (route: string) => {
      expect(route).toMatch(
        /this\.namespace\("special", \(\) => \{\n\s+this\.resources\("roles"\)/,
      );
    });
    await t.assertFile(
      "app/controllers/test_app/admin/user/special/roles-controller.ts",
      (content: string) => {
        expect(content).toMatch(
          /namespace TestApp \{\n {2}class Admin::User::Special::RolesController extends ApplicationController/,
        );
      },
    );
    await t.assertFile(
      "test/controllers/test_app/admin/user/special/roles-controller.test.ts",
      /namespace TestApp \{\n {2}class Admin::User::Special::RolesControllerTest extends IntegrationTest/,
    );
    for (const view of ["index", "edit", "new", "show", "_form"]) {
      await t.assertFile(`app/views/test_app/admin/user/special/roles/${view}.html.tse`);
    }
    t.assertNoFile("app/views/layouts/admin/user/special/roles.html.tse");
    await t.assertFile("app/helpers/test_app/admin/user/special/roles-helper.ts");
  });

  it.skip("scaffold with nested namespace on revoke", async () => {
    await t.runGenerator(["admin/user/special/role", "name:string", "description:string"]);
    await t.runGenerator(["admin/user/special/role"], { behavior: "revoke" });

    await t.assertFile("app/models/test_app/admin/user/special.ts");
    t.assertNoFile("app/models/test_app/admin/user/special/role.ts");
    t.assertNoFile("test/models/test_app/admin/user/special/role.test.ts");
    t.assertNoFile("test/fixtures/test_app/admin/user/special/roles.yml");
    t.assertNoMigration("db/migrate/create_test_app_admin_user_special_roles.ts");
    await t.assertFile("config/routes.ts", (route: string) => {
      expect(route).not.toMatch(/this\.namespace\("special"/);
    });
    t.assertNoFile("app/controllers/test_app/admin/user/special/roles-controller.ts");
    t.assertNoFile("test/controllers/test_app/admin/user/special/roles-controller.test.ts");
    t.assertNoFile("app/views/test_app/admin/user/special/roles");
    t.assertNoFile("app/helpers/test_app/admin/user/special/roles-helper.ts");
  });

  it.skip("api scaffold with namespace on invoke", async () => {
    await t.runGenerator(["admin/role", "name:string", "description:string", "--api"]);

    await t.assertFile("app/models/test_app/admin.ts", /namespace TestApp \{\n {2}namespace Admin/);
    await t.assertFile(
      "app/models/test_app/admin/role.ts",
      /namespace TestApp \{\n {2}class Admin::Role extends ApplicationRecord/,
    );
    await t.assertFile(
      "test/models/test_app/admin/role.test.ts",
      /namespace TestApp \{\n {2}class Admin::RoleTest extends TestCase/,
    );
    await t.assertFile("test/fixtures/test_app/admin/roles.yml");
    await t.assertMigration("db/migrate/create_test_app_admin_roles.ts");
    await t.assertFile("config/routes.ts", (route: string) => {
      expect(route).toMatch(
        /^ {2}this\.namespace\("admin", \(\) => \{\n {4}this\.resources\("roles"\);\n {2}\}\);$/m,
      );
    });
    await t.assertFile("app/controllers/test_app/admin/roles-controller.ts", (content: string) => {
      expect(content).toMatch(
        /namespace TestApp \{\n {2}class Admin::RolesController extends ApplicationController/,
      );
    });
    await t.assertFile(
      "test/controllers/test_app/admin/roles-controller.test.ts",
      /namespace TestApp \{\n {2}class Admin::RolesControllerTest extends IntegrationTest/,
    );
  });
});

describe("NamespacedApplicationRecordGeneratorTest", () => {
  it.skip("adds namespace to application record", async () => {
    await t.runGenerator();
    await t.assertFile(
      "app/models/test_app/application-record.ts",
      /namespace TestApp/,
      / {2}class ApplicationRecord extends Base/,
    );
  });
});
