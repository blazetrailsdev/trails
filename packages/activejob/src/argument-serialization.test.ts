import type {} from "@blazetrails/vitest-matchers";
import "./test-helpers/helper.js";
import {
  Duration,
  TimeWithZone,
  TimeZone,
  assertRaises,
  withIndifferentAccess,
  HashWithIndifferentAccess,
  useZone,
} from "@blazetrails/activesupport";
import { current as dateTimeCurrent } from "@blazetrails/activesupport/core-ext/date-time/calculations";
import { current as timeCurrent } from "@blazetrails/activesupport/core-ext/time/calculations";
import { Date as RubyDate, Time as RubyTime, DateTime as RubyDateTime } from "@blazetrails/date";
import {
  BigDecimal,
  rational,
  Range,
  rbObjClassname,
  rbInspect,
  isSymbol,
  symbolToS,
  rbObjAsString,
  JSON,
  rbCString,
  Hash,
  classModule,
  registerConstant,
} from "@blazetrails/ruby-compat";
import { Arguments, SerializationError, DeserializationError } from "./arguments.js";
import { rbBinop } from "./codegen-runtime.js";
import { Serializers } from "./serializers.js";
import { ObjectSerializer } from "./serializers/object-serializer.js";
import { ArgumentsRoundTripJob } from "./test-helpers/jobs/arguments-round-trip-job.js";
import { KwargsJob } from "./test-helpers/jobs/kwargs-job.js";
import { Person } from "./test-helpers/models/person.js";
import { JobBuffer } from "./test-helpers/support/job-buffer.js";
import { Parameters as ParametersClass } from "./test-helpers/support/stubs/strong-parameters.js";
import { expect, beforeEach, it, describe } from "vitest";
import type { Set } from "@blazetrails/ruby-compat";

class ArgumentSerializationTest {}

describe("ArgumentSerializationTest", () => {
  let person: unknown;

  async function assertArgumentsUnchanged(...args: unknown[]) {
    return await assertArgumentsRoundtrip(args);
  }

  async function assertArgumentsRoundtrip(args: unknown) {
    return expect(await performRoundTrip(args)).toEqualRuby(args);
  }

  async function performRoundTrip(args: unknown) {
    await ArgumentsRoundTripJob.performLater(
      ...((args == null ? [] : Array.isArray(args) ? (args as unknown[]) : [args]) as Parameters<
        typeof ArgumentsRoundTripJob.performLater
      >),
    );
    return JobBuffer.lastValue();
  }

  beforeEach(() => {
    person = Person.find("5");
  });

  for (const arg of [
    null,
    1,
    new Number(1.0),
    1000000000000000000000n,
    "a",
    true,
    false,
    new BigDecimal(5),
    ":a",
    Duration.days(1),
    new RubyDate(2001, 2, 3),
    new RubyTime(2002, 10, 31, 2, 2, rational(2123456789n, 1000000000n), "+02:00"),
    new RubyDateTime(2001, 2, 3, 4, 5, rational(95679n, 15625n), "+03:00"),
    new TimeWithZone(
      RubyTime.utc(1999, 12, 31, 23, 59, rational(59123456789n, 1000000000n)),
      TimeZone.find("UTC")!,
    ),
    [1, "a"],
    { a: 1 },
    ModuleArgument,
    ClassArgument,
    ArgumentSerializationTestClassArgument,
    new Range(1, null, false),
    new Range(1, null, true),
    new Range(1, 5, false),
    new Range(1, 5, true),
    new Range("a", "z", false),
    new Range("A", "Z", false),
    new Range(new RubyDate(2001, 2, 3), null, false),
    new Range(Duration.days(10).ago(), RubyDate.today(), false),
    new Range(
      new RubyTime(2002, 10, 31, 2, 2, rational(2123456789n, 1000000000n), "+02:00"),
      null,
      false,
    ),
    new Range(Duration.hours(10).ago(), timeCurrent(), false),
    new Range(new RubyDateTime(2001, 2, 3, 4, 5, rational(95679n, 15625n), "+03:00"), null, false),
    new Range(rbBinop(dateTimeCurrent(), "-", Duration.weeks(4)), dateTimeCurrent(), false),
    new Range(
      new TimeWithZone(
        RubyTime.utc(1999, 12, 31, 23, 59, rational(59123456789n, 1000000000n)),
        TimeZone.find("UTC")!,
      ),
      null,
      false,
    ),
  ]) {
    it(`serializes ${rbObjClassname(arg)} - ${rbInspect(arg)} verbatim`, async () => {
      await assertArgumentsUnchanged(arg);
    });
  }

  for (const arg of [new (class Object {})(), Person.find("5").toGid(), class extends Object {}]) {
    it(`does not serialize ${rbObjClassname(arg)}`, async () => {
      await assertRaises([SerializationError], {}, () => Arguments.serialize([arg]));
      await assertRaises(
        [DeserializationError],
        {},
        async () => await Arguments.deserialize([arg]),
      );
    });
  }

  it("should convert records to Global IDs", async () => {
    await assertArgumentsRoundtrip([person]);
  });

  it("should keep Global IDs strings as they are", async () => {
    await assertArgumentsRoundtrip([
      await ((v) => (isSymbol(v) ? symbolToS(v) : rbObjAsString(v)))(await person.toGid()),
    ]);
  });

  it("should dive deep into arrays and hashes", async () => {
    await assertArgumentsRoundtrip([3, [person]]);
    await assertArgumentsRoundtrip([{ a: person }]);
  });

  it("should maintain string and symbol keys", async () => {
    await assertArgumentsRoundtrip([{ ":a": 1, b: 2 }]);
  });

  it("serialize a ActionController::Parameters", async () => {
    const parameters = new ParametersClass({ a: 1 });
    expect(await Arguments.serialize([parameters])[0]).toEqualRuby({
      a: 1,
      _aj_hash_with_indifferent_access: true,
    });
  });

  it("serialize a class with permitted? defined", async () => {
    await assertArgumentsUnchanged(MyClassWithPermitted);
  });

  it("serialize a String subclass object", async () => {
    let originalSerializers: unknown, myString: unknown, serialized: unknown, deserialized: unknown;
    try {
      originalSerializers = Serializers.serializers();
      Serializers.addSerializers(MyStringSerializer);
      myString = new MyString("foo");
      serialized = Arguments.serialize([myString]);
      deserialized = await (
        await Arguments.deserialize(await JSON.load(await JSON.dump(serialized)))
      )[0];
      expect(deserialized).toBeExactInstanceOf(MyString);
      expect(deserialized).toEqualRuby(myString);
    } finally {
      Serializers._additionalSerializers = originalSerializers as Set<unknown>;
    }
  });

  // PERMANENT-SKIP: CLAUDE.md "Ruby Strings are JS string primitives (no mutable String carrier)"
  it.skip("serialize a String subclass object without a serializer", async () => {
    const stringWithoutSerializer = new StringWithoutSerializer("foo");
    const serialized = Arguments.serialize([stringWithoutSerializer]);
    const deserialized = await (
      await Arguments.deserialize(await JSON.load(await JSON.dump(serialized)))
    )[0];
    expect(deserialized).toBeExactInstanceOf(rbCString);
    expect(deserialized).toEqualRuby(stringWithoutSerializer);
  });

  it("serialize a hash", async () => {
    const symbolKey: Record<string, unknown> = { ":a": 1 };
    const stringKey: Record<string, unknown> = { a: 1 };
    const indifferentAccess = await withIndifferentAccess({ ":a": 1 });
    expect(await Arguments.serialize([symbolKey])[0]).toEqualRuby({ a: 1, _aj_symbol_keys: ["a"] });
    expect(await Arguments.serialize([stringKey])[0]).toEqualRuby({ a: 1, _aj_symbol_keys: [] });
    expect(await Arguments.serialize([indifferentAccess])[0]).toEqualRuby({
      a: 1,
      _aj_hash_with_indifferent_access: true,
    });
  });

  it("deserialize a hash", async () => {
    const symbolKey: Record<string, unknown> = { a: 1, _aj_symbol_keys: ["a"] };
    const stringKey: Record<string, unknown> = { a: 1, _aj_symbol_keys: [] };
    const anotherStringKey: Record<string, unknown> = { a: 1 };
    const indifferentAccess: Record<string, unknown> = {
      a: 1,
      _aj_hash_with_indifferent_access: true,
    };
    const indifferentAccessSymbolKey = await withIndifferentAccess(symbolKey);
    expect(await (await Arguments.deserialize([symbolKey]))[0]).toEqualRuby({ ":a": 1 });
    expect(await (await Arguments.deserialize([stringKey]))[0]).toEqualRuby({ a: 1 });
    expect(await (await Arguments.deserialize([anotherStringKey]))[0]).toEqualRuby({ a: 1 });
    expect(await (await Arguments.deserialize([indifferentAccess]))[0]).toEqualRuby({ a: 1 });
    expect(await (await Arguments.deserialize([indifferentAccessSymbolKey]))[0]).toEqualRuby({
      ":a": 1,
    });
  });

  it("should maintain hash with indifferent access", async () => {
    const symbolKey: Record<string, unknown> = { ":a": 1 };
    const stringKey: Record<string, unknown> = { a: 1 };
    const indifferentAccess = await withIndifferentAccess({ ":a": 1 });
    expect(await (await performRoundTrip([symbolKey]))[0]).not.toBeExactInstanceOf(
      HashWithIndifferentAccess,
    );
    expect(await (await performRoundTrip([stringKey]))[0]).not.toBeExactInstanceOf(
      HashWithIndifferentAccess,
    );
    expect(await (await performRoundTrip([indifferentAccess]))[0]).toBeExactInstanceOf(
      HashWithIndifferentAccess,
    );
  });

  it("should maintain time with zone", async () => {
    await useZone("Alaska", async () => {
      const timeWithZone = await new RubyTime(2002, 10, 31, 2, 2, 2).inTimeZone();
      expect(await (await performRoundTrip([timeWithZone]))[0]).toBeExactInstanceOf(TimeWithZone);
      return await assertArgumentsUnchanged(timeWithZone);
    });
  });

  it("should maintain a functional duration", async () => {
    const duration = await (await performRoundTrip([await Duration.years(1)]))[0];
    expect(await duration.parts).toBeTypeOf("object");
    expect(await rbBinop(duration, "+", await Duration.years(1))).toEqualRuby(
      await Duration.years(2),
    );
  });

  it("should disallow non-string/symbol hash keys", async () => {
    await assertRaises([SerializationError], {}, () => Arguments.serialize([new Hash().set(1, 2)]));
    await assertRaises([SerializationError], {}, () =>
      Arguments.serialize([{ ":a": [new Hash().set(2, 3)] }]),
    );
  });

  it("should not allow reserved hash keys", async () => {
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
      await assertRaises([SerializationError], {}, () => Arguments.serialize([{ [key]: 1 }]));
    }
  });

  it("should not allow non-primitive objects", async () => {
    await assertRaises([SerializationError], {}, () =>
      Arguments.serialize([new (class Object {})()]),
    );
    await assertRaises([SerializationError], {}, () =>
      Arguments.serialize([1, [new (class Object {})()]]),
    );
  });

  it("allows for keyword arguments", async () => {
    await KwargsJob.performNow({ argument: 2 });
    expect(JobBuffer.lastValue()).toEqual("Job with argument: 2");
  });

  it("raises a friendly SerializationError for records without ids", async () => {
    const err = await assertRaises([SerializationError], {}, () =>
      Arguments.serialize([new Person(null)]),
    );
    expect(await err.message).toMatch("Unable to serialize Person without an id.");
  });
});
export class ModuleArgument {
  static readonly [classModule] = true;

  static toString(): string {
    return "ArgumentSerializationTest::ModuleArgument";
  }
}
registerConstant("ArgumentSerializationTest::ModuleArgument", ModuleArgument);
export class ClassArgument {
  static toString(): string {
    return "ArgumentSerializationTest::ModuleArgument::ClassArgument";
  }
}
registerConstant("ArgumentSerializationTest::ModuleArgument::ClassArgument", ClassArgument);
export class ArgumentSerializationTestClassArgument {
  static toString(): string {
    return "ArgumentSerializationTest::ClassArgument";
  }
}
registerConstant(
  "ArgumentSerializationTest::ClassArgument",
  ArgumentSerializationTestClassArgument,
);
export class MyClassWithPermitted {
  static toString(): string {
    return "ArgumentSerializationTest::MyClassWithPermitted";
  }

  static isPermitted() {}
}
registerConstant("ArgumentSerializationTest::MyClassWithPermitted", MyClassWithPermitted);
export class MyString extends String {
  static toString(): string {
    return "ArgumentSerializationTest::MyString";
  }
}
registerConstant("ArgumentSerializationTest::MyString", MyString);
export class MyStringSerializer extends ObjectSerializer {
  static toString(): string {
    return "ArgumentSerializationTest::MyStringSerializer";
  }

  serialize(argument: unknown) {
    return super.serialize({
      value: isSymbol(argument) ? symbolToS(argument) : rbObjAsString(argument),
    });
  }

  deserialize(hash: Record<string, unknown>) {
    return new MyString(hash["value"]);
  }

  /** @internal */
  protected klass() {
    return MyString;
  }
}
registerConstant("ArgumentSerializationTest::MyStringSerializer", MyStringSerializer);
export class StringWithoutSerializer extends String {
  static toString(): string {
    return "ArgumentSerializationTest::StringWithoutSerializer";
  }
}
registerConstant("ArgumentSerializationTest::StringWithoutSerializer", StringWithoutSerializer);
