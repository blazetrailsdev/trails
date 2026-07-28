/**
 * Trails-only: `null_scope?` has one body in Rails
 * (collection_association.rb:304-306, `owner.new_record? &&
 * !foreign_key_present?`); `CollectionProxy#null_scope?`
 * (collection_proxy.rb:1150-1152) is a one-line delegation to it, used to route
 * `calculate` and `pluck` through the `none!`d scope (collection_proxy.rb:
 * 724-730). Rails has no test naming the predicate.
 *
 * The first three tests pin the predicate itself from both hosts. The last two
 * pin the *observable* Rails behavior the routing exists to guarantee — a
 * keyless new owner's collection reports nothing, however many children have
 * been built on it. They are deliberately not framed as regression tests for
 * the routing: trails already produced these answers by other means (the
 * loaded-target arm filters new records; the requery arm sits on a `1=0` seed),
 * so they would pass without the `null_scope?` guards. What the guards buy is
 * that those incidental properties are no longer load-bearing.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { registerModel } from "../index.js";
import { Author } from "../test-helpers/models/author.js";
import { Post } from "../test-helpers/models/post.js";
import { fixtures } from "../test-fixtures.js";

interface AssociationLike {
  isNullScope(): boolean;
}

interface ProxyLike {
  isNullScope(): boolean;
  build(attributes: Record<string, unknown>): Post;
  pluck(...columns: string[]): Promise<unknown[]>;
  calculate(operation: "count", column?: string): Promise<unknown>;
}

const associationOf = (owner: Author): AssociationLike =>
  (owner as unknown as { association(n: string): AssociationLike }).association("posts");

const proxyOf = (owner: Author): ProxyLike => (owner as unknown as { posts: ProxyLike }).posts;

const newAuthor = () => new Author({ name: "Bill" });

describe("NullScope", () => {
  fixtures(["authors", "posts"]);

  beforeAll(() => {
    registerModel(Author);
    registerModel(Post);
  });

  it("is true for a new owner with no foreign key present", () => {
    const author = newAuthor();

    expect(associationOf(author).isNullScope()).toBe(true);
    expect(proxyOf(author).isNullScope()).toBe(true);
  });

  it("is false once the owner is persisted", async () => {
    const author = (await Author.first())!;

    expect(associationOf(author).isNullScope()).toBe(false);
    expect(proxyOf(author).isNullScope()).toBe(false);
  });

  it("is false for a new owner whose primary key is already assigned", () => {
    const author = new Author({ id: 42, name: "Bill" });

    expect(associationOf(author).isNullScope()).toBe(false);
    expect(proxyOf(author).isNullScope()).toBe(false);
  });

  it("pluck on a null scope returns nothing despite built children", async () => {
    const proxy = proxyOf(newAuthor());
    proxy.build({ title: "unsaved", body: "b" });

    expect(await proxy.pluck("title")).toEqual([]);
  });

  it("calculate on a null scope returns nothing despite built children", async () => {
    const proxy = proxyOf(newAuthor());
    proxy.build({ title: "unsaved", body: "b" });

    expect(await proxy.calculate("count")).toEqual(0);
  });
});
