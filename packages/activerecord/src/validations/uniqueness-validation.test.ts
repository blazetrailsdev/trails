import { describe, it, expect, beforeAll, beforeEach, afterEach } from "vitest";
import { ArgumentError } from "@blazetrails/activemodel";
import { Base } from "../index.js";
import { registerModel } from "../associations.js";
import { registerSubclass } from "../inheritance.js";
import { adapterType } from "../test-adapter.js";
import { itIfSupports } from "../support/supports.js";
import { assertQueriesCount, assertNoQueries } from "../testing/query-assertions.js";
import { fixtures } from "../test-fixtures.js";
import { Topic } from "../test-helpers/models/topic.js";
import { Reply, UniqueReply, SillyUniqueReply } from "../test-helpers/models/reply.js";
import { WarehouseThing } from "../test-helpers/models/warehouse-thing.js";
import { Keyboard } from "../test-helpers/models/keyboard.js";
import { Event } from "../test-helpers/models/event.js";
import { Guid } from "../test-helpers/models/guid.js";
import { Author } from "../test-helpers/models/author.js";
import { Person } from "../test-helpers/models/person.js";
import { Essay } from "../test-helpers/models/essay.js";
import { CpkAuthor, CpkBook } from "../test-helpers/models/cpk.js";
import "../support/canonical-model-index.js";
import { Range } from "@blazetrails/ruby-compat";

const INT_MAX_VALUE = 2147483647;

class Wizard extends Base {
  static {
    this.abstractClass = true;
    this.validatesUniquenessOf("name");
  }
}

class IneptWizard extends Wizard {
  static _tableName = "inept_wizards";
  static {
    this.validatesUniquenessOf("city");
  }
}

class Conjurer extends IneptWizard {}
class Thaumaturgist extends IneptWizard {}

class ReplyWithTitleObject extends Reply {
  static {
    this.validatesUniquenessOf("content", { scope: "title" });
  }
}

class CoolTopic extends Topic {
  static {
    this.validatesUniquenessOf("id");
  }
}

class TopicWithAfterCreate extends Topic {
  static {
    this.afterCreate(async (record: TopicWithAfterCreate) => {
      await record.updateBang({
        author_name: `${record.readAttribute("title")} ${(record as { id: number }).id}`,
      });
    });
  }
}

class LessonWithUniqKeyboard extends Base {
  static _tableName = "lessons";
  static {
    this.belongsTo("keyboard", { primaryKey: "name", foreignKey: "name" });
    this.validatesUniquenessOf("keyboard");
  }
}

class DashboardWithoutPrimaryKey extends Base {
  static _tableName = "dashboards";
  static name = "Dashboard";
  static {
    this.validatesUniquenessOf("dashboard_id");
  }
}

class BookWithUniqueRevision extends CpkBook {
  static {
    this.validates("revision", { uniqueness: true });
  }
}

for (const klass of [ReplyWithTitleObject, CoolTopic, TopicWithAfterCreate]) {
  registerSubclass(klass);
}
for (const klass of [IneptWizard, Conjurer, Thaumaturgist]) {
  registerSubclass(klass);
}

describe("UniquenessValidationTest", () => {
  fixtures(["topics", "warehouseThings"]);

  beforeAll(() => {
    registerModel("Topic", Topic);
    registerModel("Reply", Reply);
    registerModel("UniqueReply", UniqueReply);
    registerModel("SillyUniqueReply", SillyUniqueReply);
    registerModel("ReplyWithTitleObject", ReplyWithTitleObject);
    registerModel("WarehouseThing", WarehouseThing);
    registerModel("Keyboard", Keyboard);
    registerModel("Event", Event);
    registerModel("Guid", Guid);
    registerModel("Author", Author);
    registerModel("Person", Person);
    registerModel("Essay", Essay);
    registerModel("CpkAuthor", CpkAuthor);
    registerModel("CpkBook", CpkBook);
    registerModel("IneptWizard", IneptWizard);
    registerModel("Conjurer", Conjurer);
    registerModel("Thaumaturgist", Thaumaturgist);
  });

  afterEach(() => {
    Topic.clearValidatorsBang();
    Reply.clearValidatorsBang();
  });

  it("validate uniqueness", async () => {
    Topic.validatesUniquenessOf("title");

    const t = new Topic({ title: "I'm uniqué!" });
    expect(await t.save()).toBe(true);

    t.writeAttribute("content", "Remaining unique");
    expect(await t.save()).toBe(true);

    const t2 = new Topic({ title: "I'm uniqué!" });
    expect(await t2.isValid()).toBe(false);
    expect(await t2.save()).toBe(false);
    expect(t2.errors.messagesFor("title")).toEqual(["has already been taken"]);

    t2.writeAttribute("title", "Now I am really also unique");
    expect(await t2.save()).toBe(true);
  });

  it("validate uniqueness with singleton class", async () => {
    await Topic.createBang({ title: "abc" });

    Topic.validatesUniquenessOf("title");
    const t2 = new Topic({ title: "abc" });
    expect(await t2.save()).toBe(false);
  });

  it("validate uniqueness with alias attribute", async () => {
    Topic.validatesUniquenessOf("heading");

    const topic = new Topic({ title: "abc" });
    expect(await topic.save()).toBe(true);
  });

  it("validates uniqueness with nil value", async () => {
    Topic.validatesUniquenessOf("title");

    const t = new Topic({ title: null });
    expect(await t.save()).toBe(true);

    const t2 = new Topic({ title: null });
    expect(await t2.save()).toBe(false);
    expect(t2.errors.messagesFor("title")).toEqual(["has already been taken"]);
  });

  it("validates uniqueness with validates", async () => {
    Topic.validates("title", { uniqueness: true });
    await Topic.createBang({ title: "abc" });

    const t2 = new Topic({ title: "abc" });
    expect(await t2.save()).toBe(false);
    expect(t2.errors.messagesFor("title")).toBeTruthy();
  });

  it("validate uniqueness when integer out of range", async () => {
    const entry = await BigIntTest.create({ engines_count: INT_MAX_VALUE + 1 });
    expect(entry.errors.messagesFor("engines_count")).toEqual(["is not included in the list"]);
  });

  it("validate uniqueness when integer out of range show order does not matter", async () => {
    const entry = await BigIntReverseTest.create({ engines_count: INT_MAX_VALUE + 1 });
    expect(entry.errors.messagesFor("engines_count")).toEqual(["is not included in the list"]);
  });

  it("validates uniqueness with newline chars", async () => {
    Topic.validatesUniquenessOf("title", { caseSensitive: false });

    const t = new Topic({ title: "new\nline" });
    expect(await t.save()).toBe(true);
  });

  it("validate uniqueness with scope", async () => {
    Reply.validatesUniquenessOf("content", { scope: "parent_id" });

    const t = await Topic.create({ title: "I'm unique!" });

    const r1 = await (t as any).replies.create({ title: "r1", content: "hello world" });
    expect(r1.isPersisted()).toBe(true);

    const r2 = new Reply({ title: "r2", content: "hello world", parent_id: (t as any).id });
    expect(await r2.save()).toBe(false);

    r2.writeAttribute("content", "something else");
    expect(await r2.save()).toBe(true);

    const t2 = await Topic.create({ title: "I'm unique too!" });
    const r3 = await (t2 as any).replies.create({ title: "r3", content: "hello world" });
    expect(r3.isPersisted()).toBe(true);
  });

  it("validate uniqueness with aliases", async () => {
    Reply.validatesUniquenessOf("new_content", { scope: "new_parent_id" });

    const t = await Topic.create({ title: "I'm unique!" });

    const r1 = await (t as any).replies.create({ title: "r1", content: "hello world" });
    expect(r1.isPersisted()).toBe(true);

    const r2 = new Reply({ title: "r2", content: "hello world", parent_id: (t as any).id });
    expect(await r2.save()).toBe(false);

    r2.writeAttribute("content", "something else");
    expect(await r2.save()).toBe(true);
  });

  it("validate uniqueness with scope invalid syntax", () => {
    expect(() => {
      Reply.validatesUniquenessOf("content", { scope: { parent_id: false } as any });
    }).toThrow(ArgumentError);
  });

  it("validate uniqueness with object scope", async () => {
    Reply.validatesUniquenessOf("content", { scope: "topic" });

    const t = await Topic.create({ title: "I'm unique!" });

    const r1 = await (t as any).replies.create({ title: "r1", content: "hello world" });
    expect(r1.isPersisted()).toBe(true);

    const r2 = new Reply({ title: "r2", content: "hello world", parent_id: (t as any).id });
    expect(await r2.save()).toBe(false);
  });

  it("validate uniqueness with polymorphic object scope", async () => {
    Essay.validatesUniquenessOf("name", { scope: ["writer_id", "writer_type"] });
    try {
      const a = await Author.create({ name: "Sergey" });
      const p = await Person.create({ first_name: "Sergey" });

      const e1 = await (a as any).essays.create({ name: "Essay" });
      expect(e1.isPersisted()).toBe(true);

      const e2 = await (p as any).essays.create({ name: "Essay" });
      expect(e2.isPersisted()).toBe(true);
    } finally {
      Essay.clearValidatorsBang();
    }
  });

  it("validate uniqueness with composed attribute scope", async () => {
    const r1 = await ReplyWithTitleObject.create({ title: "r1", content: "hello world" });
    expect(r1.isPersisted()).toBe(true);

    const r2 = new ReplyWithTitleObject({ title: "r1", content: "hello world" });
    expect(await r2.save()).toBe(false);
  });

  it("validate uniqueness with object arg", async () => {
    Reply.validatesUniquenessOf("topic");

    const t = await Topic.create({ title: "I'm unique!" });

    const r1 = await (t as any).replies.create({ title: "r1", content: "hello world" });
    expect(r1.isPersisted()).toBe(true);

    const r2 = new Reply({ title: "r2", content: "hello world", parent_id: (t as any).id });
    expect(await r2.save()).toBe(false);
  });

  it("validate uniqueness scoped to defining class", async () => {
    const t = await Topic.create({ title: "What, me worry?" });

    const r1 = await (t as any).uniqueReplies.create({
      title: "r1",
      content: "a barrel of fun",
    });
    expect(r1.isPersisted()).toBe(true);

    const r2 = new SillyUniqueReply({
      title: "r2",
      content: "a barrel of fun",
      parent_id: (t as any).id,
    });
    expect(await r2.save()).toBe(false);

    const r3 = await (t as any).replies.create({
      title: "r2",
      content: "a barrel of fun",
    });
    expect(r3.isPersisted()).toBe(true);
  });

  it("validate uniqueness with scope array", async () => {
    Reply.validatesUniquenessOf("author_name", {
      scope: ["author_email_address", "parent_id"],
    });

    const t = await Topic.create({ title: "The earth is actually flat!" });
    const tid = (t as any).id;

    const r1 = new Reply({
      author_name: "jeremy",
      author_email_address: "jeremy@rubyonrails.com",
      title: "You're joking!",
      content: "Silly reply",
      parent_id: tid,
    });
    expect(await r1.save()).toBe(true);

    const r2 = new Reply({
      author_name: "jeremy",
      author_email_address: "jeremy@rubyonrails.com",
      title: "You're joking!",
      content: "Silly reply again...",
      parent_id: tid,
    });
    expect(await r2.save()).toBe(false);

    r2.writeAttribute("author_email_address", "jeremy_alt_email@rubyonrails.com");
    expect(await r2.save()).toBe(true);

    const r3 = new Reply({
      author_name: "jeremy",
      author_email_address: "jeremy_alt_email@rubyonrails.com",
      title: "You're wrong",
      content: "It's cubic",
      parent_id: tid,
    });
    expect(await r3.save()).toBe(false);

    r3.writeAttribute("author_name", "jj");
    expect(await r3.save()).toBe(true);

    r3.writeAttribute("author_name", "jeremy");
    expect(await r3.save()).toBe(false);
  });

  it("validate case insensitive uniqueness", async () => {
    Topic.validatesUniquenessOf("title", "parent_id", { caseSensitive: false, allowNil: true });

    const t = new Topic({ title: "I'm unique!", parent_id: 2 });
    expect(await t.save()).toBe(true);

    t.writeAttribute("content", "Remaining unique");
    expect(await t.save()).toBe(true);

    const t2 = new Topic({ title: "I'm UNIQUE!", parent_id: 1 });
    expect(await t2.save()).toBe(false);
    expect(t2.errors.messagesFor("title").length).toBeGreaterThan(0);
    expect(t2.errors.messagesFor("parent_id").length).toBeGreaterThan(0);
    expect(t2.errors.messagesFor("title")).toEqual(["has already been taken"]);

    t2.writeAttribute("title", "I'm truly UNIQUE!");
    expect(await t2.save()).toBe(false);
    expect(t2.errors.messagesFor("title")).toEqual([]);
    expect(t2.errors.messagesFor("parent_id").length).toBeGreaterThan(0);

    t2.writeAttribute("parent_id", 4);
    expect(await t2.save()).toBe(true);

    t2.writeAttribute("parent_id", null);
    t2.writeAttribute("title", null);
    expect(await t2.save()).toBe(true);
  });

  it("validate uniqueness of with multiple attributes and array forms", async () => {
    Topic.validatesUniquenessOf(["title"], "author_name");

    const uniqValidators = Topic.validators().filter(
      (v) => (v as { kind?: string }).kind === "uniqueness",
    );
    expect(uniqValidators).toHaveLength(1);
    expect((uniqValidators[0] as { attributes: readonly string[] }).attributes).toEqual([
      "title",
      "author_name",
    ]);

    const collideTitle = new Topic({ title: "The First Topic", author_name: "Someone Else" });
    expect(await collideTitle.save()).toBe(false);
    expect(collideTitle.errors.messagesFor("title")).toEqual(["has already been taken"]);
    expect(collideTitle.errors.messagesFor("author_name")).toEqual([]);

    const collideAuthor = new Topic({ title: "A Brand New Title", author_name: "David" });
    expect(await collideAuthor.save()).toBe(false);
    expect(collideAuthor.errors.messagesFor("author_name")).toEqual(["has already been taken"]);
    expect(collideAuthor.errors.messagesFor("title")).toEqual([]);

    const unique = new Topic({ title: "A Brand New Title", author_name: "Nobody In Fixtures" });
    expect(await unique.save()).toBe(true);
  });

  it("validate case sensitive uniqueness with special sql like chars", async () => {
    Topic.validatesUniquenessOf("title", { caseSensitive: true });

    const t = new Topic({ title: "I'm unique!" });
    expect(await t.save()).toBe(true);

    const t2 = new Topic({ title: "I'm %" });
    expect(await t2.save()).toBe(true);

    const t3 = new Topic({ title: "I'm uniqu_!" });
    expect(await t3.save()).toBe(true);
  });

  it("validate case insensitive uniqueness with special sql like chars", async () => {
    Topic.validatesUniquenessOf("title", { caseSensitive: false });

    const t = new Topic({ title: "I'm unique!" });
    expect(await t.save()).toBe(true);

    const t2 = new Topic({ title: "I'm %" });
    expect(await t2.save()).toBe(true);

    const t3 = new Topic({ title: "I'm uniqu_!" });
    expect(await t3.save()).toBe(true);
  });

  it("validate uniqueness by default database collation", async () => {
    Topic.validatesUniquenessOf("author_email_address");

    const topic1 = new Topic({ author_email_address: "david@loudthinking.com" });

    expect(await Topic.where({ author_email_address: "david@loudthinking.com" }).count()).toBe(1);

    expect(await topic1.save()).toBe(false);
  });

  it("validate case sensitive uniqueness", async () => {
    Topic.validatesUniquenessOf("title", { caseSensitive: true });

    const t = new Topic({ title: "I'm unique!" });
    expect(await t.save()).toBe(true);

    t.writeAttribute("content", "Remaining unique");
    expect(await t.save()).toBe(true);

    const t2 = new Topic({ title: "I'M UNIQUE!" });
    expect(await t2.save()).toBe(true);
    expect(t2.errors.messagesFor("title")).toEqual([]);

    const t3 = new Topic({ title: "I'M uNiQUe!" });
    expect(await t3.save()).toBe(true);
    expect(t3.errors.messagesFor("title")).toEqual([]);
  });

  it("validate case sensitive uniqueness with attribute passed as integer", async () => {
    Topic.validatesUniquenessOf("title", { caseSensitive: true });
    await Topic.createBang({ title: 101 as any });

    const t2 = new Topic({ title: 101 as any });
    expect(await t2.save()).toBe(false);
    expect(t2.errors.messagesFor("title")).toBeTruthy();
  });

  it("validate uniqueness with non standard table names", async () => {
    const i1 = await WarehouseThing.create({ value: 1000 });
    expect(i1.isPersisted()).toBe(false);
    expect(i1.errors.messagesFor("value").length).toBeGreaterThan(0);
  });

  it("validates uniqueness inside scoping", async () => {
    Topic.validatesUniquenessOf("title");

    const t1 = new Topic({ title: "I'm unique!", author_name: "Mary" });
    expect(await t1.save()).toBe(true);

    const t2 = new Topic({ title: "I'm unique!", author_name: "David" });
    expect(await t2.save()).toBe(false);
  });

  it("validate uniqueness with columns which are sql keywords", async () => {
    Guid.validatesUniquenessOf("key");
    try {
      const g = new Guid();
      g.writeAttribute("key", "foo");
      let raised = false;
      try {
        await g.isValid();
      } catch {
        raised = true;
      }
      expect(raised).toBe(false);
    } finally {
      Guid.clearValidatorsBang();
    }
  });

  const limitTest = (longTitle: string) =>
    adapterType === "sqlite"
      ? async () => {
          const e1 = await Event.create({ title: longTitle });
          expect(e1.isPersisted()).toBe(true);

          const e2 = await Event.create({ title: longTitle });
          expect(e2.isPersisted()).toBe(false);
        }
      : async () => {
          await expect(Event.create({ title: longTitle })).rejects.toThrow();
        };

  it("validate uniqueness with limit", limitTest("abcdefgh"));

  it("validate uniqueness with limit and utf8", limitTest("一二三四五六七八"));

  it("validate straight inheritance uniqueness", async () => {
    const w1 = await IneptWizard.create({ name: "Rincewind", city: "Ankh-Morpork" });
    expect(w1.isPersisted()).toBe(true);

    const w2 = new IneptWizard({ name: "Rincewind", city: "Quirm" });
    expect(await w2.save()).toBe(false);
    expect(w2.errors.messagesFor("name")).toEqual(["has already been taken"]);

    const w3 = new Conjurer({ name: "Rincewind", city: "Quirm" });
    expect(await w3.save()).toBe(false);
    expect(w3.errors.messagesFor("name")).toEqual(["has already been taken"]);

    const w4 = await Conjurer.create({ name: "The Amazing Bonko", city: "Quirm" });
    expect(w4.isPersisted()).toBe(true);

    const w5 = new Thaumaturgist({ name: "The Amazing Bonko", city: "Lancre" });
    expect(await w5.save()).toBe(false);
    expect(w5.errors.messagesFor("name")).toEqual(["has already been taken"]);

    const w6 = new Thaumaturgist({ name: "Mustrum Ridcully", city: "Quirm" });
    expect(await w6.save()).toBe(false);
    expect(w6.errors.messagesFor("city")).toEqual(["has already been taken"]);
  });

  it("validate uniqueness with conditions", async () => {
    Topic.validatesUniquenessOf("title", {
      conditions: function (this: any) {
        return this.where({ approved: true });
      },
    });
    await Topic.create({ title: "I'm a topic", approved: true });
    await Topic.create({ title: "I'm an unapproved topic", approved: false });

    const t3 = new Topic({ title: "I'm a topic", approved: true });
    expect(await t3.save()).toBe(false);

    const t4 = new Topic({ title: "I'm an unapproved topic", approved: false });
    expect(await t4.save()).toBe(true);
  });

  it("validate uniqueness with non callable conditions is not supported", () => {
    expect(() =>
      Topic.validatesUniquenessOf("title", {
        conditions: Topic.where({ approved: true }) as any,
      }),
    ).toThrow();
  });

  it("validate uniqueness with conditions with record arg", async () => {
    Topic.validatesUniquenessOf("title", {
      conditions: function (this: any, record: any) {
        return this.where({ author_name: record.readAttribute("author_name") });
      },
    } as any);

    const todays = new Topic({ title: "Highlights of the Day", author_name: "A" });
    expect(await todays.save()).toBe(true);

    const duplicate = new Topic({ title: "Highlights of the Day", author_name: "A" });
    expect(await duplicate.save()).toBe(false);

    const other = new Topic({ title: "Highlights of the Day", author_name: "B" });
    expect(await other.save()).toBe(true);
  });

  it("validate uniqueness on existing relation", async () => {
    const event = await Event.create({ title: "ev1" });
    const t1 = new TopicWithUniqEvent({ parent_id: (event as any).id });
    expect(await t1.save()).toBe(true);

    const topic = new TopicWithUniqEvent({ parent_id: (event as any).id });
    expect(await topic.save()).toBe(false);
    expect(topic.errors.messagesFor("event")).toEqual(["has already been taken"]);
  });

  it("validate uniqueness on empty relation", async () => {
    const topic = new TopicWithUniqEvent();
    expect(await topic.isValid()).toBe(true);
  });

  it("validate uniqueness of custom primary key", async () => {
    Keyboard.validatesUniquenessOf("key_number");
    try {
      await Keyboard.createBang({ key_number: 10 });
      const key2 = await Keyboard.createBang({ key_number: 11 });

      key2.writeAttribute("key_number", 10);
      expect(await key2.save()).toBe(false);
    } finally {
      Keyboard.clearValidatorsBang();
    }
  });

  it("validate uniqueness without primary key", async () => {
    const abc = await DashboardWithoutPrimaryKey.createBang({ dashboard_id: "abc" });
    expect(await new DashboardWithoutPrimaryKey({ dashboard_id: "xyz" }).save()).toBe(true);
    expect(await new DashboardWithoutPrimaryKey({ dashboard_id: "abc" }).save()).toBe(false);

    abc.writeAttribute("dashboard_id", "def");
    await expect(abc.saveBang()).rejects.toThrow(
      /Unknown primary key for table dashboards in model[\s\S]*Cannot validate uniqueness for persisted record without primary key\.$/,
    );
  });

  it("validate uniqueness ignores itself when primary key changed", async () => {
    Topic.validatesUniquenessOf("title");

    const t = new Topic({ title: "This is a unique title" });
    expect(await t.save()).toBe(true);

    const id = t.readAttribute("id");
    t.writeAttribute("id", typeof id === "bigint" ? id + 1n : (id as number) + 1);
    expect(await t.save()).toBe(true);
  });

  it("validate uniqueness with after create performing save", async () => {
    TopicWithAfterCreate.validatesUniquenessOf("title");
    try {
      const topic = await TopicWithAfterCreate.createBang({ title: "Title1" });
      expect((topic.readAttribute("author_name") as string).startsWith("Title1")).toBe(true);

      const topic2 = new TopicWithAfterCreate({ title: "Title1" });
      expect(await topic2.save()).toBe(false);
      expect(topic2.errors.messagesFor("title")).toEqual(["has already been taken"]);
    } finally {
      TopicWithAfterCreate.clearValidatorsBang();
    }
  });

  it.skipIf(adapterType !== "postgres")("validate uniqueness uuid", async () => {});

  it("validate uniqueness regular id", async () => {
    const item = await CoolTopic.createBang({ title: "MyItem" });
    expect(item.errors.empty).toBe(true);

    const item2 = new CoolTopic({ id: (item as { id: number }).id, title: "MyItem2" });
    expect(await item2.save()).toBe(false);
    expect(item2.errors.messagesFor("id")).toEqual(["has already been taken"]);
  });
});

describe("UniquenessValidationWithIndexTest", () => {
  fixtures(["topics"], { useTransactionalTests: false });

  beforeAll(() => {
    registerModel("Topic", Topic);
    registerModel("Event", Event);
    registerModel("Keyboard", Keyboard);
  });

  beforeEach(async () => {
    const connection = Base.connection;
    connection.internalSchemaCache.clearDataSourceCacheBang(
      connection.pool ?? connection,
      "topics",
    );
    await Topic.deleteAll();
    await Event.deleteAll();
  });

  afterEach(async () => {
    Topic.clearValidatorsBang();
    await Base.connection.removeIndex("topics", { name: "topics_index", ifExists: true });
  });

  it("new record", async () => {
    Topic.validatesUniquenessOf("title");
    await Base.connection.addIndex("topics", "title", { unique: true, name: "topics_index" });

    const t = new Topic({ title: "abc" });
    await assertQueriesCount(1, false, async () => {
      await t.isValid();
    });
  });

  it("changing non unique attribute", async () => {
    Topic.validatesUniquenessOf("title");
    await Base.connection.addIndex("topics", "title", { unique: true, name: "topics_index" });

    const t = await Topic.createBang({ title: "abc" });
    t.writeAttribute("author_name", "John");
    await assertNoQueries(false, async () => {
      await t.isValid();
    });
  });

  it("changing unique attribute", async () => {
    Topic.validatesUniquenessOf("title");
    await Base.connection.addIndex("topics", "title", { unique: true, name: "topics_index" });

    const t = await Topic.createBang({ title: "abc" });
    t.writeAttribute("title", "abc v2");
    await assertQueriesCount(1, false, async () => {
      await t.isValid();
    });
  });

  it("changing non unique attribute and unique attribute is nil", async () => {
    Topic.validatesUniquenessOf("title");
    await Base.connection.addIndex("topics", "title", { unique: true, name: "topics_index" });

    const t = await Topic.createBang({});
    expect(t.readAttribute("title")).toBeNull();
    t.writeAttribute("author_name", "John");
    await assertQueriesCount(1, false, async () => {
      await t.isValid();
    });
  });

  it("conditions", async () => {
    Topic.validatesUniquenessOf("title", {
      conditions: function (this: any) {
        return this.where().not({ author_name: null });
      },
    });
    await Base.connection.addIndex("topics", "title", { unique: true, name: "topics_index" });

    const t = await Topic.createBang({ title: "abc" });
    t.writeAttribute("title", "abc v2");
    await assertQueriesCount(1, false, async () => {
      await t.isValid();
    });
  });

  it("case sensitive", async () => {
    Topic.validatesUniquenessOf("title", { caseSensitive: true });
    await Base.connection.addIndex("topics", "title", { unique: true, name: "topics_index" });

    const t = await Topic.createBang({ title: "abc" });
    t.writeAttribute("title", "abc v2");
    await assertQueriesCount(1, false, async () => {
      await t.isValid();
    });
  });

  itIfSupports("partial_index", "partial index", async () => {
    Topic.validatesUniquenessOf("title");
    await Base.connection.addIndex("topics", "title", {
      unique: true,
      where: "approved",
      name: "topics_index",
    });

    const t = await Topic.createBang({ title: "abc" });
    t.writeAttribute("author_name", "John");
    await assertQueriesCount(1, false, async () => {
      await t.isValid();
    });
  });

  it("non unique index", async () => {
    Topic.validatesUniquenessOf("title");
    await Base.connection.addIndex("topics", "title", { name: "topics_index" });

    const t = await Topic.createBang({ title: "abc" });
    t.writeAttribute("author_name", "John");
    await assertQueriesCount(1, false, async () => {
      await t.isValid();
    });
  });

  it("scope", async () => {
    Topic.validatesUniquenessOf("title", { scope: "author_name" });
    await Base.connection.addIndex("topics", ["author_name", "title"], {
      unique: true,
      name: "topics_index",
    });

    const t = await Topic.createBang({ title: "abc", author_name: "John" });
    t.writeAttribute("content", "hello world");
    await assertNoQueries(false, async () => {
      await t.isValid();
    });

    t.writeAttribute("author_name", "Amy");
    await assertQueriesCount(1, false, async () => {
      await t.isValid();
    });
  });

  it("uniqueness on relation", async () => {
    await Base.connection.addIndex("topics", "parent_id", {
      unique: true,
      name: "topics_index",
    });

    const e1 = await Event.createBang({ title: "abc" });
    const e2 = await Event.createBang({ title: "cde" });
    const t = await TopicWithEvent.createBang({ parent_id: (e1 as any).id });
    try {
      t.writeAttribute("content", "hello world");
      await assertNoQueries(false, async () => {
        await t.isValid();
      });

      t.writeAttribute("parent_id", (e2 as any).id);
      await assertQueriesCount(1, false, async () => {
        await t.isValid();
      });
    } finally {
      await Event.deleteAll();
    }
  });

  it("uniqueness on custom relation primary key", async () => {
    await Keyboard.createBang({ name: "Keyboard #1" });
    await LessonWithUniqKeyboard.createBang({ name: "Keyboard #1" });

    const another = new LessonWithUniqKeyboard({ name: "Keyboard #1" });
    expect(await another.isValid()).toBe(false);
    expect(another.errors.messagesFor("keyboard")).toEqual(["has already been taken"]);
  });

  it("index of sublist of columns", async () => {
    Topic.validatesUniquenessOf("title", { scope: "author_name" });
    await Base.connection.addIndex("topics", "author_name", {
      unique: true,
      name: "topics_index",
    });

    const t = await Topic.createBang({ title: "abc", author_name: "John" });
    t.writeAttribute("content", "hello world");
    await assertNoQueries(false, async () => {
      await t.isValid();
    });

    t.writeAttribute("author_name", "Amy");
    await assertQueriesCount(1, false, async () => {
      await t.isValid();
    });
  });

  it("index of columns list and extra columns", async () => {
    Topic.validatesUniquenessOf("title");
    await Base.connection.addIndex("topics", ["title", "author_name"], {
      unique: true,
      name: "topics_index",
    });

    const t = await Topic.createBang({ title: "abc", author_name: "John" });
    t.writeAttribute("content", "hello world");
    await assertQueriesCount(1, false, async () => {
      await t.isValid();
    });
  });

  it.skipIf(adapterType !== "postgres")("expression index", async () => {
    Topic.validatesUniquenessOf("title");
    await Base.connection.addIndex("topics", "LOWER(title)", {
      unique: true,
      name: "topics_index",
    });

    const t = await Topic.createBang({ title: "abc", author_name: "John" });
    t.writeAttribute("content", "hello world");

    await assertQueriesCount(1, false, async () => {
      await t.isValid();
    });
  });
});

describe("UniquenessWithCompositeKey", () => {
  fixtures(["cpkAuthors"]);

  beforeAll(() => {
    registerModel("CpkAuthor", CpkAuthor);
    registerModel("CpkBook", CpkBook);
  });

  it("uniqueness validation for model with composite key", async () => {
    const bookOne = await BookWithUniqueRevision.createBang({
      id: [1, 42] as any,
      title: "Author 1's book",
      revision: 36,
    });
    const bookTwo = await BookWithUniqueRevision.createBang({
      id: [2, 42] as any,
      title: "Author 2's book",
      revision: 37,
    });

    expect(bookOne.readAttribute("revision")).not.toBe(bookTwo.readAttribute("revision"));

    bookTwo.writeAttribute("revision", bookOne.readAttribute("revision"));
    expect(await bookTwo.save()).toBe(false);
  });
});

class BigIntTest extends Base {
  static _tableName = "cars";
  static {
    this.validates("engines_count", {
      uniqueness: true,
      inclusion: { in: new Range(0, INT_MAX_VALUE) },
    });
  }
}

class BigIntReverseTest extends Base {
  static _tableName = "cars";
  static {
    this.validates("engines_count", { inclusion: { in: new Range(0, INT_MAX_VALUE) } });
    this.validates("engines_count", { uniqueness: true });
  }
}

class TopicWithEvent extends Topic {
  static {
    this.belongsTo("event", { foreignKey: "parent_id" });
    this.validatesUniquenessOf("event");
  }
}

class TopicWithUniqEvent extends Topic {
  static {
    this.belongsTo("event", { foreignKey: "parent_id" });
    this.validates("event", { uniqueness: true });
  }
}

for (const klass of [BigIntTest, BigIntReverseTest, TopicWithEvent, TopicWithUniqEvent]) {
  registerSubclass(klass);
}
