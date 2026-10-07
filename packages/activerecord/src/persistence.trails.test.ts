import { describe, it, expect } from "vitest";
import { ActiveRecordError, RecordInvalid, registerModel } from "./index.js";
import { fixtures } from "./test-fixtures.js";
import { repairValidations } from "./cases/validations-repair-helper.js";
import { Topic as CanonicalTopic } from "./test-helpers/models/topic.js";
import { Developer as CanonicalDeveloper } from "./test-helpers/models/developer.js";
import { Item as CanonicalItem } from "./test-helpers/models/item.js";
import { ClothingItem } from "./test-helpers/models/clothing-item.js";
import { Minimalistic } from "./test-helpers/models/minimalistic.js";
import { Minivan } from "./test-helpers/models/minivan.js";
import { Aircraft } from "./test-helpers/models/aircraft.js";
import { Post as CanonicalPost, SpecialPost } from "./test-helpers/models/post.js";
import { Comment } from "./test-helpers/models/comment.js";
import { Company, Firm } from "./test-helpers/models/company.js";
import { captureSql } from "./testing/sql-capture.js";
import { Notifications } from "@blazetrails/activesupport";
import type { Base } from "./base.js";
import { queryConstraints, queryConstraintsList } from "./persistence.js";

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

  it("reload replaces the attributes of a record loaded with a selected alias", async () => {
    const topic = (await Topic.select("id, title AS aliased_title").first()) as InstanceType<
      typeof Topic
    >;
    expect(topic.readAttribute("aliased_title")).toBe("The First Topic");

    await topic.reload();

    expect(topic.hasAttribute("aliased_title")).toBe(false);
    expect(topic.readAttribute("aliased_title")).toBeNull();
    expect(topic.title).toBe("The First Topic");
  });

  it("create awaits an async block before saving", async () => {
    const topic = await Topic.create({ title: "before" }, async (t: Base) => {
      await new Promise((resolve) => setTimeout(resolve, 20));
      (t as InstanceType<typeof Topic>).title = "after";
    });
    expect((await Topic.find(topic.id)).title).toBe("after");
  });

  it("create! awaits an async block before saving", async () => {
    const topic = await Topic.createBang({ title: "before" }, async (t: Base) => {
      await new Promise((resolve) => setTimeout(resolve, 20));
      (t as InstanceType<typeof Topic>).title = "after";
    });
    expect((await Topic.find(topic.id)).title).toBe("after");
  });

  it("a bare new runs the block and the initialize callbacks once", () => {
    class Counted extends Topic {}
    let initialized = 0;
    Counted.afterInitialize(() => {
      initialized += 1;
    });
    let yielded = 0;
    const topic = new Counted({ title: "a" }, () => {
      yielded += 1;
    });
    expect(topic).toBeInstanceOf(Counted);
    expect([initialized, yielded]).toEqual([1, 1]);
  });

  it("a bare new is Class#new: it skips the abstract check and the STI dispatch", () => {
    class Abstract extends Topic {
      static override abstractClass = true;
    }
    expect(new Abstract()).toBeInstanceOf(Abstract);
    expect(() => Abstract.new()).toThrow("is an abstract class and cannot be instantiated.");
    expect(new Company({ type: "Firm" }).constructor).toBe(Company);
    expect(Company.new({ type: "Firm" }).constructor).toBe(Firm);
  });

  it("create inside a scope keeps an explicit attribute over the scope's", async () => {
    const scope = Topic.where({ title: "scoped", author_name: "Scope" });
    const topic = await scope.scoping(() => Topic.create({ title: "explicit" }));
    expect([topic.title, topic.author_name]).toEqual(["explicit", "Scope"]);
    const built = scope.scoping(() => Topic.new({ title: "explicit" }));
    expect([built.title, built.author_name]).toEqual(["explicit", "Scope"]);
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

      expect(await Topic.all().where({ title: "first" }).isExists()).toBe(true);
      expect(await Topic.all().where({ title: "third" }).isExists()).toBe(false);
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

    const before = await Aircraft.count();
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

describe("Persistence.queryConstraintsList (trails)", () => {
  const host = (
    primaryKey: string | string[],
    baseClass?: object,
  ): ThisParameterType<typeof queryConstraintsList> => {
    const klass: Record<string, unknown> = {
      primaryKey,
      isBaseClass: () => baseClass === undefined,
    };
    klass.baseClass = baseClass ?? klass;
    return klass as unknown as ThisParameterType<typeof queryConstraintsList>;
  };

  it("answers a base class's composite primary key and nil for a single one", () => {
    expect(queryConstraintsList.call(host(["shop_id", "id"]))).toEqual(["shop_id", "id"]);
    expect(queryConstraintsList.call(host("id"))).toBeNull();
  });

  it("reads the base class's list when a subclass shares its primary key", () => {
    const base = host(["shop_id", "id"]);
    queryConstraints.call(base, "tenant_id", "id");
    expect(queryConstraintsList.call(host(["shop_id", "id"], base))).toEqual(["tenant_id", "id"]);
  });

  it("answers a subclass's own primary key when it differs from the base class's", () => {
    const base = host(["shop_id", "id"]);
    expect(queryConstraintsList.call(host(["region_id", "id"], base))).toEqual(["region_id", "id"]);
    expect(queryConstraintsList.call(host("uuid", base))).toBeNull();
  });

  it("memoizes on the class it was asked of, not on a subclass's parent", () => {
    const base = host(["shop_id", "id"]);
    const sub = Object.create(base, {
      primaryKey: { value: ["region_id", "id"] },
      isBaseClass: { value: () => false },
      baseClass: { value: base },
    });
    expect(queryConstraintsList.call(base)).toEqual(["shop_id", "id"]);
    expect(queryConstraintsList.call(sub)).toEqual(["region_id", "id"]);
  });
});

describe("PersistenceTest#verifyReadonlyAttribute (trails)", () => {
  fixtures(["minivans"]);

  it("raises ActiveRecordError with Rails' message", async () => {
    const minivan = await Minivan.find("m1");
    await expect(minivan.updateColumn("color", "black")).rejects.toThrow(
      new ActiveRecordError("color is marked as readonly"),
    );
  });
});

describe("PersistenceTest (trails)", () => {
  fixtures(["posts", "comments"]);

  it("new and create inside a scope on an association take the scope's foreign key", async () => {
    const post = await CanonicalPost.first();
    const scope = Comment.where({ post });
    const built = scope.scoping(() => Comment.new({ body: "built" }));
    expect(built.post_id).toBe(post!.id);
    const created = await scope.scoping(() => Comment.create({ body: "created" }));
    expect((await Comment.find(created.id)).post_id).toBe(post!.id);
  });
});
