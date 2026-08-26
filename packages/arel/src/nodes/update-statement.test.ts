import { describe, it, expect } from "vitest";
import { Nodes } from "../index.js";
import type { Node } from "./node.js";
import { assertNotSame } from "../test-helpers/assertions.js";
import { uniq } from "../test-helpers/uniq.js";

const words = (...names: string[]): Node[] => names as unknown as Node[];

describe("Arel::Nodes::UpdateStatement", () => {
  describe("#clone", () => {
    it("clones wheres and values", () => {
      const statement = new Nodes.UpdateStatement();
      statement.wheres = words("a", "b", "c");
      statement.values = words("x", "y", "z");

      const dolly = statement.clone();
      expect(dolly.wheres).toEqual(statement.wheres);
      assertNotSame(statement.wheres, dolly.wheres);

      expect(dolly.values).toEqual(statement.values);
      assertNotSame(statement.values, dolly.values);
    });
  });

  describe("equality", () => {
    it("is equal with equal ivars", () => {
      const statement1 = new Nodes.UpdateStatement();
      statement1.relation = "zomg" as unknown as Node;
      statement1.wheres = 2 as unknown as Node[];
      statement1.values = false as unknown as Node[];
      statement1.orders = words("x", "y", "z");
      statement1.limit = 42 as unknown as Node;
      statement1.key = "zomg" as unknown as Node;
      statement1.groups = words("foo");
      statement1.havings = [];
      const statement2 = new Nodes.UpdateStatement();
      statement2.relation = "zomg" as unknown as Node;
      statement2.wheres = 2 as unknown as Node[];
      statement2.values = false as unknown as Node[];
      statement2.orders = words("x", "y", "z");
      statement2.limit = 42 as unknown as Node;
      statement2.key = "zomg" as unknown as Node;
      statement2.groups = words("foo");
      statement2.havings = [];
      const array = [statement1, statement2];
      expect(uniq(array).length).toBe(1);
    });

    it("is not equal with different ivars", () => {
      const statement1 = new Nodes.UpdateStatement();
      statement1.relation = "zomg" as unknown as Node;
      statement1.wheres = 2 as unknown as Node[];
      statement1.values = false as unknown as Node[];
      statement1.orders = words("x", "y", "z");
      statement1.limit = 42 as unknown as Node;
      statement1.key = "zomg" as unknown as Node;
      const statement2 = new Nodes.UpdateStatement();
      statement2.relation = "zomg" as unknown as Node;
      statement2.wheres = 2 as unknown as Node[];
      statement2.values = false as unknown as Node[];
      statement2.orders = words("x", "y", "z");
      statement2.limit = 42 as unknown as Node;
      statement2.key = "wth" as unknown as Node;
      const array = [statement1, statement2];
      expect(uniq(array).length).toBe(2);
    });
  });
});
