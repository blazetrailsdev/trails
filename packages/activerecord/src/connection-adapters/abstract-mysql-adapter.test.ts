import { describe, it, expect } from "vitest";
import { Column } from "./mysql/column.js";
import {
  ChangeColumnDefinition,
  ChangeColumnDefaultDefinition,
} from "./abstract/schema-definitions.js";
import { parseTableOptions } from "./abstract-mysql-adapter.js";
import { SchemaCreation as MysqlSchemaCreation } from "./mysql/schema-creation.js";
import { quote as mysqlQuote } from "./mysql/quoting.js";

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

// Unit coverage for the four charset-collation slot helpers added in #1568,
// complementing the existing fragment-shape coverage above.

function makeChangeColumnTextColumn(opts: { null_?: boolean; default_?: unknown } = {}) {
  return new Column(
    "body",
    opts.default_ === undefined ? "hello" : opts.default_,
    { sqlType: "varchar(255)", type: "string" },
    opts.null_ ?? true,
  );
}

async function makeMinimalMysqlAdapter(overrides: Record<string, unknown> = {}) {
  const { AbstractMysqlAdapter } = await import("./abstract-mysql-adapter.js");
  const adapter = Object.create(AbstractMysqlAdapter.prototype) as any;
  adapter.quoteIdentifier = (s: string) => `\`${s}\``;
  adapter.quoteTableName = (s: string) => `\`${s}\``;
  adapter.quote = mysqlQuote;
  Object.assign(adapter, overrides);
  return adapter;
}

describe("AbstractMysqlAdapter#buildChangeColumnDefaultDefinition (#1568)", () => {
  async function build(column: Column, defaultOrChanges: unknown) {
    const adapter = await makeMinimalMysqlAdapter({
      columnFor: async () => column,
    });
    return adapter.buildChangeColumnDefaultDefinition(
      "users",
      "body",
      defaultOrChanges,
    ) as Promise<ChangeColumnDefaultDefinition>;
  }

  it("returns a ChangeColumnDefaultDefinition with the extracted default", async () => {
    const cd = await build(makeChangeColumnTextColumn(), "new");
    expect(cd).toBeInstanceOf(ChangeColumnDefaultDefinition);
    expect(cd.default).toBe("new");
    expect(cd.column.name).toBe("body");
  });

  it("unwraps {from, to} change-descriptor to the new value", async () => {
    const cd = await build(makeChangeColumnTextColumn(), { from: "old", to: "new" });
    expect(cd.default).toBe("new");
  });

  it("normalizes undefined → null when {from, to: undefined} (JS-only defense)", async () => {
    const cd = await build(makeChangeColumnTextColumn(), { from: "x", to: undefined });
    expect(cd.default).toBeNull();
  });

  it("preserves explicit null default", async () => {
    const cd = await build(makeChangeColumnTextColumn(), null);
    expect(cd.default).toBeNull();
  });

  it("preserves the column's null option on the built ColumnDefinition", async () => {
    const cd = await build(makeChangeColumnTextColumn({ null_: false }), "x");
    expect(cd.column.options.null).toBe(false);
  });
});

describe("AbstractMysqlAdapter — DROP vs SET DEFAULT fragment (#1568)", () => {
  function visit(cd: ChangeColumnDefaultDefinition): string {
    return new MysqlSchemaCreation().accept(cd);
  }

  async function buildFor(column: Column, defaultOrChanges: unknown) {
    const adapter = await makeMinimalMysqlAdapter({ columnFor: async () => column });
    return adapter.buildChangeColumnDefaultDefinition(
      "users",
      "body",
      defaultOrChanges,
    ) as Promise<ChangeColumnDefaultDefinition>;
  }

  it("emits DROP DEFAULT for null default on a NOT NULL column", async () => {
    const cd = await buildFor(makeChangeColumnTextColumn({ null_: false }), null);
    expect(visit(cd)).toBe("ALTER COLUMN `body` DROP DEFAULT");
  });

  it("emits SET DEFAULT NULL for null default on a nullable column", async () => {
    const cd = await buildFor(makeChangeColumnTextColumn({ null_: true }), null);
    expect(visit(cd)).toBe("ALTER COLUMN `body` SET DEFAULT NULL");
  });

  it("emits SET DEFAULT <literal> for a non-null default", async () => {
    const cd = await buildFor(makeChangeColumnTextColumn({ null_: true }), "world");
    expect(visit(cd)).toBe("ALTER COLUMN `body` SET DEFAULT 'world'");
  });

  it("undefined → null normalization yields SET DEFAULT NULL, not a bare SET", async () => {
    // Without the undefined→null normalization, quoteDefaultExpression(undefined)
    // returns "" and the fragment would be the malformed `ALTER COLUMN ... SET`.
    const cd = await buildFor(makeChangeColumnTextColumn({ null_: true }), {
      from: "a",
      to: undefined,
    });
    const sql = visit(cd);
    expect(sql).toBe("ALTER COLUMN `body` SET DEFAULT NULL");
    expect(sql.endsWith(" SET")).toBe(false);
  });
});

describe("AbstractMysqlAdapter#changeColumnDefault wiring (#1568)", () => {
  // Drives the public surface end-to-end through changeColumnDefaultForAlter
  // → buildChangeColumnDefaultDefinition → MysqlSchemaCreation.accept so a
  // regression in the wiring (or in the ALTER TABLE wrap) is caught.
  async function build(column: Column) {
    const executed: string[] = [];
    const adapter = await makeMinimalMysqlAdapter({
      columnFor: async () => column,
      _execMutation: async (sql: string) => {
        executed.push(sql);
      },
    });
    return { adapter, executed };
  }

  it("changeColumnDefault wraps the SET DEFAULT fragment in ALTER TABLE", async () => {
    const { adapter, executed } = await build(makeChangeColumnTextColumn({ null_: true }));
    await adapter.changeColumnDefault("users", "body", "world");
    expect(executed).toEqual(["ALTER TABLE `users` ALTER COLUMN `body` SET DEFAULT 'world'"]);
  });

  it("changeColumnDefault wraps DROP DEFAULT for null on a NOT NULL column", async () => {
    const { adapter, executed } = await build(makeChangeColumnTextColumn({ null_: false }));
    await adapter.changeColumnDefault("users", "body", null);
    expect(executed).toEqual(["ALTER TABLE `users` ALTER COLUMN `body` DROP DEFAULT"]);
  });

  it("changeColumnDefault unwraps {from, to} via the full pipeline", async () => {
    const { adapter, executed } = await build(makeChangeColumnTextColumn({ null_: true }));
    await adapter.changeColumnDefault("users", "body", { from: "old", to: "new" });
    expect(executed).toEqual(["ALTER TABLE `users` ALTER COLUMN `body` SET DEFAULT 'new'"]);
  });

  it("changeColumnDefaultForAlter returns the bare fragment (no ALTER TABLE wrap)", async () => {
    const { adapter } = await build(makeChangeColumnTextColumn({ null_: true }));
    const fragment = await adapter.changeColumnDefaultForAlter("users", "body", "world");
    expect(fragment).toBe("ALTER COLUMN `body` SET DEFAULT 'world'");
  });
});

describe("AbstractMysqlAdapter#changeColumnNull (#1568)", () => {
  // Record both `_execMutation` (UPDATE backfill) and `changeColumn` (ALTER
  // dispatch) into a single sequence so tests can assert relative ordering
  // — Rails requires the UPDATE to run BEFORE the ALTER, otherwise existing
  // NULL rows would fail the new NOT NULL constraint.
  async function makeSequencingAdapter() {
    const events: Array<["exec", string] | ["changeColumn", unknown[]]> = [];
    const adapter = await makeMinimalMysqlAdapter({
      schemaStatements: () => ({ validateChangeColumnNullArgumentBang: (_: boolean) => {} }),
      _execMutation: async (sql: string) => {
        events.push(["exec", sql]);
      },
      changeColumn: async (...args: unknown[]) => {
        events.push(["changeColumn", args]);
      },
    });
    return { adapter, events };
  }

  it("emits UPDATE backfill BEFORE the changeColumn ALTER dispatch", async () => {
    const { adapter, events } = await makeSequencingAdapter();
    await adapter.changeColumnNull("users", "name", false, "anon");
    expect(events).toEqual([
      ["exec", "UPDATE `users` SET `name`='anon' WHERE `name` IS NULL"],
      ["changeColumn", ["users", "name", "", { null: false }]],
    ]);
  });

  it("dispatches changeColumn with null:false but skips UPDATE when default_ is omitted", async () => {
    const { adapter, events } = await makeSequencingAdapter();
    await adapter.changeColumnNull("users", "name", false);
    expect(events).toEqual([["changeColumn", ["users", "name", "", { null: false }]]]);
  });

  it("dispatches changeColumn with null:true and skips UPDATE when null_ is true", async () => {
    const { adapter, events } = await makeSequencingAdapter();
    await adapter.changeColumnNull("users", "name", true, "anon");
    expect(events).toEqual([["changeColumn", ["users", "name", "", { null: true }]]]);
  });

  it("propagates validateChangeColumnNullArgumentBang errors before any SQL or changeColumn dispatch", async () => {
    const executed: string[] = [];
    const changeColumnCalls: unknown[] = [];
    const adapter = await makeMinimalMysqlAdapter({
      schemaStatements: () => ({
        validateChangeColumnNullArgumentBang: () => {
          throw new Error("bad null arg");
        },
      }),
      _execMutation: async (sql: string) => {
        executed.push(sql);
      },
      changeColumn: async (...args: unknown[]) => {
        changeColumnCalls.push(args);
      },
    });
    await expect(
      adapter.changeColumnNull("users", "name", false as unknown as boolean, "x"),
    ).rejects.toThrow("bad null arg");
    expect(executed).toEqual([]);
    expect(changeColumnCalls).toEqual([]);
  });
});

describe("AbstractMysqlAdapter#changeColumnComment (#1568)", () => {
  async function makeAdapterCapturingChangeColumn() {
    // Use the real, inherited schemaStatements() so these tests exercise the
    // production extractNewCommentValue path and catch regressions in it.
    const calls: Array<[string, string, string, Record<string, unknown>]> = [];
    const adapter = await makeMinimalMysqlAdapter({
      changeColumn: async (t: string, c: string, type: string, opts: Record<string, unknown>) => {
        calls.push([t, c, type, opts]);
      },
    });
    return { adapter, calls };
  }

  it("passes a plain string comment through to changeColumn", async () => {
    const { adapter, calls } = await makeAdapterCapturingChangeColumn();
    await adapter.changeColumnComment("users", "name", "the user's name");
    expect(calls).toEqual([["users", "name", "", { comment: "the user's name" }]]);
  });

  it("clears the comment when passed null", async () => {
    const { adapter, calls } = await makeAdapterCapturingChangeColumn();
    await adapter.changeColumnComment("users", "name", null);
    expect(calls).toEqual([["users", "name", "", { comment: null }]]);
  });

  it("unwraps {from, to} change-descriptor to the new comment", async () => {
    const { adapter, calls } = await makeAdapterCapturingChangeColumn();
    await adapter.changeColumnComment("users", "name", { from: "old", to: "new" });
    expect(calls).toEqual([["users", "name", "", { comment: "new" }]]);
  });

  it("normalizes undefined → null when {from, to: undefined} (explicit clear)", async () => {
    const { adapter, calls } = await makeAdapterCapturingChangeColumn();
    await adapter.changeColumnComment("users", "name", { from: "old", to: undefined });
    // Without the normalization, comment would be undefined and changeColumn
    // would treat the key as absent, silently keeping the old comment.
    expect(calls).toEqual([["users", "name", "", { comment: null }]]);
  });
});
