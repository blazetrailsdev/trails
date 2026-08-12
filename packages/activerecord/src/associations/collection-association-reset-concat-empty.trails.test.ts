/**
 * Trails-only: pins three `CollectionAssociation` bodies to their Rails
 * counterparts — `reset` (collection_association.rb:87-92) clearing
 * `@replaced_or_added_targets`, `insert_record`'s block
 * (collection_association.rb:438-454) capturing `@_was_loaded`, and `empty?`
 * (collection_association.rb:232-238) falling through to `scope.exists?`. Rails
 * covers these through the user-facing surfaces; these tests reach the OO
 * association directly because that is where the port had drifted.
 */
import { describe, it, expect, beforeAll, vi } from "vitest";
import { registerModel } from "../index.js";
import { Author } from "../test-helpers/models/author.js";
import { Post } from "../test-helpers/models/post.js";
import { Car } from "../test-helpers/models/car.js";
import { Tyre } from "../test-helpers/models/tyre.js";
import { Person } from "../test-helpers/models/person.js";
import { fixtures } from "../test-fixtures.js";

interface CollectionAssociationLike {
  target: Post[];
  _replacedOrAddedTargets: Set<Post>;
  _wasLoaded: boolean | null;
  isLoaded(): boolean;
  reset(): void;
  addToTarget(record: Post, options?: { replace?: boolean }): Post | null;
  insertRecord(
    record: Post,
    validate?: boolean,
    raise?: boolean,
    block?: () => void,
  ): Promise<boolean>;
  isEmpty(): Promise<boolean>;
}

const assocOf = (author: Author): CollectionAssociationLike =>
  (author as unknown as { association(name: string): CollectionAssociationLike }).association(
    "posts",
  );

describe("CollectionAssociation reset / insert_record block / empty?", () => {
  const { authors } = fixtures(["authors", "posts", "cars"]);

  beforeAll(() => {
    registerModel(Author);
    registerModel(Post);
    registerModel(Car);
    registerModel(Tyre);
    registerModel(Person);
  });

  it("reset clears replaced_or_added_targets", async () => {
    const author = await Author.find(authors("david").id);
    const assoc = assocOf(author);

    const built = Post.new({ title: "reset", body: "me" });
    assoc.addToTarget(built);
    expect(assoc._replacedOrAddedTargets.has(built)).toBe(true);

    assoc.reset();

    expect(assoc._replacedOrAddedTargets.has(built)).toBe(false);
    expect(assoc._replacedOrAddedTargets.size).toBe(0);
  });

  it("insert_record yields its block so concat_records can capture _was_loaded", async () => {
    const author = await Author.find(authors("david").id);
    const assoc = assocOf(author);

    const record = Post.new({ title: "block", body: "yield" });
    const seen: Array<boolean | null> = [];
    await assoc.insertRecord(record, true, false, () => {
      assoc._wasLoaded = assoc.isLoaded();
      seen.push(assoc._wasLoaded);
    });

    expect(seen).toEqual([assoc.isLoaded()]);
  });

  it("empty? consults reflection.has_active_cached_counter? on the rich reflection", async () => {
    const car = await Car.create({ name: "honda" });
    const assoc = (
      car as unknown as { association(name: string): CollectionAssociationLike }
    ).association("tyres");
    const reflection = (
      Car as unknown as { _reflectOnAssociation(n: string): unknown }
    )._reflectOnAssociation("tyres") as { hasActiveCachedCounter(): boolean };
    const spy = vi.spyOn(reflection, "hasActiveCachedCounter");

    await assoc.isEmpty();

    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });

  it("empty? on an unloaded collection queries scope.exists?", async () => {
    const author = await Author.find(authors("david").id);
    const assoc = assocOf(author);

    expect(assoc.isLoaded()).toBe(false);
    expect(assoc.target.length).toBe(0);
    // The DB has posts for david, so `target.empty? && !scope.exists?` is false
    // even though the in-memory target is empty.
    expect(await assoc.isEmpty()).toBe(false);
  });
});
