/**
 * DJAS: polymorphic belongsTo-through with non-id target PK (task #20).
 *
 * The non-DJAS path has a regression test at
 * `association-scope.test.ts` ("loadHasMany through with sourceType +
 * non-id target PK uses correct join column"). The DJAS walk routes
 * through the same reflection infrastructure (`joinPrimaryKeyFor`
 * resolves the source target's actual PK column for a polymorphic
 * belongsTo at runtime), but no direct DJAS coverage existed for
 * that intersection. This file pins the DJAS shape end-to-end.
 *
 * Key setup:
 *   Author  has_many :galleries (regular FK)
 *   Gallery belongs_to :imageable, polymorphic: true, foreign_key: :imageable_uuid
 *   Photo   primaryKey = "uuid"       # non-id PK
 *   Author  has_many :photos, through: :galleries, source: :imageable,
 *                    sourceType: "DpNonIdPhoto",
 *                    disable_joins: true
 *
 * The walk must read the *source-target's* `uuid` column on the
 * through step (not the default `"id"` that
 * `BelongsToReflection#joinPrimaryKey` hard-codes for polymorphic
 * sources). Rails resolves this via
 * `BelongsToReflection#join_primary_key_for(klass)`
 * (reflection.rb:968); our ReflectionProxy forwards it, and DJAS'
 * `_addConstraintsDj` threads it through the chain walk.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { Notifications } from "@blazetrails/activesupport";
import { Base, registerModel } from "../index.js";
import { Associations, loadHasMany } from "../associations.js";
import { createTestAdapter } from "../test-adapter.js";
import type { DatabaseAdapter } from "../adapter.js";

describe("DJAS — polymorphic belongsTo-through with non-id target PK", () => {
  let adapter: DatabaseAdapter;

  class DpAuthor extends Base {
    static {
      this._tableName = "dp_authors";
      this.attribute("name", "string");
    }
  }
  class DpGallery extends Base {
    static {
      this._tableName = "dp_galleries";
      this.attribute("dp_author_id", "integer");
      this.attribute("imageable_uuid", "string");
      this.attribute("imageable_type", "string");
    }
  }
  class DpNonIdPhoto extends Base {
    static {
      this._tableName = "dp_non_id_photos";
      this.primaryKey = "uuid";
      this.attribute("uuid", "string");
      this.attribute("title", "string");
    }
  }
  class DpNonIdArticle extends Base {
    static {
      this._tableName = "dp_non_id_articles";
      this.primaryKey = "slug";
      this.attribute("slug", "string");
      this.attribute("headline", "string");
    }
  }

  beforeEach(() => {
    adapter = createTestAdapter();
    DpAuthor.adapter = adapter;
    DpGallery.adapter = adapter;
    DpNonIdPhoto.adapter = adapter;
    DpNonIdArticle.adapter = adapter;
    registerModel("DpAuthor", DpAuthor);
    registerModel("DpGallery", DpGallery);
    registerModel("DpNonIdPhoto", DpNonIdPhoto);
    registerModel("DpNonIdArticle", DpNonIdArticle);
    (DpAuthor as any)._associations = [];
    (DpAuthor as any)._reflections = {};
    (DpGallery as any)._associations = [];
    (DpGallery as any)._reflections = {};

    Associations.hasMany.call(DpAuthor, "dpGalleries", {
      className: "DpGallery",
      foreignKey: "dp_author_id",
    });
    Associations.belongsTo.call(DpGallery, "imageable", {
      polymorphic: true,
      foreignKey: "imageable_uuid",
    });
    Associations.hasMany.call(DpAuthor, "noJoinsDpPhotos", {
      className: "DpNonIdPhoto",
      through: "dpGalleries",
      source: "imageable",
      sourceType: "DpNonIdPhoto",
      disableJoins: true,
    });
    Associations.hasOne.call(DpAuthor, "noJoinsDpOnePhoto", {
      className: "DpNonIdPhoto",
      through: "dpGalleries",
      source: "imageable",
      sourceType: "DpNonIdPhoto",
      disableJoins: true,
    });
  });

  afterEach(() => Notifications.unsubscribeAll());

  it("loads via DJAS using the sourceType target's non-id PK (no JOIN, origin_type filter applied)", async () => {
    const author = await DpAuthor.create({ name: "a" });

    // One matching photo (sourceType target uses `uuid` as PK).
    const photo = (await DpNonIdPhoto.create({ uuid: "u-photo", title: "p1" })) as any;
    await DpGallery.create({
      dp_author_id: author.id,
      imageable_uuid: photo.uuid,
      imageable_type: "DpNonIdPhoto",
    });

    // A second real photo whose uuid matches a distraction gallery's
    // imageable_uuid. Without the sourceType filter
    // (imageable_type = 'DpNonIdPhoto'), the walk would collect
    // BOTH uuids from the gallery step and incorrectly load
    // `otherPhoto` alongside the real one — proving the filter is
    // doing observable work, not just shaping SQL.
    const otherPhoto = (await DpNonIdPhoto.create({
      uuid: "u-other-photo",
      title: "leak-check",
    })) as any;
    await DpNonIdArticle.create({ slug: otherPhoto.uuid, headline: "h-collide" });
    await DpGallery.create({
      dp_author_id: author.id,
      imageable_uuid: otherPhoto.uuid,
      imageable_type: "DpNonIdArticle",
    });

    const observed: string[] = [];
    const sub = Notifications.subscribe("sql.active_record", (event: any) => {
      const sql = event?.payload?.sql;
      if (typeof sql === "string") observed.push(sql);
    });
    try {
      const reflection = (DpAuthor as any)._reflectOnAssociation("noJoinsDpPhotos");
      const photos = await loadHasMany(author, "noJoinsDpPhotos", reflection.options);
      expect(photos.map((p: any) => p.uuid)).toEqual([photo.uuid]);
      expect(photos.map((p: any) => p.title)).toEqual(["p1"]);
    } finally {
      Notifications.unsubscribe(sub);
    }
    expect(observed.length).toBeGreaterThan(0);
    // DJAS walks step-by-step — no JOIN across the chain.
    expect(observed.some((s) => /\bJOIN\b/i.test(s))).toBe(false);
    // The source-type filter fired at the gallery step.
    expect(observed.some((s) => /imageable_type/i.test(s))).toBe(true);
    // The final step reads `uuid` (the sourceType target's PK), not
    // the hard-coded `id` that `BelongsToReflection#joinPrimaryKey`
    // returns for polymorphic sources. Regression guard: if
    // `joinPrimaryKeyFor(klass)` stops being routed correctly, the
    // WHERE would reference `id` and return no rows.
    expect(observed.some((s) => /\bFROM\b\s+["`]?dp_non_id_photos\b.+\buuid\b/i.test(s))).toBe(
      true,
    );
  });

  it("has_one :through polymorphic-source + non-id target PK via DJAS", async () => {
    // Same routing gate + chain walker as has_many — pinning the
    // has_one variant since the fix touches both paths and
    // CollectionAssociation / SingularAssociation share the DJAS
    // scope infrastructure.
    const author = await DpAuthor.create({ name: "a" });
    const photo = (await DpNonIdPhoto.create({ uuid: "u-one", title: "only" })) as any;
    await DpGallery.create({
      dp_author_id: author.id,
      imageable_uuid: photo.uuid,
      imageable_type: "DpNonIdPhoto",
    });

    const observed: string[] = [];
    const sub = Notifications.subscribe("sql.active_record", (event: any) => {
      const sql = event?.payload?.sql;
      if (typeof sql === "string") observed.push(sql);
    });
    let loaded: any;
    try {
      loaded = await (author as any).loadHasOne("noJoinsDpOnePhoto");
    } finally {
      Notifications.unsubscribe(sub);
    }
    expect(loaded?.uuid).toBe(photo.uuid);
    expect(observed.some((s) => /\bJOIN\b/i.test(s))).toBe(false);
  });
});
