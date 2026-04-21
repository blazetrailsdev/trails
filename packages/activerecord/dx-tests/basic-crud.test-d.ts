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

  it("User.create / createBang / new resolve to a User (polymorphic `this`)", async () => {
    const u = await User.create({ name: "dean", email: "d@example.com" });
    expectTypeOf(u).toEqualTypeOf<User>();
    const u2 = await User.createBang({ name: "x" });
    expectTypeOf(u2).toEqualTypeOf<User>();
    expectTypeOf(User.new({ name: "y" })).toEqualTypeOf<User>();
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

  it("User.findBy / findByBang / findSoleBy resolve to User (nullable variant for findBy)", async () => {
    expectTypeOf(await User.findBy({ email: "d@example.com" })).toEqualTypeOf<User | null>();
    expectTypeOf(await User.findByBang({ email: "d@example.com" })).toEqualTypeOf<User>();
    expectTypeOf(await User.findSoleBy({ email: "d@example.com" })).toEqualTypeOf<User>();
    expectTypeOf(await User.findByAttribute("name", "dean")).toEqualTypeOf<User | null>();
  });

  it("ordinal + cardinality finders all carry User through", async () => {
    expectTypeOf(await User.first()).toEqualTypeOf<User | null>();
    expectTypeOf(await User.first(5)).toEqualTypeOf<User[]>();
    expectTypeOf(await User.firstBang()).toEqualTypeOf<User>();
    expectTypeOf(await User.last()).toEqualTypeOf<User | null>();
    expectTypeOf(await User.last(5)).toEqualTypeOf<User[]>();
    expectTypeOf(await User.lastBang()).toEqualTypeOf<User>();
    expectTypeOf(await User.take()).toEqualTypeOf<User | null>();
    expectTypeOf(await User.take(3)).toEqualTypeOf<User[]>();
    expectTypeOf(await User.sole()).toEqualTypeOf<User>();
    expectTypeOf(await User.second()).toEqualTypeOf<User | null>();
    expectTypeOf(await User.third()).toEqualTypeOf<User | null>();
    expectTypeOf(await User.fortyTwo()).toEqualTypeOf<User | null>();
    expectTypeOf(await User.secondToLast()).toEqualTypeOf<User | null>();
  });

  it("findSigned / findSignedBang and underscore aliases carry User through", async () => {
    expectTypeOf(await User.findSigned("tok")).toEqualTypeOf<User | null>();
    expectTypeOf(await User.findSignedBang("tok")).toEqualTypeOf<User>();
    expectTypeOf(await User.first_()).toEqualTypeOf<User>();
    expectTypeOf(await User.last_()).toEqualTypeOf<User>();
    expectTypeOf(await User.take_()).toEqualTypeOf<User>();
    expectTypeOf(await User.findBy_({ name: "dean" })).toEqualTypeOf<User>();
  });

  it("find_or / destroyBy / destroyAll / update / destroy all preserve User", async () => {
    expectTypeOf(await User.findOrCreateBy({ name: "a" })).toEqualTypeOf<User>();
    expectTypeOf(await User.findOrInitializeBy({ name: "a" })).toEqualTypeOf<User>();
    expectTypeOf(await User.createOrFindBy({ name: "a" })).toEqualTypeOf<User>();
    expectTypeOf(await User.createOrFindByBang({ name: "a" })).toEqualTypeOf<User>();
    expectTypeOf(await User.destroyBy({ name: "a" })).toEqualTypeOf<User[]>();
    expectTypeOf(await User.destroyAll()).toEqualTypeOf<User[]>();
    expectTypeOf(await User.update(1, { name: "b" })).toEqualTypeOf<User>();
    expectTypeOf(await User.updateBang(1, { name: "b" })).toEqualTypeOf<User>();
    expectTypeOf(await User.destroy(1)).toEqualTypeOf<User | User[]>();
  });

  it("User.count / exists / pluck have concrete return types", () => {
    // Rails' count returns either a scalar or a grouped hash, depending on
    // whether the active scope has a GROUP BY — signature widened to match
    // Relation#count.
    expectTypeOf(User.count).returns.resolves.toEqualTypeOf<number | Record<string, number>>();
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

  it("dup / clone return `this` and becomes<K> / becomesBang<K> return InstanceType<K>", async () => {
    const u = new User({ name: "dean" });
    expectTypeOf(u.dup()).toEqualTypeOf<User>();
    expectTypeOf(u.clone()).toEqualTypeOf<User>();
    // becomes / becomesBang let you switch model classes (e.g., STI).
    class Admin extends User {}
    expectTypeOf(u.becomes(Admin)).toEqualTypeOf<Admin>();
    expectTypeOf(u.becomesBang(Admin)).toEqualTypeOf<Admin>();
  });

  it("reload() resolves to the same model type", async () => {
    const u = new User({ name: "dean" });
    expectTypeOf(await u.reload()).toEqualTypeOf<User>();
  });

  it("findBySql / asyncFindBySql return User[]", async () => {
    expectTypeOf(await User.findBySql("SELECT * FROM users")).toEqualTypeOf<User[]>();
    expectTypeOf(await User.asyncFindBySql("SELECT * FROM users")).toEqualTypeOf<User[]>();
  });

  it("lifecycle callbacks: `record` is typed as the concrete subclass", () => {
    class WithHooks extends Base {
      declare name: string;
      static {
        this.attribute("name", "string");
        this.beforeSave((record) => {
          expectTypeOf(record).toEqualTypeOf<WithHooks>();
          expectTypeOf(record.name).toBeString();
        });
        this.afterCreate((record) => {
          expectTypeOf(record).toEqualTypeOf<WithHooks>();
        });
        this.beforeValidation((record) => {
          expectTypeOf(record).toEqualTypeOf<WithHooks>();
        });
        this.aroundSave((record, proceed) => {
          expectTypeOf(record).toEqualTypeOf<WithHooks>();
          expectTypeOf(proceed).toBeFunction();
          return proceed();
        });
        this.afterCommit((record) => {
          expectTypeOf(record).toEqualTypeOf<WithHooks>();
        });
        // Conditions' `if` / `unless` predicates are typed too.
        this.beforeSave(
          (record) => {
            expectTypeOf(record).toEqualTypeOf<WithHooks>();
          },
          {
            if: (record) => {
              expectTypeOf(record).toEqualTypeOf<WithHooks>();
              return record.name.length > 0;
            },
            unless: (record) => record.name === "skip",
          },
        );
      }
    }
    assertType(WithHooks);
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
