import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from "vitest";
import { Base } from "./index.js";
import { ValueType } from "@blazetrails/activemodel";
import { TimeWithZone, zone as timeZone } from "@blazetrails/activesupport";
import { Temporal, Time as RubyTime } from "@blazetrails/date";

import { itIfSupports } from "./support/supports.js";
import { describeIfPostgresqlAdapter } from "./support/describe-if-postgresql-adapter.js";
import { withTimezoneConfig } from "./test-helper.js";
import { fixtures } from "./test-fixtures.js";

import { Pirate } from "./test-helpers/models/pirate.js";
import { Parrot, LiveParrot } from "./test-helpers/models/parrot.js";
import { Person } from "./test-helpers/models/person.js";
import { Topic } from "./test-helpers/models/topic.js";
import { Aircraft } from "./test-helpers/models/aircraft.js";
import { NumericData } from "./test-helpers/models/numeric-data.js";
import {
  assertNoQueries,
  assertNoQueriesMatch,
  assertQueriesCount,
  assertQueriesMatch,
} from "./testing/query-assertions.js";

async function withPartialWrites(
  klass: typeof Base,
  on: boolean,
  fn: () => Promise<void>,
): Promise<void> {
  const oldInserts = klass.partialInserts;
  const oldUpdates = klass.partialUpdates;
  klass.partialInserts = on;
  klass.partialUpdates = on;
  try {
    await fn();
  } finally {
    klass.partialInserts = oldInserts;
    klass.partialUpdates = oldUpdates;
  }
}

async function withTravel(offsetMs: number, fn: () => Promise<void>): Promise<void> {
  vi.useFakeTimers({ now: Date.now() + offsetMs });
  try {
    await fn();
  } finally {
    vi.useRealTimers();
  }
}

function checkPirateAfterSaveFailure(pirate: Pirate): void {
  expect(pirate.isChanged).toBe(true);
  expect(pirate.attributeChanged("parrot_id")).toBe(true);
  expect(pirate.changedAttributeNamesToSave).toEqual(["parrot_id"]);
  expect(pirate.attributeWas("parrot_id")).toBeNull();
}

describe("DirtyTest", () => {
  fixtures([], { usesTransaction: ["field named field"] });
  beforeAll(async () => {
    await Promise.all(
      [Person, Pirate, Parrot, Topic, NumericData, Aircraft, LiveParrot].map((m) =>
        m.first().catch(() => null),
      ),
    );
  });

  beforeEach(async () => {
    await Person.create({ first_name: "foo" });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("attribute changes", async () => {
    const pirate = new Pirate();
    expect(pirate.attributeChanged("catchphrase")).toBe(false);
    expect(pirate.attributeChanged("non_validated_parrot_id")).toBe(false);

    pirate.catchphrase = "arrr";
    expect(pirate.attributeChanged("catchphrase")).toBe(true);
    expect(pirate.attributeWas("catchphrase")).toBeNull();
    expect(pirate.attributeChange("catchphrase")).toEqual([null, "arrr"]);

    await pirate.saveBang();
    expect(pirate.attributeChanged("catchphrase")).toBe(false);
    expect(pirate.attributeChange("catchphrase")).toBeNull();

    pirate.catchphrase = "arrr";
    expect(pirate.attributeChanged("catchphrase")).toBe(false);
    expect(pirate.attributeChange("catchphrase")).toBeNull();
  });

  it("time attributes changes with time zone", async () => {
    await withTimezoneConfig({ zone: "Europe/Paris", awareAttributes: true }, async () => {
      const Target = class extends Base {
        declare created_on: TimeWithZone | string;
        declare catchphrase: string;

        static tableName = "pirates";
        static {
          this.attribute("created_on", "datetime");
          this.attribute("catchphrase", "string");
        }
      };
      const zone = timeZone()!;

      const pirate = new Target();
      expect(pirate.attributeChanged("created_on")).toBe(false);
      expect(pirate.attributeChange("created_on")).toBeNull();

      pirate.catchphrase = "arrrr, time zone!!";
      await pirate.saveBang();
      expect(pirate.attributeChanged("created_on")).toBe(false);
      expect(pirate.attributeChange("created_on")).toBeNull();

      const oldCreatedOn = pirate.created_on as TimeWithZone;
      pirate.created_on = new TimeWithZone(Temporal.Now.instant().subtract({ hours: 24 }), zone);
      expect(pirate.attributeChanged("created_on")).toBe(true);
      expect(pirate.attributeWas("created_on")).toBeInstanceOf(TimeWithZone);
      expect(
        (pirate.attributeWas("created_on") as TimeWithZone).utc().toTime().epochMilliseconds,
      ).toBe(oldCreatedOn.utc().toTime().epochMilliseconds);
      pirate.created_on = oldCreatedOn;
      expect(pirate.attributeChanged("created_on")).toBe(false);
    });
  });

  it("setting time attributes with time zone field to itself should not be marked as a change", async () => {
    await withTimezoneConfig({ zone: "Europe/Paris", awareAttributes: true }, async () => {
      const Target = class extends Base {
        declare created_on: TimeWithZone | string;
        declare catchphrase: string;

        static tableName = "pirates";
      };
      const pirate = await Target.create({});
      // eslint-disable-next-line no-self-assign
      pirate.created_on = pirate.created_on;
      expect(pirate.attributeChanged("created_on")).toBe(false);
    });
  });

  it("time attributes changes without time zone by skip", async () => {
    await withTimezoneConfig({ zone: "Europe/Paris", awareAttributes: true }, async () => {
      const Target = class extends Base {
        declare created_on: string;
        declare catchphrase: string;

        static tableName = "pirates";
        static skipTimeZoneConversionForAttributes = ["created_on"];
      };

      const pirate = new Target();
      expect(pirate.attributeChanged("created_on")).toBe(false);
      expect(pirate.attributeChange("created_on")).toBeNull();

      pirate.catchphrase = "arrrr, time zone!!";
      await pirate.saveBang();
      expect(pirate.attributeChanged("created_on")).toBe(false);
      expect(pirate.attributeChange("created_on")).toBeNull();

      const oldCreatedOn = pirate.created_on;
      pirate.created_on = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
      expect(pirate.attributeChanged("created_on")).toBe(true);
      expect(pirate.attributeWas("created_on")).not.toBeInstanceOf(TimeWithZone);
      expect(pirate.attributeWas("created_on")).toEqual(oldCreatedOn);
    });
  });

  it("time attributes changes without time zone", async () => {
    await withTimezoneConfig({ awareAttributes: false }, async () => {
      const Target = class extends Base {
        declare created_on: TimeWithZone | string;
        declare catchphrase: string;

        static tableName = "pirates";
      };

      const pirate = new Target();
      expect(pirate.attributeChanged("created_on")).toBe(false);
      expect(pirate.attributeChange("created_on")).toBeNull();

      pirate.catchphrase = "arrrr, time zone!!";
      await pirate.saveBang();
      expect(pirate.attributeChanged("created_on")).toBe(false);
      expect(pirate.attributeChange("created_on")).toBeNull();

      const oldCreatedOn = pirate.created_on;
      pirate.created_on = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
      expect(pirate.attributeChanged("created_on")).toBe(true);
      expect(pirate.attributeWas("created_on")).not.toBeInstanceOf(TimeWithZone);
      expect(pirate.attributeWas("created_on")).toEqual(oldCreatedOn);
    });
  });

  it("aliased attribute changes", () => {
    const parrot = new Parrot();
    expect(parrot.titleChanged()).toBe(false);
    expect(parrot.titleChange).toBeNull();

    parrot.name = "Sam";
    expect(parrot.titleChanged()).toBe(true);
    expect(parrot.titleWas).toBeNull();
    expect(parrot.nameChange).toEqual(parrot.titleChange);
  });

  it("restore attribute!", async () => {
    const pirate = await Pirate.create({ catchphrase: "Yar!" });
    pirate.catchphrase = "Ahoy!";

    expect(pirate.catchphrase).toBe("Ahoy!");
    expect(pirate.attributeChange("catchphrase")).toEqual(["Yar!", "Ahoy!"]);

    pirate.restoreAttributeBang("catchphrase");

    expect(pirate.attributeChange("catchphrase")).toBeNull();
    expect(pirate.catchphrase).toBe("Yar!");
    expect(pirate.changes).toEqual({});
    expect(pirate.attributeChanged("catchphrase")).toBe(false);
  });

  it("clear attribute change", async () => {
    const pirate = await Pirate.create({ catchphrase: "Yar!" });
    pirate.catchphrase = "Ahoy!";

    expect(pirate.catchphrase).toBe("Ahoy!");
    expect(pirate.attributeChange("catchphrase")).toEqual(["Yar!", "Ahoy!"]);

    pirate.clearAttributeChange("catchphrase");

    expect(pirate.attributeChange("catchphrase")).toBeNull();
    expect(pirate.catchphrase).toBe("Ahoy!");
    expect(pirate.changes).toEqual({});
    expect(pirate.attributeChanged("catchphrase")).toBe(false);
  });

  it("nullable number not marked as changed if new value is blank", () => {
    const pirate = new Pirate();

    for (const value of ["", null]) {
      pirate.parrot_id = value;
      expect(pirate.attributeChanged("parrot_id")).toBe(false);
      expect(pirate.attributeChange("parrot_id")).toBeNull();
    }
  });

  it("nullable decimal not marked as changed if new value is blank", () => {
    const numericData = new NumericData();

    for (const value of ["", null]) {
      numericData.bank_balance = value;
      expect(numericData.attributeChanged("bank_balance")).toBe(false);
      expect(numericData.attributeChange("bank_balance")).toBeNull();
    }
  });

  it("nullable float not marked as changed if new value is blank", () => {
    const numericData = new NumericData();

    for (const value of ["", null]) {
      numericData.temperature = value;
      expect(numericData.attributeChanged("temperature")).toBe(false);
      expect(numericData.attributeChange("temperature")).toBeNull();
    }
  });

  it("nullable datetime not marked as changed if new value is blank", async () => {
    await withTimezoneConfig({ zone: "Europe/London", awareAttributes: true }, async () => {
      const Target = class extends Base {
        declare written_on: TimeWithZone | string | null;

        static tableName = "topics";
      };

      const topic = await Target.create({});
      expect(topic.written_on).toBeNull();

      for (const value of ["", null]) {
        topic.written_on = value;
        expect(topic.written_on).toBeNull();
        expect(topic.attributeChanged("written_on")).toBe(false);
      }
    });
  });

  it("integer zero to string zero not marked as changed", async () => {
    const pirate = new Pirate();
    pirate.parrot_id = 0;
    pirate.catchphrase = "arrr";
    expect(await pirate.saveBang()).toBeTruthy();

    expect(pirate.isChanged).toBe(false);

    pirate.parrot_id = "0";
    expect(pirate.isChanged).toBe(false);
  });

  it("integer zero to integer zero not marked as changed", async () => {
    const pirate = new Pirate();
    pirate.parrot_id = 0;
    pirate.catchphrase = "arrr";
    expect(await pirate.saveBang()).toBeTruthy();

    expect(pirate.isChanged).toBe(false);

    pirate.parrot_id = 0;
    expect(pirate.isChanged).toBe(false);
  });

  it("float zero to string zero not marked as changed", async () => {
    const data = new NumericData({ temperature: 0.0 });
    await data.saveBang();

    expect(data.isChanged).toBe(false);

    data.temperature = "0";
    expect(data.changes).toEqual({});

    data.temperature = "0.0";
    expect(data.changes).toEqual({});

    data.temperature = "0.00";
    expect(data.changes).toEqual({});
  });

  it("zero to blank marked as changed", async () => {
    let pirate = new Pirate();
    pirate.catchphrase = "Yarrrr, me hearties";
    pirate.parrot_id = 1;
    await pirate.save();

    pirate = (await Pirate.findBy({ catchphrase: "Yarrrr, me hearties" }))!;
    pirate.parrot_id = "";
    expect(pirate.attributeChanged("parrot_id")).toBe(true);
    expect(pirate.attributeChange("parrot_id")).toEqual([1, null]);
    await pirate.save();

    pirate = (await Pirate.findBy({ catchphrase: "Yarrrr, me hearties" }))!;
    pirate.parrot_id = 0;
    expect(pirate.attributeChanged("parrot_id")).toBe(true);
    expect(pirate.attributeChange("parrot_id")).toEqual([null, 0]);
    await pirate.save();

    pirate = (await Pirate.findBy({ catchphrase: "Yarrrr, me hearties" }))!;
    pirate.parrot_id = "";
    expect(pirate.attributeChanged("parrot_id")).toBe(true);
    expect(pirate.attributeChange("parrot_id")).toEqual([0, null]);
  });

  it("object should be changed if any attribute is changed", async () => {
    const pirate = new Pirate();
    expect(pirate.isChanged).toBe(false);
    expect(pirate.changedAttributeNamesToSave).toEqual([]);
    expect(pirate.changes).toEqual({});

    pirate.catchphrase = "arrr";
    expect(pirate.isChanged).toBe(true);
    expect(pirate.attributeWas("catchphrase")).toBeNull();
    expect(pirate.changedAttributeNamesToSave).toEqual(["catchphrase"]);
    expect(pirate.changes).toEqual({ catchphrase: [null, "arrr"] });

    await pirate.save();
    expect(pirate.isChanged).toBe(false);
    expect(pirate.changedAttributeNamesToSave).toEqual([]);
    expect(pirate.changes).toEqual({});
  });

  it("attribute will change!", async () => {
    const pirate = await Pirate.createBang({ catchphrase: "arr" });

    expect(pirate.attributeChanged("catchphrase")).toBe(false);
    expect((pirate as any).catchphraseWillChange()).toBeTruthy();
    expect(pirate.attributeChanged("catchphrase")).toBe(true);
    expect(pirate.attributeChange("catchphrase")).toEqual(["arr", "arr"]);

    pirate.catchphrase = `${pirate.catchphrase} matey!`;
    expect(pirate.attributeChanged("catchphrase")).toBe(true);
    expect(pirate.attributeChange("catchphrase")).toEqual(["arr", "arr matey!"]);
  });

  it("virtual attribute will change", async () => {
    const parrot = await Parrot.create({ name: "Ruby" });
    (parrot as any).attributeWillChangeBang("cancelSaveFromCallback");
    expect(parrot.hasChangesToSave).toBe(true);
  });

  it("association assignment changes foreign key", async () => {
    const pirate = await Pirate.createBang({ catchphrase: "jarl" });
    const parrot = await Parrot.createBang({ name: "Lorre" });
    pirate.parrot = parrot;
    expect(pirate.isChanged).toBe(true);
    expect(pirate.changedAttributeNamesToSave).toEqual(["parrot_id"]);
  });

  it("attribute should be compared with type cast", () => {
    const topic = new Topic();
    expect((topic as any).approved).toBe(true);
    expect(topic.attributeChanged("approved")).toBe(false);

    (topic as any).assignAttributes({ approved: 1 });
    expect((topic as any).approved).toBe(true);
    expect(topic.attributeChanged("approved")).toBe(false);
  });

  it("partial update", async () => {
    const pirate = new Pirate();
    pirate.catchphrase = "foo";

    await withPartialWrites(Pirate, false, async () => {
      await assertQueriesCount(6, false, async () => {
        await pirate.saveBang();
        await pirate.saveBang();
      });
      await Pirate.where({ id: pirate.id }).updateAll({
        updated_on: Temporal.Instant.from("2020-01-01T00:00:00Z"),
      });
    });

    await pirate.reload();
    const oldUpdatedOn = pirate.updated_on;

    await withPartialWrites(Pirate, true, async () => {
      await assertNoQueries(false, async () => {
        await pirate.saveBang();
        await pirate.saveBang();
      });
      expect((await pirate.reload()).updated_on).toEqual(oldUpdatedOn);

      await assertQueriesCount(3, false, async () => {
        pirate.catchphrase = "bar";
        await pirate.saveBang();
      });
      expect((await pirate.reload()).updated_on).not.toEqual(oldUpdatedOn);
    });
  });

  it("partial update with optimistic locking", async () => {
    const person = new Person();
    (person as any).first_name = "foo";

    await withPartialWrites(Person, false, async () => {
      await assertQueriesCount(6, false, async () => {
        await person.saveBang();
        await person.saveBang();
      });
      await Person.where({ id: person.id }).updateAll({ first_name: "baz" });
    });

    const savedLockVersion = (person as any).lock_version + 1;

    await withPartialWrites(Person, true, async () => {
      await assertNoQueries(false, async () => {
        await person.saveBang();
        await person.saveBang();
      });
      expect((await person.reload()).lock_version).toEqual(savedLockVersion);

      await assertQueriesCount(3, false, async () => {
        (person as any).first_name = "bar";
        await person.saveBang();
      });
      expect((await person.reload()).lock_version).not.toEqual(savedLockVersion);
    });
  });

  it("changed attributes should be preserved if save failure", async () => {
    let pirate = new Pirate();
    pirate.parrot_id = 1;
    expect(await pirate.save()).toBe(false);
    checkPirateAfterSaveFailure(pirate);

    pirate = new Pirate();
    pirate.parrot_id = 1;
    await expect(pirate.saveBang()).rejects.toThrow();
    checkPirateAfterSaveFailure(pirate);
  });

  it("reload should clear changed attributes", async () => {
    const pirate = await Pirate.create({ catchphrase: "shiver me timbers" });
    pirate.catchphrase = "*hic*";
    expect(pirate.isChanged).toBe(true);
    await pirate.reload();
    expect(pirate.isChanged).toBe(false);
  });

  it("dup objects should not copy dirty flag from creator", async () => {
    const pirate = await Pirate.create({ catchphrase: "shiver me timbers" });
    const pirateDup = pirate.dup();
    pirateDup.restoreAttributeBang("catchphrase");
    pirate.catchphrase = "I love Rum";
    expect(pirate.attributeChanged("catchphrase")).toBe(true);
    expect(pirateDup.attributeChanged("catchphrase")).toBe(false);
  });

  it("reverted changes are not dirty", async () => {
    const phrase = "shiver me timbers";
    const pirate = await Pirate.create({ catchphrase: phrase });
    pirate.catchphrase = "*hic*";
    expect(pirate.isChanged).toBe(true);
    pirate.catchphrase = phrase;
    expect(pirate.isChanged).toBe(false);
  });

  it("reverted changes are not dirty after multiple changes", async () => {
    const phrase = "shiver me timbers";
    const pirate = await Pirate.create({ catchphrase: phrase });
    for (let i = 0; i < 10; i++) {
      pirate.catchphrase = "*hic*".repeat(i);
      expect(pirate.isChanged).toBe(true);
    }
    expect(pirate.isChanged).toBe(true);
    pirate.catchphrase = phrase;
    expect(pirate.isChanged).toBe(false);
  });

  it("reverted changes are not dirty going from nil to value and back", async () => {
    const pirate = await Pirate.create({ catchphrase: "Yar!" });

    pirate.parrot_id = 1;
    expect(pirate.isChanged).toBe(true);
    expect(pirate.attributeChanged("parrot_id")).toBe(true);
    expect(pirate.attributeChanged("catchphrase")).toBe(false);

    pirate.parrot_id = null;
    expect(pirate.isChanged).toBe(false);
    expect(pirate.attributeChanged("parrot_id")).toBe(false);
    expect(pirate.attributeChanged("catchphrase")).toBe(false);
  });

  it("save should store serialized attributes even with partial writes", async () => {
    await withPartialWrites(Topic, true, async () => {
      const topic = await Topic.createBang({ content: { a: "a" } });

      expect(topic.isChanged).toBe(false);

      (topic.content as Record<string, string>)["b"] = "b";

      expect(topic.isChanged).toBe(true);

      await topic.saveBang();

      expect(topic.isChanged).toBe(false);
      expect((topic.content as Record<string, string>)["b"]).toBe("b");

      await topic.reload();

      expect((topic.content as Record<string, string>)["b"]).toBe("b");
    });
  });

  it("previous changes includes in place serialized attribute mutation", async () => {
    const topic = await Topic.createBang({ content: { a: "a" } });

    expect(topic.previousChanges).toHaveProperty("content");

    (topic.content as Record<string, string>)["b"] = "b";

    expect(topic.isChanged).toBe(true);

    await topic.saveBang();

    expect(topic.isChanged).toBe(false);
    expect(topic.previousChanges).toHaveProperty("content");
    expect(topic.savedChanges).toHaveProperty("content");
    expect((topic.previousChanges["content"][0] as Record<string, string>)["a"]).toBe("a");
    expect((topic.previousChanges["content"][0] as Record<string, string>)["b"]).toBeUndefined();
    expect((topic.previousChanges["content"][1] as Record<string, string>)["a"]).toBe("a");
    expect((topic.previousChanges["content"][1] as Record<string, string>)["b"]).toBe("b");
  });

  it("save always should update timestamps when serialized attributes are present", async () => {
    await withPartialWrites(Topic, true, async () => {
      const topic = await Topic.createBang({ content: { a: "a" } });
      await topic.saveBang();

      const updatedAt = topic.updated_at;
      await withTravel(1000, async () => {
        (topic.content as Record<string, string>)["hello"] = "world";
        await topic.saveBang();
      });

      expect(topic.updated_at).not.toEqual(updatedAt);
      expect((topic.content as Record<string, string>)["hello"]).toBe("world");
    });
  });

  it("save should not save serialized attribute with partial writes if not present", async () => {
    await withPartialWrites(Topic, true, async () => {
      const full = await Topic.createBang({
        author_name: "Bill",
        content: { a: "a" },
      });
      const topic = (await Topic.select("id", "author_name").find(
        (full as any).id,
      )) as unknown as Topic;
      await topic.updateColumns({ author_name: "John" });
      const reloaded = await topic.reload();
      expect(reloaded.content).not.toBeNull();
    });
  });

  it("changes to save should not mutate array of hashes", async () => {
    const topic = new Topic();
    topic.author_name = "Bill";
    topic.content = [{ a: "a" }];

    void (topic as any).changesToSave;

    expect(topic.content).toEqual([{ a: "a" }]);
  });

  it("previous changes", async () => {
    let pirate = new Pirate();
    expect(pirate.previousChanges).toEqual({});
    pirate.catchphrase = "arrr";
    await pirate.save();

    expect(Object.keys(pirate.previousChanges)).toHaveLength(4);
    expect(pirate.previousChanges["catchphrase"]).toEqual([null, "arrr"]);
    expect(pirate.attributePreviouslyWas("catchphrase")).toBeNull();
    expect(pirate.previousChanges["id"]).toEqual([null, (pirate as any).id]);
    expect(pirate.previousChanges["updated_on"][0]).toBeNull();
    expect(pirate.previousChanges["updated_on"][1]).not.toBeNull();
    expect(pirate.previousChanges["created_on"][0]).toBeNull();
    expect(pirate.previousChanges["created_on"][1]).not.toBeNull();
    expect(pirate.previousChanges).not.toHaveProperty("parrot_id");

    pirate = new Pirate();
    expect(pirate.previousChanges).toEqual({});
    pirate.catchphrase = "arrr";
    await pirate.save();

    expect(Object.keys(pirate.previousChanges)).toHaveLength(4);
    expect(pirate.previousChanges["catchphrase"]).toEqual([null, "arrr"]);
    expect(pirate.attributePreviouslyWas("catchphrase")).toBeNull();
    expect(pirate.previousChanges["id"]).toEqual([null, (pirate as any).id]);
    expect(pirate.previousChanges).toHaveProperty("updated_on");
    expect(pirate.previousChanges).toHaveProperty("created_on");
    expect(pirate.previousChanges).not.toHaveProperty("parrot_id");

    pirate.catchphrase = "Yar!!";
    await pirate.reload();
    expect(pirate.previousChanges).toEqual({});

    pirate = (await Pirate.findBy({ catchphrase: "arrr" }))!;
    pirate.catchphrase = "Me Maties!";
    await pirate.save();

    expect(Object.keys(pirate.previousChanges)).toHaveLength(2);
    expect(pirate.previousChanges["catchphrase"]).toEqual(["arrr", "Me Maties!"]);
    expect(pirate.attributePreviouslyWas("catchphrase")).toBe("arrr");
    expect(pirate.previousChanges["updated_on"][0]).not.toBeNull();
    expect(pirate.previousChanges["updated_on"][1]).not.toBeNull();
    expect(pirate.previousChanges).not.toHaveProperty("parrot_id");
    expect(pirate.previousChanges).not.toHaveProperty("created_on");

    pirate = (await Pirate.findBy({ catchphrase: "Me Maties!" }))!;
    pirate.catchphrase = "Thar She Blows!";
    await pirate.save();

    expect(Object.keys(pirate.previousChanges)).toHaveLength(2);
    expect(pirate.previousChanges["catchphrase"]).toEqual(["Me Maties!", "Thar She Blows!"]);
    expect(pirate.attributePreviouslyWas("catchphrase")).toBe("Me Maties!");
    expect(pirate.previousChanges["updated_on"][0]).not.toBeNull();
    expect(pirate.previousChanges["updated_on"][1]).not.toBeNull();
    expect(pirate.previousChanges).not.toHaveProperty("parrot_id");
    expect(pirate.previousChanges).not.toHaveProperty("created_on");

    pirate = (await Pirate.findBy({ catchphrase: "Thar She Blows!" }))!;
    await pirate.update({ catchphrase: "Ahoy!" });

    expect(Object.keys(pirate.previousChanges)).toHaveLength(2);
    expect(pirate.previousChanges["catchphrase"]).toEqual(["Thar She Blows!", "Ahoy!"]);
    expect(pirate.attributePreviouslyWas("catchphrase")).toBe("Thar She Blows!");
    expect(pirate.previousChanges["updated_on"][0]).not.toBeNull();
    expect(pirate.previousChanges["updated_on"][1]).not.toBeNull();
    expect(pirate.previousChanges).not.toHaveProperty("parrot_id");
    expect(pirate.previousChanges).not.toHaveProperty("created_on");

    pirate = (await Pirate.findBy({ catchphrase: "Ahoy!" }))!;
    await pirate.updateAttribute("catchphrase", "Ninjas suck!");

    expect(Object.keys(pirate.previousChanges)).toHaveLength(2);
    expect(pirate.previousChanges["catchphrase"]).toEqual(["Ahoy!", "Ninjas suck!"]);
    expect(pirate.attributePreviouslyWas("catchphrase")).toBe("Ahoy!");
    expect(pirate.previousChanges["updated_on"][0]).not.toBeNull();
    expect(pirate.previousChanges["updated_on"][1]).not.toBeNull();
    expect(pirate.previousChanges).not.toHaveProperty("parrot_id");
    expect(pirate.previousChanges).not.toHaveProperty("created_on");
  });

  it("field named field", async () => {
    const Testings = class extends Base {
      static tableName = "testings";
    };
    try {
      await Base.connection.createTable("testings", { force: true }, (t) => {
        t.string("field");
      });
      await Testings.loadSchema();
      expect(() => new Testings().attributes).not.toThrow();
    } finally {
      await Base.connection.dropTable("testings", { ifExists: true });
    }
  });

  it("datetime attribute can be updated with fractional seconds", async () => {
    await withTimezoneConfig({ zone: "Europe/Paris", awareAttributes: true }, async () => {
      const Target = class extends Base {
        declare written_on: TimeWithZone | string | null;

        static tableName = "topics";
      };
      const zone = timeZone()!;

      const writtenOn = new TimeWithZone(Temporal.Instant.from("2012-12-01T12:00:00Z"), zone);

      const topic = await Target.create({ written_on: writtenOn });
      topic.written_on = new TimeWithZone(
        (topic.written_on as TimeWithZone).utc().toTime().toInstant().add({ milliseconds: 300 }),
        zone,
      );

      expect(topic.attributeChanged("written_on")).toBe(true);
    });
  });

  it("datetime attribute doesnt change if zone is modified in string", async () => {
    await withTimezoneConfig({ zone: "Europe/Paris", awareAttributes: true }, async () => {
      const Target = class extends Base {
        declare created_on: TimeWithZone | string;
        declare catchphrase: string;

        static tableName = "pirates";
        static {
          this.attribute("created_on", "datetime");
          this.attribute("catchphrase", "string");
        }
      };

      const timeInParis = new TimeWithZone(
        Temporal.Instant.from("2014-01-01T12:00:00Z"),
        timeZone()!,
      );
      const pirate = await Target.create({
        catchphrase: "rrrr",
        created_on: timeInParis,
      });

      pirate.created_on = (pirate.created_on as TimeWithZone).inTimeZone("Tokyo").toString();
      expect(pirate.attributeChanged("created_on")).toBe(false);
    });
  });

  it("partial insert", async () => {
    await withPartialWrites(Person, true, async () => {
      let jon!: Person;
      await assertNoQueriesMatch(/followers_count/, false, async () => {
        await assertQueriesMatch(/first_name/, undefined, false, async () => {
          jon = await Person.create({ first_name: "Jon" });
        });
      });
      await jon.reload();
      expect(jon.first_name).toBe("Jon");
      expect(jon.followers_count).toBe(0);
      expect(jon.id).not.toBeNull();
    });
  });

  it("partial insert with empty values", async () => {
    await withPartialWrites(Aircraft, true, async () => {
      const a = await Aircraft.create({});
      await a.reload();
      expect(a.id).not.toBeNull();
    });
  });

  it("changes is correct for subclass", async () => {
    const Foo = class extends Pirate {};
    Object.defineProperty(Foo.prototype, "catchphrase", {
      configurable: true,
      get(this: Pirate): string | null {
        const v = this.readAttribute("catchphrase") as string | null;
        return v == null ? v : v.toUpperCase();
      },
      set(this: Pirate, v: string | null) {
        this.writeAttribute("catchphrase", v);
      },
    });

    const pirate = await Foo.createBang({ catchphrase: "arrrr" });

    const newCatchphrase = "arrrr matey!";

    pirate.catchphrase = newCatchphrase;
    expect(pirate.attributeChanged("catchphrase")).toBe(true);

    expect((pirate as any).catchphrase).toBe(newCatchphrase.toUpperCase());
    expect(pirate.changes).toEqual({ catchphrase: ["arrrr", newCatchphrase] });
  });

  it("changes is correct if override attribute reader", async () => {
    const pirate = await Pirate.createBang({ catchphrase: "arrrr" });
    Object.defineProperty(pirate, "catchphrase", {
      configurable: true,
      get(this: Pirate): string | null {
        const v = this.readAttribute("catchphrase") as string | null;
        return v == null ? v : v.toUpperCase();
      },
      set(this: Pirate, v: string | null) {
        this.writeAttribute("catchphrase", v);
      },
    });

    const newCatchphrase = "arrrr matey!";

    pirate.catchphrase = newCatchphrase;
    expect(pirate.attributeChanged("catchphrase")).toBe(true);

    expect((pirate as any).catchphrase).toBe(newCatchphrase.toUpperCase());
    expect(pirate.changes).toEqual({ catchphrase: ["arrrr", newCatchphrase] });
  });

  it("attribute_changed? doesn't compute in-place changes for unrelated attributes", async () => {
    const TestType = class extends ValueType {
      override isChangedInPlace(_rawOldValue: unknown, _newValue: unknown): boolean {
        throw new Error("isChangedInPlace should not be called for unrelated attributes");
      }
    };
    const klass = class extends Base {
      static {
        this.tableName = "people";
        this.attribute("foo", new TestType());
      }
    };
    await klass.loadSchema();

    const model = new klass();
    (model as any).first_name = "Jim";
    expect(model.attributeChanged("first_name")).toBe(true);
  });

  it("attribute_will_change! doesn't try to save non-persistable attributes", async () => {
    const klass = class extends Base {
      static {
        this.tableName = "people";
        this.attribute("nonPersistedAttribute", "string");
      }
    };
    await klass.loadSchema();

    const record = new klass({ first_name: "Sean" });
    (record as any).nonPersistedAttributeWillChange();

    expect(record.attributeChanged("nonPersistedAttribute")).toBe(true);
    expect(await record.save()).toBe(true);
  });

  it("virtual attributes are not written with partial_writes off", async () => {
    await withPartialWrites(Base, false, async () => {
      const klass = class extends Base {
        static {
          this.tableName = "people";
          this.attribute("nonPersistedAttribute", "string");
        }
      };
      await klass.loadSchema();

      const record = new klass({ first_name: "Sean" });
      (record as any).nonPersistedAttributeWillChange();
      expect(await record.save()).toBe(true);

      (record as any).nonPersistedAttributeWillChange();
      expect(await record.save()).toBe(true);
    });
  });

  it("attributes assigned but not selected are dirty", async () => {
    const person = (await Person.select("id").first())!;
    expect(person.isChanged).toBe(false);

    person.first_name = "Sean";
    expect(person.isChanged).toBe(true);

    person.first_name = null;
    expect(person.isChanged).toBe(true);
  });

  it("attributes not selected are still missing after save", async () => {
    const person = (await Person.select("id").first())!;
    expect(() => person.first_name).toThrow("missing attribute 'first_name'");
    await person.save();
    expect(() => person.first_name).toThrow("missing attribute 'first_name'");
  });

  it("saved_change_to_attribute? returns whether a change occurred in the last save", async () => {
    const person = await Person.create({ first_name: "Sean" });

    expect(person.isSavedChangeToAttribute("first_name")).toBe(true);
    expect(person.isSavedChangeToAttribute("gender")).toBe(false);
    expect(person.isSavedChangeToAttribute("first_name", { from: null, to: "Sean" })).toBe(true);
    expect(person.isSavedChangeToAttribute("first_name", { from: null })).toBe(true);
    expect(person.isSavedChangeToAttribute("first_name", { to: "Sean" })).toBe(true);
    expect(person.isSavedChangeToAttribute("first_name", { from: "Jim", to: "Sean" })).toBe(false);
    expect(person.isSavedChangeToAttribute("first_name", { from: "Jim" })).toBe(false);
    expect(person.isSavedChangeToAttribute("first_name", { to: "Jim" })).toBe(false);
  });

  it("saved_change_to_attribute returns the change that occurred in the last save", async () => {
    const person = await Person.create({ first_name: "Sean", gender: "M" });

    expect(person.savedChanges["first_name"]).toEqual([null, "Sean"]);
    expect(person.savedChanges["gender"]).toEqual([null, "M"]);

    await person.update({ first_name: "Jim" });

    expect(person.savedChanges["first_name"]).toEqual(["Sean", "Jim"]);
    expect(person.savedChanges["gender"]).toBeUndefined();
  });

  it("attribute_before_last_save returns the original value before saving", async () => {
    const person = await Person.create({ first_name: "Sean", gender: "M" });

    expect(person.attributeBeforeLastSave("first_name")).toBeNull();
    expect(person.attributeBeforeLastSave("gender")).toBeNull();

    person.first_name = "Jim";

    expect(person.attributeBeforeLastSave("first_name")).toBeNull();
    expect(person.attributeBeforeLastSave("gender")).toBeNull();

    await person.save();

    expect(person.attributeBeforeLastSave("first_name")).toBe("Sean");
    expect(person.attributeBeforeLastSave("gender")).toBe("M");
  });

  it("saved_changes? returns whether the last call to save changed anything", async () => {
    const person = await Person.create({ first_name: "Sean" });

    expect(person.isSavedChanges()).toBe(true);

    await person.save();

    expect(person.isSavedChanges()).toBe(false);
  });

  it("saved_changes returns a hash of all the changes that occurred", async () => {
    const person = await Person.create({ first_name: "Sean", gender: "M" });

    expect(person.savedChanges["first_name"]).toEqual([null, "Sean"]);
    expect(person.savedChanges["gender"]).toEqual([null, "M"]);
    expect(Object.keys(person.savedChanges).sort()).toEqual(
      ["id", "first_name", "gender", "created_at", "updated_at"].sort(),
    );

    await person.update({ first_name: "Jim" });

    expect(person.savedChanges["first_name"]).toEqual(["Sean", "Jim"]);
    expect(Object.keys(person.savedChanges).sort()).toEqual(
      ["first_name", "lock_version", "updated_at"].sort(),
    );
  });

  it("changed? in after callbacks returns false", async () => {
    const klass = class extends Base {
      static {
        this.tableName = "people";
        this.afterSave(function (record: Base) {
          if (record.isChanged) throw new Error("changed? should be false");
          if (record.hasChangesToSave) throw new Error("has_changes_to_save? should be false");
          if (!record.isSavedChanges()) throw new Error("saved_changes? should be true");
          if (record.idInDatabase == null) throw new Error("id_in_database should not be nil");
        });
      }
    };

    const person = await klass.create({ first_name: "Sean" });
    expect(person.isChanged).toBe(false);
  });

  it("changed? in around callbacks after yield returns false", async () => {
    const klass = class extends Base {
      static {
        this.tableName = "people";
        this.aroundCreate(async function (record: Base, proceed: () => Promise<void>) {
          await proceed();
          if (record.isChanged) throw new Error("changed? should be false");
          if (record.hasChangesToSave) throw new Error("has_changes_to_save? should be false");
          if (!record.isSavedChanges()) throw new Error("saved_changes? should be true");
          if (record.idInDatabase == null) throw new Error("id_in_database should not be nil");
        });
      }
    };

    const person = await klass.create({ first_name: "Sean" });
    expect(person.isChanged).toBe(false);
  });

  it("partial insert off with unchanged default function attribute", async () => {
    await withPartialWrites(Aircraft, false, async () => {
      const aircraft = new Aircraft({ name: "Boeing" });
      expect(aircraft.name).toBe("Boeing");

      await aircraft.saveBang();
      await aircraft.reload();

      expect(aircraft.name).toBe("Boeing");
      const mfgAt = aircraft.manufactured_at;
      expect(mfgAt).not.toBeNull();
      const nowMs = Temporal.Now.instant().epochMilliseconds;
      const mfgAtMs = (mfgAt as RubyTime).toF() * 1000;
      expect(Math.abs(nowMs - mfgAtMs)).toBeLessThan(5000);
    });
  });

  it("partial insert off with changed default function attribute", async () => {
    await withPartialWrites(Aircraft, false, async () => {
      const manufacturingDate = new Date("2025-01-01T00:00:00Z");
      const aircraft = new Aircraft({
        name: "Boeing2",
        manufactured_at: manufacturingDate,
      });

      expect(aircraft.name).toBe("Boeing2");
      const castAt = aircraft.manufactured_at as RubyTime;
      expect(castAt.toI()).toBe(Math.floor(manufacturingDate.getTime() / 1000));

      await aircraft.saveBang();
      await aircraft.reload();

      expect(aircraft.name).toBe("Boeing2");
      const reloadedAt = aircraft.manufactured_at as RubyTime;
      const expectedStr = manufacturingDate.toISOString().slice(0, 19).replace("T", " ");
      const actualStr = reloadedAt.getutc().xmlschema().slice(0, 19).replace("T", " ");
      expect(actualStr).toBe(expectedStr);
    });
  });

  it("attribute_changed? properly type casts enum values", async () => {
    const parrot = await LiveParrot.createBang({ name: "Scipio", breed: 0 });

    (parrot as any).breed = "australian";

    expect(parrot.attributeChanged("breed", { from: "african", to: "australian" })).toBe(true);
    expect(parrot.attributeChanged("breed", { from: "african", to: "australian" })).toBe(true);
    expect(parrot.attributeChanged("breed", { from: 0, to: 1 })).toBe(true);
  });
});

describeIfPostgresqlAdapter("DirtyTest", () => {
  fixtures([], { useTransactionalTests: false });

  itIfSupports(
    "identity_columns",
    "partial insert off with changed composite identity primary key attribute",
    async () => {
      const klass = class extends Base {
        declare another_id: number;

        static {
          this.tableName = "cpk_postgresql_identity_table";
        }
      };
      await klass.loadSchema();

      await withPartialWrites(klass, false, async () => {
        const record = await klass.createBang({ another_id: 10 });
        expect(record.another_id).toBe(10);
        expect(record.id).not.toBeNull();
      });
    },
  );
});
