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
    // Concrete Rails type assertions — trails-tsc keys on these exact
    // strings, so raw SQL types (TEXT, VARCHAR, int4) would silently
    // make the virtualizer emit `unknown`. Tests lock the mapping.
    // `id` is integer on SQLite/PG but big_integer on MariaDB — both
    // map to TS `number` in the virtualizer, so accept either.
    expect(["integer", "big_integer"]).toContain(dump.users.id);
    expect(dump.users.name).toBe("string");
    expect(dump.users.age).toBe("integer");
    expect(dump.users.created_at).toBe("datetime");
    expect(dump.posts.title).toBe("string");
    expect(dump.posts.body).toBe("text");
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
    expect(dump.widgets).toEqual({
      name: "string",
      bio: "text",
      count: "integer",
      big: "big_integer",
      price: "decimal",
      active: "boolean",
      at: "datetime",
      data: "jsonb",
      guid: "uuid",
      at_tz: "datetime",
      at_tz2: "time",
      tags: "array",
      names: "array",
      email: "string",
      active_mysql: "boolean",
      at_udt: "datetime",
      tags_udt: "array",
    });
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

    expect(text).toMatch(/declare name:/);
    expect(text).toMatch(/declare age:/);
    // `id` is skipped by the virtualizer (Base accessor handles it).
    expect(text).not.toMatch(/declare id:/);
  });
});
