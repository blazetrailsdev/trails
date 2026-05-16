import { describe, it, expect } from "vitest";
import { Column } from "./mysql/column.js";
import { ChangeColumnDefinition } from "./abstract/schema-definitions.js";
import { parseTableOptions } from "./abstract-mysql-adapter.js";

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

  it("detects non-DEFAULT_GENERATED keyword defaults via SHOW CREATE TABLE and emits unquoted", async () => {
    // e.g. older MySQL function defaults outside RENAME_FUNC_DEFAULT_RE: defaultType()
    // parses SHOW CREATE TABLE and returns "function" for any bare keyword default.
    const adapter = await makeAdapter("col", "");
    adapter.columnDefinitions = async () => [
      {
        Field: "col",
        Type: "varchar(36)",
        Null: "YES",
        Default: "MY_CUSTOM_FUNC",
        Extra: "",
        Collation: null,
        Comment: "",
      },
    ];
    adapter.createTableInfo = async () =>
      "CREATE TABLE `users` (\n  `col` varchar(36) DEFAULT MY_CUSTOM_FUNC\n)";
    adapter.quoteTableName = (s: string) => `\`${s}\``;
    const sql: string = await adapter.renameColumnForAlter("users", "col", "col2");
    expect(sql).toContain("DEFAULT MY_CUSTOM_FUNC");
    expect(sql).not.toContain("DEFAULT 'MY_CUSTOM_FUNC'");
  });

  it("treats non-function keyword default as quoted string when SHOW CREATE TABLE shows quoted literal", async () => {
    const adapter = await makeAdapter("col", "");
    adapter.columnDefinitions = async () => [
      {
        Field: "col",
        Type: "varchar(36)",
        Null: "YES",
        Default: "hello",
        Extra: "",
        Collation: null,
        Comment: "",
      },
    ];
    adapter.createTableInfo = async () =>
      "CREATE TABLE `users` (\n  `col` varchar(36) DEFAULT 'hello'\n)";
    adapter.quoteTableName = (s: string) => `\`${s}\``;
    const sql: string = await adapter.renameColumnForAlter("users", "col", "col2");
    expect(sql).toContain("DEFAULT 'hello'");
  });

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

describe("AbstractMysqlAdapter#buildChangeColumnDefinition", () => {
  function makeTextColumn(
    opts: { collation?: string | null; defaultFunction?: string | null } = {},
  ) {
    return new Column("body", "hello", { sqlType: "varchar(255)", type: "string" }, true, {
      collation: opts.collation ?? "utf8mb4_unicode_ci",
      defaultFunction: opts.defaultFunction ?? null,
    });
  }

  async function makeAdapter(column: Column) {
    const { AbstractMysqlAdapter } = await import("./abstract-mysql-adapter.js");
    const adapter = Object.create(AbstractMysqlAdapter.prototype) as any;
    adapter.columnFor = async (_t: string, _c: string) => column;
    return adapter;
  }

  it("returns a ChangeColumnDefinition with the column name", async () => {
    const col = makeTextColumn();
    const adapter = await makeAdapter(col);
    const cd = await adapter.buildChangeColumnDefinition("users", "body", "text");
    expect(cd).toBeInstanceOf(ChangeColumnDefinition);
    expect(cd.name).toBe("body");
  });

  it("inherits collation from existing column when changing to a text type", async () => {
    const col = makeTextColumn({ collation: "utf8mb4_unicode_ci" });
    const adapter = await makeAdapter(col);
    const cd = await adapter.buildChangeColumnDefinition("users", "body", "text");
    expect(cd.column.options.collation).toBe("utf8mb4_unicode_ci");
  });

  it("does not inherit collation when changing to a non-text type", async () => {
    const col = makeTextColumn({ collation: "utf8mb4_unicode_ci" });
    const adapter = await makeAdapter(col);
    const cd = await adapter.buildChangeColumnDefinition("users", "body", "integer");
    expect(cd.column.options.collation).toBeUndefined();
  });

  it("collation: null sentinel drops collation (no_collation)", async () => {
    const col = makeTextColumn({ collation: "utf8mb4_unicode_ci" });
    const adapter = await makeAdapter(col);
    const cd = await adapter.buildChangeColumnDefinition("users", "body", "text", {
      collation: null,
    });
    expect(cd.column.options.collation).toBeUndefined();
  });

  it("explicit collation option overrides column collation", async () => {
    const col = makeTextColumn({ collation: "utf8mb4_unicode_ci" });
    const adapter = await makeAdapter(col);
    const cd = await adapter.buildChangeColumnDefinition("users", "body", "text", {
      collation: "ascii_bin",
    });
    expect(cd.column.options.collation).toBe("ascii_bin");
  });

  it("inherits null from existing column when not specified", async () => {
    const col = makeTextColumn();
    const adapter = await makeAdapter(col);
    const cd = await adapter.buildChangeColumnDefinition("users", "body", "text");
    expect(cd.column.options.null).toBe(true);
  });

  it("inherits default from existing column when not specified", async () => {
    const col = makeTextColumn();
    const adapter = await makeAdapter(col);
    const cd = await adapter.buildChangeColumnDefinition("users", "body", "text");
    expect(cd.column.options.default).toBe("hello");
  });

  it("uses defaultFunction as lambda when column has a function default", async () => {
    const col = makeTextColumn({ defaultFunction: "uuid()" });
    const adapter = await makeAdapter(col);
    const cd = await adapter.buildChangeColumnDefinition("users", "body", "text");
    expect(typeof cd.column.options.default).toBe("function");
    expect((cd.column.options.default as () => string)()).toBe("uuid()");
  });

  it("falls back to column.sqlType when type argument is empty", async () => {
    const col = makeTextColumn();
    const adapter = await makeAdapter(col);
    const cd = await adapter.buildChangeColumnDefinition("users", "body", "");
    expect(cd.column.type).toBe("varchar(255)");
  });

  it("function default renders as unquoted SQL expression in the CHANGE clause", async () => {
    const { SchemaCreation } = await import("./mysql/schema-creation.js");
    const col = makeTextColumn({ defaultFunction: "uuid()" });
    const adapter = await makeAdapter(col);
    const cd = await adapter.buildChangeColumnDefinition("users", "uid", "string");
    const sql = new SchemaCreation().accept(cd);
    expect(sql).toContain("DEFAULT uuid()");
    expect(sql).not.toContain("DEFAULT 'uuid()'");
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

  it("adapter.quote escapes injection attempt — single quote, backslash, control chars", async () => {
    const adapter = await makeAdapter();
    const injection = "'; DROP TABLE users; --\\\0\n\r\x1a";
    const quoted = adapter.quote(injection);
    // Must start and end with surrounding single quotes
    expect(quoted.startsWith("'")).toBe(true);
    expect(quoted.endsWith("'")).toBe(true);
    const inner = quoted.slice(1, -1);
    // Single quote must be escaped (no unescaped bare single quote)
    expect(inner).not.toMatch(/(?<!')'(?!')/);
    // Backslash must be doubled
    expect(inner).toContain("\\\\");
    // Control chars must be escaped — no raw bytes
    expect(inner).not.toContain("\0");
    expect(inner).not.toContain("\n");
    expect(inner).not.toContain("\r");
    expect(inner).not.toContain("\x1a");
  });

  it("adapter.quote is consistent with standalone quote for strings containing single quotes and backslashes", async () => {
    const { quote: standaloneQuote } = await import("./mysql/quoting.js");
    const adapter = await makeAdapter();
    for (const s of ["it's", "back\\slash", "\0null\nbyte\rreturn\x1aeof", "'; DROP TABLE t; --"]) {
      expect(adapter.quote(s)).toBe(standaloneQuote(s));
    }
  });
});

// Minimal SHOW CREATE TABLE wrapper for parseTableOptions tests.
function showCreate(tableName: string, options: string): string {
  return `CREATE TABLE \`${tableName}\` (\n  \`id\` bigint NOT NULL AUTO_INCREMENT,\n  PRIMARY KEY (\`id\`)\n) ${options}`;
}

describe("parseTableOptions", () => {
  it("returns empty object for ENGINE=InnoDB only (default — not emitted)", () => {
    expect(parseTableOptions(showCreate("t", "ENGINE=InnoDB"), null)).toEqual({});
  });

  it("extracts charset without collation", () => {
    const opts = parseTableOptions(showCreate("t", "ENGINE=InnoDB DEFAULT CHARSET=latin1"), null);
    expect(opts).toEqual({ charset: "latin1" });
  });

  it("extracts charset and collation together", () => {
    const opts = parseTableOptions(
      showCreate("t", "ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin"),
      null,
    );
    expect(opts).toEqual({ charset: "utf8mb4", collation: "utf8mb4_bin" });
  });

  it("strips AUTO_INCREMENT from ENGINE clause", () => {
    const opts = parseTableOptions(
      showCreate("t", "ENGINE=MyISAM AUTO_INCREMENT=42 DEFAULT CHARSET=utf8mb4"),
      null,
    );
    expect(opts).toEqual({ charset: "utf8mb4", options: "ENGINE=MyISAM" });
  });

  it("includes non-InnoDB engine in options", () => {
    const opts = parseTableOptions(showCreate("t", "ENGINE=MyISAM DEFAULT CHARSET=utf8mb4"), null);
    expect(opts).toEqual({ charset: "utf8mb4", options: "ENGINE=MyISAM" });
  });

  it("includes row format in options", () => {
    const opts = parseTableOptions(
      showCreate("t", "ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 ROW_FORMAT=REDUNDANT"),
      null,
    );
    expect(opts).toEqual({ charset: "utf8mb4", options: "ENGINE=InnoDB ROW_FORMAT=REDUNDANT" });
  });

  it("extracts comment via pre-fetched value", () => {
    const opts = parseTableOptions(
      showCreate("t", "ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='hello world'"),
      "hello world",
    );
    expect(opts).toEqual({ charset: "utf8mb4", comment: "hello world" });
  });

  it("returns empty object when createInfo has no options (NO_TABLE_OPTIONS mode)", () => {
    expect(parseTableOptions(showCreate("t", ""), null)).toEqual({});
  });

  it("strips partition hint from options", () => {
    const createInfo =
      "CREATE TABLE `t` (\n  `id` bigint NOT NULL\n) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4\n/*!50100 PARTITION BY HASH (`id`)\nPARTITIONS 4 */\n";
    const opts = parseTableOptions(createInfo, null);
    expect(opts).toEqual({ charset: "utf8mb4" });
  });
});
