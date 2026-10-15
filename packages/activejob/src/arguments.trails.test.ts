import { describe, expect, it } from "vitest";
import { HashWithIndifferentAccess, constantize } from "@blazetrails/activesupport";
import {
  Hash,
  rbHashSRuby2KeywordsHash,
  rbModConstSet,
  rbHashSRuby2KeywordsHashP,
} from "@blazetrails/ruby-compat";
import { ActiveJob } from "./index.js";
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

  it("deserializes a Map hash, including a custom-serialized one", async () => {
    const plain = new Hash<string, unknown>().set("a", 1).set("_aj_symbol_keys", ["a"]);
    expect(await deserialize([plain])).toEqual([new Hash<string, unknown>().set(":a", 1)]);
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
      deserialize(hash: Record<string, unknown>) {
        return new Money(hash.amount as number);
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
    expect(MoneySerializer.instance()).toBe(MoneySerializer.instance());
    expect(MoneySerializer.instance()).not.toBe(ObjectSerializer.instance());
  });

  it("seats Arguments and Serializers on ActiveJob", () => {
    expect(ActiveJob.Arguments).toBe(Arguments);
    expect(constantize("ActiveJob::Serializers::ObjectSerializer")).toBe(ObjectSerializer);
  });
});
