// An STI subclass owner building/creating through a `has_many :through`
// association declared on its base class must write the join row's owner FK
// derived from the *declaring* class (`reflection.foreign_key`), not the STI
// subclass name. `Post has_many :people, through: :readers`, so a `SpecialPost`
// owner writes `readers.post_id`, never `special_post_id` (which is not even a
// column). The parent convergence PR could not exercise this — no canonical STI
// has_one :through fixture — so that coverage lives here on the has_many path.
//
// The singular sibling below covers `HasOneAssociation#foreignKeyColumns`, which
// derived the FK from the owner *instance's* class until it was pointed at the
// same rich reflection.

import { describe, it, expect, beforeAll } from "vitest";
import { registerModel } from "../index.js";
import { fixtures } from "../test-helpers/fixtures.js";
import { Post, SpecialPost } from "../test-helpers/models/post.js";
import { Person } from "../test-helpers/models/person.js";
import { Reader } from "../test-helpers/models/reader.js";
import { Comment, VerySpecialComment } from "../test-helpers/models/comment.js";

describe("STI owner has_many :through — declaring-class owner FK", () => {
  // Ride the boot-laid canonical `posts` / `people` / `readers` on
  // `Base.connection` (single-pool test model) rather than a sidecar `_pool`
  // lease. `fixtures({})` establishes the handler and per-test transactional
  // rollback (no seed rows).
  fixtures({});

  beforeAll(() => {
    for (const klass of [Post, SpecialPost, Person, Reader]) {
      registerModel(klass);
    }
  });

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

describe("STI owner has_one — declaring-class owner FK", () => {
  fixtures({});

  beforeAll(() => {
    for (const klass of [Post, SpecialPost, Comment, VerySpecialComment]) {
      registerModel(klass);
    }
  });

  it("builds the target with the base-class owner FK (post_id, not special_post_id)", async () => {
    const post = await SpecialPost.create({ title: "sti", body: "b", type: "SpecialPost" });
    const assoc = (
      post as unknown as {
        association: (n: string) => { build: (a: Record<string, unknown>) => VerySpecialComment };
      }
    ).association("verySpecialComment");
    const built = assoc.build({ body: "built sti has_one" });

    expect(Number(built._readAttribute("post_id"))).toBe(Number(post.id));
  });
});
