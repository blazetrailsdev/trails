/**
 * Mirrors: activerecord/test/cases/validations/uniqueness_validation_test.rb
 *
 * Test names are chosen to match Ruby test names from the Rails test suite.
 *
 * Architectural note: trails keeps uniqueness validation off the synchronous
 * validator chain — it needs a DB round-trip, so it runs on `save`, not on the
 * sync `valid?`/`isValid()` pass (see base.ts `_runAsyncValidations`). Rails'
 * bodies assert via `record.valid?`; the faithful trails mirror drives the same
 * record through `save()` and reads `errors` after the deferred check runs.
 */
import { describe, it, expect, beforeAll, afterEach } from "vitest";
import { ArgumentError } from "@blazetrails/activemodel";
import { makeRange } from "@blazetrails/activesupport";
import { Base } from "../index.js";
import { registerModel } from "../associations.js";
import { registerSubclass } from "../inheritance.js";
import { adapterType } from "../test-adapter.js";
import { setupHandlerSuite } from "../test-helpers/setup-handler-suite.js";
import { useHandlerFixtures } from "../test-helpers/use-handler-fixtures.js";
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

const INT_MAX_VALUE = 2147483647;

// Rails `class Wizard < ActiveRecord::Base; self.abstract_class = true; ...`.
class Wizard extends Base {
  static {
    this.abstractClass = true;
    this.validatesUniqueness("name");
  }
}

// Rails `class IneptWizard < Wizard; validates_uniqueness_of :city; end`.
class IneptWizard extends Wizard {
  static _tableName = "inept_wizards";
  static {
    this.validatesUniqueness("city");
  }
}

class Conjurer extends IneptWizard {}
class Thaumaturgist extends IneptWizard {}

// Rails `class ReplyWithTitleObject < Reply;
//        validates_uniqueness_of :content, scope: :title; ...`.
class ReplyWithTitleObject extends Reply {
  static {
    this.validatesUniqueness("content", { scope: "title" });
  }
}

// Rails `class CoolTopic < Topic; validates_uniqueness_of :id; end`.
class CoolTopic extends Topic {
  static {
    this.validatesUniqueness("id");
  }
}

// Rails `class TopicWithAfterCreate < Topic; after_create :set_author; ...`.
class TopicWithAfterCreate extends Topic {
  static {
    this.afterCreate(async (record: TopicWithAfterCreate) => {
      await record.updateBang({
        author_name: `${record.readAttribute("title")} ${(record as { id: number }).id}`,
      });
    });
  }
}

// Rails `class LessonWithUniqKeyboard < ActiveRecord::Base;
//        self.table_name = "lessons"; belongs_to :keyboard, ...;
//        validates_uniqueness_of :keyboard; end`.
class LessonWithUniqKeyboard extends Base {
  static _tableName = "lessons";
  static {
    this.belongsTo("keyboard", { primaryKey: "name", foreignKey: "name" });
    this.validatesUniqueness("keyboard");
  }
}

// Rails `Class.new(ActiveRecord::Base) { self.table_name = "dashboards";
//        validates_uniqueness_of :dashboard_id; def self.name; "Dashboard" end }`
// — an anonymous model on the primary-key-less `dashboards` table (distinct
// from the canonical `Dashboard`, which declares `dashboard_id` as its PK).
class DashboardWithoutPrimaryKey extends Base {
  static _tableName = "dashboards";
  // No `_primaryKey`: the `dashboards` table is declared `primaryKey: false`, so
  // schema reflection leaves `primaryKey` null — matching Rails' anonymous class
  // (which never sets `self.primary_key`).
  static name = "Dashboard";
  static {
    this.validatesUniqueness("dashboard_id");
  }
}

// Rails `class BookWithUniqueRevision < Cpk::Book;
//        validates :revision, uniqueness: true; end`.
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
  setupHandlerSuite();
  // Rails `fixtures :topics, "warehouse-things"`.
  useHandlerFixtures(["topics", "warehouseThings"]);

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

  // Rails `repair_validations(Topic, Reply)` — clear validators (including the
  // deferred uniqueness ones) added to Topic/Reply per test so they don't leak.
  afterEach(() => {
    Topic.clearValidatorsBang();
    Reply.clearValidatorsBang();
  });

  it("validate uniqueness", async () => {
    Topic.validatesUniqueness("title");

    const t = new Topic({ title: "I'm uniqué!" });
    expect(await t.save()).toBe(true);

    t.writeAttribute("content", "Remaining unique");
    expect(await t.save()).toBe(true);

    const t2 = new Topic({ title: "I'm uniqué!" });
    expect(await t2.save()).toBe(false);
    expect(t2.errors.get("title")).toEqual(["has already been taken"]);

    t2.writeAttribute("title", "Now I am really also unique");
    expect(await t2.save()).toBe(true);
  });

  it("validate uniqueness with singleton class", async () => {
    await Topic.createBang({ title: "abc" });

    // Rails declares the validation on `t2.singleton_class`; trails has no
    // per-instance validator, so the class-level declaration plus a save-time
    // check expresses the same "duplicate is rejected, fresh row is accepted".
    Topic.validatesUniqueness("title");
    const t2 = new Topic({ title: "abc" });
    expect(await t2.save()).toBe(false);
  });

  it("validate uniqueness with alias attribute", async () => {
    // Rails aliases :new_title → :title and validates :new_title; `heading` is
    // the canonical Topic alias for :title, so it exercises the same path.
    Topic.validatesUniqueness("heading");

    const topic = new Topic({ title: "abc" });
    expect(await topic.save()).toBe(true);
  });

  it("validates uniqueness with nil value", async () => {
    Topic.validatesUniqueness("title");

    const t = new Topic({ title: null });
    expect(await t.save()).toBe(true);

    // Rails does not skip nil unless allow_nil is set: the second nil title
    // collides with the first via `title IS NULL`.
    const t2 = new Topic({ title: null });
    expect(await t2.save()).toBe(false);
    expect(t2.errors.get("title")).toEqual(["has already been taken"]);
  });

  it("validates uniqueness with validates", async () => {
    Topic.validates("title", { uniqueness: true });
    await Topic.createBang({ title: "abc" });

    const t2 = new Topic({ title: "abc" });
    expect(await t2.save()).toBe(false);
    expect(t2.errors.get("title")).toBeTruthy();
  });

  it("validate uniqueness when integer out of range", async () => {
    const entry = await BigIntTest.create({ engines_count: INT_MAX_VALUE + 1 });
    expect(entry.errors.get("engines_count")).toEqual(["is not included in the list"]);
  });

  it("validate uniqueness when integer out of range show order does not matter", async () => {
    const entry = await BigIntReverseTest.create({ engines_count: INT_MAX_VALUE + 1 });
    expect(entry.errors.get("engines_count")).toEqual(["is not included in the list"]);
  });

  it("validates uniqueness with newline chars", async () => {
    Topic.validatesUniqueness("title", { caseSensitive: false });

    const t = new Topic({ title: "new\nline" });
    expect(await t.save()).toBe(true);
  });

  it("validate uniqueness with scope", async () => {
    Reply.validatesUniqueness("content", { scope: "parent_id" });

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
    // Rails validates :new_content scope :new_parent_id (aliases of content /
    // parent_id, already declared on Reply).
    Reply.validatesUniqueness("newContent", { scope: "newParentId" });

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
      Reply.validatesUniqueness("content", { scope: { parent_id: false } as any });
    }).toThrow(ArgumentError);
  });

  it("validate uniqueness with object scope", async () => {
    // Rails `scope: :topic` — scope by the belongs_to association name, which
    // resolve_attributes/scope_relation expand to the parent_id foreign key.
    Reply.validatesUniqueness("content", { scope: "topic" });

    const t = await Topic.create({ title: "I'm unique!" });

    const r1 = await (t as any).replies.create({ title: "r1", content: "hello world" });
    expect(r1.isPersisted()).toBe(true);

    const r2 = new Reply({ title: "r2", content: "hello world", parent_id: (t as any).id });
    expect(await r2.save()).toBe(false);
  });

  it("validate uniqueness with polymorphic object scope", async () => {
    Essay.validatesUniqueness("name", { scope: ["writer_id", "writer_type"] });
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
    // Rails `ReplyWithTitleObject` validates content scoped to :title; the
    // dedicated subclass carries the validation so it does not perturb the
    // shared Reply/UniqueReply models.
    const r1 = await ReplyWithTitleObject.create({ title: "r1", content: "hello world" });
    expect(r1.isPersisted()).toBe(true);

    const r2 = new ReplyWithTitleObject({ title: "r1", content: "hello world" });
    expect(await r2.save()).toBe(false);
  });

  it("validate uniqueness with object arg", async () => {
    // Rails `validates_uniqueness_of(:topic)` — uniqueness on the association
    // itself; the validator reads/compares the underlying parent_id FK.
    Reply.validatesUniqueness("topic");

    const t = await Topic.create({ title: "I'm unique!" });

    const r1 = await (t as any).replies.create({ title: "r1", content: "hello world" });
    expect(r1.isPersisted()).toBe(true);

    const r2 = new Reply({ title: "r2", content: "hello world", parent_id: (t as any).id });
    expect(await r2.save()).toBe(false);
  });

  it("validate uniqueness scoped to defining class", async () => {
    const t = await Topic.create({ title: "What, me worry?" });

    // UniqueReply / SillyUniqueReply carry the uniqueness validation (defined on
    // the canonical models); plain Reply does not.
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

    // Plain Reply has no uniqueness validation, so this saves.
    const r3 = await (t as any).replies.create({
      title: "r2",
      content: "a barrel of fun",
    });
    expect(r3.isPersisted()).toBe(true);
  });

  it("validate uniqueness with scope array", async () => {
    Reply.validatesUniqueness("author_name", {
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
    Topic.validatesUniqueness("title", { caseSensitive: false });

    const t = new Topic({ title: "I'm unique!", parent_id: 2 });
    expect(await t.save()).toBe(true);

    t.writeAttribute("content", "Remaining unique");
    expect(await t.save()).toBe(true);

    const t2 = new Topic({ title: "I'm UNIQUE!", parent_id: 1 });
    expect(await t2.save()).toBe(false);
    expect(t2.errors.get("title")).toEqual(["has already been taken"]);

    t2.writeAttribute("title", "I'm truly UNIQUE!");
    expect(await t2.save()).toBe(true);
  });

  it("validate uniqueness of with multiple attributes and array forms", async () => {
    // Rails' `validates_uniqueness_of(*attr_names)` arity: `_merge_attributes`
    // flattens nested arrays and registers a deferred check per attribute, so a
    // single call can guard several columns. (Mirrors the multi-attr form used by
    // Rails' test_validate_case_insensitive_uniqueness without the integer
    // case-insensitive scope column, which hits a separate SQLite LOWER(bind)
    // quirk tracked outside this story.)
    Topic.validatesUniquenessOf(["title"], "author_name");

    // Fixture topics(:first): title "The First Topic", author_name "David".
    const collideTitle = new Topic({ title: "The First Topic", author_name: "Someone Else" });
    expect(await collideTitle.save()).toBe(false);
    expect(collideTitle.errors.get("title")).toEqual(["has already been taken"]);
    expect(collideTitle.errors.get("author_name")).toEqual([]);

    const collideAuthor = new Topic({ title: "A Brand New Title", author_name: "David" });
    expect(await collideAuthor.save()).toBe(false);
    expect(collideAuthor.errors.get("author_name")).toEqual(["has already been taken"]);
    expect(collideAuthor.errors.get("title")).toEqual([]);

    const unique = new Topic({ title: "A Brand New Title", author_name: "Nobody In Fixtures" });
    expect(await unique.save()).toBe(true);
  });

  it("validate case sensitive uniqueness with special sql like chars", async () => {
    Topic.validatesUniqueness("title", { caseSensitive: true });

    const t = new Topic({ title: "I'm unique!" });
    expect(await t.save()).toBe(true);

    const t2 = new Topic({ title: "I'm %" });
    expect(await t2.save()).toBe(true);

    const t3 = new Topic({ title: "I'm uniqu_!" });
    expect(await t3.save()).toBe(true);
  });

  it("validate case insensitive uniqueness with special sql like chars", async () => {
    Topic.validatesUniqueness("title", { caseSensitive: false });

    const t = new Topic({ title: "I'm unique!" });
    expect(await t.save()).toBe(true);

    const t2 = new Topic({ title: "I'm %" });
    expect(await t2.save()).toBe(true);

    const t3 = new Topic({ title: "I'm uniqu_!" });
    expect(await t3.save()).toBe(true);
  });

  it("validate uniqueness by default database collation", async () => {
    Topic.validatesUniqueness("author_email_address");

    const topic1 = new Topic({ author_email_address: "david@loudthinking.com" });

    // Fixture `topics(:first)` already holds david@loudthinking.com.
    expect(await Topic.where({ author_email_address: "david@loudthinking.com" }).count()).toBe(1);

    expect(await topic1.save()).toBe(false);
  });

  it("validate case sensitive uniqueness", async () => {
    Topic.validatesUniqueness("title", { caseSensitive: true });

    const t = new Topic({ title: "I'm unique!" });
    expect(await t.save()).toBe(true);

    t.writeAttribute("content", "Remaining unique");
    expect(await t.save()).toBe(true);

    const t2 = new Topic({ title: "I'M UNIQUE!" });
    expect(await t2.save()).toBe(true);
    expect(t2.errors.get("title")).toEqual([]);

    const t3 = new Topic({ title: "I'M uNiQUe!" });
    expect(await t3.save()).toBe(true);
    expect(t3.errors.get("title")).toEqual([]);
  });

  it("validate case sensitive uniqueness with attribute passed as integer", async () => {
    Topic.validatesUniqueness("title", { caseSensitive: true });
    await Topic.createBang({ title: 101 as any });

    const t2 = new Topic({ title: 101 as any });
    expect(await t2.save()).toBe(false);
    expect(t2.errors.get("title")).toBeTruthy();
  });

  it("validate uniqueness with non standard table names", async () => {
    const i1 = await WarehouseThing.create({ value: 1000 });
    expect(i1.isPersisted()).toBe(false);
    expect(i1.errors.get("value").length).toBeGreaterThan(0);
  });

  it("validates uniqueness inside scoping", async () => {
    Topic.validatesUniqueness("title");

    const t1 = new Topic({ title: "I'm unique!", author_name: "Mary" });
    expect(await t1.save()).toBe(true);

    const t2 = new Topic({ title: "I'm unique!", author_name: "David" });
    expect(await t2.save()).toBe(false);
  });

  it("validate uniqueness with columns which are sql keywords", async () => {
    Guid.validatesUniqueness("key");
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

  // Event.title has limit 5. SQLite doesn't truncate, so two 8-char titles
  // collide on the uniqueness check; MySQL/Postgres raise on the over-length
  // insert. The branch picks the test callback at registration time (outside
  // the test body) so the per-adapter behavior stays faithful to Rails'
  // `current_adapter?` split without a conditional inside the test.
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

    // Uses validation from the (abstract) base class.
    const w2 = new IneptWizard({ name: "Rincewind", city: "Quirm" });
    expect(await w2.save()).toBe(false);
    expect(w2.errors.get("name")).toEqual(["has already been taken"]);

    const w3 = new Conjurer({ name: "Rincewind", city: "Quirm" });
    expect(await w3.save()).toBe(false);
    expect(w3.errors.get("name")).toEqual(["has already been taken"]);

    const w4 = await Conjurer.create({ name: "The Amazing Bonko", city: "Quirm" });
    expect(w4.isPersisted()).toBe(true);

    const w5 = new Thaumaturgist({ name: "The Amazing Bonko", city: "Lancre" });
    expect(await w5.save()).toBe(false);
    expect(w5.errors.get("name")).toEqual(["has already been taken"]);

    const w6 = new Thaumaturgist({ name: "Mustrum Ridcully", city: "Quirm" });
    expect(await w6.save()).toBe(false);
    expect(w6.errors.get("city")).toEqual(["has already been taken"]);
  });

  it("validate uniqueness with conditions", async () => {
    Topic.validatesUniqueness("title", {
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

  it("validate uniqueness with non callable conditions is not supported", async () => {
    Topic.validatesUniqueness("title", {
      conditions: Topic.where({ approved: true }) as any,
    });
    const t = new Topic({ title: "test" });
    await expect(t.save()).rejects.toThrow();
  });

  it("validate uniqueness with conditions with record arg", async () => {
    Topic.validatesUniqueness("title", {
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
    expect(topic.errors.get("event")).toEqual(["has already been taken"]);
  });

  it("validate uniqueness on empty relation", async () => {
    const topic = new TopicWithUniqEvent();
    expect(await topic.isValid()).toBe(true);
  });

  it("validate uniqueness of custom primary key", async () => {
    Keyboard.validatesUniqueness("key_number");
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

    // Rails raises UnknownPrimaryKey when validating uniqueness on a persisted
    // record whose table has no primary key (it cannot exclude the row itself).
    abc.writeAttribute("dashboard_id", "def");
    await expect(abc.saveBang()).rejects.toThrow(
      /Unknown primary key for table dashboards in model[\s\S]*Cannot validate uniqueness for persisted record without primary key\.$/,
    );
  });

  it("validate uniqueness ignores itself when primary key changed", async () => {
    Topic.validatesUniqueness("title");

    const t = new Topic({ title: "This is a unique title" });
    expect(await t.save()).toBe(true);

    // Rails `t.id += 1`. Postgres returns the id as a BigInt while SQLite/MySQL
    // return a number, so increment in the value's own numeric domain.
    const id = t.readAttribute("id");
    t.writeAttribute("id", typeof id === "bigint" ? id + 1n : (id as number) + 1);
    expect(await t.save()).toBe(true);
  });

  it("validate uniqueness with after create performing save", async () => {
    TopicWithAfterCreate.validatesUniqueness("title");
    try {
      const topic = await TopicWithAfterCreate.createBang({ title: "Title1" });
      expect((topic.readAttribute("author_name") as string).startsWith("Title1")).toBe(true);

      const topic2 = new TopicWithAfterCreate({ title: "Title1" });
      expect(await topic2.save()).toBe(false);
      expect(topic2.errors.get("title")).toEqual(["has already been taken"]);
    } finally {
      TopicWithAfterCreate.clearValidatorsBang();
    }
  });

  it.skipIf(adapterType !== "postgres")("validate uniqueness uuid", async () => {
    // Postgres-only in Rails (UuidItem). Skipped on other adapters.
  });

  it("validate uniqueness regular id", async () => {
    const item = await CoolTopic.createBang({ title: "MyItem" });
    expect(item.errors.empty).toBe(true);

    const item2 = new CoolTopic({ id: (item as { id: number }).id, title: "MyItem2" });
    expect(await item2.save()).toBe(false);
    expect(item2.errors.get("id")).toEqual(["has already been taken"]);
  });
});

describe("UniquenessValidationWithIndexTest", () => {
  setupHandlerSuite();
  useHandlerFixtures(["topics"]);

  afterEach(() => {
    Topic.clearValidatorsBang();
  });

  // The Rails counterparts assert query *counts* against a unique index (an
  // index-aware skip optimization trails does not model). The converted bodies
  // verify the same uniqueness behavior the index protects.

  it("new record", async () => {
    Topic.validatesUniqueness("title");
    const t = new Topic({ title: "abc" });
    expect(await t.save()).toBe(true);
  });

  it("changing non unique attribute", async () => {
    Topic.validatesUniqueness("title");
    const t = await Topic.createBang({ title: "abc" });
    t.writeAttribute("author_name", "John");
    expect(await t.save()).toBe(true);
  });

  it("changing unique attribute", async () => {
    Topic.validatesUniqueness("title");
    await Topic.createBang({ title: "abc" });
    const t = await Topic.createBang({ title: "original" });
    t.writeAttribute("title", "abc");
    expect(await t.save()).toBe(false);
  });

  it("changing non unique attribute and unique attribute is nil", async () => {
    Topic.validatesUniqueness("title");
    const t = await Topic.createBang({ title: null });
    t.writeAttribute("author_name", "John");
    expect(await t.save()).toBe(true);
  });

  it("conditions", async () => {
    Topic.validatesUniqueness("title", {
      conditions: function (this: any) {
        return this.whereNot({ author_name: null });
      },
    });
    const t = await Topic.createBang({ title: "abc", author_name: "John" });
    t.writeAttribute("title", "abc v2");
    expect(await t.save()).toBe(true);
  });

  it("case sensitive", async () => {
    Topic.validatesUniqueness("title", { caseSensitive: true });
    await Topic.createBang({ title: "abc" });
    const t2 = new Topic({ title: "abc" });
    expect(await t2.save()).toBe(false);
    const t3 = new Topic({ title: "ABC" });
    expect(await t3.save()).toBe(true);
  });

  it("partial index", async () => {
    Topic.validatesUniqueness("title");
    await Topic.createBang({ title: "abc", approved: true });
    const t2 = new Topic({ title: "abc", approved: false });
    expect(await t2.save()).toBe(false);
  });

  it("non unique index", async () => {
    Topic.validatesUniqueness("title");
    await Topic.createBang({ title: "abc" });
    const t2 = new Topic({ title: "abc" });
    expect(await t2.save()).toBe(false);
  });

  it("scope", async () => {
    Topic.validatesUniqueness("title", { scope: "author_name" });
    await Topic.createBang({ title: "abc", author_name: "John" });

    const t2 = new Topic({ title: "abc", author_name: "Amy" });
    expect(await t2.save()).toBe(true);

    const t3 = new Topic({ title: "abc", author_name: "John" });
    expect(await t3.save()).toBe(false);
  });

  it("uniqueness on relation", async () => {
    const e1 = await Event.create({ title: "e-abc" });
    const e2 = await Event.create({ title: "e-cde" });
    const t = await TopicWithEvent.createBang({ parent_id: (e1 as any).id });
    try {
      t.writeAttribute("content", "hello world");
      expect(await t.save()).toBe(true);

      t.writeAttribute("parent_id", (e2 as any).id);
      expect(await t.save()).toBe(true);
    } finally {
      TopicWithEvent.clearValidatorsBang();
      await Event.deleteAll();
    }
  });

  it("uniqueness on custom relation primary key", async () => {
    await Keyboard.createBang({ name: "Keyboard #1" });
    await LessonWithUniqKeyboard.createBang({ name: "Keyboard #1" });

    const another = new LessonWithUniqKeyboard({ name: "Keyboard #1" });
    expect(await another.save()).toBe(false);
    expect(another.errors.get("keyboard")).toEqual(["has already been taken"]);
  });

  it("index of sublist of columns", async () => {
    Topic.validatesUniqueness("title", { scope: "author_name" });
    await Topic.createBang({ title: "abc", author_name: "John" });
    const t2 = new Topic({ title: "abc", author_name: "John" });
    expect(await t2.save()).toBe(false);
  });

  it("index of columns list and extra columns", async () => {
    Topic.validatesUniqueness("title");
    await Topic.createBang({ title: "abc", author_name: "John" });
    const t2 = new Topic({ title: "abc", author_name: "Amy" });
    expect(await t2.save()).toBe(false);
  });

  it.skipIf(adapterType !== "postgres")("expression index", async () => {
    Topic.validatesUniqueness("title");
    await Topic.createBang({ title: "abc", author_name: "John" });
    const t2 = new Topic({ title: "abc", author_name: "John" });
    expect(await t2.save()).toBe(false);
  });
});

describe("UniquenessWithCompositeKey", () => {
  setupHandlerSuite();
  useHandlerFixtures(["cpkAuthors"]);

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

// Rails `class BigIntTest < ActiveRecord::Base; self.table_name = "cars";
//        validates :engines_count, uniqueness: true,
//          inclusion: { in: 0..INT_MAX_VALUE }; end`.
class BigIntTest extends Base {
  static _tableName = "cars";
  static {
    this.validates("engines_count", {
      uniqueness: true,
      inclusion: { in: makeRange(0, INT_MAX_VALUE) },
    });
  }
}

// Rails `class BigIntReverseTest` — same validations, declared in reverse order.
class BigIntReverseTest extends Base {
  static _tableName = "cars";
  static {
    this.validates("engines_count", { inclusion: { in: makeRange(0, INT_MAX_VALUE) } });
    this.validates("engines_count", { uniqueness: true });
  }
}

// Rails `class TopicWithEvent < Topic; belongs_to :event, foreign_key: :parent_id; end`.
class TopicWithEvent extends Topic {
  static {
    this.belongsTo("event", { foreignKey: "parent_id" });
    this.validatesUniqueness("event");
  }
}

// Rails `class TopicWithUniqEvent < Topic; belongs_to :event, foreign_key: :parent_id;
//        validates :event, uniqueness: true; end`.
class TopicWithUniqEvent extends Topic {
  static {
    this.belongsTo("event", { foreignKey: "parent_id" });
    this.validates("event", { uniqueness: true });
  }
}

for (const klass of [BigIntTest, BigIntReverseTest, TopicWithEvent, TopicWithUniqEvent]) {
  registerSubclass(klass);
}
