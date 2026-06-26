// An STI subclass owner building/creating through a `has_many :through`
// association declared on its base class must write the join row's owner FK
// derived from the *declaring* class (`reflection.foreign_key`), not the STI
// subclass name. `Post has_many :people, through: :readers`, so a `SpecialPost`
// owner writes `readers.post_id`, never `special_post_id` (which is not even a
// column). The parent convergence PR could not exercise this — no canonical STI
// has_one :through fixture — so the coverage lives here on the has_many path.

import { describe, it, expect, beforeAll } from "vitest";
import { registerModel } from "../index.js";
import { createTestAdapter, type TestDatabaseAdapter } from "../test-adapter.js";
import { defineSchema } from "../test-helpers/define-schema.js";
import { withTransactionalFixtures } from "../test-helpers/with-transactional-fixtures.js";
import { TEST_SCHEMA } from "../test-helpers/test-schema.js";
import { Post, SpecialPost } from "../test-helpers/models/post.js";
import { Person } from "../test-helpers/models/person.js";
import { Reader } from "../test-helpers/models/reader.js";

describe("STI owner has_many :through — declaring-class owner FK", () => {
  let adapter: TestDatabaseAdapter;

  beforeAll(async () => {
    adapter = createTestAdapter();
    for (const klass of [Post, SpecialPost, Person, Reader]) {
      klass.adapter = adapter;
      registerModel(klass);
    }
    await defineSchema(adapter, {
      posts: TEST_SCHEMA.posts,
      people: TEST_SCHEMA.people,
      readers: TEST_SCHEMA.readers,
    });
  });
  withTransactionalFixtures(() => adapter);

  it("creates the join row with the base-class owner FK (post_id, not special_post_id)", async () => {
    const post = await SpecialPost.create({ title: "sti", body: "b", type: "SpecialPost" });
    const people = post.people as {
      create: (a: Record<string, unknown>) => Promise<Person>;
    };
    const person = await people.create({ first_name: "Bob" });

    const reader = await Reader.findBy({ person_id: person.id });
    expect(reader).not.toBeNull();
    expect(Number(reader!.post_id)).toBe(Number(post.id));
    expect((reader as unknown as Record<string, unknown>).special_post_id).toBeUndefined();
  });

  it("builds the in-memory join row with the base-class owner FK", async () => {
    const post = await SpecialPost.create({ title: "sti", body: "b", type: "SpecialPost" });
    const people = post.people as unknown as {
      build: (a: Record<string, unknown>) => Promise<Person>;
    };
    const person = await people.build({ first_name: "Eve" });
    await person.save();

    const reader = await Reader.findBy({ person_id: person.id });
    expect(reader).not.toBeNull();
    expect(Number(reader!.post_id)).toBe(Number(post.id));
  });
});
