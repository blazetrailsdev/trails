import { describe, it, expectTypeOf, assertType } from "vitest";
import { Base } from "@blazetrails/activerecord";

// Scenario: the rough edges a real app will hit — composite keys, enums,
// scopes, transactions, and the permissive attributes bag.

class Widget extends Base {
  declare name: string;

  static {
    this.attribute("name", "string");
  }
}

describe("edge cases — rough edges in current DX", () => {
  it("Widget.where is overloaded: record OR SQL + binds", () => {
    assertType(Widget.where({ name: "a" }));
    assertType(Widget.where("name = ?", "a"));
  });

  it("tableName is a string; primaryKey is string | string[]", () => {
    expectTypeOf(Widget.tableName).toBeString();
    expectTypeOf(Widget.primaryKey).toEqualTypeOf<string | string[]>();
  });

  it("composite primary keys type-check as string[]", () => {
    class Compound extends Base {
      static {
        this.primaryKey = ["tenant_id", "id"];
      }
    }
    expectTypeOf(Compound.primaryKey).toEqualTypeOf<string | string[]>();
  });

  it("new Widget() accepts a permissive attributes bag (Rails parity)", () => {
    assertType(new Widget());
    assertType(new Widget({}));
    assertType(new Widget({ name: "ok" }));
    assertType(new Widget({ totally_unknown_column: 1 }));
  });

  it("subclasses of Base are assignable to typeof Base", () => {
    const ctor: typeof Base = Widget;
    expectTypeOf(ctor).toMatchTypeOf<typeof Base>();
  });

  it("enum() defines a typed mapping (Rails: `enum status: {...}`)", () => {
    class Order extends Base {
      static {
        this.enum("status", { pending: 0, shipped: 1, cancelled: 2 });
      }
    }
    assertType(Order);
    expectTypeOf<ReturnType<typeof Base.enum>>().toEqualTypeOf<void>();
  });

  it("scope() + defaultScope register query macros", () => {
    expectTypeOf(Base.scope).toBeFunction();
    expectTypeOf(Base.defaultScope).toBeFunction();
    expectTypeOf<ReturnType<typeof Base.defaultScope>>().toEqualTypeOf<void>();
  });

  it("validates + validatesAssociated + validatesUniqueness are void-returning", () => {
    expectTypeOf<ReturnType<typeof Base.validates>>().toEqualTypeOf<void>();
    expectTypeOf<ReturnType<typeof Base.validatesAssociated>>().toEqualTypeOf<void>();
    expectTypeOf<ReturnType<typeof Base.validatesUniqueness>>().toEqualTypeOf<void>();
  });

  it("Base.find / Base.all / Base.where preserve the subclass via polymorphic `this`", async () => {
    const w = await Widget.find(1);
    expectTypeOf(w).toEqualTypeOf<Widget>();
    const ws = await Widget.find([1, 2]);
    expectTypeOf(ws).toEqualTypeOf<Widget | Widget[]>();
    expectTypeOf(Widget.all()).toMatchTypeOf<
      import("@blazetrails/activerecord").Relation<Widget>
    >();
    expectTypeOf(Widget.where({ name: "x" })).toMatchTypeOf<
      import("@blazetrails/activerecord").Relation<Widget>
    >();
  });

  it("KNOWN GAP: instance `id` is typed as `unknown`", () => {
    const w = new Widget({ name: "w" });
    expectTypeOf(w.id).toBeUnknown();
  });
});
