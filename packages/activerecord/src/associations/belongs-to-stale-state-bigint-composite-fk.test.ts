/**
 * Regression guard: `BelongsToAssociation#staleState` composite-FK path folds
 * BigInt FK components before `JSON.stringify`. node-postgres deserializes int8
 * columns (default under PG bigserial) to JS `BigInt`, which `JSON.stringify`
 * rejects ("Do not know how to serialize a BigInt"). The composite-FK branch
 * used a raw `JSON.stringify(values)`, so a `belongs_to` with a composite FK
 * carrying a BigInt component threw on the stale-state check. Mirrors the
 * `CollectionAssociation#recordIdentity` fix (fold `bigint` → `.toString()`).
 */
import { describe, it, expect } from "vitest";

import { Base } from "../base.js";
import { registerModel } from "../associations.js";

class CpkStaleParent extends Base {
  static _tableName = "cpk_stale_parents";
  static {
    this._primaryKey = ["blog_id", "id"];
    this.attribute("blog_id", "integer");
    this.attribute("id", "integer");
  }
}

class CpkStaleChild extends Base {
  static _tableName = "cpk_stale_children";
  static {
    this.attribute("blog_id", "integer");
    this.attribute("blog_post_id", "integer");
    this.belongsTo("blogPost", {
      className: "CpkStaleParent",
      foreignKey: ["blog_id", "blog_post_id"],
    });
  }
}

describe("belongs_to composite-FK staleState with a BigInt component", () => {
  registerModel(CpkStaleParent);
  registerModel(CpkStaleChild);

  it("serializes a BigInt FK component without throwing", () => {
    const child = new CpkStaleChild({ blog_id: 1, blog_post_id: 9007199254740993n });
    const holder = child.association("blogPost") as unknown as { staleState(): unknown };

    let state: unknown;
    expect(() => {
      state = holder.staleState();
    }).not.toThrow();
    expect(state).toBe(JSON.stringify([1, "9007199254740993"]));
  });

  it("preserves a deterministic key across reads", () => {
    const child = new CpkStaleChild({ blog_id: 2, blog_post_id: 9007199254740993n });
    const holder = child.association("blogPost") as unknown as { staleState(): unknown };

    expect(holder.staleState()).toBe(holder.staleState());
  });
});
