import { describe, it, expect } from "vitest";
import { Table, Nodes } from "../index.js";

describe("table alias", () => {
  const users = new Table("users");
  describe("#to_cte", () => {
    it("returns a Cte node using the TableAlias's name and relation", () => {
      const tableAlias = new Nodes.TableAlias(users, "u");
      const cte = tableAlias.toCte();
      expect(cte).toBeInstanceOf(Nodes.Cte);
      expect(cte.name).toBe("u");
    });
  });

  describe("equality", () => {
    it("is equal with equal ivars", () => {
      const a = new Nodes.TableAlias(users, "u");
      const b = new Nodes.TableAlias(users, "u");
      expect(a).toEqual(b);
    });

    it("is not equal with different ivars", () => {
      const a = new Nodes.Window();
      a.order(users.get("id").asc());
      const b = new Nodes.Window();
      expect(a.orders.length).not.toBe(b.orders.length);
    });
  });
});
