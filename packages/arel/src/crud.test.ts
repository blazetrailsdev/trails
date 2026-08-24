import { describe, it, expect } from "vitest";
import { Table, InsertManager, UpdateManager, DeleteManager, SelectManager } from "./index.js";
import { Attribute } from "./attributes/attribute.js";

// Rails' `FakeCrudder` is a `SelectManager` that `include Crud` and carries a
// `FakeEngine` double (crud_test.rb:6-29). trails' `Crud` methods are already
// on `SelectManager`, and `toSql` takes the engine at the call site, so the
// subclass is the whole of what the Ruby class body contributes here.
class FakeCrudder extends SelectManager {}

describe("crud", () => {
  describe("insert", () => {
    it("should call insert on the connection", () => {
      const table = new Table("users");
      const fc = new FakeCrudder();
      fc.from(table);
      const im = fc.compileInsert([[table.get("id"), "foo"]]);
      expect(im).toBeInstanceOf(InsertManager);
    });
  });

  describe("update", () => {
    it("should call update on the connection", () => {
      const table = new Table("users");
      const fc = new FakeCrudder();
      fc.from(table);
      const stmt = fc.compileUpdate([[table.get("id"), "foo"]], new Attribute(table, "id"));
      expect(stmt).toBeInstanceOf(UpdateManager);
    });
  });

  describe("delete", () => {
    it("should call delete on the connection", () => {
      const table = new Table("users");
      const fc = new FakeCrudder();
      fc.from(table);
      const stmt = fc.compileDelete();
      expect(stmt).toBeInstanceOf(DeleteManager);
    });
  });
});
