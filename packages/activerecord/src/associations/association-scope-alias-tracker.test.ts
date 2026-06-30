/**
 * AliasTracker wiring through AssociationScope (task #15).
 *
 * Rails' `AssociationScope#scope` threads an `AliasTracker` through
 * `get_chain` so repeated visits to the same table get distinct
 * aliases. Before this change our `getChain` stored bare `tableName`
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
 *     alias for the repeat `comments` visit.
 *
 * Rides the canonical self-referential `comments` table (Rails'
 * `Comment belongs_to :parent / has_many :children` self-join) instead
 * of a synthetic table; mirrors the aliasing behavior needed by Rails'
 * nested-through cases like `has_many :grandparents, through: :parents,
 * source: :parent` where self-joins are common.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { Base, registerModel } from "../index.js";
import { AssociationScope } from "./association-scope.js";
import { AliasTracker } from "./alias-tracker.js";
import { setupFixtures } from "../test-helpers/fixtures.js";
import { useHandlerTransactionalFixtures } from "../test-helpers/use-handler-transactional-fixtures.js";

describe("AssociationScope — AliasTracker aliases repeated tables", () => {
  setupFixtures();
  useHandlerTransactionalFixtures();

  // Rides the canonical `comments` table, which carries `parent_id` for
  // Rails' self-referential `Comment belongs_to :parent` / `has_many
  // :children`. A test-local class lets us add the self-through
  // `grandchildren` chain the AliasTracker repeat-visit path needs.
  class AtComment extends Base {
    static {
      this._tableName = "comments";

      // Self-referential chain whose tail visits the same `comments`
      // table the owning klass seeds the tracker with — the branch
      // `getChain` needs in order to trigger `aliasedTableFor`'s
      // repeat-visit alias path.
      this.hasMany("children", {
        className: "AtComment",
        foreignKey: "parent_id",
      });
      this.hasMany("grandchildren", {
        className: "AtComment",
        through: "children",
        source: "children",
      });
    }
  }

  beforeAll(() => {
    registerModel("AtComment", AtComment);
  });

  it("AliasTracker: bare table on first visit, aliased on repeat, thunk only invoked on repeat", () => {
    // Seed with an unrelated table so the first comments visit is
    // genuinely the first — `AliasTracker.create` sets the seed's
    // count to 1, which would otherwise trip the repeat branch.
    const tracker = AliasTracker.create(null, "unrelated", []);
    let thunkInvocations = 0;
    const candidate = () => {
      thunkInvocations++;
      return "comments_alias";
    };
    const t1 = tracker.aliasedTableFor(AtComment.arelTable, candidate);
    expect(t1.name).toBe("comments");
    expect(thunkInvocations).toBe(0);

    const t2 = tracker.aliasedTableFor(AtComment.arelTable, candidate);
    expect(t2.name).not.toBe("comments");
    expect(thunkInvocations).toBe(1);
  });

  it("AssociationScope aliases the repeat at_users visit in the emitted chain", () => {
    // `grandchildren` chains through `children` whose klass is also
    // AtComment — so the tail reflection's klass.arelTable.name matches
    // the scope seed. The tracker's repeat branch fires and the
    // chain tail's ReflectionProxy gets an aliased table.
    const refl = (AtComment as any)._reflectOnAssociation("grandchildren");
    const chain = refl.chain;
    // Rails-style chain: the flattened list, tail contains the
    // through step whose klass is AtComment.
    expect(chain.length).toBeGreaterThan(1);

    // Build the scope and inspect the second chain entry's aliased
    // table directly via a subclassed AssociationScope that exposes
    // `getChain`. Going through the private is the only way to
    // observe this without end-to-end query execution (whose
    // correctness depends on orthogonal chain-expansion work —
    // task #21).
    class TestScope extends AssociationScope {
      public runGetChain(reflection: any) {
        const tracker = AliasTracker.create(null, reflection.klass.arelTable.name, []);
        return this.getChain(reflection, tracker);
      }
    }
    const builtChain = new TestScope(() => null).runGetChain(refl);
    expect(builtChain.length).toBe(chain.length);
    // The head entry is the original reflection (no aliasedTable).
    // The tail's first proxy visits comments again and must be
    // aliased — not the bare "comments".
    const tailAliased = (builtChain[1] as any).aliasedTable;
    const aliasedName: string =
      typeof tailAliased === "string" ? tailAliased : (tailAliased?.name ?? "");
    expect(aliasedName).not.toBe("comments");
    // Rails' `AbstractReflection#alias_candidate(name)` composes
    // `<pluralName>_<name>` — our `aliasCandidate` matches. For
    // `children.grandchildren` the alias is `children_grandchildren`.
    expect(aliasedName).toBe("children_grandchildren");
  });

  it("emits the repeat at_users visit as a real table aliased in the JOIN, not a bare alias", () => {
    // Regression pin: the chain tail's ReflectionProxy holds an Arel
    // TableAlias (`comments` aliased to `children_grandchildren`).
    // nextChainScope must render the JOIN as `INNER JOIN "comments"
    // "children_grandchildren"` and qualify the ON columns with the
    // alias — NOT flatten the TableAlias to `INNER JOIN
    // "children_grandchildren"`, which references a non-existent table.
    const refl = (AtComment as any)._reflectOnAssociation("grandchildren");
    const owner = new AtComment({ parent_id: 3 });
    (owner as any).id = 3;
    const sql = (
      AssociationScope.scope({ owner, reflection: refl, klass: refl.klass }) as any
    ).toSql();
    // Real table preserved as the join target, with the alias following it.
    expect(sql).toMatch(/INNER JOIN\s+["`]comments["`]\s+["`]children_grandchildren["`]/i);
    // ON-clause columns qualified by the alias, not a bare "comments".
    expect(sql).toMatch(/["`]children_grandchildren["`]\.["`]parent_id["`]/);
  });
});
