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
    const result = await generateModel(dir, "Article", [], "20240101120000");
    expect(result.written).toBe(true);
    expect(result.modelPath).toMatch(/app[/\\]models[/\\]article\.ts$/);
    expect(result.migrationPath).toMatch(/20240101120000_create_articles\.ts$/);
  });

  it("model file exports a Base subclass", async () => {
    const result = await generateModel(dir, "User", [], "20240101120001");
    const src = await readFile(result.modelPath, "utf8");
    expect(src).toContain("export class User extends Base");
    expect(src).toContain('from "@blazetrails/activerecord"');
  });

  it("migration uses createTable with plural table name and timestamps", async () => {
    const result = await generateModel(
      dir,
      "Post",
      [{ name: "title", type: "string" }],
      "20240101120002",
    );
    const src = await readFile(result.migrationPath, "utf8");
    expect(src).toContain('this.createTable("posts"');
    expect(src).toContain('t.column("title", "string")');
    expect(src).toContain("t.timestamps()");
  });

  it("model declares typed attributes, foreign key, and belongsTo in single static block", async () => {
    const result = await generateModel(
      dir,
      "Comment",
      [
        { name: "post", type: "references" },
        { name: "body", type: "text" },
        { name: "score", type: "integer" },
      ],
      "20240101120003",
    );
    const src = await readFile(result.modelPath, "utf8");
    expect(src).toContain("declare post_id: number");
    expect(src).toContain("declare body: string");
    expect(src).toContain("declare score: number");
    expect(src).toContain('this.belongsTo("post")');
    expect((src.match(/static\s*\{/g) ?? []).length).toBe(1);
  });

  it("normalizes already-suffixed reference name: author_id:references → author_id, belongsTo(author)", async () => {
    const result = await generateModel(
      dir,
      "Comment",
      [{ name: "author_id", type: "references" }],
      "20240101120004",
    );
    const src = await readFile(result.modelPath, "utf8");
    expect(src).toContain("declare author_id: number");
    expect(src).toContain('this.belongsTo("author")');
    expect(src).not.toContain("author_id_id");
  });

  it("handles CamelCase name via underscore conversion", async () => {
    const result = await generateModel(dir, "BlogPost", [], "20240101120005");
    expect(result.modelPath).toMatch(/blog_post\.ts$/);
    expect(result.migrationPath).toMatch(/create_blog_posts\.ts$/);
    expect(await readFile(result.modelPath, "utf8")).toContain(
      "export class BlogPost extends Base",
    );
  });

  it("refuses overwrite without --force; succeeds with --force", async () => {
    const ts = "20240101120006";
    await generateModel(dir, "Tag", [], ts);
    expect((await generateModel(dir, "Tag", [], ts)).skipped).toBe(true);
    const forced = await generateModel(dir, "Tag", [{ name: "name", type: "string" }], ts, {
      force: true,
    });
    expect(forced.written).toBe(true);
    expect(await readFile(forced.modelPath, "utf8")).toContain("declare name: string");
  });

  it("dry-run returns paths without writing", async () => {
    const result = await generateModel(dir, "Widget", [], "20240101120007", { dryRun: true });
    expect(result.written).toBe(false);
    await expect(readFile(result.modelPath, "utf8")).rejects.toThrow();
  });
});
