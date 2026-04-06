import { describe, it, expect, beforeEach } from "vitest";
import initSqlJs from "sql.js";
import { SqlJsAdapter } from "./sql-js-adapter.js";
import { VirtualFS } from "./virtual-fs.js";
import { CompiledCache } from "./compiled-cache.js";
import { resolveVfsPath } from "./vfs-resolve.js";

// ── resolveVfsPath ─────────────────────────────────────────────────────

describe("resolveVfsPath", () => {
  let adapter: SqlJsAdapter;
  let vfs: VirtualFS;
  let compiled: CompiledCache;

  function reader() {
    return {
      read: (path: string) => vfs.read(path)?.content ?? null,
      readCompiled: (path: string) => compiled.get(path),
    };
  }

  beforeEach(async () => {
    const SQL = await initSqlJs();
    adapter = new SqlJsAdapter(new SQL.Database());
    vfs = new VirtualFS(adapter);
    compiled = new CompiledCache(adapter);
  });

  it("resolves exact path", () => {
    vfs.write("app/main.ts", "code");
    const r = resolveVfsPath("app/main.ts", reader());
    expect(r.found).toBe(true);
    expect(r.content).toBe("code");
    expect(r.path).toBe("app/main.ts");
  });

  it("prefers compiled JS for .ts files", () => {
    vfs.write("app/main.ts", "const x: string = 'raw'");
    compiled.set("app/main.ts", "const x = 'compiled'", "hash");
    const r = resolveVfsPath("app/main.ts", reader());
    expect(r.content).toBe("const x = 'compiled'");
  });

  it("falls back to public/ prefix", () => {
    vfs.write("public/index.html", "<html>welcome</html>");
    const r = resolveVfsPath("index.html", reader());
    expect(r.found).toBe(true);
    expect(r.path).toBe("public/index.html");
  });

  it("probes .ts extension for extensionless paths", () => {
    vfs.write("app/models/user.ts", "export class User {}");
    const r = resolveVfsPath("app/models/user", reader());
    expect(r.found).toBe(true);
    expect(r.path).toBe("app/models/user.ts");
  });

  it("probes .html extension for extensionless paths", () => {
    vfs.write("about.html", "<p>About</p>");
    const r = resolveVfsPath("about", reader());
    expect(r.found).toBe(true);
    expect(r.path).toBe("about.html");
  });

  it("probes /index.html for directory-like paths", () => {
    vfs.write("docs/index.html", "<p>Docs</p>");
    const r = resolveVfsPath("docs", reader());
    expect(r.found).toBe(true);
    expect(r.path).toBe("docs/index.html");
  });

  it("probes public/ with .html extension", () => {
    vfs.write("public/about.html", "<p>About</p>");
    const r = resolveVfsPath("about", reader());
    expect(r.found).toBe(true);
    expect(r.path).toBe("public/about.html");
  });

  it("probes public/ with /index.html", () => {
    vfs.write("public/admin/index.html", "<p>Admin</p>");
    const r = resolveVfsPath("admin", reader());
    expect(r.found).toBe(true);
    expect(r.path).toBe("public/admin/index.html");
  });

  it("returns not found for missing path", () => {
    const r = resolveVfsPath("nonexistent.ts", reader());
    expect(r.found).toBe(false);
  });

  it("does not probe extensions for paths that already have one", () => {
    vfs.write("app/main.js.ts", "code");
    const r = resolveVfsPath("app/main.js", reader());
    expect(r.found).toBe(false);
  });

  it("prefers exact match over public/ fallback", () => {
    vfs.write("style.css", "body { exact }");
    vfs.write("public/style.css", "body { public }");
    const r = resolveVfsPath("style.css", reader());
    expect(r.content).toBe("body { exact }");
  });
});

// ── SW runtime integration ─────────────────────────────────────────────

describe("sandbox-sw message handling", () => {
  let adapter: SqlJsAdapter;
  let vfs: VirtualFS;

  beforeEach(async () => {
    const SQL = await initSqlJs();
    const db = new SQL.Database();
    adapter = new SqlJsAdapter(db);
    vfs = new VirtualFS(adapter);
  });

  describe("VFS operations", () => {
    it("writes and reads files", () => {
      vfs.write("app/models/user.ts", "export class User {}");
      const file = vfs.read("app/models/user.ts");
      expect(file).not.toBeNull();
      expect(file!.content).toBe("export class User {}");
    });

    it("lists files", () => {
      vfs.write("a.ts", "a");
      vfs.write("b.ts", "b");
      const files = vfs.list();
      expect(files).toHaveLength(2);
    });

    it("deletes files", () => {
      vfs.write("a.ts", "a");
      expect(vfs.delete("a.ts")).toBe(true);
      expect(vfs.read("a.ts")).toBeNull();
    });

    it("renames files", () => {
      vfs.write("old.ts", "content");
      expect(vfs.rename("old.ts", "new.ts")).toBe(true);
      expect(vfs.read("old.ts")).toBeNull();
      expect(vfs.read("new.ts")!.content).toBe("content");
    });

    it("checks existence", () => {
      vfs.write("exists.ts", "yes");
      expect(vfs.exists("exists.ts")).toBe(true);
      expect(vfs.exists("nope.ts")).toBe(false);
    });
  });

  describe("DB operations", () => {
    it("lists tables (excluding _vfs_ tables)", () => {
      adapter.runSql('CREATE TABLE "users" ("id" INTEGER PRIMARY KEY, "name" TEXT)');
      const tables = adapter.getTables().filter((t) => !t.startsWith("_vfs_"));
      expect(tables).toContain("users");
    });

    it("gets columns", () => {
      adapter.runSql('CREATE TABLE "users" ("id" INTEGER PRIMARY KEY, "name" TEXT NOT NULL)');
      const cols = adapter.getColumns("users");
      expect(cols).toHaveLength(2);
      expect(cols[0].name).toBe("id");
      expect(cols[1].name).toBe("name");
      expect(cols[1].notnull).toBe(true);
    });

    it("executes raw SQL", () => {
      adapter.runSql('CREATE TABLE "users" ("id" INTEGER PRIMARY KEY, "name" TEXT)');
      adapter.runSql(`INSERT INTO "users" VALUES (1, 'dean')`);
      const results = adapter.execRaw('SELECT * FROM "users"');
      expect(results).toHaveLength(1);
      expect(results[0].columns).toEqual(["id", "name"]);
      expect(results[0].values).toEqual([[1, "dean"]]);
    });
  });

  describe("CLI execution", () => {
    it("trail-cli accepts generate model command", async () => {
      const { createTrailCLI } = await import("./trail-cli.js");
      const migrations: any[] = [];
      const cli = createTrailCLI({
        vfs,
        adapter,
        executeCode: async () => {},
        getMigrations: () => migrations,
        registerMigration: (m: any) => migrations.push(m),
        clearMigrations: () => {
          migrations.length = 0;
        },
        getTables: () => adapter.getTables(),
      });

      const result = await cli.exec("generate model User name:string email:string");
      expect(result.success).toBe(true);
      expect(result.exitCode).toBe(0);
      // Should have created migration and model files
      const files = vfs.list();
      expect(files.some((f) => f.path.includes("user"))).toBe(true);
    });
  });
});
