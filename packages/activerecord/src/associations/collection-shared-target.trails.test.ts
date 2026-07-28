/**
 * Trails-only: Rails keeps ONE `@target` per collection association and
 * `CollectionProxy` forwards to it. Trails split the store in two — the
 * user-facing `CollectionProxy` (`record._collectionProxies`, RFC 0022's
 * canonical has_many store) and the OO `CollectionAssociation`
 * (`record._associationInstances`), each with its own array and loaded flag —
 * so `add_to_target` / `replace_on_target` landed in a mirror no reader
 * consulted. These tests pin the unified store from both surfaces. Rails has no
 * equivalent test: it has nothing to unify.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { registerModel } from "../index.js";
import { Author } from "../test-helpers/models/author.js";
import { Post } from "../test-helpers/models/post.js";
import { Category } from "../test-helpers/models/category.js";
import { Categorization } from "../test-helpers/models/categorization.js";
import { fixtures } from "../test-fixtures.js";

/** `author.posts` / `author.association("posts")`, typed for these tests. */
interface AuthorWithCollections {
  id: unknown;
  posts: ProxyLike;
  categories: { toArray(): Promise<unknown[]> };
  association(name: string): CollectionAssociationLike & { target: unknown[] };
}

const withCollections = (author: Author): AuthorWithCollections =>
  author as unknown as AuthorWithCollections;

interface CollectionAssociationLike {
  target: Post[];
  loaded: boolean;
  isLoaded(): boolean;
  loadedBang(): void;
  reset(): void;
  addToTarget(record: Post, skipCallbacks?: boolean): Post;
}

interface ProxyLike {
  target: Post[];
  loaded: boolean;
  build(attrs?: Record<string, unknown>): Post;
  toArray(): Promise<Post[]>;
  size(): Promise<number>;
}

describe("collection association and CollectionProxy share one target", () => {
  const { authors } = fixtures(["authors", "posts", "categories", "categorizations"]);

  beforeAll(() => {
    registerModel(Author);
    registerModel(Post);
    registerModel(Category);
    registerModel(Categorization);
  });

  it("the OO association and the proxy hold the same target array", async () => {
    const author = withCollections(await Author.find(authors("david").id));
    const proxy = author.posts;
    const assoc = author.association("posts");

    expect(assoc.target).toBe(proxy.target);
    await proxy.toArray();
    expect(assoc.target).toBe(proxy.target);
    expect(assoc.target.length).toBeGreaterThan(0);
  });

  it("addToTarget on the association is visible through the proxy", async () => {
    const author = withCollections(await Author.find(authors("david").id));
    const proxy = author.posts;
    const assoc = author.association("posts");

    const built = Post.new({ title: "shared", body: "target" });
    assoc.addToTarget(built);

    expect(proxy.target).toContain(built);
    // `size` on an unloaded collection is the DB count plus the buffered new
    // records — so the OO-side add has to show up in that count too.
    const persisted = (await Post.where({ author_id: author.id }).count()) as number;
    expect(await proxy.size()).toBe(persisted + 1);
  });

  it("build on the proxy is visible through the association", async () => {
    const author = withCollections(await Author.find(authors("david").id));
    const proxy = author.posts;
    const assoc = author.association("posts");

    const built = proxy.build({ title: "from proxy", body: "body" });

    expect(assoc.target).toContain(built);
  });

  it("adding the same record through both surfaces appends it once", async () => {
    const author = withCollections(await Author.find(authors("david").id));
    const proxy = author.posts;
    const assoc = author.association("posts");

    const built = proxy.build({ title: "once", body: "only" });
    const before = assoc.target.length;
    assoc.addToTarget(built);

    expect(assoc.target.length).toBe(before);
    expect(assoc.target.filter((r) => r === built).length).toBe(1);
  });

  it("loadedness is one flag, not two", async () => {
    const author = withCollections(await Author.find(authors("david").id));
    const proxy = author.posts;
    const assoc = author.association("posts");

    expect(proxy.loaded).toBe(false);
    expect(assoc.isLoaded()).toBe(false);

    await proxy.toArray();
    expect(proxy.loaded).toBe(true);
    expect(assoc.isLoaded()).toBe(true);

    assoc.reset();
    expect(proxy.loaded).toBe(false);
    expect(proxy.target).toEqual([]);
  });

  it("a has_many :through shares its target with its proxy too", async () => {
    const author = withCollections(await Author.find(authors("david").id));
    const proxy = author.categories;
    const assoc = author.association("categories");

    const loaded = await proxy.toArray();
    expect(assoc.target).toEqual(loaded);
  });
});
