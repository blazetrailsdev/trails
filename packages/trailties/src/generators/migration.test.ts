import { afterEach, beforeEach, describe, expect, it } from "vitest";
import * as fs from "node:fs";
import * as nodePath from "node:path";
import * as os from "node:os";
import {
  currentMigrationNumber,
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
  });

  it("nextMigrationNumber raises NotImplementedError", () => {
    expect(() => nextMigrationNumber()).toThrow(NotImplementedError);
  });

  it("migrationTemplate prepends migration_number, sets assigns, and renders", async () => {
    const host = {
      output: () => undefined,
      options: {},
      migrationNumber: "",
      migrationFileName: "",
      migrationClassName: "",
      destinationRoot: tmpDir,
      relativeToOriginalDestinationRoot: (p: string) => p,
      constructor: { nextMigrationNumber: () => "20260101000000" },
    };
    const dest = await migrationTemplate(
      host,
      () => `class ${host.migrationClassName} {}`,
      "db/migrate/create_articles.rb",
    );
    expect(dest).toBe(`${tmpDir}/db/migrate/20260101000000_create_articles.rb`);
    expect(host.migrationFileName).toBe("create_articles");
    expect(host.migrationClassName).toBe("CreateArticles");
    expect(fs.readFileSync(dest!, "utf-8")).toBe("class CreateArticles {}");
  });
});
