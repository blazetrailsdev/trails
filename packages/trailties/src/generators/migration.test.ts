import { afterEach, beforeEach, describe, expect, it } from "vitest";
import * as fs from "node:fs";
import * as nodePath from "node:path";
import * as os from "node:os";
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

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(nodePath.join(os.tmpdir(), "trails-migration-"));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe("migration", () => {
  it("lookupAt + exists + currentMigrationNumber + buildAssigns", () => {
    const d = nodePath.join(tmpDir, "d");
    fs.mkdirSync(d);
    for (const name of ["20260101000000_create_posts.ts", "20260103000000_other.ts", "skip.md"]) {
      fs.writeFileSync(nodePath.join(d, name), "");
    }
    expect(migrationLookupAt(d)).toEqual([
      `${d}/20260101000000_create_posts.ts`,
      `${d}/20260103000000_other.ts`,
    ]);
    expect(migrationLookupAt(nodePath.join(tmpDir, "missing"))).toEqual([]);
    expect(migrationExists(d, "create_posts")).toBe(`${d}/20260101000000_create_posts.ts`);
    expect(migrationExists(d, "missing")).toBeUndefined();
    expect(currentMigrationNumber(d)).toBe(20260103000000);
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
    let captured: MigrationAssigns | undefined;
    const host = {
      output: () => undefined,
      options: {},
      migrationFileName: "create_articles",
      destinationRoot: tmpDir,
      relativeToOriginalDestinationRoot: (p: string) => p,
      nextMigrationNumber: () => "20260101000000",
      setMigrationAssigns: (a: MigrationAssigns) => void (captured = a),
    };
    const dest = await migrationTemplate(
      host,
      (a) => `class ${a.migrationClassName} {}`,
      "db/migrate/create_articles.rb",
    );
    expect(dest).toBe(`${tmpDir}/db/migrate/20260101000000_create_articles.rb`);
    expect(captured?.migrationClassName).toBe("CreateArticles");
    expect(fs.readFileSync(dest, "utf-8")).toBe("class CreateArticles {}");
  });
});
