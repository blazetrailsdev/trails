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

  it.each([
    ["NOW()", "(NOW())"],
    ["CURRENT_DATE", "(CURRENT_DATE)"],
    ["CURRENT_TIME", "(CURRENT_TIME)"],
    ["uuid()", "(uuid())"],
  ])(
    "wraps DEFAULT_GENERATED default %s in parens (mirrors newColumnFromField)",
    async (defaultVal, expectedFragment) => {
      const adapter = await makeAdapter("col", "DEFAULT_GENERATED");
      adapter.columnDefinitions = async () => [
        {
          Field: "col",
          Type: "varchar(36)",
          Null: "YES",
          Default: defaultVal,
          Extra: "DEFAULT_GENERATED",
          Collation: null,
          Comment: "",
        },
      ];
      const sql: string = await adapter.renameColumnForAlter("users", "col", "col2");
      expect(sql).toContain(`DEFAULT ${expectedFragment}`);
      expect(sql).not.toContain(`DEFAULT '`);
    },
  );

  it("wraps arbitrary DEFAULT_GENERATED expression in parens, not as a quoted string", async () => {
    // e.g. MySQL 8 expression defaults like `json_array()` that aren't in RENAME_FUNC_DEFAULT_RE.
    // newColumnFromField wraps these in () and sets defaultFunction — we must match.
    const adapter = await makeAdapter("col", "DEFAULT_GENERATED");
    adapter.columnDefinitions = async () => [
      {
        Field: "col",
        Type: "json",
        Null: "YES",
        Default: "json_array()",
        Extra: "DEFAULT_GENERATED",
        Collation: null,
        Comment: "",
      },
    ];
    const sql: string = await adapter.renameColumnForAlter("users", "col", "col2");
    expect(sql).toContain("DEFAULT (json_array())");
    expect(sql).not.toContain("DEFAULT 'json_array()'");
  });
});

describe("AbstractMysqlAdapter quoting consistency — quote vs quoteString", () => {
  async function makeAdapter() {
    const { AbstractMysqlAdapter } = await import("./abstract-mysql-adapter.js");
    return Object.create(AbstractMysqlAdapter.prototype) as InstanceType<
      typeof AbstractMysqlAdapter
    >;
  }

  it("adapter.quote(s) wraps result in single quotes", async () => {
    const adapter = await makeAdapter();
    const result = adapter.quote("hello");
    expect(result).toBe("'hello'");
  });

  it("adapter.quoteString(s) is escape-only — no surrounding quotes", async () => {
    const adapter = await makeAdapter();
    const result = adapter.quoteString("hello");
    expect(result).toBe("hello");
  });

  it("adapter.quote strips injection attempt — single quote, backslash, control chars", async () => {
    const adapter = await makeAdapter();
    const injection = "'; DROP TABLE users; --";
    const quoted = adapter.quote(injection);
    // Must start and end with surrounding single quotes
    expect(quoted.startsWith("'")).toBe(true);
    expect(quoted.endsWith("'")).toBe(true);
    // Must not contain an unescaped bare single quote inside (other than surrounding)
    const inner = quoted.slice(1, -1);
    expect(inner).not.toMatch(/(?<!')'(?!')/);
  });

  it("adapter.quote is consistent with standalone quote for strings containing single quotes and backslashes", async () => {
    const { quote: standaloneQuote } = await import("./mysql/quoting.js");
    const adapter = await makeAdapter();
    for (const s of ["it's", "back\\slash", "\0null\nbyte\rreturn\x1aeof", "'; DROP TABLE t; --"]) {
      expect(adapter.quote(s)).toBe(standaloneQuote(s));
    }
  });
});
