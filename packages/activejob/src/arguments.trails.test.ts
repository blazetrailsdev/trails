import { describe, expect, it } from "vitest";
import { HashWithIndifferentAccess, constantize, days, weeks } from "@blazetrails/activesupport";
import { Date, DateTime } from "@blazetrails/date";
import {
  Hash,
  Range,
  hashAref,
  rbEqual,
  update,
  rbHashSRuby2KeywordsHash,
  rbModConstSet,
  rbHashSRuby2KeywordsHashP,
} from "@blazetrails/ruby-compat";
import { GlobalID, MissingModelIdError } from "@blazetrails/globalid";
import { ActiveJob } from "./index.js";
import { Person } from "./test-helpers/models/person.js";
import {
  Arguments,
  DeserializationError,
  SerializationError,
  deserialize,
  serialize,
} from "./arguments.js";
import { Serializers } from "./serializers.js";
import { ObjectSerializer } from "./serializers/object-serializer.js";

describe("ActiveJob::Arguments", () => {
  it("passes primitives and bigint through", async () => {
    const args = [null, true, false, 1, 1.5, "a", 1_000_000_000_000_000_000_000n];
    expect(serialize(args)).toEqual(args);
    expect(await deserialize(args)).toEqual(args);
  });

  it("round-trips Symbol keys through _aj_symbol_keys", async () => {
    const serialized = serialize([{ ":a": 1, b: [{ ":c": 2 }] }]);
    expect(serialized).toEqual([
      { a: 1, b: [{ c: 2, _aj_symbol_keys: ["c"] }], _aj_symbol_keys: ["a"] },
    ]);
    expect(await deserialize(serialized)).toEqual([{ ":a": 1, b: [{ ":c": 2 }] }]);
  });

  it("round-trips a ruby2_keywords hash", async () => {
    const [serialized] = serialize([rbHashSRuby2KeywordsHash({ ":a": 1 })]);
    expect(serialized).toEqual({ a: 1, _aj_ruby2_keywords: ["a"] });
    const [hash] = await deserialize([serialized]);
    expect(rbHashSRuby2KeywordsHashP(hash as object)).toBe(true);
  });

  it("round-trips a HashWithIndifferentAccess", async () => {
    const [serialized] = serialize([new HashWithIndifferentAccess({ a: 1 })]);
    expect(serialized).toEqual({ a: 1, _aj_hash_with_indifferent_access: true });
    const [hash] = await deserialize([serialized]);
    expect(hash).toBeInstanceOf(HashWithIndifferentAccess);
  });

  it("serializes a Map hash", () => {
    expect(serialize([new Hash<string, number>().set("a", 1)])).toEqual([
      { a: 1, _aj_symbol_keys: [] },
    ]);
  });

  it("restores symbol keys on a Map hash as a Hash", async () => {
    const [restored] = await deserialize([
      new Hash<string, unknown>().set("a", 1).set("_aj_symbol_keys", ["a"]),
    ]);
    expect(restored).toBeInstanceOf(Hash);
  });

  it("deserializes a Map hash, including a custom-serialized one", async () => {
    const plain = new Hash<string, unknown>().set("a", 1).set("_aj_symbol_keys", ["a"]);
    const [restored] = await deserialize([plain]);
    expect([...(restored as Map<string, unknown>)]).toEqual([[":a", 1]]);
    const custom = new Hash<string, unknown>().set("_aj_serialized", "Nope::Missing");
    await expect(deserialize([custom])).rejects.toThrow("Serializer Nope::Missing is not known");
  });

  it("treats a false key marker or serializer name as absent", async () => {
    expect(await deserialize([{ a: 1, _aj_symbol_keys: false }])).toEqual([{ a: 1 }]);
    await expect(deserialize([{ _aj_serialized: false }])).rejects.toThrow(
      "Serializer name is not present in the argument",
    );
  });

  it("keeps an ordinary __proto__ key when restoring symbol keys", async () => {
    const [hash] = await deserialize([JSON.parse('{"__proto__": 1, "_aj_symbol_keys": []}')]);
    expect(Object.keys(hash as object)).toEqual(["__proto__"]);
  });

  it("raises on reserved and non-string keys", () => {
    expect(() => serialize([{ _aj_globalid: 1 }])).toThrow(
      new SerializationError('Can\'t serialize a Hash with reserved key "_aj_globalid"'),
    );
    expect(() => serialize([{ ":_aj_symbol_keys": 1 }])).toThrow(
      "Can't serialize a Hash with reserved key :_aj_symbol_keys",
    );
    expect(() => serialize([new Hash<number, number>().set(1, 1)])).toThrow(
      "Only string and symbol hash keys may be serialized as job arguments, but 1 is a Integer",
    );
  });

  it("raises SerializationError for an unsupported type", () => {
    class Unknown {}
    expect(() => serialize([new Unknown()])).toThrow(SerializationError);
  });

  it("wraps a deserialization failure, keeping the cause", async () => {
    const error = await deserialize([{ _aj_serialized: "Nope::Missing" }]).catch((e) => e);
    expect(error).toBeInstanceOf(DeserializationError);
    expect(error.message).toBe(
      "Error while trying to deserialize arguments: Serializer Nope::Missing is not known",
    );
    expect(error.cause.message).toBe("Serializer Nope::Missing is not known");
  });

  it("round-trips through a custom ObjectSerializer", async () => {
    class Money {
      constructor(public amount: number) {}
    }
    class MoneySerializer extends ObjectSerializer {
      serialize(money: unknown) {
        return super.serialize(new Hash<string, unknown>().set("amount", (money as Money).amount));
      }
      deserialize(hash: Record<string, unknown> | Map<string, unknown>) {
        return new Money(hashAref(hash, "amount") as number);
      }
      protected klass() {
        return Money;
      }
    }
    rbModConstSet(ActiveJob.Serializers, "MoneySerializer", MoneySerializer);
    Serializers.addSerializers(MoneySerializer);
    const serialized = serialize([new Money(5)]);
    expect(serialized).toEqual([
      { _aj_serialized: "ActiveJob::Serializers::MoneySerializer", amount: 5 },
    ]);
    expect(await deserialize(serialized)).toEqual([new Money(5)]);
    const asMap = new Hash<string, unknown>()
      .set("_aj_serialized", "ActiveJob::Serializers::MoneySerializer")
      .set("amount", 7);
    expect(await deserialize([asMap])).toEqual([new Money(7)]);
    const withProto = MoneySerializer.instance().serialize(new Money(1));
    expect(
      Object.keys(update(withProto, new Hash<string, unknown>().set("__proto__", 2))),
    ).toContain("__proto__");
    expect(MoneySerializer.instance()).toBe(MoneySerializer.instance());
    expect(MoneySerializer.instance()).not.toBe(ObjectSerializer.instance());
  });

  it("seats Arguments and Serializers on ActiveJob", () => {
    expect(ActiveJob.Arguments).toBe(Arguments);
    expect(constantize("ActiveJob::Serializers::ObjectSerializer")).toBe(ObjectSerializer);
  });
});

describe("Arguments.deserialize of a HashWithIndifferentAccess", () => {
  it("answers a plain object for symbol keys, as argument_serialization_test.rb:189-192 expects", async () => {
    const indifferentAccessSymbolKey = new HashWithIndifferentAccess({
      a: 1,
      _aj_symbol_keys: ["a"],
    });
    expect((await deserialize([indifferentAccessSymbolKey]))[0]).toStrictEqual({ ":a": 1 });
  });
});

describe("ActiveJob::Arguments GlobalID arm", () => {
  GlobalID.setApp("aj");

  it("round-trips an Identification-including object through gid:// and the locator", async () => {
    const serialized = serialize([new Person("5")]);
    expect(serialized).toEqual([{ _aj_globalid: "gid://aj/Person/5" }]);
    const [person] = await deserialize(serialized);
    expect(person).toBeInstanceOf(Person);
    expect((person as Person).id).toBe("5");
  });

  it("does not duck-type toGlobalId on a class that does not include Identification", () => {
    class Impostor {
      id = "5";
      toGlobalId(): string {
        return "gid://aj/Impostor/5";
      }
    }
    expect(() => serialize([new Impostor()])).toThrow(SerializationError);
  });

  it("raises SerializationError for a record without an id", () => {
    let raised: unknown;
    try {
      serialize([new Person(null)]);
    } catch (error) {
      raised = error;
    }
    expect(raised).toBeInstanceOf(SerializationError);
    expect((raised as Error).message).toBe(
      "Unable to serialize Person without an id. (Maybe you forgot to call save?)",
    );
    expect((raised as Error).cause).toBeInstanceOf(MissingModelIdError);
  });

  it("treats a hash with _aj_globalid and another key as a plain hash", async () => {
    const [restored] = await deserialize([{ _aj_globalid: "gid://aj/Person/5", a: 1 }]);
    expect(restored).toEqual({ _aj_globalid: "gid://aj/Person/5", a: 1 });
  });

  it("wraps a locator failure in DeserializationError with the original as cause", async () => {
    const error = await deserialize([{ _aj_globalid: "gid://aj/Person/404" }]).catch((e) => e);
    expect(error).toBeInstanceOf(DeserializationError);
    expect((error as Error).cause).toBeInstanceOf(Person.RecordNotFound);
  });
});

describe("ActiveJob::Arguments with Temporal-valued dates", () => {
  // BLOCKED: activejob-date-serializers-serialize-temporal-dates
  it.skip("round-trips the Temporal-valued ranges of argument_serialization_test.rb:72-75", async () => {
    for (const arg of [
      new Range<unknown>(days(10).ago(), Date.today()),
      new Range(weeks(4).ago(DateTime.current()), DateTime.current()),
    ]) {
      expect(rbEqual([arg], await deserialize(JSON.parse(JSON.stringify(serialize([arg])))))).toBe(
        true,
      );
    }
  });
});
