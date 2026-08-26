import { describe, it, expect } from "vitest";
import { fakeRecordConnection } from "../test-helpers/connection.js";
import { Table, Nodes, Visitors } from "../index.js";
import type { ArelConnection } from "../visitors/connection.js";
import type { ArelEngine } from "./node.js";
import { uniq } from "../test-helpers/uniq.js";

describe("Arel", () => {
  describe("equality", () => {
    describe("backwards compat", () => {
      describe("to_sql", () => {
        it("takes an engine", () => {
          let quoteCount = 0;
          const connection: ArelConnection = {
            ...fakeRecordConnection,
            quote(value: unknown): string {
              quoteCount += 1;
              return fakeRecordConnection.quote(value);
            },
            quoteColumnName(name: string): string {
              quoteCount += 1;
              return fakeRecordConnection.quoteColumnName(name);
            },
            quoteTableName(name: string): string {
              quoteCount += 1;
              return fakeRecordConnection.quoteTableName(name);
            },
          };
          const engine: ArelEngine = { connection: { visitor: new Visitors.ToSql(connection) } };

          const attr = new Table("users").get("id");
          const test = attr.eq(10);
          test.toSql(engine);
          expect(quoteCount).toBe(3);
        });
      });
    });

    describe("or", () => {
      it("makes an OR node", () => {
        const attr = new Table("users").get("id");
        const left = attr.eq(10);
        const right = attr.eq(11);
        const node = left.or(right);
        expect((node.expr as Nodes.Or).left).toBe(left);
        expect((node.expr as Nodes.Or).right).toBe(right);
      });
    });

    describe("and", () => {
      it("makes and AND node", () => {
        const attr = new Table("users").get("id");
        const left = attr.eq(10);
        const right = attr.eq(11);
        const node = left.and(right);
        expect(node.left).toBe(left);
        expect(node.right).toBe(right);
      });
    });

    it("is equal with equal ivars", () => {
      const array = [new Nodes.Equality("foo", "bar"), new Nodes.Equality("foo", "bar")];
      expect(uniq(array).length).toBe(1);
    });

    it("is not equal with different ivars", () => {
      const array = [new Nodes.Equality("foo", "bar"), new Nodes.Equality("foo", "baz")];
      expect(uniq(array).length).toBe(2);
    });
  });
});
