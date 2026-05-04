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
} from "./schema-statements.js";

describe("MySQL::SchemaStatements", () => {
  it("isRowFormatDynamicByDefault: MariaDB >= 10.2.2 is true", () => {
    expect(isRowFormatDynamicByDefault(true, "10.2.2")).toBe(true);
    expect(isRowFormatDynamicByDefault(true, "10.10.0")).toBe(true); // numeric, not lexicographic
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

  it("fetchTypeMetadata wraps sqlType with MySQL TypeMetadata", () => {
    const meta = fetchTypeMetadata("varchar(255)", "auto_increment");
    expect(meta.sqlType).toBe("varchar(255)");
    expect(meta.extra).toBe("auto_increment");
    expect(fetchTypeMetadata("int").extra).toBe("");
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
    const sql = dataSourceSql();
    expect(sql).toContain("SELECT table_name FROM information_schema.tables");
    expect(sql).toContain("WHERE table_schema = database()");
    expect(dataSourceSql("users")).toContain("AND table_name = 'users'");
    expect(dataSourceSql(undefined, "BASE TABLE")).toContain("AND table_type = 'BASE TABLE'");
    const qualified = dataSourceSql("mydb.users");
    expect(qualified).toContain("table_schema = 'mydb'");
    expect(qualified).toContain("table_name = 'users'");
  });

  it("quotedScope builds scope hash", () => {
    expect(quotedScope().schema).toBe("database()");
    expect(quotedScope("users").name).toBe("'users'");
    const q = quotedScope("mydb.users");
    expect(q.schema).toBe("'mydb'");
    expect(q.name).toBe("'users'");
    expect(quotedScope(undefined, { type: "BASE TABLE" }).type).toBe("'BASE TABLE'");
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
});
