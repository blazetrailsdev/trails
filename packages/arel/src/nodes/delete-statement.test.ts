import { describe, it, expect } from "vitest";
import { Nodes } from "../index.js";
import type { Node } from "./node.js";
import { assertNotSame } from "../test-helpers/assertions.js";
import { uniq } from "../test-helpers/uniq.js";

const words = (...names: string[]): Node[] => names as unknown as Node[];

describe("Arel::Nodes::DeleteStatement", () => {
  describe("#clone", () => {
    it("clones wheres", () => {
      const statement = new Nodes.DeleteStatement();
      statement.wheres = words("a", "b", "c");

      const dolly = statement.clone();
      expect(dolly.wheres).toEqual(statement.wheres);
      assertNotSame(statement.wheres, dolly.wheres);
    });
  });

  describe("equality", () => {
    it("is equal with equal ivars", () => {
      const statement1 = new Nodes.DeleteStatement();
      statement1.wheres = words("a", "b", "c");
      const statement2 = new Nodes.DeleteStatement();
      statement2.wheres = words("a", "b", "c");
      const array = [statement1, statement2];
      expect(uniq(array).length).toBe(1);
    });

    it("is not equal with different ivars", () => {
      const statement1 = new Nodes.DeleteStatement();
      statement1.wheres = words("a", "b", "c");
      const statement2 = new Nodes.DeleteStatement();
      statement2.wheres = words("1", "2", "3");
      const array = [statement1, statement2];
      expect(uniq(array).length).toBe(2);
    });
  });
});
