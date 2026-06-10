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
import { describe, it, expect, beforeAll } from "vitest";
import { registerModel } from "../index.js";
import { loadHasManyThrough } from "../associations.js";
import { defineSchema } from "../test-helpers/define-schema.js";
import { setupHandlerSuite } from "../test-helpers/setup-handler-suite.js";
import { useHandlerTransactionalFixtures } from "../test-helpers/use-handler-transactional-fixtures.js";
import { TEST_SCHEMA } from "../test-helpers/test-schema.js";
import { Person } from "../test-helpers/models/person.js";
import { Friendship } from "../test-helpers/models/friendship.js";
import { quoteTableName, escapeRegExp } from "../test-helpers/quote-regex.js";

setupHandlerSuite();
useHandlerTransactionalFixtures();

describe("SELECT * column collision in joined relations", () => {
  beforeAll(async () => {
    // Canonical `friendships` carries its own `id` and joins `people` back to
    // `people` (self-referential through), so `Person.followers` is exactly the
    // shape that triggers the id-shadowing bug. `dropExisting` rebuilds both
    // tables from the canonical schema so a sibling file's reduced `people`
    // shape can't survive into this suite.
    await defineSchema(
      {
        people: TEST_SCHEMA.people,
        friendships: TEST_SCHEMA.friendships,
      },
      { dropExisting: true },
    );
    // Person self-registers on import; Friendship does not.
    registerModel(Friendship);
  });

  it("hydrates the target's columns, not the join table's, when ids collide", async () => {
    const a = await Person.create({ first_name: "a" });
    const b = await Person.create({ first_name: "b" });
    // Friendship id will land at 1 (first row in friendships), shadowing
    // people.id=1 (a) if the projection is `*` — the result row's `id` key
    // would be the friendship's id, not the follower's. a.followers joins
    // friendships (friend_id = a.id) to its follower (b, people.id=2).
    await Friendship.create({ friend_id: a.id, follower_id: b.id });

    const reflection = (Person as any)._reflectOnAssociation("followers");
    const followers = await loadHasManyThrough(a, "followers", reflection.options);
    expect(followers.map((p: any) => ({ id: p.id, first_name: p.first_name }))).toEqual([
      { id: b.id, first_name: "b" },
    ]);
  });

  it("default projection is `<target>.*` always (matches Rails — never bare `*`)", async () => {
    // Always-qualified projection matches Rails'
    // `klass.arel_table[Arel.star]`. Holds with or without joins
    // so the no-joins case isn't a special case the user has to
    // know about.
    const qPeople = escapeRegExp(quoteTableName("people"));
    const noJoins = (Person as any).all().toSql();
    expect(noJoins).toMatch(new RegExp(`SELECT\\s+${qPeople}\\.\\*`, "i"));
    expect(noJoins).not.toMatch(/SELECT\s+\*/i);

    const withJoins = (Person as any).all().joins("INNER JOIN friendships ON 1 = 1").toSql();
    expect(withJoins).toMatch(new RegExp(`SELECT\\s+${qPeople}\\.\\*`, "i"));
  });

  it("keeps qualified projection even when from() replaces the FROM source (Rails behavior)", async () => {
    // Rails' `Relation#build_select` (query_methods.rb:1909)
    // projects `table[Arel.star]` unconditionally — it doesn't
    // special-case `from()`. The resulting SQL is the caller's
    // responsibility: if the custom FROM source doesn't expose
    // the target table name, the caller overrides with
    // `.select("*")`. We match Rails here rather than silently
    // downgrading to bare `*`.
    const sql = (Person as any).all().from("(SELECT * FROM people) AS sub").toSql();
    expect(sql).toMatch(
      new RegExp(`SELECT\\s+${escapeRegExp(quoteTableName("people"))}\\.\\*`, "i"),
    );
  });
});
