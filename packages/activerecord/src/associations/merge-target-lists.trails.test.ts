/**
 * Trails-only: `merge_target_lists` (collection_association.rb:335-352) is a
 * private method with no dedicated Rails test — its contract lives in the
 * comment above it, and the third and fourth bullets ("Any changes made to
 * attributes on objects in the memory array are to be preserved" / "Otherwise,
 * attributes should have the value found in the database") are what the
 * `attribute_names & ... - changed_attribute_names_to_save - _attr_readonly`
 * write-back loop implements. Trails shipped the merge without that loop, so a
 * clean in-memory attribute kept its stale value after a reload; these pin both
 * halves through the OO association, which is where the merge happens.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { registerModel } from "../index.js";
import { Author } from "../test-helpers/models/author.js";
import { Post } from "../test-helpers/models/post.js";
import { fixtures } from "../test-fixtures.js";

interface AssociationLike {
  target: Post[];
  loaded: boolean;
  loadTarget(): Promise<Post[]> | Post[];
}

const association = (author: Author): AssociationLike =>
  (author as unknown as { association(name: string): AssociationLike }).association("posts");

describe("mergeTargetLists", () => {
  const { authors, posts } = fixtures(["authors", "posts"]);

  beforeAll(() => {
    registerModel(Author);
    registerModel(Post);
  });

  it("writes database values back onto a clean in-memory attribute", async () => {
    const author = await Author.find(authors("david").id);
    const assoc = association(author);
    const loaded = await assoc.loadTarget();
    const memRecord = loaded.find((post) => post.id === posts("welcome").id)!;
    expect(memRecord.get("title")).not.toBe("changed in the database");

    // The database moves under the in-memory record.
    await Post.where({ id: posts("welcome").id }).updateAll({ title: "changed in the database" });

    // `target=` marks the association loaded (association.rb:100-103), so the
    // unloaded flag is set after it, as Ruby's bare `@target =` leaves it.
    assoc.target = [memRecord];
    assoc.loaded = false;
    const merged = await assoc.loadTarget();

    const reloaded = merged.find((post) => post.id === posts("welcome").id)!;
    // Same object — the memory record survives the merge…
    expect(reloaded).toBe(memRecord);
    // …and its clean attribute picks up the database value.
    expect(reloaded.get("title")).toBe("changed in the database");
  });

  it("preserves an in-memory attribute that has unsaved changes", async () => {
    const author = await Author.find(authors("david").id);
    const assoc = association(author);
    const loaded = await assoc.loadTarget();
    const memRecord = loaded.find((post) => post.id === posts("welcome").id)!;

    memRecord.set("title", "dirty in memory");
    await Post.where({ id: posts("welcome").id }).updateAll({ body: "changed in the database" });

    // `target=` marks the association loaded (association.rb:100-103), so the
    // unloaded flag is set after it, as Ruby's bare `@target =` leaves it.
    assoc.target = [memRecord];
    assoc.loaded = false;
    const merged = await assoc.loadTarget();
    const reloaded = merged.find((post) => post.id === posts("welcome").id)!;

    expect(reloaded).toBe(memRecord);
    // The dirty attribute wins over the database…
    expect(reloaded.get("title")).toBe("dirty in memory");
    // …while a clean one still takes the database value.
    expect(reloaded.get("body")).toBe("changed in the database");
  });
});
