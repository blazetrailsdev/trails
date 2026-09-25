import { HashWithIndifferentAccess } from "@blazetrails/activesupport";
import { describe, it, expect, afterAll, afterEach, vi } from "vitest";
import { Base, NotImplementedError, ReadonlyAttributeError, Relation } from "./index.js";
import {
  TableNotSpecified,
  ActiveRecordError,
  RecordNotFound,
  StatementInvalid,
} from "./errors.js";

import { adapterType } from "./test-adapter.js";
import { inMemoryDb } from "./support/adapter-helper.js";
import { registerModel } from "./associations.js";
import { connectedToStack } from "./core.js";
import {
  Logger,
  TimeWithZone,
  assert,
  assertNot,
  assertNotEmpty,
  assertNotPredicate,
  assertNothingRaised,
  assertPredicate,
  assertRaises,
  assertRespondTo,
  assertNotRespondTo,
  assertDifference,
} from "@blazetrails/activesupport";
import { Temporal, Time as RubyTime } from "@blazetrails/date";
import { fixtures } from "./test-fixtures.js";
import { withEnvTz, withTimezoneConfig } from "./test-helper.js";
import { IntegerType, ValueType, ArgumentError } from "@blazetrails/activemodel";
import { assertNoQueries, assertQueriesCount } from "./testing/query-assertions.js";
import { Company, Client, AbstractCompany } from "./test-helpers/models/company.js";
import { Post, PostRecord } from "./test-helpers/models/post.js";
import { Author } from "./test-helpers/models/author.js";
import { Subscriber } from "./test-helpers/models/subscriber.js";
import {
  Developer,
  SubDeveloper,
  SymbolIgnoredDeveloper,
  AttributedDeveloper,
  ColumnNamesCachedDeveloper,
} from "./test-helpers/models/developer.js";
import { Topic } from "./test-helpers/models/topic.js";
import { Reply } from "./test-helpers/models/reply.js";
import { Category } from "./test-helpers/models/category.js";
import { Car } from "./test-helpers/models/car.js";
import { Bulb, CustomBulb } from "./test-helpers/models/bulb.js";
import { Edge } from "./test-helpers/models/edge.js";
import { Joke, GoodJoke } from "./test-helpers/models/joke.js";
import { ColumnName } from "./test-helpers/models/column-name.js";
import { AutoId } from "./test-helpers/models/auto-id.js";
import { Default } from "./test-helpers/models/default.js";
import { Pet } from "./test-helpers/models/pet.js";
import { Bird } from "./test-helpers/models/bird.js";
import { LoosePerson, LooseDescendant } from "./test-helpers/models/person.js";
import "./support/canonical-model-index.js";
import { MultiparameterAssignmentErrors, type AttributeAssignmentError } from "./errors.js";
import { Range as ArRange, RuntimeError, sort } from "@blazetrails/ruby-compat";
import { raiseOnAssignToAttrReadonly, setRaiseOnAssignToAttrReadonly } from "./active-record.js";

vi.stubEnv("AR_NO_AUTO_SCHEMA", "1");

expect.addEqualityTesters([
  function rubyEquals(a: unknown, b: unknown): boolean | undefined {
    const toTime = (x: unknown) => (x instanceof TimeWithZone ? x.utc() : x);
    const ta = toTime(a);
    const tb = toTime(b);
    if (ta instanceof RubyTime && tb instanceof RubyTime) return ta.toR().cmp(tb.toR()) === 0;
    return undefined;
  },
]);

class FirstAbstractClass extends Base {
  static {
    this.abstractClass = true;
    this.connectionClass = true;
  }
}

class SecondAbstractClass extends FirstAbstractClass {
  static {
    this.abstractClass = true;
    this.connectionClass = true;
  }
}

class ThirdAbstractClass extends SecondAbstractClass {
  static {
    this.abstractClass = true;
  }
}

class Photo extends SecondAbstractClass {}
class Smarts extends Base {}
class CreditCard extends Base {}
class PinNumber extends Base {
  static moduleName = "CreditCard";
}
class CvvCode extends Base {
  static moduleName = "CreditCard::PinNumber";
}
class SubPinNumber extends PinNumber {}
class Brand extends Category {
  static moduleName = "CreditCard";
}
class MasterCreditCard extends Base {}
registerModel(CreditCard);
registerModel("CreditCard::PinNumber", PinNumber);
class NonExistentTable extends Base {}

class ReadonlyTitlePost extends Post {
  static {
    this.attrReadonly("title");
  }
}

class ReadonlyTitleAbstractPost extends Base {
  static {
    this.abstractClass = true;
    this.attrReadonly("title");
  }
}

class ReadonlyTitlePostWithAbstractParent extends ReadonlyTitleAbstractPost {
  static {
    this.tableName = "posts";
  }
}

const previousValue = raiseOnAssignToAttrReadonly();
setRaiseOnAssignToAttrReadonly(false);

class NonRaisingPost extends Post {
  static {
    this.attrReadonly("title");
  }
}

setRaiseOnAssignToAttrReadonly(previousValue);

class ReadonlyAuthorPost extends Post {
  static {
    this.attrReadonly("author_id");
  }
}

class Weird extends Base {}

function timeToA(time: any): unknown[] {
  return [
    time.sec,
    time.min,
    time.hour,
    time.day,
    time.mon,
    time.year,
    time.wday,
    time.yday,
    time.isdst,
    time.zone,
  ];
}

describe("BasicsTest", async () => {
  const { topics, posts, authors, developers, cpkBooks } = fixtures([
    "topics",
    "companies",
    "developers",
    "projects",
    "computers",
    "accounts",
    "minimalistics",
    "warehouseThings",
    "authors",
    "authorAddresses",
    "categorizations",
    "categories",
    "posts",
    "cpkBooks",
  ]);
  const cleanupConnections: Array<() => unknown> = [];
  afterEach(async () => {
    vi.restoreAllMocks();
    while (cleanupConnections.length > 0) await cleanupConnections.pop()!();
  });

  it("arel attribute normalization", () => {
    expect(Post.arelTable.get("body")).toEqual(Post.arelTable.get("body"));
    expect(Post.arelTable.get("text")).toEqual(Post.arelTable.get("body"));
  });

  it("incomplete schema loading", async () => {
    const topic = (await Topic.first()) as any;
    const payload = { foo: 42 };
    await topic.updateBang({ content: payload });

    await Topic.resetColumnInformation();

    const adapter = (await Topic.leaseConnection()) as any;
    vi.spyOn(adapter, "internalSchemaCache", "get").mockImplementation(() => {
      throw new RuntimeError("Some Error");
    });
    await assertRaises([RuntimeError], {}, () => (Topic as any).columnsHash());
    vi.restoreAllMocks();

    expect(((await Topic.first()) as any).content).toEqual(payload);
  });

  it("column names are escaped", async () => {
    const conn = (await Base.leaseConnection()) as any;
    const badchar = adapterType === "mysql" ? "`" : '"';

    const quoted = conn.quoteColumnName(`foo${badchar}bar`);
    expect(quoted).toEqual(`${badchar}foo${badchar.repeat(2)}bar${badchar}`);
  });

  it("columns should obey set primary key", () => {
    const pk = Subscriber.columnsHash()[Subscriber.primaryKey as string];
    expect(pk.name, "nick should be primary key").toBe("nick");
  });

  it("primary key with no id", () => {
    expect(Edge.primaryKey).toBeNull();
  });

  it("primary key and references columns should be identical type", () => {
    const pk = Author.columnsHash()["id"] as any;
    const ref = Post.columnsHash()["author_id"] as any;

    expect(ref.sqlType).toEqual(pk.sqlType);
  });

  it("many mutations", async () => {
    const car = new Car({ name: "<3<3<3" }) as any;
    car.engines_count = 0;
    for (let i = 0; i < 20_000; i++) car.engines_count += 1;
    assert(await car.save());
  });

  it("limit without comma", async () => {
    expect((await Topic.limit("1")).length).toEqual(1);
    expect((await Topic.limit(1)).length).toEqual(1);
  });

  it("limit should take value from latest limit", async () => {
    expect((await Topic.limit(2).limit(1)).length).toEqual(1);
  });

  it("invalid limit", async () => {
    await assertRaises([ArgumentError], {}, () => Topic.limit("asdfadf").toArray());
  });

  it("limit should sanitize sql injection for limit without commas", async () => {
    await assertRaises([ArgumentError], {}, () => Topic.limit("1 select * from schema").toArray());
  });

  it("limit should sanitize sql injection for limit with commas", async () => {
    await assertRaises([ArgumentError], {}, () => Topic.limit("1, 7 procedure help()").toArray());
  });

  it("select symbol", async () => {
    const topicIds = (await Topic.select("id")).map((t: any) => t.id).sort();
    expect(topicIds).toEqual(((await Topic.pluck("id")) as number[]).sort());
  });

  it("preserving date objects", async () => {
    expect(
      ((await Topic.find(1)) as any).last_read,
      "The last_read attribute should be of the Date class",
    ).toBeInstanceOf(Temporal.PlainDate);
  });

  it("previously changed", async () => {
    const topic = (await Topic.first()) as any;
    topic.title = "<3<3<3";
    expect(topic.previousChanges).toEqual(new HashWithIndifferentAccess());

    await topic.saveBang();
    const expected = ["The First Topic", "<3<3<3"];
    expect(topic.previousChanges.get("title")).toEqual(expected);
  });

  it("previously changed dup", async () => {
    const topic = (await Topic.first()) as any;
    topic.title = "<3<3<3";
    await topic.saveBang();

    const t2 = topic.dup();

    expect(t2.previousChanges).toEqual(topic.previousChanges);

    topic.title = "lolwut";
    await topic.saveBang();

    expect(t2.previousChanges).not.toEqual(topic.previousChanges);
  });

  it("preserving time objects", async () => {
    expect(
      ((await Topic.find(1)) as any).bonus_time,
      "The bonus_time attribute should be of the Time class",
    ).toBeInstanceOf(RubyTime);

    expect(
      ((await Topic.find(1)) as any).written_on,
      "The written_on attribute should be of the Time class",
    ).toBeInstanceOf(RubyTime);

    expect(((await Topic.find(1)) as any).written_on.sec).toEqual(11);
    expect(((await Topic.find(1)) as any).written_on.usec).toEqual(223300);
    expect(((await Topic.find(2)) as any).written_on.usec).toEqual(9900);
    expect(((await Topic.find(3)) as any).written_on.usec).toEqual(129346);
  });

  it("preserving time objects with local time conversion to default timezone utc", async () => {
    await withEnvTz(easternTimeZone(), async () => {
      await withTimezoneConfig({ default: "utc" }, async () => {
        const time = RubyTime.local(2000);
        const topic = (await Topic.create({ written_on: time })) as any;
        const savedTime = (await ((await Topic.find(topic.id)) as any).reload()).written_on;
        expect(savedTime).toEqual(time);
        expect(timeToA(time)).toEqual([0, 0, 0, 1, 1, 2000, 6, 1, false, "EST"]);
        expect(timeToA(savedTime)).toEqual([0, 0, 5, 1, 1, 2000, 6, 1, false, "UTC"]);
      });
    });
  });

  it("preserving time objects with time with zone conversion to default timezone utc", async () => {
    await withEnvTz(easternTimeZone(), async () => {
      await withTimezoneConfig({ default: "utc" }, async () => {
        await withTimezoneConfig({ zone: "Central Time (US & Canada)" }, async () => {
          const time = (await import("@blazetrails/activesupport")).zone()!.local(2000);
          const topic = (await Topic.create({ written_on: time })) as any;
          const savedTime = (await ((await Topic.find(topic.id)) as any).reload()).written_on;
          expect(savedTime).toEqual(time);
          expect(time.toA()).toEqual([0, 0, 0, 1, 1, 2000, 6, 1, false, "CST"]);
          expect(timeToA(savedTime)).toEqual([0, 0, 6, 1, 1, 2000, 6, 1, false, "UTC"]);
        });
      });
    });
  });

  it("preserving time objects with utc time conversion to default timezone local", async () => {
    await withEnvTz(easternTimeZone(), async () => {
      await withTimezoneConfig({ default: "local" }, async () => {
        const time = RubyTime.utc(2000);
        const topic = (await Topic.create({ written_on: time })) as any;
        const savedTime = (await ((await Topic.find(topic.id)) as any).reload()).written_on;
        expect(savedTime).toEqual(time);
        expect(timeToA(time)).toEqual([0, 0, 0, 1, 1, 2000, 6, 1, false, "UTC"]);
        expect(timeToA(savedTime)).toEqual([0, 0, 19, 31, 12, 1999, 5, 365, false, "EST"]);
      });
    });
  });

  it("preserving time objects with time with zone conversion to default timezone local", async () => {
    await withEnvTz(easternTimeZone(), async () => {
      await withTimezoneConfig({ default: "local" }, async () => {
        await withTimezoneConfig({ zone: "Central Time (US & Canada)" }, async () => {
          const time = (await import("@blazetrails/activesupport")).zone()!.local(2000);
          const topic = (await Topic.create({ written_on: time })) as any;
          const savedTime = (await ((await Topic.find(topic.id)) as any).reload()).written_on;
          expect(savedTime).toEqual(time);
          expect(time.toA()).toEqual([0, 0, 0, 1, 1, 2000, 6, 1, false, "CST"]);
          expect(timeToA(savedTime)).toEqual([0, 0, 1, 1, 1, 2000, 6, 1, false, "EST"]);
        });
      });
    });
  });

  it("time zone aware attribute with default timezone utc on utc can be created", async () => {
    await withEnvTz(easternTimeZone(), async () => {
      await withTimezoneConfig({ awareAttributes: true, default: "utc", zone: "UTC" }, async () => {
        const pet = (await Pet.create({ name: "Bidu" })) as any;
        assertPredicate(pet, (p: any) => p.isPersisted());
        const savedPet = (await Pet.find(pet.id)) as any;
        expect(savedPet.created_at).not.toBeNull();
        expect(savedPet.updated_at).not.toBeNull();
      });
    });
  });

  function easternTimeZone(): string {
    return "America/New_York";
  }

  it("custom mutator", async () => {
    const topic = (await Topic.find(1)) as any;
    topic.approved = true;
    assert(topic.customApproved);
  });

  it("initialize with attributes", () => {
    const topic = new Topic({
      title: "initialized from attributes",
      written_on: "2003-12-12 23:23",
    } as any) as any;

    expect(topic.title).toEqual("initialized from attributes");
  });

  it("initialize with invalid attribute", async () => {
    const ex = (await assertRaises([MultiparameterAssignmentErrors], {}, () => {
      new Topic({
        title: "test",
        "written_on(4i)": "16",
        "written_on(5i)": "24",
        "written_on(6i)": "00",
      } as never);
    })) as MultiparameterAssignmentErrors;

    expect(ex.errors.length).toEqual(1);
    expect((ex.errors[0] as AttributeAssignmentError).attribute).toEqual("written_on");
  });

  it("create after initialize without block", async () => {
    const cb = (await CustomBulb.create({ name: "Dude" })) as any;
    expect(cb.name).toEqual("Dude");
    expect(cb.frickinawesome).toEqual(true);
  });

  it("create after initialize with block", async () => {
    const cb = (await CustomBulb.create({}, (c: any) => {
      c.name = "Dude";
    })) as any;
    expect(cb.name).toEqual("Dude");
    expect(cb.frickinawesome).toEqual(true);
  });

  it("create after initialize with array param", async () => {
    const cbs = (await CustomBulb.create([{ name: "Dude" }, { name: "Bob" }])) as any[];
    expect(cbs[0].name).toEqual("Dude");
    expect(cbs[1].name).toEqual("Bob");
    assert(cbs[0].frickinawesome);
    assertNot(cbs[1].frickinawesome);
  });

  it("load", async () => {
    const topicsList = (await Topic.all().mergeBang({ order: "id" })) as any[];
    expect(topicsList.length).toEqual(5);
    expect(topicsList[0].title).toEqual(((await topics("first")) as any).title);
  });

  it("load with condition", async () => {
    const topicsList = (await Topic.all().mergeBang({ where: "author_name = 'Mary'" })) as any[];

    expect(topicsList.length).toEqual(1);
    expect(topicsList[0].title).toEqual(((await topics("second")) as any).title);
  });

  const GUESSED_CLASSES = [
    Category,
    Smarts,
    CreditCard,
    PinNumber,
    CvvCode,
    SubPinNumber,
    Brand,
    MasterCreditCard,
  ];

  it("table name guesses", () => {
    try {
      expect(Topic.tableName).toEqual("topics");

      expect(Category.tableName).toEqual("categories");
      expect(Smarts.tableName).toEqual("smarts");
      expect(CreditCard.tableName).toEqual("credit_cards");
      expect(PinNumber.tableName).toEqual("credit_card_pin_numbers");
      expect(CvvCode.tableName).toEqual("credit_card_pin_number_cvv_codes");
      expect(SubPinNumber.tableName).toEqual("credit_card_pin_numbers");
      expect(Brand.tableName).toEqual("categories");
      expect(MasterCreditCard.tableName).toEqual("master_credit_cards");
    } finally {
      GUESSED_CLASSES.forEach((k) => k.resetTableName());
    }
  });

  it("singular table name guesses", () => {
    try {
      Base.pluralizeTableNames = false;
      GUESSED_CLASSES.forEach((k) => k.resetTableName());

      expect(Category.tableName).toEqual("category");
      expect(Smarts.tableName).toEqual("smarts");
      expect(CreditCard.tableName).toEqual("credit_card");
      expect(PinNumber.tableName).toEqual("credit_card_pin_number");
      expect(CvvCode.tableName).toEqual("credit_card_pin_number_cvv_code");
      expect(SubPinNumber.tableName).toEqual("credit_card_pin_number");
      expect(Brand.tableName).toEqual("category");
      expect(MasterCreditCard.tableName).toEqual("master_credit_card");
    } finally {
      Base.pluralizeTableNames = true;
      GUESSED_CLASSES.forEach((k) => k.resetTableName());
    }
  });

  it("table name guesses with prefixes and suffixes", () => {
    try {
      Base.tableNamePrefix = "test_";
      Category.resetTableName();
      expect(Category.tableName).toEqual("test_categories");
      Base.tableNameSuffix = "_test";
      Category.resetTableName();
      expect(Category.tableName).toEqual("test_categories_test");
      Base.tableNamePrefix = "";
      Category.resetTableName();
      expect(Category.tableName).toEqual("categories_test");
      Base.tableNameSuffix = "";
      Category.resetTableName();
      expect(Category.tableName).toEqual("categories");
    } finally {
      Base.tableNamePrefix = "";
      Base.tableNameSuffix = "";
      GUESSED_CLASSES.forEach((k) => k.resetTableName());
    }
  });

  it("singular table name guesses with prefixes and suffixes", () => {
    try {
      Base.pluralizeTableNames = false;

      Base.tableNamePrefix = "test_";
      Category.resetTableName();
      expect(Category.tableName).toEqual("test_category");
      Base.tableNameSuffix = "_test";
      Category.resetTableName();
      expect(Category.tableName).toEqual("test_category_test");
      Base.tableNamePrefix = "";
      Category.resetTableName();
      expect(Category.tableName).toEqual("category_test");
      Base.tableNameSuffix = "";
      Category.resetTableName();
      expect(Category.tableName).toEqual("category");
    } finally {
      Base.pluralizeTableNames = true;
      Base.tableNamePrefix = "";
      Base.tableNameSuffix = "";
      GUESSED_CLASSES.forEach((k) => k.resetTableName());
    }
  });

  it("table name guesses with inherited prefixes and suffixes", () => {
    try {
      GUESSED_CLASSES.forEach((k) => k.resetTableName());

      CreditCard.tableNamePrefix = "test_";
      CreditCard.resetTableName();
      Category.resetTableName();
      expect(CreditCard.tableName).toEqual("test_credit_cards");
      expect(Category.tableName).toEqual("categories");
      CreditCard.tableNameSuffix = "_test";
      CreditCard.resetTableName();
      Category.resetTableName();
      expect(CreditCard.tableName).toEqual("test_credit_cards_test");
      expect(Category.tableName).toEqual("categories");
      CreditCard.tableNamePrefix = "";
      CreditCard.resetTableName();
      Category.resetTableName();
      expect(CreditCard.tableName).toEqual("credit_cards_test");
      expect(Category.tableName).toEqual("categories");
      CreditCard.tableNameSuffix = "";
      CreditCard.resetTableName();
      Category.resetTableName();
      expect(CreditCard.tableName).toEqual("credit_cards");
      expect(Category.tableName).toEqual("categories");
    } finally {
      CreditCard.tableNamePrefix = "";
      CreditCard.tableNameSuffix = "";
      GUESSED_CLASSES.forEach((k) => k.resetTableName());
    }
  });

  it("singular table name guesses for individual table", () => {
    try {
      Post.pluralizeTableNames = false;
      Post.resetTableName();
      expect(Post.tableName).toEqual("post");
      expect(Category.tableName).toEqual("categories");
    } finally {
      Post.pluralizeTableNames = true;
      Post.resetTableName();
    }
  });

  it("table name based on model name", () => {
    expect(PostRecord.tableName).toBe("posts");
  });

  it("table name for base class", () => {
    expect(Base.tableName).toBeNull();
  });

  it("null fields", async () => {
    expect(((await Topic.find(1)) as any).parent_id).toBeNull();
    expect(((await Topic.create({ title: "Hey you" })) as any).parent_id).toBeNull();
  });

  it("default values", async () => {
    let topic = new Topic() as any;
    assertPredicate(topic, (t: any) => t["approved?"]);
    expect(topic.written_on).toBeNull();
    expect(topic.bonus_time).toBeNull();
    expect(topic.last_read).toBeNull();

    await topic.save();

    topic = await Topic.find(topic.id);
    assertPredicate(topic, (t: any) => t["approved?"]);
    expect(topic.last_read).toBeNull();
  });

  it("utc as time zone", async () => {
    await withTimezoneConfig({ default: "utc" }, async () => {
      const attributes = { bonus_time: "5:42:00AM" };
      const topic = (await Topic.find(1)) as any;
      await topic.assignAttributes(attributes);
      expect(topic.bonus_time).toEqual(RubyTime.utc(2000, 1, 1, 5, 42, 0));
    });
  });

  it("utc as time zone and new", async () => {
    await withTimezoneConfig({ default: "utc" }, () => {
      const attributes = {
        "bonus_time(1i)": "2000",
        "bonus_time(2i)": "1",
        "bonus_time(3i)": "1",
        "bonus_time(4i)": "10",
        "bonus_time(5i)": "35",
        "bonus_time(6i)": "50",
      };
      const topic = new Topic(attributes as any) as any;
      expect(topic.bonus_time).toEqual(RubyTime.utc(2000, 1, 1, 10, 35, 50));
    });
  });

  it("default values on empty strings", async () => {
    let topic = new Topic() as any;
    topic.approved = null;
    topic.last_read = null;

    await topic.save();

    topic = await Topic.find(topic.id);
    expect(topic.last_read).toBeNull();

    expect(topic.approved).toBeNull();
  });

  it("equality", async () => {
    expect(await ((await Topic.find(2)) as any).topic).toEqual(await Topic.find(1));
  });

  it("find by slug", async () => {
    expect(await Topic.find(1)).toEqual(await Topic.find("1-meowmeow"));
  });

  it("out of range slugs", async () => {
    expect(await Topic.where({ id: ["1-meowmeow", "9223372036854775808-hello"] })).toEqual([
      await Topic.find(1),
    ]);
  });

  it("find by slug with array", async () => {
    expect(await Topic.find(["1-meowmeow", "2-hello"])).toEqual(await Topic.find([1, 2]));
    expect(((await Topic.find(["2-hello", "1-meowmeow"])) as any[])[0].title).toEqual(
      "The Second Topic of the day",
    );
  });

  it("find by slug with range", async () => {
    expect(await Topic.where({ id: new ArRange(1, 2) })).toEqual(
      await Topic.where({ id: new ArRange("1-meowmeow", "2-hello") }),
    );
  });

  it("equality of new records", () => {
    expect(new Topic()).not.toEqual(new Topic());
    expect(new Topic().equals(new Topic())).toEqual(false);
  });

  it("equality of destroyed records", async () => {
    const topic1 = new Topic({ title: "test_1" }) as any;
    await topic1.save();
    const topic2 = (await Topic.find(topic1.id)) as any;
    await topic1.destroy();
    expect(topic2.equals(topic1)).toEqual(true);
    expect(topic1.equals(topic2)).toEqual(true);
  });

  it("equality with blank ids", () => {
    const one = new Subscriber({ id: "" } as any);
    const two = new Subscriber({ id: "" } as any);
    expect(two.equals(one)).toEqual(true);
  });

  it("equality of relation and collection proxy", async () => {
    const car = (await Car.createBang()) as any;
    car.bulbs.build();
    await car.save();
    const bulbsOfCar = Bulb.where({ car_id: car.id });

    expect(await bulbsOfCar, "CollectionProxy should be comparable with Relation").toEqual(
      await car.bulbs.toArray(),
    );
    expect(await car.bulbs.toArray(), "Relation should be comparable with CollectionProxy").toEqual(
      await bulbsOfCar,
    );
  });

  it("equality of relation and array", async () => {
    const car = (await Car.createBang()) as any;
    car.bulbs.build();
    await car.save();
    const bulbsOfCar = Bulb.where({ car_id: car.id });

    expect(await car.bulbs.toArray(), "Relation should be comparable with Array").toEqual(
      await bulbsOfCar,
    );
  });

  it("equality of relation and association relation", async () => {
    const car = (await Car.createBang()) as any;
    car.bulbs.build();
    await car.save();
    const bulbsOfCar = Bulb.where({ car_id: car.id });

    expect(
      await car.bulbs.includes("car").toArray(),
      "Relation should be comparable with AssociationRelation",
    ).toEqual(await bulbsOfCar);
    expect(await bulbsOfCar, "AssociationRelation should be comparable with Relation").toEqual(
      await car.bulbs.includes("car").toArray(),
    );
  });

  it("equality of collection proxy and association relation", async () => {
    const car = (await Car.createBang()) as any;
    car.bulbs.build();
    await car.save();

    expect(
      await car.bulbs.includes("car").toArray(),
      "CollectionProxy should be comparable with AssociationRelation",
    ).toEqual(await car.bulbs.toArray());
    expect(
      await car.bulbs.toArray(),
      "AssociationRelation should be comparable with CollectionProxy",
    ).toEqual(await car.bulbs.includes("car").toArray());
  });

  it("hashing", async () => {
    const topic1 = await Topic.find(1);
    const topic = await ((await Topic.find(2)) as any).topic;
    expect(
      [topic].filter((t: any) => [topic1].some((o: any) => o.hash() === t.hash() && t.equals(o))),
    ).toEqual([topic1]);
  });

  it("successful comparison of like class records", async () => {
    const topic1 = (await Topic.createBang()) as any;
    const topic2 = (await Topic.createBang()) as any;

    expect([topic1, topic2]).toEqual([topic2, topic1].sort((a, b) => a.compare(b)));
  });

  it("failed comparison of unlike class records", async () => {
    const first = (await topics("first")) as any;
    const welcome = await posts("welcome");
    await assertRaises([ArgumentError], {}, () => {
      sort([first, welcome]);
    });
  });

  it("create without prepared statement", async () => {
    const topic = await ((await Topic.leaseConnection()) as any).unpreparedStatement(() =>
      Topic.create({ title: "foo" }),
    );

    expect(await Topic.find(topic.id)).toEqual(topic);
  });

  it("destroy without prepared statement", async () => {
    const topic = (await Topic.create({ title: "foo" })) as any;
    await ((await Topic.leaseConnection()) as any).unpreparedStatement(async () => {
      await ((await Topic.find(topic.id)) as any).destroy();
    });

    expect(await Topic.findBy({ id: topic.id })).toBeNull();
  });

  it("comparison with different objects", async () => {
    const topic = (await Topic.create()) as any;
    const category = await Category.create({ name: "comparison" });
    expect(topic.compare(category) ?? null).toBeNull();
  });

  it("comparison with different objects in array", async () => {
    const topic = (await Topic.create()) as any;
    await assertRaises([ArgumentError], {}, () => {
      sort([1, topic]);
    });
  });

  it("readonly attributes", async () => {
    expect(ReadonlyTitlePost.readonlyAttributes).toEqual(["title"]);

    let post = (await ReadonlyTitlePost.create({
      title: "cannot change this",
      body: "changeable",
    })) as any;
    expect(post.title).toEqual("cannot change this");
    expect(post.body).toEqual("changeable");

    post = await Post.find(post.id);
    expect(post.title).toEqual("cannot change this");
    expect(post.body).toEqual("changeable");

    await assertRaises([ReadonlyAttributeError], {}, () => {
      post.title = "changed via assignment";
    });
    post.body = "changed via assignment";
    expect(post.title).toEqual("cannot change this");
    expect(post.body).toEqual("changed via assignment");

    await assertRaises([ReadonlyAttributeError], {}, () => {
      post.writeAttribute("title", "changed via write_attribute");
    });
    post.writeAttribute("body", "changed via write_attribute");
    expect(post.title).toEqual("cannot change this");
    expect(post.body).toEqual("changed via write_attribute");

    await assertRaises([ReadonlyAttributeError], {}, () =>
      post.assignAttributes({
        body: "changed via assign_attributes",
        title: "changed via assign_attributes",
      }),
    );
    expect(post.title).toEqual("cannot change this");
    expect(post.body).toEqual("changed via assign_attributes");

    await assertRaises([ReadonlyAttributeError], {}, () =>
      post.update({ title: "changed via update", body: "changed via update" }),
    );
    expect(post.title).toEqual("cannot change this");
    expect(post.body).toEqual("changed via assign_attributes");

    await assertRaises([ReadonlyAttributeError], {}, () => {
      post.writeAttribute("title", "changed via []=");
    });
    post.writeAttribute("body", "changed via []=");
    expect(post.title).toEqual("cannot change this");
    expect(post.body).toEqual("changed via []=");

    await post.saveBang();

    post = await Post.find(post.id);
    expect(post.title).toEqual("cannot change this");
    expect(post.body).toEqual("changed via []=");
  });

  it("readonly attributes on a new record", async () => {
    expect(ReadonlyTitlePost.readonlyAttributes).toEqual(["title"]);

    let post = new ReadonlyTitlePost({
      title: "can change this until you save",
      body: "changeable",
    }) as any;
    expect(post.title).toEqual("can change this until you save");
    expect(post.body).toEqual("changeable");

    post.title = "changed via assignment";
    post.body = "changed via assignment";
    expect(post.title).toEqual("changed via assignment");
    expect(post.body).toEqual("changed via assignment");

    post.writeAttribute("title", "changed via write_attribute");
    post.writeAttribute("body", "changed via write_attribute");
    expect(post.title).toEqual("changed via write_attribute");
    expect(post.body).toEqual("changed via write_attribute");

    await post.assignAttributes({
      body: "changed via assign_attributes",
      title: "changed via assign_attributes",
    });
    expect(post.title).toEqual("changed via assign_attributes");
    expect(post.body).toEqual("changed via assign_attributes");

    post.writeAttribute("title", "changed via []=");
    post.writeAttribute("body", "changed via []=");
    expect(post.title).toEqual("changed via []=");
    expect(post.body).toEqual("changed via []=");

    await post.saveBang();

    post = await Post.find(post.id);
    expect(post.title).toEqual("changed via []=");
    expect(post.body).toEqual("changed via []=");
  });

  it("readonly attributes in abstract class descendant", async () => {
    expect(ReadonlyTitlePostWithAbstractParent.readonlyAttributes).toEqual(["title"]);

    await assertNothingRaised(() => {
      new ReadonlyTitlePostWithAbstractParent({ title: "can change this until you save" });
    });
  });

  it("readonly attributes when configured to not raise", async () => {
    expect(NonRaisingPost.readonlyAttributes).toEqual(["title"]);

    let post = (await NonRaisingPost.create({
      title: "cannot change this",
      body: "changeable",
    })) as any;
    expect(post.title).toEqual("cannot change this");
    expect(post.body).toEqual("changeable");

    post = await Post.find(post.id);
    expect(post.title).toEqual("cannot change this");
    expect(post.body).toEqual("changeable");

    post.title = "changed via assignment";
    post.body = "changed via assignment";
    await post.saveBang();
    await post.reload();
    expect(post.title).toEqual("cannot change this");
    expect(post.body).toEqual("changed via assignment");

    post.writeAttribute("title", "changed via write_attribute");
    post.writeAttribute("body", "changed via write_attribute");
    await post.saveBang();
    await post.reload();
    expect(post.title).toEqual("cannot change this");
    expect(post.body).toEqual("changed via write_attribute");

    await post.assignAttributes({
      body: "changed via assign_attributes",
      title: "changed via assign_attributes",
    });
    await post.saveBang();
    await post.reload();
    expect(post.title).toEqual("cannot change this");
    expect(post.body).toEqual("changed via assign_attributes");

    await post.update({ title: "changed via update", body: "changed via update" });
    await post.reload();
    expect(post.title).toEqual("cannot change this");
    expect(post.body).toEqual("changed via update");

    post.writeAttribute("title", "changed via []=");
    post.writeAttribute("body", "changed via []=");
    await post.saveBang();
    await post.reload();
    expect(post.title).toEqual("cannot change this");
    expect(post.body).toEqual("changed via []=");
  });

  it("readonly attributes on belongs to association", async () => {
    expect(ReadonlyAuthorPost.readonlyAttributes).toEqual(["author_id"]);

    const author1 = await Author.createBang({ name: "Alex" });
    const author2 = await Author.createBang({ name: "Not Alex" });

    const postWithReload = (await ReadonlyAuthorPost.createBang({
      author: author1,
      title: "Hi",
      body: "there",
    } as any)) as any;
    await postWithReload.reload();
    await postWithReload.update({ title: "Hello", body: "world" });
    expect(await postWithReload.author).toEqual(author1);

    const postWithReload2 = (await ReadonlyAuthorPost.createBang({
      author: author1,
      title: "Hi",
      body: "there",
    } as any)) as any;
    await postWithReload2.reload();
    await assertRaises([ReadonlyAttributeError], {}, () =>
      postWithReload2.update({ author: author2 }),
    );

    const postWithoutReload = (await ReadonlyAuthorPost.createBang({
      author: author1,
      title: "Hi",
      body: "there",
    } as any)) as any;
    await postWithoutReload.update({ title: "Hello", body: "world" });
    expect(await postWithoutReload.author).toEqual(author1);

    const postWithoutReload2 = (await ReadonlyAuthorPost.createBang({
      author: author1,
      title: "Hi",
      body: "there",
    } as any)) as any;
    await assertRaises([ReadonlyAttributeError], {}, () =>
      postWithoutReload2.update({ author: author2 }),
    );
  });

  it("unicode column name", async () => {
    await Weird.resetColumnInformation();
    const weird = (await Weird.create({ なまえ: "たこ焼き仮面" } as any)) as any;
    expect(weird.なまえ).toBe("たこ焼き仮面");
  });

  it("non valid identifier column name", async () => {
    const weird = (await Weird.create({ a$b: "value" } as any)) as any;
    await weird.reload();
    expect(weird["a$b"]).toEqual("value");
    expect(weird.readAttribute("a$b")).toEqual("value");

    await weird.updateColumns({ a$b: "value2" });
    await weird.reload();
    expect(weird["a$b"]).toEqual("value2");
    expect(weird.readAttribute("a$b")).toEqual("value2");
  });

  it("group weirds by from", async () => {
    await Weird.create({ a$b: "value", from: "aaron" } as any);
    const count = (await Weird.group(Weird.arelTable.get("from")).count()) as any;
    expect(count.get ? count.get("aaron") : count["aaron"]).toEqual(1);
  });

  it("attributes on dummy time", async () => {
    await withTimezoneConfig({ default: "local" }, async () => {
      const attributes = { bonus_time: "5:42:00AM" };
      const topic = (await Topic.find(1)) as any;
      await topic.assignAttributes(attributes);
      expect(topic.bonus_time).toEqual(RubyTime.local(2000, 1, 1, 5, 42, 0));

      await topic.saveBang();
      expect(await Topic.findBy(attributes)).toEqual(topic);
    });
  });

  it("attributes on dummy time with invalid time", async () => {
    const attributes = { bonus_time: "not a time" };
    const topic = (await Topic.find(1)) as any;
    await topic.assignAttributes(attributes);
    expect(topic.bonus_time).toBeNull();
  });

  it("attributes", () => {
    const category = new Category({ name: "Ruby" }) as any;

    const expectedAttributes = Object.fromEntries(
      category
        .attributeNames()
        .map((attributeName: string) => [attributeName, category[attributeName]]),
    );

    expect(category.attributes).toBeInstanceOf(Object);
    expect(category.attributes).toEqual(expectedAttributes);
  });

  it("new record returns boolean", async () => {
    expect(new Topic().isPersisted()).toEqual(false);
    expect(((await Topic.find(1)) as any).isPersisted()).toEqual(true);
  });

  it("previously new record returns boolean", async () => {
    expect(new Topic().isPreviouslyNewRecord()).toEqual(false);
    expect(((await Topic.create()) as any).isPreviouslyNewRecord()).toEqual(true);
    expect(((await Topic.find(1)) as any).isPreviouslyNewRecord()).toEqual(false);
  });

  it("previously new record on destroyed record", async () => {
    const topic = (await Topic.create()) as any;
    assertPredicate(topic, (t: any) => t.isPreviouslyNewRecord());

    await topic.destroy();
    assertNotPredicate(topic, (t: any) => t.isPreviouslyNewRecord());
  });

  it("previously persisted returns boolean", async () => {
    expect(new Topic().isPreviouslyPersisted()).toEqual(false);
    expect(((await new Topic().destroy()) as any).isPreviouslyPersisted()).toEqual(false);
    expect(((await Topic.first()) as any).isPreviouslyPersisted()).toEqual(false);
    expect((await ((await Topic.first()) as any).destroy()).isPreviouslyPersisted()).toEqual(true);
    expect((await ((await Topic.first()) as any).delete()).isPreviouslyPersisted()).toEqual(true);
  });

  it("dup for a composite primary key model", async () => {
    const book = (await cpkBooks("cpk_great_author_first_book")) as any;
    const newBook = book.dup();

    expect(newBook.title).toBe("The first book");
    expect(newBook.id).toEqual([null, null]);
  });

  class DeveloperSalary {
    constructor(public amount: number) {}
  }

  it("dup with aggregate of same name as attribute", async () => {
    const developerWithAggregate = class extends Base {
      static {
        this.tableName = "developers";
        this.composedOf("salary", {
          className: DeveloperSalary,
          mapping: [["salary", "amount"]],
        });
      }
    };

    const dev = (await developerWithAggregate.find(1)) as any;
    expect(dev.salary).toBeInstanceOf(DeveloperSalary);

    const dup = await assertNothingRaised(() => dev.dup());
    expect(dup.salary).toBeInstanceOf(DeveloperSalary);
    expect(dup.salary.amount).toEqual(dev.salary.amount);
    assertNotPredicate(dup, (d: any) => d.isPersisted());

    const salary = new DeveloperSalary(42);
    dup.salary = salary;
    salary.amount = 1;
    expect(dup.salary.amount).toEqual(42);

    assert(await dup.save());
    assertPredicate(dup, (d: any) => d.isPersisted());
    expect(dup.id).not.toEqual(dev.id);
  });

  it("dup does not copy associations", async () => {
    const author = (await authors("david")) as any;
    expect(await author.posts.toArray()).not.toEqual([]);

    const authorDup = author.dup();
    expect(await authorDup.posts.toArray()).toEqual([]);
  });

  it("clone preserves subtype", async () => {
    const clone = await assertNothingRaised(async () => ((await Company.find(3)) as any).clone());
    expect(clone).toBeInstanceOf(Client);
  });

  it("clone of new object with defaults", () => {
    const developer = new Developer() as any;
    assertNotPredicate(developer, (d: any) => d.nameChanged());
    assertNotPredicate(developer, (d: any) => d.salaryChanged());

    const clonedDeveloper = developer.clone();
    assertNotPredicate(clonedDeveloper, (d: any) => d.nameChanged());
    assertNotPredicate(clonedDeveloper, (d: any) => d.salaryChanged());
  });

  it("clone of new object marks attributes as dirty", () => {
    const developer = new Developer({ name: "Bjorn", salary: 100000 }) as any;
    assertPredicate(developer, (d: any) => d.nameChanged());
    assertPredicate(developer, (d: any) => d.salaryChanged());

    const clonedDeveloper = developer.clone();
    assertPredicate(clonedDeveloper, (d: any) => d.nameChanged());
    assertPredicate(clonedDeveloper, (d: any) => d.salaryChanged());
  });

  it("clone of new object marks as dirty only changed attributes", () => {
    const developer = new Developer({ name: "Bjorn" }) as any;
    assertPredicate(developer, (d: any) => d.nameChanged());
    assertNot(developer.salaryChanged());

    const clonedDeveloper = developer.clone();
    assertPredicate(clonedDeveloper, (d: any) => d.nameChanged());
    assertNot(clonedDeveloper.salaryChanged());
  });

  it("dup of saved object marks attributes as dirty", async () => {
    const developer = (await Developer.createBang({ name: "Bjorn", salary: 100000 })) as any;
    assertNotPredicate(developer, (d: any) => d.nameChanged());
    assertNotPredicate(developer, (d: any) => d.salaryChanged());

    const clonedDeveloper = developer.dup();
    assertPredicate(clonedDeveloper, (d: any) => d.nameChanged());
    assertPredicate(clonedDeveloper, (d: any) => d.salaryChanged());
  });

  it("dup of saved object marks as dirty only changed attributes", async () => {
    const developer = (await Developer.createBang({ name: "Bjorn" })) as any;
    assertNot(developer.nameChanged());
    assertNotPredicate(developer, (d: any) => d.salaryChanged());

    const clonedDeveloper = developer.dup();
    assertPredicate(clonedDeveloper, (d: any) => d.nameChanged());
    assertNot(clonedDeveloper.salaryChanged());
  });

  it("bignum", async () => {
    let company = (await Company.find(1)) as any;
    company.rating = 2147483648;
    await company.save();
    company = await Company.find(1);
    expect(company.rating).toBe(2147483648);
  });

  it("bignum pk", async () => {
    const company = (await Company.createBang({ id: 2147483648, name: "foo" } as any)) as any;
    expect(await Company.find(company.id)).toEqual(company);
  });

  it("default char types", () => {
    const defaultRecord = new Default() as any;

    expect(defaultRecord.char1).toEqual("Y");
    expect(defaultRecord.char2).toEqual("a varchar field");

    if (adapterType !== "mysql") {
      expect(defaultRecord.char3).toEqual("a text field");
    }
  });

  it("default in utc", async () => {
    await withTimezoneConfig({ default: "utc" }, () => {
      const defaultRecord = new Default() as any;

      expect(defaultRecord.fixed_date).toEqual(Temporal.PlainDate.from("2004-01-01"));
      expect(defaultRecord.fixed_time).toEqual(RubyTime.utc(2004, 1, 1, 0, 0, 0, 0));

      if (adapterType === "postgres") {
        expect(defaultRecord.fixed_time_with_time_zone).toEqual(
          RubyTime.utc(2004, 1, 1, 0, 0, 0, 0),
        );
      }
    });
  });

  it("default in utc with time zone", async () => {
    await withTimezoneConfig({ default: "utc", zone: "Central Time (US & Canada)" }, () => {
      const defaultRecord = new Default() as any;

      expect(defaultRecord.fixed_date).toEqual(Temporal.PlainDate.from("2004-01-01"));
      expect(defaultRecord.fixed_time).toEqual(RubyTime.utc(2004, 1, 1, 0, 0, 0, 0));

      if (adapterType === "postgres") {
        expect(defaultRecord.fixed_time_with_time_zone).toEqual(
          RubyTime.utc(2004, 1, 1, 0, 0, 0, 0),
        );
      }
    });
  });

  it("auto id", async () => {
    const auto = new AutoId() as any;
    await auto.save();
    assert(auto.id > 0);
  });

  it("sql injection via find", async () => {
    await assertRaises([RecordNotFound, StatementInvalid], {}, () =>
      Topic.find("123456 OR id > 0"),
    );
  });

  it("column name properly quoted", async () => {
    const colRecord = new ColumnName() as any;
    colRecord.references = 40;
    assert(await colRecord.save());
    colRecord.references = 41;
    assert(await colRecord.save());
    const c2 = (await ColumnName.find(colRecord.id)) as any;
    expect(c2).not.toBeNull();
    expect(c2.references).toEqual(41);
  });

  it("quoting arrays", async () => {
    const first = (await topics("first")) as any;
    const firstReplies = await first.replies.toArray();
    let replies = await Reply.all().mergeBang({
      where: ["id IN (?)", firstReplies.map((r: any) => r.id)],
    });
    expect(replies.length).toEqual(await first.replies.size());

    replies = await Reply.all().mergeBang({ where: ["id IN (?)", []] });
    expect(replies.length).toEqual(0);
  });

  it("quote", async () => {
    const authorName = "\\ \u0001 ' \n \\n \"";
    const topic = (await Topic.create({ author_name: authorName })) as any;
    expect(((await Topic.find(topic.id)) as any).author_name).toEqual(authorName);
  });

  it("toggle attribute", async () => {
    assertNotPredicate(await topics("first"), (t: any) => t["approved?"]);
    await ((await topics("first")) as any).toggleBang("approved");
    assertPredicate(await topics("first"), (t: any) => t["approved?"]);
    const topic = (await topics("first")) as any;
    topic.toggle("approved");
    assertNotPredicate(topic, (t: any) => t["approved?"]);
    await topic.reload();
    assertPredicate(topic, (t: any) => t["approved?"]);
  });

  it("reload", async () => {
    const t1 = (await Topic.find(1)) as any;
    const t2 = (await Topic.find(1)) as any;
    t1.title = "something else";
    await t1.save();
    await t2.reload();
    expect(t2.title).toEqual(t1.title);
  });

  it("switching between table name", async () => {
    const k = class extends Joke {};

    await assertDifference(
      new Map([[() => GoodJoke.count() as Promise<number>, 1]]),
      null,
      async () => {
        k.tableName = "cold_jokes";
        await k.create();

        k.tableName = "funny_jokes";
        await k.create();
      },
    );
  });

  it("clear cache when setting table name", async () => {
    const originalTableName = Joke.tableName;
    try {
      Joke.tableName = "funny_jokes";
      const beforeColumns = await Joke.columns();
      const beforeSeq = Joke.sequenceName;

      Joke.tableName = "cold_jokes";
      const afterColumns = await Joke.columns();
      const afterSeq = Joke.sequenceName;

      expect(afterColumns).not.toEqual(beforeColumns);
      if (!(beforeSeq == null && afterSeq == null)) expect(afterSeq).not.toEqual(beforeSeq);
    } finally {
      Joke.tableName = originalTableName;
    }
  });

  it("dont clear sequence name when setting explicitly", () => {
    const k = class extends Joke {};
    k.sequenceName = "black_jokes_seq";
    k.tableName = "cold_jokes";
    const beforeSeq = k.sequenceName;

    k.tableName = "funny_jokes";
    const afterSeq = k.sequenceName;

    // eslint-disable-next-line blazetrails/no-conditional-in-test -- mirrors Rails' trailing `unless before_seq.nil? && after_seq.nil?` (base_test.rb:1322)
    if (!(beforeSeq == null && afterSeq == null)) expect(afterSeq).toEqual(beforeSeq);
  });

  it("dont clear inheritance column when setting explicitly", async () => {
    const k = class extends Joke {};
    k.inheritanceColumn = "my_type";
    const beforeInherit = k.inheritanceColumn;

    await k.resetColumnInformation();
    const afterInherit = k.inheritanceColumn;

    // eslint-disable-next-line blazetrails/no-conditional-in-test -- mirrors Rails' trailing `unless before_inherit.blank? && after_inherit.blank?` (base_test.rb:1333)
    if (!(!beforeInherit && !afterInherit)) expect(afterInherit).toEqual(beforeInherit);
  });

  it("set table name symbol converted to string", () => {
    const k = class extends Joke {};
    k.tableName = "cold_jokes";
    expect(k.tableName).toEqual("cold_jokes");
  });

  it("quoted table name after set table name", () => {
    const klass = class extends Base {};

    klass.tableName = "foo";
    expect(klass.tableName).toEqual("foo");
    expect(klass.quotedTableName()).toEqual((klass.adapterClass() as any).quoteTableName("foo"));

    klass.tableName = "bar";
    expect(klass.tableName).toEqual("bar");
    expect(klass.quotedTableName()).toEqual((klass.adapterClass() as any).quoteTableName("bar"));
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

  const QUOTED_TYPE = async () => ((await Base.leaseConnection()) as any).quoteColumnName("type");

  it("count with join", async () => {
    const res = await Post.countBySql(
      `SELECT COUNT(*) FROM posts LEFT JOIN comments ON posts.id=comments.post_id WHERE posts.${await QUOTED_TYPE()} = 'Post'`,
    );
    const res2 = await Post.where(`posts.${await QUOTED_TYPE()} = 'Post'`)
      .joins("LEFT JOIN comments ON posts.id=comments.post_id")
      .count();
    expect(res2).toEqual(res);

    const res4 = await Post.countBySql(
      `SELECT COUNT(p.id) FROM posts p, comments co WHERE p.${await QUOTED_TYPE()} = 'Post' AND p.id=co.post_id`,
    );
    const res5 = await Post.where(`p.${await QUOTED_TYPE()} = 'Post' AND p.id=co.post_id`)
      .joins("p, comments co")
      .select("p.id")
      .count();
    expect(res5).toEqual(res4);

    const res6 = await Post.countBySql(
      `SELECT COUNT(DISTINCT p.id) FROM posts p, comments co WHERE p.${await QUOTED_TYPE()} = 'Post' AND p.id=co.post_id`,
    );
    const res7 = await Post.where(`p.${await QUOTED_TYPE()} = 'Post' AND p.id=co.post_id`)
      .joins("p, comments co")
      .select("p.id")
      .distinct()
      .count();
    expect(res7).toEqual(res6);
  });

  it("no limit offset", async () => {
    await assertNothingRaised(() => Developer.all().mergeBang({ offset: 2 }).toArray());
  });

  it("all", async () => {
    const developersRel = Developer.all();
    expect(developersRel).toBeInstanceOf(Relation);
    expect(await developersRel).toEqual(await Developer.all());
  });

  it("all with conditions", async () => {
    expect(await Developer.order("id desc")).toEqual(
      await Developer.all().mergeBang({ order: "id desc" }),
    );
  });

  it("find ordered last", async () => {
    const last = await Developer.order("developers.salary ASC").last();
    expect((await Developer.order({ "developers.salary": "ASC" })).at(-1)).toEqual(last);
  });

  it("find reverse ordered last", async () => {
    const last = await Developer.order("developers.salary DESC").last();
    expect((await Developer.order({ "developers.salary": "DESC" })).at(-1)).toEqual(last);
  });

  it("find multiple ordered last", async () => {
    const last = await Developer.order("developers.name, developers.salary DESC").last();
    expect(
      (await Developer.order("developers.name", { "developers.salary": "DESC" })).at(-1),
    ).toEqual(last);
  });

  it("find keeps multiple order values", async () => {
    const combined = await Developer.order("developers.name, developers.salary");
    expect(await Developer.order("developers.name", "developers.salary")).toEqual(combined);
  });

  it("find keeps multiple group values", async () => {
    const combined = await (Developer.all() as any)
      .merge({
        group:
          "developers.name, developers.salary, developers.id, developers.legacy_created_at, developers.legacy_updated_at, developers.legacy_created_on, developers.legacy_updated_on",
      })
      .toArray();
    expect(
      await (Developer.all() as any)
        .merge({
          group: [
            "developers.name",
            "developers.salary",
            "developers.id",
            "developers.created_at",
            "developers.updated_at",
            "developers.created_on",
            "developers.updated_on",
          ],
        })
        .toArray(),
    ).toEqual(combined);
  });

  it("find symbol ordered last", async () => {
    const last = await Developer.all().mergeBang({ order: "salary" }).last();
    expect((await Developer.all().mergeBang({ order: "salary" })).at(-1)).toEqual(last);
  });

  it("abstract class table name", () => {
    expect(AbstractCompany.tableName).toBeNull();
  });

  it("find on abstract base class doesnt use type condition", async () => {
    const descendant = (await LooseDescendant.createBang({ first_name: "bob" } as any)) as any;
    expect(
      await LoosePerson.find(descendant.id),
      `Should have found instance of LooseDescendant when finding abstract LoosePerson: ${descendant.inspect()}`,
    ).not.toBeNull();
  });

  it("assert queries count", async () => {
    const query = async () =>
      ((await Base.leaseConnection()) as any).execute("select count(*) from developers");
    await assertQueriesCount(2, false, async () => {
      for (let i = 0; i < 2; i++) await query();
    });
    await assertQueriesCount(1, false, query);
    await assertNoQueries(false, () => {
      assert(true);
    });
  });

  it("benchmark with log level", async () => {
    const originalLogger = Base.logger;
    const log: string[] = [];
    try {
      Base.logger = new Logger({ write: (s: string) => log.push(s) }) as any;
      (Base.logger as any).level = Logger.WARN;
      await Base.benchmark("Debug Topic Count", { level: "debug" }, () => Topic.count());
      await Base.benchmark("Warn Topic Count", { level: "warn" }, () => Topic.count());
      await Base.benchmark("Error Topic Count", { level: "error" }, () => Topic.count());
      expect(log.join("")).not.toMatch(/Debug Topic Count/);
      expect(log.join("")).toMatch(/Warn Topic Count/);
      expect(log.join("")).toMatch(/Error Topic Count/);
    } finally {
      Base.logger = originalLogger;
    }
  });

  it("benchmark with use silence", async () => {
    const originalLogger = Base.logger;
    const log: string[] = [];
    try {
      Base.logger = new Logger({ write: (s: string) => log.push(s) }) as any;
      (Base.logger as any).level = Logger.DEBUG;
      await Base.benchmark("Logging", { level: "debug", silence: false }, () => {
        Base.logger?.debug?.("Quiet");
      });
      expect(log.join("")).toMatch(/Quiet/);
    } finally {
      Base.logger = originalLogger;
    }
  });

  it("clear cache!", async () => {
    const conn = await Base.leaseConnection();
    let cache = conn.internalSchemaCache;
    const c1 = await cache.columns(conn.pool, "posts");
    expect(cache.size).not.toBe(0);

    Base.clearCacheBang();
    cache = conn.internalSchemaCache;
    expect(cache.size).toBe(0);

    const c2 = await cache.columns(conn.pool, "posts");
    expect(cache.size).not.toBe(0);
    expect(c2!.map((column, i) => column.equals(c1![i]))).toEqual(new Array(c1!.length).fill(true));

    await cache.addAll(conn.pool);
  });

  it("has attribute", async () => {
    await Company.loadSchema();
    assert(Company.hasAttribute("id"));
    assert(Company.hasAttribute("type"));
    assert(Company.hasAttribute("name"));
    assert(Company.hasAttribute("new_name"));
    assert(Company.hasAttribute("metadata"));
    assertNot(Company.hasAttribute("lastname"));
    assertNot(Company.hasAttribute("age"));

    const company = new Company() as any;
    assert(company.hasAttribute("id"));
    assert(company.hasAttribute("type"));
    assert(company.hasAttribute("name"));
    assert(company.hasAttribute("new_name"));
    assert(company.hasAttribute("metadata"));
    assertNot(company.hasAttribute("lastname"));
    assertNot(company.hasAttribute("age"));
  });

  it("has attribute with symbol", async () => {
    await Company.loadSchema();
    assert(Company.hasAttribute("id"));
    assert(Company.hasAttribute("type"));
    assert(Company.hasAttribute("name"));
    assert(Company.hasAttribute("new_name"));
    assert(Company.hasAttribute("metadata"));
    assertNot(Company.hasAttribute("lastname"));
    assertNot(Company.hasAttribute("age"));

    const company = new Company() as any;
    assert(company.hasAttribute("id"));
    assert(company.hasAttribute("type"));
    assert(company.hasAttribute("name"));
    assert(company.hasAttribute("new_name"));
    assert(company.hasAttribute("metadata"));
    assertNot(company.hasAttribute("lastname"));
    assertNot(company.hasAttribute("age"));
  });

  it("attribute names on table not exists", () => {
    expect(NonExistentTable.attributeNames()).toEqual([]);
  });

  it("attribute names on abstract class", () => {
    expect(AbstractCompany.attributeNames()).toEqual([]);
  });

  it("touch should raise error on a new object", async () => {
    const company = new Company({ rating: 1, name: "37signals", firm_name: "37signals" } as any);
    await assertRaises([ActiveRecordError], {}, () => company.touch("updated_at"));
  });

  it("distinct delegates to scoped", () => {
    expect(Bird.distinct().toSql()).toEqual(Bird.all().distinct().toSql());
  });

  it("table name with 2 abstract subclasses", () => {
    expect(Photo.tableName).toBe("photos");
  });

  it("column types typecast", async () => {
    let topic = (await Topic.first()) as any;
    expect(topic.author_name).not.toBe("t.lo");

    const attrs = { ...topic.attributes };
    delete attrs.id;

    class Typecast extends ValueType {
      readonly name = "typecast";
      cast() {
        return "t.lo";
      }
    }

    const types = { author_name: new Typecast() };
    topic = Topic.instantiate(attrs, types);

    expect(topic.author_name).toBe("t.lo");
  });

  it.skipIf(adapterType !== "postgres")("column types on queries on postgresql", async () => {
    const result = await ((await Base.leaseConnection()) as any).execQuery("SELECT 1 AS test");
    expect(result.columnTypes["test"].constructor).toEqual(IntegerType);
  });

  it("typecasting aliases", async () => {
    const topic = await Topic.select("10 as tenderlove").first();
    expect((topic as any).tenderlove).toBe(10);
  });

  it("default values are deeply dupped", () => {
    const company = new Company() as any;
    company.description += "foo";
    expect((new Company() as any).description).toEqual("");
  });

  it("scoped can take a values hash", () => {
    const klass = class extends Base {};
    klass.tableName = "bar";
    expect(klass.all().mergeBang({ select: "foo" }).selectValues).toEqual(["foo"]);
  });

  it("records without an id have unique hashes", () => {
    expect(new Post().hash()).not.toEqual(new Post().hash());
  });

  it("records of different classes have different hashes", () => {
    expect(new Post({ id: 1 } as any).hash()).not.toEqual(new Developer({ id: 1 } as any).hash());
  });

  it("resetting column information doesn't remove attribute methods", async () => {
    const topic = (await topics("first")) as any;

    assertNotPredicate(topic, (t: any) => t.idChanged());

    await Topic.resetColumnInformation();

    assertNotPredicate(topic, (t: any) => t.idChanged());
  });

  it("ignored columns are not present in columns_hash", async () => {
    const conn = await Base.leaseConnection();
    const cacheColumns = await conn.internalSchemaCache.columnsHash(
      conn.pool,
      Developer.tableName!,
    );
    expect(Object.keys(cacheColumns ?? {})).toContain("first_name");
    expect(Object.keys(Developer.columnsHash())).not.toContain("first_name");
    expect(Object.keys(SubDeveloper.columnsHash())).not.toContain("first_name");
    expect(Object.keys(SymbolIgnoredDeveloper.columnsHash())).not.toContain("first_name");
  });

  it(".columns_hash raises an error if the record has an empty table name", async () => {
    const expectedMessage =
      "FirstAbstractClass has no table configured. Set one with FirstAbstractClass.table_name=";
    const exception = await assertRaises([TableNotSpecified], {}, () =>
      FirstAbstractClass.columnsHash(),
    );
    expect(exception.message).toEqual(expectedMessage);
  });

  it("ignored columns have no attribute methods", () => {
    assertNotRespondTo(new Developer(), "first_name");
    assertNotRespondTo(new Developer(), "first_name=");
    assertNotRespondTo(new Developer(), "first_name?");
    assertNotRespondTo(new SubDeveloper(), "first_name");
    assertNotRespondTo(new SubDeveloper(), "first_name=");
    assertNotRespondTo(new SubDeveloper(), "first_name?");
    assertNotRespondTo(new SymbolIgnoredDeveloper(), "first_name");
    assertNotRespondTo(new SymbolIgnoredDeveloper(), "first_name=");
    assertNotRespondTo(new SymbolIgnoredDeveloper(), "first_name?");
  });

  it("ignored columns don't prevent explicit declaration of attribute methods", () => {
    assertRespondTo(new Developer(), "last_name");
    assertRespondTo(new Developer(), "last_name=");
    assertRespondTo(new Developer(), "last_name?");
    assertRespondTo(new SubDeveloper(), "last_name");
    assertRespondTo(new SubDeveloper(), "last_name=");
    assertRespondTo(new SubDeveloper(), "last_name?");
    assertRespondTo(new SymbolIgnoredDeveloper(), "last_name");
    assertRespondTo(new SymbolIgnoredDeveloper(), "last_name=");
    assertRespondTo(new SymbolIgnoredDeveloper(), "last_name?");
  });

  it("ignored columns are stored as an array of string", () => {
    expect(Developer.ignoredColumns).toEqual(["first_name", "last_name"]);
    expect(SymbolIgnoredDeveloper.ignoredColumns).toEqual(["first_name", "last_name"]);
  });

  it("when #reload called, ignored columns' attribute methods are not defined", async () => {
    const developer = await Developer.createBang({ name: "Developer" });
    assertNotRespondTo(developer, "first_name");
    assertNotRespondTo(developer, "first_name=");

    await developer.reload();

    assertNotRespondTo(developer, "first_name");
    assertNotRespondTo(developer, "first_name=");
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
    expect(ColumnNamesCachedDeveloper.columnNames()).not.toContain("name");
  });

  it("ignored columns not included in SELECT", () => {
    const query = Developer.all().toSql().toLowerCase();

    assertNot(query.includes("first_name"));

    assert(query.includes("name"));
  });

  it("column names are quoted when using #from clause and model has ignored columns", () => {
    assertNotEmpty(Developer.ignoredColumns);
    const query = Developer.from("developers").toSql();
    const quotedId = `${Developer.quotedTableName()}.${Developer.quotedPrimaryKey()}`;

    expect(query).toMatch(
      new RegExp(`SELECT ${quotedId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}.* FROM developers`),
    );
  });

  it("using table name qualified column names unless having SELECT list explicitly", async () => {
    expect(await Developer.from("developers").joins(":sharedComputers").take()).toEqual(
      await developers("david"),
    );
  });

  it("protected environments by default is an array with production", () => {
    expect(Base.protectedEnvironments).toEqual(["production"]);
  });

  it("protected environments are stored as an array of string", () => {
    const previousProtectedEnvironments = Base.protectedEnvironments;
    try {
      Base.protectedEnvironments = ["staging", "production"];
      expect(Base.protectedEnvironments).toEqual(["staging", "production"]);
    } finally {
      Base.protectedEnvironments = previousProtectedEnvironments;
    }
  });

  it("#present? and #blank? on ActiveRecord::Base classes", async () => {
    const { isPresent, isBlank } = await import("@blazetrails/activesupport");
    assertNotEmpty(await Topic.all());
    await assertNoQueries(false, () => {
      assertPredicate(Topic, (t) => isPresent(t));
      assertNot(isBlank(Topic));
    });

    await Topic.deleteAll();
    await assertNoQueries(false, () => {
      assertPredicate(Topic, (t) => isPresent(t));
      assertNot(isBlank(Topic));
    });
  });

  it("cannot call connects_to on non-abstract or non-ActiveRecord::Base classes", async () => {
    const error = await assertRaises([NotImplementedError], {}, () =>
      Bird.connectsTo({ database: { writing: ":arunit" } }),
    );

    expect(error.message).toEqual(
      "`connects_to` can only be called on ActiveRecord::Base or abstract classes",
    );
  });

  it("cannot call connected_to with role and shard on non-abstract classes", async () => {
    const error = await assertRaises([NotImplementedError], {}, () =>
      Bird.connectedTo({ role: "reading", shard: "default" }, () => {}),
    );

    expect(error.message).toEqual(
      "calling `connected_to` is only allowed on ActiveRecord::Base or abstract classes.",
    );
  });

  it("can call connected_to with role and shard on abstract classes", () => {
    SecondAbstractClass.connectedTo({ role: "reading", shard: "default" }, () => {
      assert(SecondAbstractClass.isConnectedTo({ role: "reading", shard: "default" }));
    });
  });

  it("cannot call connected_to on the abstract class that did not establish the connection", async () => {
    const error = await assertRaises([NotImplementedError], {}, () =>
      ThirdAbstractClass.connectedTo({ role: "reading" }, () => {}),
    );

    expect(error.message).toEqual(
      "calling `connected_to` is only allowed on the abstract class that established the connection.",
    );
  });

  it("#connecting_to with role", () => {
    try {
      SecondAbstractClass.connectingTo({ role: "reading" });

      assert(SecondAbstractClass.isConnectedTo({ role: "reading" }));
      assert(SecondAbstractClass.currentPreventingWrites());
    } finally {
      connectedToStack().pop();
    }
  });

  it("#connecting_to with role and shard", () => {
    try {
      SecondAbstractClass.connectingTo({ role: "reading", shard: "default" });

      assert(SecondAbstractClass.isConnectedTo({ role: "reading", shard: "default" }));
    } finally {
      connectedToStack().pop();
    }
  });

  it("#connecting_to with prevent_writes", () => {
    try {
      SecondAbstractClass.connectingTo({ role: "writing", preventWrites: true });

      assert(SecondAbstractClass.isConnectedTo({ role: "writing" }));
      assert(SecondAbstractClass.currentPreventingWrites());
    } finally {
      connectedToStack().pop();
    }
  });

  it("#connected_to_many cannot be called on anything but ActiveRecord::Base", () => {
    expect(() =>
      SecondAbstractClass.connectedToMany([SecondAbstractClass], { role: "writing" }, () => {}),
    ).toThrow(NotImplementedError);
  });

  it("#connected_to_many cannot be called with classes that include ActiveRecord::Base", () => {
    expect(() => Base.connectedToMany([Base], { role: "writing" }, () => {})).toThrow(
      NotImplementedError,
    );
  });

  it("#connected_to_many sets prevent_writes if role is reading", () => {
    Base.connectedToMany([SecondAbstractClass], { role: "reading" }, () => {
      assert(SecondAbstractClass.currentPreventingWrites());
      assertNot(Base.currentPreventingWrites());
    });
  });

  it("#connected_to_many with a single argument for classes", () => {
    Base.connectedToMany(SecondAbstractClass, { role: "reading" }, () => {
      assert(SecondAbstractClass.currentPreventingWrites());
      assertNot(Base.currentPreventingWrites());
    });
  });

  it("#connected_to_many with a multiple classes without brackets works", () => {
    Base.connectedToMany(FirstAbstractClass, SecondAbstractClass, { role: "reading" }, () => {
      assert(FirstAbstractClass.currentPreventingWrites());
      assert(SecondAbstractClass.currentPreventingWrites());
      assertNot(Base.currentPreventingWrites());
    });
  });
});

describe("BasicsTest", () => {
  const cleanupConnections: Array<() => unknown> = [];
  afterEach(async () => {
    while (cleanupConnections.length > 0) await cleanupConnections.pop()!();
  });

  it.skipIf(inMemoryDb())("connection in local time", async () => {
    await withTimezoneConfig({ default: "utc" }, async () => {
      const newConfig = {
        ...Base.connectionDbConfig().configurationHash,
        defaultTimezone: "local",
      };
      await Base.establishConnection(newConfig as Parameters<typeof Base.establishConnection>[0]);
      cleanupConnections.push(async () => {
        await Base.establishConnection(":arunit");
        await Default.resetColumnInformation();
      });
      await Default.resetColumnInformation();
      await Default.loadSchema();

      const defaultRecord = new Default() as any;

      expect(defaultRecord.fixed_date).toEqual(Temporal.PlainDate.from("2004-01-01"));
      expect(defaultRecord.fixed_time).toEqual(RubyTime.local(2004, 1, 1, 0, 0, 0, 0));

      if (adapterType === "postgres") {
        expect(defaultRecord.fixed_time_with_time_zone).toEqual(
          RubyTime.utc(2004, 1, 1, 0, 0, 0, 0),
        );
      }
    });
  });

  it.skipIf(inMemoryDb())("connection in utc time", async () => {
    await withTimezoneConfig({ default: "local" }, async () => {
      const newConfig = {
        ...Base.connectionDbConfig().configurationHash,
        defaultTimezone: "utc",
      };
      await Base.establishConnection(newConfig as Parameters<typeof Base.establishConnection>[0]);
      cleanupConnections.push(async () => {
        await Base.establishConnection(":arunit");
        await Default.resetColumnInformation();
      });
      await Default.resetColumnInformation();
      await Default.loadSchema();

      const defaultRecord = new Default() as any;

      expect(defaultRecord.fixed_date).toEqual(Temporal.PlainDate.from("2004-01-01"));
      expect(defaultRecord.fixed_time).toEqual(RubyTime.utc(2004, 1, 1, 0, 0, 0, 0));

      if (adapterType === "postgres") {
        expect(defaultRecord.fixed_time_with_time_zone).toEqual(
          RubyTime.utc(2004, 1, 1, 0, 0, 0, 0),
        );
      }
    });
  });
});

afterAll(() => {
  vi.unstubAllEnvs();
});
