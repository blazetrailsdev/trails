import { describe, it, expect } from "vitest";
import { fixtures } from "../../../lib/test-helpers/use-fixtures.js";
import { Post } from "../../../lib/test-helpers/models/post.js";
import { Person } from "../../models/person.js";
import type { Base } from "../../../lib/base.js";

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
