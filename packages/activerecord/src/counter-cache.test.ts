/**
 * Tests to increase Rails test coverage matching.
 * Test names are chosen to match Ruby test names from the Rails test suite.
 *
 * Ported from vendor/rails/activerecord/test/cases/counter_cache_test.rb.
 */
import { Temporal } from "@blazetrails/activesupport/temporal";
import { describe, it, expect, beforeEach } from "vitest";
import { registerModel, registerSubclass } from "./index.js";
import { association } from "./associations.js";
import { Topic } from "./test-helpers/models/topic.js";
import { Reply, UniqueReply, SillyUniqueReply, SillyReply } from "./test-helpers/models/reply.js";
import { Car } from "./test-helpers/models/car.js";
import { Engine } from "./test-helpers/models/engine.js";
import { Wheel } from "./test-helpers/models/wheel.js";
import { Aircraft } from "./test-helpers/models/aircraft.js";
import { Tyre } from "./test-helpers/models/tyre.js";
import { Bulb, CustomBulb, FunkyBulb, FailedBulb } from "./test-helpers/models/bulb.js";
import { Person } from "./test-helpers/models/person.js";
import { Dog } from "./test-helpers/models/dog.js";
import { DogLover } from "./test-helpers/models/dog-lover.js";
import { Friendship } from "./test-helpers/models/friendship.js";
import { Subscriber } from "./test-helpers/models/subscriber.js";
import { Subscription } from "./test-helpers/models/subscription.js";
import { Book } from "./test-helpers/models/book.js";
import { Category } from "./test-helpers/models/category.js";
import { Categorization } from "./test-helpers/models/categorization.js";
import { CpkOrder, CpkBook } from "./test-helpers/models/cpk.js";
import { fixtures } from "./test-helpers/fixtures.js";
import { TEST_SCHEMA as canonicalSchema } from "./test-helpers/test-schema.js";
import { assertQueriesCount } from "./testing/query-assertions.js";

// Register the canonical models used directly and via through/dependent
// associations so the reflection registry can resolve them by class name.
for (const model of [
  Topic,
  Reply,
  UniqueReply,
  SillyUniqueReply,
  SillyReply,
  Car,
  Engine,
  Wheel,
  Aircraft,
  Tyre,
  Bulb,
  CustomBulb,
  FunkyBulb,
  FailedBulb,
  Person,
  Dog,
  DogLover,
  Friendship,
  Subscriber,
  Subscription,
  Book,
  Category,
  Categorization,
  CpkOrder,
  CpkBook,
]) {
  registerModel(model);
}

// Rails defines these as ::SpecialTopic < ::Topic and ::SpecialReply < ::Reply
// inside CounterCacheTest. They share the STI `topics` table.
export class SpecialTopic extends Topic {
  static {
    this.hasMany("specialReplies", { className: "SpecialReply", foreignKey: "parent_id" });
    this.hasMany("lightweightSpecialReplies", {
      scope: (q: any) => q.select("topics.id", "topics.title"),
      className: "SpecialReply",
      foreignKey: "parent_id",
    });
  }
}

export class SpecialReply extends Reply {
  static {
    this.belongsTo("specialTopic", {
      foreignKey: "parent_id",
      counterCache: "replies_count",
    });
  }
}

for (const klass of [SpecialTopic, SpecialReply]) {
  registerSubclass(klass);
  registerModel(klass);
}

function epochMs(v: unknown): number {
  if (v instanceof Temporal.Instant) return v.epochMilliseconds;
  if (v instanceof Temporal.PlainDateTime) {
    return v.toZonedDateTime("UTC").toInstant().epochMilliseconds;
  }
  return Number(new Date(String(v)));
}

/** Mirrors Rails' minitest `assert_difference`. */
async function assertDifference(
  reads: Array<() => Promise<number>>,
  delta: number,
  block: () => Promise<void>,
): Promise<void> {
  const before = await Promise.all(reads.map((r) => r()));
  await block();
  const after = await Promise.all(reads.map((r) => r()));
  after.forEach((a, i) => expect(a - before[i]).toBe(delta));
}

/** Mirrors the private `assert_touching` helper in counter_cache_test.rb. */
async function assertTouching(
  record: any,
  attributes: string[],
  block: () => Promise<void>,
): Promise<void> {
  const fiveMinutesAgo = Temporal.Now.instant().subtract({ hours: 0, minutes: 5 });
  const stale: Record<string, unknown> = {};
  for (const attr of attributes) stale[attr] = fiveMinutesAgo;
  await record.updateColumns(stale);
  const touchTimes: Record<string, number> = {};
  for (const attr of attributes) touchTimes[attr] = epochMs(record[attr]);

  await block();

  await record.reload();
  for (const attr of attributes) {
    expect(epochMs(record[attr])).toBeGreaterThan(touchTimes[attr]);
  }
}

const { topics, categories, cars, dogLovers, people, subscribers } = fixtures(
  [
    "topics",
    "categories",
    "categorizations",
    "cars",
    "dogs",
    "dogLovers",
    "people",
    "friendships",
    "subscribers",
    "subscriptions",
    "books",
    "cpkOrders",
    "cpkBooks",
  ],
  { schema: canonicalSchema },
);

describe("CounterCacheTest", () => {
  let topic: Topic;

  beforeEach(async () => {
    topic = await Topic.find(1);
  });

  const reloadRepliesCount = async () => {
    await topic.reload();
    return topic.replies_count as number;
  };
  const reloadUniqueRepliesCount = async () => {
    await topic.reload();
    return topic.unique_replies_count as number;
  };

  it("increment counter", async () => {
    await assertDifference([reloadRepliesCount], 1, async () => {
      await Topic.incrementCounter("replies_count", topic.id);
    });
  });

  it("increment counter by specific amount", async () => {
    await assertDifference([reloadRepliesCount], 2, async () => {
      await Topic.incrementCounter("replies_count", topic.id, 2);
    });
  });

  it("increment counter for cpk model", async () => {
    const order = (await CpkOrder.first()) as CpkOrder;
    await assertDifference(
      [
        async () => {
          await order.reload();
          return order.books_count as number;
        },
      ],
      1,
      async () => {
        await CpkOrder.incrementCounter("books_count", order.id);
      },
    );
  });

  it("increment counter for multiple cpk model records", async () => {
    const [order1, order2] = await CpkOrder.first(2);
    await assertDifference(
      [
        async () => {
          await order1.reload();
          return order1.books_count as number;
        },
        async () => {
          await order2.reload();
          return order2.books_count as number;
        },
      ],
      1,
      async () => {
        await CpkOrder.incrementCounter("books_count", [order1.id, order2.id]);
      },
    );
  });

  it("decrement counter", async () => {
    await assertDifference([reloadRepliesCount], -1, async () => {
      await Topic.decrementCounter("replies_count", topic.id);
    });
  });

  it("decrement counter by specific amount", async () => {
    await assertDifference([reloadRepliesCount], -2, async () => {
      await Topic.decrementCounter("replies_count", topic.id, 2);
    });
  });

  it("decrement counter for cpk model", async () => {
    const order = (await CpkOrder.first()) as CpkOrder;
    await assertDifference(
      [
        async () => {
          await order.reload();
          return order.books_count as number;
        },
      ],
      -1,
      async () => {
        await CpkOrder.decrementCounter("books_count", order.id);
      },
    );
  });

  it("reset counters", async () => {
    // throw the count off by 1
    await Topic.incrementCounter("replies_count", topic.id);

    // check that it gets reset
    await assertDifference([reloadRepliesCount], -1, async () => {
      await Topic.resetCounters(topic.id, "replies");
    });
  });

  it("reset counters by counter name", async () => {
    // throw the count off by 1
    await Topic.incrementCounter("replies_count", topic.id);

    // check that it gets reset
    await assertDifference([reloadRepliesCount], -1, async () => {
      await Topic.resetCounters(topic.id, "replies_count");
    });
  });

  it("reset multiple counters", async () => {
    await Topic.updateCounters(topic.id, { replies_count: 1, unique_replies_count: 1 });
    await assertDifference([reloadRepliesCount, reloadUniqueRepliesCount], -1, async () => {
      await Topic.resetCounters(topic.id, "replies", "uniqueReplies");
    });
  });

  it("reset counters with string argument", async () => {
    await Topic.incrementCounter("replies_count", topic.id);

    await assertDifference([reloadRepliesCount], -1, async () => {
      await Topic.resetCounters(topic.id, "replies");
    });
  });

  it("reset counters with modularized and camelized classnames", async () => {
    const special = await SpecialTopic.create({ title: "Special" });
    await SpecialTopic.incrementCounter("replies_count", special.id);

    await assertDifference(
      [
        async () => {
          await special.reload();
          return special.replies_count as number;
        },
      ],
      -1,
      async () => {
        await SpecialTopic.resetCounters(special.id, "specialReplies");
      },
    );
  });

  it("reset counter with belongs_to which has class_name", async () => {
    const car = cars("honda");
    let error: unknown;
    try {
      await Car.resetCounters(car.id, "engines");
    } catch (e) {
      error = e;
    }
    expect(error).toBeUndefined();
    try {
      await Car.resetCounters(car.id, "wheels");
    } catch (e) {
      error = e;
    }
    expect(error).toBeUndefined();
  });

  it("reset the right counter if two have the same class_name", async () => {
    const david = dogLovers("david");

    await DogLover.incrementCounter("bred_dogs_count", david.id);
    await DogLover.incrementCounter("trained_dogs_count", david.id);

    await assertDifference(
      [
        async () => {
          await david.reload();
          return david.bred_dogs_count as number;
        },
      ],
      -1,
      async () => {
        await DogLover.resetCounters(david.id, "bredDogs");
      },
    );
    await assertDifference(
      [
        async () => {
          await david.reload();
          return david.trained_dogs_count as number;
        },
      ],
      -1,
      async () => {
        await DogLover.resetCounters(david.id, "trainedDogs");
      },
    );
  });

  it("reset counter skips query for correct counter", async () => {
    await Topic.resetCounters(topic.id, "replies_count");

    // SELECT "topics".* FROM "topics" WHERE "topics"."id" = ? LIMIT ?
    // SELECT COUNT(*) FROM "topics" WHERE "topics"."type" IN (?, ?, ?, ?, ?) AND "topics"."parent_id" = ?
    await assertQueriesCount(2, false, async () => {
      await Topic.resetCounters(topic.id, "replies_count");
    });
  });

  it("reset counter performs query for correct counter with touch: true", async () => {
    await Topic.resetCounters(topic.id, "replies_count");

    // SELECT "topics".* FROM "topics" WHERE "topics"."id" = ? LIMIT ?
    // SELECT COUNT(*) FROM "topics" WHERE "topics"."type" IN (?, ?, ?, ?, ?) AND "topics"."parent_id" = ?
    // UPDATE "topics" SET "updated_at" = ? WHERE "topics"."id" = ?
    await assertQueriesCount(3, false, async () => {
      await Topic.resetCounters(topic.id, "replies_count", { touch: true });
    });
  });

  it("reset counters for cpk model", async () => {
    const order = (await CpkOrder.first()) as CpkOrder;
    // throw the count off by 1
    await CpkOrder.incrementCounter("books_count", order.id);

    // check that it gets reset
    await assertDifference(
      [
        async () => {
          await order.reload();
          return order.books_count as number;
        },
      ],
      -1,
      async () => {
        await CpkOrder.resetCounters(order.id, "books");
      },
    );
  });

  it("update counter with initial null value", async () => {
    const category = categories("general");
    expect(await (category as any).categorizations.count()).toBe(2);
    expect((category as any).categorizations_count).toBeNull();

    await Category.updateCounters(category.id, {
      categorizations_count: await (category as any).categorizations.count(),
    });
    await category.reload();
    expect((category as any).categorizations_count).toBe(2);
  });

  it("update counter for decrement", async () => {
    await assertDifference([reloadRepliesCount], -3, async () => {
      await Topic.updateCounters(topic.id, { replies_count: -3 });
    });
  });

  it("update counters of multiple records", async () => {
    const t1 = topics("first");
    const t2 = topics("second");

    await assertDifference(
      [
        async () => {
          await t1.reload();
          return t1.replies_count as number;
        },
        async () => {
          await t2.reload();
          return t2.replies_count as number;
        },
      ],
      2,
      async () => {
        await Topic.updateCounters([t1.id, t2.id], { replies_count: 2 });
      },
    );
  });

  it("update multiple counters", async () => {
    await assertDifference([reloadRepliesCount, reloadUniqueRepliesCount], 2, async () => {
      await Topic.updateCounters(topic.id, { replies_count: 2, unique_replies_count: 2 });
    });
  });

  it("update counter for decrement for cpk model", async () => {
    const order = (await CpkOrder.first()) as CpkOrder;
    await assertDifference(
      [
        async () => {
          await order.reload();
          return order.books_count as number;
        },
      ],
      -3,
      async () => {
        await CpkOrder.updateCounters(order.id, { books_count: -3 });
      },
    );
  });

  it("update other counters on parent destroy", async () => {
    const david = dogLovers("david");
    const joanna = dogLovers("joanna");

    await assertDifference(
      [
        async () => {
          await joanna.reload();
          return joanna.dogs_count as number;
        },
      ],
      -1,
      async () => {
        await david.destroy();
      },
    );
  });

  it("reset the right counter if two have the same foreign key", async () => {
    const michael = people("michael");
    let error: unknown;
    try {
      await Person.resetCounters(michael.id, "friendsToo");
    } catch (e) {
      error = e;
    }
    expect(error).toBeUndefined();
  });

  it("reset counter of has_many :through association", async () => {
    const subscriber = subscribers("second");
    await Subscriber.resetCounters(subscriber.id, "books");
    await Subscriber.incrementCounter("books_count", subscriber.id);

    await assertDifference(
      [
        async () => {
          await subscriber.reload();
          return subscriber.books_count;
        },
      ],
      -1,
      async () => {
        await Subscriber.resetCounters(subscriber.id, "books");
      },
    );
  });

  it("the passed symbol needs to be an association name or counter name", async () => {
    let message = "";
    try {
      await Topic.resetCounters(topic.id, "undefined_count");
    } catch (e) {
      message = (e as Error).message;
    }
    expect(message).toBe("'Topic' has no association called 'undefined_count'");
  });

  it("reset counter works with select declared on association", async () => {
    const special = await SpecialTopic.create({ title: "Special" });
    await SpecialTopic.incrementCounter("replies_count", special.id);

    await assertDifference(
      [
        async () => {
          await special.reload();
          return special.replies_count as number;
        },
      ],
      -1,
      async () => {
        await SpecialTopic.resetCounters(special.id, "lightweightSpecialReplies");
      },
    );
  });

  it("counters are updated both in memory and in the database on create", async () => {
    const car = new Car({ engines_count: 0 });
    await association(car, "engines").replace([new Engine(), new Engine()]);
    await car.save();

    expect(car.engines_count).toBe(2);
    await car.reload();
    expect(car.engines_count).toBe(2);
  });

  it("counter caches are updated in memory when the default value is nil", async () => {
    const car = new Car({ engines_count: null });
    await association(car, "engines").replace([new Engine(), new Engine()]);
    await car.save();

    expect(car.engines_count).toBe(2);
    await car.reload();
    expect(car.engines_count).toBe(2);
  });

  it("update counters in a polymorphic relationship", async () => {
    const aircraft = await Aircraft.create();

    await assertDifference(
      [
        async () => {
          await aircraft.reload();
          return aircraft.wheels_count as number;
        },
      ],
      1,
      async () => {
        await (aircraft as any).wheels.push(await Wheel.create());
      },
    );

    await assertDifference(
      [
        async () => {
          await aircraft.reload();
          return aircraft.wheels_count as number;
        },
      ],
      -1,
      async () => {
        const first = await (aircraft as any).wheels.first();
        await first.destroy();
      },
    );
  });

  it("removing association updates counter", async () => {
    const michael = people("michael");
    const car = cars("honda");

    await assertDifference(
      [
        async () => {
          await michael.reload();
          return michael.cars_count as number;
        },
      ],
      -1,
      async () => {
        await car.destroy();
      },
    );
  });

  it("update counters doesn't touch timestamps by default", async () => {
    await topic.updateColumn("updated_at", Temporal.Now.instant().subtract({ minutes: 5 }));
    const previouslyUpdatedAt = topic.updated_at;

    await Topic.updateCounters(topic.id, { replies_count: -1 });

    expect(epochMs(topic.updated_at)).toBe(epochMs(previouslyUpdatedAt));
  });

  it("update counters doesn't touch timestamps with touch: []", async () => {
    await topic.updateColumn("updated_at", Temporal.Now.instant().subtract({ minutes: 5 }));
    const previouslyUpdatedAt = topic.updated_at;

    await Topic.updateCounters(topic.id, { replies_count: -1 }, { touch: [] as string[] });

    expect(epochMs(topic.updated_at)).toBe(epochMs(previouslyUpdatedAt));
  });

  it("update counters with touch: true", async () => {
    await assertTouching(topic, ["updated_at"], async () => {
      await Topic.updateCounters(topic.id, { replies_count: -1 }, { touch: true });
    });
  });

  it("update counters of multiple records with touch: true", async () => {
    const t1 = topics("first");
    const t2 = topics("second");

    await assertTouching(t1, ["updated_at"], async () => {
      await assertDifference(
        [
          async () => {
            await t1.reload();
            return t1.replies_count as number;
          },
          async () => {
            await t2.reload();
            return t2.replies_count as number;
          },
        ],
        2,
        async () => {
          await Topic.updateCounters([t1.id, t2.id], { replies_count: 2 }, { touch: true });
        },
      );
    });
  });

  it("update multiple counters with touch: true", async () => {
    await assertTouching(topic, ["updated_at"], async () => {
      await Topic.updateCounters(
        topic.id,
        { replies_count: 2, unique_replies_count: 2 },
        { touch: true },
      );
    });
  });

  it("reset counters with touch: true", async () => {
    await assertTouching(topic, ["updated_at"], async () => {
      await Topic.resetCounters(topic.id, "replies", { touch: true });
    });
  });

  it("reset multiple counters with touch: true", async () => {
    await assertTouching(topic, ["updated_at"], async () => {
      await Topic.updateCounters(topic.id, { replies_count: 1, unique_replies_count: 1 });
      await Topic.resetCounters(topic.id, "replies", "uniqueReplies", {
        touch: { time: Temporal.Now.instant() },
      });
    });
  });

  it("increment counters with touch: true", async () => {
    await assertTouching(topic, ["updated_at"], async () => {
      await Topic.incrementCounter("replies_count", topic.id, 1, { touch: true });
    });
  });

  it("decrement counters with touch: true", async () => {
    await assertTouching(topic, ["updated_at"], async () => {
      await Topic.decrementCounter("replies_count", topic.id, 1, { touch: true });
    });
  });

  it("update counters with touch: :written_on", async () => {
    await assertTouching(topic, ["updated_at", "written_on"], async () => {
      await Topic.updateCounters(topic.id, { replies_count: -1 }, { touch: "written_on" });
    });
  });

  it("update multiple counters with touch: :written_on", async () => {
    await assertTouching(topic, ["updated_at", "written_on"], async () => {
      await Topic.updateCounters(
        topic.id,
        { replies_count: 2, unique_replies_count: 2 },
        { touch: "written_on" },
      );
    });
  });

  it("reset counters with touch: :written_on", async () => {
    await assertTouching(topic, ["updated_at", "written_on"], async () => {
      await Topic.resetCounters(topic.id, "replies", { touch: "written_on" });
    });
  });

  it("reset multiple counters with touch: :written_on", async () => {
    await assertTouching(topic, ["updated_at", "written_on"], async () => {
      await Topic.updateCounters(topic.id, { replies_count: 1, unique_replies_count: 1 });
      await Topic.resetCounters(topic.id, "replies", "uniqueReplies", { touch: "written_on" });
    });
  });

  it("increment counters with touch: :written_on", async () => {
    await assertTouching(topic, ["updated_at", "written_on"], async () => {
      await Topic.incrementCounter("replies_count", topic.id, 1, { touch: "written_on" });
    });
  });

  it("decrement counters with touch: :written_on", async () => {
    await assertTouching(topic, ["updated_at", "written_on"], async () => {
      await Topic.decrementCounter("replies_count", topic.id, 1, { touch: "written_on" });
    });
  });

  it("update counters with touch: %i( updated_at written_on )", async () => {
    await assertTouching(topic, ["updated_at", "written_on"], async () => {
      await Topic.updateCounters(
        topic.id,
        { replies_count: -1 },
        { touch: ["updated_at", "written_on"] },
      );
    });
  });

  it("update multiple counters with touch: %i( updated_at written_on )", async () => {
    await assertTouching(topic, ["updated_at", "written_on"], async () => {
      await Topic.updateCounters(
        topic.id,
        { replies_count: 2, unique_replies_count: 2 },
        { touch: ["updated_at", "written_on"] },
      );
    });
  });

  it("reset counters with touch: %i( updated_at written_on )", async () => {
    await assertTouching(topic, ["updated_at", "written_on"], async () => {
      await Topic.resetCounters(topic.id, "replies", { touch: ["updated_at", "written_on"] });
    });
  });

  it("reset multiple counters with touch: %i( updated_at written_on )", async () => {
    await assertTouching(topic, ["updated_at", "written_on"], async () => {
      await Topic.updateCounters(topic.id, { replies_count: 1, unique_replies_count: 1 });
      await Topic.resetCounters(topic.id, "replies", "uniqueReplies", {
        touch: ["updated_at", "written_on"],
      });
    });
  });

  it("increment counters with touch: %i( updated_at written_on )", async () => {
    await assertTouching(topic, ["updated_at", "written_on"], async () => {
      await Topic.incrementCounter("replies_count", topic.id, 1, {
        touch: ["updated_at", "written_on"],
      });
    });
  });

  it("decrement counters with touch: %i( updated_at written_on )", async () => {
    await assertTouching(topic, ["updated_at", "written_on"], async () => {
      await Topic.decrementCounter("replies_count", topic.id, 1, {
        touch: ["updated_at", "written_on"],
      });
    });
  });

  it("counter_cache_column?", () => {
    expect(Person.isCounterCacheColumn("cars_count")).toBe(true);
    expect(Car.isCounterCacheColumn("cars_count")).toBe(false);
  });

  it("inactive counter cache", async () => {
    const car = new Car();
    await association(car, "bulbs").replace([new Bulb(), new Bulb()]);
    await car.save();

    expect(car.bulbs_count).toBe(2);
    await car.reload();

    await assertQueriesCount(5, false, async () => {
      expect(await (car as any).bulbs.size()).toBe(2);
      expect(await (car as any).bulbs.count()).toBe(2);
      expect(await (car as any).bulbs.isEmpty()).toBe(false);
      expect(await (car as any).bulbs.any()).toBe(true);
      expect(await (car as any).bulbs.isNone()).toBe(false);
    });
  });

  it("active counter cache", async () => {
    const car = new Car();
    await association(car, "tyres").replace([new Tyre(), new Tyre()]);
    await car.save();

    expect(car.custom_tyres_count).toBe(2);
    await car.reload();

    await assertQueriesCount(0, false, async () => {
      expect(await (car as any).tyres.size()).toBe(2);
      expect(await (car as any).tyres.isEmpty()).toBe(false);
      expect(await (car as any).tyres.any()).toBe(true);
      expect(await (car as any).tyres.isNone()).toBe(false);
    });

    await assertQueriesCount(1, false, async () => {
      expect(await (car as any).tyres.count()).toBe(2);
    });
  });
});
