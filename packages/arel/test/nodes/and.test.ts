import { describe, it, expect } from "vitest";
import { uniq } from "../support/uniq.js";
import { Nodes } from "../../lib/index.js";

describe("And", () => {
  describe("equality", () => {
    it("is equal with equal ivars", () => {
      const array = [new Nodes.And(["foo", "bar"]), new Nodes.And(["foo", "bar"])];
      expect(uniq(array).length).toBe(1);
    });

    it("is not equal with different ivars", () => {
      const array = [new Nodes.And(["foo", "bar"]), new Nodes.And(["foo", "baz"])];
      expect(uniq(array).length).toBe(2);
    });
  });

  describe("functions as node expression", () => {
    it("allows aliasing", () => {
      const aliased = new Nodes.And(["foo", "bar"]).as("baz");

      expect(aliased).toBeInstanceOf(Nodes.As);
      expect(aliased.right).toBeInstanceOf(Nodes.SqlLiteral);
    });
  });
});
