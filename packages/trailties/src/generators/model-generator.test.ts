import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { ModelGenerator } from "./model-generator.js";
import * as Assertions from "./testing/assertions.js";
import { assertMatch } from "@blazetrails/activesupport";
import { Application } from "../application.js";
import { Trails } from "../rails.js";
import "../trailties/active-record.js";

class ModelGeneratorTestApp extends Application {}
let oldBelongsToRequiredByDefault: boolean | undefined;

let tmpDir: string;
let lines: string[];
const destination = { destinationRoot: "" };
const assertNoMigration = Assertions.assertNoMigration.bind(destination);
const assertNoFile = Assertions.assertNoFile.bind(destination);
const assertMigration = Assertions.assertMigration.bind(destination);
const assertFile = Assertions.assertFile.bind(destination);
const { assertMethod } = Assertions;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "trails-test-"));
  fs.writeFileSync(path.join(tmpDir, "tsconfig.json"), "{}");
  destination.destinationRoot = tmpDir;
  lines = [];
  Trails.application = ModelGeneratorTestApp.instance();
  oldBelongsToRequiredByDefault = Trails.application.config.activeRecord.belongsToRequiredByDefault;
  Trails.application.config.activeRecord.belongsToRequiredByDefault = true;
});

afterEach(() => {
  Trails.application!.config.activeRecord.belongsToRequiredByDefault =
    oldBelongsToRequiredByDefault;
  Trails.application = null;
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

function makeGen() {
  return new ModelGenerator({ cwd: tmpDir, output: (m) => lines.push(m) });
}

function readModel(name: string): string {
  return fs.readFileSync(path.join(tmpDir, `app/models/${name}.ts`), "utf-8");
}

function findMigration(files: string[]): string {
  const migFile = files.find((f) => f.startsWith("db/migrate/"));
  expect(migFile).toBeDefined();
  return fs.readFileSync(path.join(tmpDir, migFile!), "utf-8");
}

describe("ModelGeneratorTest", () => {
  it.skip("help shows invoked generators options", () => {});

  it("model with missing attribute type", async () => {
    const gen = makeGen();
    const files = await gen.run("post", ["title", "body:text", "author"]);
    const content = findMigration(files);
    expect(content).toContain('t.string("title")');
    expect(content).toContain('t.text("body")');
    expect(content).toContain('t.string("author")');
  });

  it.skip("migration source paths", () => {});

  it("invokes default orm", async () => {
    const gen = makeGen();
    await gen.run("Account", ["name:string", "age:integer"]);
    const content = readModel("account");
    expect(content).toContain("class Account extends ApplicationRecord");
  });

  it("model with parent option", async () => {
    const gen = makeGen();
    const files = await gen.run("Account", [], { parent: "Admin::Account" });
    const content = readModel("account");
    expect(content).toContain("class Account extends AdminAccount");
    expect(files.find((f) => f.startsWith("db/migrate/"))).toBeUndefined();
  });

  it.skip("model with database option", () => {});

  it.skip("model with parent and database option", () => {});

  it.skip("model with no migration and database option", () => {});

  it("model with no migration option", async () => {
    const gen = makeGen();
    const files = await gen.run("Account", ["name:string"], { migration: false });
    expect(files).toContain("app/models/account.ts");
    expect(files.find((f) => f.startsWith("db/migrate/"))).toBeUndefined();
  });

  it.skip("model with parent option database option and no migration option", () => {});

  it.skip("model with underscored database option", () => {});

  it.skip("plural names are singularized", () => {});

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
    const gen = makeGen();
    const files = await gen.run("Account", ["name:string", "age:integer"]);
    const migFile = files.find((f) => f.startsWith("db/migrate/"));
    expect(migFile).toBeDefined();
    const content = fs.readFileSync(path.join(tmpDir, migFile!), "utf-8");
    expect(content).toContain("class CreateAccounts extends Migration");
  });

  it.skip("migration with namespace", () => {});

  it.skip("migration with nested namespace", () => {});

  it.skip("migration with nested namespace without pluralization", () => {});

  it.skip("migration with namespaces in model name without pluralization", () => {});

  it.skip("migration without pluralization", () => {});

  it("migration is skipped", async () => {
    const gen = makeGen();
    const files = await gen.run("Account", ["name:string"], { migration: false });
    expect(files.find((f) => f.startsWith("db/migrate/"))).toBeUndefined();
  });

  it("migration with attributes", async () => {
    const gen = makeGen();
    const files = await gen.run("Product", ["name:string", "supplier_id:integer"]);
    const content = findMigration(files);
    expect(content).toContain('createTable("products"');
    expect(content).toContain('t.string("name")');
    expect(content).toContain('t.integer("supplier_id")');
  });

  it("migration with attributes and with index", async () => {
    const gen = makeGen();
    const files = await gen.run("Product", [
      "name:string:index",
      "supplier_id:integer:index",
      "user_id:integer:uniq",
      "order_id:uniq",
    ]);
    const content = findMigration(files);
    expect(content).toContain('createTable("products"');
    expect(content).toContain('t.string("name")');
    expect(content).toContain('t.integer("supplier_id")');
    expect(content).toContain('t.integer("user_id")');
    expect(content).toContain('t.string("order_id")');
    expect(content).toContain('addIndex("products", "name")');
    expect(content).toContain('addIndex("products", "supplier_id")');
    expect(content).toMatch(/addIndex\("products", "user_id", \{ unique: true \}/);
    expect(content).toMatch(/addIndex\("products", "order_id", \{ unique: true \}/);
  });

  it("migration with missing attribute type and with index", async () => {
    const gen = makeGen();
    const files = await gen.run("Product", [
      "name:index",
      "supplier_id:integer:index",
      "year:integer",
    ]);
    const content = findMigration(files);
    expect(content).toContain('createTable("products"');
    expect(content).toContain('t.string("name")');
    expect(content).toContain('t.integer("supplier_id")');
    expect(content).toContain('addIndex("products", "name")');
    expect(content).toContain('addIndex("products", "supplier_id")');
    expect(content).not.toContain('addIndex("products", "year"');
  });

  it("add migration with attributes index declaration and attribute options", async () => {
    const gen = makeGen();
    const files = await gen.run("Product", [
      "title:string{40}:index",
      "content:string{255}",
      "price:decimal{5,2}:index",
      "discount:decimal{5,2}:uniq",
      "supplier:references{polymorphic}",
    ]);
    const content = findMigration(files);
    expect(content).toContain('createTable("products"');
    expect(content).toContain('t.string("title", { limit: 40 })');
    expect(content).toContain('t.string("content", { limit: 255 })');
    expect(content).toContain('t.decimal("price", { precision: 5, scale: 2 })');
    expect(content).toMatch(/t\.references\("supplier",.*polymorphic: true/);
    expect(content).toContain('addIndex("products", "title")');
    expect(content).toContain('addIndex("products", "price")');
    expect(content).toMatch(/addIndex\("products", "discount", \{ unique: true \}/);
  });

  it.skip("migration without timestamps", () => {});

  it.skip("migration with configured path", () => {});

  it("migration with timestamps", async () => {
    const gen = makeGen();
    const files = await gen.run("Account", ["name:string", "age:integer"]);
    const content = findMigration(files);
    expect(content).toContain("t.timestamps()");
  });

  it("migration timestamps are skipped", async () => {
    const gen = makeGen();
    const files = await gen.run("Account", ["name:string"], { timestamps: false });
    const content = findMigration(files);
    expect(content).not.toContain("timestamps");
  });

  it("migration is skipped with skip option", async () => {
    await makeGen().run("Account", ["name:string", "age:integer"]);
    const gen = new ModelGenerator({ cwd: tmpDir, output: (m) => lines.push(m), skip: true });
    await gen.run("Account", []);
    expect(lines.join("\n")).toMatch(/skip\s+db\/migrate\/\d+_create_accounts\.ts/);
  });

  it("migration is ignored as identical with skip option", async () => {
    await makeGen().run("Account", []);
    const gen = new ModelGenerator({ cwd: tmpDir, output: (m) => lines.push(m), skip: true });
    await gen.run("Account", []);
    expect(lines.join("\n")).toMatch(/identical\s+db\/migrate\/\d+_create_accounts\.ts/);
  });

  it.skip("migration is skipped on skip behavior", () => {});

  it("migration error is not shown on revoke", async () => {
    await makeGen().run("Account", []);
    const captured: string[] = [];
    await new ModelGenerator({
      cwd: tmpDir,
      output: (m) => captured.push(m),
      behavior: "revoke",
    }).run("Account", []);
    const error = captured.join("\n");
    expect(error).not.toMatch(/Another migration is already named create_accounts/);
  });

  it("migration is removed on revoke", async () => {
    await makeGen().run("Account", []);
    await new ModelGenerator({ cwd: tmpDir, output: () => {}, behavior: "revoke" }).run(
      "Account",
      [],
    );
    assertNoMigration("db/migrate/create_accounts.ts");
  });

  it("existing migration is removed on force", async () => {
    const files = await makeGen().run("Account", ["name:string", "age:integer"]);
    const gen = new ModelGenerator({ cwd: tmpDir, output: (m) => lines.push(m), force: true });
    await gen.run("Account", []);
    expect(lines.join("\n")).not.toMatch(/Another migration is already named create_accounts/);
    assertNoFile(files.find((f) => f.startsWith("db/migrate/"))!);
    await assertMigration("db/migrate/create_accounts.ts");
  });

  it("invokes default test framework", async () => {
    const gen = makeGen();
    const files = await gen.run("Account", ["name:string", "age:integer"]);
    expect(files).toContain("test/models/account.test.ts");
    const content = fs.readFileSync(path.join(tmpDir, "test/models/account.test.ts"), "utf-8");
    expect(content).toContain('describe("Account"');
  });

  it.skip("fixtures use the references ids", () => {});

  it.skip("fixtures use the references ids and type", () => {});

  it.skip("fixtures respect reserved yml keywords", () => {});

  it.skip("fixture is skipped", () => {});

  it.skip("fixture is skipped if fixture replacement is given", () => {});

  it.skip("fixture without pluralization", () => {});

  it.skip("check class collision", () => {});

  it("index is skipped for belongs to association", async () => {
    const gen = makeGen();
    const files = await gen.run("Account", ["supplier:belongs_to"], { indexes: false });
    const content = findMigration(files);
    expect(content).not.toContain("index: true");
  });

  it("index is skipped for references association", async () => {
    const gen = makeGen();
    const files = await gen.run("Account", ["supplier:references"], { indexes: false });
    const content = findMigration(files);
    expect(content).not.toContain("index: true");
  });

  it("add uuid to create table migration", async () => {
    const gen = makeGen();
    const files = await gen.run("Account", [], { primaryKeyType: "uuid" });
    const content = findMigration(files);
    expect(content).toMatch(/createTable\("accounts", \{ id: "uuid" \}/);
  });

  it.skip("database puts migrations in configured folder", () => {});

  it.skip("database puts migrations in configured folder with aliases", () => {});

  it("model with references attribute generates belongs to associations", async () => {
    const gen = makeGen();
    await gen.run("Product", ["name:string", "supplier:references"]);
    const content = readModel("product");
    expect(content).toContain('this.belongsTo("supplier")');
  });

  it("model with belongs to attribute generates belongs to associations", async () => {
    const gen = makeGen();
    await gen.run("Product", ["name:string", "supplier:belongs_to"]);
    const content = readModel("product");
    expect(content).toContain('this.belongsTo("supplier")');
  });

  it("model with polymorphic references attribute generates belongs to associations", async () => {
    const gen = makeGen();
    await gen.run("Product", ["name:string", "supplier:references{polymorphic}"]);
    const content = readModel("product");
    expect(content).toContain('this.belongsTo("supplier", { polymorphic: true })');
  });

  it("model with polymorphic belongs to attribute generates belongs to associations", async () => {
    const gen = makeGen();
    await gen.run("Product", ["name:string", "supplier:belongs_to{polymorphic}"]);
    const content = readModel("product");
    expect(content).toContain('this.belongsTo("supplier", { polymorphic: true })');
  });

  it("polymorphic belongs to generates correct model", async () => {
    const gen = makeGen();
    await gen.run("Account", ["supplier:references{polymorphic}"]);
    const content = readModel("account");
    expect(content).toContain('this.belongsTo("supplier", { polymorphic: true })');
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
    const gen = makeGen();
    const files = await gen.run("Account", ["supplier:string"]);
    const content = findMigration(files);
    expect(content).not.toContain("foreignKey");
  });

  it("foreign key is added for references", async () => {
    const gen = makeGen();
    const files = await gen.run("Account", ["supplier:belongs_to", "user:references"]);
    const content = findMigration(files);
    expect(content).toMatch(/t\.belongsTo\("supplier",.*\sforeignKey: true/);
    expect(content).toMatch(/t\.references\("user",.*\sforeignKey: true/);
  });

  it("foreign key is skipped for polymorphic references", async () => {
    const gen = makeGen();
    const files = await gen.run("Account", ["supplier:belongs_to{polymorphic}"]);
    const content = findMigration(files);
    expect(content).not.toContain("foreignKey");
  });

  it("token option adds has secure token", async () => {
    const gen = makeGen();
    await gen.run("User", ["token:token", "auth_token:token"]);
    const content = readModel("user");
    expect(content).toContain("this.hasSecureToken()");
    expect(content).toContain('this.hasSecureToken("auth_token")');
  });

  it("model with rich text attribute adds has rich text", async () => {
    const gen = makeGen();
    await gen.run("Message", ["content:rich_text"]);
    const content = readModel("message");
    expect(content).toContain('this.hasRichText("content")');
  });

  it("model with attachment attribute adds has one attached", async () => {
    const gen = makeGen();
    await gen.run("Message", ["video:attachment"]);
    const content = readModel("message");
    expect(content).toContain('this.hasOneAttached("video")');
  });

  it("model with attachments attribute adds has many attached", async () => {
    const gen = makeGen();
    await gen.run("Message", ["photos:attachments"]);
    const content = readModel("message");
    expect(content).toContain('this.hasManyAttached("photos")');
  });

  it.skip("skip virtual fields in fixtures", () => {});
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
    return new ModelGenerator({ cwd: jsTmpDir, output: (m) => jsLines.push(m) });
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
