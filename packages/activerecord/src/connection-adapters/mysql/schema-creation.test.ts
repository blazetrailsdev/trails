import { describe, it, expect } from "vitest";
import { SchemaCreation, type VisitorHostAdapter } from "./schema-creation.js";
import {
  AddColumnDefinition,
  ChangeColumnDefinition,
  ChangeColumnDefaultDefinition,
  CreateIndexDefinition,
  IndexDefinition,
  ColumnDefinition,
  TableDefinition,
  AlterTable,
} from "../abstract/schema-definitions.js";
import { TableDefinition as MyTd } from "./schema-definitions.js";
import { Column } from "./column.js";
import { schemaConn } from "../../support/schema-conn.js";

/**
 * Rails' `MySQL::SchemaCreation.new(conn)` always gets the live adapter, so these
 * DDL-rendering tests hand it the shared unconnected MySQL adapter; overrides for
 * the support-flag branches sit on a derived object so the shared one stays clean.
 */
const mysqlConn = (overrides: Record<string, unknown> = {}): VisitorHostAdapter =>
  Object.assign(Object.create(schemaConn("mysql")), overrides) as VisitorHostAdapter;

describe("MySQL::SchemaCreation", () => {
  const sc = new SchemaCreation(mysqlConn());

  it("visitDropForeignKey returns DROP FOREIGN KEY sql", async () => {
    expect((sc as any).visitDropForeignKey("fk_name")).toBe("DROP FOREIGN KEY fk_name");
  });

  it("visitDropCheckConstraint uses CHECK for MySQL", async () => {
    expect((sc as any).visitDropCheckConstraint("chk")).toBe("DROP CHECK chk");
  });

  it("visitDropCheckConstraint uses CONSTRAINT for MariaDB", async () => {
    const mdb = new SchemaCreation(mysqlConn({ isMariadb: () => true }));
    expect((mdb as any).visitDropCheckConstraint("chk")).toBe("DROP CONSTRAINT chk");
  });

  it("visitAlterTable routes FK/check drops through the MySQL visitors", async () => {
    const at = new AlterTable("posts");
    at.dropForeignKey("fk_name");
    at.checkConstraintDrops.push("chk");
    const sql = await (sc as any).visitAlterTable(at);
    expect(sql).toContain("DROP FOREIGN KEY fk_name");
    expect(sql).toContain("DROP CHECK chk");
  });

  it("visitChangeColumnDefinition generates CHANGE sql", async () => {
    const col = new ColumnDefinition("email", "string", {});
    const def = new ChangeColumnDefinition(col, "old_name");
    expect(await (sc as any).visitChangeColumnDefinition(def)).toMatch(
      /^CHANGE `old_name` `email` /,
    );
  });

  it("visitChangeColumnDefaultDefinition generates SET DEFAULT", async () => {
    const col = new Column("status", null, { sqlType: "varchar(255)", type: "string" });
    const def = new ChangeColumnDefaultDefinition(col, "active");
    expect(await (sc as any).visitChangeColumnDefaultDefinition(def)).toMatch(
      /ALTER COLUMN `status` SET DEFAULT/,
    );
  });

  it("visitChangeColumnDefaultDefinition generates DROP DEFAULT when null:false + null value", async () => {
    const col = new Column("status", null, { sqlType: "varchar(255)", type: "string" }, false);
    const def = new ChangeColumnDefaultDefinition(col, null);
    expect(await (sc as any).visitChangeColumnDefaultDefinition(def)).toBe(
      "ALTER COLUMN `status` DROP DEFAULT",
    );
  });

  it("visitIndexDefinition generates inline INDEX sql", async () => {
    const idx = new IndexDefinition("users", "idx_users_email", false, ["email"]);
    expect((sc as any).visitIndexDefinition(idx, false)).toBe("INDEX `idx_users_email` (`email`)");
  });

  it("visitIndexDefinition generates CREATE UNIQUE INDEX with table", async () => {
    const idx = new IndexDefinition("users", "idx", true, ["email"]);
    expect((sc as any).visitIndexDefinition(idx, true)).toBe(
      "CREATE UNIQUE INDEX `idx` ON `users` (`email`)",
    );
  });

  it("index_in_create renders the index through accept", async () => {
    expect(await (sc as any).indexInCreate("users", "email", {})).toBe(
      "INDEX `index_users_on_email` (`email`)",
    );
  });

  it("accept dispatches an IndexDefinition to visit_IndexDefinition", async () => {
    const idx = new IndexDefinition("users", "idx_users_email", false, ["email"]);
    expect(await sc.accept(idx)).toBe("INDEX `idx_users_email` (`email`)");
  });

  it("visitCreateIndexDefinition appends algorithm", async () => {
    const idx = new IndexDefinition("users", "idx", false, ["col"]);
    const def = new CreateIndexDefinition(idx, false, "INPLACE");
    expect((sc as any).visitCreateIndexDefinition(def)).toContain("INPLACE");
  });

  it("emits inline index sort order when the adapter supports it", async () => {
    const withHost = new SchemaCreation(mysqlConn({ supportsIndexSortOrder: () => true }));
    const idx = new IndexDefinition("users", "idx", false, ["email"], {
      orders: { email: "desc" },
    });
    expect((withHost as any).visitIndexDefinition(idx, false)).toBe("INDEX `idx` (`email` DESC)");
  });

  it("drops inline index sort order when the adapter version gate is unsupported", async () => {
    const withHost = new SchemaCreation(mysqlConn({ supportsIndexSortOrder: () => false }));
    const idx = new IndexDefinition("users", "idx", false, ["email"], {
      orders: { email: "desc" },
    });
    expect((withHost as any).visitIndexDefinition(idx, false)).toBe("INDEX `idx` (`email`)");
  });

  it("addTableOptionsBang appends charset and collation", async () => {
    const td = new TableDefinition("users", { adapter: mysqlConn(), adapterName: "mysql" });
    (td as any).charset = "utf8mb4";
    (td as any).collation = "utf8mb4_unicode_ci";
    const result = (sc as any).addTableOptionsBang("CREATE TABLE `users` ()", td);
    expect(result).toContain("DEFAULT CHARSET=utf8mb4");
    expect(result).toContain("COLLATE=utf8mb4_unicode_ci");
  });

  it("addColumnPositionBang appends FIRST", async () => {
    expect((sc as any).addColumnPositionBang("col INTEGER", { first: true })).toBe(
      "col INTEGER FIRST",
    );
  });

  it("addColumnPositionBang appends AFTER", async () => {
    expect((sc as any).addColumnPositionBang("col INTEGER", { after: "name" })).toBe(
      "col INTEGER AFTER `name`",
    );
  });

  it("indexInCreate generates inline index with provided name", async () => {
    const sql = await (sc as any).indexInCreate("users", "email", { name: "my_idx" });
    expect(sql).toContain("`my_idx`");
    expect(sql).toContain("`email`");
  });

  it("addColumnOptionsBang emits AUTO_INCREMENT when autoIncrement: true", async () => {
    const col = new ColumnDefinition("id", "integer", { autoIncrement: true });
    const result = await (sc as any).addColumnOptionsBang("`id` int(11)", col.options);
    expect(result).toContain("AUTO_INCREMENT");
  });

  it("addColumnOptionsBang does not emit AUTO_INCREMENT when not set", async () => {
    const col = new ColumnDefinition("id", "integer", {});
    const result = await (sc as any).addColumnOptionsBang("`id` int(11)", col.options);
    expect(result).not.toContain("AUTO_INCREMENT");
  });

  it("addColumn with autoIncrement: true emits AUTO_INCREMENT in DDL", async () => {
    const col = new ColumnDefinition("id", "integer", { autoIncrement: true, null: false });
    const sql = await sc.accept(new AddColumnDefinition(col));
    expect(sql).toMatch(/ADD .+ AUTO_INCREMENT/);
  });

  it("typeToSql emits float(24) for float without limit", async () => {
    expect(sc.typeToSql("float", {})).toBe("float(24)");
  });

  it("typeToSql emits float(N) for float with limit", async () => {
    expect(sc.typeToSql("float", { limit: 5 })).toBe("float(5)");
    expect(sc.typeToSql("float", { limit: 53 })).toBe("float(53)");
  });

  it("typeToSql delegates non-float types to super", async () => {
    expect(sc.typeToSql("integer", {})).not.toContain("float");
    expect(sc.typeToSql("string", {})).toMatch(/varchar/i);
  });

  it("typeToSql preserves enum/set literal type fragments verbatim", async () => {
    // Rails' type_to_sql returns an unrecognized type unchanged; the abstract
    // default branch must not uppercase a quoted value list, or enum/set member
    // values get corrupted (e.g. enum('text') -> enum('TEXT')).
    expect(sc.typeToSql("enum('text','blob','tiny')", {})).toBe("enum('text','blob','tiny')");
    expect(sc.typeToSql("set('a','b')", {})).toBe("set('a','b')");
  });
});

describe("MySQL::TableDefinition#toSql via SchemaCreation.accept", () => {
  // Rails has no MySQL::TableDefinition#to_sql; CREATE TABLE SQL is produced by
  // accepting the TableDefinition into the adapter's SchemaCreation visitor.
  const toSql = (td: MyTd, host: VisitorHostAdapter = mysqlConn()) =>
    new SchemaCreation(host).accept(td);

  it("emits bigint AUTO_INCREMENT PRIMARY KEY for default id column", async () => {
    const td = new MyTd("users", { adapter: mysqlConn() });
    td.setPrimaryKey("users", true);
    td.string("name");
    expect(await toSql(td)).toBe(
      "CREATE TABLE `users` (`id` bigint NOT NULL AUTO_INCREMENT PRIMARY KEY, `name` varchar(255))",
    );
  });

  it("drops the type for a virtual column with no type option (Rails no-fallback)", async () => {
    const td = new MyTd("t", { adapter: mysqlConn() });
    td.column("full_name", "virtual" as any, { as: "CONCAT(a, b)" } as any);
    const col = td.columns.find((c) => c.name === "full_name")!;
    expect(col.type).toBeUndefined();
    const sql = await toSql(td);
    expect(sql).toContain("`full_name`  AS (CONCAT(a, b))");
    expect(sql).not.toContain("varchar");
  });

  it("honors id: false (no primary key column)", async () => {
    const td = new MyTd("logs", { adapter: mysqlConn() });
    td.setPrimaryKey("logs", false);
    td.string("body");
    expect(await toSql(td)).toBe("CREATE TABLE `logs` (`body` varchar(255))");
  });

  it("appends DEFAULT CHARSET and COLLATE from table options", async () => {
    const td = new MyTd("posts", {
      adapter: mysqlConn(),
      charset: "utf8mb4",
      collation: "utf8mb4_unicode_ci",
    });
    td.string("title");
    const sql = await toSql(td);
    expect(sql).toContain("DEFAULT CHARSET=utf8mb4");
    expect(sql).toContain("COLLATE=utf8mb4_unicode_ci");
  });

  it("emits IF NOT EXISTS and TEMPORARY modifiers", async () => {
    const td = new MyTd("tmp", {
      adapter: mysqlConn(),
      temporary: true,
      ifNotExists: true,
    });
    td.integer("n");
    expect(await toSql(td)).toBe("CREATE TEMPORARY TABLE IF NOT EXISTS `tmp` (`n` int)");
  });

  it("emits composite PRIMARY KEY clause", async () => {
    const td = new MyTd("memberships", { adapter: mysqlConn() });
    td.setPrimaryKey("memberships", true, ["user_id", "group_id"]);
    td.bigint("user_id", { null: false });
    td.bigint("group_id", { null: false });
    const sql = await toSql(td);
    expect(sql).toContain("PRIMARY KEY (`user_id`, `group_id`)");
  });

  it("inlines indexes when supportsIndexesInCreate (MySQL)", async () => {
    const td = new MyTd("users", { adapter: mysqlConn() });
    td.string("email");
    td.index(["email"], { unique: true, name: "idx_users_email" });
    const sql = await toSql(td);
    expect(sql).toContain("UNIQUE INDEX `idx_users_email` (`email`)");
  });

  it("inlines FOREIGN KEY constraints", async () => {
    const td = new MyTd("posts", { adapter: mysqlConn() });
    td.bigint("author_id");
    td.foreignKey("authors", { column: "author_id" });
    const sql = await toSql(td);
    expect(sql).toContain("CONSTRAINT ");
    expect(sql).toContain("FOREIGN KEY (`author_id`) REFERENCES `authors` (`id`)");
  });

  it("inlines CHECK constraints", async () => {
    const td = new MyTd("products", { adapter: mysqlConn() });
    td.integer("price");
    td.checkConstraint("price > 0", { name: "price_positive" });
    const sql = await toSql(td);
    expect(sql).toContain("CONSTRAINT `price_positive` CHECK (price > 0)");
  });

  it("appends MySQL COMMENT on table option", async () => {
    const td = new MyTd("notes", { adapter: mysqlConn(), comment: "user-supplied" });
    td.string("body");
    expect(await toSql(td)).toContain("COMMENT 'user-supplied'");
  });

  it("emits AS clause after table options for CTAS", async () => {
    const td = new MyTd("snapshot", { adapter: mysqlConn(), as: "SELECT 1" });
    expect(await toSql(td)).toMatch(/CREATE TABLE `snapshot`.* AS SELECT 1$/);
  });

  it("skips FK emission when host adapter has foreignKeys disabled", async () => {
    const host = mysqlConn({ supportsForeignKeys: () => true, _config: { foreignKeys: false } });
    const td = new MyTd("posts", { adapter: host });
    td.bigint("author_id");
    td.foreignKey("authors", { column: "author_id" });
    expect(await toSql(td, host)).not.toContain("FOREIGN KEY");
  });

  it("skips CHECK emission when host adapter reports !supportsCheckConstraints", async () => {
    const host = mysqlConn({ supportsCheckConstraints: () => false });
    const td = new MyTd("products", { adapter: host });
    td.integer("price");
    td.checkConstraint("price > 0", { name: "p_pos" });
    expect(await toSql(td, host)).not.toContain("CHECK");
  });
});

describe("MySQL::TableDefinition column methods", () => {
  it("defines one column per name, mirroring `names.each` in define_column_methods", () => {
    const td = new MyTd("t", { adapter: mysqlConn() });
    td.longtext("body", "summary");
    td.unsignedInteger("hits", "misses");

    expect(td.columns.map((c) => c.name)).toEqual(["body", "summary", "hits", "misses"]);
    expect(td.columns.map((c) => c.sqlType)).toEqual([
      "LONGTEXT",
      "LONGTEXT",
      "INT UNSIGNED",
      "INT UNSIGNED",
    ]);
  });

  it("applies the shared options and per-name sizing to every blob name", () => {
    const td = new MyTd("t", { adapter: mysqlConn() });
    td.blob("thumb", "preview", { limit: 300 });

    expect(td.columns.map((c) => c.name)).toEqual(["thumb", "preview"]);
    expect(td.columns.map((c) => c.sqlType)).toEqual(["BLOB", "BLOB"]);
  });

  it("raises when called with no column name", () => {
    const td = new MyTd("t", { adapter: mysqlConn() });

    expect(() => (td.blob as () => unknown)()).toThrow("Missing column name(s) for blob");
    expect(() => (td.tinytext as () => unknown)()).toThrow("Missing column name(s) for tinytext");
    expect(() => (td.unsignedBigint as () => unknown)()).toThrow(
      "Missing column name(s) for unsigned_bigint",
    );
  });
});
