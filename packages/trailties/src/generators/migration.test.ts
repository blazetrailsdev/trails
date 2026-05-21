import { describe, it, expect } from "vitest";
import type { FsAdapter, PathAdapter } from "@blazetrails/activesupport";
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

const path = {
  join: (...p: string[]) => p.join("/"),
  basename: (p: string) => p.split("/").pop()!,
} as PathAdapter;

const fs = (entries: Record<string, string[]>): FsAdapter =>
  ({
    exists: async (p: string) => Object.hasOwn(entries, p),
    readdir: async (p: string) => entries[p] ?? [],
  }) as unknown as FsAdapter;

describe("migration", () => {
  it("lookupAt + exists + currentMigrationNumber + buildAssigns", async () => {
    const f = fs({
      "/d": ["20260101000000_create_posts.ts", "20260103000000_other.ts", "skip.md"],
    });
    expect(await migrationLookupAt(f, path, "/d")).toEqual([
      "/d/20260101000000_create_posts.ts",
      "/d/20260103000000_other.ts",
    ]);
    expect(await migrationLookupAt(fs({}), path, "/missing")).toEqual([]);
    expect(await migrationExists(f, path, "/d", "create_posts")).toBe(
      "/d/20260101000000_create_posts.ts",
    );
    expect(await migrationExists(f, path, "/d", "missing")).toBeUndefined();
    expect(await currentMigrationNumber(f, path, "/d")).toBe(20260103000000);
    expect(buildMigrationAssigns(path, "db/migrate/create_posts.ts", "20260101000000")).toEqual({
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
    const f = {
      exists: async (p: string) => files.has(p),
      writeFile: async (p: string, c: string) => void files.set(p, c),
      mkdir: async () => undefined,
      readdir: async () => [] as string[],
    } as unknown as FsAdapter;
    let captured: MigrationAssigns | undefined;
    const host = {
      fs: f,
      path: {
        ...path,
        dirname: (p: string) => p.split("/").slice(0, -1).join("/") || "/",
        isAbsolute: (p: string) => p.startsWith("/"),
      },
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
