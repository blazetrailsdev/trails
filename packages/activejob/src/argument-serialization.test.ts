import { beforeEach, describe, expect, it } from "vitest";
import {
  Duration,
  HashWithIndifferentAccess,
  TimeWithZone,
  TimeZone,
  days,
  hours,
  useZone,
  weeks,
  withIndifferentAccess,
  years,
} from "@blazetrails/activesupport";
import { Date, DateTime, Time } from "@blazetrails/date";
import {
  BigDecimal,
  Hash,
  Range,
  Rational,
  defineModule,
  rbInspect,
  rbEqual,
  rbModConstSet,
  rbObjClass,
  rbObjIsKindOf,
  registerConstant,
} from "@blazetrails/ruby-compat";
import { DeserializationError, SerializationError } from "./arguments.js";
import { ActiveJob } from "./namespaces.js";
import { Serializers } from "./serializers.js";
import { ObjectSerializer } from "./serializers/object-serializer.js";
import "./test-helpers/helper.js";
import { ArgumentsRoundTripJob } from "./test-helpers/jobs/arguments-round-trip-job.js";
import { KwargsJob } from "./test-helpers/jobs/kwargs-job.js";
import { Person } from "./test-helpers/models/person.js";
import { JobBuffer } from "./test-helpers/support/job-buffer.js";
import { Parameters } from "./test-helpers/support/stubs/strong-parameters.js";

class ArgumentSerializationTest {
  static toString(): string {
    return "ArgumentSerializationTest";
  }
}
registerConstant("ArgumentSerializationTest", ArgumentSerializationTest);

const ModuleArgument = defineModule({});
rbModConstSet(ArgumentSerializationTest, "ModuleArgument", ModuleArgument);
class ModuleArgumentClassArgument {}
rbModConstSet(ModuleArgument, "ClassArgument", ModuleArgumentClassArgument);

class ClassArgument {}
rbModConstSet(ArgumentSerializationTest, "ClassArgument", ClassArgument);

class MyClassWithPermitted {
  static isPermitted(): void {}
}
rbModConstSet(ArgumentSerializationTest, "MyClassWithPermitted", MyClassWithPermitted);

class MyString extends String {}
rbModConstSet(ArgumentSerializationTest, "MyString", MyString);

class MyStringSerializer extends ObjectSerializer {
  serialize(argument: unknown): Record<string, unknown> {
    return super.serialize({ value: String(argument) });
  }

  deserialize(hash: Record<string, unknown>): MyString {
    return new MyString(hash["value"]);
  }

  /** @internal */
  protected klass(): typeof MyString {
    return MyString;
  }
}
rbModConstSet(ArgumentSerializationTest, "MyStringSerializer", MyStringSerializer);

class StringWithoutSerializer extends String {}
rbModConstSet(ArgumentSerializationTest, "StringWithoutSerializer", StringWithoutSerializer);

async function assertArgumentsUnchanged(...args: unknown[]): Promise<void> {
  await assertArgumentsRoundtrip(args);
}

async function assertArgumentsRoundtrip(args: unknown[]): Promise<void> {
  expect(rbEqual(args, await performRoundTrip(args))).toBe(true);
}

async function performRoundTrip(args: unknown[]): Promise<unknown[]> {
  await ArgumentsRoundTripJob.performLater(...args);

  return JobBuffer.lastValue() as unknown[];
}

describe("ArgumentSerializationTest", () => {
  let person: Person;

  beforeEach(() => {
    person = Person.find("5");
  });

  it("serializes  -  verbatim", async () => {
    for (const arg of [
      null,
      1,
      1.0,
      1_000_000_000_000_000_000_000n,
      "a",
      true,
      false,
      new BigDecimal(5),
      ":a",
      days(1),
      new Date(2001, 2, 3),
      Time.new(2002, 10, 31, 2, 2, new Rational(2123456789, 1000000000), "+02:00"),
      new DateTime(2001, 2, 3, 4, 5, new Rational(6123456, 1000000), "+03:00"),
      new TimeWithZone(
        Time.utc(1999, 12, 31, 23, 59, new Rational(59123456789, 1000000000)),
        TimeZone.find("UTC")!,
      ),
      [1, "a"],
      { a: 1 },
      ModuleArgument,
      ModuleArgumentClassArgument,
      ClassArgument,
      new Range(1, null),
      new Range(1, null, true),
      new Range(1, 5),
      new Range(1, 5, true),
      new Range("a", "z"),
      new Range("A", "Z"),
      new Range(new Date(2001, 2, 3), null),
      new Range<unknown>(days(10).ago(), Date.today()),
      new Range(Time.new(2002, 10, 31, 2, 2, new Rational(2123456789, 1000000000), "+02:00"), null),
      new Range(hours(10).ago(), Time.current()),
      new Range(new DateTime(2001, 2, 3, 4, 5, new Rational(6123456, 1000000), "+03:00"), null),
      new Range(weeks(4).ago(DateTime.current()), DateTime.current()),
      new Range(
        new TimeWithZone(
          Time.utc(1999, 12, 31, 23, 59, new Rational(59123456789, 1000000000)),
          TimeZone.find("UTC")!,
        ),
        null,
      ),
    ]) {
      await assertArgumentsUnchanged(arg).catch((e: Error) => {
        e.message = `serializes ${String(rbObjClass(arg))} - ${rbInspect(arg)} verbatim: ${e.message}`;
        throw e;
      });
    }
  });

  it("does not serialize ", async () => {
    for (const arg of [new (class {})(), Person.find("5").toGid(), class {}]) {
      expect(() => ActiveJob.Arguments.serialize([arg])).toThrow(SerializationError);

      await expect(ActiveJob.Arguments.deserialize([arg])).rejects.toThrow(DeserializationError);
    }
  });

  it("should convert records to Global IDs", async () => {
    await assertArgumentsRoundtrip([person]);
  });

  it("should keep Global IDs strings as they are", async () => {
    await assertArgumentsRoundtrip([person.toGid().toString()]);
  });

  it("should dive deep into arrays and hashes", async () => {
    await assertArgumentsRoundtrip([3, [person]]);
    await assertArgumentsRoundtrip([{ a: person }]);
  });

  it("should maintain string and symbol keys", async () => {
    await assertArgumentsRoundtrip([{ ":a": 1, b: 2 }]);
  });

  it("serialize a ActionController::Parameters", () => {
    const parameters = new Parameters({ ":a": 1 });

    expect(ActiveJob.Arguments.serialize([parameters])[0]).toEqual({
      a: 1,
      _aj_hash_with_indifferent_access: true,
    });
  });

  it("serialize a class with permitted? defined", async () => {
    await assertArgumentsUnchanged(MyClassWithPermitted);
  });

  it("serialize a String subclass object", async () => {
    const originalSerializers = Serializers.serializers();
    Serializers.addSerializers(MyStringSerializer);
    try {
      const myString = new MyString("foo");
      const serialized = ActiveJob.Arguments.serialize([myString]);
      const deserialized = (
        await ActiveJob.Arguments.deserialize(JSON.parse(JSON.stringify(serialized)))
      )[0];
      expect((deserialized as object).constructor).toBe(MyString);
      expect(rbEqual(myString, deserialized)).toBe(true);
    } finally {
      Serializers._additionalSerializers = originalSerializers;
    }
  });

  it("serialize a String subclass object without a serializer", async () => {
    const stringWithoutSerializer = new StringWithoutSerializer("foo");
    const serialized = ActiveJob.Arguments.serialize([stringWithoutSerializer]);
    const deserialized = (
      await ActiveJob.Arguments.deserialize(JSON.parse(JSON.stringify(serialized)))
    )[0];
    expect(typeof deserialized).toBe("string");
    expect(rbEqual(stringWithoutSerializer, deserialized)).toBe(true);
  });

  it("serialize a hash", () => {
    const symbolKey = { ":a": 1 };
    const stringKey = { a: 1 };
    const indifferentAccess = withIndifferentAccess({ ":a": 1 });

    expect(ActiveJob.Arguments.serialize([symbolKey])[0]).toEqual({
      a: 1,
      _aj_symbol_keys: ["a"],
    });
    expect(ActiveJob.Arguments.serialize([stringKey])[0]).toEqual({ a: 1, _aj_symbol_keys: [] });
    expect(ActiveJob.Arguments.serialize([indifferentAccess])[0]).toEqual({
      a: 1,
      _aj_hash_with_indifferent_access: true,
    });
  });

  it("deserialize a hash", async () => {
    const symbolKey = { a: 1, _aj_symbol_keys: ["a"] };
    const stringKey = { a: 1, _aj_symbol_keys: [] };
    const anotherStringKey = { a: 1 };
    const indifferentAccess = { a: 1, _aj_hash_with_indifferent_access: true };
    const indifferentAccessSymbolKey = withIndifferentAccess(symbolKey);

    expect((await ActiveJob.Arguments.deserialize([symbolKey]))[0]).toEqual({ ":a": 1 });
    expect((await ActiveJob.Arguments.deserialize([stringKey]))[0]).toEqual({ a: 1 });
    expect((await ActiveJob.Arguments.deserialize([anotherStringKey]))[0]).toEqual({ a: 1 });
    expect(rbEqual({ a: 1 }, (await ActiveJob.Arguments.deserialize([indifferentAccess]))[0])).toBe(
      true,
    );
    expect((await ActiveJob.Arguments.deserialize([indifferentAccessSymbolKey]))[0]).toEqual({
      ":a": 1,
    });
  });

  it("should maintain hash with indifferent access", async () => {
    const symbolKey = { ":a": 1 };
    const stringKey = { a: 1 };
    const indifferentAccess = withIndifferentAccess({ ":a": 1 });

    expect((await performRoundTrip([symbolKey]))[0]).not.toBeInstanceOf(HashWithIndifferentAccess);
    expect((await performRoundTrip([stringKey]))[0]).not.toBeInstanceOf(HashWithIndifferentAccess);
    expect(((await performRoundTrip([indifferentAccess]))[0] as object).constructor).toBe(
      HashWithIndifferentAccess,
    );
  });

  it("should maintain time with zone", async () => {
    await useZone("Alaska", async () => {
      const timeWithZone = Time.new(2002, 10, 31, 2, 2, 2).inTimeZone();
      expect(((await performRoundTrip([timeWithZone]))[0] as object).constructor).toBe(
        TimeWithZone,
      );
      await assertArgumentsUnchanged(timeWithZone);
    });
  });

  it("should maintain a functional duration", async () => {
    const duration = (await performRoundTrip([years(1)]))[0] as Duration;
    expect(rbObjIsKindOf(duration.parts, Hash)).toBe(true);
    expect(rbEqual(years(2), duration.plus(years(1)))).toBe(true);
  });

  it("should disallow non-string/symbol hash keys", () => {
    expect(() => ActiveJob.Arguments.serialize([new Hash<number, number>().set(1, 2)])).toThrow(
      SerializationError,
    );

    expect(() =>
      ActiveJob.Arguments.serialize([{ ":a": [new Hash<number, number>().set(2, 3)] }]),
    ).toThrow(SerializationError);
  });

  it("should not allow reserved hash keys", () => {
    for (const key of [
      "_aj_globalid",
      ":_aj_globalid",
      "_aj_symbol_keys",
      ":_aj_symbol_keys",
      "_aj_hash_with_indifferent_access",
      ":_aj_hash_with_indifferent_access",
      "_aj_serialized",
      ":_aj_serialized",
    ]) {
      expect(() => ActiveJob.Arguments.serialize([{ [key]: 1 }])).toThrow(SerializationError);
    }
  });

  it("should not allow non-primitive objects", () => {
    expect(() => ActiveJob.Arguments.serialize([new (class {})()])).toThrow(SerializationError);

    expect(() => ActiveJob.Arguments.serialize([1, [new (class {})()]])).toThrow(
      SerializationError,
    );
  });

  it("allows for keyword arguments", async () => {
    await KwargsJob.performNow({ argument: 2 });

    expect(JobBuffer.lastValue()).toBe("Job with argument: 2");
  });

  it("raises a friendly SerializationError for records without ids", () => {
    let err: unknown;
    try {
      ActiveJob.Arguments.serialize([new Person(null)]);
    } catch (e) {
      err = e;
    }
    expect(err).toBeInstanceOf(SerializationError);
    expect((err as Error).message).toContain("Unable to serialize Person without an id.");
  });
});
