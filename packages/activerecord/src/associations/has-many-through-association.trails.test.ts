import { describe, it, expect } from "vitest";
import { fixtures } from "../test-fixtures.js";
import { Post } from "../test-helpers/models/post.js";
import { Person } from "../test-helpers/models/person.js";
import type { Base } from "../base.js";

describe("HasManyThroughAssociation#through_records_for — c.public_send(key) == value", () => {
  fixtures(["posts", "people", "readers"]);

  it("matches a through record whose source association is not loaded yet", async () => {
    const post = await Post.find(1);
    const readers = (await post.association("readers").loadTarget()) as Base[];
    expect(readers).toHaveLength(1);
    expect(readers[0].association("person").loaded).toBe(false);
    const person = await Person.find(1);
    await post.association("people").loadTarget();
    await post.people.delete(person);
    expect(post.association("readers").target).toHaveLength(0);
  });
});
