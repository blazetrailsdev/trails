import { describe, it, expect, beforeEach } from "vitest";
import { mkdtemp, readFile } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { generateModel } from "./generate-model.js";

describe("ArGenerateModelTest", () => {
  let dir: string;
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "ar-model-"));
  });

  it("writes model to app/models and migration to db/migrate", async () => {
    const result = await generateModel(dir, "Article", [], 1700000010000);
    expect(result.written).toBe(true);
    expect(result.modelPath).toMatch(/app\/models\/article\.ts$/);
    expect(result.migrationPath).toMatch(/1700000010000_create_articles\.ts$/);
  });

  it("model file exports a Base subclass", async () => {
    const result = await generateModel(dir, "User", [], 1700000011000);
    const src = await readFile(result.modelPath, "utf8");
    expect(src).toContain("export class User extends Base");
    expect(src).toContain('from "@blazetrails/activerecord"');
  });

  it("migration uses createTable with plural table name and timestamps", async () => {
    const result = await generateModel(
      dir,
      "Post",
      [{ name: "title", type: "string" }],
      1700000012000,
    );
    const src = await readFile(result.migrationPath, "utf8");
    expect(src).toContain('this.createTable("posts"');
    expect(src).toContain('t.string("title")');
    expect(src).toContain("t.timestamps()");
  });

  it("model declares typed attributes and belongsTo for references", async () => {
    const result = await generateModel(
      dir,
      "Comment",
      [
        { name: "post", type: "references" },
        { name: "body", type: "text" },
        { name: "score", type: "integer" },
      ],
      1700000013000,
    );
    const src = await readFile(result.modelPath, "utf8");
    expect(src).toContain('this.belongsTo("post")');
    expect(src).toContain("declare body: string");
    expect(src).toContain("declare score: number");
  });

  it("handles CamelCase name via underscore conversion", async () => {
    const result = await generateModel(dir, "BlogPost", [], 1700000014000);
    expect(result.modelPath).toMatch(/blog_post\.ts$/);
    expect(result.migrationPath).toMatch(/create_blog_posts\.ts$/);
    expect(await readFile(result.modelPath, "utf8")).toContain(
      "export class BlogPost extends Base",
    );
  });

  it("refuses overwrite without --force; succeeds with --force", async () => {
    const ts = 1700000015000;
    await generateModel(dir, "Tag", [], ts);
    expect((await generateModel(dir, "Tag", [], ts)).skipped).toBe(true);
    const forced = await generateModel(dir, "Tag", [{ name: "name", type: "string" }], ts, {
      force: true,
    });
    expect(forced.written).toBe(true);
    expect(await readFile(forced.modelPath, "utf8")).toContain("declare name: string");
  });

  it("dry-run returns paths without writing", async () => {
    const result = await generateModel(dir, "Widget", [], 1700000016000, { dryRun: true });
    expect(result.written).toBe(false);
    await expect(readFile(result.modelPath, "utf8")).rejects.toThrow();
  });
});
