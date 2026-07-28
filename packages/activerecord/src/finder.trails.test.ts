/**
 * Trails-only finder pins (no Rails counterpart test names).
 *
 * Pins the find-path defer-to-bind casting: `find` passes the id raw into
 * `where(primary_key => id)` (Rails core.rb / finder_methods.rb design) and
 * the QueryAttribute bind owns the cast at compile time — so a PK slug like
 * "1-foo" still resolves to id 1 through the bind's IntegerType cast, with no
 * eager pre-cast on the find path.
 */
import { describe, it, expect } from "vitest";
import "./index.js";
import { registerModel } from "./associations.js";
import { fixtures } from "./test-fixtures.js";
import { Post } from "./test-helpers/models/post.js";

registerModel(Post);

describe("FinderTrailsTest", () => {
  const { posts } = fixtures(["posts"]);

  it("find with pk slug string casts through the bind", async () => {
    const welcome = posts("welcome");
    const found = await Post.find("1-foo");
    expect(found.id).toStrictEqual(welcome.id);
  });

  it("find with array of pk slug strings casts through the bind", async () => {
    const welcome = posts("welcome");
    const thinking = posts("thinking");
    const found = (await Post.find(["1-foo", "2-bar"])) as Post[];
    expect(found.map((r) => r.id)).toStrictEqual([welcome.id, thinking.id]);
  });
});
