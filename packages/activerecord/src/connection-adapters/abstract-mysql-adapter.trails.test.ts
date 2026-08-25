import { describe, it, expect } from "vitest";
import { Base } from "../base.js";
import { describeIfMysqlAdapter } from "../support/describe-if-mysql-adapter.js";
import { Column } from "./mysql/column.js";
import {
  ChangeColumnDefinition,
  ChangeColumnDefaultDefinition,
} from "./abstract/schema-definitions.js";
import { parseTableOptions } from "./abstract-mysql-adapter.js";
import { SchemaCreation as MysqlSchemaCreation } from "./mysql/schema-creation.js";
import { NullPool } from "./abstract/connection-pool.js";
import { Result } from "../result.js";

function makeColumn(opts: { autoIncrement?: boolean; defaultFunction?: string | null } = {}) {
  return new Column(
    "id",
    null,
    { sqlType: "bigint", extra: opts.autoIncrement ? "auto_increment" : "" },
    false,
    { defaultFunction: opts.defaultFunction ?? null },
  );
}

describe("AbstractMysqlAdapter#returnValueAfterInsert", () => {
  it("returns true for auto-increment column when INSERT RETURNING not supported", async () => {
    const { AbstractMysqlAdapter } = await import("./abstract-mysql-adapter.js");
    const adapter = Object.create(AbstractMysqlAdapter.prototype);
    adapter.supportsInsertReturning = () => false;
    expect(await adapter.returnValueAfterInsert(makeColumn({ autoIncrement: true }))).toBe(true);
  });

  it("returns false for non-auto-increment column when INSERT RETURNING not supported", async () => {
    const { AbstractMysqlAdapter } = await import("./abstract-mysql-adapter.js");
    const adapter = Object.create(AbstractMysqlAdapter.prototype);
    adapter.supportsInsertReturning = () => false;
    expect(await adapter.returnValueAfterInsert(makeColumn({ autoIncrement: false }))).toBe(false);
  });

  it("returns true for auto-populated column (default function) when INSERT RETURNING supported", async () => {
    const { AbstractMysqlAdapter } = await import("./abstract-mysql-adapter.js");
    const adapter = Object.create(AbstractMysqlAdapter.prototype);
    adapter.supportsInsertReturning = () => true;
    expect(await adapter.returnValueAfterInsert(makeColumn({ defaultFunction: "uuid()" }))).toBe(
      true,
    );
  });

  it("returns false for plain column when INSERT RETURNING supported", async () => {
    const { AbstractMysqlAdapter } = await import("./abstract-mysql-adapter.js");
    const adapter = Object.create(AbstractMysqlAdapter.prototype);
    adapter.supportsInsertReturning = () => true;
    expect(await adapter.returnValueAfterInsert(makeColumn())).toBe(false);
  });
});

describe("AbstractMysqlAdapter#_columnMethodNames", () => {
  it("appends MySQL ColumnMethods shorthands to the abstract list", async () => {
    const { AbstractMysqlAdapter } = await import("./abstract-mysql-adapter.js");
    const adapter = Object.create(AbstractMysqlAdapter.prototype);
    const names = adapter._columnMethodNames();
    for (const name of [
      "tinyblob",
      "mediumblob",
      "longblob",
      "tinytext",
      "mediumtext",
      "longtext",
      "unsignedInteger",
      "unsignedBigint",
      "unsignedFloat",
      "unsignedDecimal",
    ]) {
      expect(names).toContain(name);
    }
    // Abstract names still present; native-types `primary_key` is not surfaced.
    expect(names).toContain("virtual");
    expect(names).toContain("bigint");
    expect(names).not.toContain("primary_key");
  });
});

describe("AbstractMysqlAdapter#renameColumnForAlter fallback", () => {
  // Mirrors abstract_mysql_adapter.rb:863-878: when supports_rename_column? is false the
  // arm rebuilds a CHANGE clause from column_for plus the live `SHOW COLUMNS ... LIKE` Type.
  async function makeAdapter(field: Record<string, unknown>) {
    const { AbstractMysqlAdapter } = await import("./abstract-mysql-adapter.js");
    const adapter = Object.create(AbstractMysqlAdapter.prototype);
    const queries: [string, string | null | undefined][] = [];
    adapter.supportsRenameColumn = () => false;
    adapter.pool = new NullPool();
    adapter.getDatabaseVersion = async () => {};
    adapter.quoteColumnName = (s: string) => `\`${s}\``;
    adapter.quoteTableName = (s: string) => `\`${s}\``;
    adapter.columnDefinitions = async () => [
      {
        Field: "col",
        Type: "int(11)",
        Null: "YES",
        Default: null,
        Extra: "",
        Comment: "",
        ...field,
      },
    ];
    adapter.internalExecQuery = async (sql: string, name?: string | null) => {
      queries.push([sql, name]);
      return new Result(["Type"], [[(field.Type as string) ?? "int(11)"]]);
    };
    return { adapter, queries };
  }

  it("reads the current type from SHOW COLUMNS ... LIKE under the SCHEMA name", async () => {
    const { adapter, queries } = await makeAdapter({ Type: "varchar(36)" });
    const sql: string = await adapter.renameColumnForAlter("users", "col", "col2");
    expect(queries).toEqual([["SHOW COLUMNS FROM `users` LIKE 'col'", "SCHEMA"]]);
    expect(sql).toBe("CHANGE `col` `col2` varchar(36) DEFAULT NULL");
  });

  it("carries default, null, auto_increment and comment into the CHANGE clause", async () => {
    const { adapter } = await makeAdapter({
      Type: "bigint(20)",
      Null: "NO",
      Default: "7",
      Extra: "auto_increment",
      Comment: "the id",
    });
    const sql: string = await adapter.renameColumnForAlter("users", "col", "col2");
    expect(sql).toContain("CHANGE `col` `col2` bigint(20)");
    expect(sql).toContain("DEFAULT 7");
    expect(sql).toContain("NOT NULL");
    expect(sql).toContain("AUTO_INCREMENT");
    expect(sql).toContain("COMMENT 'the id'");
  });

  it("returns rename_column_sql when the server supports RENAME COLUMN", async () => {
    const { adapter, queries } = await makeAdapter({});
    adapter.supportsRenameColumn = () => true;
    const sql: string = await adapter.renameColumnForAlter("users", "col", "col2");
    expect(sql).toBe("RENAME COLUMN `col` TO `col2`");
    expect(queries).toEqual([]);
  });
});

describe("AbstractMysqlAdapter#renameColumn wiring", () => {
  // Drives the public renameColumn surface: it must wrap renameColumnForAlter's
  // fragment in ALTER TABLE, then fix up index names via renameColumnIndexes —
  // the whole of `abstract_mysql_adapter.rb:440-443`, which does not touch the
  // schema cache.
  async function makeAdapter() {
    const { AbstractMysqlAdapter } = await import("./abstract-mysql-adapter.js");
    const adapter = Object.create(AbstractMysqlAdapter.prototype);
    const events: string[] = [];
    adapter.pool = new NullPool();
    adapter.supportsRenameColumn = () => true;
    adapter.getDatabaseVersion = async () => {};
    adapter.quoteColumnName = (s: string) => `\`${s}\``;
    adapter.quoteTableName = (s: string) => `\`${s}\``;
    Object.defineProperty(adapter, "schemaCache", {
      value: {
        clearDataSourceCacheBang: async (tableName: string) => {
          events.push(`clear:${tableName}`);
        },
      },
    });
    adapter.execute = async (sql: string) => {
      events.push(`exec:${sql}`);
    };
    adapter.renameColumnIndexes = async (
      tableName: string,
      columnName: string,
      newColumnName: string,
    ) => {
      events.push(`indexes:${tableName}:${columnName}:${newColumnName}`);
    };
    return { adapter, events };
  }

  // The cache clear this name refers to is gone: it was a trails-only addition
  // to a Rails body (abstract_mysql_adapter.rb:440-443) that has no such call.
  // The name is kept verbatim per CLAUDE.md's never-rename-a-test rule.
  it("clears the cache before issuing the ALTER TABLE RENAME COLUMN then fixes indexes", async () => {
    const { adapter, events } = await makeAdapter();
    await adapter.renameColumn("users", "old_name", "new_name");
    expect(events).toEqual([
      "exec:ALTER TABLE `users` RENAME COLUMN `old_name` TO `new_name`",
      "indexes:users:old_name:new_name",
    ]);
  });
});

describeIfMysqlAdapter("AbstractMysqlAdapter#buildChangeColumnDefinition", () => {
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
    const adapter = Object.create(AbstractMysqlAdapter.prototype);
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
    const cd = await adapter.buildChangeColumnDefinition("users", "body", null);
    expect(cd.column.type).toBe("varchar(255)");
  });

  it("function default renders as unquoted SQL expression in the CHANGE clause", async () => {
    const { SchemaCreation } = await import("./mysql/schema-creation.js");
    const col = makeTextColumn({ defaultFunction: "uuid()" });
    const adapter = await makeAdapter(col);
    const cd = await adapter.buildChangeColumnDefinition("users", "uid", "string");
    const sql = await new SchemaCreation((await Base.leaseConnection()) as never).accept(cd);
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
    // Single quote must be backslash-escaped (no unescaped bare single quote)
    expect(inner).not.toMatch(/(?<!\\)'/);
    // Backslash must be doubled
    expect(inner).toContain("\\\\");
    // Control chars must be escaped — no raw bytes
    expect(inner).not.toContain("\0");
    expect(inner).not.toContain("\n");
    expect(inner).not.toContain("\r");
    expect(inner).not.toContain("\x1a");
  });

  it("adapter.quote is consistent with standalone quote for strings containing single quotes and backslashes", async () => {
    const adapter = await makeAdapter();
    // Rails' MySQL adapter has no `quote` override (mysql/quoting.rb); the
    // inherited `quote` wraps the self-dispatched `quote_string`
    // (abstract/quoting.rb:76), which lands on MySQL's backslash escaping.
    for (const s of ["it's", "back\\slash", "\0null\nbyte\rreturn\x1aeof", "'; DROP TABLE t; --"]) {
      expect(adapter.quote(s)).toBe(`'${adapter.quoteString(s)}'`);
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
  const adapter = Object.create(AbstractMysqlAdapter.prototype);
  // Object.create skips the constructor, which is what plants Rails' NullPool
  // (abstract_adapter.rb:153); every adapter carries one.
  adapter.pool = new NullPool();
  adapter.quoteColumnName = (s: string) => `\`${s}\``;
  adapter.quoteTableName = (s: string) => `\`${s}\``;
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
    expect(cd.column.null).toBe(false);
  });
});

describeIfMysqlAdapter("AbstractMysqlAdapter — DROP vs SET DEFAULT fragment (#1568)", () => {
  async function visit(cd: ChangeColumnDefaultDefinition): Promise<string> {
    return new MysqlSchemaCreation((await Base.leaseConnection()) as never).accept(cd);
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
    expect(await visit(cd)).toBe("ALTER COLUMN `body` DROP DEFAULT");
  });

  it("emits SET DEFAULT NULL for null default on a nullable column", async () => {
    const cd = await buildFor(makeChangeColumnTextColumn({ null_: true }), null);
    expect(await visit(cd)).toBe("ALTER COLUMN `body` SET DEFAULT NULL");
  });

  it("emits SET DEFAULT <literal> for a non-null default", async () => {
    const cd = await buildFor(makeChangeColumnTextColumn({ null_: true }), "world");
    expect(await visit(cd)).toBe("ALTER COLUMN `body` SET DEFAULT 'world'");
  });

  it("undefined → null normalization yields SET DEFAULT NULL, not a bare SET", async () => {
    // Without the undefined→null normalization, quoteDefaultExpression(undefined)
    // returns "" and the fragment would be the malformed `ALTER COLUMN ... SET`.
    const cd = await buildFor(makeChangeColumnTextColumn({ null_: true }), {
      from: "a",
      to: undefined,
    });
    const sql = await visit(cd);
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
      execute: async (sql: string) => {
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
  // Record both `execute` (UPDATE backfill) and `changeColumn` (ALTER
  // dispatch) into a single sequence so tests can assert relative ordering
  // — Rails requires the UPDATE to run BEFORE the ALTER, otherwise existing
  // NULL rows would fail the new NOT NULL constraint.
  async function makeSequencingAdapter() {
    const events: Array<["exec", string] | ["changeColumn", unknown[]]> = [];
    const adapter = await makeMinimalMysqlAdapter({
      validateChangeColumnNullArgumentBang: (_: boolean) => {},
      execute: async (sql: string) => {
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
      ["changeColumn", ["users", "name", null, { null: false }]],
    ]);
  });

  it("dispatches changeColumn with null:false but skips UPDATE when default_ is omitted", async () => {
    const { adapter, events } = await makeSequencingAdapter();
    await adapter.changeColumnNull("users", "name", false);
    expect(events).toEqual([["changeColumn", ["users", "name", null, { null: false }]]]);
  });

  it("dispatches changeColumn with null:true and skips UPDATE when null_ is true", async () => {
    const { adapter, events } = await makeSequencingAdapter();
    await adapter.changeColumnNull("users", "name", true, "anon");
    expect(events).toEqual([["changeColumn", ["users", "name", null, { null: true }]]]);
  });

  it("propagates validateChangeColumnNullArgumentBang errors before any SQL or changeColumn dispatch", async () => {
    const executed: string[] = [];
    const changeColumnCalls: unknown[] = [];
    const adapter = await makeMinimalMysqlAdapter({
      validateChangeColumnNullArgumentBang: () => {
        throw new Error("bad null arg");
      },
      execute: async (sql: string) => {
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
    // Use the real, inherited extractNewCommentValue so these tests exercise
    // the production path and catch regressions in it.
    const calls: Array<[string, string, string | null, Record<string, unknown>]> = [];
    const adapter = await makeMinimalMysqlAdapter({
      changeColumn: async (
        t: string,
        c: string,
        type: string | null,
        opts: Record<string, unknown>,
      ) => {
        calls.push([t, c, type, opts]);
      },
    });
    return { adapter, calls };
  }

  it("passes a plain string comment through to changeColumn", async () => {
    const { adapter, calls } = await makeAdapterCapturingChangeColumn();
    await adapter.changeColumnComment("users", "name", "the user's name");
    expect(calls).toEqual([["users", "name", null, { comment: "the user's name" }]]);
  });

  it("clears the comment when passed null", async () => {
    const { adapter, calls } = await makeAdapterCapturingChangeColumn();
    await adapter.changeColumnComment("users", "name", null);
    expect(calls).toEqual([["users", "name", null, { comment: null }]]);
  });

  it("unwraps {from, to} change-descriptor to the new comment", async () => {
    const { adapter, calls } = await makeAdapterCapturingChangeColumn();
    await adapter.changeColumnComment("users", "name", { from: "old", to: "new" });
    expect(calls).toEqual([["users", "name", null, { comment: "new" }]]);
  });
});

describe("AbstractMysqlAdapter#tableAliasLength", () => {
  it("table alias length", async () => {
    // Rails' MySQL SchemaStatements#table_alias_length returns 256
    // (mysql/schema_statements.rb:135), not max_identifier_length (64).
    const { AbstractMysqlAdapter } = await import("./abstract-mysql-adapter.js");
    const adapter = Object.create(AbstractMysqlAdapter.prototype) as InstanceType<
      typeof AbstractMysqlAdapter
    >;
    expect(adapter.tableAliasLength()).toBe(256);
    const long = "a".repeat(300);
    expect(adapter.tableAliasFor(long)).toBe("a".repeat(256));
  });
});

describe("AbstractMysqlAdapter#checkVersion", () => {
  it("raises DatabaseVersionError when the warmed version is too old", async () => {
    const { AbstractMysqlAdapter } = await import("./abstract-mysql-adapter.js");
    const { Version } = await import("./abstract-adapter.js");
    const { DatabaseVersionError } = await import("../errors.js");
    const adapter = Object.create(AbstractMysqlAdapter.prototype) as InstanceType<
      typeof AbstractMysqlAdapter
    >;
    const { NullPool } = await import("./abstract/connection-pool.js");
    adapter.pool = new NullPool();
    (
      adapter as unknown as { getDatabaseVersion: () => InstanceType<typeof Version> }
    ).getDatabaseVersion = () => new Version("5.6.3");
    await expect(adapter.checkVersion()).rejects.toThrow(DatabaseVersionError);
    await expect(adapter.checkVersion()).rejects.toThrow(
      "Your version of MySQL (5.6.3) is too old. Active Record supports MySQL >= 5.6.4.",
    );
  });

  it("does not raise when the warmed version is supported", async () => {
    const { AbstractMysqlAdapter } = await import("./abstract-mysql-adapter.js");
    const { Version } = await import("./abstract-adapter.js");
    const adapter = Object.create(AbstractMysqlAdapter.prototype) as InstanceType<
      typeof AbstractMysqlAdapter
    >;
    const { NullPool } = await import("./abstract/connection-pool.js");
    adapter.pool = new NullPool();
    (
      adapter as unknown as { getDatabaseVersion: () => InstanceType<typeof Version> }
    ).getDatabaseVersion = () => new Version("5.6.4");
    await expect(adapter.checkVersion()).resolves.toBeUndefined();
  });
});

describe("AbstractMysqlAdapter#foreignKeys", () => {
  async function makeAdapter(rows: Record<string, unknown>[]) {
    const { AbstractMysqlAdapter } = await import("./abstract-mysql-adapter.js");
    const adapter = Object.create(AbstractMysqlAdapter.prototype) as InstanceType<
      typeof AbstractMysqlAdapter
    >;
    Object.assign(adapter, {
      internalExecQuery: async () => Result.fromRowHashes(rows),
    });
    return adapter;
  }

  it("reads foreign keys through the mixed-in MySQL::SchemaStatements method", async () => {
    const adapter = await makeAdapter([
      {
        to_table: "rockets",
        primary_key: "id",
        column: "rocket_id",
        name: "fk_rails_78e6cee8fd",
        position: 1,
        on_update: "CASCADE",
        on_delete: "SET NULL",
      },
    ]);
    const [fk] = await adapter.foreignKeys("astronauts");
    expect(fk.fromTable).toBe("astronauts");
    expect(fk.toTable).toBe("rockets");
    expect(fk.column).toBe("rocket_id");
    expect(fk.onUpdate).toBe("cascade");
    expect(fk.onDelete).toBe("nullify");
  });

  it("reflects RESTRICT as nil", async () => {
    const adapter = await makeAdapter([
      {
        to_table: "rockets",
        primary_key: "id",
        column: "rocket_id",
        name: "fk_rails_78e6cee8fd",
        position: 1,
        on_update: "RESTRICT",
        on_delete: "RESTRICT",
      },
    ]);
    const [fk] = await adapter.foreignKeys("astronauts");
    expect(fk.onUpdate).toBeUndefined();
    expect(fk.onDelete).toBeUndefined();
  });
});
