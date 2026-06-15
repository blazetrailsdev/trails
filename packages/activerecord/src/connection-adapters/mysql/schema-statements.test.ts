import { describe, it, expect } from "vitest";
import {
  isRowFormatDynamicByDefault,
  defaultRowFormat,
  validPrimaryKeyOptions,
  createTableDefinition,
  defaultType,
  newColumnFromField,
  fetchTypeMetadata,
  extractForeignKeyAction,
  addIndexLength,
  addOptionsForIndexColumns,
  dataSourceSql,
  quotedScope,
  extractSchemaQualifiedName,
  typeWithSizeToSql,
  limitToSize,
  integerToSql,
  foreignKeys,
} from "./schema-statements.js";
import { quote } from "./quoting.js";

// Minimal ForeignKeysHost: foreignKeys() reads via schemaQuery, quotes the
// table name, and maps referential actions. We stub schemaQuery to return the
// information_schema rows MySQL would yield (1 row per FK column).
function fkHost(rows: Record<string, unknown>[]) {
  return {
    schemaQuery: async () => rows,
    quote,
    _mysqlFkAction: (action: string) =>
      action === "CASCADE"
        ? "cascade"
        : action === "SET NULL"
          ? "nullify"
          : action === "RESTRICT"
            ? "restrict"
            : undefined,
  };
}

// quotedScope/dataSourceSql dispatch quoting through the adapter instance
// (`this.quote`); supply a minimal host carrying the MySQL `quote` standalone.
const quoteHost = { quote };

describe("MySQL::SchemaStatements", () => {
  it("isRowFormatDynamicByDefault: MariaDB >= 10.2.2 is true", () => {
    expect(isRowFormatDynamicByDefault(true, "10.2.2")).toBe(true);
    expect(isRowFormatDynamicByDefault(true, "10.10.0")).toBe(true); // numeric, not lexicographic
    expect(isRowFormatDynamicByDefault(true, "10.2.2-MariaDB")).toBe(true); // suffix stripped
    expect(isRowFormatDynamicByDefault(true, "10.2.1-MariaDB")).toBe(false);
    expect(isRowFormatDynamicByDefault(true, "10.2.1")).toBe(false);
  });

  it("isRowFormatDynamicByDefault: MySQL >= 5.7.9 is true", () => {
    expect(isRowFormatDynamicByDefault(false, "5.7.9")).toBe(true);
    expect(isRowFormatDynamicByDefault(false, "5.11.0")).toBe(true); // numeric: 11 > 7
    expect(isRowFormatDynamicByDefault(false, "5.7.8")).toBe(false);
  });

  it("defaultRowFormat: null when dynamic by default", () => {
    expect(defaultRowFormat(false, "8.0.0", true, true)).toBeNull();
  });

  it("defaultRowFormat: ROW_FORMAT=DYNAMIC when innodb settings set", () => {
    expect(defaultRowFormat(false, "5.6.0", true, true)).toBe("ROW_FORMAT=DYNAMIC");
    expect(defaultRowFormat(false, "5.6.0", false, true)).toBeNull();
  });

  it("validPrimaryKeyOptions includes unsigned and autoIncrement", () => {
    const opts = validPrimaryKeyOptions();
    expect(opts).toContain("unsigned");
    expect(opts).toContain("autoIncrement");
    expect(opts).toContain("limit");
  });

  it("createTableDefinition returns MySQL TableDefinition", () => {
    expect(createTableDefinition("users").tableName).toBe("users");
  });

  it("defaultType: parses string/integer/function defaults", () => {
    expect(defaultType("`name` varchar(255) DEFAULT 'admin'", "name")).toBe("string");
    expect(defaultType("`count` int DEFAULT 42", "count")).toBe("integer");
    expect(defaultType("`updated_at` datetime DEFAULT NOW", "updated_at")).toBe("function");
    expect(defaultType(null, "name")).toBeUndefined();
  });

  it("newColumnFromField: builds Column from SHOW COLUMNS field hash", () => {
    const noInfo = () => null;
    const col = newColumnFromField(
      "users",
      {
        Field: "name",
        Type: "varchar(255)",
        Null: "YES",
        Default: "Dean",
        Extra: "",
        Collation: "utf8_general_ci",
      },
      noInfo,
    );
    expect(col.name).toBe("name");
    expect(col.default).toBe("Dean");
    expect(col.null).toBe(true);
    expect(col.collation).toBe("utf8_general_ci");
  });

  it("newColumnFromField: CURRENT_TIMESTAMP default becomes defaultFunction on timestamp (alias for datetime)", () => {
    const noInfo = () => null;
    const col = newColumnFromField(
      "events",
      {
        Field: "updated_at",
        Type: "timestamp",
        Null: "NO",
        Default: "CURRENT_TIMESTAMP",
        Extra: "",
      },
      noInfo,
    );
    expect(col.default).toBeNull();
    expect(col.defaultFunction).toBe("CURRENT_TIMESTAMP");
  });

  it("newColumnFromField: CURRENT_TIMESTAMP default becomes defaultFunction on datetime", () => {
    const noInfo = () => null;
    const col = newColumnFromField(
      "events",
      {
        Field: "created_at",
        Type: "datetime",
        Null: "NO",
        Default: "CURRENT_TIMESTAMP",
        Extra: "",
      },
      noInfo,
    );
    expect(col.default).toBeNull();
    expect(col.defaultFunction).toBe("CURRENT_TIMESTAMP");
  });

  it("newColumnFromField: NOW() via DEFAULT_GENERATED becomes defaultFunction (MySQL 8)", () => {
    const noInfo = () => null;
    const col = newColumnFromField(
      "events",
      {
        Field: "created_at",
        Type: "datetime",
        Null: "NO",
        Default: "now()",
        Extra: "DEFAULT_GENERATED",
      },
      noInfo,
    );
    expect(col.default).toBeNull();
    expect(col.defaultFunction).toBe("(now())");
  });

  it("newColumnFromField: UUID() via DEFAULT_GENERATED becomes defaultFunction (MySQL 8)", () => {
    const noInfo = () => null;
    const col = newColumnFromField(
      "items",
      { Field: "uid", Type: "char(36)", Null: "NO", Default: "uuid()", Extra: "DEFAULT_GENERATED" },
      noInfo,
    );
    expect(col.default).toBeNull();
    expect(col.defaultFunction).toBe("(uuid())");
  });

  it("newColumnFromField: CURRENT_DATE via DEFAULT_GENERATED becomes defaultFunction (MySQL 8)", () => {
    const noInfo = () => null;
    const col = newColumnFromField(
      "items",
      {
        Field: "due_on",
        Type: "date",
        Null: "YES",
        Default: "CURRENT_DATE",
        Extra: "DEFAULT_GENERATED",
      },
      noInfo,
    );
    expect(col.default).toBeNull();
    expect(col.defaultFunction).toBe("(CURRENT_DATE)");
  });

  it("newColumnFromField: DEFAULT_GENERATED extra becomes defaultFunction", () => {
    const noInfo = () => null;
    const col = newColumnFromField(
      "orders",
      {
        Field: "total",
        Type: "decimal(10,2)",
        Null: "YES",
        Default: "price * qty",
        Extra: "DEFAULT_GENERATED",
      },
      noInfo,
    );
    expect(col.default).toBeNull();
    expect(col.defaultFunction).toBe("(price * qty)");
  });

  it("newColumnFromField: text default strips surrounding quotes", () => {
    const noInfo = () => null;
    const col = newColumnFromField(
      "users",
      { Field: "bio", Type: "text", Null: "YES", Default: "'hello world'", Extra: "" },
      noInfo,
    );
    expect(col.default).toBe("hello world");
  });

  it("fetchTypeMetadata: fallback strips unsigned/zerofill modifiers", () => {
    expect(fetchTypeMetadata("bigint unsigned").type).toBe("bigint");
    expect(fetchTypeMetadata("int unsigned zerofill").type).toBe("int");
  });

  it("fetchTypeMetadata wraps sqlType with MySQL TypeMetadata", () => {
    const meta = fetchTypeMetadata("varchar(255)", "auto_increment");
    expect(meta.sqlType).toBe("varchar(255)");
    expect(meta.extra).toBe("auto_increment");
    expect(fetchTypeMetadata("int").extra).toBe("");
  });

  it("fetchTypeMetadata: uses lookupCastType for limit/precision/scale", () => {
    const lookup = (s: string) => ({ name: "integer", limit: 8, precision: null, scale: null });
    const meta = fetchTypeMetadata("bigint unsigned", "", lookup);
    expect(meta.type).toBe("integer");
    expect(meta.limit).toBe(8);
  });

  it("newColumnFromField: limit from lookupCastType is preserved on Column", () => {
    const lookup = (s: string) => ({ name: "integer", limit: 8, precision: null, scale: null });
    const col = newColumnFromField(
      "t",
      { Field: "id", Type: "bigint", Null: "NO", Default: null, Extra: "" },
      () => null,
      lookup,
    );
    expect(col.sqlTypeMetadata?.limit).toBe(8);
  });

  it("fetchTypeMetadata: lookupCastType boolean mapping (tinyint(1) emulation)", () => {
    const lookup = (s: string) => ({ name: "boolean", limit: null, precision: null, scale: null });
    const meta = fetchTypeMetadata("tinyint(1)", "", lookup);
    expect(meta.type).toBe("boolean");
  });

  it("extractForeignKeyAction: RESTRICT → undefined, others normalized", () => {
    expect(extractForeignKeyAction("RESTRICT")).toBeUndefined();
    expect(extractForeignKeyAction("CASCADE")).toBe("cascade");
    expect(extractForeignKeyAction("SET NULL")).toBe("nullify");
  });

  it("addIndexLength appends (N) prefix length to column", () => {
    const cols = new Map([
      ["name", "`name`"],
      ["email", "`email`"],
    ]);
    const result = addIndexLength(cols, { length: { email: 20 } });
    expect(result.get("name")).toBe("`name`");
    expect(result.get("email")).toBe("`email`(20)");
  });

  it("addIndexLength applies scalar length to all columns", () => {
    const cols = new Map([
      ["name", "`name`"],
      ["email", "`email`"],
    ]);
    const result = addIndexLength(cols, { length: 10 });
    expect(result.get("name")).toBe("`name`(10)");
    expect(result.get("email")).toBe("`email`(10)");
  });

  it("addOptionsForIndexColumns: applies length and per-column order", () => {
    const cols = new Map([["name", "`name`"]]);
    expect(
      addOptionsForIndexColumns(cols, { length: { name: 5 }, order: { name: "desc" } }).get("name"),
    ).toBe("`name`(5) DESC");
  });

  it("addOptionsForIndexColumns: string order applies to all columns", () => {
    const cols = new Map([
      ["a", "`a`"],
      ["b", "`b`"],
    ]);
    const result = addOptionsForIndexColumns(cols, { order: "asc" });
    expect(result.get("a")).toBe("`a` ASC");
    expect(result.get("b")).toBe("`b` ASC");
  });

  it("extractSchemaQualifiedName splits schema.table", () => {
    expect(extractSchemaQualifiedName("mydb.users")).toEqual(["mydb", "users"]);
    expect(extractSchemaQualifiedName("`mydb`.`users`")).toEqual(["mydb", "users"]);
    expect(extractSchemaQualifiedName("users")).toEqual([null, "users"]);
    expect(extractSchemaQualifiedName(null)).toEqual([null, null]);
  });

  it("dataSourceSql: generates information_schema query", () => {
    const sql = dataSourceSql.call(quoteHost);
    expect(sql).toContain("SELECT table_name FROM information_schema.tables");
    expect(sql).toContain("WHERE table_schema = database()");
    expect(dataSourceSql.call(quoteHost, "users")).toContain("AND table_name = 'users'");
    expect(dataSourceSql.call(quoteHost, undefined, { type: "BASE TABLE" })).toContain(
      "AND table_type = 'BASE TABLE'",
    );
    const qualified = dataSourceSql.call(quoteHost, "mydb.users");
    expect(qualified).toContain("table_schema = 'mydb'");
    expect(qualified).toContain("table_name = 'users'");
  });

  it("quotedScope builds scope hash", () => {
    expect(quotedScope.call(quoteHost).schema).toBe("database()");
    expect(quotedScope.call(quoteHost, "users").name).toBe("'users'");
    const q = quotedScope.call(quoteHost, "mydb.users");
    expect(q.schema).toBe("'mydb'");
    expect(q.name).toBe("'users'");
    expect(quotedScope.call(quoteHost, undefined, { type: "BASE TABLE" }).type).toBe(
      "'BASE TABLE'",
    );
  });

  it("typeWithSizeToSql: builds prefixed type names", () => {
    expect(typeWithSizeToSql("text", undefined)).toBe("text");
    expect(typeWithSizeToSql("text", "tiny")).toBe("tinytext");
    expect(typeWithSizeToSql("text", "medium")).toBe("mediumtext");
    expect(typeWithSizeToSql("blob", "long")).toBe("longblob");
    expect(() => typeWithSizeToSql("text", "huge")).toThrow("invalid :size value");
  });

  it("limitToSize: maps byte limits for text/blob/binary", () => {
    expect(limitToSize(255, "text")).toBe("tiny");
    expect(limitToSize(null, "text")).toBeUndefined();
    expect(limitToSize(65536, "text")).toBe("medium");
    expect(limitToSize(16777216, "text")).toBe("long");
    expect(limitToSize(4, "integer")).toBeUndefined();
    expect(() => limitToSize(5_000_000_000, "text")).toThrow();
  });

  it("integerToSql: maps limit to MySQL int types", () => {
    expect(integerToSql(1)).toBe("tinyint");
    expect(integerToSql(2)).toBe("smallint");
    expect(integerToSql(3)).toBe("mediumint");
    expect(integerToSql(null)).toBe("int");
    expect(integerToSql(4)).toBe("int");
    expect(integerToSql(8)).toBe("bigint");
    expect(() => integerToSql(9)).toThrow("No integer type has byte size");
  });

  it("foreignKeys: single-column key returns scalar column and primaryKey", async () => {
    const fks = await foreignKeys.call(
      fkHost([
        {
          to_table: "rockets",
          primary_key: "id",
          column: "rocket_id",
          name: "fk_1",
          position: 1,
          on_update: "RESTRICT",
          on_delete: "CASCADE",
        },
      ]),
      "astronauts",
    );
    expect(fks).toHaveLength(1);
    expect(fks[0]!.column).toBe("rocket_id");
    expect(fks[0]!.primaryKey).toBe("id");
    expect(fks[0]!.toTable).toBe("rockets");
    expect(fks[0]!.onDelete).toBe("cascade");
  });

  it("test_add_composite_foreign_key_infers_column", async () => {
    const fks = await foreignKeys.call(
      fkHost([
        {
          to_table: "rockets",
          primary_key: "tenant_id",
          column: "rocket_tenant_id",
          name: "fk_2",
          position: 1,
          on_update: "RESTRICT",
          on_delete: "RESTRICT",
        },
        {
          to_table: "rockets",
          primary_key: "id",
          column: "rocket_id",
          name: "fk_2",
          position: 2,
          on_update: "RESTRICT",
          on_delete: "RESTRICT",
        },
      ]),
      "astronauts",
    );
    expect(fks).toHaveLength(1);
    expect(fks[0]!.column).toEqual(["rocket_tenant_id", "rocket_id"]);
    expect(fks[0]!.primaryKey).toEqual(["tenant_id", "id"]);
  });

  it("foreignKeys: unquotes backtick-quoted column and to_table identifiers", async () => {
    const fks = await foreignKeys.call(
      fkHost([
        {
          to_table: "`roc``kets`",
          primary_key: "id",
          column: "`rocket_id`",
          name: "fk_3",
          position: 1,
          on_update: "RESTRICT",
          on_delete: "RESTRICT",
        },
      ]),
      "astronauts",
    );
    expect(fks[0]!.column).toBe("rocket_id");
    expect(fks[0]!.toTable).toBe("roc`kets");
  });
});
