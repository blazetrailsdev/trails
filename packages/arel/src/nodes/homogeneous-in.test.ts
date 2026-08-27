import { describe, it, expect } from "vitest";
import { fakeRecordConnection } from "../test-helpers/connection.js";
import { Table, Nodes, Visitors } from "../index.js";
import { StringType } from "@blazetrails/activemodel";

const STRING_TYPE = new StringType();
const fakePgCaster = { typeForAttribute: () => STRING_TYPE };

class TypedNode extends Nodes.NamedFunction {
  readonly typeCaster: unknown;

  constructor(name: string, expr: Nodes.Node[], type: unknown) {
    super(name, expr, undefined);
    this.typeCaster = type;
  }
}

describe("Arel::Nodes::HomogeneousInTest", () => {
  const users = new Table("users", { typeCaster: fakePgCaster });
  it("in", () => {
    const node = new Nodes.HomogeneousIn(["Bobby", "Robert"], users.get("name"), "in");
    const sql = new Visitors.ToSql(fakeRecordConnection).compile(node);
    expect(sql).toBe('"users"."name" IN (?, ?)');
  });

  it("custom attribute node", () => {
    const node = new TypedNode("COALESCE", [users.get("nickname"), users.get("name")], STRING_TYPE);
    const expr = new Nodes.HomogeneousIn(["Bobby", "Robert"], node, "in");
    const sql = new Visitors.ToSql(fakeRecordConnection).compile(expr);
    expect(sql).toBe('COALESCE("users"."nickname", "users"."name") IN (?, ?)');
  });
});
