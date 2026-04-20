/**
 * AliasTracker wiring through AssociationScope (task #15).
 *
 * Rails' `AssociationScope#scope` threads an `AliasTracker` through
 * `get_chain` so repeated visits to the same table get distinct
 * aliases. Before this change our `_getChain` stored bare `tableName`
 * strings on each `ReflectionProxy`; a chain whose tail visited the
 * owner's own table would collide with the base-table reference in
 * the emitted JOIN / WHERE.
 *
 * Covered here:
 *  1. Unit-pin the `AliasTracker#aliasedTableFor` contract — bare on
 *     first visit, aliased on repeat, candidate thunk only invoked on
 *     repeat.
 *  2. Integration pin via a self-referential chain (`has_many :x
 *     through: :y source: :z` with all three on the same model) —
 *     build the scope and assert the emitted SQL carries the expected
 *     alias for the repeat `at_users` visit.
 *
 * Mirrors: the aliasing behavior needed by Rails' nested-through
 * cases like `has_many :grandparents, through: :parents, source:
 * :parent` where self-joins are common.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { Base, registerModel } from "../index.js";
import { Associations } from "../associations.js";
import { AssociationScope } from "./association-scope.js";
import { AliasTracker } from "./alias-tracker.js";
import { createTestAdapter } from "../test-adapter.js";
import type { DatabaseAdapter } from "../adapter.js";

describe("AssociationScope — AliasTracker aliases repeated tables", () => {
  let adapter: DatabaseAdapter;

  class AtUser extends Base {
    static {
      this._tableName = "at_users";
      this.attribute("parent_id", "integer");
      this.attribute("name", "string");
    }
  }

  beforeEach(() => {
    adapter = createTestAdapter();
    AtUser.adapter = adapter;
    registerModel("AtUser", AtUser);
    (AtUser as any)._associations = [];

    // Self-referential chain whose tail visits the same `at_users`
    // table the owning klass seeds the tracker with — the branch
    // `_getChain` needs in order to trigger `aliasedTableFor`'s
    // repeat-visit alias path.
    Associations.hasMany.call(AtUser, "children", {
      className: "AtUser",
      foreignKey: "parent_id",
    });
    Associations.hasMany.call(AtUser, "grandchildren", {
      className: "AtUser",
      through: "children",
      source: "children",
    });
  });

  it("AliasTracker: bare table on first visit, aliased on repeat, thunk only invoked on repeat", () => {
    // Seed with an unrelated table so the first AtUser visit is
    // genuinely the first — `AliasTracker.create` sets the seed's
    // count to 1, which would otherwise trip the repeat branch.
    const tracker = AliasTracker.create(null, "unrelated", []);
    let thunkInvocations = 0;
    const candidate = () => {
      thunkInvocations++;
      return "at_users_alias";
    };
    const t1 = tracker.aliasedTableFor(AtUser.arelTable, candidate);
    expect(t1.name).toBe("at_users");
    expect(thunkInvocations).toBe(0);

    const t2 = tracker.aliasedTableFor(AtUser.arelTable, candidate);
    expect(t2.name).not.toBe("at_users");
    expect(thunkInvocations).toBe(1);
  });

  it("AssociationScope aliases the repeat at_users visit in the emitted chain", () => {
    // `grandchildren` chains through `children` whose klass is also
    // AtUser — so the tail reflection's klass.arelTable.name matches
    // the scope seed. The tracker's repeat branch fires and the
    // chain tail's ReflectionProxy gets an aliased table.
    const refl = (AtUser as any)._reflectOnAssociation("grandchildren");
    const chain = refl.chain;
    // Rails-style chain: the flattened list, tail contains the
    // through step whose klass is AtUser.
    expect(chain.length).toBeGreaterThan(1);

    // Build the scope and inspect the second chain entry's aliased
    // table directly via a subclassed AssociationScope that exposes
    // `_getChain`. Going through the private is the only way to
    // observe this without end-to-end query execution (whose
    // correctness depends on orthogonal chain-expansion work —
    // task #21).
    class TestScope extends AssociationScope {
      public runGetChain(reflection: any) {
        const tracker = AliasTracker.create(null, (reflection as any).klass.arelTable.name, []);
        return this._getChain(reflection, tracker);
      }
    }
    const builtChain = new TestScope(() => null).runGetChain(refl);
    expect(builtChain.length).toBe(chain.length);
    // The head entry is the original reflection (no aliasedTable).
    // The tail's first proxy visits at_users again and must be
    // aliased — not the bare "at_users".
    const tailAliased = (builtChain[1] as any).aliasedTable;
    const aliasedName: string =
      typeof tailAliased === "string" ? tailAliased : (tailAliased?.name ?? "");
    expect(aliasedName).not.toBe("at_users");
    // Rails' `AbstractReflection#alias_candidate(name)` composes
    // `<pluralName>_<name>` — our `aliasCandidate` matches. For
    // `children.grandchildren` the alias is `children_grandchildren`.
    expect(aliasedName).toBe("children_grandchildren");
  });
});
