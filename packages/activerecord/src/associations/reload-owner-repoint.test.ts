// RFC-0022: `reload` re-points each adopted `@association_cache` entry's owner
// back to self (persistence.rb:752). The concrete prerequisite is a settable
// owner on the owner-bound holders — Rails' `Association#owner` is settable;
// our `CollectionProxy` (whose owner lives in its backing `_record`) must
// expose the same. These tests cover the reassignable owner and confirm the
// preloaded-only reload path still resolves associations against the reloaded
// record.

import { describe, it, expect, beforeAll } from "vitest";
import { association, registerModel } from "../index.js";
import { createTestAdapter, type TestDatabaseAdapter } from "../test-adapter.js";
import { defineSchema } from "../test-helpers/define-schema.js";
import { withTransactionalFixtures } from "../test-helpers/with-transactional-fixtures.js";
import { TEST_SCHEMA } from "../test-helpers/test-schema.js";
import { Author } from "../test-helpers/models/author.js";
import { Post } from "../test-helpers/models/post.js";

describe("reload — association owner re-point", () => {
  let adapter: TestDatabaseAdapter;

  beforeAll(async () => {
    adapter = createTestAdapter();
    Author.adapter = adapter;
    Post.adapter = adapter;
    registerModel(Author);
    registerModel(Post);
    await defineSchema(adapter, {
      authors: TEST_SCHEMA.authors,
      posts: TEST_SCHEMA.posts,
    });
  });
  withTransactionalFixtures(() => adapter);

  it("exposes a reassignable owner on CollectionProxy", async () => {
    const first = await Author.create({ name: "first" });
    const second = await Author.create({ name: "second" });
    const proxy = association<Post>(first, "posts");
    expect(proxy.owner).toBe(first);

    proxy.owner = second;
    expect(proxy.owner).toBe(second);
  });

  // The preloaded-only path (`_findRecord` populates only the `preloaded`
  // facet) leaves the `instances`/`proxies` facets empty, so reload's owner
  // re-point loops are a no-op here by design — they are future-proofing for a
  // fetch that adopts owner-bound holders. This asserts the path stays correct
  // (associations re-resolve against the reloaded record); the setter itself is
  // covered directly above.
  it("resolves associations against the reloaded record after reload", async () => {
    const author = await Author.create({ name: "Dev" });
    await Post.create({ title: "a", body: "a", author_id: author.id as number });
    await Post.create({ title: "b", body: "b", author_id: author.id as number });

    const before = association<Post>(author, "posts");
    await before.load();
    expect(before.target.length).toBe(2);

    await author.reload();

    const after = association<Post>(author, "posts");
    expect(after.owner).toBe(author);
    await after.load();
    expect(after.target.length).toBe(2);
  });
});
