import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import initSqlJs, { type SqlJsStatic } from "sql.js";
import { createRuntime, type Runtime } from "./runtime.js";

let SQL: SqlJsStatic;
let runtime: Runtime;

beforeAll(async () => {
  SQL = await initSqlJs();
});

beforeEach(async () => {
  runtime = await createRuntime(SQL);
});

describe("createRuntime", () => {
  it("creates a runtime with adapter and vfs", () => {
    expect(runtime.adapter).toBeDefined();
    expect(runtime.vfs).toBeDefined();
  });

  it("vfs is backed by the adapter", () => {
    runtime.vfs.write("test.ts", "hello");
    expect(runtime.vfs.read("test.ts")?.content).toBe("hello");
  });
});

describe("exec: new", () => {
  it("creates app scaffold files via railties AppGenerator", async () => {
    const result = await runtime.exec("new myapp");
    expect(result.success).toBe(true);
    expect(result.output.join("\n")).toContain("create  src/config/routes.ts");
    expect(runtime.vfs.exists("package.json")).toBe(true);
    expect(runtime.vfs.exists("src/config/routes.ts")).toBe(true);
    expect(runtime.vfs.exists("src/config/application.ts")).toBe(true);
    expect(runtime.vfs.exists("src/app/models/application-record.ts")).toBe(true);
    expect(runtime.vfs.exists("src/app/controllers/application-controller.ts")).toBe(true);
    expect(runtime.vfs.exists("db/seeds.ts")).toBe(true);
    expect(runtime.vfs.exists("db/migrations/.gitkeep")).toBe(true);
  });

  it("clears existing files", async () => {
    runtime.vfs.write("old-file.ts", "old");
    await runtime.exec("new myapp");
    expect(runtime.vfs.exists("old-file.ts")).toBe(false);
  });
});

describe("exec: generate model", () => {
  it("creates model and migration files via railties generators", async () => {
    const result = await runtime.exec("generate model User name:string email:string");
    expect(result.success).toBe(true);

    // Model uses railties format (src/app/models/ path, import from @blazetrails)
    const modelFile = runtime.vfs.read("src/app/models/user.ts");
    expect(modelFile).not.toBeNull();
    expect(modelFile!.content).toContain("class User extends Base");
    expect(modelFile!.content).toContain('this.attribute("name", "string")');
    expect(modelFile!.content).toContain('this.attribute("email", "string")');
    expect(modelFile!.content).toContain('import { Base } from "@blazetrails/activerecord"');

    // Migration uses railties format
    const migFiles = runtime.vfs
      .list()
      .filter((f) => f.path.startsWith("db/migrations/") && f.path.includes("create-users"));
    expect(migFiles.length).toBe(1);
    expect(migFiles[0].content).toContain("class CreateUsers extends Migration");
    expect(migFiles[0].content).toContain('t.string("name")');
    expect(migFiles[0].content).toContain('t.string("email")');
    expect(migFiles[0].content).toContain("t.timestamps()");
  });

  it("creates test file alongside model", async () => {
    await runtime.exec("generate model Post title:string body:text");
    expect(runtime.vfs.exists("test/models/post.test.ts")).toBe(true);
  });

  it("g is an alias for generate", async () => {
    const result = await runtime.exec("g model Post title:string");
    expect(result.success).toBe(true);
    expect(runtime.vfs.exists("src/app/models/post.ts")).toBe(true);
  });
});

describe("exec: generate migration", () => {
  it("creates a standalone migration file", async () => {
    const result = await runtime.exec("generate migration AddAgeToUsers age:integer");
    expect(result.success).toBe(true);
    const migFiles = runtime.vfs
      .list()
      .filter((f) => f.path.startsWith("db/migrations/") && f.path.includes("add-age-to-users"));
    expect(migFiles.length).toBe(1);
    expect(migFiles[0].content).toContain("AddAgeToUsers");
  });
});

describe("exec: sql", () => {
  it("executes inline SQL", async () => {
    runtime.adapter.execRaw("CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT)");
    runtime.adapter.execRaw("INSERT INTO users (name) VALUES ('Alice')");

    const result = await runtime.exec("sql SELECT * FROM users");
    expect(result.success).toBe(true);
    expect(result.output.join("\n")).toContain("Alice");
  });

  it("executes SQL from a VFS file", async () => {
    runtime.adapter.execRaw("CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT)");
    runtime.adapter.execRaw("INSERT INTO users (name) VALUES ('Bob')");
    runtime.vfs.write("queries/test.sql", "SELECT * FROM users");

    const result = await runtime.exec("sql queries/test.sql");
    expect(result.success).toBe(true);
    expect(result.output.join("\n")).toContain("Bob");
  });

  it("handles multiple statements on one line", async () => {
    runtime.adapter.execRaw("CREATE TABLE t1 (id INTEGER PRIMARY KEY)");
    runtime.adapter.execRaw("CREATE TABLE t2 (id INTEGER PRIMARY KEY)");
    const result = await runtime.exec("sql SELECT * FROM t1; SELECT * FROM t2");
    expect(result.success).toBe(true);
  });

  it("reports SQL errors with failure status", async () => {
    const result = await runtime.exec("sql SELECT * FROM nonexistent");
    expect(result.success).toBe(false);
    expect(result.output.join("\n")).toContain("ERROR");
  });
});

describe("exec: db:migrate (not yet supported)", () => {
  it("errors explicitly when code execution is not available", async () => {
    await runtime.exec("generate model User name:string email:string");
    const result = await runtime.exec("db:migrate");
    expect(result.success).toBe(false);
    expect(result.output.join("\n")).toMatch(/not.*supported|sandboxed/i);
  });

  it("db:seed errors explicitly", async () => {
    runtime.vfs.write("db/seeds.ts", "// seed data");
    const result = await runtime.exec("db:seed");
    expect(result.success).toBe(false);
    expect(result.output.join("\n")).toMatch(/not.*supported|sandboxed/i);
  });
});

describe("exec: db:drop", () => {
  it("drops all tables", async () => {
    runtime.adapter.execRaw("CREATE TABLE users (id INTEGER PRIMARY KEY)");
    runtime.adapter.execRaw("CREATE TABLE posts (id INTEGER PRIMARY KEY)");
    expect(runtime.getTables()).toContain("users");

    const result = await runtime.exec("db:drop");
    expect(result.success).toBe(true);
    expect(runtime.getTables().filter((t) => !t.startsWith("_vfs_"))).toHaveLength(0);
  });
});

describe("exec: empty input", () => {
  it("returns success with no output", async () => {
    const result = await runtime.exec("");
    expect(result.success).toBe(true);
    expect(result.output).toHaveLength(0);
  });

  it("handles whitespace-only input", async () => {
    const result = await runtime.exec("   ");
    expect(result.success).toBe(true);
    expect(result.output).toHaveLength(0);
  });
});

describe("exec: unknown command", () => {
  it("returns error with available commands", async () => {
    const result = await runtime.exec("foobar");
    expect(result.success).toBe(false);
    expect(result.output.join("\n")).toContain("Unknown command");
    expect(result.output.join("\n")).toContain("Available commands");
  });
});

describe("runtime utilities", () => {
  it("executeSQL delegates to adapter", () => {
    runtime.adapter.execRaw("CREATE TABLE t (id INTEGER)");
    const results = runtime.executeSQL("SELECT * FROM t");
    expect(results).toBeDefined();
  });

  it("getTables returns table names", () => {
    runtime.adapter.execRaw("CREATE TABLE users (id INTEGER)");
    expect(runtime.getTables()).toContain("users");
  });

  it("reset clears everything", () => {
    runtime.adapter.execRaw("CREATE TABLE users (id INTEGER)");
    runtime.vfs.write("test.ts", "hello");
    runtime.reset();
    expect(runtime.getTables().filter((t) => !t.startsWith("_vfs_"))).toHaveLength(0);
    expect(runtime.vfs.list()).toHaveLength(0);
  });

  it("exportDB returns a Uint8Array", () => {
    runtime.adapter.execRaw("CREATE TABLE users (id INTEGER)");
    const data = runtime.exportDB();
    expect(data).toBeInstanceOf(Uint8Array);
    expect(data.length).toBeGreaterThan(0);
  });

  it("loadDB replaces the database", async () => {
    runtime.adapter.execRaw("CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT)");
    runtime.adapter.execRaw("INSERT INTO users (name) VALUES ('Alice')");
    const snapshot = runtime.exportDB();

    runtime.reset();
    expect(runtime.getTables().filter((t) => !t.startsWith("_vfs_"))).toHaveLength(0);

    runtime.loadDB(snapshot);
    expect(runtime.getTables()).toContain("users");
    const results = runtime.executeSQL("SELECT name FROM users");
    expect(results[0].values[0][0]).toBe("Alice");
  });
});
