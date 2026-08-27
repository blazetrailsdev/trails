import { describe, it, expect } from "vitest";
import { fakeRecordConnection } from "../test-helpers/connection.js";
import { Table, Nodes, Visitors } from "../index.js";

describe("TestUnaryOperation", () => {
  const users = new Table("users");

  it("visitor preserves operator whitespace verbatim", () => {
    const node = new Nodes.UnaryOperation("- ", users.get("age"));
    expect(new Visitors.ToSql(fakeRecordConnection).compile(node)).toBe(' -  "users"."age"');
  });
});
