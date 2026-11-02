import { File, Dir } from "@blazetrails/ruby-compat";
import { registerSpecType } from "@blazetrails/activesupport/testing/autorun";
import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { Application } from "../../../application.js";
import { Trails } from "../../../rails.js";
import "../../../trailties/active-record.js";
import "../../../test-unit/trailtie.js";
import { copyRoutes } from "../../generators-test-helper.js";
import { TestCase } from "../../test-case.js";

class ScaffoldGeneratorApp extends Application {}
class ScaffoldGeneratorTest extends TestCase {}
ScaffoldGeneratorTest.destination(Dir.mktmpdir());
ScaffoldGeneratorTest.arguments([
  "product_line",
  "title:string",
  "approved:boolean",
  "product:belongs_to",
  "user:references",
]);
registerSpecType(/^ScaffoldGeneratorTest$/, ScaffoldGeneratorTest);
let t: TestCase;

beforeAll(async () => {
  await ScaffoldGeneratorApp.instance().loadGenerators();
  const { ScaffoldGenerator } = await import("./scaffold-generator.js");
  ScaffoldGeneratorTest.tests(ScaffoldGenerator);
});

beforeEach((context) => {
  t = context.testCase as TestCase;
  t.prepareDestination();
  Trails.application = ScaffoldGeneratorApp.instance();
  File.write(File.join(t.destinationRoot, "tsconfig.json"), "{}");
  copyRoutes.call(t);
});

afterEach(() => {
  Trails.application = null;
});

describe("ScaffoldGeneratorTest", () => {
  it("scaffold on invoke", async () => {
    await t.runGenerator();

    await t.assertFile("app/models/product-line.ts", /class ProductLine extends ApplicationRecord/);
    await t.assertFile(
      "test/models/product-line.test.ts",
      /class ProductLineTest extends TestCase|describe\("ProductLineTest"/,
    );
    await t.assertFile("test/fixtures/product_lines.yml");
    await t.assertMigration("db/migrate/create_product_lines.ts", /belongsTo\("product"/);
    await t.assertMigration("db/migrate/create_product_lines.ts", /boolean\("approved"/);
    await t.assertMigration("db/migrate/create_product_lines.ts", /references\("user"/);

    await t.assertFile("config/routes.ts", (route) => {
      expect(route).toMatch(/resources\("product_lines"\);$/m);
    });

    await t.assertFile("app/controllers/product-lines-controller.ts", async (content) => {
      expect(content).toMatch(/class ProductLinesController extends ApplicationController/);

      await t.assertInstanceMethod("index", content, (m) => {
        expect(m).toMatch(/this\.product_lines = await ProductLine\.all\(\)/);
      });

      await t.assertInstanceMethod("show", content);

      await t.assertInstanceMethod("new", content, (m) => {
        expect(m).toMatch(/this\.product_line = new ProductLine\(\)/);
      });

      await t.assertInstanceMethod("edit", content);

      await t.assertInstanceMethod("create", content, (m) => {
        expect(m).toMatch(/this\.product_line = new ProductLine\(this\.productLineParams\(\)\)/);
        expect(m).toMatch(/this\.product_line\.save\(\)/);
      });

      await t.assertInstanceMethod("update", content, (m) => {
        expect(m).toMatch(/this\.product_line\.update\(this\.productLineParams\(\)\)/);
      });

      await t.assertInstanceMethod("destroy", content, (m) => {
        expect(m).toMatch(/this\.product_line\.destroyBang\(\)/);
      });

      await t.assertInstanceMethod("setProductLine", content, (m) => {
        expect(m).toMatch(
          /this\.product_line = await ProductLine\.find\(this\.params\.expect\("id"\)\)/,
        );
      });
    });

    await t.assertFile("test/controllers/product-lines-controller.test.ts", (test) => {
      expect(test).toMatch(/class ProductLinesControllerTest extends IntegrationTest/);
      expect(test).toMatch(
        /t\.post\(t\.productLinesUrl\(\), \{ params: \{ product_line: \{ approved: t\["@product_line"\]\.approved, product_id: t\["@product_line"\]\.product_id, title: t\["@product_line"\]\.title, user_id: t\["@product_line"\]\.user_id \} \}/,
      );
      expect(test).toMatch(
        /t\.patch\(t\.productLineUrl\(t\["@product_line"\]\), \{ params: \{ product_line: \{ approved: t\["@product_line"\]\.approved, product_id: t\["@product_line"\]\.product_id, title: t\["@product_line"\]\.title, user_id: t\["@product_line"\]\.user_id \} \}/,
      );
    });

    t.assertNoFile("app/views/layouts/product-lines.html.tse");

    for (const view of ["index", "show"]) {
      await t.assertFile(`app/views/product-lines/${view}.html.tse`);
    }

    for (const view of ["edit", "new"]) {
      await t.assertFile(
        `app/views/product-lines/${view}.html.tse`,
        /render\("form", \{ product_line: this\.product_line \}\)/,
      );
    }

    await t.assertFile("app/views/product-lines/_form.html.tse", (test) => {
      expect(test).toMatch("product_line");
      expect(test).not.toMatch("this.product_line");
    });

    await t.assertFile("app/helpers/product-lines-helper.ts");
  });

  it("api scaffold on invoke", async () => {
    await t.runGenerator([
      "product_line",
      "title:string",
      "product:belongs_to",
      "user:references",
      "--api",
      "--no-template-engine",
      "--no-helper",
      "--no-assets",
    ]);

    await t.assertFile("app/models/product-line.ts", /class ProductLine extends ApplicationRecord/);
    await t.assertFile("test/models/product-line.test.ts");
    await t.assertFile("test/fixtures/product_lines.yml");
    await t.assertMigration("db/migrate/create_product_lines.ts", /belongsTo\("product"/);
    await t.assertMigration("db/migrate/create_product_lines.ts", /references\("user"/);

    await t.assertFile("config/routes.ts", (route) => {
      expect(route).toMatch(/resources\("product_lines"\);$/m);
    });

    await t.assertFile("app/controllers/product-lines-controller.ts", async (content) => {
      expect(content).toMatch(/class ProductLinesController extends ApplicationController/);
      expect(content).not.toMatch(/respondTo/);

      expect(content).toMatch(
        /this\.beforeAction\("setProductLine", \{ only: \["show", "update", "destroy"\] \}\)/,
      );

      await t.assertInstanceMethod("index", content, (m) => {
        expect(m).toMatch(/this\.product_lines = await ProductLine\.all\(\)/);
        expect(m).toMatch(/render\(\{ json: this\.product_lines \}\)/);
      });

      await t.assertInstanceMethod("show", content, (m) => {
        expect(m).toMatch(/render\(\{ json: this\.product_line \}\)/);
      });

      await t.assertInstanceMethod("create", content, (m) => {
        expect(m).toMatch(/this\.product_line = new ProductLine\(this\.productLineParams\(\)\)/);
        expect(m).toMatch(/this\.product_line\.save\(\)/);
        expect(m).toMatch(/this\.product_line\.errors/);
      });

      await t.assertInstanceMethod("update", content, (m) => {
        expect(m).toMatch(/this\.product_line\.update\(this\.productLineParams\(\)\)/);
        expect(m).toMatch(/this\.product_line\.errors/);
      });

      await t.assertInstanceMethod("destroy", content, (m) => {
        expect(m).toMatch(/this\.product_line\.destroyBang\(\)/);
      });
    });

    await t.assertFile("test/controllers/product-lines-controller.test.ts", (test) => {
      expect(test).toMatch(/class ProductLinesControllerTest extends IntegrationTest/);
      expect(test).toMatch(
        /t\.post\(t\.productLinesUrl\(\), \{ params: \{ product_line: \{ product_id: t\["@product_line"\]\.product_id, title: t\["@product_line"\]\.title, user_id: t\["@product_line"\]\.user_id \} \}/,
      );
      expect(test).not.toMatch(/assertRedirectedTo/);
    });

    t.assertNoFile("test/system/product-lines.test.ts");

    t.assertNoFile("app/views/layouts/product-lines.html.tse");

    for (const view of ["index", "show", "new", "edit", "_form"]) {
      t.assertNoFile(`app/views/product-lines/${view}.html.tse`);
    }

    t.assertNoFile("app/helpers/product-lines-helper.ts");
  });

  it("functional tests without attributes", async () => {
    await t.runGenerator(["product_line"]);

    await t.assertFile("test/controllers/product-lines-controller.test.ts", (content) => {
      expect(content).toMatch(/class ProductLinesControllerTest extends IntegrationTest/);
      expect(content).toMatch(/it\("should get index"/);
      expect(content).toMatch(
        /t\.post\(t\.productLinesUrl\(\), \{ params: \{ product_line: \{\} \}/,
      );
      expect(content).toMatch(
        /t\.patch\(t\.productLineUrl\(t\["@product_line"\]\), \{ params: \{ product_line: \{\} \} \}/,
      );
    });
  });

  it.skip("system tests without attributes", () => {});

  it("scaffold on revoke", async () => {
    await t.runGenerator();
    await t.runGenerator(["product_line"], { behavior: "revoke" });

    t.assertNoFile("app/models/product-line.ts");
    t.assertNoFile("test/models/product-line.test.ts");
    t.assertNoFile("test/fixtures/product_lines.yml");
    t.assertNoMigration("db/migrate/create_product_lines.ts");

    await t.assertFile("config/routes.ts", (route) => {
      expect(route).not.toMatch(/resources\("product_lines"\);$/m);
    });

    t.assertNoFile("app/controllers/product-lines-controller.ts");
    t.assertNoFile("test/controllers/product-lines-controller.test.ts");

    t.assertNoFile("test/system/product-lines.test.ts");

    t.assertNoFile("app/views/product-lines");
    t.assertNoFile("app/views/layouts/product-lines.html.tse");

    t.assertNoFile("app/helpers/product-lines-helper.ts");
  });

  it("scaffold with namespace on invoke", async () => {
    await t.runGenerator(["admin/role", "name:string", "description:string"]);

    await t.assertFile("app/models/admin.ts", /export const Admin/);
    await t.assertFile("app/models/admin/role.ts", /class AdminRole extends ApplicationRecord/);
    await t.assertFile("test/models/admin/role.test.ts");
    await t.assertFile("test/fixtures/admin/roles.yml");
    await t.assertMigration("db/migrate/create_admin_roles.ts");

    await t.assertFile("config/routes.ts", (route) => {
      expect(route).toMatch(
        /^ {2}this\.namespace\("admin", \(\) => \{\n {4}this\.resources\("roles"\);\n {2}\}\);$/m,
      );
    });

    await t.assertFile("app/controllers/admin/roles-controller.ts", async (content) => {
      expect(content).toMatch(/class AdminRolesController extends ApplicationController/);

      await t.assertInstanceMethod("index", content, (m) => {
        expect(m).toMatch(/this\.admin_roles = await AdminRole\.all\(\)/);
      });

      await t.assertInstanceMethod("show", content);

      await t.assertInstanceMethod("new", content, (m) => {
        expect(m).toMatch(/this\.admin_role = new AdminRole\(\)/);
      });

      await t.assertInstanceMethod("edit", content);

      await t.assertInstanceMethod("create", content, (m) => {
        expect(m).toMatch(/this\.admin_role = new AdminRole\(this\.adminRoleParams\(\)\)/);
        expect(m).toMatch(/this\.admin_role\.save\(\)/);
      });

      await t.assertInstanceMethod("update", content, (m) => {
        expect(m).toMatch(/this\.admin_role\.update\(this\.adminRoleParams\(\)\)/);
      });

      await t.assertInstanceMethod("destroy", content, (m) => {
        expect(m).toMatch(/this\.admin_role\.destroyBang\(\)/);
      });

      await t.assertInstanceMethod("setAdminRole", content, (m) => {
        expect(m).toMatch(
          /this\.admin_role = await AdminRole\.find\(this\.params\.expect\("id"\)\)/,
        );
      });
    });

    await t.assertFile(
      "test/controllers/admin/roles-controller.test.ts",
      /class AdminRolesControllerTest extends IntegrationTest/,
    );

    await t.assertFile("app/views/admin/roles/index.html.tse", (content) => {
      expect(content).toMatch("for (const admin_role of this.admin_roles)");
      expect(content).toMatch("render(admin_role)");
      expect(content).toMatch('"Show this role", admin_role');
      expect(content).toMatch('"New role", newAdminRolePath()');
    });

    await t.assertFile("app/views/admin/roles/show.html.tse", (content) => {
      expect(content).toMatch("render(this.admin_role)");
      expect(content).toMatch('"Edit this role", editAdminRolePath(this.admin_role)');
      expect(content).toMatch('"Back to roles", adminRolesPath()');
      expect(content).toMatch('"Destroy this role", this.admin_role');
    });

    await t.assertFile("app/views/admin/roles/_role.html.tse", (content) => {
      expect(content).toMatch("role");
      expect(content).not.toMatch("admin_role");
    });

    await t.assertFile("app/views/admin/roles/new.html.tse", (content) => {
      expect(content).toMatch('render("form", { admin_role: this.admin_role })');
      expect(content).toMatch('"Back to roles", adminRolesPath()');
    });

    await t.assertFile("app/views/admin/roles/edit.html.tse", (content) => {
      expect(content).toMatch('render("form", { admin_role: this.admin_role })');
      expect(content).toMatch('"Show this role", this.admin_role');
      expect(content).toMatch('"Back to roles", adminRolesPath()');
    });

    await t.assertFile("app/views/admin/roles/_form.html.tse", (content) => {
      expect(content).toMatch("model: admin_role");
    });

    t.assertNoFile("app/views/layouts/admin/roles.html.tse");

    await t.assertFile("app/helpers/admin/roles-helper.ts");
  });

  it("scaffold with namespace on revoke", async () => {
    await t.runGenerator(["admin/role", "name:string", "description:string"]);
    await t.runGenerator(["admin/role"], { behavior: "revoke" });

    await t.assertFile("app/models/admin.ts");
    t.assertNoFile("app/models/admin/role.ts");
    t.assertNoFile("test/models/admin/role.test.ts");
    t.assertNoFile("test/fixtures/admin/roles.yml");
    t.assertNoMigration("db/migrate/create_admin_roles.ts");

    await t.assertFile("config/routes.ts", (route) => {
      expect(route).not.toMatch(/namespace\("admin"[^]*resources\("roles"\)/);
    });

    t.assertNoFile("app/controllers/admin/roles-controller.ts");
    t.assertNoFile("test/controllers/admin/roles-controller.test.ts");

    t.assertNoFile("test/system/admin/roles.test.ts");

    t.assertNoFile("app/views/admin/roles");
    t.assertNoFile("app/views/layouts/admin/roles.html.tse");

    t.assertNoFile("app/helpers/admin/roles-helper.ts");
  });

  it("scaffold generator on revoke does not mutilate legacy map parameter", async () => {
    await t.runGenerator();

    const routePath = File.expandPath("config/routes.ts", t.destinationRoot);
    const content = File.read(routePath).replace(
      /\.routes\(\)\.draw\(function \(\)/g,
      ".routes().draw(function (map)",
    );
    File.write(routePath, content);

    await t.runGenerator(["product_line"], { behavior: "revoke" });

    await t.assertFile("config/routes.ts", /\.routes\(\)\.draw\(function \(map\) \{\s*$/m);
  });

  it("scaffold generator on revoke does not mutilate routes", async () => {
    await t.runGenerator();

    const routePath = File.expandPath("config/routes.ts", t.destinationRoot);
    let content = File.read(routePath);

    content = content.replace(/^ {2}\/\/.*\n/gm, "");
    content = content.replace(/^ {2}this\.get\("up".*\n/gm, "");
    content = content.replace(/^\n/gm, "");

    File.write(routePath, content);
    await t.assertFile(
      "config/routes.ts",
      /\.routes\(\)\.draw\(function \(\) \{\n {2}this\.resources\("product_lines"\);\n\}\);\n$/,
    );

    await t.runGenerator(["product_line"], { behavior: "revoke" });

    await t.assertFile("config/routes.ts", /\.routes\(\)\.draw\(function \(\) \{\n\}\);\n$/);
  });

  it("scaffold generator ignores commented routes", async () => {
    await t.runGenerator(["product"]);
    await t.assertFile(
      "config/routes.ts",
      /\.routes\(\)\.draw\(function \(\) \{\n {2}this\.resources\("products"\);\n/,
    );
  });

  it("scaffold generator with switch resource route false", async () => {
    await t.runGenerator(["posts", "--resource-route=false"]);
    await t.assertFile("config/routes.ts", (route) => {
      expect(route).not.toMatch(/resources\("posts"\);$/m);
    });
  });

  it("scaffold generator no helper with switch no helper", async () => {
    const output = await t.runGenerator(["posts", "--no-helper"]);

    expect(output).not.toMatch(/error/);
    t.assertNoFile("app/helpers/posts-helper.ts");
  });

  it("scaffold generator no helper with switch helper false", async () => {
    const output = await t.runGenerator(["posts", "--helper=false"]);

    expect(output).not.toMatch(/error/);
    t.assertNoFile("app/helpers/posts-helper.ts");
  });

  it("scaffold generator outputs error message on missing attribute type", async () => {
    await t.runGenerator(["post", "title", "body:text", "author"]);

    await t.assertMigration("db/migrate/create_posts.ts", async (m) => {
      await t.assertMethod("change", m, (up) => {
        expect(up).toMatch(/t\.string\("title"\)/);
        expect(up).toMatch(/t\.text\("body"\)/);
        expect(up).toMatch(/t\.string\("author"\)/);
      });
    });
  });

  it("scaffold generator belongs to and references", async () => {
    await t.runGenerator(["account", "name", "currency:belongs_to", "user:references"]);

    await t.assertFile("app/models/account.ts", /belongsTo\("currency"\)/);

    await t.assertMigration("db/migrate/create_accounts.ts", async (m) => {
      await t.assertMethod("change", m, (up) => {
        expect(up).toMatch(/t\.string\("name"\)/);
        expect(up).toMatch(/t\.belongsTo\("currency"/);
      });
    });

    await t.assertFile("app/controllers/accounts-controller.ts", async (content) => {
      await t.assertInstanceMethod("accountParams", content, (m) => {
        expect(m).toMatch(/expect\(\{ account: \["name", "currency_id", "user_id"\] \}\)/);
      });
    });

    await t.assertFile("app/views/accounts/_form.html.tse", (content) => {
      expect(content).toMatch(/^\W{4}<%= form\.textField\("name"\) %>/m);
      expect(content).toMatch(/^\W{4}<%= form\.textField\("currency_id"\) %>/m);
    });

    await t.assertFile("app/views/accounts/index.html.tse", (content) => {
      expect(content).toMatch(/^\W{2}<% for \(const account of this\.accounts\) \{ %>/m);
      expect(content).toMatch(/^\W{4}<%= render\(account\) %>/m);
      expect(content).toMatch(/<%= linkTo\("Show this account", account\) %>/);
    });

    await t.assertFile("app/views/accounts/show.html.tse", (content) => {
      expect(content).toMatch(/<%= render\(this\.account\) %>/);
      expect(content).toMatch(/linkTo\("Edit this account"/);
      expect(content).toMatch(/buttonTo\("Destroy this account"/);
      expect(content).toMatch(/linkTo\("Back to accounts"/);
    });
  });

  it("scaffold generator attachments", async () => {
    await t.runGenerator([
      "message",
      "video:attachment",
      "photos:attachments",
      "images:attachments",
    ]);

    await t.assertFile("app/models/message.ts", /hasOneAttached\("video"\)/);
    await t.assertFile("app/models/message.ts", /hasManyAttached\("photos"\)/);

    await t.assertFile("app/controllers/messages-controller.ts", async (content) => {
      await t.assertInstanceMethod("messageParams", content, (m) => {
        expect(m).toMatch(/expect\(\{ message: \["video", \{ photos: \[\], images: \[\] \}\] \}\)/);
      });
    });

    await t.assertFile("app/views/messages/_form.html.tse", (content) => {
      expect(content).toMatch(/^\W{4}<%= form\.fileField\("video"\) %>/m);
      expect(content).toMatch(/^\W{4}<%= form\.fileField\("photos", \{ multiple: true \}\) %>/m);
    });

    await t.assertFile("app/views/messages/_message.html.tse", (content) => {
      expect(content).toMatch(
        /^\W{4}<%= message\.video\.isAttached\(\) \? linkTo\(message\.video\.filename, message\.video\) : null %>/m,
      );
      expect(content).toMatch(/^\W{6}<div><%= linkTo\(photo\.filename, photo\) %>/m);
    });
  });

  it("scaffold generator rich text", async () => {
    await t.runGenerator(["message", "content:rich_text"]);

    await t.assertFile("app/models/message.ts", /hasRichText\("content"\)/);

    await t.assertFile("app/controllers/messages-controller.ts", async (content) => {
      await t.assertInstanceMethod("messageParams", content, (m) => {
        expect(m).toMatch(/expect\(\{ message: \["content"\] \}\)/);
      });
    });

    await t.assertFile("app/views/messages/_form.html.tse", (content) => {
      expect(content).toMatch(/^\W{4}<%= form\.richTextarea\("content"\) %>/m);
    });
  });

  it.skip("scaffold generator multi db abstract class", () => {});

  it.skip("scaffold generator database with aliases", () => {});

  it("scaffold generator password digest", async () => {
    await t.runGenerator(["user", "name", "password:digest"]);

    await t.assertFile("app/models/user.ts", /hasSecurePassword/);

    await t.assertMigration("db/migrate/create_users.ts", async (m) => {
      await t.assertMethod("change", m, (up) => {
        expect(up).toMatch(/t\.string\("name"\)/);
        expect(up).toMatch(/t\.string\("password_digest"\)/);
      });
    });

    await t.assertFile("app/controllers/users-controller.ts", async (content) => {
      await t.assertInstanceMethod("userParams", content, (m) => {
        expect(m).toMatch(/expect\(\{ user: \["name", "password", "password_confirmation"\] \}\)/);
      });
    });

    await t.assertFile("app/views/users/_form.html.tse", (content) => {
      expect(content).toMatch(/<%= form\.passwordField\("password"\) %>/);
      expect(content).toMatch(/<%= form\.passwordField\("password_confirmation"\) %>/);
    });

    await t.assertFile("app/views/users/index.html.tse", (content) => {
      expect(content).not.toMatch(/password/);
    });

    await t.assertFile("app/views/users/show.html.tse", (content) => {
      expect(content).not.toMatch(/password/);
    });

    await t.assertFile("test/controllers/users-controller.test.ts", (content) => {
      expect(content).toMatch(/password: "secret"/);
      expect(content).toMatch(/password_confirmation: "secret"/);
    });

    await t.assertFile("test/fixtures/users.yml", (content) => {
      expect(content).toMatch(/password_digest: <%= BCrypt\.Password\.create\("secret"\) %>/);
    });
  });

  it.skip("scaffold tests pass by default inside mountable engine", () => {});
  it.skip("scaffold tests pass by default inside namespaced mountable engine", () => {});
  it.skip("scaffold tests pass by default inside full engine", () => {});
  it.skip("scaffold tests pass by default inside api mountable engine", () => {});
  it.skip("scaffold tests pass by default inside api full engine", () => {});
  it.skip("scaffold on invoke inside mountable engine", () => {});
  it.skip("scaffold on revoke inside mountable engine", () => {});
});
