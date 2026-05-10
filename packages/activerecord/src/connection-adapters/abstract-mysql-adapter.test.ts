import { describe, it, expect } from "vitest";
import { Column } from "./mysql/column.js";

function makeColumn(opts: { autoIncrement?: boolean; defaultFunction?: string | null } = {}) {
  return new Column("id", null, { sqlType: "bigint" }, false, {
    autoIncrement: opts.autoIncrement ?? false,
    defaultFunction: opts.defaultFunction ?? null,
  });
}

describe("AbstractMysqlAdapter#returnValueAfterInsert", () => {
  it("returns true for auto-increment column when INSERT RETURNING not supported", async () => {
    const { AbstractMysqlAdapter } = await import("./abstract-mysql-adapter.js");
    const adapter = Object.create(AbstractMysqlAdapter.prototype) as any;
    adapter.supportsInsertReturning = () => false;
    expect(adapter.returnValueAfterInsert(makeColumn({ autoIncrement: true }))).toBe(true);
  });

  it("returns false for non-auto-increment column when INSERT RETURNING not supported", async () => {
    const { AbstractMysqlAdapter } = await import("./abstract-mysql-adapter.js");
    const adapter = Object.create(AbstractMysqlAdapter.prototype) as any;
    adapter.supportsInsertReturning = () => false;
    expect(adapter.returnValueAfterInsert(makeColumn({ autoIncrement: false }))).toBe(false);
  });

  it("returns true for auto-populated column (default function) when INSERT RETURNING supported", async () => {
    const { AbstractMysqlAdapter } = await import("./abstract-mysql-adapter.js");
    const adapter = Object.create(AbstractMysqlAdapter.prototype) as any;
    adapter.supportsInsertReturning = () => true;
    expect(adapter.returnValueAfterInsert(makeColumn({ defaultFunction: "uuid()" }))).toBe(true);
  });

  it("returns false for plain column when INSERT RETURNING supported", async () => {
    const { AbstractMysqlAdapter } = await import("./abstract-mysql-adapter.js");
    const adapter = Object.create(AbstractMysqlAdapter.prototype) as any;
    adapter.supportsInsertReturning = () => true;
    expect(adapter.returnValueAfterInsert(makeColumn())).toBe(false);
  });
});

describe("AbstractMysqlAdapter#renameColumnForAlter fallback", () => {
  async function makeAdapter(columnName: string, extra: string, supportsRename = false) {
    const { AbstractMysqlAdapter } = await import("./abstract-mysql-adapter.js");
    const adapter = Object.create(AbstractMysqlAdapter.prototype) as any;
    adapter.supportsRenameColumn = () => supportsRename;
    adapter.getDatabaseVersion = async () => {};
    adapter.quoteIdentifier = (s: string) => `\`${s}\``;
    adapter.columnDefinitions = async (_: string) => [
      {
        Field: columnName,
        Type: "int(11)",
        Null: "NO",
        Default: null,
        Extra: extra,
        Collation: null,
        Comment: "",
      },
    ];
    return adapter;
  }

  it("allows auto_increment Extra without throwing", async () => {
    const adapter = await makeAdapter("id", "auto_increment");
    const sql: string = await adapter.renameColumnForAlter("users", "id", "user_id");
    expect(sql).toContain("AUTO_INCREMENT");
  });

  it("preserves on update CURRENT_TIMESTAMP Extra without throwing", async () => {
    const adapter = await makeAdapter("updated_at", "on update CURRENT_TIMESTAMP");
    const sql: string = await adapter.renameColumnForAlter("users", "updated_at", "ts");
    expect(sql).toContain("ON UPDATE");
    expect(sql).toContain("CURRENT_TIMESTAMP");
  });

  it("preserves MySQL 8 compound DEFAULT_GENERATED on update Extra", async () => {
    const adapter = await makeAdapter(
      "updated_at",
      "DEFAULT_GENERATED on update CURRENT_TIMESTAMP(6)",
    );
    const sql: string = await adapter.renameColumnForAlter("users", "updated_at", "ts");
    expect(sql).toContain("ON UPDATE");
    expect(sql).toContain("CURRENT_TIMESTAMP(6)");
  });

  it("throws for unrecognised Extra values", async () => {
    const adapter = await makeAdapter("gen_col", "VIRTUAL GENERATED");
    await expect(adapter.renameColumnForAlter("users", "gen_col", "gen_col2")).rejects.toThrow(
      "renameColumnForAlter fallback",
    );
  });

  it("emits DEFAULT CURRENT_TIMESTAMP unquoted when default is a timestamp function", async () => {
    const adapter = await makeAdapter("updated_at", "on update CURRENT_TIMESTAMP");
    adapter.columnDefinitions = async () => [
      {
        Field: "updated_at",
        Type: "datetime",
        Null: "YES",
        Default: "CURRENT_TIMESTAMP",
        Extra: "on update CURRENT_TIMESTAMP",
        Collation: null,
        Comment: "",
      },
    ];
    const sql: string = await adapter.renameColumnForAlter("users", "updated_at", "ts");
    expect(sql).toContain("DEFAULT CURRENT_TIMESTAMP");
    expect(sql).not.toContain("DEFAULT 'CURRENT_TIMESTAMP'");
  });
});
