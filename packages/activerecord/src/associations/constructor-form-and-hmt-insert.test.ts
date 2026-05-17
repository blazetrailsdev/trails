/**
 * Batch 30 — HMT Slot C smoke tests:
 *   - constructor-form collection writer in assignAttributes
 *   - association.resetScope invocation during saveCollectionAssociation
 *   - HMT insert_record two-step alignment (super.insertRecord →
 *     save_through_record) for HABTM
 */
import { describe, it, expect, beforeEach } from "vitest";
import { Base, registerModel } from "../index.js";
import { Associations } from "../associations.js";
import { createTestAdapter } from "../test-adapter.js";
import { defineSchema } from "../test-helpers/define-schema.js";
import type { DatabaseAdapter } from "../adapter.js";

let _adapter: DatabaseAdapter;
beforeEach(async () => {
  _adapter = createTestAdapter();
  await defineSchema(_adapter, {
    b30_owners: { name: "string" },
    b30_items: { name: "string", owner_id: "integer" },
    b30_profiles: { name: "string", owner_id: "integer" },
    b30_posts: { title: "string" },
    b30_tags: { name: "string" },
    b30_posts_b30_tags: { b30_post_id: "integer", b30_tag_id: "integer" },
  });
});

describe("constructor-form association writer", () => {
  function makeHasManyModels() {
    class B30Item extends Base {
      static {
        this._tableName = "b30_items";
        this.attribute("name", "string");
        this.attribute("owner_id", "integer");
        this.adapter = _adapter;
      }
    }
    class B30Owner extends Base {
      static {
        this._tableName = "b30_owners";
        this.attribute("name", "string");
        this.adapter = _adapter;
      }
    }
    Associations.hasMany.call(B30Owner, "items", { className: "B30Item", foreignKey: "owner_id" });
    registerModel("B30Item", B30Item);
    registerModel("B30Owner", B30Owner);
    return { B30Owner, B30Item };
  }

  it("dispatches array values to hasMany association on construction", () => {
    const { B30Owner, B30Item } = makeHasManyModels();
    const i1 = new B30Item({ name: "a" });
    const i2 = new B30Item({ name: "b" });
    const owner = new B30Owner({ name: "Acme", items: [i1, i2] });
    const target = (owner as any).association("items").target as Base[];
    expect(target).toHaveLength(2);
    expect(target[0]).toBe(i1);
    expect(target[1]).toBe(i2);
  });

  it("dispatches single record to hasOne association on construction", () => {
    class B30Profile extends Base {
      static {
        this._tableName = "b30_profiles";
        this.attribute("name", "string");
        this.attribute("owner_id", "integer");
        this.adapter = _adapter;
      }
    }
    class B30Owner2 extends Base {
      static {
        this._tableName = "b30_owners";
        this.attribute("name", "string");
        this.adapter = _adapter;
      }
    }
    Associations.hasOne.call(B30Owner2, "profile", {
      className: "B30Profile",
      foreignKey: "owner_id",
    });
    registerModel("B30Profile", B30Profile);
    registerModel("B30Owner2", B30Owner2);

    const p = new B30Profile({ name: "p" });
    const owner = new B30Owner2({ name: "x", profile: p });
    expect((owner as any).association("profile").target).toBe(p);
  });
});

describe("HABTM insert_record two-step", () => {
  function makeHabtmModels() {
    class B30Post extends Base {
      static {
        this._tableName = "b30_posts";
        this.attribute("title", "string");
        this.adapter = _adapter;
      }
    }
    class B30Tag extends Base {
      static {
        this._tableName = "b30_tags";
        this.attribute("name", "string");
        this.adapter = _adapter;
      }
    }
    Associations.hasAndBelongsToMany.call(B30Post, "tags", { className: "B30Tag" });
    registerModel("B30Post", B30Post);
    registerModel("B30Tag", B30Tag);
    return { B30Post, B30Tag };
  }

  it("super.insertRecord saves the target, save_through_record persists join row", async () => {
    const { B30Post, B30Tag } = makeHabtmModels();
    const post = await B30Post.create({ title: "Hello" });
    const tag = new B30Tag({ name: "ruby" });
    const ok = await (post as any).association("tags").insertRecord(tag, true, false);
    expect(ok).toBe(true);
    // super.insertRecord saved the target
    expect(tag.isPersisted()).toBe(true);
    // join row exists with correct FKs — verify via the through proxy
    const tags = await (post as any).association("tags").loadTarget();
    expect(tags).toHaveLength(1);
    expect((tags[0] as any).id).toBe(tag.id);
  });
});

describe("resetScope on owner save", () => {
  it("clears the memoized association scope before iterating children", async () => {
    class B30Item2 extends Base {
      static {
        this._tableName = "b30_items";
        this.attribute("name", "string");
        this.attribute("owner_id", "integer");
        this.adapter = _adapter;
      }
    }
    class B30Owner3 extends Base {
      static {
        this._tableName = "b30_owners";
        this.attribute("name", "string");
        this.adapter = _adapter;
      }
    }
    Associations.hasMany.call(B30Owner3, "items", {
      className: "B30Item2",
      foreignKey: "owner_id",
    });
    registerModel("B30Item2", B30Item2);
    registerModel("B30Owner3", B30Owner3);

    const owner = await B30Owner3.create({ name: "o" });
    const assoc = (owner as any).association("items");
    // saveCollectionAssociation must call resetScope() before iterating
    // children so a stale scope doesn't survive into per-child saves.
    let resetCount = 0;
    const original = assoc.resetScope.bind(assoc);
    assoc.resetScope = function () {
      resetCount++;
      return original();
    };
    (owner as any).items = [];
    await owner.save();
    expect(resetCount).toBeGreaterThan(0);
  });
});
