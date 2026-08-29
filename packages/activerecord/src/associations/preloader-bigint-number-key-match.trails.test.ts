import { describe, it, expect } from "vitest";
import { Base } from "../index.js";
import { Preloader } from "./preloader.js";
import { fixtures } from "../test-fixtures.js";
import "../support/canonical-model-index.js";
import { Author } from "../test-helpers/models/author.js";

type RecordInternals = {
  _attributes: { writeCastValue(name: string, value: unknown): void };
  _readAttribute(name: string): unknown;
  association(name: string): { target?: Base[] };
};

const internals = (record: Base): RecordInternals => record as unknown as RecordInternals;

describe("Preloader BigInt PK / number FK key match", () => {
  const { authors } = fixtures(["authors", "posts"]);

  it("matches children when the owner PK is a BigInt and the child FK is a number", async () => {
    const david = await Author.find(authors("david").id);
    internals(david)._attributes.writeCastValue(
      "id",
      BigInt(Number(internals(david)._readAttribute("id"))),
    );

    await new Preloader({ records: [david], associations: ["posts"] }).call();

    const posts = internals(david).association("posts").target ?? [];
    expect(posts.length).toBeGreaterThan(0);
    for (const post of posts) {
      expect(Number(internals(post)._readAttribute("author_id"))).toBe(Number(authors("david").id));
    }
  });

  it("normalizes a mix of BigInt and number owner PKs against number FKs", async () => {
    const david = await Author.find(authors("david").id);
    const mary = await Author.find(authors("mary").id);
    internals(david)._attributes.writeCastValue(
      "id",
      BigInt(Number(internals(david)._readAttribute("id"))),
    );

    await new Preloader({ records: [david, mary], associations: ["posts"] }).call();

    const davidPosts = internals(david).association("posts").target ?? [];
    expect(davidPosts.length).toBeGreaterThan(0);
    for (const post of davidPosts) {
      expect(Number(internals(post)._readAttribute("author_id"))).toBe(Number(authors("david").id));
    }

    const maryPosts = internals(mary).association("posts").target ?? [];
    expect(maryPosts.length).toBeGreaterThan(0);
    for (const post of maryPosts) {
      expect(Number(internals(post)._readAttribute("author_id"))).toBe(Number(authors("mary").id));
    }
  });
});
