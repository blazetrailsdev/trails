import { describe, it, expect, beforeEach } from "vitest";
import {
  Table,
  sql,
  star,
  SelectManager,
  InsertManager,
  UpdateManager,
  DeleteManager,
  Nodes,
  Visitors,
  Collectors,
} from "../index.js";

describe("Arel", () => {
  const users = new Table("users");
  const posts = new Table("posts");
  const visitor = new Visitors.ToSql();

  describe("dispatch-contamination", () => {
    it("dispatches properly after failing upwards", () => {
      class A extends Nodes.Node {
        accept<T>(visitor: Nodes.NodeVisitor<T>): T {
          return visitor.visit(this);
        }
      }
      class B extends Nodes.Node {
        accept<T>(visitor: Nodes.NodeVisitor<T>): T {
          return visitor.visit(this);
        }
      }

      const visitor: Nodes.NodeVisitor<string> = {
        visit(node: Nodes.Node): string {
          if (node instanceof A) throw new Error("nope");
          if (node instanceof B) return "ok";
          return "unknown";
        },
      };

      expect(() => visitor.visit(new A())).toThrow();
      expect(visitor.visit(new B())).toBe("ok");
    });

    it("is threadsafe when implementing superclass fallback", () => {
      const v1 = new Visitors.ToSql();
      const v2 = new Visitors.ToSql();
      const n1 = users.get("id").eq(1);
      const n2 = users.get("id").eq(2);
      expect(v1.compile(n1)).toBe('"users"."id" = 1');
      expect(v2.compile(n2)).toBe('"users"."id" = 2');
    });
  });
});
