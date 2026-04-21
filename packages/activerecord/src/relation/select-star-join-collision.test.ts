/**
 * Regression for task #25: `SELECT *` projects all joined tables'
 * columns, and most drivers (better-sqlite3, pg's default mapper)
 * collapse same-named columns into a single key per row — last
 * write wins. For a `has_many :through source: belongsTo` like
 * `User.friends through: friendships source: friend`, the join's
 * target is the same `users` table, but `friendships` also has its
 * own `id` column. Without an explicit projection, `friendships.id`
 * silently overwrites `users.id` in the row hash, and the hydrated
 * record carries the friendship's id with the friend's other
 * columns.
 *
 * Fix: default projection is always `<target>.*` — matches Rails'
 * `Relation#build_select` at query_methods.rb:1909, which projects
 * `table[Arel.star]` unconditionally. Relations with a custom
 * `from()` source still emit the qualified projection (Rails
 * behavior); callers who want bare `*` there override with
 * `.select("*")`.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { Base, registerModel } from "../index.js";
import { Associations, loadHasMany } from "../associations.js";
import { createTestAdapter } from "../test-adapter.js";
import type { DatabaseAdapter } from "../adapter.js";

describe("SELECT * column collision in joined relations", () => {
  let adapter: DatabaseAdapter;

  class SsjUser extends Base {
    static {
      this._tableName = "ssj_users";
      this.attribute("name", "string");
    }
  }
  class SsjFriendship extends Base {
    static {
      this._tableName = "ssj_friendships";
      this.attribute("ssj_user_id", "integer");
      this.attribute("ssj_friend_id", "integer");
    }
  }

  beforeEach(() => {
    adapter = createTestAdapter();
    SsjUser.adapter = adapter;
    SsjFriendship.adapter = adapter;
    registerModel("SsjUser", SsjUser);
    registerModel("SsjFriendship", SsjFriendship);
    (SsjUser as any)._associations = [];
    (SsjUser as any)._reflections = {};
    (SsjFriendship as any)._associations = [];
    (SsjFriendship as any)._reflections = {};

    Associations.hasMany.call(SsjUser, "friendships", {
      className: "SsjFriendship",
      foreignKey: "ssj_user_id",
    });
    Associations.belongsTo.call(SsjFriendship, "friend", {
      className: "SsjUser",
      foreignKey: "ssj_friend_id",
    });
    Associations.hasMany.call(SsjUser, "friends", {
      className: "SsjUser",
      through: "friendships",
      source: "friend",
    });
  });

  it("hydrates the target's columns, not the join table's, when ids collide", async () => {
    const a = await SsjUser.create({ name: "a" });
    const b = await SsjUser.create({ name: "b" });
    // Friendship id will land at 1 (first row in ssj_friendships),
    // shadowing users.id=1 (alice) if the projection is `*` — the
    // result row's `id` key would be the friendship's id, not the
    // friend's. The friend we expect (b) has user.id=2.
    await SsjFriendship.create({ ssj_user_id: a.id, ssj_friend_id: b.id });

    const reflection = (SsjUser as any)._reflectOnAssociation("friends");
    const friends = await loadHasMany(a, "friends", reflection.options);
    expect(friends.map((u: any) => ({ id: u.id, name: u.name }))).toEqual([
      { id: b.id, name: "b" },
    ]);
  });

  it("default projection is `<target>.*` always (matches Rails — never bare `*`)", async () => {
    // Always-qualified projection matches Rails'
    // `klass.arel_table[Arel.star]`. Holds with or without joins
    // so the no-joins case isn't a special case the user has to
    // know about.
    const noJoins = (SsjUser as any).all().toSql();
    expect(noJoins).toMatch(/SELECT\s+"ssj_users"\.\*/i);
    expect(noJoins).not.toMatch(/SELECT\s+\*/i);

    const withJoins = (SsjUser as any).all().joins("INNER JOIN ssj_friendships ON 1 = 1").toSql();
    expect(withJoins).toMatch(/SELECT\s+"ssj_users"\.\*/i);
  });

  it("keeps qualified projection even when from() replaces the FROM source (Rails behavior)", async () => {
    // Rails' `Relation#build_select` (query_methods.rb:1909)
    // projects `table[Arel.star]` unconditionally — it doesn't
    // special-case `from()`. The resulting SQL is the caller's
    // responsibility: if the custom FROM source doesn't expose
    // the target table name, the caller overrides with
    // `.select("*")`. We match Rails here rather than silently
    // downgrading to bare `*`.
    const sql = (SsjUser as any).all().from("(SELECT * FROM ssj_users) AS sub").toSql();
    expect(sql).toMatch(/SELECT\s+"ssj_users"\.\*/i);
  });
});
