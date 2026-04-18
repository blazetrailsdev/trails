import { describe, it, expect } from "vitest";
import { createTestAdapter } from "./test-adapter.js";
import { MigrationContext } from "./migration.js";
import { dumpSchemaColumns } from "./schema-columns-dump.js";
import { SchemaMigration } from "./schema-migration.js";

function fresh(): {
  adapter: ReturnType<typeof createTestAdapter>;
  ctx: MigrationContext;
} {
  const adapter = createTestAdapter();
  const ctx = new MigrationContext(adapter);
  return { adapter, ctx };
}

describe("dumpSchemaColumns", () => {
  it("emits a { table: { column: railsType } } map from a live adapter", async () => {
    const { adapter, ctx } = fresh();
    await ctx.createTable("users", {}, (t) => {
      t.string("name");
      t.integer("age");
      t.datetime("created_at");
    });
    await ctx.createTable("posts", {}, (t) => {
      t.string("title");
      t.text("body");
    });

    const dump = await dumpSchemaColumns(adapter);

    expect(Object.keys(dump).sort()).toEqual(["posts", "users"]);
    // Rich-shape assertions: each column entry is now an object with
    // `type` + `null`. `id` is integer on SQLite/PG but big_integer on
    // MariaDB — both map to TS `number` in the virtualizer.
    expect(["integer", "big_integer"]).toContain(dump.users.id.type);
    expect(dump.users.name.type).toBe("string");
    expect(dump.users.age.type).toBe("integer");
    expect(dump.users.created_at.type).toBe("datetime");
    expect(dump.posts.title.type).toBe("string");
    expect(dump.posts.body.type).toBe("text");
    // Nullable by default (no NOT NULL constraint declared above).
    expect(dump.users.name.null).toBe(true);
  });

  it("skips schema_migrations and ar_internal_metadata by default", async () => {
    const { adapter, ctx } = fresh();
    // SchemaMigration.createTable() uses the adapter's portable DDL.
    const sm = new SchemaMigration(adapter);
    await sm.createTable();
    await ctx.createTable("users", {}, () => {});

    const dump = await dumpSchemaColumns(adapter);

    expect(Object.keys(dump)).toContain("users");
    expect(Object.keys(dump)).not.toContain("schema_migrations");
  });

  it("honors the ignoreTables option", async () => {
    const { adapter, ctx } = fresh();
    await ctx.createTable("users", {}, () => {});
    await ctx.createTable("sessions", {}, () => {});

    const dump = await dumpSchemaColumns(adapter, { ignoreTables: ["sessions"] });

    expect(Object.keys(dump).sort()).toEqual(["users"]);
  });

  it("emits columns in stable (sorted) order within each table", async () => {
    const { adapter, ctx } = fresh();
    await ctx.createTable("widgets", {}, (t) => {
      t.string("zulu");
      t.string("alpha");
      t.string("mike");
    });

    const dump = await dumpSchemaColumns(adapter);

    expect(Object.keys(dump.widgets)).toEqual(["alpha", "id", "mike", "zulu"]);
  });

  it("emits tables in stable (sorted) order", async () => {
    const { adapter, ctx } = fresh();
    await ctx.createTable("zebras", {}, () => {});
    await ctx.createTable("apples", {}, () => {});
    await ctx.createTable("mangoes", {}, () => {});

    const dump = await dumpSchemaColumns(adapter);

    expect(Object.keys(dump)).toEqual(["apples", "mangoes", "zebras"]);
  });

  it("normalizes raw SQL types to the Rails alphabet", async () => {
    // Synthesize a minimal adapter whose `columns()` returns RAW SQL
    // types with no SqlTypeMetadata.type populated. Verifies the
    // normalization layer maps them to Rails type names.
    const fakeAdapter = {
      async tables() {
        return ["widgets"];
      },
      async columns() {
        return [
          { name: "name", sqlType: "varchar(255)" },
          { name: "bio", sqlType: "TEXT" },
          { name: "count", sqlType: "int4" },
          { name: "big", sqlType: "int8" },
          { name: "price", sqlType: "numeric(10,2)" },
          { name: "active", sqlType: "bool" },
          { name: "at", sqlType: "timestamp without time zone" },
          { name: "data", sqlType: "jsonb" },
          { name: "guid", sqlType: "uuid" },
          // PG-style inline precision + suffix text
          { name: "at_tz", sqlType: "timestamp(3) without time zone" },
          { name: "at_tz2", sqlType: "time(6) with time zone" },
          // PG array types
          { name: "tags", sqlType: "integer[]" },
          { name: "names", sqlType: "character varying[]" },
          // PG multi-word type with inline precision (pg_catalog.format_type
          // output for varchar).
          { name: "email", sqlType: "character varying(255)" },
          // MySQL boolean convention (tinyint(1)). sqlTypeMetadata.type
          // is "tinyint" (→ integer) but sqlType is "tinyint(1)" (→ boolean).
          {
            name: "active_mysql",
            sqlType: "tinyint(1)",
            sqlTypeMetadata: { type: "tinyint" },
          },
          // PG SchemaStatements fallback: sqlTypeMetadata.type is the UDT
          // (e.g. `timestamptz`), sqlTypeMetadata.sqlType is the human
          // SQL (e.g. `timestamp with time zone`). The latter should win.
          {
            name: "at_udt",
            sqlTypeMetadata: {
              type: "timestamptz",
              sqlType: "timestamp with time zone",
            },
          },
          // PG fallback array via UDT name (`_int4`): should still be
          // detected as an array via the sqlType string (`int4[]`).
          {
            name: "tags_udt",
            sqlTypeMetadata: { type: "_int4", sqlType: "int4[]" },
          },
        ];
      },
    } as unknown as Parameters<typeof dumpSchemaColumns>[0];

    const dump = await dumpSchemaColumns(fakeAdapter);
    // Each entry is the rich { type, null } shape; these fake columns
    // don't set `null`, so the conservative default (true) applies.
    expect(dump.widgets.name.type).toBe("string");
    expect(dump.widgets.bio.type).toBe("text");
    expect(dump.widgets.count.type).toBe("integer");
    expect(dump.widgets.big.type).toBe("big_integer");
    expect(dump.widgets.price.type).toBe("decimal");
    expect(dump.widgets.active.type).toBe("boolean");
    expect(dump.widgets.at.type).toBe("datetime");
    expect(dump.widgets.data.type).toBe("jsonb");
    expect(dump.widgets.guid.type).toBe("uuid");
    expect(dump.widgets.at_tz.type).toBe("datetime");
    expect(dump.widgets.at_tz2.type).toBe("time");
    expect(dump.widgets.email.type).toBe("string");
    expect(dump.widgets.active_mysql.type).toBe("boolean");
    expect(dump.widgets.at_udt.type).toBe("datetime");
    // Array columns should surface arrayElementType.
    expect(dump.widgets.tags.type).toBe("array");
    expect(dump.widgets.tags.arrayElementType).toBe("integer");
    expect(dump.widgets.names.type).toBe("array");
    expect(dump.widgets.names.arrayElementType).toBe("string");
    expect(dump.widgets.tags_udt.type).toBe("array");
    expect(dump.widgets.tags_udt.arrayElementType).toBe("integer");
  });

  it("preserves column nullability from the adapter", async () => {
    const fakeAdapter = {
      async tables() {
        return ["widgets"];
      },
      async columns() {
        return [
          { name: "not_nullable", sqlType: "varchar(255)", null: false },
          { name: "nullable", sqlType: "varchar(255)", null: true },
          { name: "missing", sqlType: "varchar(255)" }, // defaults to true
        ];
      },
    } as unknown as Parameters<typeof dumpSchemaColumns>[0];

    const dump = await dumpSchemaColumns(fakeAdapter);
    expect(dump.widgets.not_nullable.null).toBe(false);
    expect(dump.widgets.nullable.null).toBe(true);
    expect(dump.widgets.missing.null).toBe(true);
  });

  it("output feeds directly into trails-tsc's virtualizer (end-to-end)", async () => {
    const { virtualize } = await import("./type-virtualization/virtualize.js");

    const { adapter, ctx } = fresh();
    await ctx.createTable("users", {}, (t) => {
      t.string("name");
      t.integer("age");
    });

    // Dump → use as virtualizer input, no hand-editing.
    const dump = await dumpSchemaColumns(adapter);
    const src =
      "export class User extends Base {\n" + '  static override tableName = "users";\n' + "}\n";
    const { text } = virtualize(src, "user.ts", { schemaColumnsByTable: dump });

    // Columns declared via t.string() / t.integer() are nullable by
    // default (no `null: false` passed), so the rich shape renders
    // `T | null`.
    expect(text).toMatch(/declare name: string \| null;/);
    expect(text).toMatch(/declare age: number \| null;/);
    // `id` is skipped by the virtualizer (Base accessor handles it).
    expect(text).not.toMatch(/declare id:/);
  });

  it("end-to-end: NOT NULL → bare; nullable → `| null`; array element types carry through", async () => {
    const { virtualize } = await import("./type-virtualization/virtualize.js");

    // Fake adapter with mixed nullability and arrays — exercises the
    // full chain without needing portable DDL (NOT NULL / array
    // syntax varies across SQLite/PG/MySQL).
    const fakeAdapter = {
      async tables() {
        return ["posts"];
      },
      async columns() {
        return [
          { name: "title", sqlType: "varchar(255)", null: false },
          { name: "body", sqlType: "text", null: true },
          { name: "tags", sqlType: "integer[]", null: false },
          { name: "optional_tags", sqlType: "integer[]", null: true },
        ];
      },
    } as unknown as Parameters<typeof dumpSchemaColumns>[0];

    const dump = await dumpSchemaColumns(fakeAdapter);
    const src =
      "export class Post extends Base {\n" + '  static override tableName = "posts";\n' + "}\n";
    const { text } = virtualize(src, "post.ts", { schemaColumnsByTable: dump });

    expect(text).toMatch(/declare title: string;/);
    expect(text).toMatch(/declare body: string \| null;/);
    expect(text).toMatch(/declare tags: number\[\];/);
    expect(text).toMatch(/declare optional_tags: number\[\] \| null;/);
  });
});
