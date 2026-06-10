/**
 * Regression for task #25: `SELECT *` projects all joined tables'
 * columns, and most drivers (better-sqlite3, pg's default mapper)
 * collapse same-named columns into a single key per row — last
 * write wins. For a `has_many :through` like canonical
 * `Person.followers through: friendships`, the join's target is the
 * same `people` table, but `friendships` also has its own `id`
 * column. Without an explicit projection, `friendships.id` silently
 * overwrites `people.id` in the row hash, and the hydrated record
 * carries the friendship's id with the follower's other columns.
 *
 * Fix: default projection is always `<target>.*` — matches Rails'
 * `Relation#build_select` at query_methods.rb:1909, which projects
 * `table[Arel.star]` unconditionally. Relations with a custom
 * `from()` source still emit the qualified projection (Rails
 * behavior); callers who want bare `*` there override with
 * `.select("*")`.
 */
import { describe, it, expect } from "vitest";
import { registerModel } from "../index.js";
import { useHandlerFixtures } from "../test-helpers/use-handler-fixtures.js";
import { TEST_SCHEMA } from "../test-helpers/test-schema.js";
import { Person } from "../test-helpers/models/person.js";
import { Friendship } from "../test-helpers/models/friendship.js";
import { quoteTableName, escapeRegExp } from "../test-helpers/quote-regex.js";

// Person self-registers on import; Friendship does not, but `followers`
// (through friendships, source follower) needs it in the registry.
registerModel(Friendship);

describe("SELECT * column collision in joined relations", () => {
  // `useHandlerFixtures` wires setupHandlerSuite + transactional fixtures +
  // fixture seeding in one call; `schema` recreates the canonical `people` /
  // `friendships` tables so a sibling file's reduced shape can't survive in.
  const { people } = useHandlerFixtures(["people", "friendships"], { schema: TEST_SCHEMA });

  it("hydrates the target's columns, not the join table's, when ids collide", async () => {
    // friendships("Connection 1"): id=1, friend_id=michael(1), follower_id=david(2).
    // michael.followers joins friendships (friend_id = michael.id=1) to its
    // follower (david, people.id=2). The friendship's id=1 collides with
    // michael's own id=1, so a bare `*` projection would hydrate id=1 (michael)
    // instead of david. Reading `michael.followers` exercises the public
    // CollectionProxy path, which routes this non-nested through association
    // through AssociationScope — the same JOIN/projection path used in production.
    const michael = people("michael");
    const followers = await michael.followers;
    expect(followers.map((p) => ({ id: p.id, first_name: p.first_name }))).toEqual([
      { id: people("david").id, first_name: "David" },
    ]);
  });

  it("default projection is `<target>.*` always (matches Rails — never bare `*`)", () => {
    // Always-qualified projection matches Rails'
    // `klass.arel_table[Arel.star]`. Holds with or without joins
    // so the no-joins case isn't a special case the user has to
    // know about.
    const qPeople = escapeRegExp(quoteTableName("people"));
    const noJoins = Person.all().toSql();
    expect(noJoins).toMatch(new RegExp(`SELECT\\s+${qPeople}\\.\\*`, "i"));
    expect(noJoins).not.toMatch(/SELECT\s+\*/i);

    const withJoins = Person.all().joins("INNER JOIN friendships ON 1 = 1").toSql();
    expect(withJoins).toMatch(new RegExp(`SELECT\\s+${qPeople}\\.\\*`, "i"));
  });

  it("keeps qualified projection even when from() replaces the FROM source (Rails behavior)", () => {
    // Rails' `Relation#build_select` (query_methods.rb:1909)
    // projects `table[Arel.star]` unconditionally — it doesn't
    // special-case `from()`. The resulting SQL is the caller's
    // responsibility: if the custom FROM source doesn't expose
    // the target table name, the caller overrides with
    // `.select("*")`. We match Rails here rather than silently
    // downgrading to bare `*`.
    const sql = Person.all().from("(SELECT * FROM people) AS sub").toSql();
    expect(sql).toMatch(
      new RegExp(`SELECT\\s+${escapeRegExp(quoteTableName("people"))}\\.\\*`, "i"),
    );
  });
});
