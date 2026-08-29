import { describe, it, expect } from "vitest";
import { RecordInvalid, registerModel } from "./index.js";
import { fixtures } from "./test-fixtures.js";
import { repairValidations } from "./cases/validations-repair-helper.js";
import { Topic as CanonicalTopic } from "./test-helpers/models/topic.js";
import { Developer as CanonicalDeveloper } from "./test-helpers/models/developer.js";
import { Item as CanonicalItem } from "./test-helpers/models/item.js";
import { ClothingItem } from "./test-helpers/models/clothing-item.js";
import { Minimalistic } from "./test-helpers/models/minimalistic.js";
import { Aircraft } from "./test-helpers/models/aircraft.js";
import { Post as CanonicalPost, SpecialPost } from "./test-helpers/models/post.js";
import { Company } from "./test-helpers/models/company.js";
import { captureSql } from "./testing/sql-capture.js";
import { Notifications } from "@blazetrails/activesupport";
import type { Base } from "./base.js";

describe("PersistenceTest (trails)", () => {
  const Topic = CanonicalTopic;
  fixtures(["topics", "developers"]);

  it("update with parallel ids + attrs arrays updates each record", async () => {
    const t1 = await Topic.create({ title: "a" });
    const t2 = await Topic.create({ title: "b" });
    const result = await Topic.update([t1.id, t2.id], [{ title: "x" }, { title: "y" }]);
    expect(result).toHaveLength(2);
    expect((await Topic.find(t1.id)).title).toBe("x");
    expect((await Topic.find(t2.id)).title).toBe("y");
  });

  it("update with just attrs applies to every record in scope (:all default)", async () => {
    await Topic.create({ title: "a" });
    await Topic.create({ title: "b" });
    const result = await Topic.update({ title: "same" });
    const all = await Topic.all();
    expect(result).toHaveLength(all.length);
    expect(all.every((t) => t.title === "same")).toBe(true);
  });

  it("create with an array recurses and returns an array of records", async () => {
    const result = await Topic.create([{ title: "a" }, { title: "b" }]);
    expect(result).toHaveLength(2);
    expect(result[0].isPersisted()).toBe(true);
    expect(result.map((t) => t.title)).toEqual(["a", "b"]);
  });

  it("createBang with an array recurses and returns an array of records", async () => {
    const result = await Topic.createBang([{ title: "a" }, { title: "b" }]);
    expect(result).toHaveLength(2);
    expect(result.every((t) => t.isPersisted())).toBe(true);
  });

  it("build is an alias for new and supports array + block", () => {
    const single = Topic.build({ title: "a" }, (r) => {
      r.title = "mutated";
    });
    expect(single.isNewRecord()).toBe(true);
    expect(single.title).toBe("mutated");

    const many = Topic.build([{ title: "b" }, { title: "c" }]);
    expect(many).toHaveLength(2);
    expect(many.every((t) => t.isNewRecord())).toBe(true);
  });

  it("new with an array returns unsaved records", () => {
    const result = Topic.new([{ title: "a" }, { title: "b" }]);
    expect(result).toHaveLength(2);
    expect(result.every((t) => t.isNewRecord())).toBe(true);
  });

  it("create yields to block before save", async () => {
    const t = await Topic.create({ title: "a" }, (record) => {
      record.title = "mutated-by-block";
    });
    expect(t.title).toBe("mutated-by-block");
    expect(t.isPersisted()).toBe(true);
    const reloaded = await Topic.find(t.id);
    expect(reloaded.title).toBe("mutated-by-block");
  });

  it("createBang with an array stops at the first invalid record", async () => {
    await repairValidations(Topic, async () => {
      Topic.validatesPresenceOf("title");

      await expect(
        Topic.createBang([{ title: "first" }, { title: "" }, { title: "third" }]),
      ).rejects.toThrow();

      expect(await Topic.all().where({ title: "first" }).exists()).toBe(true);
      expect(await Topic.all().where({ title: "third" }).exists()).toBe(false);
    });
  });

  it("create with array yields to block for each record", async () => {
    let calls = 0;
    await Topic.create([{ title: "a" }, { title: "b" }], () => {
      calls++;
    });
    expect(calls).toBe(2);
  });

  it("update rejects a Base instance", async () => {
    const t = await Topic.create({ title: "a" });
    const update = Topic.update as (ids: unknown, attrs: unknown) => Promise<unknown>;
    await expect(update(t, { title: "x" })).rejects.toThrow(/ActiveRecord::Base/);
  });

  it("save! runs validations before the destroyed guard", async () => {
    const developer = CanonicalDeveloper.new({ name: "DC", salary: 1_000_000 });
    (developer as unknown as { _destroyed: boolean })._destroyed = true;
    await expect(developer.saveBang()).rejects.toThrow(RecordInvalid);
  });
});

describe("PersistenceTest (trails)", () => {
  fixtures(["items"]);

  const Item = CanonicalItem;

  it("destroyBy destroys matching records with callbacks", async () => {
    await Item.create({ name: "A" });
    await Item.create({ name: "B" });
    await Item.create({ name: "A" });

    const destroyed = await Item.destroyBy({ name: "A" });
    expect(destroyed).toHaveLength(2);
    expect(await Item.where({ name: "A" }).count()).toBe(0);
    expect(await Item.where({ name: "B" }).count()).toBe(1);
  });

  it("deleteBy deletes matching records without callbacks", async () => {
    await Item.create({ name: "A" });
    await Item.create({ name: "B" });

    const count = await Item.deleteBy({ name: "A" });
    expect(count).toBe(1);
    expect(await Item.where({ name: "A" }).count()).toBe(0);
    expect(await Item.where({ name: "B" }).count()).toBe(1);
  });
});

describe("PersistenceTest (trails)", () => {
  const { clothingItems } = fixtures(["clothingItems"]);

  it("updateColumns targets query_constraints columns in the WHERE", async () => {
    const clothingItem = clothingItems("green_t_shirt");
    const sqls = await captureSql(async () => {
      await clothingItem.updateColumns({ description: "Lovely green t-shirt" });
    });
    const sql = sqls.find((s) => /^UPDATE/.test(s.trimStart())) ?? "";
    expect(sql).toMatch(/WHERE .*clothing_type/);
    expect(sql).toMatch(/WHERE .*color/);

    const reloaded = await ClothingItem.findBy({ id: clothingItem.id });
    expect(reloaded?.description).toBe("Lovely green t-shirt");
  });
});

describe("PersistenceTest (trails)", () => {
  fixtures(["topics"]);

  it("persist inherited class with different table name and predeclared attribute", async () => {
    await Minimalistic.create({});

    class MinimalisticAircraft extends Minimalistic {
      static _tableName = "aircraft";
      static {
        this.attribute("wingspan", "integer");
      }
    }
    registerModel(MinimalisticAircraft);

    void Aircraft.resetColumnInformation();

    const before = (await Aircraft.count()) as number;
    const aircraft = (await MinimalisticAircraft.create({ name: "Wright Flyer" })) as unknown as {
      name: string | null;
      wingspan: unknown;
      save: () => Promise<unknown>;
    };
    aircraft.name = "Wright Glider";
    await aircraft.save();
    expect(await Aircraft.count()).toBe(before + 1);

    const last = (await Aircraft.last()) as unknown as { name: string | null } | null;
    expect(last?.name).toBe("Wright Glider");
    expect(MinimalisticAircraft.columnNames()).not.toContain("expires_at");
    expect(MinimalisticAircraft.columnNames()).toContain("name");
    expect(aircraft.wingspan).toBeNull();
  });
});

describe("PersistenceTest (trails)", () => {
  fixtures(["companies"]);

  it("becomes bypasses the abstract-instantiation guard", async () => {
    class AbstractFirm extends Company {
      static {
        this.abstractClass = true;
      }
    }
    const company = await Company.first();
    const asAbstract = company!.becomes(AbstractFirm as never);
    expect(asAbstract).toBeInstanceOf(AbstractFirm);
    expect((asAbstract as unknown as { id: unknown }).id).toBe(company!.id);
  });
});

describe("PersistenceTest (trails)", () => {
  fixtures(["posts"]);

  it("prefetched pk is re-cast through the primary key's default attribute", async () => {
    class PostWithStringSequence extends (CanonicalPost as unknown as typeof Base) {
      static _tableName = "posts";
      static isPrefetchPrimaryKey(): boolean {
        return true;
      }
      static nextSequenceValue(): number {
        return "654321" as unknown as number;
      }
    }
    registerModel(PostWithStringSequence as never);

    let insertSql: string | null = null;
    let insertBinds: unknown[] = [];
    const sub = Notifications.subscribe("sql.active_record", (event: unknown) => {
      const payload = (event as { payload?: Record<string, unknown> }).payload;
      if (typeof payload?.sql === "string" && payload.sql.startsWith("INSERT")) {
        insertSql = payload.sql;
        insertBinds = (payload.type_casted_binds ?? []) as unknown[];
      }
    });
    try {
      await PostWithStringSequence.create({ title: "prefetched", body: "b" });
    } finally {
      Notifications.unsubscribe(sub);
    }

    expect(insertSql).not.toBeNull();

    const emitted = [
      insertSql ?? "",
      ...insertBinds.map((b) => (typeof b === "string" ? `'${b}'` : String(b))),
    ].join(" | ");

    expect(emitted).toContain("654321");
    expect(emitted).not.toContain("'654321'");
  });
});

describe("PersistenceTest (trails)", () => {
  fixtures(["posts"]);

  it("becomes on a partially selected record keeps the missing attributes missing", async () => {
    const post = (await CanonicalPost.select("id").first())!;
    const special = post.becomes(SpecialPost);

    expect(special.id).toBe(post.id);
    expect(() => (special as unknown as { title: string }).title).toThrow(
      /missing attribute|title/i,
    );
  });
});
