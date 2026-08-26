import { describe, it, expect } from "vitest";
import { Nodes } from "../index.js";
import type { Node } from "./node.js";
import { assertNotSame } from "../test-helpers/assertions.js";
import { uniq } from "../test-helpers/uniq.js";

const words = (...names: string[]): Node => names as unknown as Node;

describe("Arel::Nodes::SelectStatement", () => {
  describe("#clone", () => {
    it("clones cores", () => {
      const statement = new Nodes.SelectStatement(words("a", "b", "c"));

      const dolly = statement.clone();
      expect(dolly.cores).toEqual(statement.cores);
      assertNotSame(statement.cores, dolly.cores);
    });
  });

  describe("equality", () => {
    it("is equal with equal ivars", () => {
      const statement1 = new Nodes.SelectStatement(words("a", "b", "c"));
      statement1.offset = 1 as unknown as Node;
      statement1.limit = 2 as unknown as Node;
      statement1.lock = false as unknown as Node;
      statement1.orders = words("x", "y", "z") as unknown as Node[];
      statement1.with = "zomg" as unknown as Node;
      const statement2 = new Nodes.SelectStatement(words("a", "b", "c"));
      statement2.offset = 1 as unknown as Node;
      statement2.limit = 2 as unknown as Node;
      statement2.lock = false as unknown as Node;
      statement2.orders = words("x", "y", "z") as unknown as Node[];
      statement2.with = "zomg" as unknown as Node;
      const array = [statement1, statement2];
      expect(uniq(array).length).toBe(1);
    });

    it("is not equal with different ivars", () => {
      const statement1 = new Nodes.SelectStatement(words("a", "b", "c"));
      statement1.offset = 1 as unknown as Node;
      statement1.limit = 2 as unknown as Node;
      statement1.lock = false as unknown as Node;
      statement1.orders = words("x", "y", "z") as unknown as Node[];
      statement1.with = "zomg" as unknown as Node;
      const statement2 = new Nodes.SelectStatement(words("a", "b", "c"));
      statement2.offset = 1 as unknown as Node;
      statement2.limit = 2 as unknown as Node;
      statement2.lock = false as unknown as Node;
      statement2.orders = words("x", "y", "z") as unknown as Node[];
      statement2.with = "wth" as unknown as Node;
      const array = [statement1, statement2];
      expect(uniq(array).length).toBe(2);
    });
  });
});
