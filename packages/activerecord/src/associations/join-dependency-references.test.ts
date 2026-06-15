/**
 * Tests for lazy referenced-table aliasing in JoinDependency.
 *
 * Mirrors: ActiveRecord::Associations::JoinDependency#make_constraints reading
 * `@references[reflection.name]` (join_dependency.rb:202). `references` recorded
 * by `join_constraints` (join_dependency.rb:88–92) re-aliases an emitted join to
 * its reference name (`authors AS author`).
 */
import { describe, it, expect, beforeEach } from "vitest";
import { Nodes } from "@blazetrails/arel";
import { Base, registerModel } from "../index.js";
import { createTestAdapter } from "../test-adapter.js";
import { Associations } from "../associations.js";
import { JoinDependency } from "./join-dependency.js";

describe("JoinDependency referenced-table aliasing", () => {
  class Author extends Base {
    static {
      this.attribute("name", "string");
    }
  }
  class Post extends Base {
    static {
      this.attribute("authorId", "integer");
    }
  }

  beforeEach(() => {
    const adapter = createTestAdapter();
    for (const m of [Author, Post]) {
      (m as any).adapter = adapter;
      (m as any)._associations = [];
      registerModel(m);
    }
    Associations.belongsTo.call(Post, "author", { className: "Author", foreignKey: "authorId" });
  });

  const joinTableName = (join: Nodes.Join): string => {
    const left = (join as any).left;
    return left.tableAlias ?? left.name;
  };

  it("aliases a referenced association to its reference name", () => {
    const jd = new JoinDependency(Post);
    jd.addAssociation("author");
    const joins = jd.joinConstraints([], undefined, ["author"]);
    expect(joins).toHaveLength(1);
    expect(joinTableName(joins[0])).toBe("author");
  });

  it("leaves the join on its real table when not referenced", () => {
    const jd = new JoinDependency(Post);
    jd.addAssociation("author");
    const joins = jd.joinConstraints([]);
    expect(joins).toHaveLength(1);
    expect(joinTableName(joins[0])).toBe("authors");
  });
});
