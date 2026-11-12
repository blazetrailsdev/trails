import { constSet, TopLevel } from "@blazetrails/ruby-compat";
import { describe, it, expect, beforeAll } from "vitest";
import { Author } from "../../models/author.js";
import { Post } from "../../models/post.js";
import { fixtures } from "../../../lib/test-helpers/use-fixtures.js";

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
    constSet(TopLevel, "Author", Author);
    constSet(TopLevel, "Post", Post);
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
