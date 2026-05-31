import { describe, it, expect, beforeEach } from "vitest";
import { mkdtemp, readFile } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { parseFields, renderMigration, generateMigration } from "./generate-migration.js";

describe("ArGenerateMigrationTest", () => {
  let dir: string;
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "ar-mig-"));
  });

  it("parses field:type tokens, skips bare tokens without colon", () => {
    expect(parseFields(["title:string", "count:integer", "noType"])).toEqual([
      { name: "title", type: "string" },
      { name: "count", type: "integer" },
    ]);
  });

  it("renders add_*_to_* migration with addColumn calls", () => {
    const src = renderMigration("add_name_to_users", [{ name: "name", type: "string" }]);
    expect(src).toContain("export default class AddNameToUsers extends Migration");
    expect(src).toContain('this.addColumn("users", "name", "string")');
  });

  it("renders remove_*_from_* migration with removeColumn calls", () => {
    const src = renderMigration("remove_age_from_people", [{ name: "age", type: "integer" }]);
    expect(src).toContain('this.removeColumn("people", "age", "integer")');
  });

  it("renders create_* migration with createTable block and timestamps", () => {
    const src = renderMigration("create_articles", [{ name: "title", type: "string" }]);
    expect(src).toContain('this.createTable("articles"');
    expect(src).toContain('t.string("title")');
    expect(src).toContain("t.timestamps()");
  });

  it("renders generic migration with TODO body", () => {
    expect(renderMigration("do_something", [])).toContain("// TODO: implement migration");
  });

  it("writes file to db/migrate/ with timestamp prefix", async () => {
    const result = await generateMigration(
      dir,
      "AddEmailToUsers",
      [{ name: "email", type: "string" }],
      1700000000000,
    );
    expect(result.written).toBe(true);
    expect(result.path).toMatch(/1700000000000_add_email_to_users\.ts$/);
    const content = await readFile(result.path, "utf8");
    expect(content).toContain('this.addColumn("users", "email", "string")');
  });

  it("refuses overwrite without --force; succeeds with --force", async () => {
    const ts = 1700000001000;
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
    expect(await readFile(forced.path, "utf8")).toContain('t.string("title")');
  });

  it("dry-run returns path without writing", async () => {
    const result = await generateMigration(dir, "CreateItems", [], 1700000002000, { dryRun: true });
    expect(result.written).toBe(false);
    await expect(readFile(result.path, "utf8")).rejects.toThrow();
  });
});
