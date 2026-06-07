import { describe, it, expect } from "vitest";
import { generateModels } from "@blazetrails/activerecord";
import { parseSchemaForModels } from "./schema-ts-model-parser.js";

const FILE = "db/schema.ts";

function tableNamed(source: string, name: string) {
  const table = parseSchemaForModels(source, FILE).find((t) => t.name === name);
  if (!table) throw new Error(`table ${name} not found`);
  return table;
}

describe("parseSchemaForModels", () => {
  it("synthesizes a default `id` primary key and bigint id column", () => {
    const source = `
      export default async function defineSchema(ctx) {
        await ctx.createTable("users", { force: "cascade" }, (t) => {
          t.string("name");
        });
      }
    `;
    const users = tableNamed(source, "users");
    expect(users.primaryKey).toBe("id");
    expect(users.columns).toEqual([
      { name: "id", type: "bigint" },
      { name: "name", type: "string" },
    ]);
    expect(users.foreignKeys).toEqual([]);
  });

  it("reads a uuid primary key", () => {
    const source = `
      export default async function defineSchema(ctx) {
        await ctx.createTable("widgets", { id: "uuid" }, (t) => {
          t.string("label");
        });
      }
    `;
    const widgets = tableNamed(source, "widgets");
    expect(widgets.primaryKey).toBe("id");
    expect(widgets.columns).toContainEqual({ name: "id", type: "uuid" });
  });

  it("captures composite primary key column names from the literal array", () => {
    const source = `
      export default async function defineSchema(ctx) {
        await ctx.createTable("memberships", { primaryKey: ["user_id", "group_id"], id: false }, (t) => {
          t.bigint("user_id", { null: false });
          t.bigint("group_id", { null: false });
        });
      }
    `;
    const memberships = tableNamed(source, "memberships");
    expect(memberships.primaryKey).toEqual(["user_id", "group_id"]);
    // No synthesized id column; the composite members appear as ordinary columns.
    expect(memberships.columns).toEqual([
      { name: "user_id", type: "bigint" },
      { name: "group_id", type: "bigint" },
    ]);
  });

  it("returns null primaryKey and no id column for `id: false` tables", () => {
    const source = `
      export default async function defineSchema(ctx) {
        await ctx.createTable("logs", { id: false }, (t) => {
          t.string("message");
        });
      }
    `;
    const logs = tableNamed(source, "logs");
    expect(logs.primaryKey).toBeNull();
    expect(logs.columns).toEqual([{ name: "message", type: "string" }]);
  });

  it("parses a foreign key with an explicit column option", () => {
    const source = `
      export default async function defineSchema(ctx) {
        await ctx.createTable("books", { force: "cascade" }, (t) => {
          t.string("title");
        });
        await ctx.addForeignKey("books", "authors", { column: "author_id" });
      }
    `;
    const books = tableNamed(source, "books");
    expect(books.foreignKeys).toHaveLength(1);
    const fk = books.foreignKeys[0]!;
    expect(fk.fromTable).toBe("books");
    expect(fk.toTable).toBe("authors");
    expect(fk.column).toBe("author_id");
    expect(fk.primaryKey).toBe("id");
    expect(fk.validate).toBe(true);
  });

  it("infers the FK column from the Rails convention when the option is absent", () => {
    const source = `
      export default async function defineSchema(ctx) {
        await ctx.createTable("reviews", { force: "cascade" }, (t) => {
          t.text("body");
        });
        await ctx.addForeignKey("reviews", "books");
      }
    `;
    const fk = tableNamed(source, "reviews").foreignKeys[0]!;
    expect(fk.column).toBe("book_id");
    // Synthesized name mirrors Rails' fk_rails_<10hex> so it round-trips through SchemaDumper.
    expect(fk.name).toBe("fk_rails_924a0b30ca");
  });

  it("reads onDelete, primaryKey, and validate options off a foreign key", () => {
    const source = `
      export default async function defineSchema(ctx) {
        await ctx.createTable("comments", { force: "cascade" }, (t) => {
          t.text("body");
        });
        await ctx.addForeignKey("comments", "posts", { column: "post_id", primaryKey: "uuid", onDelete: "cascade", validate: false });
      }
    `;
    const fk = tableNamed(source, "comments").foreignKeys[0]!;
    expect(fk.column).toBe("post_id");
    expect(fk.primaryKey).toBe("uuid");
    expect(fk.onDelete).toBe("cascade");
    expect(fk.validate).toBe(false);
  });

  it("handles multiple tables with cross-table foreign keys", () => {
    const source = `
      export default async function defineSchema(ctx) {
        await ctx.createTable("authors", { force: "cascade" }, (t) => {
          t.string("name");
        });
        await ctx.createTable("books", { force: "cascade" }, (t) => {
          t.string("title");
        });
        await ctx.createTable("reviews", { force: "cascade" }, (t) => {
          t.text("body");
        });
        await ctx.addForeignKey("books", "authors", { column: "author_id" });
        await ctx.addForeignKey("reviews", "books", { column: "book_id" });
      }
    `;
    const tables = parseSchemaForModels(source, FILE);
    expect(tables.map((t) => t.name)).toEqual(["authors", "books", "reviews"]);
    expect(tables.find((t) => t.name === "authors")!.foreignKeys).toEqual([]);
    expect(tables.find((t) => t.name === "books")!.foreignKeys).toHaveLength(1);
    expect(tables.find((t) => t.name === "books")!.foreignKeys[0]!.toTable).toBe("authors");
    expect(tables.find((t) => t.name === "reviews")!.foreignKeys[0]!.column).toBe("book_id");
  });

  it("produces a shape generateModels consumes into correct classes and associations", () => {
    // Locks the real contract: the parsed IntrospectedTable[] must flow
    // straight into generateModels (PR 2 wires this into the CLI).
    const source = `
      export default async function defineSchema(ctx) {
        await ctx.createTable("authors", { force: "cascade" }, (t) => {
          t.string("name");
        });
        await ctx.createTable("books", { force: "cascade" }, (t) => {
          t.string("title");
        });
        await ctx.addForeignKey("books", "authors", { column: "author_id" });
      }
    `;
    const out = generateModels(parseSchemaForModels(source, FILE), { noHeader: true });
    expect(out).toContain("export class Author extends Base {");
    expect(out).toContain("export class Book extends Base {");
    expect(out).toContain('this.belongsTo("author");');
    expect(out).toContain('this.hasMany("books");');
  });
});
