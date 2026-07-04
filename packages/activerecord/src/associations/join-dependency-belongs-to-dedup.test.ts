import { describe, it, expect, beforeEach } from "vitest";
import { Base, registerModel } from "../index.js";
import { Associations } from "../associations.js";
import { fixtures } from "../test-helpers/fixtures.js";
import { JoinDependency } from "./join-dependency.js";

describe("JoinDependency cross-parent belongsTo dedup", () => {
  // Ride the canonical schema `fixtures({})` warms; the hydration rows below are
  // built by column name via `jd.aliasedRow`, so no bespoke schema is declared
  // and no `tN_rN` offsets are hardcoded.
  fixtures({});

  class Author extends Base {
    static {
      this.attribute("id", "integer");
      this.attribute("name", "string");
    }
  }

  class Post extends Base {
    static {
      this.attribute("id", "integer");
      this.attribute("author_id", "integer");
      this.attribute("title", "string");
    }
  }

  beforeEach(() => {
    for (const m of [Author, Post]) {
      m._associations = [];
      registerModel(m);
    }

    Associations.belongsTo.call(Post, "author", { className: "Author" });
  });

  it("shares a single author instance across posts with the same author", () => {
    const jd = new JoinDependency(Post);
    jd.addAssociation("author");

    const rows = [
      jd.aliasedRow({
        "": { id: 1, author_id: 42, title: "Post A" },
        author: { id: 42, name: "Alice" },
      }),
      jd.aliasedRow({
        "": { id: 2, author_id: 42, title: "Post B" },
        author: { id: 42, name: "Alice" },
      }),
      jd.aliasedRow({
        "": { id: 3, author_id: 42, title: "Post C" },
        author: { id: 42, name: "Alice" },
      }),
    ];

    const { parents } = jd.instantiateFromRows(rows);

    expect(parents).toHaveLength(3);

    const authors = parents.map((p) => {
      const proxy = p.association("author");
      return proxy?.target;
    });

    expect(authors[0]).toBeDefined();
    expect(authors[0]).toBe(authors[1]);
    expect(authors[0]).toBe(authors[2]);
  });

  it("creates distinct instances for different authors", () => {
    const jd = new JoinDependency(Post);
    jd.addAssociation("author");

    const rows = [
      jd.aliasedRow({
        "": { id: 1, author_id: 42, title: "Post A" },
        author: { id: 42, name: "Alice" },
      }),
      jd.aliasedRow({
        "": { id: 2, author_id: 99, title: "Post B" },
        author: { id: 99, name: "Bob" },
      }),
    ];

    const { parents } = jd.instantiateFromRows(rows);

    const author1 = parents[0].association("author")?.target;
    const author2 = parents[1].association("author")?.target;

    expect(author1).toBeDefined();
    expect(author2).toBeDefined();
    expect(author1).not.toBe(author2);
  });
});
