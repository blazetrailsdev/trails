import { describe, it, expect, beforeEach } from "vitest";
import initSqlJs from "sql.js";
import { SqlJsAdapter } from "./sql-js-adapter.js";
import { VirtualFS } from "./virtual-fs.js";
import { createTrailCLI } from "./trail-cli.js";
import { prepareCodeForEval, executeCode } from "./execute-code.js";
import { Base, Migration, MigrationRunner, Migrator, Schema } from "@blazetrails/activerecord";
import { ActionController } from "@blazetrails/actionpack";
import type { MigrationProxy } from "@blazetrails/activerecord/migration";

describe("prepareCodeForEval", () => {
  it("strips import statements", () => {
    const code = `import { Migration } from "@blazetrails/activerecord";\nclass Foo {}`;
    const result = prepareCodeForEval(code);
    expect(result).not.toContain("import");
    expect(result).toContain("class Foo {}");
  });

  it("strips type-only imports", () => {
    const code = `import type { DatabaseAdapter } from "@blazetrails/activerecord/adapter";`;
    expect(prepareCodeForEval(code).trim()).toBe("");
  });

  it("converts export class to plain class", () => {
    const code = `export class Foo extends Migration {}`;
    expect(prepareCodeForEval(code)).toContain("class Foo extends Migration {}");
    expect(prepareCodeForEval(code)).not.toContain("export");
  });

  it("converts export const/let/var", () => {
    expect(prepareCodeForEval("export const x = 1;")).toContain("const x = 1;");
    expect(prepareCodeForEval("export let y = 2;")).toContain("let y = 2;");
  });

  it("converts export function", () => {
    expect(prepareCodeForEval("export function foo() {}")).toContain("function foo() {}");
  });

  it("converts export default class", () => {
    const result = prepareCodeForEval("export default class Foo {}");
    expect(result).toContain("class Foo {}");
    expect(result).not.toContain("export");
  });

  it("strips multi-line named imports", () => {
    const code = `import {\n  Base,\n  Migration\n} from "@blazetrails/activerecord";\nconst x = 1;`;
    const result = prepareCodeForEval(code);
    expect(result).not.toContain("import");
    expect(result).toContain("const x = 1;");
  });

  it("strips export lists", () => {
    expect(prepareCodeForEval("export { Foo, Bar };").trim()).toBe("");
    expect(prepareCodeForEval('export { Foo } from "./foo.js";').trim()).toBe("");
  });

  it("strips star re-exports", () => {
    expect(prepareCodeForEval('export * from "./mod.js";').trim()).toBe("");
  });

  it("preserves non-import/export code", () => {
    const code = `const x = 42;\nfunction greet() { return "hi"; }`;
    expect(prepareCodeForEval(code)).toBe(code);
  });
});

describe("executeCode", () => {
  let adapter: SqlJsAdapter;
  let migrations: MigrationProxy[];

  function registerMigration(proxy: MigrationProxy) {
    const idx = migrations.findIndex((m) => m.version === proxy.version);
    if (idx >= 0) migrations[idx] = proxy;
    else migrations.push(proxy);
  }

  function deps() {
    return {
      Base,
      Migration,
      MigrationRunner,
      Migrator,
      Schema,
      ActionController,
      adapter,
      appServer: null,
      registerMigration,
    };
  }

  beforeEach(async () => {
    const SQL = await initSqlJs();
    const db = new SQL.Database();
    adapter = new SqlJsAdapter(db);
    Base.adapter = adapter;
    migrations = [];
  });

  it("executes simple code", async () => {
    await executeCode("const x = 1 + 1;", deps());
  });

  it("auto-registers a Migration subclass", async () => {
    const migrationCode = `
import { Migration } from "@blazetrails/activerecord";

export class CreateUsers extends Migration {
  static version = "20260406120000";

  async change() {
    this.createTable("users", (t) => {
      t.string("name");
      t.string("email");
    });
  }
}
`;
    await executeCode(migrationCode, deps());
    expect(migrations).toHaveLength(1);
    expect(migrations[0].version).toBe("20260406120000");
    expect(migrations[0].name).toBe("CreateUsers");
  });

  it("registered migration can run up and create a table", async () => {
    const migrationCode = `
import { Migration } from "@blazetrails/activerecord";

export class CreatePosts extends Migration {
  static version = "20260406120001";

  async change() {
    this.createTable("posts", (t) => {
      t.string("title");
      t.text("body");
    });
  }
}
`;
    await executeCode(migrationCode, deps());
    expect(migrations).toHaveLength(1);

    // Run the migration
    const migration = migrations[0].migration();
    await migration.up(adapter);

    // Verify table was created
    const tables = adapter.getTables();
    expect(tables).toContain("posts");

    const columns = adapter.getColumns("posts");
    const colNames = columns.map((c) => c.name);
    expect(colNames).toContain("title");
    expect(colNames).toContain("body");
  });
});

describe("edit file and verify preview serves updated content", () => {
  let adapter: SqlJsAdapter;
  let vfs: VirtualFS;
  let migrations: MigrationProxy[];

  function registerMigration(proxy: MigrationProxy) {
    const idx = migrations.findIndex((m) => m.version === proxy.version);
    if (idx >= 0) migrations[idx] = proxy;
    else migrations.push(proxy);
  }

  beforeEach(async () => {
    const SQL = await initSqlJs();
    const db = new SQL.Database();
    adapter = new SqlJsAdapter(db);
    Base.adapter = adapter;
    vfs = new VirtualFS(adapter);
    migrations = [];
  });

  it("scaffold → edit index.html → preview serves the edit", async () => {
    const { resolveVfsPath } = await import("./vfs-resolve.js");

    const deps = {
      Base,
      Migration,
      MigrationRunner,
      Migrator,
      Schema,
      ActionController,
      adapter,
      appServer: null,
      registerMigration,
    };

    const cli = createTrailCLI({
      vfs,
      adapter,
      executeCode: (code: string) => executeCode(code, deps),
      getMigrations: () => [...migrations],
      registerMigration,
      clearMigrations: () => {
        migrations.length = 0;
      },
      getTables: () => adapter.getTables(),
    });

    // 1. Scaffold a new app
    const newResult = await cli.exec("new myapp");
    expect(newResult.success).toBe(true);

    // 2. Verify public/index.html was created with welcome content
    const reader = {
      read: (path: string) => vfs.read(path)?.content ?? null,
      readCompiled: () => null,
    };
    const original = resolveVfsPath("index.html", reader);
    expect(original.found).toBe(true);
    expect(original.path).toBe("public/index.html");
    expect(original.content).toContain("Trails");

    // 3. Edit the file (simulates user editing in Monaco + saving)
    vfs.write("public/index.html", "<html><body><h1>My Custom Page</h1></body></html>");

    // 4. Verify the preview path resolves to the updated content
    const updated = resolveVfsPath("index.html", reader);
    expect(updated.found).toBe(true);
    expect(updated.content).toBe("<html><body><h1>My Custom Page</h1></body></html>");
  });
});

describe("generate model + db:migrate end-to-end", () => {
  let adapter: SqlJsAdapter;
  let vfs: VirtualFS;
  let migrations: MigrationProxy[];

  function registerMigration(proxy: MigrationProxy) {
    const idx = migrations.findIndex((m) => m.version === proxy.version);
    if (idx >= 0) migrations[idx] = proxy;
    else migrations.push(proxy);
  }

  beforeEach(async () => {
    const SQL = await initSqlJs();
    const db = new SQL.Database();
    adapter = new SqlJsAdapter(db);
    Base.adapter = adapter;
    vfs = new VirtualFS(adapter);
    migrations = [];
  });

  it("generate model then db:migrate creates the table", async () => {
    const deps = {
      Base,
      Migration,
      MigrationRunner,
      Migrator,
      Schema,
      ActionController,
      adapter,
      appServer: null,
      registerMigration,
    };

    const cli = createTrailCLI({
      vfs,
      adapter,
      executeCode: (code: string) => executeCode(code, deps),
      getMigrations: () => [...migrations],
      registerMigration,
      clearMigrations: () => {
        migrations.length = 0;
      },
      getTables: () => adapter.getTables(),
    });

    // Generate a model
    const genResult = await cli.exec("generate model User name:string email:string");
    expect(genResult.success).toBe(true);

    // Verify migration file was created
    const migrationFiles = vfs.list().filter((f) => f.path.startsWith("db/migrations/"));
    expect(migrationFiles.length).toBeGreaterThan(0);

    // Run db:migrate
    const migrateResult = await cli.exec("db:migrate");
    expect(migrateResult.success).toBe(true);

    // Verify users table was created
    const tables = adapter.getTables().filter((t) => !t.startsWith("_vfs_"));
    expect(tables).toContain("users");

    // Verify columns
    const columns = adapter.getColumns("users");
    const colNames = columns.map((c) => c.name);
    expect(colNames).toContain("name");
    expect(colNames).toContain("email");
  });
});
