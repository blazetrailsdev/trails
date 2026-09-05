import { Temporal, Time as RubyTime } from "@blazetrails/date";
import { instant } from "@blazetrails/activesupport/testing/temporal-helpers";

function epochMs(v: unknown): number {
  if (v instanceof RubyTime) return v.toF() * 1000;
  if (v instanceof Temporal.Instant) return v.epochMilliseconds;
  throw new TypeError(`epochMs: unsupported type ${(v as object)?.constructor?.name}`);
}
function isTemporalDatetime(v: unknown): boolean {
  return v instanceof RubyTime;
}
import { describe, it, expect, beforeAll } from "vitest";
import { throwAbort, travel, travelBack } from "@blazetrails/activesupport";
import { ArgumentError } from "@blazetrails/activemodel";
import {
  Base,
  RecordNotFound,
  RecordInvalid,
  RecordNotSaved,
  RecordNotDestroyed,
  ActiveRecordError,
  registerModel,
} from "./index.js";
import type { PostgreSQLAdapter } from "./connection-adapters/postgresql-adapter.js";

import { fixtures } from "./test-fixtures.js";
import { adapterType } from "./test-adapter.js";
import { adapterSupports } from "./support/supports.js";
import { ChatMessage, ChatMessageCustomPk } from "./test-helpers/models/chat-message.js";
import { captureSql } from "./testing/sql-capture.js";
import { ClothingItem, ClothingItemSized } from "./test-helpers/models/clothing-item.js";
import { Dashboard } from "./test-helpers/models/dashboard.js";
import { queryConstraints, queryConstraintsList } from "./persistence.js";
import { Topic as CanonicalTopic, TitlePrimaryKeyTopic } from "./test-helpers/models/topic.js";
import { Minimalistic } from "./test-helpers/models/minimalistic.js";
import { PostWithPrefetchedPk } from "./test-helpers/models/post-with-prefetched-pk.js";
import { Account } from "./test-helpers/models/account.js";
import {
  Reply,
  SillyReply,
  UniqueReply,
  SillyUniqueReply,
  WrongReply,
} from "./test-helpers/models/reply.js";
import { Item as CanonicalItem } from "./test-helpers/models/item.js";
import {
  Developer as CanonicalDeveloper,
  DeveloperCalledDavid,
  AuditLog,
} from "./test-helpers/models/developer.js";
import { Parrot, LiveParrot } from "./test-helpers/models/parrot.js";
import { Post as CanonicalPost, SpecialPost } from "./test-helpers/models/post.js";
import { CpkBook, CpkOrder, CpkBestSeller } from "./test-helpers/models/cpk.js";
import { Minivan } from "./test-helpers/models/minivan.js";
import { Aircraft } from "./test-helpers/models/aircraft.js";
import { Default } from "./test-helpers/models/default.js";
import { PkAutopopulatedByATriggerRecord } from "./test-helpers/models/pk-autopopulated-by-a-trigger-record.js";
import { Company, LargeClient, Client, Firm } from "./test-helpers/models/company.js";
import { AdminUser } from "./test-helpers/models/admin/user.js";
import { MissingAttributeError } from "@blazetrails/activemodel";
import { AutoId } from "./test-helpers/models/auto-id.js";
import { Person } from "./test-helpers/models/person.js";
import { Car } from "./test-helpers/models/car.js";
import { Ship } from "./test-helpers/models/ship.js";
import { sql as arelSql } from "@blazetrails/arel";

for (const klass of [
  CanonicalTopic,
  Minimalistic,
  Account,
  ClothingItem,
  Reply,
  SillyReply,
  UniqueReply,
  SillyUniqueReply,
  CanonicalItem,
  CanonicalDeveloper,
  Parrot,
  CanonicalPost,
  CpkBook,
  CpkOrder,
  Minivan,
  Company,
  Firm,
  LargeClient,
  Client,
  AdminUser,
  AutoId,
  Person,
  Car,
  WrongReply,
  DeveloperCalledDavid,
  Dashboard,
  CpkBestSeller,
  ClothingItemSized,
  AuditLog,
  Ship,
]) {
  registerModel(klass);
}

describe("PersistenceTest", () => {
  const Topic = CanonicalTopic;
  const { topics, accounts, clothingItems } = fixtures([
    "topics",
    "minimalistics",
    "accounts",
    "clothingItems",
  ]);

  beforeAll(async () => {
    await AutoId.loadSchema();
  });

  it("populates autoincremented id pk regardless of its position in columns list", async () => {
    const autoPopulatedColumnNames = AutoId.columns()
      .filter((c: { isAutoPopulated(): boolean }) => c.isAutoPopulated())
      .map((c: { name: string }) => c.name);

    expect(autoPopulatedColumnNames.length).toBeGreaterThan(1);
    expect(autoPopulatedColumnNames[0]).not.toBe(AutoId.primaryKey);

    const record = await AutoId.createBang();
    const lastId = (await AutoId.last())!.id;

    expect(lastId).not.toBeNull();
    expect(lastId).toBeGreaterThan(0);
    expect(lastId).toBe(record.id);
  });

  it("create", async () => {
    const topic = new Topic();
    topic.title = "New Topic";
    await topic.save();
    const reloaded = await Topic.find(topic.id);
    expect((reloaded as any).title).toBe("New Topic");
  });

  it("populates non primary key autoincremented column", async () => {
    const topic = await TitlePrimaryKeyTopic.createBang({ title: "title pk topic" });

    expect(topic.attributes["id"]).not.toBeNull();
  });

  it("save for record with only primary key", async () => {
    const m = new Minimalistic();
    await m.save();
    expect(m.isPersisted()).toBe(true);
  });

  it("update!", async () => {
    const t = await Topic.create({ title: "old" });
    await t.updateBang({ title: "new" });
    expect(t.title).toBe("new");
  });

  it("update attribute", async () => {
    const t = await Topic.create({ title: "old" });
    await t.updateAttribute("title", "new");
    expect(t.title).toBe("new");
  });

  it("destroy!", async () => {
    const t = await Topic.create({ title: "a" });
    await t.destroyBang();
    expect(t.isDestroyed()).toBe(true);
  });

  it("destroyed returns boolean", async () => {
    const t = await Topic.create({ title: "a" });
    expect(t.isDestroyed()).toBe(false);
    await t.destroy();
    expect(t.isDestroyed()).toBe(true);
  });

  it("class level delete", async () => {
    const t = await Topic.create({ title: "a" });
    await Topic.delete(t.id);
    expect(await Topic.exists(t.id)).toBe(false);
  });

  it("delete all", async () => {
    await Topic.create({ title: "a" });
    await Topic.create({ title: "b" });
    const before = (await Topic.count()) as number;
    expect(before).toBeGreaterThan(0);
    expect(await Topic.all().deleteAll()).toBe(before);
    expect(await Topic.count()).toBe(0);
  });

  it("update after create", async () => {
    const t = await Topic.create({ title: "original" });
    t.title = "updated";
    await t.save();
    expect(t.title).toBe("updated");
  });

  it("update does not run sql if record has not changed", async () => {
    const t = await Topic.create({ title: "a" });
    const result = await t.save();
    expect(result).toBe(true);
  });

  it("increment attribute", async () => {
    const a = accounts("signals37");
    expect(a.credit_limit).toBe(50);

    await a.incrementBang("credit_limit");
    await a.reload();
    expect(a.credit_limit).toBe(51);

    await a.increment("credit_limit").incrementBang("credit_limit");
    await a.reload();
    expect(a.credit_limit).toBe(53);
  });

  it("increment attribute by", async () => {
    const a = accounts("signals37");
    expect(a.credit_limit).toBe(50);

    await a.incrementBang("credit_limit", 5);
    await a.reload();
    expect(a.credit_limit).toBe(55);

    await a.increment("credit_limit", 1).incrementBang("credit_limit", 3);
    await a.reload();
    expect(a.credit_limit).toBe(59);
  });

  it("increment aliased attribute", async () => {
    const a = accounts("signals37") as any;
    expect(a.available_credit).toBe(50);

    await a.incrementBang("available_credit");
    await a.reload();
    expect(a.available_credit).toBe(51);

    await a.increment("available_credit").incrementBang("available_credit");
    await a.reload();
    expect(a.available_credit).toBe(53);
  });

  it("increment nil attribute", async () => {
    const topic = topics("first") as any;
    expect(topic.parent_id).toBeNull();
    await topic.incrementBang("parent_id");
    expect(topic.parent_id).toBe(1);
  });

  it("increment updates counter in db using offset", async () => {
    const a1 = accounts("signals37");
    const initialCredit = a1.credit_limit;
    const a2 = await Account.find(a1.id);
    await a1.incrementBang("credit_limit");
    await a2.incrementBang("credit_limit");
    await a1.reload();
    expect(a1.credit_limit).toBe(initialCredit + 2);
  });

  it("decrement attribute", async () => {
    const a = accounts("signals37");
    expect(a.credit_limit).toBe(50);

    await a.decrementBang("credit_limit");
    await a.reload();
    expect(a.credit_limit).toBe(49);

    await a.decrement("credit_limit").decrementBang("credit_limit");
    await a.reload();
    expect(a.credit_limit).toBe(47);
  });

  it("decrement attribute by", async () => {
    const a = accounts("signals37");
    expect(a.credit_limit).toBe(50);

    await a.decrementBang("credit_limit", 5);
    await a.reload();
    expect(a.credit_limit).toBe(45);

    await a.decrement("credit_limit", 1).decrementBang("credit_limit", 3);
    await a.reload();
    expect(a.credit_limit).toBe(41);
  });

  it("save with duping of destroyed object", async () => {
    const t = await Topic.create({ title: "a" });
    await t.destroy();
    const d = t.dup();
    expect(d.isNewRecord()).toBe(true);
  });

  it("find raises record not found exception", async () => {
    await expect(Topic.find(999)).rejects.toThrow(RecordNotFound);
  });

  it("becomes", async () => {
    const t = topics("first");
    expect(t.becomes(Reply)).toBeInstanceOf(Reply);
    expect(t.becomes(Reply).title).toBe("The First Topic");
  });

  it("update attribute for aborted callback!", async () => {
    class Klass extends Topic {
      static name = "Topic";
      static {
        this.beforeUpdate(() => throwAbort());
      }
    }
    const t = await Klass.create({ title: "New Topic", author_name: "Not David" });

    await expect((t as any).updateAttributeBang("title", "super_title")).rejects.toThrow(
      RecordNotSaved,
    );

    const tReloaded = await Topic.find((t as any).id);
    expect((tReloaded as any).title).toBe("New Topic");
  });

  it("becomes default sti subclass", async () => {
    const adapter = (await Topic.leaseConnection()) as any;
    const originalType = (Topic as any).columnsHash()["type"].default;
    try {
      await adapter.changeColumnDefault("topics", "type", { from: originalType, to: "Reply" });
      await Topic.resetColumnInformation();

      const reply = topics("second");
      expect(reply).toBeInstanceOf(Reply);

      const topic = reply.becomes(Topic);
      expect((topic as any).constructor).toBe(Topic);
    } finally {
      await adapter.changeColumnDefault("topics", "type", { from: "Reply", to: originalType });
      void Topic.resetColumnInformation();
    }
  });

  it("reset column information resets children", async () => {
    const adapter = (await Topic.leaseConnection()) as any;
    class Child extends Topic {}
    new Child();

    try {
      await adapter.addColumn("topics", "foo", "string");
      await Topic.resetColumnInformation();

      const child = new Child();
      expect("foo" in child).toBe(true);
      expect(typeof (child as any).fooChanged).toBe("function");
      expect((new Child({ foo: "bar" }) as any).foo).toBe("bar");
    } finally {
      await adapter.removeColumn("topics", "foo");
      void Topic.resetColumnInformation();
    }
  });

  it("class level update without ids", async () => {
    const t = await Topic.create({ title: "old" });
    await Topic.update(t.id, { title: "new" });
    const reloaded = await Topic.find(t.id);
    expect(reloaded.title).toBe("new");
  });

  it("update many", async () => {
    const t1 = await Topic.create({ title: "a" });
    const t2 = await Topic.create({ title: "b" });
    await Topic.update(t1.id, { title: "x" });
    await Topic.update(t2.id, { title: "y" });
    const r1 = await Topic.find(t1.id);
    const r2 = await Topic.find(t2.id);
    expect(r1.title).toBe("x");
    expect(r2.title).toBe("y");
  });

  it("update uses query constraints config", async () => {
    const clothingItem = clothingItems("green_t_shirt");
    const sqls = await captureSql(async () => {
      await (clothingItem as any).update({ description: "Lovely green t-shirt" });
    });
    const sql = sqls.find((s) => /^UPDATE/.test(s.trimStart())) ?? "";
    expect(sql).toMatch(/WHERE .*clothing_type/);
    expect(sql).toMatch(/WHERE .*color/);
  });

  it("destroy uses query constraints config", async () => {
    const clothingItem = clothingItems("green_t_shirt");
    const sqls = await captureSql(async () => {
      await (clothingItem as any).destroy();
    });
    const sql = sqls.find((s) => /^DELETE/.test(s.trimStart())) ?? "";
    expect(sql).toMatch(/WHERE .*clothing_type/);
    expect(sql).toMatch(/WHERE .*color/);
  });

  it("delete uses query constraints config", async () => {
    const clothingItem = clothingItems("green_t_shirt");
    const sqls = await captureSql(async () => {
      await (clothingItem as any).delete();
    });
    const sql = sqls.find((s) => /^DELETE/.test(s.trimStart())) ?? "";
    expect(sql).toMatch(/WHERE .*clothing_type/);
    expect(sql).toMatch(/WHERE .*color/);
  });

  it("save uses query constraints config", async () => {
    const clothingItem = clothingItems("green_t_shirt");
    clothingItem.description = "Lovely green t-shirt";
    const sqls = await captureSql(async () => {
      await clothingItem.save();
    });
    const sql = sqls.find((s) => /^UPDATE/.test(s.trimStart())) ?? "";
    expect(sql).toMatch(/WHERE .*clothing_type/);
    expect(sql).toMatch(/WHERE .*color/);
  });

  it("reload uses query constraints config", async () => {
    const clothingItem = clothingItems("green_t_shirt");
    const sqls = await captureSql(async () => {
      await clothingItem.reload();
    });
    const sql = sqls.find((s) => /^SELECT/.test(s.trimStart())) ?? "";
    expect(sql).toMatch(/WHERE .*clothing_type/);
    expect(sql).toMatch(/WHERE .*color/);
  });

  it("update attribute uses query constraints config", async () => {
    const clothingItem = clothingItems("green_t_shirt");
    const sqls = await captureSql(async () => {
      await clothingItem.updateAttribute("description", "Lovely green t-shirt");
    });
    const sql = sqls.find((s) => /^UPDATE/.test(s.trimStart())) ?? "";
    expect(sql).toMatch(/WHERE .*clothing_type/);
    expect(sql).toMatch(/WHERE .*color/);
  });

  it("it is possible to update parts of the query constraints config", async () => {
    const clothingItem = clothingItems("green_t_shirt");
    clothingItem.color = "blue";
    clothingItem.description = "Now it's a blue t-shirt";
    const sqls = await captureSql(async () => {
      await clothingItem.save();
    });
    const sql = sqls.find((s) => /^UPDATE/.test(s.trimStart())) ?? "";
    expect(sql).toMatch(/WHERE .*clothing_type/);
    expect(sql).toMatch(/WHERE .*color/);

    const found = await ClothingItem.findBy({ id: clothingItem.id });
    expect((found as any).color).toBe("blue");
  });
});

describe("PersistenceTest", () => {
  const Topic = CanonicalTopic;
  const Post = CanonicalPost;
  const { topics } = fixtures(["topics", "developers", "parrots", "posts"]);

  it("raises error when validations failed", async () => {
    await expect(CanonicalDeveloper.updateBang({ salary: 1_000_000 })).rejects.toThrow(
      RecordInvalid,
    );
  });

  it("returns object even if validations failed", async () => {
    const all = await CanonicalDeveloper.all();
    const result = await CanonicalDeveloper.update({ salary: 1_000_000 });
    expect(result.map((d) => d.id)).toEqual(all.map((d) => d.id));
  });

  it("class level update is affected by scoping", async () => {
    const topicData: Record<number, { content: string }> = {
      1: { content: "1 updated" },
      2: { content: "2 updated" },
    };

    await expect(
      Topic.where("1=0").scoping(async () => Topic.update([1, 2], [topicData[1], topicData[2]])),
    ).rejects.toThrow(RecordNotFound);

    expect((await Topic.find(1)).content).not.toBe("1 updated");
    expect((await Topic.find(2)).content).not.toBe("2 updated");
  });

  it("save touch false", async () => {
    const parrot = await Parrot.createBang({
      name: "Bob",
      created_at: instant("2003-07-15T14:28:11.223Z"),
      updated_at: instant("2003-07-15T14:28:11.223Z"),
    });

    const createdAt = parrot.created_at;
    const updatedAt = parrot.updated_at;

    parrot.name = "Barb";
    await parrot.saveBang({ touch: false });
    expect(parrot.created_at).toEqual(createdAt);
    expect(parrot.updated_at).toEqual(updatedAt);
  });

  it("increment with no arg", async () => {
    const topic = topics("first");
    await expect((topic as any).incrementBang()).rejects.toThrow();
  });

  it("reload removes custom selects", async () => {
    const post = await Post.select("posts.*, 1 as wibble").lastBang();

    expect(Number(post.readAttribute("wibble"))).toBe(1);
    await post.reload();
    expect(post.readAttribute("wibble")).toBeNull();
  });
});

describe("PersistenceTest", () => {
  const Topic = CanonicalTopic;
  const { topics } = fixtures(["topics", "companies"]);

  it("build", () => {
    const topic = Topic.build({ title: "New Topic" });
    expect(topic.title).toBe("New Topic");
    expect(topic.isPersisted()).toBe(false);
  });

  it("build many", () => {
    const built = Topic.build([{ title: "first" }, { title: "second" }]);
    expect(built.map((t) => t.title)).toEqual(["first", "second"]);
    built.forEach((t) => expect(t.isPersisted()).toBe(false));
  });

  it("save null string attributes", async () => {
    const topic = await Topic.find(1);
    await topic.assignAttributes({ title: "null", author_name: "null" });
    await topic.saveBang();
    await topic.reload();
    expect(topic.title).toBe("null");
    expect(topic.author_name).toBe("null");
  });

  it("save nil string attributes", async () => {
    const topic = await Topic.find(1);
    (topic as any).title = null;
    await topic.saveBang();
    await topic.reload();
    expect(topic.title).toBeNull();
  });

  it("create many", async () => {
    const created = await Topic.create([{ title: "first" }, { title: "second" }]);
    expect(created).toHaveLength(2);
    expect(created[0].title).toBe("first");
  });

  it("delete many", async () => {
    const originalCount = (await Topic.count()) as number;
    await Topic.delete([1, 2]);
    expect(await Topic.count()).toBe(originalCount - 2);
  });

  it("update many with duplicated ids", async () => {
    const updated = await Topic.update(
      [1, 1, 2],
      [{ content: "1 duplicated" }, { content: "1 updated" }, { content: "2 updated" }],
    );
    expect(updated.map((t) => Number(t.id))).toEqual([1, 1, 2]);
    expect(updated[0]).not.toBe(updated[1]);
    expect((await Topic.find(1)).content).toBe("1 updated");
    expect((await Topic.find(2)).content).toBe("2 updated");
  });

  it("update many with invalid id", async () => {
    await expect(
      Topic.update([1, 2, 99999], [{ content: "1 updated" }, { content: "2 updated" }, {}]),
    ).rejects.toThrow(RecordNotFound);
    expect((await Topic.find(1)).content).not.toBe("1 updated");
    expect((await Topic.find(2)).content).not.toBe("2 updated");
  });

  it("update many with active record base object", async () => {
    await expect((Topic as any).update(topics("first"), { content: "1 updated" })).rejects.toThrow(
      "You are passing an instance of ActiveRecord::Base to `update`. " +
        "Please pass the id of the object by calling `.id`.",
    );
    expect((await Topic.find(1)).content).not.toBe("1 updated");
  });

  it("update many with array of active record base objects", async () => {
    await expect(
      (Topic as any).update([topics("first"), topics("second")], { content: "updated" }),
    ).rejects.toThrow(
      "You are passing an array of ActiveRecord::Base instances to `update`. " +
        "Please pass the ids of the objects by calling `pluck(:id)` or `map(&:id)`.",
    );
    expect((await Topic.find(1)).content).not.toBe("updated");
    expect((await Topic.find(2)).content).not.toBe("updated");
  });

  it("update many with duplicated ids!", async () => {
    const updated = await Topic.updateBang(
      [1, 1, 2],
      [{ content: "1 duplicated" }, { content: "1 updated" }, { content: "2 updated" }],
    );
    expect(updated.map((t: any) => Number(t.id))).toEqual([1, 1, 2]);
    expect((await Topic.find(1)).content).toBe("1 updated");
    expect((await Topic.find(2)).content).toBe("2 updated");
  });

  it("update many with invalid id!", async () => {
    await expect(
      Topic.updateBang([1, 2, 99999], [{ content: "1 updated" }, { content: "2 updated" }, {}]),
    ).rejects.toThrow(RecordNotFound);
    expect((await Topic.find(1)).content).not.toBe("1 updated");
    expect((await Topic.find(2)).content).not.toBe("2 updated");
  });

  it("update many with active record base object!", async () => {
    await expect(
      (Topic as any).updateBang(topics("first"), { content: "1 updated" }),
    ).rejects.toThrow(
      "You are passing an instance of ActiveRecord::Base to `update!`. " +
        "Please pass the id of the object by calling `.id`.",
    );
    expect((await Topic.find(1)).content).not.toBe("1 updated");
  });

  it("update many with array of active record base objects!", async () => {
    await expect(
      (Topic as any).updateBang([topics("first"), topics("second")], { content: "updated" }),
    ).rejects.toThrow(
      "You are passing an array of ActiveRecord::Base instances to `update!`. " +
        "Please pass the ids of the objects by calling `pluck(:id)` or `map(&:id)`.",
    );
    expect((await Topic.find(1)).content).not.toBe("updated");
    expect((await Topic.find(2)).content).not.toBe("updated");
  });

  it("update object", async () => {
    const topic = new Topic();
    topic.title = "Another New Topic";
    (topic as any).written_on = "2003-12-12 23:23:00";
    await topic.save();
    const topicReloaded = await Topic.find(topic.id);
    expect(topicReloaded.title).toBe("Another New Topic");

    topicReloaded.title = "Updated topic";
    await topicReloaded.save();

    const topicReloadedAgain = await Topic.find(topic.id);
    expect(topicReloadedAgain.title).toBe("Updated topic");
  });

  it("update all", async () => {
    const updateAll = (u: unknown) => (Topic as any).updateAll(u) as Promise<number>;
    expect(await updateAll("content = 'bulk updated!'")).toBe(await Topic.count());
    expect((await Topic.find(1)).content).toBe("bulk updated!");
    expect((await Topic.find(2)).content).toBe("bulk updated!");

    expect(await updateAll(["content = ?", "bulk updated again!"])).toBe(await Topic.count());
    expect((await Topic.find(1)).content).toBe("bulk updated again!");
    expect((await Topic.find(2)).content).toBe("bulk updated again!");

    expect(await updateAll(["content = ?", null])).toBe(await Topic.count());
    expect((await Topic.find(1)).content).toBeNull();
  });

  it("update all with hash", async () => {
    expect((await Topic.find(1)).last_read).not.toBeNull();
    expect(await Topic.updateAll({ content: "bulk updated with hash!", last_read: null })).toBe(
      await Topic.count(),
    );
    expect((await Topic.find(1)).content).toBe("bulk updated with hash!");
    expect((await Topic.find(2)).content).toBe("bulk updated with hash!");
    expect((await Topic.find(1)).last_read).toBeNull();
    expect((await Topic.find(2)).last_read).toBeNull();
  });

  it("update column with one changed and one updated", async () => {
    const t = (await Topic.order("id").limit(1).first())! as any;
    const authorName = t.author_name;
    t.author_name = "John";
    await t.updateColumn("title", "super_title");
    expect(t.author_name).toBe("John");
    expect(t.title).toBe("super_title");
    expect(t.isChanged).toBe(true);
    expect(t.attributeChanged("author_name")).toBe(true);

    await t.reload();
    expect(t.author_name).toBe(authorName);
    expect(t.title).toBe("super_title");
  });

  it("update columns with one changed and one updated", async () => {
    const t = (await Topic.order("id").limit(1).first())! as any;
    const authorName = t.author_name;
    t.author_name = "John";
    await t.updateColumns({ title: "super_title" });
    expect(t.author_name).toBe("John");
    expect(t.title).toBe("super_title");
    expect(t.isChanged).toBe(true);
    expect(t.attributeChanged("author_name")).toBe(true);

    await t.reload();
    expect(t.author_name).toBe(authorName);
    expect(t.title).toBe("super_title");
  });

  it("increment with touch updates timestamps", async () => {
    const topic = topics("first");
    expect(topic.replies_count).toBe(1);
    const previouslyUpdatedAt = topic.updated_at;
    travel(1000);
    try {
      await topic.incrementBang("replies_count", 1, { touch: true });
    } finally {
      travelBack();
    }
    await topic.reload();
    expect(topic.replies_count).toBe(2);
    expect(epochMs(topic.updated_at)).toBeGreaterThan(epochMs(previouslyUpdatedAt));
  });

  it("becomes includes errors", async () => {
    const company = new Company({ name: null });
    expect(await company.isValid()).toBe(false);
    const originalErrors = company.errors;
    const client = company.becomes(Client);
    expect(client.errors.attributeNames).toEqual(originalErrors.attributeNames);
  });

  it("create columns not equal attributes", async () => {
    const topic = Topic.instantiate({
      title: "Another New Topic",
      does_not_exist: "test",
    });
    const duped = topic.dup();
    await duped.saveBang();
    expect(duped.isPersisted()).toBe(true);
    expect((await Topic.find(duped.id)).title).toBe("Another New Topic");
  });
});

describe("PersistenceTest", () => {
  fixtures(["companies"]);

  it("delete new record", async () => {
    const client = new Client({ name: "37signals" });
    await client.delete();
    expect(client.isFrozen()).toBe(true);
    expect(await client.save()).toBe(false);
    await expect(client.saveBang()).rejects.toThrow(RecordNotSaved);
    expect(client.isFrozen()).toBe(true);
    expect(() => client.writeAttribute("name", "something else")).toThrow();
  });

  it("destroy new record", async () => {
    const client = new Client({ name: "37signals" });
    await client.destroy();
    expect(client.isFrozen()).toBe(true);
    expect(await client.save()).toBe(false);
    await expect(client.saveBang()).rejects.toThrow(RecordNotSaved);
    expect(client.isFrozen()).toBe(true);
    expect(() => client.writeAttribute("name", "something else")).toThrow();
  });

  it("destroy record with associations", async () => {
    const client = await Client.find(3);
    await client.destroy();
    expect(client.isFrozen()).toBe(true);
    expect(await client.firm).toBeInstanceOf(Firm);
    expect(await client.save()).toBe(false);
    await expect(client.saveBang()).rejects.toThrow(RecordNotSaved);
    expect(client.isFrozen()).toBe(true);
    expect(() => client.writeAttribute("name", "something else")).toThrow();
  });

  it("delete record with associations", async () => {
    const client = await Client.find(3);
    await client.delete();
    expect(client.isFrozen()).toBe(true);
    expect(await client.firm).toBeInstanceOf(Firm);
    expect(await client.save()).toBe(false);
    await expect(client.saveBang()).rejects.toThrow(RecordNotSaved);
    expect(client.isFrozen()).toBe(true);
    expect(() => client.writeAttribute("name", "something else")).toThrow();
  });
});

describe("PersistenceTest", () => {
  fixtures(["posts", "authors"]);

  it("instantiate creates a new instance", () => {
    const post = CanonicalPost.instantiate({
      title: "appropriate documentation",
      type: "SpecialPost",
    });
    expect(post.title).toBe("appropriate documentation");
    expect(post).toBeInstanceOf(SpecialPost);
    expect(() => (post as any).body).toThrow(MissingAttributeError);
  });
});

describe("PersistenceTest", () => {
  fixtures(["parrots"]);

  it("create with custom timestamps", async () => {
    const customDatetime = instant("2026-01-01T00:00:00Z");
    for (const attr of ["created_at", "created_on", "updated_at", "updated_on"]) {
      const parrot = await LiveParrot.create({ name: "colombian", [attr]: customDatetime });
      expect(Math.floor(epochMs(parrot.readAttribute(attr) as RubyTime) / 1000)).toBe(
        Math.floor(customDatetime.epochMilliseconds / 1000),
      );
    }
  });
});

describe("PersistenceTest", () => {
  fixtures(["admin/users"]);

  it("becomes errors base", () => {
    class ChildUser extends AdminUser {
      static {
        this.storeAccessor("settings", "foo");
      }
    }
    const admin = new AdminUser();
    admin.errors.add("token", ":invalid");
    const child = admin.becomes(ChildUser);
    expect(child.errors.attributeNames).toEqual(["token"]);
    let raised = false;
    try {
      child.errors.add("foo", ":invalid");
    } catch {
      raised = true;
    }
    expect(raised).toBe(false);
  });
});

describe("PersistenceTest", () => {
  const Topic = CanonicalTopic;
  const Developer = CanonicalDeveloper;
  const { topics } = fixtures(["topics", "minivans", "developers"]);

  it("update column should not modify updated at", async () => {
    const developer = await Developer.find(1);
    const prevMonth = instant("2026-05-25T12:00:00Z");
    await developer.updateColumn("updated_at", prevMonth);
    expect(epochMs(developer.readAttribute("updated_at"))).toBe(prevMonth.epochMilliseconds);
    await developer.updateColumn("salary", 80001);
    expect(epochMs(developer.readAttribute("updated_at"))).toBe(prevMonth.epochMilliseconds);
    await developer.reload();
    expect(Math.floor(epochMs(developer.readAttribute("updated_at")) / 1000)).toBe(
      Math.floor(prevMonth.epochMilliseconds / 1000),
    );
  });

  it("update parameters", async () => {
    const topic = await Topic.find(1);
    await topic.update({});
    await expect(topic.update(null as any)).rejects.toBeInstanceOf(ArgumentError);
  });

  it("update sti type", async () => {
    expect(topics("second")).toBeInstanceOf(Reply);
    const topic = topics("second").becomesBang(Topic);
    expect(topic).toBeInstanceOf(Topic);
    await topic.saveBang();
    expect(await Topic.find(topic.id)).toBeInstanceOf(Topic);
  });

  it("delete isnt affected by scoping", async () => {
    const topic = await Topic.find(1);
    const before = Number(await Topic.count());
    await Topic.where("1=0").scoping(() => topic.delete());
    expect(Number(await Topic.count())).toBe(before - 1);
  });

  it("update column with model having primary key other than id", async () => {
    const minivan = await Minivan.find("m1");
    const newName = "sebavan";
    await minivan.updateColumn("name", newName);
    expect(minivan.readAttribute("name")).toBe(newName);
  });

  it("duped becomes persists changes from the original", async () => {
    const original = topics("first");
    const copy = original.dup().becomes(Reply);
    await copy.saveBang();
    expect((await Topic.find(copy.id)).title).toBe("The First Topic");
  });
});

describe("PersistenceTest", () => {
  const Topic = CanonicalTopic;
  const { topics } = fixtures(["topics"]);

  it("delete", async () => {
    const topic = await Topic.find(1);
    expect(await topic.delete()).toBe(topic);
    expect(topic.isFrozen()).toBe(true);
    await expect(Topic.find((topic as any).id)).rejects.toThrow(RecordNotFound);
  });

  it("destroy raises record not found exception", async () => {
    await expect(Topic.destroy(99999)).rejects.toThrow(RecordNotFound);
  });

  it("increment with touch an attribute updates timestamps", async () => {
    const topic = topics("first");
    expect(topic.replies_count).toBe(1);
    const previouslyUpdatedAt = topic.updated_at;
    const previouslyWrittenOn = topic.written_on;
    travel(1000);
    try {
      await topic.incrementBang("replies_count", 1, { touch: "written_on" });
    } finally {
      travelBack();
    }
    await topic.reload();
    expect(topic.replies_count).toBe(2);
    expect(epochMs(topic.updated_at)).toBeGreaterThan(epochMs(previouslyUpdatedAt));
    expect(epochMs(topic.written_on)).toBeGreaterThan(epochMs(previouslyWrittenOn));
  });

  it("decrement with touch updates timestamps", async () => {
    const topic = topics("first");
    expect(topic.replies_count).toBe(1);
    const previouslyUpdatedAt = topic.updated_at;
    travel(1000);
    try {
      await topic.decrementBang("replies_count", 1, { touch: true });
    } finally {
      travelBack();
    }
    await topic.reload();
    expect(topic.replies_count).toBe(0);
    expect(epochMs(topic.updated_at)).toBeGreaterThan(epochMs(previouslyUpdatedAt));
  });

  it("update attribute with one updated!", async () => {
    const t = (await Topic.first())!;
    await t.updateAttributeBang("title", "super_title");
    expect(t.title).toBe("super_title");
    expect(t.isChanged).toBe(false);
    expect(t.attributeChanged("title")).toBe(false);
    expect(t.attributeChange("title")).toBeNull();
    await t.reload();
    expect(t.title).toBe("super_title");
  });

  it("build through factory with block", () => {
    const topic = Topic.build({ title: "New Topic" }, (t: any) => {
      t.author_name = "David";
    });
    expect(topic.title).toBe("New Topic");
    expect(topic.author_name).toBe("David");
    expect(topic.isPersisted()).toBe(false);
  });
});

describe("PersistenceTest", () => {
  const Topic = CanonicalTopic;
  const { topics, people } = fixtures(["topics", "people", "cars"]);

  it("decrement with touch an attribute updates timestamps", async () => {
    const topic = topics("first");
    expect(topic.replies_count).toBe(1);
    const previouslyUpdatedAt = topic.updated_at;
    const previouslyWrittenOn = topic.written_on;
    travel(1000);
    try {
      await topic.decrementBang("replies_count", 1, { touch: "written_on" });
    } finally {
      travelBack();
    }
    await topic.reload();
    expect(topic.replies_count).toBe(0);
    expect(epochMs(topic.updated_at)).toBeGreaterThan(epochMs(previouslyUpdatedAt));
    expect(epochMs(topic.written_on)).toBeGreaterThan(epochMs(previouslyWrittenOn));
  });

  it("create through factory with block", async () => {
    const topic = await CanonicalTopic.create({ title: "New Topic" }, (t: any) => {
      t.author_name = "David";
    });
    expect(topic.title).toBe("New Topic");
    expect(topic.author_name).toBe("David");
  });

  it("create many through factory with block", async () => {
    const created = await CanonicalTopic.create(
      [{ title: "first" }, { title: "second" }],
      (t: any) => {
        t.author_name = "David";
      },
    );
    expect(created.length).toBe(2);
    const topic1 = await CanonicalTopic.find(created[0].id);
    const topic2 = await CanonicalTopic.find(created[1].id);
    expect(topic1.title).toBe("first");
    expect(topic1.author_name).toBe("David");
    expect(topic2.title).toBe("second");
    expect(topic2.author_name).toBe("David");
  });

  it("update all with custom sql as value", async () => {
    const person = people("michael") as any;
    await person.updateBang({ cars_count: 0 });

    await Person.updateAll({
      cars_count: arelSql("select count(*) from cars where cars.person_id = people.id"),
    });
    await person.reload();
    expect(person.cars_count).toBe(1);
  });
});

describe("PersistenceTest", () => {
  fixtures([]);

  const Topic = CanonicalTopic;

  it("update columns changing id", async () => {
    const t = await Topic.create({ title: "test" });
    const oldId = t.id;
    await t.updateColumns({ id: 999 });
    expect(Number(t.id)).toBe(999);
    const refreshed = await Topic.find(999);
    expect(Number(refreshed.id)).toBe(999);
    expect(refreshed.title).toBe("test");
    await expect(Topic.find(oldId)).rejects.toThrow();
  });

  it("update", async () => {
    const t = await Topic.create({ title: "old" });
    await t.update({ title: "new" });
    expect(t.title).toBe("new");
  });

  it("populates non primary key autoincremented column for a cpk model", async () => {
    const order = await CpkOrder.create({ shop_id: 111222 });
    const [_shopId, orderId] = order.id as [number, number];
    expect(orderId).not.toBeNull();
  });

  it("update many!", async () => {
    const t1 = await Topic.create({ title: "a" });
    const t2 = await Topic.create({ title: "b" });
    await Topic.update(t1.id, { title: "x" });
    await Topic.update(t2.id, { title: "y" });
    expect((await Topic.find(t1.id)).title).toBe("x");
    expect((await Topic.find(t2.id)).title).toBe("y");
  });

  it("class level update without ids!", async () => {
    const t = await Topic.create({ title: "old" });
    await Topic.update(t.id, { title: "new" });
    const found = await Topic.find(t.id);
    expect(found.title).toBe("new");
  });

  it("class level update is affected by scoping!", async () => {
    const t = await Topic.create({ title: "old" });
    await Topic.update(t.id, { title: "new" });
    const found = await Topic.find(t.id);
    expect(found.title).toBe("new");
  });

  it("destroy many", async () => {
    const before = await Topic.count();
    const t1 = await Topic.create({ title: "a" });
    const t2 = await Topic.create({ title: "b" });
    await Topic.destroy([t1.id, t2.id]);
    expect(await Topic.count()).toBe(before);
  });

  it("destroy many with invalid id", async () => {
    await expect(Topic.destroy([99999])).rejects.toThrow();
  });

  it("create prefetched pk", async () => {
    const post: any = await PostWithPrefetchedPk.createBang({
      title: "New Message",
      body: "New Body",
    });
    expect(Number(post.id)).toBe(123456);
  });

  it("build many through factory with block", () => {
    const topicList = Topic.build([{ title: "first" }, { title: "second" }], (t: any) => {
      t.author_name = "David";
    });
    expect(topicList.length).toBe(2);
    const [t1, t2] = topicList as any[];
    expect(t1.title).toBe("first");
    expect(t1.author_name).toBe("David");
    expect(t2.title).toBe("second");
    expect(t2.author_name).toBe("David");
    expect(topicList.every((t: any) => !t.isPersisted())).toBe(true);
  });

  it("save for record with only primary key that is provided", async () => {
    await expect(Minimalistic.createBang({ id: 2 })).resolves.not.toThrow();
  });

  it("update columns not equal attributes", async () => {
    const topic = Topic.new();
    (topic as any).title = "Still another topic";
    await topic.save();
    const topicReloaded = Topic.instantiate({
      ...topic.attributes,
      does_not_exist: "test",
    }) as any;
    topicReloaded.title = "A New Topic";
    await expect(topicReloaded.saveBang()).resolves.not.toThrow();
    expect(topicReloaded.isPersisted()).toBe(true);
    await topicReloaded.reload();
    expect(topicReloaded.title).toBe("A New Topic");
  });

  it("update for record with only primary key", async () => {
    const m = await Minimalistic.create({});
    await m.update({});
    expect(m.isPersisted()).toBe(true);
  });

  it("update attribute after update", async () => {
    const t = await Topic.create({ title: "v1" });
    await t.update({ title: "v2" });
    await t.updateAttribute("title", "v3");
    expect(t.title).toBe("v3");
  });

  it("update attribute does not run sql if attribute is not changed", async () => {
    const t = await Topic.create({ title: "same" });
    await t.updateAttribute("title", "same");
    expect(t.title).toBe("same");
    expect(t.isPersisted()).toBe(true);
  });

  it("update raises record not found exception", async () => {
    await expect(Topic.update(99999, { title: "x" })).rejects.toThrow();
  });

  it("update attribute with one updated", async () => {
    const t = await Topic.create({ title: "a" });
    await t.updateAttribute("title", "super_title");
    expect(t.title).toBe("super_title");
    expect(t.isChanged).toBe(false);
    expect(t.attributeChanged("title")).toBe(false);
    expect(t.attributeChange("title")).toBeNull();
    await t.reload();
    expect(t.title).toBe("super_title");
  });

  it("update attribute for updated at on", async () => {
    const t = await Topic.create({ title: "test" });
    const before = t.updated_at;
    await t.updateAttribute("title", "new");
    const after = t.updated_at;
    expect(epochMs(after)).toBeGreaterThanOrEqual(epochMs(before));
  });

  it("update attribute!", async () => {
    const t = await Topic.create({ title: "old" });
    await t.updateAttributeBang("title", "new");
    expect(t.title).toBe("new");
  });

  it("update attribute for updated at on!", async () => {
    const t = await Topic.create({ title: "test" });
    await t.updateAttributeBang("title", "new");
    expect(t.updated_at).toSatisfy(isTemporalDatetime);
  });

  it("update columns should not leave the object dirty", async () => {
    const t = await Topic.create({ title: "old" });
    t.title = "dirty";
    expect(t.isChanged).toBe(true);
    await t.updateColumns({ title: "clean" });
    expect(t.isChanged).toBe(false);
  });

  it("update columns returns boolean", async () => {
    const t = await Topic.create({ title: "old" });
    expect(await t.updateColumns({ title: "new" })).toBe(true);
  });

  it("class level destroy", async () => {
    const t = await Topic.create({ title: "test" });
    await Topic.destroy(t.id);
    await expect(Topic.find(t.id)).rejects.toThrow();
  });

  it("class level destroy is affected by scoping", async () => {
    const before = await Topic.count();
    const t = await Topic.create({ title: "test" });
    await Topic.destroy(t.id);
    expect(await Topic.count()).toBe(before);
  });

  it("class level delete with invalid ids", async () => {
    const affected = await Topic.delete(99999);
    expect(affected).toBe(0);
  });

  it("class level delete is affected by scoping", async () => {
    const before = await Topic.count();
    const t = await Topic.create({ title: "test" });
    await Topic.delete(t.id);
    expect(await Topic.count()).toBe(before);
  });

  describe("QueryConstraintsTest", () => {
    it("primary key stays the same", async () => {
      const t = await Topic.create({ title: "test" });
      const id = t.id;
      t.title = "updated";
      await t.save();
      expect(t.id).toBe(id);
    });
  });
});
describe("PersistenceTest", () => {
  fixtures(["topics", "posts", "authors"]);
  const Topic = CanonicalTopic;
  const Post = CanonicalPost;

  it("save destroyed object", async () => {
    const topic = await Topic.create({ title: "New Topic" });
    await topic.destroyBang();
    await expect(topic.saveBang()).rejects.toThrow("Failed to save the record");
  });

  it("delete doesnt run callbacks", async () => {
    await (await Topic.find(1)).delete();
    expect(await Topic.find(2)).not.toBeNull();
  });

  it("destroy", async () => {
    const topic = await Topic.find(1);
    expect(await topic.destroy()).toBe(topic);
    expect(topic.isFrozen()).toBe(true);
    await expect(Topic.find((topic as any).id)).rejects.toThrow(RecordNotFound);
  });

  it("find via reload", async () => {
    const post = Post.new();
    expect(post.isNewRecord()).toBe(true);

    (post as any).id = 1;
    await post.reload();

    expect((post as any).title).toBe("Welcome to the weblog");
    expect(post.isNewRecord()).toBe(false);
  });
});

describe("PersistenceTest", () => {
  fixtures(["topics", "developers"]);
  const Topic = CanonicalTopic;

  it("update column", async () => {
    const topic = await Topic.find(1);
    await topic.updateColumn("approved", true);
    expect(topic.approved).toBe(true);
    await topic.reload();
    expect(topic.approved).toBe(true);

    await topic.updateColumn("approved", false);
    expect(topic.approved).toBe(false);
    await topic.reload();
    expect(topic.approved).toBe(false);
  });

  it("update column should not use setter method", async () => {
    const dev = (await CanonicalDeveloper.find(1)) as any;
    let setterCalled = false;
    Object.defineProperty(dev, "salary", {
      configurable: true,
      get() {
        return this.readAttribute("salary");
      },
      set(value: number) {
        setterCalled = true;
        this.writeAttribute("salary", value * 2);
      },
    });

    await dev.updateColumn("salary", 80000);
    expect(dev.salary).toBe(80000);
    expect(setterCalled).toBe(false);

    await dev.reload();
    expect(dev.salary).toBe(80000);
  });

  it("update column should raise exception if new record", async () => {
    const topic = new Topic();
    await expect(topic.updateColumn("approved", false)).rejects.toThrow(
      "Cannot update columns on a new or destroyed record",
    );
  });

  it("update column should not leave the object dirty", async () => {
    const topic = await Topic.find(1);
    await topic.updateColumn("content", "--- Have a nice day\n...\n");

    await topic.reload();
    await topic.updateColumn("content", "--- You too\n...\n");
    expect(topic.isChanged).toBe(false);

    await topic.reload();
    await topic.updateColumn("content", "--- Have a nice day\n...\n");
    expect(topic.isChanged).toBe(false);
  });

  it("update columns", async () => {
    const topic = await Topic.find(1);
    await topic.updateColumns({ approved: true, title: "Sebastian Topic" });
    expect(topic.approved).toBe(true);
    expect(topic.title).toBe("Sebastian Topic");
    await topic.reload();
    expect(topic.approved).toBe(true);
    expect(topic.title).toBe("Sebastian Topic");
  });

  it("update columns should raise exception if new record", async () => {
    const topic = new Topic();
    await expect(topic.updateColumns({ approved: false })).rejects.toThrow(
      "Cannot update columns on a new or destroyed record",
    );
  });
});
describe("PersistenceTest", () => {
  const { cpkBooks } = fixtures(["cpkAuthors", "cpkBooks"]);

  it("destroy with single composite primary key", async () => {
    const book = cpkBooks("cpk_great_author_first_book");
    const before = (await CpkBook.count()) as number;
    const destroyed = (await CpkBook.destroy(book.id)) as CpkBook;
    expect((await CpkBook.count()) as number).toBe(before - 1);
    expect(destroyed.id).toEqual(book.id);
  });

  it("destroy with multiple composite primary keys", async () => {
    const books = [
      cpkBooks("cpk_great_author_first_book"),
      cpkBooks("cpk_great_author_second_book"),
    ];
    const before = (await CpkBook.count()) as number;
    const destroyed = (await CpkBook.destroy(books.map((b) => b.id))) as CpkBook[];
    expect((await CpkBook.count()) as number).toBe(before - 2);
    expect(destroyed.map((d) => d.id).sort()).toEqual(books.map((b) => b.id).sort());
    expect(destroyed.every((d) => d.isFrozen())).toBe(true);
  });

  it("destroy with invalid ids for a model that expects composite keys", async () => {
    const books = [
      cpkBooks("cpk_great_author_first_book"),
      cpkBooks("cpk_great_author_second_book"),
    ];
    const ids = books.map((b) => (b.id as unknown[])[0]);
    await expect(CpkBook.destroy(ids)).rejects.toThrow(RecordNotFound);
  });

  it("destroy for a failed to destroy cpk record", async () => {
    const book = cpkBooks("cpk_great_author_first_book");
    book.failDestroy = true;
    await expect(book.destroyBang()).rejects.toThrow(RecordNotDestroyed);
  });
});

describe("PersistenceTest", () => {
  const Topic = CanonicalTopic;
  const { topics } = fixtures(["topics", "companies"]);

  it("becomes after reload schema from cache", () => {
    (Reply as any).defineAttributeMethods();
    Reply.serialize("content");
    const t = topics("first");
    expect(t.becomes(Reply)).toBeInstanceOf(Reply);
    expect(t.becomes(Reply).title).toBe("The First Topic");
  });

  it("becomes wont break mutation tracking", () => {
    const topic = topics("first");
    const reply = topic.becomes(Reply);

    expect(Number((topic as any).idInDatabase)).toBe(1);
    expect((topic as any).attributesInDatabase).toEqual({});

    expect(Number((reply as any).idInDatabase)).toBe(1);
    expect((reply as any).attributesInDatabase).toEqual({});
  });

  it("becomes initializes missing attributes", () => {
    const company = new Company({ name: "GrowingCompany" });
    const client = company.becomes(LargeClient);
    expect((client as any).extraSize).toBe(50);
  });

  it("becomes keeps extra attributes", () => {
    const client = new LargeClient({ name: "ShrinkingCompany" });
    const company = client.becomes(Company);
    expect((company as any).readAttribute("extraSize")).toBe(50);
    expect((client as any).extraSize).toBe(50);
  });

  it("preserve original sti type", () => {
    const reply = topics("second");
    expect((reply as any).type).toBe("Reply");

    const topic = reply.becomes(Topic);
    expect((reply as any).type).toBe("Reply");

    expect(topic).toBeInstanceOf(Topic);
    expect((topic as any).type).toBe("Reply");
  });

  it("update sti subclass type", async () => {
    expect(topics("first")).toBeInstanceOf(Topic);

    const reply = topics("first").becomesBang(Reply);
    expect(reply).toBeInstanceOf(Reply);
    await (reply as any).saveBang();
    expect(await Reply.find((reply as any).id)).toBeInstanceOf(Reply);
  });
});

describe("PersistenceTest", () => {
  const { developers } = fixtures(["developers", "minivans", "speedometers"]);

  it("update attribute for readonly attribute", async () => {
    const minivan = await Minivan.find("m1");
    await expect(minivan.updateAttribute("color", "black")).rejects.toThrow(ActiveRecordError);
  });

  it("update attribute for readonly attribute!", async () => {
    const minivan = await Minivan.find("m1");
    await expect((minivan as any).updateAttributeBang("color", "black")).rejects.toThrow(
      ActiveRecordError,
    );
  });

  it("update column for readonly attribute", async () => {
    const minivan = await Minivan.find("m1");
    const prevColor = minivan.color;
    await expect(minivan.updateColumn("color", "black")).rejects.toThrow(ActiveRecordError);
    expect(minivan.color).toBe(prevColor);
  });

  it("update columns with one readonly attribute", async () => {
    const minivan = await Minivan.find("m1");
    const prevColor = minivan.color;
    const prevName = minivan.name;
    await expect(minivan.updateColumns({ name: "My old minivan", color: "black" })).rejects.toThrow(
      ActiveRecordError,
    );
    expect(minivan.color).toBe(prevColor);
    expect(minivan.name).toBe(prevName);

    await minivan.reload();
    expect(minivan.color).toBe(prevColor);
    expect(minivan.name).toBe(prevName);
  });

  it("update columns should not use setter method", async () => {
    const dev = (await CanonicalDeveloper.find(1)) as any;
    let setterCalled = false;
    Object.defineProperty(dev, "salary", {
      configurable: true,
      get() {
        return this.readAttribute("salary");
      },
      set(value: number) {
        setterCalled = true;
        this.writeAttribute("salary", value * 2);
      },
    });

    await dev.updateColumns({ salary: 80000 });
    expect(dev.salary).toBe(80000);
    expect(setterCalled).toBe(false);

    await dev.reload();
    expect(dev.salary).toBe(80000);
  });

  it("update column with default scope", async () => {
    const developer = (await DeveloperCalledDavid.first())! as any;
    developer.name = "John";
    await developer.saveBang();

    expect(await developer.updateColumn("name", "Will")).toBe(true);
  });

  it("update columns with default scope", async () => {
    const developer = (await DeveloperCalledDavid.first())! as any;
    developer.name = "John";
    await developer.saveBang();

    expect(await developer.updateColumns({ name: "Will" })).toBe(true);
  });

  it("persisted returns boolean", async () => {
    let developer = new CanonicalDeveloper({ name: "Jose" });
    expect(developer.isPersisted()).toBe(false);
    await developer.saveBang();
    expect(developer.isPersisted()).toBe(true);

    developer = (await CanonicalDeveloper.first())!;
    expect(developer.isPersisted()).toBe(true);
    await developer.destroy();
    expect(developer.isPersisted()).toBe(false);

    developer = (await CanonicalDeveloper.last())!;
    expect(developer.isPersisted()).toBe(true);
    await developer.delete();
    expect(developer.isPersisted()).toBe(false);
  });

  it("update columns with model having primary key other than id", async () => {
    const minivan = await Minivan.find("m1");
    const newName = "sebavan";
    await minivan.updateColumns({ name: newName });
    expect(minivan.name).toBe(newName);
  });

  it("update columns should not modify updated at", async () => {
    void developers;
    const developer = await CanonicalDeveloper.find(1);
    const prevMonth = Temporal.Instant.from("2003-06-16T00:00:00Z");

    await (developer as any).updateColumns({ updated_at: prevMonth });
    expect(epochMs((developer as any).updated_at)).toBe(prevMonth.epochMilliseconds);

    await (developer as any).updateColumns({ salary: 80000 });
    expect(epochMs((developer as any).updated_at)).toBe(prevMonth.epochMilliseconds);
    expect((developer as any).salary).toBe(80000);

    await (developer as any).reload();
    expect(epochMs((developer as any).updated_at)).toBe(prevMonth.epochMilliseconds);
    expect((developer as any).salary).toBe(80000);
  });
});

describe("PersistenceTest", () => {
  registerModel(ChatMessage);
  registerModel(ChatMessageCustomPk);
  fixtures([]);

  it.skipIf(adapterType !== "postgres")("create model with uuid pk populates id", async () => {
    const message = await ChatMessage.create({ content: "New Message" });
    expect((message as any).id).not.toBeNull();

    const messageReloaded = await ChatMessage.find((message as any).id);
    expect((messageReloaded as any).content).toBe("New Message");
  });

  it.skipIf(adapterType !== "postgres")(
    "create model with custom named uuid pk populates id",
    async () => {
      const message = await ChatMessageCustomPk.create({ content: "New Message" });
      expect((message as any).message_id).not.toBeNull();

      const messageReloaded = await ChatMessageCustomPk.find((message as any).message_id);
      expect((messageReloaded as any).content).toBe("New Message");
    },
  );
});

describe("PersistenceTest", () => {
  fixtures(["companies"]);
  beforeAll(async () => {
    await (Company as unknown as { loadSchema(): Promise<void> }).loadSchema();
  });

  it("becomes includes changed attributes", () => {
    const company = new Company({ name: "37signals" }) as any;
    const client = company.becomes(Client);
    expect(client.name).toBe("37signals");
    expect(client.changedAttributeNamesToSave).toEqual(["name"]);
  });
});

describe("PersistenceTest", () => {
  const Topic = CanonicalTopic;
  fixtures(["topics", "developers", "parrots"]);

  it("save valid record", async () => {
    const topic = new Topic({ title: "New Topic" });
    expect(await topic.saveBang()).toBe(true);
  });

  it("save invalid record", async () => {
    const reply = new WrongReply({ title: "New reply" });
    await expect(reply.saveBang()).rejects.toThrow("Validation failed: Content Empty");
  });

  it("reload via querycache", async () => {
    const connection = await Base.leaseConnection();
    connection.enableQueryCacheBang();
    connection.clearQueryCache();
    expect(connection.queryCacheEnabled).toBe(true);
    const parrot = await Parrot.create({ name: "Shane" });

    const foundParrot = await Parrot.find(parrot.id);
    expect(foundParrot.id).toBe(parrot.id);

    expect(connection.queryCache!.size).toBe(1);
    await Base.uncached(async () => {
      (foundParrot as any).name = "Mary";
      await foundParrot.save();
    });

    await foundParrot.reload();
    expect((foundParrot as any).name).toBe("Mary");

    const foundParrot2 = await Parrot.find(parrot.id);
    expect((foundParrot2 as any).name).toBe("Mary");

    connection.disableQueryCacheBang();
  });
});

describe("QueryConstraintsTest", () => {
  const { clothingItems } = fixtures(["clothingItems", "dashboards", "topics", "posts"]);

  beforeAll(async () => {
    await ClothingItem.loadSchema();
  });

  it("query constraints list is nil if primary key is nil", async () => {
    class DevelopersProjects extends Base {
      static _tableName = "developers_projects";
    }
    await DevelopersProjects.loadSchema();
    expect(DevelopersProjects.primaryKey).toBeNull();
    expect(queryConstraintsList.call(DevelopersProjects as any)).toBeNull();
  });

  it("query constraints list is nil for non cpk model", () => {
    expect(queryConstraintsList.call(CanonicalPost as any)).toBeNull();
    expect(queryConstraintsList.call(Dashboard as any)).toBeNull();
  });

  it("query constraints list equals to composite primary key", () => {
    expect(queryConstraintsList.call(CpkOrder as any)).toEqual(["shop_id", "id"]);
    expect(queryConstraintsList.call(CpkBook as any)).toEqual(["author_id", "id"]);
  });

  it("child keeps parents query constraints", async () => {
    const greenTShirt = clothingItems("green_t_shirt");
    let sqls = await captureSql(async () => {
      await greenTShirt.reload();
    });
    let sql = sqls.find((s) => /^SELECT/.test(s.trimStart())) ?? "";
    expect(sql).toMatch(/WHERE .*clothing_type/);
    expect(sql).toMatch(/WHERE .*color/);

    const usedBlueJeans = clothingItems("used_blue_jeans");
    sqls = await captureSql(async () => {
      await usedBlueJeans.reload();
    });
    sql = sqls.find((s) => /^SELECT/.test(s.trimStart())) ?? "";
    expect(sql).toMatch(/WHERE .*clothing_type/);
    expect(sql).toMatch(/WHERE .*color/);
  });

  it("child keeps parents query contraints derived from composite pk", () => {
    expect(queryConstraintsList.call(CpkBestSeller as any)).toEqual(["author_id", "id"]);
  });

  it("query constraints raises an error when no columns provided", () => {
    class NoColumns extends Base {
      static _tableName = "topics";
    }
    expect(() => queryConstraints.call(NoColumns as any)).toThrow(ArgumentError);
  });

  it("child class with query constraints overrides parents", () => {
    expect(queryConstraintsList.call(ClothingItemSized as any)).toEqual([
      "clothing_type",
      "color",
      "size",
    ]);
  });
});

describe("PersistenceTest", () => {
  registerModel(Default);
  fixtures([], { useTransactionalTests: false });

  async function buildDefaultsTable() {
    const connection = Base.connection;
    if (adapterType === "postgres") {
      const pg = connection as PostgreSQLAdapter;
      const supportsVirtualColumns = await pg.supportsVirtualColumns();
      await pg.createTable("defaults", { force: true }, (d) => {
        if (supportsVirtualColumns) {
          d.virtual("virtual_stored_number", {
            type: "integer",
            as: "random_number * 10",
            stored: true,
          });
        }
        d.integer("random_number", { default: () => "random() * 100" });
        d.string("ruby_on_rails", { default: () => "concat('Ruby ', 'on ', 'Rails')" });
        d.date("modified_date", { default: () => "CURRENT_DATE" });
        d.date("modified_date_function", { default: () => "now()" });
        d.date("fixed_date", { default: "2004-01-01" });
        d.datetime("modified_time", { default: () => "CURRENT_TIMESTAMP" });
        d.datetime("modified_time_without_precision", {
          precision: null,
          default: () => "CURRENT_TIMESTAMP",
        });
        d.datetime("modified_time_with_precision_0", {
          precision: 0,
          default: () => "CURRENT_TIMESTAMP",
        });
        d.datetime("modified_time_function", { default: () => "now()" });
        d.datetime("fixed_time", { default: "2004-01-01 00:00:00.000000-00" });
        d.timestamptz("fixed_time_with_time_zone", { default: "2004-01-01 01:00:00+1" });
        d.column("char1", "char(1)", { default: "Y" });
        d.string("char2", { limit: 50, default: "a varchar field" });
        d.text("char3", { default: "a text field" });
        d.bigint("bigint_default", { default: () => "0::bigint" });
        d.binary("binary_default_function", { default: () => "convert_to('A', 'UTF8')" });
      });
    } else if (adapterType === "sqlite") {
      await connection.createTable("defaults", { force: true }, (t) => {
        t.integer("random_number", { default: () => "ABS(RANDOM())" });
        t.string("ruby_on_rails", { default: () => "('Ruby ' || 'on ' || 'Rails')" });
        t.date("modified_date", { default: () => "CURRENT_DATE" });
        t.date("modified_date_function", { default: () => "DATE('now')" });
        t.date("fixed_date", { default: "2004-01-01" });
        t.datetime("modified_time", { default: () => "CURRENT_TIMESTAMP" });
        t.datetime("modified_time_without_precision", {
          precision: null,
          default: () => "CURRENT_TIMESTAMP",
        });
        t.datetime("modified_time_with_precision_0", {
          precision: 0,
          default: () => "CURRENT_TIMESTAMP",
        });
        t.datetime("modified_time_function", { default: () => "DATETIME('now')" });
        t.datetime("fixed_time", { default: "2004-01-01 00:00:00.000000-00" });
        t.column("char1", "char(1)", { default: "Y" });
        t.string("char2", { limit: 50, default: "a varchar field" });
        t.text("char3", { default: "a text field" });
      });
    } else {
      const supportsDefaultExpression =
        (
          connection as { supportsDefaultExpression?: () => boolean }
        ).supportsDefaultExpression?.() ?? false;
      await connection.createTable("defaults", { force: true }, (t) => {
        t.date("fixed_date", { default: "2004-01-01" });
        t.datetime("fixed_time", { default: "2004-01-01 00:00:00" });
        t.column("char1", "char(1)", { default: "Y" });
        t.string("char2", { limit: 50, default: "a varchar field" });
        if (supportsDefaultExpression) {
          t.binary("uuid", { limit: 36, default: () => "(uuid())" });
          t.string("char2_concatenated", { default: () => "(concat(`char2`, '-'))" });
        }
      });
    }
    await (Default as unknown as { loadSchema(): Promise<void> }).loadSchema();
  }

  async function withDefaultsTable(assertions: (record: any) => void | Promise<void>) {
    await buildDefaultsTable();
    try {
      const record = (await Default.create()) as any;
      expect(record.id).not.toBeNull();
      await assertions(record);
    } finally {
      await Base.connection.dropTable("defaults", { ifExists: true });
    }
  }

  it.skipIf(adapterType !== "postgres")("fills auto populated columns on creation", async () => {
    await withDefaultsTable(async (record) => {
      expect(record.ruby_on_rails).toBe("Ruby on Rails");
      if (await (Base.connection as PostgreSQLAdapter).supportsVirtualColumns()) {
        expect(record.virtual_stored_number).not.toBeNull();
      }
      expect(record.random_number).not.toBeNull();
      expect(record.modified_date).not.toBeNull();
      expect(record.modified_date_function).not.toBeNull();
      expect(record.modified_time).not.toBeNull();
      expect(record.modified_time_without_precision).not.toBeNull();
      expect(record.modified_time_function).not.toBeNull();
      expect(Buffer.from(record.binary_default_function).toString()).toBe("A");

      if (await (Base.connection as PostgreSQLAdapter).supportsIdentityColumns()) {
        class IdentityTable extends Base {
          static _tableName = "postgresql_identity_table";
        }
        registerModel(IdentityTable);
        await (IdentityTable as unknown as { loadSchema(): Promise<void> }).loadSchema();
        const identityRecord = (await IdentityTable.createBang()) as any;
        expect(identityRecord.id).not.toBeNull();
      }
    });
  });

  it.skipIf(adapterType !== "sqlite")("fills auto populated columns on creation", async () => {
    await withDefaultsTable((record) => {
      expect(record.ruby_on_rails).toBe("Ruby on Rails");
      expect(record.random_number).not.toBeNull();
      expect(record.modified_date).not.toBeNull();
      expect(record.modified_date_function).not.toBeNull();
      expect(record.modified_time).not.toBeNull();
      expect(record.modified_time_without_precision).not.toBeNull();
      expect(record.modified_time_function).not.toBeNull();
    });
  });

  it.skipIf(adapterType !== "mysql")("fills auto populated columns on creation", async () => {
    await withDefaultsTable(async (record) => {
      expect(record.char1).not.toBeNull();
      const supportsDefaultExpression =
        (
          Base.connection as { supportsDefaultExpression?: () => boolean }
        ).supportsDefaultExpression?.() ?? false;
      if (supportsDefaultExpression && (await Base.connection.supportsInsertReturning?.())) {
        expect(record.uuid).not.toBeNull();
      }
    });
  });
});

describe("PersistenceTest", () => {
  registerModel(PkAutopopulatedByATriggerRecord);
  fixtures([]);

  const supportsTrigger = adapterSupports("insert_returning") && adapterType !== "sqlite";

  beforeAll(async () => {
    if (!supportsTrigger) return;
    await (
      PkAutopopulatedByATriggerRecord as unknown as { loadSchema(): Promise<void> }
    ).loadSchema();
  });

  it.skipIf(adapterType === "sqlite" || !adapterSupports("insert_returning"))(
    "model with no auto populated fields still returns primary key after insert",
    async () => {
      const record = (await PkAutopopulatedByATriggerRecord.create()) as any;

      expect(record.id).not.toBeNull();
      expect(record.id).toBeGreaterThan(0);
    },
  );
});

describe("PersistenceTest", () => {
  const Topic = CanonicalTopic;
  fixtures(["topics"]);

  it("update attribute in before validation respects callback chain", async () => {
    let counter = 0;
    const callOnce = (record: any) => {
      if (record.isSavedChangeToAuthor_name()) counter += 1;
    };
    class TrackingTopic extends Topic {
      static {
        const self = this as any;
        self.beforeValidation(async function (this: any) {
          await this.updateAttribute("author_name", "David");
        });
        self.afterCreate(function (this: any) {
          callOnce(this);
        });
        self.afterUpdate(function (this: any) {
          if (this.isSavedChangeToAuthor_name()) callOnce(this);
        });
      }
    }
    registerModel(TrackingTopic);

    await TrackingTopic.create({ title: "New Topic", author_name: "Not David" });

    expect(counter).toBe(1);
  });

  it("persist inherited class with different table name", async () => {
    class MinimalisticAircraft extends Minimalistic {
      static {
        this.tableName = "aircraft";
      }
    }
    registerModel(MinimalisticAircraft);

    const before = (await Aircraft.count()) as number;
    const aircraft = (await MinimalisticAircraft.create({ name: "Wright Flyer" })) as any;
    aircraft.name = "Wright Glider";
    await aircraft.save();
    expect(await Aircraft.count()).toBe(before + 1);

    expect(((await Aircraft.last()) as any).name).toBe("Wright Glider");
  });
});
