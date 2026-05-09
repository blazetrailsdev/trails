import { describe, it, expect } from "vitest";
import { SchemaCreation } from "./schema-creation.js";
import {
  AddColumnDefinition,
  ChangeColumnDefinition,
  ChangeColumnDefaultDefinition,
  CreateIndexDefinition,
  IndexDefinition,
  ColumnDefinition,
  TableDefinition,
} from "../abstract/schema-definitions.js";

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
});
