import { File, Dir } from "@blazetrails/ruby-compat";
import { assertMatch, assertNoMatch, capture } from "@blazetrails/activesupport";
import { registerSpecType } from "@blazetrails/activesupport/testing/autorun";
import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { parse as yamlLoad } from "@blazetrails/ruby-compat/psych-adapter";
import { Base, setTimestampedMigrations } from "@blazetrails/activerecord";
import { ModelHelpers } from "./model-helpers.js";
import { Application } from "../application.js";
import { Trails } from "../trails.js";
import "../trailties/active-record.js";
import "../test-unit/trailtie.js";
import { copyRoutes, withDatabaseConfiguration } from "./generators-test-helper.js";
import { TestCase } from "./test-case.js";

class ModelGeneratorApp extends Application {}
class ModelGeneratorTest extends TestCase {}
ModelGeneratorTest.destination(Dir.mktmpdir());
ModelGeneratorTest.arguments(["Account", "name:string", "age:integer"]);
registerSpecType(/^ModelGeneratorTest$/, ModelGeneratorTest);
let ModelGenerator: typeof import("./trails/model/model-generator.js").ModelGenerator;
let t: TestCase & { generatorClass?: typeof ModelGenerator };
let oldBelongsToRequiredByDefault: boolean | undefined;

beforeAll(async () => {
  await ModelGeneratorApp.instance().loadGenerators();
  ({ ModelGenerator } = await import("./trails/model/model-generator.js"));
  ModelGeneratorTest.tests(ModelGenerator);
});

beforeEach(async (context) => {
  t = context.testCase as typeof t;
  t.prepareDestination();
  File.write(File.join(t.destinationRoot, "tsconfig.json"), "{}");
  await copyRoutes.call(t);
  Trails.application = ModelGeneratorApp.instance();
  ModelHelpers.skipWarn = false;
  oldBelongsToRequiredByDefault = Trails.application.config.activeRecord.belongsToRequiredByDefault;
  Trails.application.config.activeRecord.belongsToRequiredByDefault = true;
  await Trails.application.loadGenerators();
});

afterEach(() => {
  Trails.application!.config.activeRecord.belongsToRequiredByDefault =
    oldBelongsToRequiredByDefault;
});

function assertGeneratedFixture(relative: string, parsedContents: unknown): void {
  expect(yamlLoad(File.read(File.join(t.destinationRoot, relative)))).toEqual(parsedContents);
}

describe("ModelGeneratorTest", () => {
  it("help shows invoked generators options", async () => {
    const content = String(await t.runGenerator(["--help"]));
    assertMatch(/ActiveRecord options:/, content);
    assertMatch(/TestUnit options:/, content);
  });

  it("model with missing attribute type", async () => {
    await t.runGenerator(["post", "title", "body:text", "author"]);

    await t.assertMigration("db/migrate/create_posts.ts", (m) =>
      t.assertMethod("change", m, (up) => {
        assertMatch(/t\.string\("title"\)/, up);
        assertMatch(/t\.text\("body"\)/, up);
        assertMatch(/t\.string\("author"\)/, up);
      }),
    );
  });

  it.skip("migration source paths", () => {});

  it("invokes default orm", async () => {
    await t.runGenerator(["Account", "name:string", "age:integer"]);
    await t.assertFile("app/models/account.ts", /class Account extends ApplicationRecord/);
  });

  it("model with parent option", async () => {
    await t.runGenerator(["account", "--parent=Admin::Account"]);
    await t.assertFile("app/models/account.ts", /class Account extends AdminAccount/);
    t.assertNoMigration("db/migrate/create_accounts.ts");
  });

  it("model with database option", async () => {
    await withDatabaseConfiguration(undefined, async () => {
      await t.runGenerator(["account", "--database", "secondary"]);
      await t.assertFile(
        "app/models/secondary-record.ts",
        /class SecondaryRecord extends ApplicationRecord/,
      );
      await t.assertFile("app/models/account.ts", /class Account extends SecondaryRecord/);
      await t.assertMigration(
        "db/secondary_migrate/create_accounts.ts",
        /class CreateAccounts extends Migration\.get\([0-9.]+\)/,
      );
    });
  });

  it("model with parent and database option", async () => {
    await withDatabaseConfiguration(undefined, async () => {
      await t.runGenerator(["account", "--parent", "Admin::Account", "--database", "secondary"]);
      await t.assertFile("app/models/account.ts", /class Account extends AdminAccount/);
      await t.assertMigration(
        "db/secondary_migrate/create_accounts.ts",
        /class CreateAccounts extends Migration\.get\([0-9.]+\)/,
      );
    });
  });

  it("model with no migration and database option", async () => {
    await withDatabaseConfiguration(undefined, async () => {
      await t.runGenerator(["account", "--migration", "false", "--database", "secondary"]);
      await t.assertFile("app/models/account.ts", /class Account extends SecondaryRecord/);
      t.assertNoMigration("db/secondary_migrate/create_accounts.ts");
    });
  });

  it("model with no migration option", async () => {
    await t.runGenerator(["account", "--no-migration"]);
    await t.assertFile("app/models/account.ts", /class Account extends ApplicationRecord/);
    t.assertNoMigration("db/migrate/create_accounts.ts");
  });

  it("model with parent option database option and no migration option", async () => {
    await withDatabaseConfiguration(undefined, async () => {
      await t.runGenerator([
        "account",
        "--migration",
        "false",
        "--database",
        "secondary",
        "--migration",
        "false",
        "--parent",
        "Admin::Account",
      ]);
      await t.assertFile("app/models/account.ts", /class Account extends AdminAccount/);
      t.assertNoMigration("db/secondary_migrate/create_accounts.ts");
    });
  });

  it("model with underscored database option", async () => {
    await withDatabaseConfiguration("admin_accounts", async () => {
      await t.runGenerator(["account", "--database", "admin_accounts"]);
      await t.assertFile(
        "app/models/admin-accounts-record.ts",
        /class AdminAccountsRecord extends ApplicationRecord/,
      );
      await t.assertFile("app/models/account.ts", /class Account extends AdminAccountsRecord/);
      await t.assertMigration(
        "db/admin_accounts_migrate/create_accounts.ts",
        /class CreateAccounts extends Migration\.get\([0-9.]+\)/,
      );
    });
  });

  it("plural names are singularized", async () => {
    const content = String(await t.runGenerator(["accounts"]));
    await t.assertFile("app/models/account.ts", /class Account extends ApplicationRecord/);
    await t.assertFile("test/models/account.test.ts", /describe\("AccountTest"/);
    assertMatch(
      /\[WARNING\] The model name 'accounts' was recognized as a plural, using the singular 'account' instead\. Override with --force-plural or setup custom inflection rules for this noun before running the generator\./,
      content,
    );
  });

  it("unknown inflection rule are warned", async () => {
    const content = String(await t.runGenerator(["porsche"]));
    assertMatch(
      /\[WARNING\] Trails cannot recover singular form from its plural form 'porsches'\.\nPlease setup custom inflection rules for this noun before running the generator in config\/initializers\/inflections\.rb\./,
      content,
    );
    await t.assertFile("app/models/porsche.ts", /class Porsche extends ApplicationRecord/);

    const uncountableContent = String(await t.runGenerator(["sheep"]));
    assertNoMatch(
      /\[WARNING\] Trails cannot recover singular form from its plural form/,
      uncountableContent,
    );

    const regularContent = String(await t.runGenerator(["account"]));
    assertNoMatch(
      /\[WARNING\] Trails cannot recover singular form from its plural form/,
      regularContent,
    );
  });

  it("impossible inflection rules raises an error", async () => {
    const content = await capture("stderr", () => t.runGenerator(["BFF"]));
    assertMatch(
      /Trails cannot recover the underscored form from its camelcase form 'BFF'\./,
      content,
    );
  });

  it("model with underscored parent option", async () => {
    await t.runGenerator(["account", "--parent", "admin/account"]);
    await t.assertFile("app/models/account.ts", /class Account extends AdminAccount/);
  });

  it("model with namespace", async () => {
    await t.runGenerator(["admin/account"]);
    await t.assertFile("app/models/admin.ts", /export const Admin = \{/);
    await t.assertFile("app/models/admin.ts", /get tableNamePrefix\(\)/);
    await t.assertFile("app/models/admin.ts", /"admin_"/);
    await t.assertFile(
      "app/models/admin/account.ts",
      /export class Account extends ApplicationRecord/,
    );
  });

  it("migration", async () => {
    await t.runGenerator(["Account", "name:string", "age:integer"]);
    await t.assertMigration(
      "db/migrate/create_accounts.ts",
      /class CreateAccounts extends Migration\.get\(8\.0\)/,
    );
  });

  it("migration with namespace", async () => {
    await t.runGenerator(["Gallery::Image"]);
    await t.assertMigration(
      "db/migrate/create_gallery_images.ts",
      /class CreateGalleryImages extends Migration\.get\([0-9.]+\)/,
    );
    t.assertNoMigration("db/migrate/create_images.ts");
  });

  it("migration with nested namespace", async () => {
    await t.runGenerator(["Admin::Gallery::Image"]);
    t.assertNoMigration("db/migrate/create_images.ts");
    t.assertNoMigration("db/migrate/create_gallery_images.ts");
    await t.assertMigration(
      "db/migrate/create_admin_gallery_images.ts",
      /class CreateAdminGalleryImages extends Migration\.get\([0-9.]+\)/,
    );
    await t.assertMigration(
      "db/migrate/create_admin_gallery_images.ts",
      /createTable\("admin_gallery_images"/,
    );
  });

  it("migration with nested namespace without pluralization", async () => {
    Base.pluralizeTableNames = false;
    try {
      await t.runGenerator(["Admin::Gallery::Image"]);
      t.assertNoMigration("db/migrate/create_images.ts");
      t.assertNoMigration("db/migrate/create_gallery_images.ts");
      t.assertNoMigration("db/migrate/create_admin_gallery_images.ts");
      await t.assertMigration(
        "db/migrate/create_admin_gallery_image.ts",
        /class CreateAdminGalleryImage extends Migration\.get\([0-9.]+\)/,
      );
      await t.assertMigration(
        "db/migrate/create_admin_gallery_image.ts",
        /createTable\("admin_gallery_image"/,
      );
    } finally {
      Base.pluralizeTableNames = true;
    }
  });

  it("migration with namespaces in model name without pluralization", async () => {
    Base.pluralizeTableNames = false;
    try {
      await t.runGenerator(["Gallery::Image"]);
      await t.assertMigration(
        "db/migrate/create_gallery_image.ts",
        /class CreateGalleryImage extends Migration\.get\([0-9.]+\)/,
      );
      t.assertNoMigration("db/migrate/create_gallery_images.ts");
    } finally {
      Base.pluralizeTableNames = true;
    }
  });

  it("migration without pluralization", async () => {
    Base.pluralizeTableNames = false;
    try {
      await t.runGenerator();
      await t.assertMigration(
        "db/migrate/create_account.ts",
        /class CreateAccount extends Migration\.get\([0-9.]+\)/,
      );
      t.assertNoMigration("db/migrate/create_accounts.ts");
    } finally {
      Base.pluralizeTableNames = true;
    }
  });

  it("migration is skipped", async () => {
    await t.runGenerator(["account", "--no-migration"]);
    t.assertNoMigration("db/migrate/create_accounts.ts");
  });

  it("migration with attributes", async () => {
    await t.runGenerator(["product", "name:string", "supplier_id:integer"]);

    await t.assertMigration("db/migrate/create_products.ts", (m) =>
      t.assertMethod("change", m, (up) => {
        assertMatch(/createTable\("products"/, up);
        assertMatch(/t\.string\("name"\)/, up);
        assertMatch(/t\.integer\("supplier_id"\)/, up);
      }),
    );
  });

  it("migration with attributes and with index", async () => {
    await t.runGenerator([
      "product",
      "name:string:index",
      "supplier_id:integer:index",
      "user_id:integer:uniq",
      "order_id:uniq",
    ]);

    await t.assertMigration("db/migrate/create_products.ts", (m) =>
      t.assertMethod("change", m, (up) => {
        assertMatch(/createTable\("products"/, up);
        assertMatch(/t\.string\("name"\)/, up);
        assertMatch(/t\.integer\("supplier_id"\)/, up);
        assertMatch(/t\.integer\("user_id"\)/, up);
        assertMatch(/t\.string\("order_id"\)/, up);

        assertMatch(/addIndex\("products", "name"/, up);
        assertMatch(/addIndex\("products", "supplier_id"/, up);
        assertMatch(/addIndex\("products", "user_id", \{ unique: true \}/, up);
        assertMatch(/addIndex\("products", "order_id", \{ unique: true \}/, up);
      }),
    );
  });

  it("migration with missing attribute type and with index", async () => {
    await t.runGenerator(["product", "name:index", "supplier_id:integer:index", "year:integer"]);

    await t.assertMigration("db/migrate/create_products.ts", (m) =>
      t.assertMethod("change", m, (up) => {
        assertMatch(/createTable\("products"/, up);
        assertMatch(/t\.string\("name"\)/, up);
        assertMatch(/t\.integer\("supplier_id"\)/, up);

        assertMatch(/addIndex\("products", "name"/, up);
        assertMatch(/addIndex\("products", "supplier_id"/, up);
        assertNoMatch(/addIndex\("products", "year"/, up);
      }),
    );
  });

  it("add migration with attributes index declaration and attribute options", async () => {
    await t.runGenerator([
      "product",
      "title:string{40}:index",
      "content:string{255}",
      "price:decimal{5,2}:index",
      "discount:decimal{5,2}:uniq",
      "supplier:references{polymorphic}",
    ]);

    await t.assertMigration("db/migrate/create_products.ts", async (content) => {
      await t.assertMethod("change", content, (up) => {
        assertMatch(/createTable\("products"/, up);
        assertMatch(/t.string\("title", \{ limit: 40 \}\)/, up);
        assertMatch(/t.string\("content", \{ limit: 255 \}\)/, up);
        assertMatch(/t.decimal\("price", \{ precision: 5, scale: 2 \}\)/, up);
        assertMatch(/t.references\("supplier", \{ polymorphic: true/, up);
      });
      assertMatch(/addIndex\("products", "title"/, content);
      assertMatch(/addIndex\("products", "price"/, content);
      assertMatch(/addIndex\("products", "discount", \{ unique: true \}/, content);
    });
  });

  it("migration without timestamps", async () => {
    try {
      setTimestampedMigrations(false);
      await t.runGenerator(["account"]);
      await t.assertFile(
        "db/migrate/001_create_accounts.ts",
        /class CreateAccounts extends Migration\.get\([0-9.]+\)/,
      );

      await t.runGenerator(["project"]);
      await t.assertFile(
        "db/migrate/002_create_projects.ts",
        /class CreateProjects extends Migration\.get\([0-9.]+\)/,
      );
    } finally {
      setTimestampedMigrations(true);
    }
  });

  it("migration with configured path", async () => {
    const oldPaths = Trails.application!.config.paths().get("db/migrate");
    Trails.application!.config.paths().add("db/migrate", { with: "db2/migrate" });

    try {
      await t.runGenerator();

      await t.assertMigration(
        "db2/migrate/create_accounts.ts",
        /class CreateAccounts extends Migration\.get\([0-9.]+\)/,
      );
    } finally {
      Trails.application!.config.paths()._entries.set("db/migrate", oldPaths!);
    }
  });

  it("migration with timestamps", async () => {
    await t.runGenerator(["Account", "name:string", "age:integer"]);
    await t.assertMigration("db/migrate/create_accounts.ts", /t\.timestamps/);
  });

  it("migration timestamps are skipped", async () => {
    await t.runGenerator(["account", "--no-timestamps"]);

    await t.assertMigration("db/migrate/create_accounts.ts", (m) =>
      t.assertMethod("change", m, (up) => {
        assertNoMatch(/t\.timestamps/, up);
      }),
    );
  });

  it("migration is skipped with skip option", async () => {
    await t.runGenerator(["Account", "name:string", "age:integer"]);
    const output = String(await t.runGenerator(["Account", "--skip"]));
    assertMatch(/skip\s+db\/migrate\/\d+_create_accounts\.ts/, output);
  });

  it("migration is ignored as identical with skip option", async () => {
    await t.runGenerator(["Account"]);
    const output = String(await t.runGenerator(["Account", "--skip"]));
    assertMatch(/identical\s+db\/migrate\/\d+_create_accounts\.ts/, output);
  });

  it("migration is skipped on skip behavior", async () => {
    await t.runGenerator(["Account", "name:string", "age:integer"]);
    const output = String(await t.runGenerator(["Account"], { behavior: "skip" }));
    assertMatch(/skip\s+db\/migrate\/\d+_create_accounts\.ts/, output);
  });

  it("migration error is not shown on revoke", async () => {
    await t.runGenerator(["Account"]);
    const error = String(await t.runGenerator(["Account"], { behavior: "revoke" }));
    assertNoMatch(/Another migration is already named create_accounts/, error);
  });

  it("migration is removed on revoke", async () => {
    await t.runGenerator(["Account"]);
    await t.runGenerator(["Account"], { behavior: "revoke" });
    t.assertNoMigration("db/migrate/create_accounts.ts");
  });

  it("existing migration is removed on force", async () => {
    await t.runGenerator(["Account", "name:string", "age:integer"]);
    const oldMigration = Dir.glob(`${t.destinationRoot}/db/migrate/*_create_accounts.ts`)[0];
    const error = String(await t.runGenerator(["Account", "--force"]));
    assertNoMatch(/Another migration is already named create_accounts/, error);
    t.assertNoFile(oldMigration);
    await t.assertMigration("db/migrate/create_accounts.ts");
  });

  it("invokes default test framework", async () => {
    await t.runGenerator(["Account", "name:string", "age:integer"]);
    await t.assertFile("test/models/account.test.ts", /describe\("AccountTest"/);

    await t.assertFile("test/fixtures/accounts.yml", /name: MyString/, /age: 1/);
    assertGeneratedFixture("test/fixtures/accounts.yml", {
      one: { name: "MyString", age: 1 },
      two: { name: "MyString", age: 1 },
    });
  });

  it("fixtures use the references ids", async () => {
    await t.runGenerator(["LineItem", "product:references", "cart:belongs_to"]);

    await t.assertFile("test/fixtures/line_items.yml", /product: one\n {2}cart: one/);
    assertGeneratedFixture("test/fixtures/line_items.yml", {
      one: { product: "one", cart: "one" },
      two: { product: "two", cart: "two" },
    });
  });

  it("fixtures use the references ids and type", async () => {
    await t.runGenerator(["LineItem", "product:references{polymorphic}", "cart:belongs_to"]);

    await t.assertFile(
      "test/fixtures/line_items.yml",
      /product: one\n {2}product_type: Product\n {2}cart: one/,
    );
    assertGeneratedFixture("test/fixtures/line_items.yml", {
      one: { product: "one", product_type: "Product", cart: "one" },
      two: { product: "two", product_type: "Product", cart: "two" },
    });
  });

  it("fixtures respect reserved yml keywords", async () => {
    await t.runGenerator(["LineItem", "no:integer", "Off:boolean", "ON:boolean"]);

    assertGeneratedFixture("test/fixtures/line_items.yml", {
      one: { no: 1, Off: false, ON: false },
      two: { no: 1, Off: false, ON: false },
    });
  });

  it("fixture is skipped", async () => {
    await t.runGenerator(["account", "--skip-fixture"]);
    t.assertNoFile("test/fixtures/accounts.yml");
  });

  it("fixture is skipped if fixture replacement is given", async () => {
    const content = String(await t.runGenerator(["account", "-r", "factory_girl"]));
    assertMatch(/factory_girl \[not found\]/, content);
    t.assertNoFile("test/fixtures/accounts.yml");
  });

  it("fixture without pluralization", async () => {
    const originalPluralizeTableName = Base.pluralizeTableNames;
    Base.pluralizeTableNames = false;
    try {
      await t.runGenerator(["Account", "name:string", "age:integer"]);
      assertGeneratedFixture("test/fixtures/account.yml", {
        one: { name: "MyString", age: 1 },
        two: { name: "MyString", age: 1 },
      });
    } finally {
      Base.pluralizeTableNames = originalPluralizeTableName;
    }
  });

  it("check class collision", async () => {
    const content = await capture("stderr", () => t.runGenerator(["object"]));
    assertMatch(
      /The name 'Object' is either already used in your application or reserved/,
      content,
    );
  });

  it("index is skipped for belongs to association", async () => {
    await t.runGenerator(["account", "supplier:belongs_to", "--no-indexes"]);

    await t.assertMigration("db/migrate/create_accounts.ts", (m) =>
      t.assertMethod("change", m, (up) => {
        assertNoMatch(/index: true/, up);
      }),
    );
  });

  it("index is skipped for references association", async () => {
    await t.runGenerator(["account", "supplier:references", "--no-indexes"]);

    await t.assertMigration("db/migrate/create_accounts.ts", (m) =>
      t.assertMethod("change", m, (up) => {
        assertNoMatch(/index: true/, up);
      }),
    );
  });

  it("add uuid to create table migration", async () => {
    await t.runGenerator(["account", "--primary-key-type=uuid"]);
    await t.assertMigration("db/migrate/create_accounts.ts", (content) =>
      t.assertMethod("change", content, (change) => {
        assertMatch(/createTable\("accounts", \{ id: "uuid" \}/, change);
      }),
    );
  });

  it("database puts migrations in configured folder", async () => {
    await withDatabaseConfiguration(undefined, async () => {
      await t.runGenerator(["account", "--database=secondary"]);
      await t.assertMigration("db/secondary_migrate/create_accounts.ts", (content) =>
        t.assertMethod("change", content, (change) => {
          assertMatch(/createTable\("accounts"/, change);
        }),
      );
    });
  });

  it("database puts migrations in configured folder with aliases", async () => {
    await withDatabaseConfiguration(undefined, async () => {
      await t.runGenerator(["account", "--db=secondary"]);
      await t.assertMigration("db/secondary_migrate/create_accounts.ts", (content) =>
        t.assertMethod("change", content, (change) => {
          assertMatch(/createTable\("accounts"/, change);
        }),
      );
    });
  });

  it("model with references attribute generates belongs to associations", async () => {
    await t.runGenerator(["product", "name:string", "supplier:references"]);
    await t.assertFile("app/models/product.ts", /this\.belongsTo\("supplier"/);
  });

  it("model with belongs to attribute generates belongs to associations", async () => {
    await t.runGenerator(["product", "name:string", "supplier:belongs_to"]);
    await t.assertFile("app/models/product.ts", /this\.belongsTo\("supplier"/);
  });

  it("model with polymorphic references attribute generates belongs to associations", async () => {
    await t.runGenerator(["product", "name:string", "supplier:references{polymorphic}"]);
    await t.assertFile(
      "app/models/product.ts",
      /this\.belongsTo\("supplier", \{ polymorphic: true \}\)/,
    );
  });

  it("model with polymorphic belongs to attribute generates belongs to associations", async () => {
    await t.runGenerator(["product", "name:string", "supplier:belongs_to{polymorphic}"]);
    await t.assertFile(
      "app/models/product.ts",
      /this\.belongsTo\("supplier", \{ polymorphic: true \}\)/,
    );
  });

  it("polymorphic belongs to generates correct model", async () => {
    await t.runGenerator(["account", "supplier:references{polymorphic}"]);

    const expectedFile = `import { ApplicationRecord } from "./application-record.ts";

export class Account extends ApplicationRecord {
  static toString(): string {
    return "Account";
  }

  static {
    this.belongsTo("supplier", { polymorphic: true });
  }
}
`;
    await t.assertFile("app/models/account.ts", expectedFile);
  });

  it("null false is added for references by default", async () => {
    await t.runGenerator(["account", "user:references"]);

    await t.assertMigration("db/migrate/create_accounts.ts", (m) =>
      t.assertMethod("change", m, (up) => {
        assertMatch(/t\.references\("user",.*\snull: false/, up);
      }),
    );
  });

  it("null false is added for belongs to by default", async () => {
    await t.runGenerator(["account", "user:belongs_to"]);

    await t.assertMigration("db/migrate/create_accounts.ts", (m) =>
      t.assertMethod("change", m, (up) => {
        assertMatch(/t\.belongsTo\("user",.*\snull: false/, up);
      }),
    );
  });

  it("null false is not added when belongs to required by default global config is false", async () => {
    Trails.application!.config.activeRecord.belongsToRequiredByDefault = false;

    await t.runGenerator(["account", "user:belongs_to"]);

    await t.assertMigration("db/migrate/create_accounts.ts", (m) =>
      t.assertMethod("change", m, (up) => {
        assertMatch(/t\.belongsTo\("user"/, up);
      }),
    );
  });

  it("foreign key is not added for non references", async () => {
    await t.runGenerator(["account", "supplier:string"]);

    await t.assertMigration("db/migrate/create_accounts.ts", (m) =>
      t.assertMethod("change", m, (up) => {
        assertNoMatch(/foreignKey/, up);
      }),
    );
  });

  it("foreign key is added for references", async () => {
    await t.runGenerator(["account", "supplier:belongs_to", "user:references"]);

    await t.assertMigration("db/migrate/create_accounts.ts", (m) =>
      t.assertMethod("change", m, (up) => {
        assertMatch(/t\.belongsTo\("supplier",.*\sforeignKey: true/, up);
        assertMatch(/t\.references\("user",.*\sforeignKey: true/, up);
      }),
    );
  });

  it("foreign key is skipped for polymorphic references", async () => {
    await t.runGenerator(["account", "supplier:belongs_to{polymorphic}"]);

    await t.assertMigration("db/migrate/create_accounts.ts", (m) =>
      t.assertMethod("change", m, (up) => {
        assertNoMatch(/foreignKey/, up);
      }),
    );
  });

  it("token option adds has secure token", async () => {
    await t.runGenerator(["user", "token:token", "auth_token:token"]);

    const expectedFile = `import { ApplicationRecord } from "./application-record.ts";

export class User extends ApplicationRecord {
  static toString(): string {
    return "User";
  }

  static {
    this.hasSecureToken();
    this.hasSecureToken("auth_token");
  }
}
`;
    await t.assertFile("app/models/user.ts", expectedFile);
  });

  it("model with rich text attribute adds has rich text", async () => {
    await t.runGenerator(["message", "content:rich_text"]);

    const expectedFile = `import { ApplicationRecord } from "./application-record.ts";

export class Message extends ApplicationRecord {
  static toString(): string {
    return "Message";
  }

  static {
    this.hasRichText("content");
  }
}
`;
    await t.assertFile("app/models/message.ts", expectedFile);
  });

  it("model with attachment attribute adds has one attached", async () => {
    await t.runGenerator(["message", "video:attachment"]);

    const expectedFile = `import { ApplicationRecord } from "./application-record.ts";

export class Message extends ApplicationRecord {
  static toString(): string {
    return "Message";
  }

  static {
    this.hasOneAttached("video");
  }
}
`;
    await t.assertFile("app/models/message.ts", expectedFile);
  });

  it("model with attachments attribute adds has many attached", async () => {
    await t.runGenerator(["message", "photos:attachments"]);

    const expectedFile = `import { ApplicationRecord } from "./application-record.ts";

export class Message extends ApplicationRecord {
  static toString(): string {
    return "Message";
  }

  static {
    this.hasManyAttached("photos");
  }
}
`;
    await t.assertFile("app/models/message.ts", expectedFile);
  });

  it("skip virtual fields in fixtures", async () => {
    await t.runGenerator([
      "message",
      "content:rich_text",
      "video:attachment",
      "photos:attachments",
    ]);

    assertGeneratedFixture("test/fixtures/messages.yml", { one: null, two: null });
  });
});
