import { describe, it, expect } from "vitest";
import { SchemaCreation, type MysqlAddColumnOptions } from "./schema-creation.js";
import {
  AddColumnDefinition,
  ChangeColumnDefinition,
  ChangeColumnDefaultDefinition,
  CreateIndexDefinition,
  IndexDefinition,
  ColumnDefinition,
  TableDefinition,
} from "../abstract/schema-definitions.js";
import { TableDefinition as MyTd } from "./schema-definitions.js";

describe("MySQL::SchemaCreation", () => {
  const sc = new SchemaCreation();

  it("visitDropForeignKey returns DROP FOREIGN KEY sql", () => {
    expect((sc as any).visitDropForeignKey("fk_name")).toBe("DROP FOREIGN KEY fk_name");
  });

  it("visitDropCheckConstraint uses CHECK for MySQL", () => {
    expect((sc as any).visitDropCheckConstraint("chk")).toBe("DROP CHECK chk");
  });

  it("visitDropCheckConstraint uses CONSTRAINT for MariaDB", () => {
    const mdb = new SchemaCreation();
    (mdb as any)._mariadb = true;
    expect((mdb as any).visitDropCheckConstraint("chk")).toBe("DROP CONSTRAINT chk");
  });

  it("visitChangeColumnDefinition generates CHANGE sql", () => {
    const col = new ColumnDefinition("email", "string", {});
    const def = new ChangeColumnDefinition(col, "old_name");
    expect((sc as any).visitChangeColumnDefinition(def)).toMatch(/^CHANGE `old_name` `email` /);
  });

  it("visitChangeColumnDefaultDefinition generates SET DEFAULT", () => {
    const col = new ColumnDefinition("status", "string", {});
    const def = new ChangeColumnDefaultDefinition(col, "active");
    expect((sc as any).visitChangeColumnDefaultDefinition(def)).toMatch(
      /ALTER COLUMN `status` SET DEFAULT/,
    );
  });

  it("visitChangeColumnDefaultDefinition generates DROP DEFAULT when null:false + null value", () => {
    const col = new ColumnDefinition("status", "string", { null: false });
    const def = new ChangeColumnDefaultDefinition(col, null);
    expect((sc as any).visitChangeColumnDefaultDefinition(def)).toBe(
      "ALTER COLUMN `status` DROP DEFAULT",
    );
  });

  it("visitIndexDefinition generates inline INDEX sql", () => {
    const idx = new IndexDefinition("users", "idx_users_email", false, ["email"]);
    expect((sc as any).visitIndexDefinition(idx, false)).toBe("INDEX `idx_users_email` (`email`)");
  });

  it("visitIndexDefinition generates CREATE UNIQUE INDEX with table", () => {
    const idx = new IndexDefinition("users", "idx", true, ["email"]);
    expect((sc as any).visitIndexDefinition(idx, true)).toBe(
      "CREATE UNIQUE INDEX `idx` ON `users` (`email`)",
    );
  });

  it("visitCreateIndexDefinition appends algorithm", () => {
    const idx = new IndexDefinition("users", "idx", false, ["col"]);
    const def = new CreateIndexDefinition(idx, false, "INPLACE");
    expect((sc as any).visitCreateIndexDefinition(def)).toContain("INPLACE");
  });

  it("addTableOptionsBang appends charset and collation", () => {
    const td = new TableDefinition("users", { adapterName: "mysql" });
    (td as any).charset = "utf8mb4";
    (td as any).collation = "utf8mb4_unicode_ci";
    const result = (sc as any).addTableOptionsBang("CREATE TABLE `users` ()", td);
    expect(result).toContain("DEFAULT CHARSET=utf8mb4");
    expect(result).toContain("COLLATE=utf8mb4_unicode_ci");
  });

  it("addColumnPositionBang appends FIRST", () => {
    expect((sc as any).addColumnPositionBang("col INTEGER", { first: true })).toBe(
      "col INTEGER FIRST",
    );
  });

  it("addColumnPositionBang appends AFTER", () => {
    expect((sc as any).addColumnPositionBang("col INTEGER", { after: "name" })).toBe(
      "col INTEGER AFTER `name`",
    );
  });

  it("indexInCreate generates inline index with provided name", () => {
    const sql = (sc as any).indexInCreate("users", "email", { name: "my_idx" });
    expect(sql).toContain("`my_idx`");
    expect(sql).toContain("`email`");
  });

  it("addColumnOptionsBang emits AUTO_INCREMENT when autoIncrement: true", () => {
    const col = new ColumnDefinition("id", "integer", { autoIncrement: true });
    const result = (sc as any).addColumnOptionsBang("`id` int(11)", col.options);
    expect(result).toContain("AUTO_INCREMENT");
  });

  it("addColumnOptionsBang does not emit AUTO_INCREMENT when not set", () => {
    const col = new ColumnDefinition("id", "integer", {});
    const result = (sc as any).addColumnOptionsBang("`id` int(11)", col.options);
    expect(result).not.toContain("AUTO_INCREMENT");
  });

  it("addColumn with autoIncrement: true emits AUTO_INCREMENT in DDL", () => {
    const col = new ColumnDefinition("id", "integer", { autoIncrement: true, null: false });
    const sql = sc.accept(new AddColumnDefinition(col));
    expect(sql).toMatch(/ADD .+ AUTO_INCREMENT/);
  });

  it("typeToSql emits float(24) for float without limit", () => {
    expect(sc.typeToSql("float", {})).toBe("float(24)");
  });

  it("typeToSql emits float(N) for float with limit", () => {
    expect(sc.typeToSql("float", { limit: 5 })).toBe("float(5)");
    expect(sc.typeToSql("float", { limit: 53 })).toBe("float(53)");
  });

  it("typeToSql delegates non-float types to super", () => {
    expect(sc.typeToSql("integer", {})).not.toContain("float");
    expect(sc.typeToSql("string", {})).toMatch(/varchar/i);
  });

  it("addColumnOptions emits ON UPDATE when onUpdate is set (MySQL-specific)", () => {
    const opts: MysqlAddColumnOptions = { onUpdate: "CURRENT_TIMESTAMP" };
    const result = sc.addColumnOptions("`updated_at` datetime", opts);
    expect(result).toContain("ON UPDATE CURRENT_TIMESTAMP");
  });

  it("addColumnOptions does not emit ON UPDATE when onUpdate is absent", () => {
    const col = new ColumnDefinition("updated_at", "datetime", {});
    const result = sc.addColumnOptions("`updated_at` datetime", col.options);
    expect(result).not.toContain("ON UPDATE");
  });
});

describe("MySQL::TableDefinition#toSql via SchemaCreation.accept", () => {
  it("emits bigint AUTO_INCREMENT PRIMARY KEY for default id column", () => {
    const td = new MyTd("users", {});
    td.string("name");
    expect(td.toSql()).toBe(
      "CREATE TABLE `users` (`id` bigint NOT NULL AUTO_INCREMENT PRIMARY KEY, `name` varchar(255))",
    );
  });

  it("honors id: false (no primary key column)", () => {
    const td = new MyTd("logs", { id: false });
    td.string("body");
    expect(td.toSql()).toBe("CREATE TABLE `logs` (`body` varchar(255))");
  });

  it("appends DEFAULT CHARSET and COLLATE from table options", () => {
    const td = new MyTd("posts", { charset: "utf8mb4", collation: "utf8mb4_unicode_ci" });
    td.string("title");
    const sql = td.toSql();
    expect(sql).toContain("DEFAULT CHARSET=utf8mb4");
    expect(sql).toContain("COLLATE=utf8mb4_unicode_ci");
  });

  it("emits IF NOT EXISTS and TEMPORARY modifiers", () => {
    const td = new MyTd("tmp", { id: false, temporary: true, ifNotExists: true });
    td.integer("n");
    expect(td.toSql()).toBe("CREATE TEMPORARY TABLE IF NOT EXISTS `tmp` (`n` int)");
  });

  it("emits composite PRIMARY KEY clause", () => {
    const td = new MyTd("memberships", { primaryKey: ["user_id", "group_id"] });
    td.bigint("user_id", { null: false });
    td.bigint("group_id", { null: false });
    const sql = td.toSql();
    expect(sql).toContain("PRIMARY KEY (`user_id`, `group_id`)");
  });

  it("inlines indexes when supportsIndexesInCreate (MySQL)", () => {
    const td = new MyTd("users", {});
    td.string("email");
    td.index(["email"], { unique: true, name: "idx_users_email" });
    const sql = td.toSql();
    expect(sql).toContain("UNIQUE INDEX `idx_users_email` (`email`)");
  });

  it("inlines FOREIGN KEY constraints", () => {
    const td = new MyTd("posts", {});
    td.bigint("author_id");
    td.foreignKey("authors", { column: "author_id" });
    const sql = td.toSql();
    expect(sql).toContain("CONSTRAINT ");
    expect(sql).toContain("FOREIGN KEY (`author_id`) REFERENCES `authors` (`id`)");
  });

  it("inlines CHECK constraints", () => {
    const td = new MyTd("products", {});
    td.integer("price");
    td.checkConstraint("price > 0", { name: "price_positive" });
    const sql = td.toSql();
    expect(sql).toContain("CONSTRAINT `price_positive` CHECK (price > 0)");
  });

  it("appends MySQL COMMENT on table option", () => {
    const td = new MyTd("notes", { comment: "user-supplied" });
    td.string("body");
    expect(td.toSql()).toContain("COMMENT 'user-supplied'");
  });

  it("emits AS clause after table options for CTAS", () => {
    const td = new MyTd("snapshot", { id: false, as: "SELECT 1" });
    expect(td.toSql()).toMatch(/CREATE TABLE `snapshot`.* AS SELECT 1$/);
  });

  it("skips FK emission when host adapter has foreignKeys disabled", () => {
    const host = {
      supportsForeignKeys: () => true,
      config: { foreignKeys: false },
    };
    const td = new MyTd("posts", { adapter: host });
    td.bigint("author_id");
    td.foreignKey("authors", { column: "author_id" });
    expect(td.toSql()).not.toContain("FOREIGN KEY");
  });

  it("skips CHECK emission when host adapter reports !supportsCheckConstraints", () => {
    const host = { supportsCheckConstraints: () => false };
    const td = new MyTd("products", { adapter: host });
    td.integer("price");
    td.checkConstraint("price > 0", { name: "p_pos" });
    expect(td.toSql()).not.toContain("CHECK");
  });
});
