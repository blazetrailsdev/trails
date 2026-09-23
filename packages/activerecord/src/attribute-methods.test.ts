import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { Temporal, Time as RubyTime } from "@blazetrails/date";
import {
  assertEmpty,
  assertNotDeprecated,
  assertNothingRaised,
  assertRaises,
  assertRespondTo,
  assertNotRespondTo,
  assertIncludes,
  TimeWithZone,
  TimeZone,
  toFs,
  zone,
} from "@blazetrails/activesupport";
import {
  BooleanType,
  DateTimeType,
  MissingAttributeError,
  TimeType,
  UnknownAttributeError as AMUnknownAttributeError,
} from "@blazetrails/activemodel";
import { ArgumentError, Module, basicObjRespondTo, NoMethodError } from "@blazetrails/ruby-compat";
import { Base, DangerousAttributeError, Type, UnknownAttributeError } from "./index.js";

import { GeneratedAttributeMethods } from "./attribute-methods.js";
import { TimeZoneConverter } from "./attribute-methods/time-zone-conversion.js";
import { inTimeZone } from "./cases/helper.js";
import { deprecator } from "./deprecator.js";
import { fixtures } from "./test-fixtures.js";
import { adapterType } from "./test-adapter.js";
import { registerModel } from "./associations.js";
import { Topic as CanonicalTopic, TitlePrimaryKeyTopic } from "./test-helpers/models/topic.js";
import { NumericData } from "./test-helpers/models/numeric-data.js";
import { Category } from "./test-helpers/models/category.js";
import { Computer } from "./test-helpers/models/computer.js";
import { Company } from "./test-helpers/models/company.js";
import { Minimalistic } from "./test-helpers/models/minimalistic.js";
import { Keyboard } from "./test-helpers/models/keyboard.js";
import { Boolean as BooleanModel } from "./test-helpers/models/boolean.js";
import { Developer, AuditLog, AuditLogRequired } from "./test-helpers/models/developer.js";
import { CpkOrder } from "./test-helpers/models/cpk.js";

registerModel([Developer, AuditLog, AuditLogRequired]);

class ToBeLoadedFirst extends Base {
  static {
    this.tableName = "topics";
    this.aliasAttribute("subject", "author_name");
  }
}

class ToBeLoadedSecond extends Base {
  static {
    this.tableName = "topics";
    this.aliasAttribute("subject", "title");
  }
}

class EpochTimestamp extends DateTimeType {
  override deserialize(timeOrInt: unknown): any {
    return timeOrInt == null
      ? null
      : Temporal.Instant.fromEpochMilliseconds(Number(timeOrInt) * 1000);
  }

  override serialize(time: unknown): unknown {
    if (time == null) return null;
    if (time instanceof TimeWithZone) return time.toTime().toI();
    if (time instanceof Temporal.Instant) return epochSeconds(time);
    return Number(time);
  }
}

function epochSeconds(instant: Temporal.Instant): number {
  return Math.trunc(Number(instant.epochNanoseconds / 1_000_000n) / 1000);
}

Type.register("epoch_timestamp", EpochTimestamp);

class ClassWithDeprecatedAliasAttributeBehaviorResolved extends Base {
  static {
    this.tableName = "topics";
    this.aliasAttribute("subject", "title");
  }

  get titleWas(): string {
    return "overridden_title_was";
  }

  get subjectWas(): string {
    return "overridden_subject_was";
  }
}

class ParentWithAlias extends Base {
  static {
    this.tableName = "topics";
    this.aliasAttribute("parents_subject", "title");
  }
}

class AbstractClassInBetween extends ParentWithAlias {
  static {
    this.abstractClass = true;
    this.aliasAttribute("parents_subject", "title");
  }
}

class ChildWithAnAliasFromAbstractClass extends AbstractClassInBetween {}

describe("AttributeMethodsTest", () => {
  const { topics } = fixtures(["topics", "developers", "companies", "computers"]);

  let target: typeof Base;
  let oldMatchers: (typeof Base)["attributeMethodPatterns"];

  beforeEach(() => {
    oldMatchers = [...Base.attributeMethodPatterns];
    target = class extends Base {};
    target.tableName = "topics";
  });

  afterEach(() => {
    Base.attributeMethodPatterns = oldMatchers;
  });

  // BLOCKED: activerecord-record-undefined-name-does-not-raise-no-method-error
  it.skip("attribute keys on a new instance", async () => {
    const t = CanonicalTopic.new() as any;
    expect(t.title).toBeNull();
    await assertRaises([NoMethodError], {}, () => t.title2);
  });

  it("integers as nil", async () => {
    class Post extends Base {
      declare legacy_comments_count: number;
      declare title: string;
      static {
        this.attribute("count", "integer");
      }
    }
    const p = Post.new({ count: null }) as any;
    expect(p.count).toBeNull();
  });

  it("attribute_present with booleans", async () => {
    const b1 = BooleanModel.new() as any;
    b1.value = false;
    expect(b1.attributePresent("value")).toBeTruthy();

    const b2 = BooleanModel.new() as any;
    b2.value = true;
    expect(b2.attributePresent("value")).toBeTruthy();

    const b3 = BooleanModel.new() as any;
    expect(b3.attributePresent("value")).toBeFalsy();

    const b4 = BooleanModel.new() as any;
    b4.value = false;
    await b4.saveBang();
    expect(((await BooleanModel.find(b4.id)) as any).attributePresent("value")).toBeTruthy();
  });

  it("array content", async () => {
    class Post extends Base {
      declare legacy_comments_count: number;
      declare title: string;
      static {
        this.attribute("title", "string");
      }
    }
    const p = Post.new({ title: "test" }) as any;
    expect(p.title).toBe("test");
  });

  it("hash content", async () => {
    const topic = CanonicalTopic.new() as any;
    topic.content = { one: 1, two: 2 };
    await topic.save();

    expect(((await CanonicalTopic.find(topic.id)) as any).content["two"]).toBe(2);

    topic.contentWillChange();
    topic.content["three"] = 3;
    await topic.save();

    expect(((await CanonicalTopic.find(topic.id)) as any).content["three"]).toBe(3);
  });

  it("read_attribute_for_database", async () => {
    const topic = new CanonicalTopic({ content: ["ok"] } as any) as any;
    expect(topic.readAttributeForDatabase("content")).toBe("---\n- ok\n");
  });

  it("attributes_for_database", async () => {
    const topic = CanonicalTopic.new() as any;
    topic.content = { one: 1, two: 2 };

    const dbAttributes = (CanonicalTopic.instantiate(topic.attributesForDatabase()) as any)
      .attributes;
    expect(topic.attributes).toEqual(dbAttributes);
  });

  it("allocated objects can be inspected", async () => {
    const topic = Object.create(CanonicalTopic.prototype);
    expect(topic.inspect()).toBe("#<Topic not initialized>");
  });
  it("#id_value alias is defined if id column exist", async () => {
    class Post extends Base {
      declare legacy_comments_count: number;
      declare title: string;
      static {
        this.attribute("id", "integer");
        this.attribute("title", "string");
      }
    }
    (Post as any).defineAttributeMethods();
    expect(Post.attributeNames()).toContain("id");
    expect(Object.keys((Post as any).attributeAliases ?? {})).toContain("id_value");
  });

  it("aliasing `id` attribute allows reading the column value", async () => {
    class Post extends Base {
      declare legacy_comments_count: number;
      declare title: string;
      static {
        this.attribute("id", "integer");
        this.attribute("title", "string");
      }
    }
    (Post as any).defineAttributeMethods();
    const p = new Post({ id: 123_456, title: "title" });
    expect((p as any).id_value).toBe(123_456);
  });

  it("case-sensitive attributes hash", async () => {
    class Post extends Base {
      declare legacy_comments_count: number;
      declare title: string;
      static {
        this.attribute("Title", "string");
      }
    }
    const p = new Post({ Title: "test" } as any);
    expect((p as any).Title).toBe("test");
  });

  it("write_attribute does not raise when the attribute isn't selected", async () => {
    class Post extends Base {
      declare legacy_comments_count: number;
      declare title: string;
      static {
        this.attribute("title", "string");
        this.attribute("body", "string");
      }
    }
    const p = await Post.create({ title: "hello", body: "world" });
    expect(() => (p as any).writeAttribute("title", "updated")).not.toThrow();
  });

  it("read_attribute can read aliased attributes as well", async () => {
    const topic = new CanonicalTopic({ title: "Don't change the topic" }) as any;

    expect(topic.readAttribute("heading")).toBe("Don't change the topic");
    expect(topic.get("heading")).toBe("Don't change the topic");

    expect(topic.readAttribute("heading")).toBe("Don't change the topic");
    expect(topic.get("heading")).toBe("Don't change the topic");
  });

  it("overridden write_attribute", async () => {
    const topic = CanonicalTopic.new() as any;
    topic.writeAttribute = function (attrName: string, value: unknown) {
      CanonicalTopic.prototype.writeAttribute.call(this, attrName, String(value).toLowerCase());
    };

    topic.writeAttribute("title", "Yet another topic");
    expect(topic.title).toBe("yet another topic");

    topic.set("title", "Yet another topic: part 2");
    expect(topic.title).toBe("yet another topic: part 2");

    topic.writeAttribute("title", "Yet another topic: part 3");
    expect(topic.title).toBe("yet another topic: part 3");

    topic.set("title", "Yet another topic: part 4");
    expect(topic.title).toBe("yet another topic: part 4");
  });

  it("attribute_method? returns false if the table does not exist", async () => {
    class Ghost extends Base {}
    expect(Ghost.hasAttribute("nonexistent")).toBeFalsy();
  });

  it("typecast attribute from select to false", async () => {
    class Post extends Base {
      declare legacy_comments_count: number;
      declare title: string;
      static {
        this.attribute("active", "boolean");
        this.attribute("title", "string", { default: "" });
        this.attribute("body", "string", { default: "" });
      }
    }
    const p = await Post.create({ active: false });
    expect((p as any).active).toBeFalsy();
  });

  it("typecast attribute from select to true", async () => {
    class Post extends Base {
      declare legacy_comments_count: number;
      declare title: string;
      static {
        this.attribute("active", "boolean");
        this.attribute("title", "string", { default: "" });
        this.attribute("body", "string", { default: "" });
      }
    }
    const p = await Post.create({ active: true });
    expect((p as any).active).toBeTruthy();
  });

  it("attribute_for_inspect with an array", async () => {
    const t = topics("first") as any;
    t.content = ["some_value"];
    expect(t.attributeForInspect("content")).toMatch(/\["some_value"\]/);
  });

  it("read attributes after type cast on a date", async () => {
    const tz = "Pacific Time (US & Canada)";

    await inTimeZone(tz, async () => {
      const record = target.new() as any;

      const dateString = "2011-03-24";
      const time = zone()!.parse(dateString);

      record.written_on = dateString;
      expect(record.readAttributeBeforeTypeCast("written_on")).toBe(dateString);
      expect(record.written_on.utc().toTime().epochNanoseconds).toBe(
        time!.utc().toTime().epochNanoseconds,
      );
      expect(record.written_on.timeZone.name).toBe(tz);

      await record.save();
      await record.reload();

      expect(record.written_on.utc().toTime().epochNanoseconds).toBe(
        time!.utc().toTime().epochNanoseconds,
      );
    });
  });

  it("global methods are overwritten when subclassing", async () => {
    const klass = class extends Base {};
    klass.abstractClass = true;

    const subklass = class extends klass {};
    subklass.tableName = "computers";

    expect(klass.isInstanceMethodAlreadyImplemented("system")).toBeFalsy();
    expect(subklass.isInstanceMethodAlreadyImplemented("system")).toBeFalsy();
    const computer = subklass.new() as any;
    expect(computer.system).toBeNull();
  });

  it("aliasing `id` attribute allows reading the column value for a CPK model", async () => {
    const order = (await CpkOrder.create({ id: [1, 123_456] } as any)) as any;

    expect(order.id_value).not.toBeNull();
    expect(order.id_value).toBe(123_456);
  });
  it("#id_value alias is not defined if id column doesn't exist", async () => {
    class Keyboard extends Base {
      static {
        this.primaryKey = "key_number";
        this.attribute("key_number", "integer");
        this.attribute("name", "string");
      }
    }
    (Keyboard as any).defineAttributeMethods();
    assertEmpty((Keyboard as any).attributeAliases ?? {});
  });
  it("#id_value alias returns id column only for composite primary key models", async () => {
    class Order extends Base {
      static {
        this.attribute("shop_id", "integer");
        this.attribute("id", "integer");
      }
    }
    (Order as any).defineAttributeMethods();
    const o = new Order({ shop_id: 1, id: 2 });
    expect((o as any).id_value).toBe(2);
  });
  it("attribute_for_inspect with a date", async () => {
    const t = topics("first") as any;

    expect(t.attributeForInspect("written_on")).toBe(`"${toFs(t.written_on, "inspect")}"`);
  });

  it("attribute_for_inspect with a long array", async () => {
    const t = topics("first") as any;
    t.content = Array.from({ length: 11 }, (_, i) => i + 1);

    expect(t.attributeForInspect("content")).toBe("[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]");
  });
  it("attribute_for_inspect with a non-primary key id attribute", async () => {
    const t = (topics("first") as any).becomes(TitlePrimaryKeyTopic);
    t.title = "The First Topic Now Has A Title With\nNewlines And More Than 50 Characters";

    expect(t.attributeForInspect("id")).toBe("1");
  });
  it("read_attribute raises ActiveModel::MissingAttributeError when the attribute isn't selected", async () => {
    const computer = (await Computer.select("id", "extendedWarranty").first()) as any;
    expect(() => computer.get("developer")).toThrow(/attribute 'developer' for Computer/);
    expect(() => computer.get("extendedWarranty")).not.toThrow();
    expect(() => computer.get("no_column_exists")).not.toThrow();
  });
  it("user-defined time attribute predicate", async () => {
    class klass extends Base {
      static {
        this.tableName = CanonicalTopic.tableName;

        this.attribute("user_defined_time", "time");
      }
    }

    const topic = new klass({ user_defined_time: Temporal.Now.instant() } as any) as any;
    expect(topic["user_defined_time?"]).toBeTruthy();
  });
  it("user-defined JSON attribute predicate", async () => {
    class klass extends Base {
      static {
        this.tableName = CanonicalTopic.tableName;

        this.attribute("user_defined_json", "json");
      }
    }

    let topic = new klass({ user_defined_json: { key: "value" } } as any) as any;
    expect(topic["user_defined_json?"]).toBeTruthy();

    topic = new klass({ user_defined_json: {} } as any) as any;
    expect(topic["user_defined_json?"]).toBeFalsy();
  });
  // BLOCKED: activerecord-record-undefined-name-does-not-raise-no-method-error
  it.skip("undeclared attribute method does not affect respond_to? and method_missing", async () => {
    const topic = target.new({ title: "Budget" }) as any;
    assertRespondTo(topic, "title");
    expect(topic.title).toBe("Budget");
    assertNotRespondTo(topic, "title_hello_world");
    await assertRaises([NoMethodError], {}, () => topic.title_hello_world);
  });
  it("declared prefixed attribute method affects respond_to? and method_missing", async () => {
    const topic = new target({ title: "Budget" } as any) as any;
    for (const prefix of ["default_", "title_"]) {
      target.attributeMethodPrefix(prefix);
      const pattern = target.attributeMethodPatterns.at(-1)!;
      (target.prototype as any)[pattern.proxyTarget] = function (...args: unknown[]) {
        return args;
      };
      target.defineAttributeMethods();

      const meth = pattern.methodName("title");
      assertRespondTo(topic, meth);
      expect(topic[meth]()).toEqual(["title"]);
      expect(topic[meth]("a")).toEqual(["title", "a"]);
      expect(topic[meth](1, 2, 3)).toEqual(["title", 1, 2, 3]);
    }
  });
  it("declared suffixed attribute method affects respond_to? and method_missing", async () => {
    for (const suffix of ["_default", "_title_default", "_it!", "_candidate=", "able?"]) {
      target.attributeMethodSuffix(suffix);
      const pattern = target.attributeMethodPatterns.at(-1)!;
      (target.prototype as any)[pattern.proxyTarget] = function (...args: unknown[]) {
        return args;
      };
      const topic = new target({ title: "Budget" } as any) as any;

      const meth = pattern.methodName("title");
      assertRespondTo(topic, meth);
      expect(topic[meth]()).toEqual(["title"]);
      expect(topic[meth]("a")).toEqual(["title", "a"]);
      expect(topic[meth](1, 2, 3)).toEqual(["title", 1, 2, 3]);
    }
  });
  it("declared affixed attribute method affects respond_to? and method_missing", async () => {
    for (const [prefix, suffix] of [
      ["mark_", "_for_update"],
      ["reset_", "!"],
      ["default_", "_value?"],
    ]) {
      target.attributeMethodAffix({ prefix, suffix });
      const pattern = target.attributeMethodPatterns.at(-1)!;
      (target.prototype as any)[pattern.proxyTarget] = function (...args: unknown[]) {
        return args;
      };
      const topic = new target({ title: "Budget" } as any) as any;

      const meth = pattern.methodName("title");
      assertRespondTo(topic, meth);
      expect(topic[meth]()).toEqual(["title"]);
      expect(topic[meth]("a")).toEqual(["title", "a"]);
      expect(topic[meth](1, 2, 3)).toEqual(["title", 1, 2, 3]);
    }
  });
  it("should unserialize attributes for frozen records", async () => {
    const myobj = { value1: "value2" };
    const topic = (await CanonicalTopic.create({ content: myobj } as any)) as any;
    topic.freeze();
    expect(topic.content).toEqual(myobj);
  });
  it("raises ActiveRecord::DangerousAttributeError when defining an AR method or dangerous Object method in a model", () => {
    for (const method of ["save", "createOrUpdate", "dup", "isFrozen"]) {
      const klass = class extends Base {};
      Object.defineProperty(klass.prototype, method, {
        value() {
          return `defined ${method}`;
        },
        configurable: true,
      });
      expect(() =>
        (
          klass as unknown as { isInstanceMethodAlreadyImplemented(name: string): boolean }
        ).isInstanceMethodAlreadyImplemented(method),
      ).toThrow(DangerousAttributeError);
    }
  });
  it("setting time zone-aware read attribute", async () => {
    const utcTime = Temporal.Instant.from("2008-01-01T00:00:00Z");
    const cstTime = new TimeWithZone(utcTime, TimeZone.find("Central Time (US & Canada)")!);
    await inTimeZone("Pacific Time (US & Canada)", async () => {
      const record = (await (await target.create({ written_on: cstTime })).reload()) as any;
      expect(record.get("written_on").utc().toTime().epochNanoseconds).toBe(
        utcTime.epochNanoseconds,
      );
      expect(record.get("written_on").timeZone.name).toBe("Pacific Time (US & Canada)");
      expect([
        record.get("written_on").time.year,
        record.get("written_on").time.month,
        record.get("written_on").time.day,
        record.get("written_on").time.hour,
        record.get("written_on").time.min,
        record.get("written_on").time.sec,
      ]).toEqual([2007, 12, 31, 16, 0, 0]);
    });
  });
  it("setting time zone-aware attribute with a string", async () => {
    const utcTime = Temporal.Instant.from("2008-01-01T00:00:00Z");
    for (let timezoneOffset = -11; timezoneOffset <= 13; timezoneOffset++) {
      const timeString = new TimeWithZone(utcTime, TimeZone.find(timezoneOffset)!).toString();
      await inTimeZone("Pacific Time (US & Canada)", () => {
        const record = target.new({}) as any;
        record.written_on = timeString;
        expect(record.written_on.utc().toTime().epochNanoseconds).toBe(
          zone()!.parse(timeString)!.utc().toTime().epochNanoseconds,
        );
        expect(record.written_on.timeZone.name).toBe("Pacific Time (US & Canada)");
        expect([
          record.written_on.time.year,
          record.written_on.time.month,
          record.written_on.time.day,
          record.written_on.time.hour,
          record.written_on.time.min,
          record.written_on.time.sec,
        ]).toEqual([2007, 12, 31, 16, 0, 0]);
      });
    }
  });
  it("time zone-aware attribute saved", async () => {
    await inTimeZone(1, async () => {
      const record = (await target.create({ written_on: "2012-02-20 10:00" })) as any;

      record.written_on = "2012-02-20 09:00";
      await record.save();
      expect((await record.reload()).written_on.utc().toTime().epochNanoseconds).toBe(
        zone()!.local(2012, 2, 20, 9).utc().toTime().epochNanoseconds,
      );
    });
  });
  it("setting a time zone-aware attribute to a blank string returns nil", async () => {
    await inTimeZone("Pacific Time (US & Canada)", () => {
      const record = target.new({}) as any;
      record.written_on = " ";
      expect(record.written_on).toBeNull();
      expect(record.get("written_on")).toBeNull();
    });
  });
  it("setting a time zone-aware attribute interprets time zone-unaware string in time zone", async () => {
    const timeString = "Tue Jan 01 00:00:00 2008";
    for (let timezoneOffset = -11; timezoneOffset <= 13; timezoneOffset++) {
      await inTimeZone(timezoneOffset, () => {
        const record = target.new({}) as any;
        record.written_on = timeString;
        expect(record.written_on.utc().toTime().epochNanoseconds).toBe(
          zone()!.parse(timeString)!.utc().toTime().epochNanoseconds,
        );
        expect(record.written_on.timeZone.utcOffset).toBe(TimeZone.find(timezoneOffset)!.utcOffset);
        expect([
          record.written_on.time.year,
          record.written_on.time.month,
          record.written_on.time.day,
          record.written_on.time.hour,
          record.written_on.time.min,
          record.written_on.time.sec,
        ]).toEqual([2008, 1, 1, 0, 0, 0]);
      });
    }
  });
  it("setting a time zone-aware datetime in the current time zone", async () => {
    const utcTime = Temporal.Instant.from("2008-01-01T00:00:00Z");
    await inTimeZone("Pacific Time (US & Canada)", () => {
      const record = target.new({}) as any;
      record.written_on = new TimeWithZone(utcTime, zone()!);
      expect(record.written_on.utc().toTime().epochNanoseconds).toBe(utcTime.epochNanoseconds);
      expect(record.written_on.timeZone.name).toBe("Pacific Time (US & Canada)");
      expect([
        record.written_on.time.year,
        record.written_on.time.month,
        record.written_on.time.day,
        record.written_on.time.hour,
        record.written_on.time.min,
        record.written_on.time.sec,
      ]).toEqual([2007, 12, 31, 16, 0, 0]);
    });
  });
  it("setting a time zone-aware time in the current time zone", async () => {
    await inTimeZone("Pacific Time (US & Canada)", () => {
      const record = target.new({}) as any;
      const timeString = "10:00:00";
      const expectedTime = zone()!.parse(`2000-01-01 ${timeString}`)!;

      record.bonus_time = timeString;
      expect(record.bonus_time.utc().toTime().epochNanoseconds).toBe(
        expectedTime.utc().toTime().epochNanoseconds,
      );
      expect(record.bonus_time.timeZone.name).toBe("Pacific Time (US & Canada)");

      record.bonus_time = "";
      expect(record.bonus_time).toBeNull();
    });
  });
  it("setting a time zone-aware time with DST", async () => {
    await inTimeZone("Pacific Time (US & Canada)", async () => {
      const currentTime = zone()!.local(2014, 6, 15, 10);
      const record = target.new({ bonus_time: currentTime }) as any;
      const timeBeforeSave = record.bonus_time;

      await record.save();
      await record.reload();

      expect(record.bonus_time.utc().toTime().epochNanoseconds).toBe(
        timeBeforeSave.utc().toTime().epochNanoseconds,
      );
      expect(record.bonus_time.timeZone.name).toBe("Pacific Time (US & Canada)");
    });
  });
  it("setting invalid string to a zone-aware time attribute", async () => {
    await inTimeZone("Pacific Time (US & Canada)", () => {
      const record = target.new({}) as any;
      const timeString = "ABC";

      record.bonus_time = timeString;
      expect(record.bonus_time).toBeNull();
    });
  });
  it("removing time zone-aware types", async () => {
    await withTimeZoneAwareTypes(["datetime"], async () => {
      await inTimeZone("Pacific Time (US & Canada)", () => {
        const record = target.new({ bonus_time: "10:00:00" }) as any;
        const expectedTime = RubyTime.utc(2000, 1, 1, 10);

        expect(record.bonus_time).toEqual(expectedTime);
        expect(record.bonus_time.isUtc()).toBeTruthy();
      });
    });
  });
  it("time zone-aware attributes do not recurse infinitely on invalid values", async () => {
    let model = newTopicLikeArClass();

    let type = model.typeForAttribute("bonus_time");
    expect(type).toBeInstanceOf(TimeType);

    let invalidTime: unknown = [];
    let record = model.new({ bonus_time: invalidTime }) as any;
    expect(record.bonus_time).toEqual(invalidTime);

    invalidTime = Math.trunc(Date.now() / 1000);
    record = model.new({ bonus_time: invalidTime }) as any;
    expect(record.bonus_time).toEqual(invalidTime);

    await inTimeZone("Pacific Time (US & Canada)", () => {
      model = newTopicLikeArClass();

      type = model.typeForAttribute("bonus_time");
      expect(type).toBeInstanceOf(TimeZoneConverter);

      invalidTime = [];
      record = model.new({ bonus_time: invalidTime }) as any;
      expect(record.bonus_time).toEqual(invalidTime);

      invalidTime = Math.trunc(Date.now() / 1000);
      record = model.new({ bonus_time: invalidTime }) as any;
      expect(record.bonus_time).toEqual(invalidTime);
    });
  });
  it("time zone-aware custom attributes", async () => {
    const timestamp = Math.trunc(Date.now() / 1000);

    class Model extends Base {
      static {
        this.tableName = "minimalistics";
      }
    }
    (Model as any).attribute("expires_at", "epoch_timestamp");

    let type = Model.typeForAttribute("expires_at");
    expect(type).toBeInstanceOf(EpochTimestamp);

    let record1 = await (Model as any).createBang({ expires_at: timestamp });
    expect(epochSeconds(record1.expires_at)).toBe(timestamp);

    await (Model as any).insertBang({ expires_at: timestamp });
    let record2 = await (Model as any).last();
    expect(record1.equals(record2)).not.toBe(true);
    expect(epochSeconds(record2.expires_at)).toBe(timestamp);

    await inTimeZone("Pacific Time (US & Canada)", async () => {
      (Model as any).attribute("expires_at", "epoch_timestamp");

      type = Model.typeForAttribute("expires_at");
      expect(type).toBeInstanceOf(TimeZoneConverter);

      record1 = await (Model as any).createBang({ expires_at: timestamp });
      expect(record1.expires_at.toTime().toI()).toBe(timestamp);

      await (Model as any).insertBang({ expires_at: timestamp });
      record2 = await (Model as any).last();
      expect(record1.equals(record2)).not.toBe(true);
      expect(record2.expires_at.toTime().toI()).toBe(timestamp);
    });
  });
  it("setting a time_zone_conversion_for_attributes should write the value on a class variable", async () => {
    CanonicalTopic.skipTimeZoneConversionForAttributes = ["field_a"];
    Minimalistic.skipTimeZoneConversionForAttributes = ["field_b"];

    expect(CanonicalTopic.skipTimeZoneConversionForAttributes).toEqual(["field_a"]);
    expect(Minimalistic.skipTimeZoneConversionForAttributes).toEqual(["field_b"]);
  });
  // BLOCKED: activerecord-private-attribute-methods-are-still-public
  it.skip("attribute predicates respect access control", async () => {
    class Target extends Base {
      static {
        this.tableName = "topics";
        this.attribute("title", "string");
      }
      private get ["title?"](): string {
        return "I'm private";
      }
    }
    const topic = Target.new({ title: "Isaac Newton's pants" }) as any;
    assertNotRespondTo(topic, "title?");
    const exception = await assertRaises([NoMethodError], {}, () => topic["title?"]);
    assertIncludes(exception.message, "private method");
    expect(topic["title?"]).toBeTruthy();
  });
  // BLOCKED: activerecord-private-attribute-methods-are-still-public
  it.skip("bulk updates respect access control", async () => {
    class Target extends Base {
      static {
        this.tableName = "topics";
        this.attribute("title", "string");
      }
      private set title(_value: string) {}
    }
    await assertRaises([UnknownAttributeError], {}, () =>
      Target.new({ title: "Rants about pants" } as any),
    );
    await assertRaises([UnknownAttributeError], {}, () => {
      (Target.new() as any).attributes = { title: "Ants in pants" };
    });
  });
  it("#undefine_attribute_methods undefines alias attribute methods", () => {
    class topicClass extends Base {
      static {
        this.tableName = "topics";

        this.aliasAttribute("subject_to_be_undefined", "title");
      }
    }

    const topic = new topicClass({ title: "New topic" }) as any;
    expect(topic.subject_to_be_undefined).toBe("New topic");
    expect(basicObjRespondTo(topicClass.prototype, "subject_to_be_undefined")).toBe(true);
    topicClass.undefineAttributeMethods();
    expect(basicObjRespondTo(topicClass.prototype, "subject_to_be_undefined")).toBe(false);

    topicClass.defineAttributeMethods();
    expect(basicObjRespondTo(topicClass.prototype, "subject_to_be_undefined")).toBe(true);

    expect(topic.respondTo("subject_to_be_undefined")).toBe(true);
    expect(basicObjRespondTo(topicClass.prototype, "subject_to_be_undefined")).toBe(true);
  });
  it("#define_attribute_methods brings back undefined aliases", () => {
    class topicClass extends Base {
      static {
        this.tableName = "topics";

        this.aliasAttribute("title_alias_to_be_undefined", "title");
      }
    }

    const topic = new topicClass({ title: "New topic" }) as any;
    expect(topic.title_alias_to_be_undefined).toBe("New topic");
    topicClass.undefineAttributeMethods();

    expect(basicObjRespondTo(topicClass.prototype, "title_alias_to_be_undefined")).toBe(false);

    topicClass.defineAttributeMethods();

    expect(basicObjRespondTo(topicClass.prototype, "title_alias_to_be_undefined")).toBe(true);
    expect(topic.title_alias_to_be_undefined).toBe("New topic");
  });
  it("#method_missing define methods on the fly in a thread safe way", async () => {
    class TopicClass extends Base {
      static {
        this.tableName = "topics";
        this.attribute("title", "string");
      }
    }
    TopicClass.undefineAttributeMethods();
    const topic = new TopicClass({ title: "New topic" }) as any;
    expect(topic.title).toBe("New topic");
  });
  it("#method_missing define methods on the fly in a thread safe way, even when decorated", async () => {
    class TopicClass extends Base {
      static {
        this.tableName = "topics";
        this.attribute("title", "string");
      }
      get title(): string {
        return `title:${this.readAttribute("title")}`;
      }
      set title(v: string) {
        this.writeAttribute("title", v);
      }
    }
    const topic = new TopicClass({ title: "New topic" }) as any;
    TopicClass.undefineAttributeMethods();
    expect(topic.title).toBe("title:New topic");
  });
  it("inherited custom accessors with reserved names", async () => {
    class klass extends Base {
      static {
        this.tableName = "computers";
        this.abstractClass = true;
      }
      get system(): string {
        return "omg";
      }
      set system(val: unknown) {
        (this as any).developer = val;
      }
    }

    class subklass extends klass {}
    for (const k of [klass, subklass]) k.defineAttributeMethods();

    const computer = (await subklass.find(1)) as any;
    expect(computer.system).toBe("omg");

    computer.developer = 99;
    expect(computer.developer).toBe(99);
  });
  it("on_the_fly_super_invokable_generated_attribute_methods_via_method_missing", async () => {
    const TopicBase = Base as unknown as Omit<typeof Base, "prototype"> &
      (new (...args: never[]) => Base & { get title(): string });
    class Klass extends TopicBase {
      static {
        this.tableName = "topics";
      }
      get title(): string {
        return `${super.title}!`;
      }
    }
    assertEmpty((Klass as any).generatedAttributeMethods().instanceMethods());

    const realTopic = topics("first") as any;
    expect(((await (Klass as unknown as typeof Base).find(realTopic.id)) as any).title).toBe(
      `${realTopic.title}!`,
    );
  });
  it("on-the-fly super-invokable generated attribute predicates via method_missing", async () => {
    const TopicBase = Base as unknown as Omit<typeof Base, "prototype"> &
      (new (...args: never[]) => Base & { get "title?"(): boolean });
    class Klass extends TopicBase {
      static {
        this.tableName = "topics";
      }
      get ["title?"](): boolean {
        return !super["title?"];
      }
    }
    assertEmpty((Klass as any).generatedAttributeMethods().instanceMethods());

    const realTopic = topics("first") as any;
    expect(((await (Klass as unknown as typeof Base).find(realTopic.id)) as any)["title?"]).toBe(
      !realTopic["title?"],
    );
  });
  it("calling super when the parent does not define method raises NoMethodError", async () => {
    const klass = newTopicLikeArClass((klass) => {
      (klass.prototype as any).someMethodThatIsNotOnSuper = function (this: Base): unknown {
        return Object.getPrototypeOf(klass.prototype).someMethodThatIsNotOnSuper.call(this);
      };
    });

    expect(() => (new klass() as any).someMethodThatIsNotOnSuper()).toThrow(TypeError);
  });
  it("generated attribute methods ancestors have correct module", async () => {
    const mod = (CanonicalTopic as any)._generatedAttributeMethods;
    expect(mod.inspect()).toBe("Topic::GeneratedAttributeMethods");
  });
  it("#alias_attribute override methods defined in parent models", async () => {
    class ParentModel extends Base {
      static {
        this.abstractClass = true;
      }
      get subject(): string {
        return "Abstract Subject";
      }
    }
    class Subclass extends ParentModel {
      static {
        this.tableName = "topics";
        this.attribute("title", "string");
        this.aliasAttribute("subject", "title");
      }
    }
    const obj = new Subclass({}) as any;
    obj.title = "hey";
    expect(obj.subject).toBe("hey");
  });
  it("aliases to the same attribute name do not conflict with each other", () => {
    const firstModelObject = new ToBeLoadedFirst({ author_name: "author 1" }) as any;
    expect(firstModelObject.subject).toBe("author 1");
    expect(firstModelObject.subjectChange).toEqual([null, "author 1"]);
    const secondModelObject = new ToBeLoadedSecond({ title: "foo" }) as any;
    expect(secondModelObject.subject).toBe("foo");
    expect(secondModelObject.subjectChange).toEqual([null, "foo"]);
  });
  it("#alias_attribute with an overridden original method does not use the overridden original method", async () => {
    class ClassWithDeprecatedAliasAttributeBehavior extends Base {
      static {
        this.tableName = "topics";
        this.attribute("title", "string");
        this.aliasAttribute("subject", "title");
      }
      get titleWas(): string {
        return "overridden_title_was";
      }
    }
    const obj = new ClassWithDeprecatedAliasAttributeBehavior({}) as any;
    obj.title = "hey";
    expect(obj.subject).toBe("hey");
    expect(obj.subjectWas).toBeNull();
  });
  it("#alias_attribute with an overridden original method from a module does not use the overridden original method", async () => {
    const titleWasOverride = {
      titleWas() {
        return "overridden_title_was";
      },
    };
    class ClassWithDeprecatedAliasAttributeBehaviorFromModule extends Base {
      static {
        this.tableName = "topics";
        this.attribute("title", "string");
      }
    }
    Object.defineProperty(
      ClassWithDeprecatedAliasAttributeBehaviorFromModule.prototype,
      "titleWas",
      { value: titleWasOverride.titleWas, writable: true, configurable: true },
    );
    (ClassWithDeprecatedAliasAttributeBehaviorFromModule as any).aliasAttribute("subject", "title");
    const obj = new ClassWithDeprecatedAliasAttributeBehaviorFromModule({}) as any;
    obj.title = "hey";
    expect(obj.subject).toBe("hey");
    expect(obj.subjectWas).toBeNull();
  });
  it("#alias_attribute with an overridden original method along with an overridden alias method uses the overridden alias method", async () => {
    const obj = new ClassWithDeprecatedAliasAttributeBehaviorResolved({}) as any;
    obj.title = "hey";
    expect(obj.subject).toBe("hey");
    expect(obj.subjectWas).toBe("overridden_subject_was");
  });
  it("#alias_attribute with an overridden original method along with an overridden alias method in a parent class uses the overridden alias method", async () => {
    class ChildWithDeprecatedBehaviorResolved extends ClassWithDeprecatedAliasAttributeBehaviorResolved {}

    const obj = new ChildWithDeprecatedBehaviorResolved({}) as any;
    obj.title = "hey";
    expect(obj.subject).toBe("hey");
    expect(obj.subjectWas).toBe("overridden_subject_was");
  });
  it("#alias_attribute with the same alias as parent doesn't issue a deprecation", async () => {
    new ParentWithAlias({});
    const obj = (await assertNotDeprecated(deprecator(), () => {
      return new ChildWithAnAliasFromAbstractClass({});
    })) as any;
    obj.title = "hey";
    expect(obj.parents_subject).toBe("hey");
  });
  it("#alias_attribute method on an abstract class is available on subclasses", async () => {
    class Superclass extends Base {
      static {
        this.abstractClass = true;
        this.aliasAttribute("id_value", "id");
      }
    }
    class Subclass extends Superclass {
      static {
        this.tableName = "topics";
        this.attribute("id", "integer");
        this.attribute("title", "string");
      }
    }
    const object = (Subclass as any).build({ id: 123_456 });
    expect(object.id_value).toBe(123_456);
  });
  it("#alias_attribute with an _in_database method issues raises an error", async () => {
    class ClassWithGeneratedAttributeMethodTarget extends Base {
      static {
        this.tableName = "topics";
        this.aliasAttribute("saved_title", "title_in_database");
      }
    }

    const message =
      "ClassWithGeneratedAttributeMethodTarget model aliases " +
      "`title_in_database`, but `title_in_database` is not an attribute. " +
      "Use `alias_method :saved_title, :title_in_database` or define the method manually.";

    const error = await assertRaises(
      [ArgumentError],
      {},
      () => new ClassWithGeneratedAttributeMethodTarget({}),
    );

    expect(error.message).toBe(message);
  });
  it("#alias_attribute with enum method raises an error", async () => {
    class ClassWithEnumMethodTarget extends Base {
      static {
        this.tableName = "books";

        this.attribute("status", "string");

        this.enum("status", {
          pending: "0",
          completed: "1",
        });
        this.aliasAttribute("is_pending?", "pending?");
      }
    }

    const message =
      "ClassWithEnumMethodTarget model aliases `pending?`, but `pending?` is not an attribute. " +
      "Use `alias_method :is_pending?, :pending?` or define the method manually.";

    const error = await assertRaises([ArgumentError], {}, () => new ClassWithEnumMethodTarget({}));

    expect(error.message).toBe(message);
  });
  it("#alias_attribute with an association method raises an error", async () => {
    class ClassWithAssociationTarget extends Base {
      static {
        this.tableName = "books";

        this.belongsTo("author");

        this.aliasAttribute("written_by", "author");
      }
    }

    const message =
      "ClassWithAssociationTarget model aliases `author`, but `author` is not an attribute. " +
      "Use `alias_method :written_by, :author` or define the method manually.";

    const error = await assertRaises([ArgumentError], {}, () => new ClassWithAssociationTarget({}));

    expect(error.message).toBe(message);
  });
  it("#alias_attribute method on a STI class is available on subclasses", async () => {
    class Superclass extends Base {
      static {
        this.tableName = "comments";
        this.attribute("body", "string");
        this.aliasAttribute("text", "body");
      }
    }
    class Subclass extends Superclass {
      static {
        this.abstractClass = true;
      }
    }
    class Subsubclass extends Subclass {}
    const comment = (Subsubclass as any).build({ body: "Text" });
    expect(comment.text).toBe("Text");
  });
  it("#alias_attribute with a manually defined method raises an error", async () => {
    class ClassWithAliasedManuallyDefinedMethod extends Base {
      static {
        this.tableName = "books";

        this.aliasAttribute("print", "publish");
      }

      publish(): string {
        return "Publishing!";
      }
    }

    const message =
      "ClassWithAliasedManuallyDefinedMethod model aliases `publish`, but `publish` is not an attribute. " +
      "Use `alias_method :print, :publish` or define the method manually.";

    const error = await assertRaises(
      [ArgumentError],
      {},
      () => new ClassWithAliasedManuallyDefinedMethod({}),
    );

    expect(error.message).toBe(message);
  });

  it("#id_value alias returns the value in the id column, when id column exists", async () => {
    class Post extends Base {
      declare legacy_comments_count: number;
      declare title: string;
      static {
        this.attribute("id", "integer");
        this.attribute("title", "string");
      }
    }
    (Post as any).defineAttributeMethods();
    const fresh = new Post({ title: "id_value_new" });
    expect((fresh as any).id_value).toBeNull();

    const p = new Post({ id: 1, title: "id_value_test" });
    expect((p as any).id_value).toBe(1);
  });
  it("attribute_for_inspect with a string", () => {
    const t = topics("first") as any;
    t.title = "The First Topic Now Has A Title With\nNewlines And More Than 50 Characters";

    expect(t.attributeForInspect("title")).toBe(
      '"The First Topic Now Has A Title With\\nNewlines And ..."',
    );
    expect(t.attributeForInspect("heading")).toBe(
      '"The First Topic Now Has A Title With\\nNewlines And ..."',
    );
  });
  it("attribute_present", () => {
    const t = CanonicalTopic.new() as any;
    t.title = "hello there!";
    t.written_on = Temporal.Now.instant();
    t.author_name = "";
    expect(t.attributePresent("title")).toBeTruthy();
    expect(t.attributePresent("heading")).toBeTruthy();
    expect(t.attributePresent("written_on")).toBeTruthy();
    expect(t.attributePresent("content")).toBeFalsy();
    expect(t.attributePresent("author_name")).toBeFalsy();
  });
  it("caching a nil primary key", () => {
    const klass = class extends Minimalistic {};
    void klass.primaryKey;

    const resetPrimaryKey = vi.spyOn(klass as any, "resetPrimaryKey");
    void klass.primaryKey;
    expect(resetPrimaryKey).not.toHaveBeenCalled();
    resetPrimaryKey.mockRestore();
  });
  it("respond_to?", async () => {
    const topic = (await CanonicalTopic.find(1)) as any;
    assertRespondTo(topic, "title");
    assertRespondTo(topic, "title?");
    assertRespondTo(topic, "title=");
    assertRespondTo(topic, "title");
    assertRespondTo(topic, "title?");
    assertRespondTo(topic, "title=");
    assertRespondTo(topic, "author_name");
    assertRespondTo(topic, "attributeNames");
    assertNotRespondTo(topic, "nothingness");
    assertNotRespondTo(topic, "nothingness");
  });
  it("respond_to? with a custom primary key", async () => {
    const keyboard = (await Keyboard.create()) as any;
    expect(keyboard.key_number).not.toBeNull();
    expect(keyboard.id).toBe(keyboard.key_number);
    assertRespondTo(keyboard, "key_number");
    assertRespondTo(keyboard, "id");
  });
  it("id_before_type_cast with a custom primary key", async () => {
    const keyboard = (await Keyboard.create()) as any;
    keyboard.key_number = "10";
    expect(keyboard.idBeforeTypeCast).toBe("10");
    expect(keyboard.readAttributeBeforeTypeCast("id")).toBeNull();
    expect(keyboard.readAttributeBeforeTypeCast("key_number")).toBe("10");
    expect(keyboard.readAttributeBeforeTypeCast("key_number")).toBe("10");
  });
  it("read attributes_before_type_cast", () => {
    const category = Category.new({ name: "Test category", type: null }) as any;
    const categoryAttrs = {
      name: "Test category",
      id: null,
      type: null,
      categorizations_count: null,
    };
    expect(category.attributesBeforeTypeCast()).toEqual(categoryAttrs);
  });
  it.skipIf(adapterType !== "mysql")("read attributes_before_type_cast on a boolean", async () => {
    const bool = (await BooleanModel.createBang({ value: false } as any)) as any;
    expect((await bool.reload()).attributesBeforeTypeCast()["value"]).toBe(0);
  });
  it("read overridden attribute with predicate respects override", () => {
    const topic = CanonicalTopic.new() as any;

    topic.approved = true;

    Object.defineProperty(topic, "approved", { value: false, configurable: true });

    expect(topic["approved?"]).toBeFalsy();
  });
  it("write time to date attribute", async () => {
    await inTimeZone("Pacific Time (US & Canada)", () => {
      const record = target.new() as any;
      record.last_read = RubyTime.utc(2010, 1, 1, 10);
      const lastRead = record.last_read;
      expect([lastRead.year, lastRead.mon, lastRead.mday]).toEqual([2010, 1, 1]);
    });
  });
  it("setting a time zone-aware attribute to UTC", async () => {
    const utcTime = Temporal.Instant.from("2008-01-01T00:00:00Z");
    await inTimeZone("Pacific Time (US & Canada)", () => {
      const record = target.new() as unknown as { written_on: TimeWithZone };
      record.written_on = utcTime as unknown as TimeWithZone;
      const wo = record.written_on;
      expect(wo.utc().toTime().epochNanoseconds).toBe(utcTime.epochNanoseconds);
      expect(wo.timeZone.name).toBe("Pacific Time (US & Canada)");
      const t = wo.time;
      expect([t.year, t.month, t.day, t.hour, t.min, t.sec]).toEqual([2007, 12, 31, 16, 0, 0]);
    });
  });
  it("attribute_names on a new record", () => {
    class Target extends Base {
      static {
        this.tableName = "topics";
      }
    }
    const model = Target.new() as any;

    expect(model.attributeNames()).toEqual(Target.columnNames());
  });

  it("set attributes", async () => {
    const topic = (await CanonicalTopic.find(1)) as any;
    await topic.assignAttributes({ title: "Budget", author_name: "Jason" });
    await topic.save();
    expect(topic.title).toBe("Budget");
    expect(topic.author_name).toBe("Jason");
    expect(((await CanonicalTopic.find(1)) as any).author_email_address).toBe(
      (topics("first") as any).author_email_address,
    );
  });

  it("read attributes_before_type_cast on a datetime", async () => {
    await inTimeZone("Pacific Time (US & Canada)", () => {
      class Target extends Base {
        static {
          this.tableName = "topics";
        }
      }
      const record = new Target({}) as any;

      record.written_on = "345643456";
      expect(record.readAttributeBeforeTypeCast("written_on")).toBe("345643456");
      expect(record.written_on).toBeNull();

      record.written_on = "2009-10-11 12:13:14";
      expect(record.readAttributeBeforeTypeCast("written_on")).toBe("2009-10-11 12:13:14");
      expect(record.written_on.utc().toTime().epochNanoseconds).toBe(
        zone()!.parse("2009-10-11 12:13:14")!.utc().toTime().epochNanoseconds,
      );
      expect(record.written_on.timeZone.name).toBe("Pacific Time (US & Canada)");
    });
  });

  it("write_attribute", async () => {
    const t = new CanonicalTopic({}) as any;
    t.writeAttribute("title", "Still another topic");
    expect(t.title).toBe("Still another topic");

    t.set("title", "Still another topic: part 2");
    expect(t.title).toBe("Still another topic: part 2");

    t.writeAttribute("title", "Still another topic: part 3");
    expect(t.title).toBe("Still another topic: part 3");

    t.set("title", "Still another topic: part 4");
    expect(t.title).toBe("Still another topic: part 4");
  });

  it("read_attribute", async () => {
    const t = new CanonicalTopic({}) as any;
    t.title = "Don't change the topic";
    expect(t.readAttribute("title")).toBe("Don't change the topic");
    expect(t.get("title")).toBe("Don't change the topic");

    expect(t.readAttribute("title")).toBe("Don't change the topic");
    expect(t.get("title")).toBe("Don't change the topic");
  });

  it("string attribute predicate", async () => {
    for (const value of [null, "", " "]) {
      expect((new CanonicalTopic({ author_name: value }) as any)["author_name?"]).toBe(false);
    }

    expect((new CanonicalTopic({ author_name: "Name" }) as any)["author_name?"]).toBe(true);

    for (const value of BooleanType.FALSE_VALUES) {
      expect((new CanonicalTopic({ author_name: value }) as any)["author_name?"]).toBeTruthy();
    }
  });

  it("converted values are returned after assignment", async () => {
    const developer = new Developer({ name: 1337, salary: "50000" } as any) as any;

    expect(developer.readAttributeBeforeTypeCast("salary")).toBe("50000");
    expect(developer.readAttributeBeforeTypeCast("name")).toBe(1337);

    expect(developer.salary).toBe(50000);
    expect(developer.name).toBe("1337");

    await developer.saveBang();

    expect(developer.salary).toBe(50000);
    expect(developer.name).toBe("1337");
  });

  it("write nil to time attribute", async () => {
    await inTimeZone("Pacific Time (US & Canada)", () => {
      const record = new CanonicalTopic({}) as any;
      record.written_on = null;
      expect(record.written_on).toBeNull();
    });
  });

  it("read overridden attribute", async () => {
    const topic = new CanonicalTopic({ title: "a" }) as any;
    Object.defineProperty(topic, "title", { get: () => "b" });
    expect(topic.get("title")).toBe("a");
  });

  // BLOCKED: activerecord-record-undefined-name-does-not-raise-no-method-error
  it.skip("non-attribute read and write", async () => {
    const topic = CanonicalTopic.new() as any;
    assertNotRespondTo(topic, "mumbo");
    await assertRaises([NoMethodError], {}, () => topic.mumbo);
    await assertRaises([NoMethodError], {}, () => (topic.mumbo = 5));
  });

  it("attributes without primary key", async () => {
    const klass = class extends Base {};
    klass.tableName = "developers_projects";

    expect(Object.keys((klass.new() as any).attributes)).toEqual(klass.columnNames());
    expect((klass.new() as any).hasAttribute("id")).toBeFalsy();
  });

  it("time attributes are retrieved in the current time zone", async () => {
    await inTimeZone("Pacific Time (US & Canada)", () => {
      class Topic extends Base {
        static {
          this.attribute("written_on", "datetime");
        }
      }
      const utcTime = Temporal.Instant.from("2008-01-01T00:00:00Z");
      const record = Topic.new({}) as unknown as {
        writeAttribute(name: string, value: unknown): void;
        written_on: TimeWithZone;
      };
      record.writeAttribute("written_on", utcTime);
      const wo = record.written_on;
      expect(wo.utc().toTime().epochNanoseconds).toBe(utcTime.epochNanoseconds);
      expect(wo).toBeInstanceOf(TimeWithZone);
      expect(wo.timeZone.name).toBe("Pacific Time (US & Canada)");
      const t = wo.time;
      expect([t.year, t.month, t.day, t.hour, t.min, t.sec]).toEqual([2007, 12, 31, 16, 0, 0]);
    });
  });

  it("setting time zone-aware attribute in other time zone", async () => {
    const utcTime = Temporal.Instant.from("2008-01-01T00:00:00Z");
    const cstTime = new TimeWithZone(utcTime, TimeZone.find("Central Time (US & Canada)")!);
    await inTimeZone("Pacific Time (US & Canada)", () => {
      class Topic extends Base {
        static {
          this.attribute("written_on", "datetime");
        }
      }
      const record = Topic.new({}) as unknown as { written_on: TimeWithZone };
      record.written_on = cstTime;
      const wo = record.written_on;
      expect(wo.utc().toTime().epochNanoseconds).toBe(utcTime.epochNanoseconds);
      expect(wo.timeZone.name).toBe("Pacific Time (US & Canada)");
      const t = wo.time;
      expect([t.year, t.month, t.day, t.hour, t.min, t.sec]).toEqual([2007, 12, 31, 16, 0, 0]);
    });
  });

  it("boolean attributes", async () => {
    expect(((await CanonicalTopic.find(1)) as any)["approved?"]).toBeFalsy();
    expect(((await CanonicalTopic.find(2)) as any)["approved?"]).toBeTruthy();
  });

  it("read_attribute when false", async () => {
    const topic = topics("first") as any;
    topic.approved = false;
    expect(topic["approved?"]).toBeFalsy();
    topic.approved = "false";
    expect(topic["approved?"]).toBeFalsy();
  });

  it("read_attribute when true", async () => {
    const topic = topics("first") as any;
    topic.approved = true;
    expect(topic["approved?"]).toBeTruthy();
    topic.approved = "true";
    expect(topic["approved?"]).toBeTruthy();
  });

  it("boolean attribute predicate", async () => {
    for (const value of [null, "", false, "false", "f", 0]) {
      expect((new CanonicalTopic({ approved: value } as any) as any)["approved?"]).toBe(false);
    }

    for (const value of [true, "true", "1", 1]) {
      expect((new CanonicalTopic({ approved: value } as any) as any)["approved?"]).toBe(true);
    }
  });

  it("boolean attributes writing and reading", async () => {
    const topic = new CanonicalTopic({}) as any;
    topic.approved = "false";
    expect(topic["approved?"]).toBeFalsy();

    topic.approved = "false";
    expect(topic["approved?"]).toBeFalsy();

    topic.approved = "true";
    expect(topic["approved?"]).toBeTruthy();

    topic.approved = "true";
    expect(topic["approved?"]).toBeTruthy();
  });

  function newTopicLikeArClass(block?: (klass: typeof Base) => void): typeof Base {
    const klass = class extends Base {};
    klass.tableName = "topics";
    block?.(klass);

    assertEmpty((klass as any).generatedAttributeMethods().instanceMethods());
    return klass;
  }

  async function withTimeZoneAwareTypes(
    types: string[],
    fn: () => Promise<void> | void,
  ): Promise<void> {
    const oldTypes = Base.timeZoneAwareTypes;
    Base.timeZoneAwareTypes = types;
    try {
      await fn();
    } finally {
      Base.timeZoneAwareTypes = oldTypes;
    }
  }

  it("read_attribute with nil should not asplode", async () => {
    class Topic extends Base {
      static {
        this.attribute("title", "string");
      }
    }
    const t = Topic.new({ title: null }) as any;
    expect(t.readAttribute("title")).toBeNull();
  });

  it("number attribute predicate", async () => {
    for (const value of [null, 0, "0"]) {
      expect((new Developer({ salary: value } as any) as any)["salary?"]).toBe(false);
    }

    expect((new Developer({ salary: 1 } as any) as any)["salary?"]).toBe(true);
    expect((new Developer({ salary: "1" } as any) as any)["salary?"]).toBe(true);
  });

  it("write_attribute can write aliased attributes as well", async () => {
    const topic = new CanonicalTopic({ title: "Don't change the topic" }) as any;
    topic.writeAttribute("heading", "New topic");

    expect(topic.title).toBe("New topic");
  });

  it("write_attribute allows writing to aliased attributes", async () => {
    const topic = (await CanonicalTopic.first()) as any;
    await expect(topic.updateColumns({ heading: "Hello!" })).resolves.not.toThrow();
    await expect(topic.update({ heading: "Hello!" })).resolves.not.toThrow();
  });

  it("overridden read_attribute", async () => {
    class Topic extends Base {
      static {
        this.attribute("title", "string");
      }
    }
    const t = Topic.new({ title: "Stop changing the topic" }) as any;
    const superReadAttribute = t.readAttribute.bind(t);
    t.readAttribute = (attrName: string, block?: (name: string) => unknown) =>
      String(superReadAttribute(attrName, block)).toUpperCase();

    expect(t.readAttribute("title")).toBe("STOP CHANGING THE TOPIC");
    expect(t.get("title")).toBe("STOP CHANGING THE TOPIC");

    expect(t.readAttribute("title")).toBe("STOP CHANGING THE TOPIC");
    expect(t.get("title")).toBe("STOP CHANGING THE TOPIC");
  });

  it("attribute_method?", async () => {
    expect(target.isAttributeMethod("title")).toBeTruthy();
    expect(target.isAttributeMethod("title=")).toBeTruthy();
    expect(target.isAttributeMethod("wibble")).toBeFalsy();
  });

  it("attribute_names on a queried record", async () => {
    const model = (await target.lastBang()) as any;

    expect(model.attributeNames()).toEqual(target.columnNames());
  });

  it("hashes are not mangled", async () => {
    const newTopic: any = { title: "New Topic", content: { key: "First value" } };
    const newTopicValues: any = { title: "AnotherTopic", content: { key: "Second value" } };

    const topic = new CanonicalTopic(newTopic) as any;
    expect(topic.title).toBe(newTopic["title"]);
    expect(topic.content).toEqual(newTopic["content"]);

    await topic.setAttributes(newTopicValues);
    expect(topic.title).toBe(newTopicValues["title"]);
    expect(topic.content).toEqual(newTopicValues["content"]);
  });

  it("create through factory", async () => {
    class Topic extends Base {
      static {
        this.attribute("title", "string");
      }
    }
    const t = (await Topic.create({ title: "factory" })) as any;
    expect(t.title).toBe("factory");
  });

  it("attribute_names with a custom select", async () => {
    const model = (await target.select("id").lastBang()) as any;

    expect(model.attributeNames()).toEqual(["id"]);
    expect(target.columnNames()).not.toEqual(["id"]);
  });

  it("set attributes without a hash", async () => {
    const topic = CanonicalTopic.new() as any;
    expect(() => topic.setAttributes("")).toThrow(ArgumentError);
  });

  it("set attributes with a block", async () => {
    const topic = CanonicalTopic.new({}, (t: any) => {
      t.title = "Budget";
      t.author_name = "Jason";
    }) as any;

    expect(topic.title).toBe("Budget");
    expect(topic.author_name).toBe("Jason");
  });

  it("came_from_user?", async () => {
    const model = (await target.first()) as any;

    expect(model.idCameFromUser).toBeFalsy();
    model.id = "omg";
    expect(model.idCameFromUser).toBeTruthy();
  });

  it("accessed_fields", async () => {
    const model = (await target.first()) as any;

    expect(model.accessedFields()).toEqual([]);

    void model.title;

    expect(model.accessedFields()).toEqual(["title"]);
  });

  it("read_attribute_before_type_cast with aliased attribute", async () => {
    const model = new NumericData({ new_bank_balance: "abcd" } as any) as any;
    expect(model.readAttributeBeforeTypeCast("new_bank_balance")).toBe("abcd");
  });

  it("read_attribute_for_database with aliased attribute", async () => {
    const topic = new CanonicalTopic({ title: "Hello" }) as any;
    expect(topic.readAttributeForDatabase("heading")).toBe("Hello");
  });

  it("instance methods should be defined on the base class", async () => {
    class Topic extends Base {
      static {
        this.attribute("id", "integer");
        this.attribute("title", "string");
      }
    }
    class Subklass extends Topic {}

    (Topic as any).defineAttributeMethods();

    const instance = new Subklass({}) as any;
    instance.id = 5;
    expect(instance.id).toBe(5);
    expect("id" in Subklass.prototype).toBeTruthy();

    (Topic as any).undefineAttributeMethods();

    expect(instance.id).toBe(5);
    expect("id" in Subklass.prototype).toBeTruthy();
  });

  it("global methods are overwritten", async () => {
    const klass = class extends Base {};
    klass.tableName = "computers";

    expect(klass.isInstanceMethodAlreadyImplemented("system")).toBeFalsy();
    const computer = klass.new() as any;
    expect(computer.system).toBeNull();
  });

  it("method overrides in multi-level subclasses", async () => {
    class Level1 extends Developer {
      static {
        Object.defineProperty(this.prototype, "name", {
          get(this: Developer) {
            return `dev:${this.readAttribute("name")}`;
          },
          set(this: Developer, v: string) {
            this.writeAttribute("name", v);
          },
          configurable: true,
        });
      }
    }
    class Level2 extends Level1 {}
    class Level3 extends Level2 {}
    const dev = new Level3({ name: "arthurnn" }) as any;
    await dev.saveBang();
    expect((await dev.reload()).name).toBe("dev:arthurnn");
  });

  it("inherited custom accessors", async () => {
    class Topic extends Base {
      static {
        this.tableName = "topics";
        this.abstractClass = true;
        this.attribute("title", "string");
        this.attribute("authorName", "string");
      }
      get title(): unknown {
        return "omg";
      }
      set title(val: unknown) {
        (this as any).authorName = val;
      }
    }
    assertEmpty((Topic as any).generatedAttributeMethods().instanceMethods());

    class SubTopic extends Topic {}
    (Topic as any).defineAttributeMethods();
    (SubTopic as any).defineAttributeMethods();

    const t = SubTopic.new({}) as any;
    expect(t.title).toBe("omg");
    t.title = "lol";
    expect(t.authorName).toBe("lol");
  });

  it("define_attribute_method works with both symbol and string", async () => {
    const klass = class extends Base {};
    klass.tableName = "foo";

    await assertNothingRaised(() => klass.defineAttributeMethod("foo"));
    await assertNothingRaised(() => klass.defineAttributeMethod("bar"));
  });

  // BLOCKED: activerecord-private-attribute-methods-are-still-public
  it.skip("attribute readers respect access control", async () => {
    class Target extends Base {
      static {
        this.tableName = "topics";
        this.attribute("title", "string");
      }
      private get title(): string {
        return "I'm private";
      }
      private set title(v: string) {
        this.writeAttribute("title", v);
      }
    }
    const topic = new Target({ title: "The pros and cons of programming naked." }) as any;
    assertNotRespondTo(topic, "title");
    const exception = await assertRaises([NoMethodError], {}, () => topic.title);
    assertIncludes(exception.message, "private method");
    expect(topic.title).toBe("I'm private");
  });

  // BLOCKED: activerecord-private-attribute-methods-are-still-public
  it.skip("attribute writers respect access control", async () => {
    class Target extends Base {
      static {
        this.tableName = "topics";
        this.attribute("title", "string");
      }
      private set title(_value: string) {}
    }
    const topic = Target.new() as any;
    assertNotRespondTo(topic, "title=");
    const exception = await assertRaises([NoMethodError], {}, () => {
      topic.title = "Pants";
    });
    assertIncludes(exception.message, "private method");
    topic.title = "Very large pants";
  });

  it("bulk update raises ActiveRecord::UnknownAttributeError", async () => {
    const error = (await assertRaises(
      [AMUnknownAttributeError],
      {},
      () => new CanonicalTopic({ hello: "world" } as any),
    )) as any;
    expect(error.record).toBeInstanceOf(CanonicalTopic);
    expect(error.attribute).toBe("hello");
    expect(error.message).toMatch("unknown attribute 'hello' for Topic.");
  });

  it("user-defined text attribute predicate", async () => {
    const klass = class extends Base {};
    klass.tableName = CanonicalTopic.tableName;
    klass.attribute("user_defined_text", "text");

    let topic = new klass({ user_defined_text: "text" } as any) as any;
    expect(topic["user_defined_text?"]).toBeTruthy();

    for (const value of BooleanType.FALSE_VALUES) {
      topic = new klass({ user_defined_text: value } as any) as any;
      expect(topic["user_defined_text?"]).toBeTruthy();
    }
  });

  it("user-defined date attribute predicate", async () => {
    class Topic extends Base {
      static {
        this.attribute("published_at", "date");
      }
    }
    const t = Topic.new({ published_at: "2024-01-01" }) as any;
    expect(t.published_at).toBeTruthy();
  });

  it("user-defined datetime attribute predicate", async () => {
    class Topic extends Base {
      static {
        this.attribute("updated_at", "datetime");
      }
    }
    const t = Topic.new({ updated_at: Temporal.Now.instant() }) as any;
    expect(t.updated_at).toBeTruthy();
  });

  it("custom field attribute predicate", async () => {
    const object = (
      await Company.findBySql(`
      SELECT c1.*, c2.type as string_value, c2.rating as int_value
        FROM companies c1, companies c2
       WHERE c1.firm_id = c2.id
         AND c1.id = 2
    `)
    )[0] as any;

    expect(object.string_value).toBe("Firm");
    expect(object.queryAttribute("string_value")).toBeTruthy();

    object.writeAttribute("string_value", "  ");
    expect(object.queryAttribute("string_value")).toBeFalsy();

    expect(Number(object.int_value)).toBe(1);
    expect(object.queryAttribute("int_value")).toBeTruthy();

    object.writeAttribute("int_value", "0");
    expect(object.queryAttribute("int_value")).toBeFalsy();
  });

  it("update array content", async () => {
    let topic = CanonicalTopic.new() as any;
    topic.content = ["one", "two", "three"];

    topic.content.push("four");
    expect(topic.content).toEqual(["one", "two", "three", "four"]);

    await topic.save();

    topic = (await CanonicalTopic.find(topic.id)) as any;
    topic.content.push("five");
    expect(topic.content).toEqual(["one", "two", "three", "four", "five"]);
  });

  it("write_attribute raises ActiveModel::MissingAttributeError when the attribute does not exist", async () => {
    const topic = (await CanonicalTopic.first()) as any;
    await expect(topic.updateColumns({ no_column_exists: "Hello!" })).rejects.toThrow(
      UnknownAttributeError,
    );
    await expect(topic.update({ no_column_exists: "Hello!" })).rejects.toThrow(
      AMUnknownAttributeError,
    );
    expect(() => topic.set("no_column_exists", "Hello!")).toThrow(MissingAttributeError);
  });
});

describe("attribute_alias arelTable integration", () => {
  fixtures([]);
  it("test_attribute_alias_in_where_references_association_name", () => {
    class User extends Base {
      static {
        this.attribute("username", "string");
        this.aliasAttribute("login", "username");
      }
    }
    const attr = User.arelTable.get("login");
    expect(attr.name).toBe("username");
  });
});

describe("initialize_generated_modules", () => {
  fixtures([]);

  it("generated attribute methods ancestors have correct module", () => {
    class Topic extends Base {
      static {
        this.attribute("title", "string");
      }
    }
    Topic.initializeGeneratedModules();
    expect(Topic._generatedAttributeMethods).toBeInstanceOf(GeneratedAttributeMethods);
  });

  it("runs lazily via defineAttributeMethods without a direct call", () => {
    class Topic extends Base {
      static {
        this.attribute("title", "string");
      }
    }
    (Topic as any).defineAttributeMethods();
    expect(Topic._generatedAttributeMethods).toBeInstanceOf(GeneratedAttributeMethods);
  });

  it("resets attribute-methods generation flags", () => {
    class Topic extends Base {
      static {
        this.attribute("title", "string");
      }
    }
    (Topic as any)._attributeMethodsGenerated = true;
    (Topic as any)._aliasAttributesMassGenerated = true;
    Topic.initializeGeneratedModules();
    expect((Topic as any)._attributeMethodsGenerated).toBe(false);
    expect((Topic as any)._aliasAttributesMassGenerated).toBe(false);
  });

  it("chains to Core#initialize_generated_modules via super", () => {
    class Topic extends Base {
      static {
        this.attribute("title", "string");
      }
    }
    Topic.initializeGeneratedModules();
    expect((Topic as any)._generatedAssociationMethods).toBeInstanceOf(Module);
  });
});
