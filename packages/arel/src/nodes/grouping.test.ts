import { describe, it, expect } from "vitest";
import { fakeRecordConnection } from "../test-helpers/connection.js";
import { Nodes, Visitors } from "../index.js";
import type { Node } from "./node.js";
import { uniq } from "../test-helpers/uniq.js";

describe("GroupingTest", () => {
  describe("equality", () => {
    it("is equal with equal ivars", () => {
      const array = [
        new Nodes.Grouping("foo" as unknown as Node),
        new Nodes.Grouping("foo" as unknown as Node),
      ];
      expect(uniq(array).length).toBe(1);
    });

    it("is not equal with different ivars", () => {
      const array = [
        new Nodes.Grouping("foo" as unknown as Node),
        new Nodes.Grouping("bar" as unknown as Node),
      ];
      expect(uniq(array).length).toBe(2);
    });
  });

  it("should create Equality nodes", () => {
    const grouping = new Nodes.Grouping(new Nodes.Quoted("foo"));
    const sql = new Visitors.ToSql(fakeRecordConnection).compile(grouping.eq("foo"));
    expect(sql).toBe("('foo') = 'foo'");
  });
});
