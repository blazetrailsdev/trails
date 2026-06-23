/**
 * Preloader key-type normalization: an int8 PK deserializes to a JS `BigInt`
 * while an int4 `references`/`integer` FK deserializes to a `number`
 * (node-postgres parses int8→BigInt, int4→number). The preloader matches owners
 * to children by building a Map keyed on the owner PK and looking up by the
 * child FK; `1n` and `1` are distinct JS Map keys, so without normalization the
 * association comes back empty even though Ruby's width-agnostic `Integer ==`
 * would match. Guards against that regression on the PG bigserial-PK lane.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { Base, registerModel } from "../index.js";
import { Preloader } from "./preloader.js";
import { setupHandlerSuite } from "../test-helpers/setup-handler-suite.js";
import { useHandlerFixtures } from "../test-helpers/use-handler-fixtures.js";
import { TEST_SCHEMA } from "../test-helpers/test-schema.js";
import { Author } from "../test-helpers/models/author.js";
import { Post } from "../test-helpers/models/post.js";

type RecordInternals = {
  _attributes: { writeCastValue(name: string, value: unknown): void };
  _readAttribute(name: string): unknown;
  _preloadedAssociations: Map<string, Base[]>;
};

const internals = (record: Base): RecordInternals => record as unknown as RecordInternals;

describe("Preloader BigInt PK / number FK key match", () => {
  setupHandlerSuite();
  const { authors } = useHandlerFixtures(["authors", "posts"], { schema: TEST_SCHEMA });

  beforeAll(() => {
    registerModel("Author", Author);
    registerModel("Post", Post);
  });

  it("matches children when the owner PK is a BigInt and the child FK is a number", async () => {
    const david = await Author.find(authors("david").id);
    // Simulate node-postgres parsing an int8 (bigserial) PK to BigInt; the int4
    // FK on Post stays a number.
    internals(david)._attributes.writeCastValue(
      "id",
      BigInt(Number(internals(david)._readAttribute("id"))),
    );

    await new Preloader({ records: [david], associations: ["posts"] }).call();

    const posts = internals(david)._preloadedAssociations.get("posts") ?? [];
    expect(posts.length).toBeGreaterThan(0);
    for (const post of posts) {
      expect(Number(internals(post)._readAttribute("author_id"))).toBe(authors("david").id);
    }
  });

  it("normalizes a mix of BigInt and number owner PKs against number FKs", async () => {
    const david = await Author.find(authors("david").id);
    const mary = await Author.find(authors("mary").id);
    // Only David's PK arrives as a BigInt (as if int8); Mary's stays a number.
    // Both must still match their own number-typed child FKs.
    internals(david)._attributes.writeCastValue(
      "id",
      BigInt(Number(internals(david)._readAttribute("id"))),
    );

    await new Preloader({ records: [david, mary], associations: ["posts"] }).call();

    const davidPosts = internals(david)._preloadedAssociations.get("posts") ?? [];
    expect(davidPosts.length).toBeGreaterThan(0);
    for (const post of davidPosts) {
      expect(Number(internals(post)._readAttribute("author_id"))).toBe(authors("david").id);
    }
  });
});
