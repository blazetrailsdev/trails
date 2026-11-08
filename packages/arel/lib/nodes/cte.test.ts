import { describe, it, expect } from "vitest";
import { uniq } from "../test-helpers/uniq.js";
import { Table, Nodes } from "../index.js";
import type { Node } from "./node.js";

describe("Cte", () => {
  describe("equality", () => {
    it("is equal with equal ivars", () => {
      const array = [
        new Nodes.Cte("foo", "bar" as unknown as Node, true),
        new Nodes.Cte("foo", "bar" as unknown as Node, true),
      ];

      expect(uniq(array).length).toBe(1);
    });

    it("is not equal with unequal ivars", () => {
      const array = [
        new Nodes.Cte("foo", "bar" as unknown as Node, true),
        new Nodes.Cte("foo", "bar" as unknown as Node),
      ];

      expect(uniq(array).length).toBe(2);
    });
  });

  describe("#to_cte", () => {
    it("returns self", () => {
      const cte = new Nodes.Cte("foo", "bar" as unknown as Node);

      expect(cte.toCte()).toBe(cte);
    });
  });

  describe("#to_table", () => {
    it("returns an Arel::Table using the Cte's name", () => {
      const table = new Nodes.Cte("foo", "bar" as unknown as Node).toTable();

      expect(table).toBeInstanceOf(Table);
      expect(table.name).toBe("foo");
    });
  });
});
