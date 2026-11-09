import { action } from "@blazetrails/thor/actions";
import { Basic } from "@blazetrails/thor/shell/basic";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import * as fs from "node:fs";
import * as nodePath from "node:path";
import * as os from "node:os";
import { ClassMethods, Migration, NotImplementedError } from "../../lib/generators/migration.js";

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
    expect(ClassMethods.migrationLookupAt(d)).toEqual([
      `${d}/20260101000000_create_posts.ts`,
      `${d}/20260103000000_other.ts`,
    ]);
    expect(ClassMethods.migrationLookupAt(nodePath.join(tmpDir, "missing"))).toEqual([]);
    expect(ClassMethods.isMigrationExists(d, "create_posts")).toBe(
      `${d}/20260101000000_create_posts.ts`,
    );
    expect(ClassMethods.isMigrationExists(d, "missing")).toBeUndefined();
    expect(ClassMethods.currentMigrationNumber(d)).toBe(20260103000000);
  });

  it("nextMigrationNumber raises NotImplementedError", () => {
    expect(() => ClassMethods.nextMigrationNumber("db/migrate")).toThrow(NotImplementedError);
  });

  it("migrationTemplate prepends migration_number, sets assigns, and renders", async () => {
    fs.writeFileSync(`${tmpDir}/migration.ts.tt`, "class <%= migrationClassName %> {}");
    fs.writeFileSync(
      `${tmpDir}/migration.ts.tt.js`,
      "export default function () { return `class ${this.migrationClassName} {}`; }",
    );
    const host = {
      findInSourcePaths: async (file: string) => `${tmpDir}/${file}.tt`,
      shell: new Basic(),
      options: {},
      migrationNumber: "",
      migrationFileName: "",
      migrationClassName: "",
      destinationRoot: tmpDir,
      relativeToOriginalDestinationRoot: (p: string) => p,
      constructor: { ...ClassMethods, nextMigrationNumber: () => "20260101000000" },
      action,
      ...Migration,
    };
    const dest = await host.migrationTemplate("migration.ts", "db/migrate/create_articles.rb");
    expect(dest).toBe("db/migrate/20260101000000_create_articles.rb");
    expect(host.migrationFileName).toBe("create_articles");
    expect(host.migrationClassName).toBe("CreateArticles");
    expect(fs.readFileSync(`${tmpDir}/${dest}`, "utf-8")).toBe("class CreateArticles {}");
  });
});
