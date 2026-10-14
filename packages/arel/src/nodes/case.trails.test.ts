import { describe, it, expect } from "vitest";
import { fakeRecordConnection } from "../test-helpers/connection.js";
import { Table, Nodes, Visitors } from "../index.js";

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
      expect(() => node.then("A")).toThrow(TypeError);
    });

    it("renders an undefined #then / #else expression as NULL, as Ruby's nil does", () => {
      const node = new Nodes.Case(users.get("status")).when("a").then(undefined).else(undefined);
      expect((node.conditions[0].right as Nodes.Quoted).isNil()).toBe(true);
      expect(new Visitors.ToSql(fakeRecordConnection).compile(node)).toBe(
        'CASE "users"."status" WHEN \'a\' THEN NULL ELSE NULL END',
      );
    });

    it("is not an await operand the compiler accepts", () => {
      const node = new Nodes.Case(users.get("status")).when("active").then("A");
      async function awaited() {
        // @ts-expect-error TS1320
        await node;
      }
      // @ts-expect-error TS1058
      async function returned() {
        return node;
      }
      expect([awaited, returned]).toHaveLength(2);
    });
  });
});
