import { describe, it, expect } from "vitest";
import { Base, RecordNotFound } from "../index.js";
import { fixtures } from "../test-fixtures.js";
import "../support/canonical-model-index.js";
import { Post } from "../test-helpers/models/post.js";

type CollectionInternals = {
  load(): Promise<Base[]>;
  delete(...records: unknown[]): Promise<unknown>;
};

describe("CollectionAssociation#coerceToRecords through branch", () => {
  const { posts } = fixtures(["posts", "readers", "people"]);

  it("raises RecordNotFound when a through association is asked to delete a missing id", async () => {
    const post = (await Post.find(posts("welcome").id)) as Base;
    const people = (post as unknown as { people: CollectionInternals }).people;
    await people.load();

    const error = await Promise.resolve(people.delete(245324523)).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(RecordNotFound);
    const notFound = error as RecordNotFound;
    expect(notFound.model).toBe("Person");
    expect(notFound.primaryKey).toBe("id");
    expect(notFound.message).toContain("Couldn't find Person with 'id'=[245324523]");
  });
});
