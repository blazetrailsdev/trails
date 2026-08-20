/**
 * `skip_preloading!` is read in exactly one place in Rails — the `exec_queries`
 * preload guard (`relation.rb:1414`, `preload_associations(records) unless
 * skip_preloading_value`). trails ported the writer
 * (`query_methods.rb:1513-1514`) but not the read, so the flag was inert: a
 * relation that asked not to preload still issued every preload query. Rails'
 * own coverage (`relation_test.rb:414`, `relation/mutation_test.rb:133`)
 * asserts the writer only, so nothing caught it. This pins the effect.
 */
import { describe, it, expect } from "vitest";
import { fixtures } from "./test-fixtures.js";
import "./support/canonical-model-index.js";
import { Author } from "./test-helpers/models/author.js";
import { assertQueriesCount } from "./testing/query-assertions.js";

describe("Relation#exec_queries skip_preloading_value guard", () => {
  fixtures(["authors", "posts"]);

  it("issues no preload query and leaves the association unloaded", async () => {
    const relation = Author.includes(":posts").order("id");
    relation.skipPreloadingBang();

    let authors: Author[] = [];
    await assertQueriesCount(1, false, async () => {
      authors = await relation;
    });

    expect(authors.length).toBeGreaterThan(0);
    expect(authors[0].association("posts").isLoaded()).toBe(false);
  });

  it("preloads when the flag is not set", async () => {
    const authors = await Author.includes(":posts").order("id");

    expect(authors[0].association("posts").isLoaded()).toBe(true);
  });
});
