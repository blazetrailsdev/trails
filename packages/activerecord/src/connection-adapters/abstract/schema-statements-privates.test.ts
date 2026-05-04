import { describe, it, expect, vi } from "vitest";
import { SchemaStatements } from "./schema-statements.js";

function makeStatements(adapterOverrides: Record<string, unknown> = {}) {
  return new SchemaStatements({
    adapterName: "sqlite" as const,
    quoteIdentifier: (n: string) => `"${n}"`,
    quoteTableName: (n: string) => `"${n}"`,
    quoteDefaultExpression: (v: unknown) => ` DEFAULT ${v}`,
    execute: vi.fn().mockResolvedValue([]),
    executeMutation: vi.fn().mockResolvedValue(undefined),
    config: {},
    ...adapterOverrides,
  } as any);
}

describe("SchemaStatements privates (PR 8)", () => {
  it("generateIndexName short", () => {
    const ss = makeStatements();
    expect(ss.generateIndexName("users", "email")).toBe("index_users_on_email");
  });

  it("generateIndexName long falls back to hash", () => {
    const ss = makeStatements();
    const name = ss.generateIndexName("users", "a".repeat(60));
    expect(name.length).toBeLessThanOrEqual(62);
    expect(name).toMatch(/_[0-9a-f]{10}$/);
  });

  it("validateChangeColumnNullArgumentBang accepts booleans", () => {
    const ss = makeStatements();
    expect(() => ss.validateChangeColumnNullArgumentBang(true)).not.toThrow();
    expect(() => ss.validateChangeColumnNullArgumentBang("yes")).toThrow(/boolean/);
  });

  it("columnOptionsKeys includes limit, null, default", () => {
    const ss = makeStatements();
    expect(ss.columnOptionsKeys()).toEqual(expect.arrayContaining(["limit", "null", "default"]));
  });

  it("optionsForIndexColumns with hash", () => {
    const ss = makeStatements();
    expect(ss.optionsForIndexColumns({ email: "asc" })("email")).toBe("asc");
    expect(ss.optionsForIndexColumns("desc")("anything")).toBe("desc");
  });

  it("isExpressionColumnName", () => {
    const ss = makeStatements();
    expect(ss.isExpressionColumnName("lower(email)")).toBe(true);
    expect(ss.isExpressionColumnName("email")).toBe(false);
  });

  it("indexColumnNames wraps string in array", () => {
    const ss = makeStatements();
    expect(ss.indexColumnNames("email")).toEqual(["email"]);
    expect(ss.indexColumnNames(["a", "b"])).toEqual(["a", "b"]);
  });

  it("indexNameOptions for expression joins words", () => {
    const ss = makeStatements();
    expect(ss.indexNameOptions("lower(email)")).toEqual({ column: "lower_email" });
    expect(ss.indexNameOptions("email")).toEqual({ column: "email" });
  });

  it("stripTableNamePrefixAndSuffix strips prefix/suffix", () => {
    const ss = makeStatements({ tableNamePrefix: "app_", tableNameSuffix: "_v2" });
    expect(ss.stripTableNamePrefixAndSuffix("app_users_v2")).toBe("users");
    expect(makeStatements().stripTableNamePrefixAndSuffix("users")).toBe("users");
  });

  it("foreignKeyName generates hash name", () => {
    const ss = makeStatements();
    expect(ss.foreignKeyName("users", { name: "my_fk", column: "org_id" })).toBe("my_fk");
    expect(ss.foreignKeyName("users", { column: "org_id" })).toMatch(/^fk_rails_[0-9a-f]{10}$/);
  });

  it("extractForeignKeyAction maps all specifiers", () => {
    const ss = makeStatements();
    expect(ss.extractForeignKeyAction("CASCADE")).toBe("cascade");
    expect(ss.extractForeignKeyAction("SET NULL")).toBe("nullify");
    expect(ss.extractForeignKeyAction("RESTRICT")).toBe("restrict");
    expect(ss.extractForeignKeyAction("NO ACTION")).toBeUndefined();
  });

  it("isForeignKeysEnabled reads config.foreignKeys", () => {
    expect(makeStatements().isForeignKeysEnabled()).toBe(true);
    expect(makeStatements({ config: { foreignKeys: false } }).isForeignKeysEnabled()).toBe(false);
  });

  it("checkConstraintName", () => {
    const ss = makeStatements();
    expect(ss.checkConstraintName("users", { name: "my_chk" })).toBe("my_chk");
    expect(ss.checkConstraintName("users", { expression: "age > 0" })).toMatch(
      /^chk_rails_[0-9a-f]{10}$/,
    );
    expect(() => ss.checkConstraintName("users", {})).toThrow(/expression/);
  });

  it("createTableDefinition returns TableDefinition", () => {
    expect(makeStatements().createTableDefinition("orders").tableName).toBe("orders");
  });

  it("createAlterTable returns AlterTable", () => {
    expect(makeStatements().createAlterTable("orders").name).toBe("orders");
  });

  it("fetchTypeMetadata returns SqlTypeMetadata with sqlType", () => {
    expect(makeStatements().fetchTypeMetadata("varchar(255)").sqlType).toBe("varchar(255)");
  });

  it("foreignKeyFor returns undefined when not found", async () => {
    const ss = makeStatements();
    vi.spyOn(ss, "foreignKeys").mockResolvedValue([]);
    expect(await ss.foreignKeyFor("users", { toTable: "orgs" })).toBeUndefined();
  });

  it("foreignKeyForBang throws when not found", async () => {
    const ss = makeStatements();
    vi.spyOn(ss, "foreignKeys").mockResolvedValue([]);
    await expect(ss.foreignKeyForBang("users", { toTable: "orgs" })).rejects.toThrow(
      /foreign key/i,
    );
  });

  it("checkConstraintForBang throws when not found", async () => {
    const ss = makeStatements();
    vi.spyOn(ss, "checkConstraints").mockResolvedValue([]);
    await expect(ss.checkConstraintForBang("users", { expression: "age > 0" })).rejects.toThrow(
      /check constraint/i,
    );
  });
});
