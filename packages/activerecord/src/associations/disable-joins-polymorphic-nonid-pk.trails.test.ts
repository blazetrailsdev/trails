import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import { Notifications } from "@blazetrails/activesupport";
import { Base, registerModel, TableDefinition } from "../index.js";
import { Associations } from "../associations.js";
import { fixtures } from "../test-fixtures.js";

describe("DJAS — polymorphic belongsTo-through with non-id target PK", () => {
  fixtures([]);

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

  beforeAll(async () => {
    const conn = Base.connection;
    await conn.createTable("dp_authors", { force: true }, (t: TableDefinition) => {
      t.string("name");
    });
    await conn.createTable("dp_galleries", { force: true }, (t: TableDefinition) => {
      t.integer("dp_author_id");
      t.string("imageable_uuid");
      t.string("imageable_type");
    });
    await conn.createTable(
      "dp_non_id_photos",
      { primaryKey: "uuid", id: { type: "string" }, force: true },
      (t: TableDefinition) => {
        t.string("title");
      },
    );
    await conn.createTable(
      "dp_non_id_articles",
      { primaryKey: "slug", id: { type: "string" }, force: true },
      (t: TableDefinition) => {
        t.string("headline");
      },
    );
    registerModel("DpAuthor", DpAuthor);
    registerModel("DpGallery", DpGallery);
    registerModel("DpNonIdPhoto", DpNonIdPhoto);
    registerModel("DpNonIdArticle", DpNonIdArticle);
    (DpAuthor as any)._reflections = {};
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
    Associations.hasOne.call(DpAuthor, "dpGallery", {
      className: "DpGallery",
      foreignKey: "dp_author_id",
    });
    Associations.hasOne.call(DpAuthor, "noJoinsDpOnePhoto", {
      className: "DpNonIdPhoto",
      through: "dpGallery",
      source: "imageable",
      sourceType: "DpNonIdPhoto",
      disableJoins: true,
    });
  });

  afterAll(async () => {
    await Base.connection.dropTable(
      "dp_non_id_articles",
      "dp_non_id_photos",
      "dp_galleries",
      "dp_authors",
      { ifExists: true },
    );
  });

  afterEach(() => Notifications.unsubscribeAll());

  it("loads via DJAS using the sourceType target's non-id PK (no JOIN, origin_type filter applied)", async () => {
    const author = await DpAuthor.create({ name: "a" });

    const photo = (await DpNonIdPhoto.create({ uuid: "u-photo", title: "p1" })) as any;
    await DpGallery.create({
      dp_author_id: author.id,
      imageable_uuid: photo.uuid,
      imageable_type: "DpNonIdPhoto",
    });

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
      if (event?.payload?.name === "SCHEMA") return;
      if (typeof sql === "string") observed.push(sql);
    });
    try {
      const photos = (await (author as any).noJoinsDpPhotos.toArray()) as any[];
      expect(photos.map((p: any) => p.uuid)).toEqual([photo.uuid]);
      expect(photos.map((p: any) => p.title)).toEqual(["p1"]);
    } finally {
      Notifications.unsubscribe(sub);
    }
    expect(observed.length).toBeGreaterThan(0);
    expect(observed.some((s) => /\bJOIN\b/i.test(s))).toBe(false);
    expect(observed.some((s) => /imageable_type/i.test(s))).toBe(true);
    expect(observed.some((s) => /\bFROM\b\s+["`]?dp_non_id_photos\b.+\buuid\b/i.test(s))).toBe(
      true,
    );
  });

  it("has_one :through polymorphic-source + non-id target PK via DJAS", async () => {
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
      if (event?.payload?.name === "SCHEMA") return;
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
