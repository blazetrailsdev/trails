import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { ModelGenerator } from "./model-generator.js";

let tmpDir: string;
let lines: string[];

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "trails-test-"));
  fs.writeFileSync(path.join(tmpDir, "tsconfig.json"), "{}");
  lines = [];
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

function makeGen() {
  return new ModelGenerator({ cwd: tmpDir, output: (m) => lines.push(m) });
}

function readModel(name: string): string {
  return fs.readFileSync(path.join(tmpDir, `src/app/models/${name}.ts`), "utf-8");
}

function findMigration(files: string[]): string {
  const migFile = files.find((f) => f.startsWith("db/migrations/"));
  expect(migFile).toBeDefined();
  return fs.readFileSync(path.join(tmpDir, migFile!), "utf-8");
}

describe("ModelGeneratorTest", () => {
  it.skip("help shows invoked generators options", () => {
    // Needs --help support
  });

  it("model with missing attribute type", () => {
    const gen = makeGen();
    const files = gen.run("post", ["title", "body:text", "author"]);
    const content = findMigration(files);
    expect(content).toContain('t.string("title")');
    expect(content).toContain('t.text("body")');
    expect(content).toContain('t.string("author")');
  });

  it.skip("migration source paths", () => {
    // Needs custom template support
  });

  it("invokes default orm", () => {
    const gen = makeGen();
    gen.run("Account", ["name:string", "age:integer"]);
    const content = readModel("account");
    expect(content).toContain("class Account extends Base");
  });

  it("model with parent option", () => {
    const gen = makeGen();
    const files = gen.run("Account", [], { parent: "Admin::Account" });
    const content = readModel("account");
    expect(content).toContain("class Account extends AdminAccount");
    expect(files.find((f) => f.startsWith("db/migrations/"))).toBeUndefined();
  });

  it.skip("model with database option", () => {
    // Needs --database option
  });

  it.skip("model with parent and database option", () => {
    // Needs --database option
  });

  it.skip("model with no migration and database option", () => {
    // Needs --database option
  });

  it("model with no migration option", () => {
    const gen = makeGen();
    const files = gen.run("Account", ["name:string"], { migration: false });
    expect(files).toContain("src/app/models/account.ts");
    expect(files.find((f) => f.startsWith("db/migrations/"))).toBeUndefined();
  });

  it.skip("model with parent option database option and no migration option", () => {
    // Needs --database option
  });

  it.skip("model with underscored database option", () => {
    // Needs --database option
  });

  it.skip("plural names are singularized", () => {
    // Needs warning output and singularization
  });

  it.skip("unknown inflection rule are warned", () => {
    // Needs inflection rule warnings
  });

  it.skip("impossible inflection rules raises an error", () => {
    // Needs camelcase recovery check
  });

  it.skip("model with underscored parent option", () => {
    // Needs underscored parent conversion (admin/account -> Admin::Account)
  });

  it.skip("model with namespace", () => {
    // Needs namespace support (admin/account)
  });

  it("migration", () => {
    const gen = makeGen();
    const files = gen.run("Account", ["name:string", "age:integer"]);
    const migFile = files.find((f) => f.startsWith("db/migrations/"));
    expect(migFile).toBeDefined();
    const content = fs.readFileSync(path.join(tmpDir, migFile!), "utf-8");
    expect(content).toContain("class CreateAccounts extends Migration");
  });

  it.skip("migration with namespace", () => {
    // Needs namespace support
  });

  it.skip("migration with nested namespace", () => {
    // Needs namespace support
  });

  it.skip("migration with nested namespace without pluralization", () => {
    // Needs namespace and singular table config
  });

  it.skip("migration with namespaces in model name without pluralization", () => {
    // Needs namespace and singular table config
  });

  it.skip("migration without pluralization", () => {
    // Needs singular table name config
  });

  it("migration is skipped", () => {
    const gen = makeGen();
    const files = gen.run("Account", ["name:string"], { migration: false });
    expect(files.find((f) => f.startsWith("db/migrations/"))).toBeUndefined();
  });

  it("migration with attributes", () => {
    const gen = makeGen();
    const files = gen.run("Product", ["name:string", "supplier_id:integer"]);
    const content = findMigration(files);
    expect(content).toContain('createTable("products"');
    expect(content).toContain('t.string("name")');
    expect(content).toContain('t.integer("supplier_id")');
  });

  it("migration with attributes and with index", () => {
    const gen = makeGen();
    const files = gen.run("Product", [
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

  it("migration with missing attribute type and with index", () => {
    const gen = makeGen();
    const files = gen.run("Product", ["name:index", "supplier_id:integer:index", "year:integer"]);
    const content = findMigration(files);
    expect(content).toContain('createTable("products"');
    expect(content).toContain('t.string("name")');
    expect(content).toContain('t.integer("supplier_id")');
    expect(content).toContain('addIndex("products", "name")');
    expect(content).toContain('addIndex("products", "supplier_id")');
    expect(content).not.toContain('addIndex("products", "year"');
  });

  it("add migration with attributes index declaration and attribute options", () => {
    const gen = makeGen();
    const files = gen.run("Product", [
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

  it.skip("migration without timestamps", () => {
    // Needs ActiveRecord.timestamped_migrations = false support
  });

  it.skip("migration with configured path", () => {
    // Needs configurable migration path
  });

  it("migration with timestamps", () => {
    const gen = makeGen();
    const files = gen.run("Account", ["name:string", "age:integer"]);
    const content = findMigration(files);
    expect(content).toContain("t.timestamps()");
  });

  it("migration timestamps are skipped", () => {
    const gen = makeGen();
    const files = gen.run("Account", ["name:string"], { timestamps: false });
    const content = findMigration(files);
    expect(content).not.toContain("timestamps");
  });

  it.skip("migration is skipped with skip option", () => {
    // Needs --skip behavior
  });

  it.skip("migration is ignored as identical with skip option", () => {
    // Needs --skip behavior
  });

  it.skip("migration is skipped on skip behavior", () => {
    // Needs skip behavior mode
  });

  it.skip("migration error is not shown on revoke", () => {
    // Needs revoke behavior
  });

  it.skip("migration is removed on revoke", () => {
    // Needs revoke behavior
  });

  it.skip("existing migration is removed on force", () => {
    // Needs --force behavior
  });

  it("invokes default test framework", () => {
    const gen = makeGen();
    const files = gen.run("Account", ["name:string", "age:integer"]);
    expect(files).toContain("test/models/account.test.ts");
    const content = fs.readFileSync(path.join(tmpDir, "test/models/account.test.ts"), "utf-8");
    expect(content).toContain('describe("Account"');
  });

  it.skip("fixtures use the references ids", () => {
    // Needs fixture generation
  });

  it.skip("fixtures use the references ids and type", () => {
    // Needs fixture generation
  });

  it.skip("fixtures respect reserved yml keywords", () => {
    // Needs fixture generation
  });

  it.skip("fixture is skipped", () => {
    // Needs --skip-fixture flag
  });

  it.skip("fixture is skipped if fixture replacement is given", () => {
    // Needs -r option
  });

  it.skip("fixture without pluralization", () => {
    // Needs singular table name config
  });

  it.skip("check class collision", () => {
    // Needs class collision detection
  });

  it("index is skipped for belongs to association", () => {
    const gen = makeGen();
    const files = gen.run("Account", ["supplier:belongs_to"], { indexes: false });
    const content = findMigration(files);
    expect(content).not.toContain("index: true");
  });

  it("index is skipped for references association", () => {
    const gen = makeGen();
    const files = gen.run("Account", ["supplier:references"], { indexes: false });
    const content = findMigration(files);
    expect(content).not.toContain("index: true");
  });

  it("add uuid to create table migration", () => {
    const gen = makeGen();
    const files = gen.run("Account", [], { primaryKeyType: "uuid" });
    const content = findMigration(files);
    expect(content).toMatch(/createTable\("accounts", \{ id: "uuid" \}/);
  });

  it.skip("database puts migrations in configured folder", () => {
    // Needs --database option
  });

  it.skip("database puts migrations in configured folder with aliases", () => {
    // Needs --db alias
  });

  it("model with references attribute generates belongs to associations", () => {
    const gen = makeGen();
    gen.run("Product", ["name:string", "supplier:references"]);
    const content = readModel("product");
    expect(content).toContain('this.belongsTo("supplier")');
  });

  it("model with belongs to attribute generates belongs to associations", () => {
    const gen = makeGen();
    gen.run("Product", ["name:string", "supplier:belongs_to"]);
    const content = readModel("product");
    expect(content).toContain('this.belongsTo("supplier")');
  });

  it("model with polymorphic references attribute generates belongs to associations", () => {
    const gen = makeGen();
    gen.run("Product", ["name:string", "supplier:references{polymorphic}"]);
    const content = readModel("product");
    expect(content).toContain('this.belongsTo("supplier", { polymorphic: true })');
  });

  it("model with polymorphic belongs to attribute generates belongs to associations", () => {
    const gen = makeGen();
    gen.run("Product", ["name:string", "supplier:belongs_to{polymorphic}"]);
    const content = readModel("product");
    expect(content).toContain('this.belongsTo("supplier", { polymorphic: true })');
  });

  it("polymorphic belongs to generates correct model", () => {
    const gen = makeGen();
    gen.run("Account", ["supplier:references{polymorphic}"]);
    const content = readModel("account");
    expect(content).toContain('this.belongsTo("supplier", { polymorphic: true })');
  });

  it.skip("null false is added for references by default", () => {
    // Needs belongs_to_required_by_default config
  });

  it.skip("null false is added for belongs to by default", () => {
    // Needs belongs_to_required_by_default config
  });

  it.skip("null false is not added when belongs to required by default global config is false", () => {
    // Needs belongs_to_required_by_default config
  });

  it("foreign key is not added for non references", () => {
    const gen = makeGen();
    const files = gen.run("Account", ["supplier:string"]);
    const content = findMigration(files);
    expect(content).not.toContain("foreignKey");
  });

  it("foreign key is added for references", () => {
    const gen = makeGen();
    const files = gen.run("Account", ["supplier:belongs_to", "user:references"]);
    const content = findMigration(files);
    expect(content).toMatch(/t\.references\("supplier",.*foreignKey: true/);
    expect(content).toMatch(/t\.references\("user",.*foreignKey: true/);
  });

  it("foreign key is skipped for polymorphic references", () => {
    const gen = makeGen();
    const files = gen.run("Account", ["supplier:belongs_to{polymorphic}"]);
    const content = findMigration(files);
    expect(content).not.toContain("foreignKey");
  });

  it("token option adds has secure token", () => {
    const gen = makeGen();
    gen.run("User", ["token:token", "auth_token:token"]);
    const content = readModel("user");
    expect(content).toContain("this.hasSecureToken()");
    expect(content).toContain('this.hasSecureToken("auth_token")');
  });

  it("model with rich text attribute adds has rich text", () => {
    const gen = makeGen();
    gen.run("Message", ["content:rich_text"]);
    const content = readModel("message");
    expect(content).toContain('this.hasRichText("content")');
  });

  it("model with attachment attribute adds has one attached", () => {
    const gen = makeGen();
    gen.run("Message", ["video:attachment"]);
    const content = readModel("message");
    expect(content).toContain('this.hasOneAttached("video")');
  });

  it("model with attachments attribute adds has many attached", () => {
    const gen = makeGen();
    gen.run("Message", ["photos:attachments"]);
    const content = readModel("message");
    expect(content).toContain('this.hasManyAttached("photos")');
  });

  it.skip("skip virtual fields in fixtures", () => {
    // Needs fixture generation
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
    return new ModelGenerator({ cwd: jsTmpDir, output: (m) => jsLines.push(m) });
  }

  it("generates .js model and test files", () => {
    const gen = makeJsGen();
    const files = gen.run("User", ["name:string"]);
    expect(files).toContain("src/app/models/user.js");
    expect(files).toContain("test/models/user.test.js");
  });

  it("generates .js migration file", () => {
    const gen = makeJsGen();
    const files = gen.run("User", ["name:string"]);
    const migFile = files.find((f) => f.startsWith("db/migrations/"));
    expect(migFile).toMatch(/\.js$/);
  });

  it("uses ESM imports and exports in model", () => {
    const gen = makeJsGen();
    gen.run("User", ["name:string"]);
    const content = fs.readFileSync(path.join(jsTmpDir, "src/app/models/user.js"), "utf-8");
    expect(content).toContain('import { Base } from "@blazetrails/activerecord"');
    expect(content).toContain("export class User");
  });
});
