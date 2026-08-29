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

    await Post.where({ id: posts("welcome").id }).updateAll({ title: "changed in the database" });

    assoc.target = [memRecord];
    assoc.loaded = false;
    const merged = await assoc.loadTarget();

    const reloaded = merged.find((post) => post.id === posts("welcome").id)!;
    expect(reloaded).toBe(memRecord);
    expect(reloaded.get("title")).toBe("changed in the database");
  });

  it("preserves an in-memory attribute that has unsaved changes", async () => {
    const author = await Author.find(authors("david").id);
    const assoc = association(author);
    const loaded = await assoc.loadTarget();
    const memRecord = loaded.find((post) => post.id === posts("welcome").id)!;

    memRecord.set("title", "dirty in memory");
    await Post.where({ id: posts("welcome").id }).updateAll({ body: "changed in the database" });

    assoc.target = [memRecord];
    assoc.loaded = false;
    const merged = await assoc.loadTarget();
    const reloaded = merged.find((post) => post.id === posts("welcome").id)!;

    expect(reloaded).toBe(memRecord);
    expect(reloaded.get("title")).toBe("dirty in memory");
    expect(reloaded.get("body")).toBe("changed in the database");
  });
});
