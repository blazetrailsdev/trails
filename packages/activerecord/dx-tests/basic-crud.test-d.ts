import { describe, it, expectTypeOf, assertType } from "vitest";
import { Base, Relation } from "@blazetrails/activerecord";

// Scenario: an app that models users — the ActiveRecord onboarding path.
// Someone reading the Rails guide should be able to write this verbatim.
class User extends Base {
  declare name: string;
  declare email: string;

  static {
    this.tableName = "users";
    this.attribute("name", "string");
    this.attribute("email", "string");
    this.validates("email", { presence: true });
  }
}

describe("basic CRUD DX — defining and using a model", () => {
  it("declaring a model with attribute() and validates() returns void side-effects", () => {
    expectTypeOf<ReturnType<typeof Base.attribute>>().toEqualTypeOf<void>();
    expectTypeOf<ReturnType<typeof Base.validates>>().toEqualTypeOf<void>();
  });

  it("instantiating a model preserves declared property types", () => {
    const u = new User({ name: "dean", email: "d@example.com" });
    expectTypeOf(u).toEqualTypeOf<User>();
    expectTypeOf(u.name).toBeString();
    expectTypeOf(u.email).toBeString();
  });

  it("User.create returns a Promise<Base> (should narrow to User — known gap)", () => {
    expectTypeOf(User.create).returns.resolves.toEqualTypeOf<Base>();
  });

  it("User.create(attrs) accepts a Record<string, unknown>", () => {
    assertType<Promise<Base>>(User.create({ name: "dean", email: "d@example.com" }));
  });

  it("User.find(id) resolves to a single User", async () => {
    const u = await User.find(1);
    expectTypeOf(u).toEqualTypeOf<User>();
  });

  it("User.find([ids]) returns User | User[] — caller narrows (CPK ambiguity)", async () => {
    // For simple primary keys `find([1,2,3])` returns User[] at runtime.
    // For composite keys `find([shop_id, id])` returns a single User.
    // TS can't statically inspect `primaryKey`, so the return is a union.
    const users = await User.find([1, 2, 3]);
    expectTypeOf(users).toEqualTypeOf<User | User[]>();
  });

  it("User.findBy / findByBang have concrete Base returns", () => {
    expectTypeOf(User.findBy).returns.resolves.toEqualTypeOf<Base | null>();
    expectTypeOf(User.findByBang).returns.resolves.toEqualTypeOf<Base>();
  });

  it("User.count / exists / pluck have concrete return types", () => {
    expectTypeOf(User.count).returns.resolves.toBeNumber();
    expectTypeOf(User.exists).returns.resolves.toBeBoolean();
    expectTypeOf(User.pluck).returns.resolves.toEqualTypeOf<unknown[]>();
  });

  it("awaiting a typed Relation<User> resolves to User[]", async () => {
    const rel = {} as Relation<User>;
    const rows = await rel;
    expectTypeOf(rows).toEqualTypeOf<User[]>();
  });

  it("Relation#find / findBy / first keep the generic T", async () => {
    const rel = {} as Relation<User>;
    expectTypeOf(await rel.find(1)).toEqualTypeOf<User>();
    expectTypeOf(await rel.find([1, 2])).toEqualTypeOf<User[]>();
    expectTypeOf(await rel.findBy({ email: "d@example.com" })).toEqualTypeOf<User | null>();
    expectTypeOf(await rel.first()).toEqualTypeOf<User | null>();
    expectTypeOf(await rel.first(5)).toEqualTypeOf<User[]>();
  });

  it("persistence methods on an instance return Promises and sensible scalars", () => {
    const u = new User({ name: "dean" });
    expectTypeOf(u.save).returns.resolves.toBeBoolean();
    expectTypeOf(u.destroy).returns.toBeObject();
    expectTypeOf(u.isNewRecord()).toBeBoolean();
    expectTypeOf(u.isPersisted()).toBeBoolean();
  });

  it("serialization methods expose a JSON-ish shape", () => {
    const u = new User({ name: "dean", email: "d@example.com" });
    expectTypeOf(u.toJson()).toBeString();
    expectTypeOf(u.asJson()).toEqualTypeOf<Record<string, unknown>>();
    expectTypeOf(u.attributes).toEqualTypeOf<Record<string, unknown>>();
  });

  it("update / updateBang exist on the instance with attrs bag", () => {
    const u = new User();
    assertType<Promise<boolean>>(u.update({ name: "dean2" }));
    assertType<Promise<true>>(u.updateBang({ name: "dean2" }));
  });

  it("tableName configured in `static {}` is a string accessor", () => {
    expectTypeOf(User.tableName).toBeString();
  });
});
