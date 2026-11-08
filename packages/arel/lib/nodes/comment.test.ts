import { describe, it, expect } from "vitest";
import { Nodes } from "../index.js";
import { uniq } from "../test-helpers/uniq.js";

describe("CommentTest", () => {
  describe("equality", () => {
    it("is equal with equal contents", () => {
      const array = [new Nodes.Comment(["foo"]), new Nodes.Comment(["foo"])];
      expect(uniq(array).length).toBe(1);
    });

    it("is not equal with different contents", () => {
      const array = [new Nodes.Comment(["foo"]), new Nodes.Comment(["bar"])];
      expect(uniq(array).length).toBe(2);
    });
  });
});
