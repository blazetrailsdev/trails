/**
 * Trails-only surface: Rails derives `CollectionProxy`'s delegate-to-scope list
 * by reflection —
 * `[QueryMethods, SpawnMethods].flat_map { |k| k.public_instance_methods(false) }`
 * (collection_proxy.rb:1128-1137). trails reads it off the mixin objects'
 * own keys, which stands in for that reflection but is only as good as the
 * public/private split it filters on. The list has drifted from Rails in both
 * directions before: it omitted the public aliases `left_joins`
 * (query_methods.rb:887) and `without` (query_methods.rb:1585), and it carried
 * `null!`, `rewhere!` and `select!`, none of which Rails or trails defines (the
 * real alias is `_select!`, query_methods.rb:428). Ruby cannot drift this way —
 * the list is computed — so there is no Rails test to mirror and the coverage
 * lives here.
 */
import { describe, it, expect } from "vitest";
import { registerModel } from "../index.js";
import { fixtures } from "../test-fixtures.js";
import { CollectionProxy } from "./collection-proxy.js";
import { Author } from "../test-helpers/models/author.js";
import { Post } from "../test-helpers/models/post.js";
import { Comment } from "../test-helpers/models/comment.js";

registerModel(Author);
registerModel(Post);
registerModel(Comment);

describe("CollectionProxy scope delegation matches QueryMethods", () => {
  const { authors, posts } = fixtures(["authors", "posts", "comments"]);

  it("delegates the public QueryMethods aliases to scope", () => {
    for (const name of ["leftJoins", "without"]) {
      expect(Object.hasOwn(CollectionProxy.prototype, name)).toBe(true);
    }
  });

  it("delegates the QueryMethods bang builders to scope", () => {
    // `- [:select]` (collection_proxy.rb:1130) subtracts only the non-bang
    // reader, so `_select!` (query_methods.rb:428) stays in the delegate set.
    expect(Object.hasOwn(CollectionProxy.prototype, "_selectBang")).toBe(true);
  });

  it("_selectBang runs against the association scope", async () => {
    const author = await Author.find(authors("david").id);
    const proxy = author.posts as unknown as {
      _selectBang(column: string): { selectValues: string[] };
      resetScope(): unknown;
      selectValues: string[];
    };
    const relation = proxy._selectBang("id");

    expect(relation.selectValues).toEqual(["id"]);
    // The delegation routes the mutation at `scope()`, not at the proxy's own
    // relation state — so dropping the memoized scope (`reset_scope`,
    // collection_proxy.rb:1112) drops the select with it.
    proxy.resetScope();
    expect(proxy.selectValues).toEqual([]);
  });

  it("delegates no name QueryMethods does not define", () => {
    for (const name of ["nullBang", "rewhereBang", "selectBang"]) {
      expect(Object.hasOwn(CollectionProxy.prototype, name)).toBe(false);
    }
  });

  // A hydrated PK is a BigInt on some adapters (int8 under MariaDB/PG) and a
  // number on others, while a fixture accessor hands back the raw value, so
  // every id comparison below goes through the same string fold.
  const id = (record: { id: unknown }) => String(record.id);

  it("leftJoins runs against the association scope", async () => {
    const author = await Author.find(authors("david").id);
    const scoped = new Set((await author.posts).map(id));
    const relation = author.posts.leftJoins(":comments");
    const records = await relation;

    expect(scoped.size).toBeGreaterThan(0);
    expect(records.length).toBeGreaterThan(0);
    // Scoped to the owner: every row is one of the author's own posts, which is
    // what the delegation to `scope()` buys. Asserted on ids rather than on the
    // SQL text so the identifier quoting stays adapter-neutral.
    expect(records.every((post: Post) => scoped.has(id(post)))).toBe(true);
    expect(relation.toSql().toLowerCase()).toContain("left outer join");
  });

  it("without runs against the association scope", async () => {
    const author = await Author.find(authors("david").id);
    const excluded = posts("welcome");
    const scoped = new Set((await author.posts).map(id));
    const records = await author.posts.without(excluded);

    expect(scoped.has(id(excluded))).toBe(true);
    expect(records.length).toBeGreaterThan(0);
    expect(records.map(id)).not.toContain(id(excluded));
    expect(records.every((post: Post) => scoped.has(id(post)))).toBe(true);
  });
});
