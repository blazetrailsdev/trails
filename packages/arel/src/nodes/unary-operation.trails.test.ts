import { describe, it, expect } from "vitest";
import { fakeRecordConnection } from "../test-helpers/connection.js";
import { Table, Nodes, Visitors } from "../index.js";

describe("TestUnaryOperation", () => {
  const users = new Table("users");

  // Mirrors Rails: `visit_Arel_Nodes_UnaryOperation` emits ` #{operator} `
  // verbatim (visitors/to_sql.rb), so internal whitespace in the operator
  // is preserved rather than trimmed.
  it("visitor preserves operator whitespace verbatim", () => {
    const node = new Nodes.UnaryOperation("- ", users.get("age"));
    expect(new Visitors.ToSql(fakeRecordConnection).compile(node)).toBe(' -  "users"."age"');
  });
});
