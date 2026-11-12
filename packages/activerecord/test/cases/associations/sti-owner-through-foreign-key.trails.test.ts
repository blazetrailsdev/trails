import { describe, it, expect } from "vitest";
import { fixtures } from "../../../lib/test-helpers/use-fixtures.js";
import { SpecialPost } from "../../../lib/test-helpers/models/post.js";
import { Person } from "../../models/person.js";
import { Reader } from "../../models/reader.js";
import { VerySpecialComment } from "../../models/comment.js";
import "../../models/person.js";
import "../../models/comment.js";

describe("STI owner has_many :through — declaring-class owner FK", () => {
  fixtures({});

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

  it("builds the target with the base-class owner FK (post_id, not special_post_id)", async () => {
    const post = await SpecialPost.create({ title: "sti", body: "b", type: "SpecialPost" });
    const assoc = (
      post as unknown as {
        association: (n: string) => { build: (a: Record<string, unknown>) => VerySpecialComment };
      }
    ).association("verySpecialComment");
    const built = await assoc.build({ body: "built sti has_one" });

    expect(Number(built._readAttribute("post_id"))).toBe(Number(post.id));
  });
});
