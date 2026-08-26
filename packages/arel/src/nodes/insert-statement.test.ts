import { describe, it, expect } from "vitest";
import { Nodes } from "../index.js";
import type { Node } from "./node.js";
import { assertNotSame } from "../test-helpers/assertions.js";
import { uniq } from "../test-helpers/uniq.js";

const words = (...names: string[]): Node[] => names as unknown as Node[];

describe("Arel::Nodes::InsertStatement", () => {
  describe("#clone", () => {
    it("clones columns and values", () => {
      const statement = new Nodes.InsertStatement();
      statement.columns = words("a", "b", "c");
      statement.values = words("x", "y", "z") as unknown as Node;

      const dolly = statement.clone();
      expect(dolly.columns).toEqual(statement.columns);
      expect(dolly.values).toEqual(statement.values);

      assertNotSame(statement.columns, dolly.columns);
      assertNotSame(statement.values, dolly.values);
    });
  });

  describe("equality", () => {
    it("is equal with equal ivars", () => {
      const statement1 = new Nodes.InsertStatement();
      statement1.columns = words("a", "b", "c");
      statement1.values = words("x", "y", "z") as unknown as Node;
      const statement2 = new Nodes.InsertStatement();
      statement2.columns = words("a", "b", "c");
      statement2.values = words("x", "y", "z") as unknown as Node;
      const array = [statement1, statement2];
      expect(uniq(array).length).toBe(1);
    });

    it("is not equal with different ivars", () => {
      const statement1 = new Nodes.InsertStatement();
      statement1.columns = words("a", "b", "c");
      statement1.values = words("x", "y", "z") as unknown as Node;
      const statement2 = new Nodes.InsertStatement();
      statement2.columns = words("a", "b", "c");
      statement2.values = words("1", "2", "3") as unknown as Node;
      const array = [statement1, statement2];
      expect(uniq(array).length).toBe(2);
    });
  });
});
