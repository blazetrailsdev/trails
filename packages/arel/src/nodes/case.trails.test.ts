// Trails-only cases with no Rails counterpart in
// `vendor/rails/activerecord/test/cases/arel/nodes/case_test.rb`. `Case#then`
// (case.rb:20-23) is untested upstream, and its TS spelling collides with the
// Promise thenable protocol — a hazard Ruby does not have — so the cases that
// pin it live here rather than in the mirrored file (RFC 0122).
import { describe, it, expect } from "vitest";
import { Table, Nodes } from "../index.js";

describe("Case", () => {
  const users = new Table("users");

  describe("#then", () => {
    it("sets the right side of the most recent When clause", () => {
      const node = new Nodes.Case(users.get("status"));
      node.when("active").then("A");
      expect(node.conditions).toHaveLength(1);
      expect(node.conditions[0].right).toBeInstanceOf(Nodes.Quoted);
      expect((node.conditions[0].right as Nodes.Quoted).value).toBe("A");
    });

    it("supports chained when/then", () => {
      const node = new Nodes.Case(users.get("status"));
      node.when("active").then("A").when("pending").then("P").else("Z");
      expect(node.conditions).toHaveLength(2);
      expect((node.conditions[0].right as Nodes.Quoted).value).toBe("A");
      expect((node.conditions[1].right as Nodes.Quoted).value).toBe("P");
    });

    it("throws when called before #when", () => {
      const node = new Nodes.Case(users.get("status"));
      expect(() => node.then("A")).toThrow(/Case#then called before Case#when/);
    });

    it("Promise.resolve rejects rather than hanging (thenable hazard)", async () => {
      const node = new Nodes.Case(users.get("status")).when("active").then("A");
      await expect(Promise.resolve(node)).rejects.toThrow(/not awaitable/);
    });
  });
});
