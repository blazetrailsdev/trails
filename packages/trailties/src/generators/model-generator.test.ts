import { describe, it, expect, beforeAll, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import * as Assertions from "./testing/assertions.js";
import { assertMatch, assertNoMatch } from "@blazetrails/activesupport";
import { Dir } from "@blazetrails/ruby-compat";
import { ModelHelpers } from "./model-helpers.js";
import { Application } from "../application.js";
import { Trails } from "../rails.js";
import "../trailties/active-record.js";
import "../test-unit/trailtie.js";
import { parse as yamlLoad } from "@blazetrails/activesupport/yaml";
import { Base } from "@blazetrails/activerecord";

class ModelGeneratorTestApp extends Application {}
let ModelGenerator: typeof import("./rails/model/model-generator.js").ModelGenerator;

beforeAll(async () => {
  await ModelGeneratorTestApp.instance().loadGenerators();
  ({ ModelGenerator } = await import("./rails/model/model-generator.js"));
});
let oldBelongsToRequiredByDefault: boolean | undefined;

let tmpDir: string;
let lines: string[];
const destination = { destinationRoot: "" };
const assertNoMigration = Assertions.assertNoMigration.bind(destination);
const assertNoFile = Assertions.assertNoFile.bind(destination);
const assertMigration = Assertions.assertMigration.bind(destination);
const assertFile = Assertions.assertFile.bind(destination);
const { assertMethod } = Assertions;

beforeEach(async () => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "trails-test-"));
  fs.writeFileSync(path.join(tmpDir, "tsconfig.json"), "{}");
  destination.destinationRoot = tmpDir;
  lines = [];
  Trails.application = ModelGeneratorTestApp.instance();
  oldBelongsToRequiredByDefault = Trails.application.config.activeRecord.belongsToRequiredByDefault;
  Trails.application.config.activeRecord.belongsToRequiredByDefault = true;
  await Trails.application.loadGenerators();
  ModelHelpers.skipWarn = false;
});

afterEach(() => {
  Trails.application!.config.activeRecord.belongsToRequiredByDefault =
    oldBelongsToRequiredByDefault;
  Trails.application = null;
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

function listFiles(root: string): string[] {
  return (fs.readdirSync(root, { recursive: true }) as string[]).filter((f) =>
    fs.statSync(path.join(root, f)).isFile(),
  );
}

function makeGen(config: object = {}) {
  return {
    run: async (name: string, args: string[], flags: string[] = []) => {
      await ModelGenerator.start([name, ...args, ...flags], {
        cwd: tmpDir,
        output: (m) => lines.push(m),
        ...config,
      });
      return listFiles(tmpDir);
    },
  };
}

function assertGeneratedFixture(relative: string, parsedContents: unknown): void {
  expect(yamlLoad(fs.readFileSync(path.join(tmpDir, relative), "utf-8"))).toEqual(parsedContents);
}

describe("ModelGeneratorTest", () => {
  it.skip("help shows invoked generators options", () => {});

  it("model with missing attribute type", async () => {
    await makeGen().run("post", ["title", "body:text", "author"]);

    await assertMigration("db/migrate/create_posts.ts", (m) =>
      assertMethod("change", m, (up) => {
        assertMatch(/t\.string\("title"\)/, up);
        assertMatch(/t\.text\("body"\)/, up);
        assertMatch(/t\.string\("author"\)/, up);
      }),
    );
  });

  it.skip("migration source paths", () => {});

  it("invokes default orm", async () => {
    await makeGen().run("Account", ["name:string", "age:integer"]);
    await assertFile("app/models/account.ts", /class Account extends ApplicationRecord/);
  });

  it("model with parent option", async () => {
    await makeGen().run("account", [], ["--parent=Admin::Account"]);
    await assertFile("app/models/account.ts", /class Account extends AdminAccount/);
    assertNoMigration("db/migrate/create_accounts.ts");
  });

  it.skip("model with database option", () => {});

  it.skip("model with parent and database option", () => {});

  it.skip("model with no migration and database option", () => {});

  it("model with no migration option", async () => {
    await makeGen().run("account", [], ["--no-migration"]);
    await assertFile("app/models/account.ts", /class Account extends ApplicationRecord/);
    assertNoMigration("db/migrate/create_accounts.ts");
  });

  it.skip("model with parent option database option and no migration option", () => {});

  it.skip("model with underscored database option", () => {});

  it("plural names are singularized", async () => {
    await makeGen().run("accounts", []);
    await assertFile("app/models/account.ts", /class Account extends ApplicationRecord/);
    await assertFile("test/models/account.test.ts", /describe\("AccountTest"/);
    assertMatch(
      /\[WARNING\] The model name 'accounts' was recognized as a plural, using the singular 'account' instead\. Override with --force-plural or setup custom inflection rules for this noun before running the generator\./,
      lines.join("\n"),
    );
  });

  it.skip("unknown inflection rule are warned", () => {});

  it.skip("impossible inflection rules raises an error", () => {});

  it.skip("model with underscored parent option", () => {});

  it("model with namespace", async () => {
    await makeGen().run("admin/account", []);
    await assertFile("app/models/admin.ts", /export const Admin = \{/);
    await assertFile("app/models/admin.ts", /tableNamePrefix\(\)/);
    await assertFile("app/models/admin.ts", /"admin_"/);
    await assertFile(
      "app/models/admin/account.ts",
      /export class AdminAccount extends ApplicationRecord/,
    );
  });

  it("migration", async () => {
    await makeGen().run("Account", ["name:string", "age:integer"]);
    await assertMigration(
      "db/migrate/create_accounts.ts",
      /class CreateAccounts extends Migration/,
    );
  });

  it.skip("migration with namespace", () => {});

  it.skip("migration with nested namespace", () => {});

  it.skip("migration with nested namespace without pluralization", () => {});

  it.skip("migration with namespaces in model name without pluralization", () => {});

  it.skip("migration without pluralization", () => {});

  it("migration is skipped", async () => {
    await makeGen().run("account", [], ["--no-migration"]);
    assertNoMigration("db/migrate/create_accounts.ts");
  });

  it("migration with attributes", async () => {
    await makeGen().run("product", ["name:string", "supplier_id:integer"]);

    await assertMigration("db/migrate/create_products.ts", (m) =>
      assertMethod("change", m, (up) => {
        assertMatch(/createTable\("products"/, up);
        assertMatch(/t\.string\("name"\)/, up);
        assertMatch(/t\.integer\("supplier_id"\)/, up);
      }),
    );
  });

  it("migration with attributes and with index", async () => {
    await makeGen().run("product", [
      "name:string:index",
      "supplier_id:integer:index",
      "user_id:integer:uniq",
      "order_id:uniq",
    ]);

    await assertMigration("db/migrate/create_products.ts", (m) =>
      assertMethod("change", m, (up) => {
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
    await makeGen().run("product", ["name:index", "supplier_id:integer:index", "year:integer"]);

    await assertMigration("db/migrate/create_products.ts", (m) =>
      assertMethod("change", m, (up) => {
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
    await makeGen().run("product", [
      "title:string{40}:index",
      "content:string{255}",
      "price:decimal{5,2}:index",
      "discount:decimal{5,2}:uniq",
      "supplier:references{polymorphic}",
    ]);

    await assertMigration("db/migrate/create_products.ts", async (content) => {
      await assertMethod("change", content, (up) => {
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

  it.skip("migration without timestamps", () => {});

  it.skip("migration with configured path", () => {});

  it("migration with timestamps", async () => {
    await makeGen().run("Account", ["name:string", "age:integer"]);
    await assertMigration("db/migrate/create_accounts.ts", /t\.timestamps/);
  });

  it("migration timestamps are skipped", async () => {
    await makeGen().run("account", [], ["--no-timestamps"]);

    await assertMigration("db/migrate/create_accounts.ts", (m) =>
      assertMethod("change", m, (up) => {
        assertNoMatch(/t\.timestamps/, up);
      }),
    );
  });

  it("migration is skipped with skip option", async () => {
    await makeGen().run("Account", ["name:string", "age:integer"]);
    const gen = makeGen({ skip: true });
    await gen.run("Account", []);
    const output = lines.join("\n");
    assertMatch(/skip\s+db\/migrate\/\d+_create_accounts\.ts/, output);
  });

  it("migration is ignored as identical with skip option", async () => {
    await makeGen().run("Account", []);
    const gen = makeGen({ skip: true });
    await gen.run("Account", []);
    const output = lines.join("\n");
    assertMatch(/identical\s+db\/migrate\/\d+_create_accounts\.ts/, output);
  });

  it("migration is skipped on skip behavior", async () => {
    await makeGen().run("Account", ["name:string", "age:integer"]);
    const gen = makeGen({ behavior: "skip" });
    await gen.run("Account", []);
    const output = lines.join("\n");
    assertMatch(/skip\s+db\/migrate\/\d+_create_accounts\.ts/, output);
  });

  it("migration error is not shown on revoke", async () => {
    await makeGen().run("Account", []);
    const captured: string[] = [];
    await makeGen({ output: (m: string) => captured.push(m), behavior: "revoke" }).run(
      "Account",
      [],
    );
    const error = captured.join("\n");
    assertNoMatch(/Another migration is already named create_accounts/, error);
  });

  it("migration is removed on revoke", async () => {
    await makeGen().run("Account", []);
    await makeGen({ behavior: "revoke" }).run("Account", []);
    assertNoMigration("db/migrate/create_accounts.ts");
  });

  it("existing migration is removed on force", async () => {
    await makeGen().run("Account", ["name:string", "age:integer"]);
    const oldMigration = Dir.glob(
      `${destination.destinationRoot}/db/migrate/*_create_accounts.ts`,
    )[0];
    const gen = makeGen({ force: true });
    await gen.run("Account", []);
    const error = lines.join("\n");
    assertNoMatch(/Another migration is already named create_accounts/, error);
    assertNoFile(oldMigration);
    await assertMigration("db/migrate/create_accounts.ts");
  });

  it("invokes default test framework", async () => {
    await makeGen().run("Account", ["name:string", "age:integer"]);
    await assertFile("test/models/account.test.ts", /describe\("AccountTest"/);

    await assertFile("test/fixtures/accounts.yml", /name: MyString/, /age: 1/);
    assertGeneratedFixture("test/fixtures/accounts.yml", {
      one: { name: "MyString", age: 1 },
      two: { name: "MyString", age: 1 },
    });
  });

  it("fixtures use the references ids", async () => {
    await makeGen().run("LineItem", ["product:references", "cart:belongs_to"]);

    await assertFile("test/fixtures/line_items.yml", /product: one\n {2}cart: one/);
    assertGeneratedFixture("test/fixtures/line_items.yml", {
      one: { product: "one", cart: "one" },
      two: { product: "two", cart: "two" },
    });
  });

  it("fixtures use the references ids and type", async () => {
    await makeGen().run("LineItem", ["product:references{polymorphic}", "cart:belongs_to"]);

    await assertFile(
      "test/fixtures/line_items.yml",
      /product: one\n {2}product_type: Product\n {2}cart: one/,
    );
    assertGeneratedFixture("test/fixtures/line_items.yml", {
      one: { product: "one", product_type: "Product", cart: "one" },
      two: { product: "two", product_type: "Product", cart: "two" },
    });
  });

  it("fixtures respect reserved yml keywords", async () => {
    await makeGen().run("LineItem", ["no:integer", "Off:boolean", "ON:boolean"]);

    assertGeneratedFixture("test/fixtures/line_items.yml", {
      one: { no: 1, Off: false, ON: false },
      two: { no: 1, Off: false, ON: false },
    });
  });

  it("fixture is skipped", async () => {
    await makeGen().run("account", ["--skip-fixture"]);
    assertNoFile("test/fixtures/accounts.yml");
  });

  it("fixture is skipped if fixture replacement is given", async () => {
    await makeGen().run("account", ["-r", "factory_girl"]);
    assertMatch(/factory_girl \[not found\]/, lines.join("\n"));
    assertNoFile("test/fixtures/accounts.yml");
  });

  it("fixture without pluralization", async () => {
    const originalPluralizeTableName = Base.pluralizeTableNames;
    Base.pluralizeTableNames = false;
    try {
      await makeGen().run("Account", ["name:string", "age:integer"]);
      assertGeneratedFixture("test/fixtures/account.yml", {
        one: { name: "MyString", age: 1 },
        two: { name: "MyString", age: 1 },
      });
    } finally {
      Base.pluralizeTableNames = originalPluralizeTableName;
    }
  });

  it.skip("check class collision", () => {});

  it("index is skipped for belongs to association", async () => {
    await makeGen().run("account", ["supplier:belongs_to"], ["--no-indexes"]);

    await assertMigration("db/migrate/create_accounts.ts", (m) =>
      assertMethod("change", m, (up) => {
        assertNoMatch(/index: true/, up);
      }),
    );
  });

  it("index is skipped for references association", async () => {
    await makeGen().run("account", ["supplier:references"], ["--no-indexes"]);

    await assertMigration("db/migrate/create_accounts.ts", (m) =>
      assertMethod("change", m, (up) => {
        assertNoMatch(/index: true/, up);
      }),
    );
  });

  it("add uuid to create table migration", async () => {
    await makeGen().run("account", [], ["--primary-key-type=uuid"]);
    await assertMigration("db/migrate/create_accounts.ts", (content) =>
      assertMethod("change", content, (change) => {
        assertMatch(/createTable\("accounts", \{ id: "uuid" \}/, change);
      }),
    );
  });

  it.skip("database puts migrations in configured folder", () => {});

  it.skip("database puts migrations in configured folder with aliases", () => {});

  it("model with references attribute generates belongs to associations", async () => {
    await makeGen().run("product", ["name:string", "supplier:references"]);
    await assertFile("app/models/product.ts", /this\.belongsTo\("supplier"/);
  });

  it("model with belongs to attribute generates belongs to associations", async () => {
    await makeGen().run("product", ["name:string", "supplier:belongs_to"]);
    await assertFile("app/models/product.ts", /this\.belongsTo\("supplier"/);
  });

  it("model with polymorphic references attribute generates belongs to associations", async () => {
    await makeGen().run("product", ["name:string", "supplier:references{polymorphic}"]);
    await assertFile(
      "app/models/product.ts",
      /this\.belongsTo\("supplier", \{ polymorphic: true \}\)/,
    );
  });

  it("model with polymorphic belongs to attribute generates belongs to associations", async () => {
    await makeGen().run("product", ["name:string", "supplier:belongs_to{polymorphic}"]);
    await assertFile(
      "app/models/product.ts",
      /this\.belongsTo\("supplier", \{ polymorphic: true \}\)/,
    );
  });

  it("polymorphic belongs to generates correct model", async () => {
    await makeGen().run("account", ["supplier:references{polymorphic}"]);

    const expectedFile = `import { ApplicationRecord } from "./application-record.js";

export class Account extends ApplicationRecord {
  static {
    this.belongsTo("supplier", { polymorphic: true });
  }
}
`;
    await assertFile("app/models/account.ts", expectedFile);
  });

  it("null false is added for references by default", async () => {
    await makeGen().run("account", ["user:references"]);

    await assertMigration("db/migrate/create_accounts.ts", (m) =>
      assertMethod("change", m, (up) => {
        assertMatch(/t\.references\("user",.*\snull: false/, up);
      }),
    );
  });

  it("null false is added for belongs to by default", async () => {
    await makeGen().run("account", ["user:belongs_to"]);

    await assertMigration("db/migrate/create_accounts.ts", (m) =>
      assertMethod("change", m, (up) => {
        assertMatch(/t\.belongsTo\("user",.*\snull: false/, up);
      }),
    );
  });

  it("null false is not added when belongs to required by default global config is false", async () => {
    Trails.application!.config.activeRecord.belongsToRequiredByDefault = false;

    await makeGen().run("account", ["user:belongs_to"]);

    await assertMigration("db/migrate/create_accounts.ts", (m) =>
      assertMethod("change", m, (up) => {
        assertMatch(/t\.belongsTo\("user"/, up);
      }),
    );
  });

  it("foreign key is not added for non references", async () => {
    await makeGen().run("account", ["supplier:string"]);

    await assertMigration("db/migrate/create_accounts.ts", (m) =>
      assertMethod("change", m, (up) => {
        assertNoMatch(/foreignKey/, up);
      }),
    );
  });

  it("foreign key is added for references", async () => {
    await makeGen().run("account", ["supplier:belongs_to", "user:references"]);

    await assertMigration("db/migrate/create_accounts.ts", (m) =>
      assertMethod("change", m, (up) => {
        assertMatch(/t\.belongsTo\("supplier",.*\sforeignKey: true/, up);
        assertMatch(/t\.references\("user",.*\sforeignKey: true/, up);
      }),
    );
  });

  it("foreign key is skipped for polymorphic references", async () => {
    await makeGen().run("account", ["supplier:belongs_to{polymorphic}"]);

    await assertMigration("db/migrate/create_accounts.ts", (m) =>
      assertMethod("change", m, (up) => {
        assertNoMatch(/foreignKey/, up);
      }),
    );
  });

  it("token option adds has secure token", async () => {
    await makeGen().run("user", ["token:token", "auth_token:token"]);

    const expectedFile = `import { ApplicationRecord } from "./application-record.js";

export class User extends ApplicationRecord {
  static {
    this.hasSecureToken();
    this.hasSecureToken("auth_token");
  }
}
`;
    await assertFile("app/models/user.ts", expectedFile);
  });

  it("model with rich text attribute adds has rich text", async () => {
    await makeGen().run("message", ["content:rich_text"]);

    const expectedFile = `import { ApplicationRecord } from "./application-record.js";

export class Message extends ApplicationRecord {
  static {
    this.hasRichText("content");
  }
}
`;
    await assertFile("app/models/message.ts", expectedFile);
  });

  it("model with attachment attribute adds has one attached", async () => {
    await makeGen().run("message", ["video:attachment"]);

    const expectedFile = `import { ApplicationRecord } from "./application-record.js";

export class Message extends ApplicationRecord {
  static {
    this.hasOneAttached("video");
  }
}
`;
    await assertFile("app/models/message.ts", expectedFile);
  });

  it("model with attachments attribute adds has many attached", async () => {
    await makeGen().run("message", ["photos:attachments"]);

    const expectedFile = `import { ApplicationRecord } from "./application-record.js";

export class Message extends ApplicationRecord {
  static {
    this.hasManyAttached("photos");
  }
}
`;
    await assertFile("app/models/message.ts", expectedFile);
  });

  it("skip virtual fields in fixtures", async () => {
    await makeGen().run("message", ["content:rich_text", "video:attachment", "photos:attachments"]);

    assertGeneratedFixture("test/fixtures/messages.yml", { one: null, two: null });
  });
});

describe("ModelGenerator (JavaScript project)", () => {
  let jsTmpDir: string;
  let jsLines: string[];

  beforeEach(() => {
    jsTmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "trails-js-test-"));
    jsLines = [];
  });

  afterEach(() => {
    fs.rmSync(jsTmpDir, { recursive: true, force: true });
  });

  function makeJsGen() {
    return {
      run: async (name: string, args: string[]) => {
        await ModelGenerator.start([name, ...args], {
          cwd: jsTmpDir,
          output: (m) => jsLines.push(m),
        });
        return listFiles(jsTmpDir);
      },
    };
  }

  it("generates .js model and test files", async () => {
    const gen = makeJsGen();
    const files = await gen.run("User", ["name:string"]);
    expect(files).toContain("app/models/user.js");
    expect(files).toContain("test/models/user.test.js");
  });

  it("generates .js migration file", async () => {
    const gen = makeJsGen();
    const files = await gen.run("User", ["name:string"]);
    const migFile = files.find((f) => f.startsWith("db/migrate/"));
    expect(migFile).toMatch(/\.js$/);
  });

  it("uses ESM imports and exports in model", async () => {
    const gen = makeJsGen();
    await gen.run("User", ["name:string"]);
    const content = fs.readFileSync(path.join(jsTmpDir, "app/models/user.js"), "utf-8");
    expect(content).toContain('import { ApplicationRecord } from "./application-record.js"');
    expect(content).toContain("export class User");
  });
});
