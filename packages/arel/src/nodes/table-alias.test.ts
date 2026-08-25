import { describe, it, expect } from "vitest";
import { Table, Nodes } from "../index.js";
import { uniq } from "../test-helpers/uniq.js";

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
      const relation1 = new Table("users");
      const node1 = new Nodes.TableAlias(relation1, "foo");
      const relation2 = new Table("users");
      const node2 = new Nodes.TableAlias(relation2, "foo");
      const array = [node1, node2];
      expect(uniq(array).length).toBe(1);
    });

    it("is not equal with different ivars", () => {
      const relation1 = new Table("users");
      const node1 = new Nodes.TableAlias(relation1, "foo");
      const relation2 = new Table("users");
      const node2 = new Nodes.TableAlias(relation2, "bar");
      const array = [node1, node2];
      expect(uniq(array).length).toBe(2);
    });
  });
});
