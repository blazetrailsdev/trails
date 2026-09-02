import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import { Notifications } from "@blazetrails/activesupport";
import { Base, registerModel } from "../index.js";
import { Associations, association } from "../associations.js";
import { fixtures } from "../test-fixtures.js";

describe("DJAS routing widening — sourceType + polymorphic source", () => {
  fixtures([]);

  class RwAuthor extends Base {
    static {
      this._tableName = "rw_authors";
      this.attribute("name", "string");
    }
  }
  class RwComment extends Base {
    static {
      this._tableName = "rw_comments";
      this.attribute("rw_author_id", "integer");
      this.attribute("origin_id", "integer");
      this.attribute("origin_type", "string");
    }
  }
  class RwMember extends Base {
    static {
      this._tableName = "rw_members";
      this.attribute("name", "string");
    }
  }
  class RwOtherOrigin extends Base {
    static {
      this._tableName = "rw_other_origins";
      this.attribute("label", "string");
    }
  }

  beforeAll(async () => {
    await Base.connection.createTable("rw_authors", { force: true }, (t: any) => {
      t.string("name");
    });
    await Base.connection.createTable("rw_comments", { force: true }, (t: any) => {
      t.integer("rw_author_id");
      t.integer("origin_id");
      t.string("origin_type");
    });
    await Base.connection.createTable("rw_members", { force: true }, (t: any) => {
      t.string("name");
    });
    await Base.connection.createTable("rw_other_origins", { force: true }, (t: any) => {
      t.string("label");
    });
    registerModel("RwAuthor", RwAuthor);
    registerModel("RwComment", RwComment);
    registerModel("RwMember", RwMember);
    registerModel("RwOtherOrigin", RwOtherOrigin);
    (RwAuthor as any)._reflections = {};
    (RwComment as any)._reflections = {};

    Associations.hasMany.call(RwAuthor, "rwComments", {
      className: "RwComment",
      foreignKey: "rw_author_id",
    });
    Associations.belongsTo.call(RwComment, "origin", {
      className: "RwMember",
      foreignKey: "origin_id",
      polymorphic: true,
    });
    Associations.hasMany.call(RwAuthor, "noJoinsRwMembers", {
      className: "RwMember",
      through: "rwComments",
      source: "origin",
      sourceType: "RwMember",
      disableJoins: true,
    });
    Associations.hasOne.call(RwAuthor, "rwComment", {
      className: "RwComment",
      foreignKey: "rw_author_id",
    });
    Associations.hasOne.call(RwAuthor, "noJoinsOneRwMember", {
      className: "RwMember",
      through: "rwComment",
      source: "origin",
      sourceType: "RwMember",
      disableJoins: true,
    });
  });

  afterAll(async () => {
    await Base.connection.dropTable("rw_other_origins", "rw_members", "rw_comments", "rw_authors", {
      ifExists: true,
    });
  });

  afterEach(() => {
    Notifications.unsubscribeAll();
  });

  it("routes through DJAS (no JOIN emitted) and filters by source_type", async () => {
    const author = await RwAuthor.create({ name: "a" });
    const m1 = (await RwMember.create({ name: "m1" })) as any;
    const m2 = (await RwMember.create({ name: "m2" })) as any;
    const other = (await RwOtherOrigin.create({ label: "o" })) as any;
    expect(other.id).toBe(m1.id);
    await RwComment.create({
      rw_author_id: author.id,
      origin_id: m1.id,
      origin_type: "RwMember",
    });
    await RwComment.create({
      rw_author_id: author.id,
      origin_id: m2.id,
      origin_type: "RwMember",
    });
    await RwComment.create({
      rw_author_id: author.id,
      origin_id: other.id,
      origin_type: "RwOtherOrigin",
    });

    const observed: string[] = [];
    const sub = Notifications.subscribe("sql.active_record", (event: any) => {
      const sql = event?.payload?.sql;
      if (event?.payload?.name === "SCHEMA") return;
      if (typeof sql === "string") observed.push(sql);
    });
    try {
      const reflection = (RwAuthor as any)._reflectOnAssociation("noJoinsRwMembers");
      const members = (await author.association("noJoinsRwMembers").loadTarget()) as Base[];
      expect(members.map((m: any) => m.id).sort()).toEqual([m1.id, m2.id].sort());
      const count = await association(author, "noJoinsRwMembers").count();
      expect(count).toBe(2);
    } finally {
      Notifications.unsubscribe(sub);
    }
    expect(observed.length).toBeGreaterThan(0);
    expect(observed.some((s) => /\bJOIN\b/i.test(s))).toBe(false);
    expect(observed.some((s) => /origin_type/i.test(s))).toBe(true);
  });

  it("has_one :through polymorphic+sourceType routes through DJAS (no JOIN)", async () => {
    const author = await RwAuthor.create({ name: "a" });
    const member = (await RwMember.create({ name: "m" })) as any;
    const other = (await RwOtherOrigin.create({ label: "o" })) as any;
    await RwComment.create({
      rw_author_id: author.id,
      origin_id: other.id,
      origin_type: "RwOtherOrigin",
    });
    await RwComment.create({
      rw_author_id: author.id,
      origin_id: member.id,
      origin_type: "RwMember",
    });

    const observed: string[] = [];
    const sub = Notifications.subscribe("sql.active_record", (event: any) => {
      const sql = event?.payload?.sql;
      if (event?.payload?.name === "SCHEMA") return;
      if (typeof sql === "string") observed.push(sql);
    });
    let loaded: any;
    try {
      loaded = await (author as any).loadHasOne("noJoinsOneRwMember");
    } finally {
      Notifications.unsubscribe(sub);
    }
    expect(loaded?.id).toBe(member.id);
    expect(observed.some((s) => /\bJOIN\b/i.test(s))).toBe(false);
  });
});
