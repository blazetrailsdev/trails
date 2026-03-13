import { describe, it, expect } from "vitest";
import { Table, Nodes } from "../index.js";

describe("Arel", () => {
  const users = new Table("users");

  describe("update-statement", () => {
    it("clones wheres and values", () => {
      const stmt = new Nodes.UpdateStatement();
      stmt.wheres.push(users.get("id").eq(1));
      const copyWheres = [...stmt.wheres];
      expect(copyWheres.length).toBe(1);
      stmt.wheres.push(users.get("name").eq("dean"));
      expect(copyWheres.length).toBe(1);
      expect(stmt.wheres.length).toBe(2);
    });

    it("is not equal with different ivars", () => {
      const s1 = new Nodes.UpdateStatement();
      const s2 = new Nodes.UpdateStatement();
      s2.relation = users;
      expect(s1.relation).not.toBe(s2.relation);
    });

    it("is equal with equal ivars", () => {
      const c1 = new Nodes.NamedFunction("COUNT", [users.get("id")]);
      const c2 = new Nodes.NamedFunction("COUNT", [users.get("id")]);
      expect(c1.name).toBe(c2.name);
    });
  });
});
