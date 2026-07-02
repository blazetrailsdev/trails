import { describe, it, expect } from "vitest";
import { Table, Nodes, Visitors } from "../index.js";
import { Attribute as AMAttribute } from "@blazetrails/activemodel";

describe("Arel::Nodes::HomogeneousInTest", () => {
  const users = new Table("users");
  it("in", () => {
    const node = users.get("id").in([1, 2, 3]);
    const sql = new Visitors.ToSql().compile(node);
    // attr.in([...]) creates an In node with Quoted values — inlined like Rails.
    expect(sql).toBe('"users"."id" IN (1, 2, 3)');
  });

  it("custom attribute node", () => {
    const attr = new Nodes.Attribute(users, "id");
    const node = attr.in([1, 2]);
    const sql = new Visitors.ToSql().compile(node);
    expect(sql).toContain('"users"."id" IN');
  });

  describe("HomogeneousIn visitor", () => {
    it("compiles IN with values", () => {
      const node = new Nodes.HomogeneousIn([1, 2, 3], users.get("id"), "in");
      const sql = new Visitors.ToSql().compile(node);
      // HomogeneousIn keeps add_binds + bind_block (to_sql.rb:352), so a bare
      // SQLString collector emits `?` placeholders — mirrors Rails test_in.
      expect(sql).toBe('"users"."id" IN (?, ?, ?)');
    });

    it("compiles NOT IN with values", () => {
      const node = new Nodes.HomogeneousIn([4, 5], users.get("id"), "notin");
      const sql = new Visitors.ToSql().compile(node);
      expect(sql).toBe('"users"."id" NOT IN (?, ?)');
    });

    it("compiles empty IN as 1=0", () => {
      const node = new Nodes.HomogeneousIn([], users.get("id"), "in");
      const sql = new Visitors.ToSql().compile(node);
      expect(sql).toBe("1=0");
    });

    it("compiles empty NOT IN as 1=1", () => {
      const node = new Nodes.HomogeneousIn([], users.get("id"), "notin");
      const sql = new Visitors.ToSql().compile(node);
      expect(sql).toBe("1=1");
    });

    it("compiles string values", () => {
      const node = new Nodes.HomogeneousIn(["a", "b"], users.get("name"), "in");
      const sql = new Visitors.ToSql().compile(node);
      expect(sql).toBe('"users"."name" IN (?, ?)');
    });
  });

  describe("right (Rails fidelity)", () => {
    it("non-Node values are wrapped as Casted (carrying the attribute) — not bare Quoted", () => {
      const node = new Nodes.HomogeneousIn([1, 2, 3], users.get("id"), "in");
      const right = node.right;
      expect(right).toHaveLength(3);
      for (const r of right) {
        expect(r).toBeInstanceOf(Nodes.Casted);
        expect((r as Nodes.Casted).attribute).toBe(node.attribute);
      }
    });

    it("preserves existing Node values unchanged (build_quoted passthrough)", () => {
      const inner = new Nodes.SqlLiteral("now()");
      const node = new Nodes.HomogeneousIn([inner], users.get("created_at"), "in");
      expect(node.right[0]).toBe(inner);
    });

    it("delegates to attribute.quotedArray when present (host override participates)", () => {
      const calls: unknown[][] = [];
      const fakeAttr = Object.create(users.get("id")) as Nodes.Node & {
        quotedArray?: (vs: unknown[]) => Nodes.Node[];
      };
      fakeAttr.quotedArray = (vs: unknown[]): Nodes.Node[] => {
        calls.push(vs);
        return vs.map((v) => new Nodes.SqlLiteral(String(v)));
      };
      const node = new Nodes.HomogeneousIn([1, 2], fakeAttr, "in");
      expect(node.right.every((r) => r instanceof Nodes.SqlLiteral)).toBe(true);
      expect(calls).toEqual([[1, 2]]);
    });
  });

  describe("castedValues", () => {
    // A fake attribute exposing a type_caster with isSerializable + serialize,
    // mirroring Arel::Attribute#type_caster (an ActiveModel type). castedValues
    // must consult isSerializable (Rails' `type.serializable?`), NOT a
    // non-existent `serializable`.
    const fakeAttr = (typeCaster: unknown): Nodes.Node =>
      ({ name: "id", typeCaster }) as unknown as Nodes.Node;

    it("drops non-serializable values and serializes the rest", () => {
      const attr = fakeAttr({
        isSerializable: (v: unknown) => (v as number) < 100,
        serialize: (v: unknown) => (v as number) * 10,
      });
      const node = new Nodes.HomogeneousIn([1, 250, 3], attr, "in");
      expect(node.castedValues).toEqual([10, 30]);
    });

    it("drops values that serialize to null", () => {
      const attr = fakeAttr({
        isSerializable: () => true,
        serialize: (v: unknown) => (v === 2 ? null : v),
      });
      const node = new Nodes.HomogeneousIn([1, 2, 3], attr, "in");
      expect(node.castedValues).toEqual([1, 3]);
    });

    it("returns raw values when the attribute has no type_caster", () => {
      const node = new Nodes.HomogeneousIn([1, 2, 3], fakeAttr(undefined), "in");
      expect(node.castedValues).toEqual([1, 2, 3]);
    });
  });

  describe("procForBinds", () => {
    it("wraps a value as ActiveModel::Attribute bound to the attribute name", () => {
      const node = new Nodes.HomogeneousIn([1, 2], users.get("id"), "in");
      const bound = node.procForBinds(42);
      expect(bound).toBeInstanceOf(AMAttribute);
      expect((bound as AMAttribute).name).toBe("id");
      // Rails' ActiveModel::Type.default_value is a no-op Value type, so
      // valueForDatabase should round-trip the raw value unchanged.
      expect((bound as AMAttribute).valueForDatabase).toBe(42);
    });

    it("binds successive values to the same attribute", () => {
      const node = new Nodes.HomogeneousIn(["x"], users.get("name"), "in");
      const a = node.procForBinds("a") as AMAttribute;
      const b = node.procForBinds("b") as AMAttribute;
      expect(a.name).toBe("name");
      expect(b.name).toBe("name");
      expect(a.valueForDatabase).toBe("a");
      expect(b.valueForDatabase).toBe("b");
    });
  });
});
