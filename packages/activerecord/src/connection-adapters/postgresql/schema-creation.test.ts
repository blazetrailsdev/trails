import { describe, it, expect } from "vitest";
import { SchemaCreation } from "./schema-creation.js";
import { pgDatetimeConfig } from "./pg-datetime-config.js";
import { quoteDefaultExpression } from "./quoting.js";
import { ExclusionConstraintDefinition, UniqueConstraintDefinition } from "./schema-definitions.js";
import { Column } from "./column.js";
import {
  ForeignKeyDefinition,
  ChangeColumnDefinition,
  ChangeColumnDefaultDefinition,
  ColumnDefinition,
  AlterTable,
} from "../abstract/schema-definitions.js";

// Stub host satisfies `PgSchemaCreationHost`: the inherited Quoting
// fallback covers quote*, plus a minimal `typeToSql` since PG's override
// delegates to the adapter (Rails parity: SchemaCreation delegates
// type_to_sql to @conn), plus the capability probes `SchemaCreation`
// delegates to `@conn` (abstract/schema_creation.rb:16-21), answered as
// `PostgreSQLAdapter` answers them.
const s = () =>
  new SchemaCreation({
    nativeDatabaseTypes: () => ({}),
    supportsCheckConstraints: async () => true,
    supportsExclusionConstraints: () => true,
    supportsIndexInclude: async () => true,
    supportsIndexesInCreate: () => false,
    supportsNullsNotDistinct: async () => true,
    supportsPartialIndex: () => true,
    supportsUniqueConstraints: () => true,
    useForeignKeys: () => true,
    quoteColumnName: (n: string) => `"${n}"`,
    quoteTableName: (n: string) => `"${n}"`,
    quoteDefaultExpression: (v: unknown) => ` DEFAULT ${typeof v === "string" ? `'${v}'` : v}`,
    typeToSql: (type: string, options: Record<string, unknown> = {}) => {
      if (type === "decimal") {
        const p = options.precision;
        const sc = options.scale;
        return p != null && sc != null ? `decimal(${p},${sc})` : "decimal";
      }
      return type;
    },
  }) as any;

describe("PostgreSQL SchemaCreation", () => {
  it("visitForeignKeyDefinition: NOT VALID + DEFERRABLE", () => {
    const fk1 = new ForeignKeyDefinition(
      "a",
      "b",
      "b_id",
      "id",
      "fk",
      undefined,
      undefined,
      undefined,
      false,
    );
    expect(s().visitForeignKeyDefinition(fk1)).not.toContain("NOT VALID");
    const fk2 = new ForeignKeyDefinition(
      "a",
      "b",
      "b_id",
      "id",
      "fk",
      undefined,
      undefined,
      "deferred",
      true,
    );
    expect(s().visitForeignKeyDefinition(fk2)).toContain("DEFERRABLE INITIALLY DEFERRED");
  });

  it("visitValidateConstraint", () => {
    expect(s().visitValidateConstraint("c")).toBe('VALIDATE CONSTRAINT "c"');
  });

  it("visitExclusionConstraintDefinition: EXCLUDE USING + WHERE + DEFERRABLE", () => {
    const ec = new ExclusionConstraintDefinition("t", "e WITH &&", {
      name: "c",
      using: "gist",
      where: "x=1",
      deferrable: "deferred",
    });
    const sql = s().visitExclusionConstraintDefinition(ec);
    expect(sql).toContain("EXCLUDE");
    expect(sql).toContain("USING gist");
    expect(sql).toContain("WHERE (x=1)");
    expect(sql).toContain("DEFERRABLE INITIALLY DEFERRED");
  });

  it("visitUniqueConstraintDefinition: basic + NULLS NOT DISTINCT + USING INDEX", async () => {
    expect(
      await s().visitUniqueConstraintDefinition(
        new UniqueConstraintDefinition("t", "e", { name: "u" }),
      ),
    ).toContain('CONSTRAINT "u" UNIQUE');
    expect(
      await s().visitUniqueConstraintDefinition(
        new UniqueConstraintDefinition("t", "e", { name: "u", nullsNotDistinct: true }),
      ),
    ).toContain("NULLS NOT DISTINCT");
    expect(
      await s().visitUniqueConstraintDefinition(
        new UniqueConstraintDefinition("t", "e", { name: "u", usingIndex: "idx" }),
      ),
    ).toContain('USING INDEX "idx"');
  });

  it("visitAddExclusionConstraint / visitAddUniqueConstraint", async () => {
    expect(
      s().visitAddExclusionConstraint(
        new ExclusionConstraintDefinition("t", "e WITH &&", { name: "c" }),
      ),
    ).toMatch(/^ADD CONSTRAINT/);
    expect(
      await s().visitAddUniqueConstraint(new UniqueConstraintDefinition("t", "col", { name: "c" })),
    ).toMatch(/^ADD CONSTRAINT/);
  });

  it("visitChangeColumnDefaultDefinition", async () => {
    const col = new Column("x", null, { sqlType: "character varying", type: "string" });
    expect(
      await s().visitChangeColumnDefaultDefinition(new ChangeColumnDefaultDefinition(col, null)),
    ).toContain("DROP DEFAULT");
    expect(
      await s().visitChangeColumnDefaultDefinition(new ChangeColumnDefaultDefinition(col, "v")),
    ).toContain("SET DEFAULT");
  });

  it("visitChangeColumnDefaultDefinition: uuid function default stays bare", async () => {
    // postgresql/quoting.rb:159-160 — a `()`-bearing string default on a
    // uuid column must reach the DDL as a call, not as `'uuid_generate_v4()'`.
    const col = new Column("id", null, { sqlType: "uuid", type: "uuid" });
    // The shared stub fakes quoteDefaultExpression; this branch lives in
    // the real one, so wire that in.
    const host = s();
    host.adapter.quoteDefaultExpression = (v: unknown, c: unknown) =>
      quoteDefaultExpression.call(null as never, v, c as never);
    expect(
      await host.visitChangeColumnDefaultDefinition(
        new ChangeColumnDefaultDefinition(col, "uuid_generate_v4()"),
      ),
    ).toBe('ALTER COLUMN "id" SET DEFAULT uuid_generate_v4()');
  });

  it("visitChangeColumnDefinition: ALTER COLUMN TYPE", async () => {
    const col = new ColumnDefinition("price", "decimal", { precision: 10, scale: 2 });
    expect(await s().visitChangeColumnDefinition(new ChangeColumnDefinition(col, "price"))).toMatch(
      /ALTER COLUMN "price" TYPE/,
    );
  });

  it("addColumnOptionsBang: COLLATE + STORED + throws for virtual", async () => {
    const col = new ColumnDefinition("n", "string");
    expect(await s().addColumnOptionsBang("n", { collation: "en_US" })).toContain(
      'COLLATE "en_US"',
    );
    expect(
      await s().addColumnOptionsBang("n", { as: "a||b", stored: true, column: col }),
    ).toContain("STORED");
    // async wrapper: the visitor surface is Promise-returning, but the
    // VIRTUAL guard (_pgGeneratedClause) currently throws synchronously —
    // rejects.toThrow covers both shapes.
    await expect(async () =>
      s().addColumnOptionsBang("n", { as: "a||b", stored: false, column: col }),
    ).rejects.toThrow("VIRTUAL");
  });

  it("visitExclusionConstraintDefinition: deferrable true → DEFERRABLE without INITIALLY", () => {
    const ec = new ExclusionConstraintDefinition("t", "e WITH &&", {
      name: "c",
      deferrable: true,
    });
    const sql = s().visitExclusionConstraintDefinition(ec);
    expect(sql).toMatch(/DEFERRABLE$/);
    expect(sql).not.toContain("INITIALLY");
  });

  it("visitExclusionConstraintDefinition: unnamed constraint omits CONSTRAINT prefix", () => {
    const ec = new ExclusionConstraintDefinition("t", "e WITH &&", {});
    const sql = s().visitExclusionConstraintDefinition(ec);
    expect(sql).toMatch(/^EXCLUDE/);
    expect(sql).not.toContain("CONSTRAINT");
  });

  it("visitUniqueConstraintDefinition: unnamed constraint omits CONSTRAINT prefix", async () => {
    const uc = new UniqueConstraintDefinition("t", "col", {});
    const sql = await s().visitUniqueConstraintDefinition(uc);
    expect(sql).toMatch(/^UNIQUE/);
    expect(sql).not.toContain("CONSTRAINT");
  });

  it("visitAlterTable: appends constraint validations after the FK adds (Rails parity)", async () => {
    const fk = new ForeignKeyDefinition(
      "users",
      "posts",
      "post_id",
      "id",
      "fk_users_post_id",
      undefined,
      undefined,
      undefined,
      true,
    );
    const at = new AlterTable("users") as any;
    at.foreignKeyAdds.push(fk);
    at.constraintValidations = ["some_constraint"];
    const sql = await s().visitAlterTable(at);
    // Rails' `visit_AlterTable` (postgresql/schema_creation.rb:10-15) appends
    // each group's `join(" ")` straight onto the string with no separator
    // between groups — only ever one group is populated per alter_table call.
    expect(sql).toContain("ADD CONSTRAINT");
    expect(sql).toContain('VALIDATE CONSTRAINT "some_constraint"');
  });

  it("quotedIncludeColumns + tableModifierInCreate", async () => {
    expect(await s().quotedIncludeColumnsForIndex("a, b")).toBe("a, b");
    expect(await s().quotedIncludeColumnsForIndex(["a", "b"])).toBe('"a", "b"');
    expect(await s().quotedIncludeColumns("raw, expr")).toBe("raw, expr");
    expect(await s().quotedIncludeColumns(["a", "b"])).toBe('"a", "b"');
    expect(s().tableModifierInCreate({ temporary: true })).toBe(" TEMPORARY");
    expect(s().tableModifierInCreate({ unlogged: true })).toBe(" UNLOGGED");
    expect(s().tableModifierInCreate({})).toBe("");
  });

  it("quotedIncludeColumnsForIndex delegates to the adapter when threaded", async () => {
    const sc = new SchemaCreation({
      quoteColumnName: (n: string) => `"${n}"`,
      quoteTableName: (n: string) => `"${n}"`,
      quoteDefaultExpression: (v: unknown) => ` DEFAULT ${v}`,
      typeToSql: (type: string) => type,
      quotedIncludeColumnsForIndex: () => "<<delegated>>",
    } as any) as any;
    expect(await sc.quotedIncludeColumnsForIndex(["a", "b"])).toBe("<<delegated>>");
  });

  // Rails' PostgreSQLAdapter#native_database_types replaces the constant's raw
  // `datetime: {}` placeholder with `types[datetime_type]` before type_to_sql
  // reads it (postgresql_adapter.rb:404-408), so `datetime` is never resolved
  // against the empty placeholder — not even without an adapter threaded.
  it("resolves datetime through datetimeType with no adapter threaded", () => {
    const hostless = new SchemaCreation({
      quoteColumnName: (n: string) => `"${n}"`,
      quoteTableName: (n: string) => `"${n}"`,
      quoteDefaultExpression: (v: unknown) => ` DEFAULT ${v}`,
    } as any);
    expect(hostless.typeToSql("datetime", { precision: 6 })).toBe("timestamp(6)");
    // `primary_key` is a bare String in Rails' hash, not a `{ name: }` entry.
    expect(hostless.typeToSql("primary_key")).toBe("bigserial primary key");

    // Rails assigns `types[:datetime] = types[datetime_type]` with no default,
    // so a datetime_type naming no entry leaves it nil and type_to_sql falls
    // through to "datetime" rather than silently meaning timestamp.
    const original = pgDatetimeConfig.datetimeType;
    try {
      pgDatetimeConfig.datetimeType = "nonesuch";
      expect(hostless.typeToSql("datetime", { precision: 6 })).toBe("datetime");
    } finally {
      pgDatetimeConfig.datetimeType = original;
    }
  });
});
