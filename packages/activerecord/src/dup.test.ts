import { describe, it, expect, beforeAll } from "vitest";
import { Base, registerModel } from "./index.js";
import { fixtures } from "./test-fixtures.js";
import { repairValidations } from "./cases/validations-repair-helper.js";
import { clearTimestampAttributes } from "./timestamp.js";
import { DefaultScope } from "./scoping/default.js";
import type { Relation } from "./relation.js";
import { RecordInvalid } from "./validations.js";
import { Topic } from "./test-helpers/models/topic.js";
import { Reply, SillyReply, UniqueReply, SillyUniqueReply } from "./test-helpers/models/reply.js";
import { Car } from "./test-helpers/models/car.js";
import { Movie } from "./test-helpers/models/movie.js";

for (const klass of [Topic, Reply, SillyReply, UniqueReply, SillyUniqueReply]) {
  registerModel(klass);
}

describe("DupTest", () => {
  fixtures(["topics", "cars"]);

  beforeAll(async () => {
    registerModel("Car", Car);
    void Car.resetColumnInformation();
    await Car.loadSchema();
  });

  it("dup", () => {
    const topic = new Topic({});
    topic.freeze();
    expect(topic.dup().isFrozen()).toBe(false);
  });

  it("not readonly", async () => {
    const topic = await Topic.first();
    const duped = topic!.dup();
    expect(duped.isReadonly()).toBe(false);
  });

  it("is readonly", async () => {
    const topic = await Topic.first();
    topic!.readonlyBang();
    const duped = topic!.dup();
    expect(duped.isReadonly()).toBe(true);
  });

  it("dup not persisted", async () => {
    const topic = await Topic.first();
    const duped = topic!.dup();
    expect(duped.isPersisted()).toBe(false);
    expect(duped.isNewRecord()).toBe(true);
  });

  it("dup not previously new record", async () => {
    const topic = await Topic.first();
    const duped = topic!.dup();
    expect(duped.isPreviouslyNewRecord()).toBe(false);
  });

  it("dup not destroyed", async () => {
    const topic = await Topic.first();
    await topic!.destroy();
    const duped = topic!.dup();
    expect(duped.isDestroyed()).toBe(false);
  });

  it("dup has no id", async () => {
    const topic = await Topic.first();
    const duped = topic!.dup();
    expect(duped.id).toBeNull();
  });

  it("dup with modified attributes", async () => {
    const topic = await Topic.first();
    topic!.author_name = "Aaron";
    const duped = topic!.dup();
    expect(duped.author_name).toBe("Aaron");
  });

  it("dup with changes", async () => {
    const dbtopic = await Topic.first();
    const topic = new Topic({});

    const attrs = { ...dbtopic!.attributes } as Record<string, unknown>;
    delete attrs.id;
    await topic.assignAttributes(attrs);

    const duped = dbtopic!.dup();

    clearTimestampAttributes.call(
      topic as unknown as ThisParameterType<typeof clearTimestampAttributes>,
    );

    expect(topic.changes).toEqual(duped.changes);
  });

  it("dup topics are independent", async () => {
    const topic = await Topic.first();
    topic!.author_name = "Aaron";
    const duped = topic!.dup();

    duped.author_name = "meow";

    expect(topic!.changes).not.toEqual(duped.changes);
  });

  it("dup attributes are independent", async () => {
    const topic = await Topic.first();
    const duped = topic!.dup();

    duped.author_name = "meow";
    topic!.author_name = "Aaron";

    expect(topic!.author_name).toBe("Aaron");
    expect(duped.author_name).toBe("meow");
  });

  it("dup timestamps are cleared", async () => {
    const topic = await Topic.first();
    expect(topic!.updated_at).not.toBeNull();
    expect(topic!.created_at).not.toBeNull();

    const newTopic = topic!.dup();
    expect(newTopic.updated_at).toBeNull();
    expect(newTopic.created_at).toBeNull();

    await newTopic.save();
    expect(newTopic.updated_at).not.toBeNull();
    expect(newTopic.created_at).not.toBeNull();
  });

  it("dup locking column is cleared", async () => {
    const car = await Car.first();
    await car!.touch();
    expect(car!.lock_version).not.toBe(0);

    car!.lock_version = 1000;

    const newCar = car!.dup();
    expect(newCar.lock_version).toBe(0);
  });

  it("dup locking column is not dirty", async () => {
    const car = await Car.first();
    await car!.touch();
    expect(car!.lock_version).not.toBe(0);

    car!.lock_version += 1;
    const newCar = car!.dup();
    expect(newCar.attributeChanged("lock_version")).toBe(false);
  });

  it("dup after initialize callbacks", () => {
    const topic = new Topic({});
    expect(Topic.afterInitializeCalled).toBe(true);
    Topic.afterInitializeCalled = false;
    topic.dup();
    expect(Topic.afterInitializeCalled).toBe(true);
  });

  it("dup runs after_initialize against the duped attributes", async () => {
    const topic = await Topic.find(3);
    expect(topic.author_email_address).toBeFalsy();
    const duped = topic.dup();
    expect(duped.title).toBe(topic.title);
    expect(duped.author_email_address).toBeFalsy();
  });

  it("dup validity is independent", async () => {
    await repairValidations(Topic, async () => {
      Topic.validates("title", { presence: true });
      const topic = new Topic({ title: "Literature" });
      await topic.isValid();

      const duped = topic.dup();
      duped.title = null;
      expect(await duped.isInvalid()).toBe(true);

      topic.title = null;
      duped.title = "Mathematics";
      expect(await topic.isInvalid()).toBe(true);
      expect(await duped.isValid()).toBe(true);
    });
  });

  it("dup with default scope", async () => {
    const prevDefaultScopes = Topic.defaultScopes;
    Topic.defaultScopes = [new DefaultScope((q: Relation<Topic>) => q.where({ approved: true }))];
    try {
      const topic = new Topic({ approved: false });
      expect(topic.dup().approved).toBeFalsy();
    } finally {
      Topic.defaultScopes = prevDefaultScopes;
    }
  });

  it("dup without primary key", async () => {
    class ParrotsPirate extends Base {
      static _tableName = "parrots_pirates";
    }
    const record = await ParrotsPirate.create({});

    let raised = false;
    try {
      record.dup();
    } catch {
      raised = true;
    }
    expect(raised).toBe(false);
  });

  it("dup record not persisted after rollback transaction", async () => {
    const movie = new Movie({ name: "test" });

    let raised = false;
    try {
      await Movie.transaction(async () => {
        await movie.saveBang();
        const duped = movie.dup();
        await duped.assignAttributes({ name: null });
        await duped.saveBang();
      });
    } catch (e) {
      if (e instanceof RecordInvalid) raised = true;
      else throw e;
    }
    expect(raised).toBe(true);
    expect(movie.isPersisted()).toBe(false);
  });
});
