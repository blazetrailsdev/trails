/**
 * Trails-only surface: `CollectionProxy#replace` used to be
 * `clear()` + `push()`, so every record common to the old and the new set was
 * removed and re-added — firing remove/add callbacks and rewriting rows Rails
 * leaves alone. Rails' `CollectionAssociation#replace`
 * (collection_association.rb:242) diffs instead. There is no Rails test that
 * pins the *absence* of those callbacks (Ruby never had the divergence), so the
 * regression coverage lives here.
 */
import { describe, it, expect } from "vitest";
import { registerModel } from "../index.js";
import { fixtures } from "../test-helpers/fixtures.js";
import { Author } from "../test-helpers/models/author.js";
import { Post } from "../test-helpers/models/post.js";
import { Person } from "../test-helpers/models/person.js";
import { Reader } from "../test-helpers/models/reader.js";

registerModel(Author);
registerModel(Post);
registerModel(Person);
registerModel(Reader);

describe("collection replace diffs instead of clearing", () => {
  const { authors, posts, people } = fixtures(["authors", "posts", "people", "readers"]);

  it("leaves records common to the old and new target untouched", async () => {
    const author = await Author.find(authors("david").id);
    const current = await author.postsWithCallbacks;
    expect(current.length).toBeGreaterThan(1);
    const [dropped, ...kept] = current;

    author.postLog = [];
    await author.postsWithCallbacks.replace(kept);

    expect(author.postLog).toEqual([`before_removing${dropped.id}`, `after_removing${dropped.id}`]);
  });

  it("adds only the records the new target gained", async () => {
    const author = await Author.find(authors("david").id);
    const current = await author.postsWithCallbacks;
    const incoming = (await Post.where({ author_id: authors("mary").id }))[0];

    author.postLog = [];
    await author.postsWithCallbacks.replace([...current, incoming]);

    expect(author.postLog).toEqual([`before_adding${incoming.id}`, `after_adding${incoming.id}`]);
  });

  it("creates one join row per occurrence for has_many :through", async () => {
    const post = await Post.find(posts("thinking").id);
    const david = await Person.find(people("david").id);

    await post.people.replace([david]);
    const afterOne = await Reader.where({ post_id: post.id }).count();
    await post.people.replace([david, david]);

    expect(await Reader.where({ post_id: post.id }).count()).toBe(Number(afterOne) + 1);
  });
});
