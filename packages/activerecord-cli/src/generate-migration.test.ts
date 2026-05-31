import { describe, it, expect, beforeEach } from "vitest";
import { mkdtemp, readFile } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import {
  parseFields,
  renderMigration,
  generateMigration,
  migrationTimestamp,
} from "./generate-migration.js";

describe("ArGenerateMigrationTest", () => {
  let dir: string;
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "ar-mig-"));
  });

  it("parses field:type tokens, skips bare tokens without colon, strips {…} modifiers", () => {
    expect(
      parseFields(["title:string", "count:integer", "noType", ":string", "size:string{40}"]),
    ).toEqual([
      { name: "title", type: "string" },
      { name: "count", type: "integer" },
      { name: "size", type: "string" },
    ]);
  });

  it("renders add_*_to_* migration with addColumn calls; tableizes singular table segment", () => {
    const src = renderMigration("add_name_to_user", [{ name: "name", type: "string" }]);
    expect(src).toContain("export default class AddNameToUser extends Migration");
    // table segment "user" → tableize → "users"
    expect(src).toContain('this.addColumn("users", "name", "string")');
  });

  it("renders add_*_to_* migration with addReference for references fields", () => {
    const src = renderMigration("add_post_to_comments", [{ name: "post", type: "references" }]);
    expect(src).toContain('this.addReference("comments", "post", { foreignKey: true })');
    expect(src).not.toContain("addColumn");
  });

  it("renders remove_*_from_* migration with removeColumn calls; tableizes singular table segment", () => {
    const src = renderMigration("remove_age_from_person", [{ name: "age", type: "integer" }]);
    // "person" → "people"
    expect(src).toContain('this.removeColumn("people", "age", "integer")');
  });

  it("renders remove_*_from_* migration with removeReference for references fields", () => {
    const src = renderMigration("remove_post_from_comments", [
      { name: "post", type: "belongs_to" },
    ]);
    expect(src).toContain('this.removeReference("comments", "post")');
    expect(src).not.toContain("removeColumn");
  });

  it("renders create_* migration with t.column(name, type) and timestamps", () => {
    const src = renderMigration("create_articles", [{ name: "title", type: "string" }]);
    expect(src).toContain('this.createTable("articles"');
    expect(src).toContain('t.column("title", "string")');
    expect(src).toContain("t.timestamps()");
  });

  it("renders create_* migration with t.references for reference fields", () => {
    const src = renderMigration("create_comments", [{ name: "post", type: "references" }]);
    expect(src).toContain('t.references("post", { foreignKey: true })');
  });

  it("renders generic migration with TODO body", () => {
    expect(renderMigration("do_something", [])).toContain("// TODO: implement migration");
  });

  it("migrationTimestamp returns a 14-digit YYYYMMDDHHMMSS string", () => {
    const ts = migrationTimestamp();
    expect(ts).toMatch(/^\d{14}$/);
  });

  it("writes file to db/migrate/ with timestamp prefix", async () => {
    const result = await generateMigration(
      dir,
      "AddEmailToUsers",
      [{ name: "email", type: "string" }],
      "20240101120000",
    );
    expect(result.written).toBe(true);
    expect(result.path).toMatch(/20240101120000_add_email_to_users\.ts$/);
    const content = await readFile(result.path, "utf8");
    expect(content).toContain('this.addColumn("users", "email", "string")');
  });

  it("refuses overwrite without --force; succeeds with --force", async () => {
    const ts = "20240101120001";
    await generateMigration(dir, "CreatePosts", [], ts);
    expect((await generateMigration(dir, "CreatePosts", [], ts)).skipped).toBe(true);
    const forced = await generateMigration(
      dir,
      "CreatePosts",
      [{ name: "title", type: "string" }],
      ts,
      { force: true },
    );
    expect(forced.written).toBe(true);
    expect(await readFile(forced.path, "utf8")).toContain('t.column("title", "string")');
  });

  it("dry-run returns path without writing", async () => {
    const result = await generateMigration(dir, "CreateItems", [], "20240101120002", {
      dryRun: true,
    });
    expect(result.written).toBe(false);
    await expect(readFile(result.path, "utf8")).rejects.toThrow();
  });
});
