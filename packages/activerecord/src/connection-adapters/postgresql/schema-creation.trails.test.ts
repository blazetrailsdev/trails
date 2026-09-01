import { describe, it, expect } from "vitest";
import { SchemaCreation } from "./schema-creation.js";
import { quoteDefaultExpression } from "./quoting.js";
import { ExclusionConstraintDefinition, UniqueConstraintDefinition } from "./schema-definitions.js";
import { Column } from "./column.js";
import { TypeMetadata } from "./type-metadata.js";
import {
  ForeignKeyDefinition,
  ChangeColumnDefinition,
  ChangeColumnDefaultDefinition,
  ColumnDefinition,
  AlterTable,
  TableDefinition,
} from "../abstract/schema-definitions.js";

const s = () =>
  new SchemaCreation({
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
      await s().visitAddExclusionConstraint(
        new ExclusionConstraintDefinition("t", "e WITH &&", { name: "c" }),
      ),
    ).toMatch(/^ADD CONSTRAINT/);
    expect(
      await s().visitAddUniqueConstraint(new UniqueConstraintDefinition("t", "col", { name: "c" })),
    ).toMatch(/^ADD CONSTRAINT/);
  });

  it("visitChangeColumnDefaultDefinition", async () => {
    const col = new Column(
      "x",
      null,
      new TypeMetadata({ sqlType: "character varying", type: "string" }),
    );
    expect(
      await s().visitChangeColumnDefaultDefinition(new ChangeColumnDefaultDefinition(col, null)),
    ).toContain("DROP DEFAULT");
    expect(
      await s().visitChangeColumnDefaultDefinition(new ChangeColumnDefaultDefinition(col, "v")),
    ).toContain("SET DEFAULT");
  });

  it("visitChangeColumnDefaultDefinition: uuid function default stays bare", async () => {
    const col = new Column("id", null, new TypeMetadata({ sqlType: "uuid", type: "uuid" }));
    const host = s();
    host.conn.quoteDefaultExpression = (v: unknown, c: unknown) =>
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
    await expect(async () =>
      s().addColumnOptionsBang("n", { as: "a||b", stored: false, column: col }),
    ).rejects.toThrow("VIRTUAL");
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
    const at = new AlterTable({ name: "users" } as unknown as TableDefinition) as any;
    at.foreignKeyAdds.push(fk);
    at.constraintValidations = ["some_constraint"];
    const sql = await s().visitAlterTable(at);
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
});
