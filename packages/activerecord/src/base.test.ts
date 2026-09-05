import { describe, it, expect, afterAll, afterEach, vi } from "vitest";
import { ActiveRecord, Base, NotImplementedError, ReadonlyAttributeError } from "./index.js";
import { TableNotSpecified, ActiveRecordError } from "./errors.js";

import { adapterType } from "./test-adapter.js";
import { quoteColumnName } from "./support/quote-regex.js";
import { association } from "./associations.js";
import { connectedToStack } from "./core.js";
import { Notifications, Logger, TimeWithZone } from "@blazetrails/activesupport";
import { Temporal, Time as RubyTime } from "@blazetrails/date";
import { fixtures } from "./test-fixtures.js";
import { withTimezoneConfig } from "./test-helper.js";
import { IntegerType, ValueType } from "@blazetrails/activemodel";
import { CpkBook } from "./test-helpers/models/cpk.js";
import { Company as CanonicalCompany } from "./test-helpers/models/company.js";
import { PostRecord } from "./test-helpers/models/post.js";
import { Subscriber } from "./test-helpers/models/subscriber.js";
import {
  Developer as CanonicalDeveloper,
  SubDeveloper,
  SymbolIgnoredDeveloper,
  AttributedDeveloper,
} from "./test-helpers/models/developer.js";
import { Topic as CanonicalTopic } from "./test-helpers/models/topic.js";
import { Category } from "./test-helpers/models/category.js";
import { Car } from "./test-helpers/models/car.js";
import { Bulb } from "./test-helpers/models/bulb.js";
import "./support/canonical-model-index.js";
import { MultiparameterAssignmentErrors, type AttributeAssignmentError } from "./errors.js";
import { Range as ArRange } from "@blazetrails/ruby-compat";

vi.stubEnv("AR_NO_AUTO_SCHEMA", "1");

describe("BasicsTest", () => {
  fixtures([]);
  const cleanupConnections: Array<() => unknown> = [];
  afterEach(async () => {
    vi.restoreAllMocks();
    while (cleanupConnections.length > 0) await cleanupConnections.pop()!();
  });

  it("table name based on model name", () => {
    expect(PostRecord.tableName).toBe("posts");
  });

  it("switching between table name", () => {
    class User extends Base {
      declare active: boolean;
      declare name: string;
      static {
        this.tableName = "people";
      }
    }
    expect(User.tableName).toBe("people");
  });

  it("auto id", () => {
    class User extends Base {
      declare active: boolean;
      declare name: string;
    }
    expect(User.primaryKey).toBe("id");
  });

  it("has attribute", () => {
    class User extends Base {
      declare active: boolean;
      declare name: string;
      static {
        this.attribute("name", "string");
      }
    }
    const u = new User({ name: "test" });
    expect(u.hasAttribute("name")).toBe(true);
    expect(u.hasAttribute("nonexistent")).toBe(false);
  });

  it("initialize with attributes", () => {
    class User extends Base {
      declare active: boolean;
      declare name: string;
      static {
        this.attribute("name", "string");
      }
    }
    const u = new User({ name: "test" });
    expect(u.name).toBe("test");
    expect(u.isNewRecord()).toBe(true);
  });

  it("equality", async () => {
    class User extends Base {
      declare active: boolean;
      declare name: string;
      static {
        this.attribute("name", "string");
      }
    }
    const u1 = await User.create({ name: "a" });
    const u2 = await User.find(u1.id);
    expect(u1.equals(u2)).toBe(true);
  });

  it("equality of new records", () => {
    class User extends Base {
      declare active: boolean;
      declare name: string;
      static {
        this.attribute("name", "string");
      }
    }
    const u1 = new User({ name: "a" });
    const u2 = new User({ name: "a" });
    expect(u1.equals(u2)).toBe(false);
  });

  it("all", async () => {
    class User extends Base {
      declare active: boolean;
      declare name: string;
      static {
        this.attribute("name", "string");
      }
    }
    await User.create({ name: "a" });
    const all = await User.all();
    expect(all.length).toBe(1);
  });

  it("null fields", async () => {
    class User extends Base {
      declare active: boolean;
      declare name: string;
      static {
        this.attribute("name", "string");
      }
    }
    const sql = User.where({ name: null }).toSql();
    expect(sql).toContain("IS NULL");
  });

  it("select symbol", () => {
    class User extends Base {
      declare active: boolean;
      declare name: string;
      static {
        this.attribute("name", "string");
      }
    }
    const sql = User.select("name").toSql();
    expect(sql).toContain("name");
  });

  it("previously new record returns boolean", async () => {
    class User extends Base {
      declare active: boolean;
      declare name: string;
      static {
        this.attribute("name", "string");
      }
    }
    const u = new User({ name: "a" });
    expect(u.isPreviouslyNewRecord()).toBe(false);
    await u.save();
    expect(u.isPreviouslyNewRecord()).toBe(true);
  });

  it("previously changed", async () => {
    class User extends Base {
      declare active: boolean;
      declare name: string;
      static {
        this.attribute("name", "string");
      }
    }
    const u = await User.create({ name: "old" });
    u.name = "new";
    await u.save();
    const sc = u.savedChanges;
    expect(sc).toHaveProperty("name");
  });

  it("records without an id have unique hashes", () => {
    class User extends Base {
      declare active: boolean;
      declare name: string;
      static {
        this.attribute("name", "string");
      }
    }
    const u1 = new User({ name: "a" });
    const u2 = new User({ name: "a" });
    expect(u1.equals(u2)).toBe(false);
  });

  it("distinct delegates to scoped", () => {
    class User extends Base {
      declare active: boolean;
      declare name: string;
      static {
        this.attribute("name", "string");
      }
    }
    const sql = User.distinct().toSql();
    expect(sql).toContain("DISTINCT");
  });

  it("#present? and #blank? on ActiveRecord::Base classes", async () => {
    class User extends Base {
      declare active: boolean;
      declare name: string;
      static {
        this.attribute("name", "string");
      }
    }
    const blank = await User.all().isBlank();
    expect(blank).toBe(true);
    const present = await User.all().isPresent();
    expect(present).toBe(false);
  });

  it("limit should take value from latest limit", () => {
    class User extends Base {
      declare active: boolean;
      declare name: string;
      static {
        this.attribute("name", "string");
      }
    }
    const sql = User.limit(5).limit(3).toSql();
    expect(sql).toContain("3");
  });

  it("create after initialize without block", async () => {
    class User extends Base {
      declare active: boolean;
      declare name: string;
      static {
        this.attribute("name", "string");
      }
    }
    const u = new User({ name: "test" });
    await u.save();
    expect(u.isPersisted()).toBe(true);
  });

  it("readonly attributes", async () => {
    class User extends Base {
      declare active: boolean;
      declare name: string;
      static {
        this.attribute("name", "string");
      }
    }
    const rel = User.all().readonly();
    expect(rel.isReadonly).toBe(true);
  });

  it("scoped can take a values hash", () => {
    class User extends Base {
      declare active: boolean;
      declare name: string;
      static {
        this.attribute("name", "string");
      }
    }
    const rel = User.where({ name: "test" });
    const attrs = rel.scopeForCreate();
    expect(attrs.name).toBe("test");
  });

  it("abstract class table name", () => {
    class AbstractModel extends Base {
      static {
        this.abstractClass = true;
      }
    }
    expect(AbstractModel.abstractClass).toBe(true);
  });

  it("many mutations", async () => {
    class User extends Base {
      declare active: boolean;
      declare name: string;
      static {
        this.attribute("name", "string");
      }
    }
    const u = new User({ name: "a" });
    u.name = "b";
    u.name = "c";
    u.name = "d";
    expect(u.name).toBe("d");
  });

  it("custom mutator", async () => {
    class User extends Base {
      declare active: boolean;
      declare name: string;
      static {
        this.attribute("name", "string");
      }
    }
    const u = new User();
    u.name = "test";
    expect(u.name).toBe("test");
  });

  it("equality of destroyed records", async () => {
    class User extends Base {
      declare active: boolean;
      declare name: string;
      static {
        this.attribute("name", "string");
      }
    }
    const u = await User.create({ name: "a" });
    const id = u.id;
    await u.destroy();
    expect(u.isDestroyed()).toBe(true);
  });

  it("hashing", () => {
    class User extends Base {
      declare active: boolean;
      declare name: string;
      static {
        this.attribute("name", "string");
      }
    }
    const u1 = new User({ name: "a" });
    const u2 = new User({ name: "a" });
    expect(u1.equals(u2)).toBe(false);
  });

  it("create after initialize with block", async () => {
    class User extends Base {
      declare active: boolean;
      declare name: string;
      static {
        this.attribute("name", "string");
      }
    }
    const u = new User({ name: "test" });
    await u.save();
    expect(u.isPersisted()).toBe(true);
  });

  it("previously changed dup", async () => {
    class User extends Base {
      declare active: boolean;
      declare name: string;
      static {
        this.attribute("name", "string");
      }
    }
    const u = await User.create({ name: "old" });
    u.name = "new";
    await u.save();
    expect(u.savedChanges).toHaveProperty("name");
  });

  it("default values on empty strings", () => {
    class User extends Base {
      declare active: boolean;
      declare name: string;
      static {
        this.attribute("name", "string", { default: "default" });
      }
    }
    const u = new User();
    expect(u.name).toBe("default");
  });

  it("successful comparison of like class records", async () => {
    class User extends Base {
      declare active: boolean;
      declare name: string;
      static {
        this.attribute("name", "string");
      }
    }
    const u1 = await User.create({ name: "a" });
    const u2 = await User.find(u1.id);
    expect(u1.equals(u2)).toBe(true);
  });

  it("failed comparison of unlike class records", () => {
    class User extends Base {
      declare active: boolean;
      declare name: string;
      static {
        this.attribute("name", "string");
      }
    }
    class Post extends Base {
      static {
        this.attribute("title", "string");
      }
    }
    const u = new User({ name: "a" });
    const p = new Post({ title: "a" });
    expect(u.equals(p as any)).toBe(false);
  });

  it("table name guesses with inherited prefixes and suffixes", () => {
    class User extends Base {
      declare active: boolean;
      declare name: string;
      static {
        this.tableNamePrefix = "app_";
      }
    }
    expect(User.tableName).toBe("app_users");
  });

  it("limit without comma", () => {
    class User extends Base {
      declare active: boolean;
      declare name: string;
      static {
        this.attribute("name", "string");
      }
    }
    const sql = User.limit(5).toSql();
    expect(sql).toContain("LIMIT");
    expect(sql).toContain("5");
  });

  it("singular table name guesses for individual table", () => {
    class Person extends Base {}
    expect(Person.tableName).toBe("people");
  });

  it("columns should obey set primary key", () => {
    const pk = Subscriber.columnsHash()[Subscriber.primaryKey as string];
    expect(pk.name, "nick should be primary key").toBe("nick");
  });
  it("comparison with different objects", async () => {
    const topic = await CanonicalTopic.create({});
    const category = await Category.create({ name: "comparison" });
    expect(topic.compare(category)).toBeUndefined();
    expect(topic.equals(category)).toBe(false);
  });

  it("comparison with different objects in array", async () => {
    class Topic extends Base {
      declare title: string;
      static {
        this.attribute("title", "string");
      }
    }
    const p1 = (await Topic.create({ title: "a" })) as any;
    const p2 = (await Topic.create({ title: "b" })) as any;
    expect(p1.id).not.toBe(p2.id);
  });

  it("equality with blank ids", () => {
    class Post extends Base {
      static {
        this.attribute("title", "string");
      }
    }
    const p1 = Post.new({}) as any;
    const p2 = Post.new({}) as any;
    expect(p1).not.toBe(p2);
  });

  it("previously new record on destroyed record", async () => {
    class Topic extends Base {
      declare title: string;
      static {
        this.attribute("title", "string");
      }
    }
    const p = (await Topic.create({ title: "destroy me" })) as any;
    expect(p.isNewRecord()).toBe(false);
    expect(p.isPreviouslyNewRecord()).toBe(true);
    await p.destroy();
    expect(p.isDestroyed()).toBe(true);
    expect(p.isPreviouslyNewRecord()).toBe(false);
  });

  it("create after initialize with array param", async () => {
    class Topic extends Base {
      declare title: string;
      static {
        this.attribute("title", "string");
      }
    }
    const p = (await Topic.create({ title: "from array" })) as any;
    expect(p.id).toBeDefined();
  });

  it("load with condition", async () => {
    class Topic extends Base {
      declare title: string;
      static {
        this.attribute("title", "string");
      }
    }
    await Topic.create({ title: "match" });
    await Topic.create({ title: "no-match" });
    const results = await Topic.where({ title: "match" });
    expect(results.length).toBe(1);
  });

  it("find by slug", async () => {
    class Topic extends Base {
      declare title: string;
      static {
        this.attribute("title", "string");
      }
    }
    const t = await Topic.create({ title: "The First Topic" });
    const bySlug = (await Topic.find(`${t.id}-meowmeow`)) as any;
    const byId = (await Topic.find(t.id)) as any;
    expect(bySlug.id).toBe(byId.id);
  });

  it("group weirds by from", () => {
    class Post extends Base {
      static {
        this.attribute("title", "string");
      }
    }
    const sql = Post.group("title").from('"posts"').toSql();
    expect(sql).toContain("GROUP BY");
  });

  it("preserving date objects", async () => {
    class Topic extends Base {
      declare title: string;
      static {
        this.attribute("title", "string");
      }
    }
    const created = await Topic.create({ title: "date-test", last_read: "2004-06-24" });
    const p = await Topic.find(created.id);
    expect(p.readAttribute("last_read")).toBeInstanceOf(Temporal.PlainDate);
  });

  it("quoted table name after set table name", () => {
    class BlogPost extends Base {
      static tableName = "blog_posts";
      static {
        this.attribute("title", "string");
      }
    }
    expect(BlogPost.tableName).toBe("blog_posts");
    const sql = BlogPost.all().toSql();
    expect(sql).toContain("blog_posts");
  });

  it("create without prepared statement", async () => {
    class Topic extends Base {
      declare title: string;
      static {
        this.attribute("title", "string");
      }
    }
    const p = (await Topic.create({ title: "no-prep" })) as any;
    expect(p.id).toBeDefined();
  });

  it("destroy without prepared statement", async () => {
    class Topic extends Base {
      declare title: string;
      static {
        this.attribute("title", "string");
      }
    }
    const p = (await Topic.create({ title: "destroy-no-prep" })) as any;
    await p.destroy();
    expect(p.isDestroyed()).toBe(true);
  });

  it("arel attribute normalization", () => {
    class Post extends Base {
      static {
        this.attribute("title", "string");
        this.attribute("body", "string");
      }
    }
    const table = Post.arelTable;
    expect(table).toBeTruthy();
  });

  it("equality of relation and array", async () => {
    class Topic extends Base {
      declare title: string;
      static {
        this.attribute("title", "string");
      }
    }
    await Topic.create({ title: "a" });
    const arr = await Topic.all();
    expect(Array.isArray(arr)).toBe(true);
    expect(arr.length).toBe(1);
  });

  it("find reverse ordered last", async () => {
    class Developer extends Base {
      static {
        this.attribute("salary", "integer");
      }
    }
    await Developer.create({ salary: 10 });
    await Developer.create({ salary: 20 });
    const last = await Developer.order("developers.salary DESC").last();
    expect(last).not.toBeNull();
  });

  it("find keeps multiple group values", async () => {
    class Post extends Base {
      static {
        this.attribute("title", "string");
        this.attribute("body", "string");
      }
    }
    const sql = Post.group("title").group("body").toSql();
    expect(sql).toContain("GROUP BY");
  });

  it("find symbol ordered last", async () => {
    class Developer extends Base {
      static {
        this.attribute("salary", "integer");
      }
    }
    await Developer.create({ salary: 5 });
    await Developer.create({ salary: 15 });
    const last = await Developer.order("salary").last();
    expect(last).not.toBeNull();
    expect((last as any).salary).toBe(15);
  });

  it("attribute names on table not exists", () => {
    class Ghost extends Base {
      static {
        this.attribute("name", "string");
      }
    }
    const names = Ghost.attributeNames();
    expect(Array.isArray(names)).toBe(true);
  });

  it("column types typecast", async () => {
    class Topic extends Base {
      declare title: string;
    }
    const seed = await Topic.create({
      title: "The First Topic",
      author_name: "David",
    } as any);
    expect((seed as any).author_name).not.toBe("t.lo");

    const attrs = { ...(seed as any).attributes };
    delete attrs.id;

    class Typecast extends ValueType {
      readonly name = "typecast";
      cast() {
        return "t.lo";
      }
    }

    const topic = Topic.instantiate(attrs, { author_name: new Typecast() }) as any;
    expect(topic.author_name).toBe("t.lo");
  });

  it("dont clear inheritance column when setting explicitly", () => {
    class Animal extends Base {
      static {
        this.attribute("type", "string");
      }
    }
    Animal.tableName = "animals";
    expect(Animal.tableName).toBe("animals");
    expect(Animal.hasAttribute("type")).toBe(true);
  });

  it("resetting column information doesn't remove attribute methods", () => {
    class Post extends Base {
      static {
        this.attribute("title", "string");
      }
    }
    expect(Post.hasAttribute("title")).toBe(true);
  });

  it("ignored columns don't prevent explicit declaration of attribute methods", () => {
    class Post extends Base {
      static {
        this.attribute("title", "string");
        this.attribute("internal_flag", "boolean");
      }
    }
    expect(Post.hasAttribute("title")).toBe(true);
    expect(Post.hasAttribute("internal_flag")).toBe(true);
  });

  it("ignored columns not included in SELECT", async () => {
    class Topic extends Base {
      declare title: string;
      static {
        this.attribute("title", "string");
      }
    }
    await Topic.create({ title: "hello" });
    const results = await Topic.select("title");
    expect(results.length).toBe(1);
  });

  it("column names are escaped", () => {
    class User extends Base {
      declare active: boolean;
      static {
        this.attribute("order", "string");
      }
    }
    const sql = User.where({ order: "test" }).toSql();
    expect(sql).toContain("order");
  });

  it("incomplete schema loading", async () => {
    const Topic = CanonicalTopic;
    const payload = { foo: 42 };
    const topic = await Topic.create({ content: payload as any });
    expect((topic as any).content).toEqual(payload);

    void Topic.resetColumnInformation();

    const adapter = Topic.connection as any;
    vi.spyOn(adapter, "internalSchemaCache", "get").mockImplementation(() => {
      throw new Error("Some Error");
    });
    expect(() => (Topic as any).columnsHash()).toThrow("Some Error");
    vi.restoreAllMocks();

    const reloaded = await Topic.first();
    expect((reloaded as any).content).toEqual(payload);
  });
  it("primary key with no id", () => {
    class Widget extends Base {
      declare name: string;
      static {
        this.primaryKey = "widget_id";
      }
    }
    expect(Widget.primaryKey).toBe("widget_id");
  });
  it("primary key and references columns should be identical type", async () => {
    class Author extends Base {
      static {
        this.attribute("name", "string");
      }
    }
    class Post extends Base {
      static {
        this.attribute("title", "string");
        this.attribute("author_id", "integer");
      }
    }
    await Author.create({ name: "Alice" });
    const pk = Author.columnsHash()["id"];
    const ref = Post.columnsHash()["author_id"];
    expect(ref).toBeDefined();
    expect(ref.type).toBeDefined();
    expect(ref.type).toMatch(/integer|bigint|int/i);
    const pkTypes = pk?.type == null ? [ref.type] : [pk.type];
    expect(pkTypes[0]).toBe(ref.type);
  });
  it("invalid limit", () => {
    class User extends Base {
      declare active: boolean;
      declare name: string;
      static {
        this.attribute("name", "string");
      }
    }
    expect(() => User.limit("asdfadf").toSql()).toThrow(/invalid value for Integer/i);
  });
  it("limit should sanitize sql injection for limit without commas", () => {
    class User extends Base {
      declare active: boolean;
      declare name: string;
      static {
        this.attribute("name", "string");
      }
    }
    expect(() => User.limit("1 select * from schema").toSql()).toThrow(
      /invalid value for Integer/i,
    );
  });
  it("limit should sanitize sql injection for limit with commas", () => {
    class User extends Base {
      declare active: boolean;
      declare name: string;
      static {
        this.attribute("name", "string");
      }
    }
    expect(() => User.limit("1, 7 procedure help()").toSql()).toThrow(/invalid value for Integer/i);
  });
  it("preserving time objects", async () => {
    class Topic extends Base {
      declare title: string;
      static {
        this.attribute("written_on", "datetime");
        this.attribute("bonus_time", "time");
      }
    }
    const inst1 = RubyTime.utc(2003, 7, 16, 14, 28, 11, 223300);
    const inst2 = RubyTime.utc(2003, 7, 16, 14, 28, 11, 9900);
    const inst3 = RubyTime.utc(2003, 7, 16, 14, 28, 11, 129346);
    const bonusTime = RubyTime.utc(2000, 1, 1, 11, 30, 45);
    const t1 = await Topic.create({ written_on: inst1, bonus_time: bonusTime });
    const t2 = await Topic.create({ written_on: inst2 });
    const t3 = await Topic.create({ written_on: inst3 });
    const topic1 = await Topic.find(t1.id);
    const reloadedBonusTime = topic1.readAttribute("bonus_time") as RubyTime;
    expect(reloadedBonusTime).toBeInstanceOf(RubyTime);
    expect(reloadedBonusTime).toEqual(bonusTime);
    const wo1 = topic1.readAttribute("written_on") as RubyTime;
    expect(wo1).toBeInstanceOf(RubyTime);
    expect(wo1).toEqual(inst1);
    expect(wo1.sec).toBe(11);
    expect(wo1.usec).toBe(223300);
    const wo2 = (await Topic.find(t2.id)).readAttribute("written_on") as RubyTime;
    expect(wo2).toEqual(inst2);
    expect(wo2.usec).toBe(9900);
    const wo3 = (await Topic.find(t3.id)).readAttribute("written_on") as RubyTime;
    expect(wo3).toEqual(inst3);
    expect(wo3.usec).toBe(129346);
  });
  it("preserving time objects with local time conversion to default timezone utc", async () => {
    await withTimezoneConfig({ default: "utc" }, async () => {
      class Topic extends Base {
        declare title: string;
        static {
          this.attribute("written_on", "datetime");
        }
      }
      const expectedUtc = RubyTime.utc(2000, 1, 1, 5, 0, 0);
      const topic = await Topic.create({ written_on: "2000-01-01 00:00:00-05:00" });
      const saved = await Topic.find(topic.id);
      const savedTime = saved.readAttribute("written_on") as RubyTime;
      expect(savedTime).toEqual(expectedUtc);
      expect(savedTime.getutc().hour).toBe(5);
    });
  });
  it("preserving time objects with time with zone conversion to default timezone utc", async () => {
    await withTimezoneConfig({ default: "utc" }, async () => {
      class Topic extends Base {
        declare title: string;
        static {
          this.attribute("written_on", "datetime");
        }
      }
      const expectedUtc = RubyTime.utc(2000, 1, 1, 6, 0, 0);
      const topic = await Topic.create({ written_on: "2000-01-01 00:00:00-06:00" });
      const saved = await Topic.find(topic.id);
      const savedTime = saved.readAttribute("written_on") as RubyTime;
      expect(savedTime).toEqual(expectedUtc);
      expect(savedTime.getutc().hour).toBe(6);
    });
  });
  it("preserving time objects with utc time conversion to default timezone local", async () => {
    await withTimezoneConfig({ awareAttributes: true, zone: "America/New_York" }, async () => {
      class Topic extends Base {
        declare title: string;
        static {
          this.attribute("written_on", "datetime");
        }
      }
      const utcMidnight = Temporal.Instant.from("2000-01-01T00:00:00Z");
      const topic = await Topic.create({ written_on: utcMidnight });
      const saved = await Topic.find(topic.id);
      const savedTime = saved.readAttribute("written_on") as TimeWithZone;
      expect(savedTime.utc().toTime().epochNanoseconds).toBe(utcMidnight.epochNanoseconds);
      const local1 = savedTime.utc().toTime().withTimeZone("America/New_York");
      expect(local1.year).toBe(1999);
      expect(local1.month).toBe(12);
      expect(local1.day).toBe(31);
      expect(local1.hour).toBe(19);
    });
  });
  it("preserving time objects with time with zone conversion to default timezone local", async () => {
    await withTimezoneConfig({ awareAttributes: true, zone: "America/New_York" }, async () => {
      class Topic extends Base {
        declare title: string;
        static {
          this.attribute("written_on", "datetime");
        }
      }
      const cstMidnight = Temporal.Instant.from("2000-01-01T06:00:00Z");
      const topic = await Topic.create({ written_on: cstMidnight });
      const saved = await Topic.find(topic.id);
      const savedTime = saved.readAttribute("written_on") as TimeWithZone;
      expect(savedTime.utc().toTime().epochNanoseconds).toBe(cstMidnight.epochNanoseconds);
      const local2 = savedTime.utc().toTime().withTimeZone("America/New_York");
      expect(local2.year).toBe(2000);
      expect(local2.month).toBe(1);
      expect(local2.day).toBe(1);
      expect(local2.hour).toBe(1);
    });
  });
  it("time zone aware attribute with default timezone utc on utc can be created", async () => {
    await withTimezoneConfig({ awareAttributes: true, default: "utc", zone: "UTC" }, async () => {
      class Pet extends Base {
        static {
          this.tableName = "pets";
          this.primaryKey = "pet_id";
          this.attribute("name", "string");
          this.attribute("created_at", "datetime");
          this.attribute("updated_at", "datetime");
        }
      }
      const pet = await Pet.create({ name: "Bidu" });
      expect(pet.isPersisted()).toBe(true);
      const savedPet = await Pet.find(pet.id);
      expect(savedPet.readAttribute("created_at")).toBeInstanceOf(TimeWithZone);
      expect(savedPet.readAttribute("updated_at")).toBeInstanceOf(TimeWithZone);
    });
  });
  it("singular table name guesses with prefixes and suffixes", () => {
    class PrefixedModel extends Base {
      static {
        this.tableNamePrefix = "pre_";
        this.tableNameSuffix = "_suf";
      }
    }
    expect(PrefixedModel.tableName).toBe("pre_prefixed_models_suf");
  });
  it("table name for base class", () => {
    class Account extends Base {}
    expect(Account.tableName).toBe("accounts");
  });
  it("utc as time zone", async () => {
    await withTimezoneConfig({ default: "utc" }, async () => {
      class Topic extends Base {
        declare title: string;
        static {
          this.attribute("bonus_time", "time");
        }
      }
      const created = await Topic.create({});
      const topic = await Topic.find(created.id);
      await topic.assignAttributes({ bonus_time: "5:42:00AM" });
      expect(topic.readAttribute("bonus_time")).toEqual(RubyTime.utc(2000, 1, 1, 5, 42, 0));
    });
  });
  it("utc as time zone and new", async () => {
    await withTimezoneConfig({ default: "utc" }, () => {
      class Topic extends Base {
        declare title: string;
        static {
          this.attribute("bonus_time", "time");
        }
      }
      const attributes = {
        "bonus_time(1i)": "2000",
        "bonus_time(2i)": "1",
        "bonus_time(3i)": "1",
        "bonus_time(4i)": "10",
        "bonus_time(5i)": "35",
        "bonus_time(6i)": "50",
      };
      const topic = new Topic(attributes);
      expect(topic.readAttribute("bonus_time")).toEqual(RubyTime.utc(2000, 1, 1, 10, 35, 50));
    });
  });
  it("out of range slugs", async () => {
    class Topic extends Base {
      declare title: string;
      static {
        this.attribute("title", "string");
      }
    }
    const t1 = await Topic.create({ title: "first" });
    const results = await Topic.where({
      id: [`${t1.id}-meowmeow`, "9223372036854775808-hello"],
    });
    expect(results).toHaveLength(1);
    expect(results[0].title).toBe("first");
  });
  it("find by slug with array", async () => {
    class Topic extends Base {
      declare title: string;
      static {
        this.attribute("title", "string");
      }
    }
    const t1 = await Topic.create({ title: "first" });
    const t2 = await Topic.create({ title: "second" });
    const results = (await Topic.find([`${t1.id}-meowmeow`, `${t2.id}-hello`])) as Topic[];
    expect(results).toHaveLength(2);
    expect(results[0].title).toBe("first");
    expect(results[1].title).toBe("second");
    const reversed = (await Topic.find([`${t2.id}-hello`, `${t1.id}-meowmeow`])) as Topic[];
    expect(reversed[0].title).toBe("second");
  });
  it("find by slug with range", async () => {
    class Topic extends Base {
      declare title: string;
      static {
        this.attribute("title", "string");
      }
    }
    const t1 = await Topic.create({ title: "first" });
    const t2 = await Topic.create({ title: "second" });
    const slugRange = new ArRange(`${t1.id}-meowmeow`, `${t2.id}-hello`);
    const intRange = new ArRange(t1.id, t2.id);
    const bySlug = await Topic.where({ id: slugRange });
    const byInt = await Topic.where({ id: intRange });
    expect(byInt).toHaveLength(2);
    expect(bySlug).toHaveLength(2);
    expect(bySlug.map((r: any) => r.id).sort()).toEqual(byInt.map((r: any) => r.id).sort());
  });

  it("equality of relation and collection proxy", async () => {
    const car = await Car.create({});
    association(car, "bulbs").build({});
    await car.save();

    const bulbsOfCar = Bulb.where({ car_id: car.id });
    const proxyResults = await association(car, "bulbs");
    const relationResults = await bulbsOfCar;
    expect(proxyResults).toHaveLength(1);
    expect(proxyResults.map((r: any) => r.id).sort()).toEqual(
      relationResults.map((r: any) => r.id).sort(),
    );
  });

  it("equality of relation and association relation", async () => {
    const car = await Car.create({});
    association(car, "bulbs").build({});
    await car.save();

    const bulbsOfCar = Bulb.where({ car_id: car.id });
    const assocRelation = association(car, "bulbs").includes(":car");
    const relationResults = await bulbsOfCar;
    const assocResults = await assocRelation;
    expect(relationResults).toHaveLength(1);
    expect(assocResults.map((r: any) => r.id).sort()).toEqual(
      relationResults.map((r: any) => r.id).sort(),
    );
  });

  it("equality of collection proxy and association relation", async () => {
    const car = await Car.create({});
    association(car, "bulbs").build({});
    await car.save();

    const proxyResults = await association(car, "bulbs");
    const assocRelResults = await association(car, "bulbs").includes(":car");
    expect(proxyResults).toHaveLength(1);
    expect(proxyResults.map((r: any) => r.id).sort()).toEqual(
      assocRelResults.map((r: any) => r.id).sort(),
    );
  });
  it("readonly attributes on a new record", () => {
    class User extends Base {
      declare active: boolean;
      declare name: string;
      static {
        this.attribute("name", "string");
        this.attrReadonly("name");
      }
    }
    expect(User.readonlyAttributes).toContain("name");
    const u = new User({ name: "a" });
    expect(u.name).toBe("a");
  });
  it("readonly attributes in abstract class descendant", () => {
    class AbstractModel extends Base {
      static {
        this.abstractClass = true;
        this.attribute("code", "string");
        this.attrReadonly("code");
      }
    }
    class ConcreteModel extends AbstractModel {
      static {
        this.attribute("name", "string");
      }
    }
    expect(ConcreteModel.readonlyAttributes).toContain("code");
  });
  it("readonly attributes when configured to not raise", async () => {
    const prev = ActiveRecord.raiseOnAssignToAttrReadonly;
    ActiveRecord.raiseOnAssignToAttrReadonly = false;
    try {
      class NonRaisingPost extends Base {
        static {
          this.tableName = "posts";
          this.attribute("title", "string");
          this.attribute("body", "string");
          this.attrReadonly("title");
        }
      }
      expect(NonRaisingPost.readonlyAttributes).toEqual(["title"]);

      const post = await NonRaisingPost.create({ title: "cannot change this", body: "changeable" });
      expect(post.readAttribute("title")).toBe("cannot change this");
      expect(post.readAttribute("body")).toBe("changeable");

      post.writeAttribute("title", "changed via write_attribute");
      post.writeAttribute("body", "changed via write_attribute");
      expect(post.readAttribute("title")).toBe("changed via write_attribute");
      await post.saveBang();
      await post.reload();
      expect(post.readAttribute("title")).toBe("cannot change this");
      expect(post.readAttribute("body")).toBe("changed via write_attribute");

      await post.assignAttributes({
        title: "changed via assign_attributes",
        body: "changed via assign_attributes",
      });
      await post.saveBang();
      await post.reload();
      expect(post.readAttribute("title")).toBe("cannot change this");
      expect(post.readAttribute("body")).toBe("changed via assign_attributes");

      await post.update({ title: "changed via update", body: "changed via update" });
      await post.reload();
      expect(post.readAttribute("title")).toBe("cannot change this");
      expect(post.readAttribute("body")).toBe("changed via update");
    } finally {
      ActiveRecord.raiseOnAssignToAttrReadonly = prev;
    }
  });
  it("readonly attributes on belongs to association", async () => {
    class Author extends Base {
      static {
        this.attribute("name", "string");
      }
    }
    class ReadonlyAuthorPost extends Base {
      static {
        this.tableName = "posts";
        this.attribute("title", "string");
        this.attribute("body", "string");
        this.attribute("author_id", "integer");
        this.attrReadonly("author_id");
      }
    }
    expect(ReadonlyAuthorPost.readonlyAttributes).toEqual(["author_id"]);

    const author1 = await Author.create({ name: "Alex" });
    const author2 = await Author.create({ name: "Not Alex" });

    const post = await ReadonlyAuthorPost.create({ title: "Hi", body: "b", author_id: author1.id });
    await post.update({ title: "Hello" });
    const reloaded = await ReadonlyAuthorPost.find(post.id);
    expect(Number(reloaded.readAttribute("author_id"))).toBe(Number(author1.id));

    const post2 = await ReadonlyAuthorPost.create({
      title: "Hi",
      body: "b",
      author_id: author1.id,
    });
    await expect(post2.update({ author_id: author2.id })).rejects.toThrow(ReadonlyAttributeError);
  });
  it("non valid identifier column name", async () => {
    class Weird extends Base {
      static {
        this.attribute("a$b", "string");
      }
    }
    const w = await Weird.create({ a$b: "value" });
    const reloaded = await Weird.find(w.id);
    expect(reloaded.readAttribute("a$b")).toBe("value");
  });
  it("attributes on dummy time", async () => {
    await withTimezoneConfig({ default: "local" }, async () => {
      class Topic extends Base {
        declare title: string;
        static {
          this.attribute("bonus_time", "time");
        }
      }
      const created = await Topic.create({});
      const topic = await Topic.find(created.id);
      await topic.assignAttributes({ bonus_time: "5:42:00AM" });
      expect(topic.readAttribute("bonus_time")).toEqual(RubyTime.local(2000, 1, 1, 5, 42, 0));

      await topic.saveBang();
      const found = await Topic.findBy({ bonus_time: "5:42:00AM" });
      expect(found?.id).toBe(topic.id);
    });
  });
  it("attributes on dummy time with invalid time", async () => {
    class DummyTopic extends Base {
      declare bonus_time: RubyTime | TimeWithZone | null;
      static tableName = "topics";
      static {
        this.attribute("bonus_time", "time");
      }
    }
    const t = await DummyTopic.create({});
    const found = await DummyTopic.find(t.id);
    await found.assignAttributes({ bonus_time: "not a time" });
    expect(found.bonus_time).toBeNull();
  });
  it("previously persisted returns boolean", async () => {
    class User extends Base {
      declare active: boolean;
      declare name: string;
      static {
        this.attribute("name", "string");
      }
    }
    const u = await User.create({ name: "a" });
    expect(u.isPersisted()).toBe(true);
    await u.destroy();
    expect(u.isPersisted()).toBe(false);
    expect(u.isDestroyed()).toBe(true);
  });
  it("dup for a composite primary key model", async () => {
    const book = await CpkBook.createBang({ id: [1, 2], title: "The first book" });
    const newBook = book.dup();
    expect((newBook as { title: string }).title).toBe("The first book");
    expect((newBook as { id: unknown }).id).toEqual([null, null]);
  });
  it("dup does not copy associations", async () => {
    class User extends Base {
      declare active: boolean;
      declare name: string;
      static {
        this.attribute("name", "string");
      }
    }
    const u = await User.create({ name: "a" });
    const d = u.dup();
    expect(d.isNewRecord()).toBe(true);
    expect(d.id).toBeNull();
  });
  it("clone preserves subtype", async () => {
    class User extends Base {
      declare active: boolean;
      declare name: string;
      static {
        this.attribute("name", "string");
      }
    }
    const u = await User.create({ name: "a" });
    const d = u.dup();
    expect(d).toBeInstanceOf(User);
  });
  it("bignum pk", async () => {
    class User extends Base {
      declare active: boolean;
      declare name: string;
      static {
        this.attribute("name", "string");
      }
    }
    const u = await User.create({ name: "big" });
    expect(u.id).toBeDefined();
  });
  it("default char types", () => {
    class User extends Base {
      declare active: boolean;
      declare name: string;
      static {
        this.attribute("name", "string", { default: "" });
      }
    }
    const u = new User();
    expect(u.name).toBe("");
  });
  it("default in utc", async () => {
    await withTimezoneConfig({ default: "utc" }, () => {
      class Default extends Base {
        static {
          this.tableName = "defaults";
          this.attribute("fixed_date", "date", { default: "2004-01-01" });
          this.attribute("fixed_time", "datetime", { default: "2004-01-01 00:00:00" });
        }
      }
      const d = new Default();
      const fd = d.readAttribute("fixed_date") as Temporal.PlainDate;
      expect(fd.year).toBe(2004);
      expect(fd.month).toBe(1);
      expect(fd.day).toBe(1);
      const ft = d.readAttribute("fixed_time") as RubyTime;
      expect(ft).toEqual(RubyTime.utc(2004, 1, 1, 0, 0, 0));
    });
  });
  it("default in utc with time zone", async () => {
    await withTimezoneConfig({ default: "utc", zone: "America/Chicago" }, () => {
      class Default extends Base {
        static {
          this.tableName = "defaults";
          this.attribute("fixed_date", "date", { default: "2004-01-01" });
          this.attribute("fixed_time", "datetime", { default: "2004-01-01 00:00:00" });
        }
      }
      const d = new Default();
      const fd = d.readAttribute("fixed_date") as Temporal.PlainDate;
      expect(fd.year).toBe(2004);
      expect(fd.month).toBe(1);
      expect(fd.day).toBe(1);
      const ft = d.readAttribute("fixed_time") as RubyTime;
      expect(ft).toEqual(RubyTime.utc(2004, 1, 1, 0, 0, 0));
    });
  });
  it("connection in local time", async () => {
    await withTimezoneConfig({ default: "utc" }, async () => {
      class Default extends Base {
        static {
          this.tableName = "defaults";
          this.attribute("fixed_date", "date", { default: "2004-01-01" });
          this.attribute("fixed_time", "datetime", { default: "2004-01-01 00:00:00" });
        }
      }
      const newConfig = {
        ...Base.connectionDbConfig().configurationHash,
        default_timezone: "local",
      };
      await Default.establishConnection(
        newConfig as Parameters<typeof Default.establishConnection>[0],
      );
      cleanupConnections.push(() => Default.removeConnection());

      const d = new Default();
      const fd = d.readAttribute("fixed_date") as Temporal.PlainDate;
      expect(fd.year).toBe(2004);
      expect(fd.month).toBe(1);
      expect(fd.day).toBe(1);
      const ft = d.readAttribute("fixed_time") as RubyTime;
      expect(ft).toEqual(RubyTime.local(2004, 1, 1, 0, 0, 0));
    });
  });
  it("connection in utc time", async () => {
    await withTimezoneConfig({ default: "local" }, async () => {
      class Default extends Base {
        static {
          this.tableName = "defaults";
          this.attribute("fixed_date", "date", { default: "2004-01-01" });
          this.attribute("fixed_time", "datetime", { default: "2004-01-01 00:00:00" });
        }
      }
      const newConfig = {
        ...Base.connectionDbConfig().configurationHash,
        default_timezone: "utc",
      };
      await Default.establishConnection(
        newConfig as Parameters<typeof Default.establishConnection>[0],
      );
      cleanupConnections.push(() => Default.removeConnection());

      const d = new Default();
      const fd = d.readAttribute("fixed_date") as Temporal.PlainDate;
      expect(fd.year).toBe(2004);
      expect(fd.month).toBe(1);
      expect(fd.day).toBe(1);
      const ft = d.readAttribute("fixed_time") as RubyTime;
      expect(ft).toEqual(RubyTime.utc(2004, 1, 1, 0, 0, 0));
    });
  });
  it("column name properly quoted", () => {
    class User extends Base {
      declare active: boolean;
      declare name: string;
      static {
        this.attribute("name", "string");
      }
    }
    const sql = User.where({ name: "test" }).toSql();
    expect(sql).toContain(quoteColumnName("name"));
  });
  it("quoting arrays", async () => {
    class Topic extends Base {
      declare title: string;
      static {
        this.attribute("title", "string");
      }
    }
    const r1 = await Topic.create({ title: "first" });
    const r2 = await Topic.create({ title: "second" });
    await Topic.create({ title: "third" });
    const results = await Topic.where({ id: [r1.id, r2.id] });
    expect(results).toHaveLength(2);
    const emptyResults = await Topic.where({ id: [] });
    expect(emptyResults).toHaveLength(0);
  });
  it("dont clear sequence name when setting explicitly", () => {
    class User extends Base {
      declare active: boolean;
      declare name: string;
      static {
        this.sequenceName = "my_seq";
      }
    }
    expect(User.sequenceName).toBe("my_seq");
    User.tableName = "people";
    expect(User.sequenceName).toBe("my_seq");
  });
  it("set table name symbol converted to string", () => {
    class User extends Base {
      declare active: boolean;
      declare name: string;
      static {
        this.tableName = "custom_table";
      }
    }
    expect(typeof User.tableName).toBe("string");
    expect(User.tableName).toBe("custom_table");
  });
  it("set table name with inheritance", () => {
    class k extends Base {
      static get tableName(): string {
        return super.tableName + "ks";
      }
    }
    Object.defineProperty(k, "name", { value: "Foo" });
    expect(k.tableName).toBe("foosks");
  });
  it("sequence name with abstract class", () => {
    class AbstractModel extends Base {
      static {
        this.abstractClass = true;
      }
    }
    class ConcreteModel extends AbstractModel {}
    expect(ConcreteModel.sequenceName).toBe("concrete_models_id_seq");
  });
  it("sequence name for cpk model", () => {
    class CpkModel extends Base {
      static {
        this.primaryKey = ["store_id", "department_id"] as any;
      }
    }
    expect(CpkModel.sequenceName).toBeNull();
  });
  it("find multiple ordered last", async () => {
    class User extends Base {
      declare active: boolean;
      declare name: string;
      static {
        this.attribute("name", "string");
      }
    }
    await User.create({ name: "a" });
    await User.create({ name: "b" });
    await User.create({ name: "c" });
    const lastTwo = await User.last(2);
    expect(Array.isArray(lastTwo)).toBe(true);
    expect((lastTwo as any[]).length).toBe(2);
  });
  it("find on abstract base class doesnt use type condition", () => {
    class ApplicationRecord extends Base {
      static {
        this.abstractClass = true;
      }
    }
    class Post extends ApplicationRecord {
      static {
        this.attribute("title", "string");
      }
    }
    const sql = Post.all().toSql();
    expect(sql).not.toContain("type");
  });
  it("assert queries count", async () => {
    class Topic extends Base {
      declare title: string;
      static {
        this.attribute("title", "string");
      }
    }
    let count = 0;
    const sub = Notifications.subscribe("sql.active_record", () => {
      count++;
    });
    try {
      await Topic.count();
      await Topic.count();
    } finally {
      Notifications.unsubscribe(sub);
    }
    expect(count).toBe(2);
  });

  it("benchmark with use silence", async () => {
    const log: string[] = [];
    const savedLogger = Base.logger;
    const logger = new Logger({ write: (s: string) => log.push(s) });
    logger.level = Logger.DEBUG;
    Base.logger = logger as any;
    try {
      await Base.benchmark("Logging", { level: "debug", silence: false }, () => {
        Base.logger?.debug?.("Quiet");
      });
      expect(log.some((m) => m.includes("Quiet"))).toBe(true);
      log.length = 0;
      await Base.benchmark("Logging2", { level: "debug", silence: true }, () => {
        Base.logger?.debug?.("Suppressed");
      });
      expect(log.some((m) => m.includes("Suppressed"))).toBe(false);
    } finally {
      Base.logger = savedLogger;
    }
  });

  it("clear cache!", async () => {
    const conn = Base.connection;
    const cache = conn.internalSchemaCache;
    const c1 = await cache.columns(conn.pool, "posts");
    expect(cache.size).not.toBe(0);

    cache.clear();
    expect(cache.size).toBe(0);

    const c2 = await cache.columns(conn.pool, "posts");
    expect(cache.size).not.toBe(0);
    expect(c2!.map((column, i) => column.equals(c1![i]))).toEqual(new Array(c1!.length).fill(true));

    await cache.addAll(conn.pool);
  });
  it("attribute names on abstract class", () => {
    class AbstractModel extends Base {
      static {
        this.abstractClass = true;
        this.attribute("name", "string");
      }
    }
    expect(AbstractModel.attributeNames()).toEqual([]);
  });
  it("attribute names on table not exists", () => {
    class NonExistentTable extends Base {}
    expect(NonExistentTable.attributeNames()).toEqual([]);
  });
  it("table name with 2 abstract subclasses", () => {
    class FirstAbstractClass extends Base {
      static {
        this.abstractClass = true;
      }
    }
    class SecondAbstractClass extends FirstAbstractClass {
      static {
        this.abstractClass = true;
      }
    }
    class Photo extends SecondAbstractClass {}
    expect(Photo.tableName).toBe("photos");
  });
  it.skipIf(adapterType !== "postgres")("column types on queries on postgresql", async () => {
    const pgAdapter = Base.connection;
    const result = await pgAdapter.execQuery("SELECT 1 AS test");
    expect(result.columnTypes["test"]).toBeInstanceOf(IntegerType);
  });
  it("ignored columns are not present in columns_hash", async () => {
    const conn = Base.connection;
    const cacheColumns = await conn.internalSchemaCache.columnsHash(
      conn.pool,
      CanonicalDeveloper.tableName,
    );
    expect(Object.keys(cacheColumns ?? {})).toContain("first_name");
    expect(Object.keys(CanonicalDeveloper.columnsHash())).not.toContain("first_name");
    expect(Object.keys(SubDeveloper.columnsHash())).not.toContain("first_name");
    expect(Object.keys(SymbolIgnoredDeveloper.columnsHash())).not.toContain("first_name");
  });
  it(".columns_hash raises an error if the record has an empty table name", () => {
    class FirstAbstractClass extends Base {
      static {
        this.abstractClass = true;
      }
    }
    const expectedMessage =
      "FirstAbstractClass has no table configured. Set one with FirstAbstractClass.table_name=";
    expect(() => FirstAbstractClass.columnsHash()).toThrow(TableNotSpecified);
    expect(() => FirstAbstractClass.columnsHash()).toThrow(expectedMessage);
  });
  it("ignored columns have no attribute methods", () => {
    class Developer extends Base {
      static {
        this.ignoredColumns = ["first_name"];
      }
    }
    expect(Developer.columnNames()).not.toContain("first_name");
    expect(Developer.columnNames()).toContain("salary");
    const u = new Developer();
    expect("salary" in u).toBe(true);
    expect("first_name" in u).toBe(false);
  });
  it("ignored columns are stored as an array of string", () => {
    class User extends Base {
      declare active: boolean;
      declare name: string;
      static {
        this.ignoredColumns = ["col1", "col2"];
      }
    }
    expect(Array.isArray(User.ignoredColumns)).toBe(true);
    expect(User.ignoredColumns).toEqual(["col1", "col2"]);
  });
  it("when #reload called, ignored columns' attribute methods are not defined", async () => {
    const developer = await CanonicalDeveloper.create({ name: "Developer" });
    expect("first_name" in developer).toBe(false);

    await developer.reload();

    expect("first_name" in developer).toBe(false);
  });
  it("when ignored attribute is loaded, cast type should be preferred over DB type", async () => {
    const developer = await AttributedDeveloper.create();
    await developer.updateColumn("name", "name");

    const loadedDeveloper = await AttributedDeveloper.where({ id: developer.id })
      .select("*")
      .first();
    expect(loadedDeveloper!.name).toBe("Developer: name");
  });
  it("when assigning new ignored columns it invalidates cache for column names", () => {
    class Developer extends Base {
      static {
        this._tableName = "developers";
      }
    }
    expect(Developer.columnNames()).toContain("first_name");
    Developer.ignoredColumns = ["first_name"];
    expect(Developer.columnNames()).not.toContain("first_name");
    Developer.ignoredColumns = ["first_name", "salary"];
    expect(Developer.columnNames()).not.toContain("salary");
  });
  it("column names are quoted when using #from clause and model has ignored columns", () => {
    class User extends Base {
      declare active: boolean;
      declare name: string;
      static {
        this.attribute("name", "string");
        this.attribute("secret", "string");
        this.ignoredColumns = ["secret"];
      }
    }
    const sql = User.from("users").toSql();
    expect(sql).not.toContain("secret");
  });
  it("using table name qualified column names unless having SELECT list explicitly", () => {
    class Developer extends Base {
      static {
        this.ignoredColumns = ["first_name"];
      }
    }
    const sql = Developer.all().toSql();
    expect(sql).not.toContain("first_name");
    expect(sql).toContain("salary");
  });
  it("protected environments by default is an array with production", () => {
    expect(Base.protectedEnvironments).toEqual(["production"]);
  });
  it("protected environments are stored as an array of string", () => {
    const original = Base.protectedEnvironments;
    try {
      Base.protectedEnvironments = ["production", "staging"];
      expect(Base.protectedEnvironments).toEqual(["production", "staging"]);
    } finally {
      Base.protectedEnvironments = original;
    }
  });
  it("cannot call connects_to on non-abstract or non-ActiveRecord::Base classes", () => {
    class Bird extends Base {}
    expect(() => Bird.connectsTo({ database: { writing: "arunit" } })).toThrow(NotImplementedError);
    expect(() => Bird.connectsTo({ database: { writing: "arunit" } })).toThrow(
      "`connects_to` can only be called on ActiveRecord::Base or abstract classes",
    );
  });
  it("cannot call connected_to with role and shard on non-abstract classes", () => {
    class Bird extends Base {}
    expect(() => Bird.connectedTo({ role: "reading", shard: "default" }, () => {})).toThrow(
      NotImplementedError,
    );
    expect(() => Bird.connectedTo({ role: "reading", shard: "default" }, () => {})).toThrow(
      "calling `connected_to` is only allowed on ActiveRecord::Base or abstract classes.",
    );
  });
  it("can call connected_to with role and shard on abstract classes", () => {
    class SecondAbstractClass extends Base {
      static {
        this.abstractClass = true;
        this.connectionClass = true;
      }
    }
    SecondAbstractClass.connectedTo({ role: "reading", shard: "default" }, () => {
      expect(SecondAbstractClass.connectedToQ({ role: "reading", shard: "default" })).toBe(true);
    });
  });
  it("cannot call connected_to on the abstract class that did not establish the connection", () => {
    class ThirdAbstractClass extends Base {
      static {
        this.abstractClass = true;
      }
    }
    expect(() => ThirdAbstractClass.connectedTo({ role: "reading" }, () => {})).toThrow(
      NotImplementedError,
    );
    expect(() => ThirdAbstractClass.connectedTo({ role: "reading" }, () => {})).toThrow(
      "calling `connected_to` is only allowed on the abstract class that established the connection.",
    );
  });
  it("#connecting_to with role", () => {
    class SecondAbstractClass extends Base {
      static {
        this.abstractClass = true;
        this.connectionClass = true;
      }
    }
    SecondAbstractClass.connectingTo({ role: "reading" });
    try {
      expect(SecondAbstractClass.connectedToQ({ role: "reading" })).toBe(true);
      expect(SecondAbstractClass.currentPreventingWrites()).toBe(true);
    } finally {
      connectedToStack().pop();
    }
  });
  it("#connecting_to with role and shard", () => {
    class SecondAbstractClass extends Base {
      static {
        this.abstractClass = true;
        this.connectionClass = true;
      }
    }
    SecondAbstractClass.connectingTo({ role: "reading", shard: "default" });
    try {
      expect(SecondAbstractClass.connectedToQ({ role: "reading", shard: "default" })).toBe(true);
    } finally {
      connectedToStack().pop();
    }
  });
  it("#connecting_to with prevent_writes", () => {
    class SecondAbstractClass extends Base {
      static {
        this.abstractClass = true;
        this.connectionClass = true;
      }
    }
    SecondAbstractClass.connectingTo({ role: "writing", preventWrites: true });
    try {
      expect(SecondAbstractClass.connectedToQ({ role: "writing" })).toBe(true);
      expect(SecondAbstractClass.currentPreventingWrites()).toBe(true);
    } finally {
      connectedToStack().pop();
    }
  });
  it("#connected_to_many cannot be called on anything but ActiveRecord::Base", () => {
    class SecondAbstractClass extends Base {
      static {
        this.abstractClass = true;
        this.connectionClass = true;
      }
    }
    expect(() =>
      SecondAbstractClass.connectedToMany([SecondAbstractClass], { role: "writing" }, () => {}),
    ).toThrow(NotImplementedError);
  });
  it("#connected_to_many cannot be called with classes that include ActiveRecord::Base", () => {
    class SecondAbstractClass extends Base {
      static {
        this.abstractClass = true;
        this.connectionClass = true;
      }
    }
    expect(() => Base.connectedToMany([Base], { role: "writing" }, () => {})).toThrow(
      NotImplementedError,
    );
  });
  it("#connected_to_many sets prevent_writes if role is reading", () => {
    class SecondAbstractClass extends Base {
      static {
        this.abstractClass = true;
        this.connectionClass = true;
      }
    }
    Base.connectedToMany([SecondAbstractClass], { role: "reading" }, () => {
      expect(SecondAbstractClass.currentPreventingWrites()).toBe(true);
      expect(Base.currentPreventingWrites()).toBe(false);
    });
  });
  it("#connected_to_many with a single argument for classes", () => {
    class SecondAbstractClass extends Base {
      static {
        this.abstractClass = true;
        this.connectionClass = true;
      }
    }
    Base.connectedToMany(SecondAbstractClass, { role: "reading" }, () => {
      expect(SecondAbstractClass.currentPreventingWrites()).toBe(true);
      expect(Base.currentPreventingWrites()).toBe(false);
    });
  });
  it("#connected_to_many with a multiple classes without brackets works", () => {
    class FirstAbstractClass extends Base {
      static {
        this.abstractClass = true;
        this.connectionClass = true;
      }
    }
    class SecondAbstractClass extends Base {
      static {
        this.abstractClass = true;
        this.connectionClass = true;
      }
    }
    Base.connectedToMany(FirstAbstractClass, SecondAbstractClass, { role: "reading" }, () => {
      expect(FirstAbstractClass.currentPreventingWrites()).toBe(true);
      expect(SecondAbstractClass.currentPreventingWrites()).toBe(true);
      expect(Base.currentPreventingWrites()).toBe(false);
    });
  });
  it("singular table name guesses", () => {
    class Mouse extends Base {}
    expect(Mouse.tableName).toBe("mice");
  });
  it("default values", () => {
    class Widget extends Base {
      declare name: string;
      static {
        this.attribute("name", "string", { default: "unnamed" });
      }
    }
    const w = new Widget();
    expect(w.name).toBe("unnamed");
  });
  it("quote", () => {
    class User extends Base {
      declare active: boolean;
      declare name: string;
      static {
        this.attribute("name", "string");
      }
    }
    const sql = User.where({ name: "test" }).toSql();
    expect(sql).toContain("name");
    expect(sql).toContain("test");
  });

  it("toggle attribute", async () => {
    class User extends Base {
      declare active: boolean;
      declare name: string;
      static {
        this.attribute("active", "boolean", { default: false });
      }
    }
    const u = await User.create({ active: false });
    u.toggle("active");
    expect(u.active).toBe(true);
  });

  it("has attribute with symbol", () => {
    class User extends Base {
      declare active: boolean;
      declare name: string;
      static {
        this.attribute("name", "string");
      }
    }
    expect(User.hasAttribute("name")).toBe(true);
    expect(User.hasAttribute("nonexistent")).toBe(false);
  });

  it("no limit offset", () => {
    class User extends Base {
      declare active: boolean;
      declare name: string;
      static {
        this.attribute("name", "string");
      }
    }
    const sql = User.all().toSql();
    expect(sql).not.toContain("LIMIT");
    expect(sql).not.toContain("OFFSET");
  });

  function makeTopic() {
    class Topic extends Base {
      declare title: string;
      static {
        this.attribute("title", "string");
        this.attribute("author_name", "string");
        this.attribute("approved", "boolean");
        this.attribute("written_on", "date");
      }
    }
    return Topic;
  }

  it("new record returns boolean", async () => {
    const Topic = makeTopic();
    const t = new (Topic as any)({ title: "New" });
    expect(t.isNewRecord()).toBe(true);
    await t.save();
    expect(t.isNewRecord()).toBe(false);
  });

  it("load", async () => {
    const Topic = makeTopic();
    await Topic.create({ title: "One" });
    await Topic.create({ title: "Two" });
    const all = await Topic.all();
    expect(all.length).toBe(2);
  });

  it("all with conditions", async () => {
    const Topic = makeTopic();
    await Topic.create({ title: "A", approved: true });
    await Topic.create({ title: "B", approved: false });
    const approved = await Topic.where({ approved: true });
    expect(approved.length).toBe(1);
  });

  it("find ordered last", async () => {
    const Topic = makeTopic();
    await Topic.create({ title: "First" });
    const second = await Topic.create({ title: "Second" });
    const last = await Topic.order("id").last();
    expect(last!.id).toBe(second.id);
  });

  it("count with join", async () => {
    const Topic = makeTopic();
    await Topic.create({ title: "Join" });
    const count = await Topic.count();
    expect(count).toBeGreaterThanOrEqual(1);
  });

  it("find keeps multiple order values", async () => {
    const Topic = makeTopic();
    const sql = Topic.order("title").order("author_name").toSql();
    expect(sql).toMatch(/ORDER BY/i);
  });

  it("benchmark with log level", async () => {
    class Topic extends Base {
      static {
        this.attribute("title", "string");
      }
    }
    const log: string[] = [];
    const savedLogger = Base.logger;
    const logger = new Logger({ write: (s: string) => log.push(s) });
    logger.level = Logger.WARN;
    Base.logger = logger;
    try {
      await Base.benchmark("Debug Topic Count", { level: "debug" }, () => Topic.count());
      await Base.benchmark("Warn Topic Count", { level: "warn" }, () => Topic.count());
      await Base.benchmark("Error Topic Count", { level: "error" }, () => Topic.count());
    } finally {
      Base.logger = savedLogger;
    }
    expect(log.some((m) => m.includes("Debug Topic Count"))).toBe(false);
    expect(log.some((m) => m.includes("Warn Topic Count"))).toBe(true);
    expect(log.some((m) => m.includes("Error Topic Count"))).toBe(true);
  });
});

describe("BasicsTest", () => {
  fixtures([]);

  class PostInner extends Base {
    declare title: string;
    static {
      this.tableName = "topics";
      this.attribute("title", "string");
    }
  }
  const Post = PostInner;

  it("attributes", async () => {
    const p = new Post({ title: "hello" });
    expect(p.title).toBe("hello");
  });

  it("clone of new object with defaults", () => {
    class Item extends Base {
      declare name: string;
      static {
        this.attribute("name", "string", { default: "default" });
      }
    }
    const i = new Item();
    const c = i.dup();
    expect(c.name).toBe("default");
  });

  it("clone of new object marks attributes as dirty", () => {
    class Item extends Base {
      static {
        this.attribute("name", "string");
      }
    }
    const i = new Item({ name: "test" });
    const c = i.dup();
    expect(c.isNewRecord()).toBe(true);
  });

  it("dup of saved object marks attributes as dirty", async () => {
    const p = await Post.create({ title: "saved" });
    const d = p.dup();
    expect(d.isNewRecord()).toBe(true);
  });

  it("has attribute", async () => {
    await CanonicalCompany.loadSchema();
    expect(CanonicalCompany.hasAttribute("id")).toBe(true);
    expect(CanonicalCompany.hasAttribute("type")).toBe(true);
    expect(CanonicalCompany.hasAttribute("name")).toBe(true);
    expect(CanonicalCompany.hasAttribute("new_name")).toBe(true);
    expect(CanonicalCompany.hasAttribute("metadata")).toBe(true);
    expect(CanonicalCompany.hasAttribute("lastname")).toBe(false);
    expect(CanonicalCompany.hasAttribute("age")).toBe(false);

    const company = CanonicalCompany.new();
    expect(company.hasAttribute("id")).toBe(true);
    expect(company.hasAttribute("type")).toBe(true);
    expect(company.hasAttribute("name")).toBe(true);
    expect(company.hasAttribute("new_name")).toBe(true);
    expect(company.hasAttribute("metadata")).toBe(true);
    expect(company.hasAttribute("lastname")).toBe(false);
    expect(company.hasAttribute("age")).toBe(false);
  });

  it("clear cache when setting table name", () => {
    class MyModel extends Base {}
    MyModel.tableName = "my_table";
    expect(MyModel.tableName).toBe("my_table");
  });

  it("touch should raise error on a new object", async () => {
    const p = new Post({ title: "unsaved" });
    await expect(p.touch("updated_at")).rejects.toBeInstanceOf(ActiveRecordError);
  });

  it("default values are deeply dupped", () => {
    class M extends Base {
      declare name: string;
      static {
        this.attribute("name", "string", { default: "val" });
      }
    }
    const a = new M();
    const b = new M();
    expect(a.name).toBe("val");
    expect(b.name).toBe("val");
  });

  it("records of different classes have different hashes", () => {
    class A extends Base {}
    class B extends Base {}
    const a = new A();
    const b = new B();
    expect(a.equals(b as any)).toBe(false);
  });

  it("dup with aggregate of same name as attribute", async () => {
    const p = await Post.create({ title: "orig" });
    const d = p.dup();
    expect(d.title).toBe("orig");
    expect(d.isNewRecord()).toBe(true);
  });

  it("clone of new object marks as dirty only changed attributes", () => {
    const p = new Post({ title: "t" });
    const d = p.dup();
    expect(d.isNewRecord()).toBe(true);
  });

  it("dup of saved object marks as dirty only changed attributes", async () => {
    const p = await Post.create({ title: "saved" });
    const d = p.dup();
    expect(d.isNewRecord()).toBe(true);
  });

  it("sql injection via find", async () => {
    await expect(Post.find("1 OR 1=1" as any)).rejects.toThrow();
  });

  it("unicode column name", async () => {
    class Weird extends Base {}
    const weird = await Weird.create({ なまえ: "たこ焼き仮面" });
    expect((weird as any).なまえ).toBe("たこ焼き仮面");
  });
});

describe("BasicsTest", () => {
  fixtures([]);

  it("table name guesses", () => {
    class User extends Base {
      declare active: boolean;
      declare name: string;
    }
    expect(User.tableName).toBe("users");
  });

  it("reload", async () => {
    class Topic extends Base {
      declare title: string;
      static {
        this.attribute("title", "string");
      }
    }
    const u = await Topic.create({ title: "Original" });
    const u2 = await Topic.find(u.id);
    await u2.update({ title: "Modified" });

    expect(u.title).toBe("Original");
    await u.reload();
    expect(u.title).toBe("Modified");
  });
  it("table name guesses with prefixes and suffixes", () => {
    class User extends Base {
      declare active: boolean;
      declare name: string;
      static {
        this.tableNamePrefix = "app_";
      }
    }
    expect(User.tableName).toBe("app_users");
  });
});

describe("BasicsTest", () => {
  fixtures(["companies", "topics"]);

  it("initialize with invalid attribute", () => {
    let ex: MultiparameterAssignmentErrors | undefined;
    try {
      new CanonicalTopic({
        title: "test",
        "written_on(4i)": "16",
        "written_on(5i)": "24",
        "written_on(6i)": "00",
      } as never);
    } catch (e) {
      ex = e as MultiparameterAssignmentErrors;
    }
    expect(ex).toBeInstanceOf(MultiparameterAssignmentErrors);
    expect(ex!.errors.length).toBe(1);
    expect((ex!.errors[0] as AttributeAssignmentError).attribute).toBe("written_on");
  });

  it("typecasting aliases", async () => {
    const topic = await CanonicalTopic.select("10 as tenderlove").first();
    expect((topic as any).tenderlove).toBe(10);
  });

  it("bignum", async () => {
    let company = await CanonicalCompany.find(1);
    (company as any).rating = 2147483648;
    await company.save();
    company = await CanonicalCompany.find(1);
    expect((company as any).rating).toBe(2147483648);
  });
});

afterAll(() => {
  vi.unstubAllEnvs();
});
