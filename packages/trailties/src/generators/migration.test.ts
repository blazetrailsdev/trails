import { afterEach, describe, expect, it } from "vitest";
import {
  fsAdapterConfig,
  registerFsAdapter,
  type FsAdapter,
  type PathAdapter,
} from "@blazetrails/activesupport";
import {
  buildMigrationAssigns,
  currentMigrationNumber,
  type MigrationAssigns,
  migrationExists,
  migrationLookupAt,
  migrationTemplate,
  nextMigrationNumber,
  NotImplementedError,
} from "./migration.js";

const path: PathAdapter = {
  join: (...p) => p.join("/"),
  dirname: (p) => p.split("/").slice(0, -1).join("/") || "/",
  basename: (p) => p.split("/").pop()!,
  resolve: (...p) => p.join("/"),
  extname: (p) => (p.lastIndexOf(".") >= 0 ? p.slice(p.lastIndexOf(".")) : ""),
  isAbsolute: (p) => p.startsWith("/"),
  sep: "/",
};

function install(files: Map<string, string>, dirs: Set<string>): void {
  const dirOf = (p: string) => p.split("/").slice(0, -1).join("/") || "/";
  const fs = {
    exists: async (p: string) => files.has(p) || dirs.has(p),
    writeFile: async (p: string, c: string) => void files.set(p, c),
    mkdir: async (p: string) => void dirs.add(p),
    readdir: async (p: string) =>
      [...files.keys()].filter((f) => dirOf(f) === p).map((f) => f.slice(p.length + 1)),
  } as unknown as FsAdapter;
  registerFsAdapter("migration-test", fs, path);
  fsAdapterConfig.adapter = "migration-test";
}

describe("migration", () => {
  const PREV = fsAdapterConfig.adapter;
  afterEach(() => {
    fsAdapterConfig.adapter = PREV;
  });

  it("lookupAt + exists + currentMigrationNumber + buildAssigns", async () => {
    const files = new Map<string, string>([
      ["/d/20260101000000_create_posts.ts", ""],
      ["/d/20260103000000_other.ts", ""],
      ["/d/skip.md", ""],
    ]);
    install(files, new Set(["/d"]));
    expect(await migrationLookupAt("/d")).toEqual([
      "/d/20260101000000_create_posts.ts",
      "/d/20260103000000_other.ts",
    ]);
    expect(await migrationLookupAt("/missing")).toEqual([]);
    expect(await migrationExists("/d", "create_posts")).toBe("/d/20260101000000_create_posts.ts");
    expect(await migrationExists("/d", "missing")).toBeUndefined();
    expect(await currentMigrationNumber("/d")).toBe(20260103000000);
    expect(buildMigrationAssigns("db/migrate/create_posts.ts", "20260101000000")).toEqual({
      migrationNumber: "20260101000000",
      migrationFileName: "create_posts",
      migrationClassName: "CreatePosts",
    });
  });

  it("nextMigrationNumber raises NotImplementedError", () => {
    expect(() => nextMigrationNumber()).toThrow(NotImplementedError);
  });

  it("migrationTemplate prepends migration_number, sets assigns, and renders", async () => {
    const files = new Map<string, string>();
    install(files, new Set(["/app/db/migrate"]));
    let captured: MigrationAssigns | undefined;
    const host = {
      output: () => undefined,
      options: {},
      migrationFileName: "create_articles",
      destinationRoot: "/app",
      relativeToOriginalDestinationRoot: (p: string) => p,
      nextMigrationNumber: () => "20260101000000",
      setMigrationAssigns: (a: MigrationAssigns) => void (captured = a),
    };
    const dest = await migrationTemplate(
      host,
      "db/migrate/create_articles.rb",
      (a) => `class ${a.migrationClassName} {}`,
    );
    expect(dest).toBe("/app/db/migrate/20260101000000_create_articles.rb");
    expect(captured?.migrationClassName).toBe("CreateArticles");
    expect(files.get(dest)).toBe("class CreateArticles {}");
  });
});
