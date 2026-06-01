import { describe, it, expect } from "vitest";
import { parseSchemaTs } from "./schema-ts-parser.js";

const FILE = "db/schema.ts";

describe("parseSchemaTs", () => {
  it("parses basic columns and synthesizes default id", () => {
    const source = `
      export default async function defineSchema(ctx: MigrationContext) {
        await ctx.createTable("users", { force: "cascade" }, (t) => {
          t.string("name");
          t.integer("age");
        });
      }
    `;
    const result = parseSchemaTs(source, FILE);
    expect(result["users"]).toMatchObject({
      id: { type: "bigint", null: false },
      name: { type: "string", null: true },
      age: { type: "integer", null: true },
    });
  });

  it("respects null: false on columns", () => {
    const source = `
      export default async function defineSchema(ctx: MigrationContext) {
        await ctx.createTable("posts", { force: "cascade" }, (t) => {
          t.string("title", { null: false });
          t.text("body");
        });
      }
    `;
    const result = parseSchemaTs(source, FILE);
    expect(result["posts"]!["title"]).toEqual({ type: "string", null: false });
    expect(result["posts"]!["body"]).toEqual({ type: "text", null: true });
  });

  it("handles arrays: array: true → type: array + arrayElementType", () => {
    const source = `
      export default async function defineSchema(ctx: MigrationContext) {
        await ctx.createTable("items", { force: "cascade" }, (t) => {
          t.string("tags", { array: true });
          t.integer("scores", { array: true, null: false });
        });
      }
    `;
    const result = parseSchemaTs(source, FILE);
    expect(result["items"]!["tags"]).toEqual({
      type: "array",
      null: true,
      arrayElementType: "string",
    });
    expect(result["items"]!["scores"]).toEqual({
      type: "array",
      null: false,
      arrayElementType: "integer",
    });
  });

  it("handles t.enum columns", () => {
    const source = `
      export default async function defineSchema(ctx: MigrationContext) {
        await ctx.createTable("articles", { force: "cascade" }, (t) => {
          t.enum("status", { enum_type: "article_status", null: false });
        });
      }
    `;
    const result = parseSchemaTs(source, FILE);
    expect(result["articles"]!["status"]).toEqual({ type: "enum", null: false });
  });

  it("handles t.column fallback with raw SQL type", () => {
    const source = `
      export default async function defineSchema(ctx: MigrationContext) {
        await ctx.createTable("widgets", { force: "cascade" }, (t) => {
          t.column("data", "jsonb", { null: false });
          t.column("extra", "tsvector");
        });
      }
    `;
    const result = parseSchemaTs(source, FILE);
    expect(result["widgets"]!["data"]).toEqual({ type: "jsonb", null: false });
    expect(result["widgets"]!["extra"]).toEqual({ type: "tsvector", null: true });
  });

  it("id: false → no id column synthesized", () => {
    const source = `
      export default async function defineSchema(ctx: MigrationContext) {
        await ctx.createTable("schema_migrations", { id: false, force: "cascade" }, (t) => {
          t.string("version", { null: false });
        });
      }
    `;
    const result = parseSchemaTs(source, FILE);
    expect(result["schema_migrations"]).not.toHaveProperty("id");
    expect(result["schema_migrations"]!["version"]).toEqual({ type: "string", null: false });
  });

  it("id: 'uuid' → id column with type uuid", () => {
    const source = `
      export default async function defineSchema(ctx: MigrationContext) {
        await ctx.createTable("tokens", { id: "uuid", force: "cascade" }, (t) => {
          t.string("value");
        });
      }
    `;
    const result = parseSchemaTs(source, FILE);
    expect(result["tokens"]!["id"]).toEqual({ type: "uuid", null: false });
  });

  it("composite primaryKey: [...] → id: false, PK cols captured from body", () => {
    const source = `
      export default async function defineSchema(ctx: MigrationContext) {
        await ctx.createTable("taggings", { primaryKey: ["tag_id", "taggable_id"], id: false, force: "cascade" }, (t) => {
          t.integer("tag_id", { null: false });
          t.integer("taggable_id", { null: false });
          t.string("taggable_type");
        });
      }
    `;
    const result = parseSchemaTs(source, FILE);
    expect(result["taggings"]).not.toHaveProperty("id");
    expect(result["taggings"]!["tag_id"]).toEqual({ type: "integer", null: false });
    expect(result["taggings"]!["taggable_id"]).toEqual({ type: "integer", null: false });
    expect(result["taggings"]!["taggable_type"]).toEqual({ type: "string", null: true });
  });

  it("datetime columns resolve correctly (no t.timestamps() expansion needed — SchemaDumper expands inline)", () => {
    const source = `
      export default async function defineSchema(ctx: MigrationContext) {
        await ctx.createTable("events", { force: "cascade" }, (t) => {
          t.datetime("created_at", { null: false });
          t.datetime("updated_at", { null: false });
          t.datetime("occurred_at");
        });
      }
    `;
    const result = parseSchemaTs(source, FILE);
    expect(result["events"]!["created_at"]).toEqual({ type: "datetime", null: false });
    expect(result["events"]!["updated_at"]).toEqual({ type: "datetime", null: false });
    expect(result["events"]!["occurred_at"]).toEqual({ type: "datetime", null: true });
  });

  it("t.timestamps() expands to created_at + updated_at (not-null datetime)", () => {
    const source = `
      export default async function defineSchema(ctx: MigrationContext) {
        await ctx.createTable("logs", { force: "cascade" }, (t) => {
          t.string("message");
          t.timestamps();
        });
      }
    `;
    const result = parseSchemaTs(source, FILE);
    expect(result["logs"]!["created_at"]).toEqual({ type: "datetime", null: false });
    expect(result["logs"]!["updated_at"]).toEqual({ type: "datetime", null: false });
  });

  it("skips createTable with concise (non-block) arrow body without crashing", () => {
    // Concise arrow bodies are not emitted by SchemaDumper but must not crash.
    const source = `
      export default async function defineSchema(ctx: MigrationContext) {
        await ctx.createTable("weird", { force: "cascade" }, (t) => void t);
        await ctx.createTable("normal", { force: "cascade" }, (t) => {
          t.string("name");
        });
      }
    `;
    const result = parseSchemaTs(source, FILE);
    expect(result["weird"]).toBeDefined();
    expect(result["weird"]).not.toHaveProperty("name");
    expect(result["normal"]!["name"]).toEqual({ type: "string", null: true });
  });

  it("parses multiple tables", () => {
    const source = `
      export default async function defineSchema(ctx: MigrationContext) {
        await ctx.createTable("users", { force: "cascade" }, (t) => {
          t.string("email", { null: false });
        });
        await ctx.createTable("posts", { force: "cascade" }, (t) => {
          t.integer("user_id");
          t.text("content");
        });
      }
    `;
    const result = parseSchemaTs(source, FILE);
    expect(Object.keys(result)).toEqual(expect.arrayContaining(["users", "posts"]));
    expect(result["users"]!["email"]).toEqual({ type: "string", null: false });
    expect(result["posts"]!["user_id"]).toEqual({ type: "integer", null: true });
    expect(result["posts"]!["content"]).toEqual({ type: "text", null: true });
  });
});
