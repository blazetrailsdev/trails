// @ts-nocheck
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
import "@blazetrails/activesupport/testing/autorun";
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
  first,
  JSON,
  rbCString,
  rbFSend,
  Hash,
  rbObjIsKindOf,
  registerConstant,
  Module,
} from "@blazetrails/ruby-compat";
import { Arguments, SerializationError, DeserializationError } from "./arguments.js";
import { rbBinop, RubyObject, rbAryEnsure, TestHost } from "./codegen-runtime.js";
import { Serializers, serializers, addSerializers } from "./serializers.js";
import { ObjectSerializer } from "./serializers/object-serializer.js";
import { ArgumentsRoundTripJob } from "./test-helpers/jobs/arguments-round-trip-job.js";
import { KwargsJob } from "./test-helpers/jobs/kwargs-job.js";
import { Person } from "./test-helpers/models/person.js";
import { lastValue } from "./test-helpers/support/job-buffer.js";
import { Parameters } from "./test-helpers/support/stubs/strong-parameters.js";
import { describe, beforeEach, it, expect, afterEach } from "vitest";

describe("ArgumentSerializationTest", () => {
  class ArgumentSerializationTest extends TestHost {
    async assertArgumentsUnchanged(...args: any[]): Promise<any> {
      return await this.assertArgumentsRoundtrip(args);
    }

    async assertArgumentsRoundtrip(args: any): Promise<any> {
      return this.assertEqual(args, await this.performRoundTrip(args));
    }

    async performRoundTrip(args: any): Promise<any> {
      await ArgumentsRoundTripJob.performLater(...rbAryEnsure(args));
      return lastValue();
    }
  }
  registerConstant("ArgumentSerializationTest", ArgumentSerializationTest);
  beforeEach(async ({ testCase }: any) => {
    await testCase.setup();
  });
  afterEach(async ({ testCase }: any) => {
    await testCase.teardown();
  });
  beforeEach(async ({ testCase }: any) => {
    testCase._person = await Person.find("5");
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
      TimeZone.find("UTC"),
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
        TimeZone.find("UTC"),
      ),
      null,
      false,
    ),
  ]) {
    (
      (["DateTime", "Range"].includes(rbObjClassname(arg)) || `${rbInspect(arg)}` === "1 day"
        ? it.skip
        : it) as typeof it
    )(
      `serializes ${rbObjClassname(arg)} - ${rbInspect(arg)} verbatim`,
      async ({ testCase }: any) => {
        await await testCase.assertArgumentsUnchanged(arg);
      },
    );
  }
  for (const arg of [
    new RubyObject(),
    Person.find("5").toGid(),
    class extends Object {
      static [key: string]: any;
      [key: string]: any;
    },
  ]) {
    it(`does not serialize ${rbObjClassname(arg)}`, async ({ testCase }: any) => {
      await assertRaises([SerializationError], {}, async () => await Arguments.serialize([arg]));
      await assertRaises(
        [DeserializationError],
        {},
        async () => await await Arguments.deserialize([arg]),
      );
    });
  }
  it("should convert records to Global IDs", async ({ testCase }: any) => {
    await await testCase.assertArgumentsRoundtrip([testCase._person]);
  });
  it("should keep Global IDs strings as they are", async ({ testCase }: any) => {
    await await testCase.assertArgumentsRoundtrip([
      await ((v: any) => (isSymbol(v) ? symbolToS(v) : rbObjAsString(v)))(
        await testCase._person.toGid(),
      ),
    ]);
  });
  it("should dive deep into arrays and hashes", async ({ testCase }: any) => {
    await await testCase.assertArgumentsRoundtrip([3, [testCase._person]]);
    await await testCase.assertArgumentsRoundtrip([{ a: testCase._person }]);
  });
  it("should maintain string and symbol keys", async ({ testCase }: any) => {
    await await testCase.assertArgumentsRoundtrip([{ ":a": 1, b: 2 }]);
  });
  it("serialize a ActionController::Parameters", async ({ testCase }: any) => {
    const parameters: any = new Parameters({ a: 1 });
    expect(await first(await Arguments.serialize([parameters]))).toEqual({
      a: 1,
      _aj_hash_with_indifferent_access: true,
    });
  });
  it("serialize a class with permitted? defined", async ({ testCase }: any) => {
    await await testCase.assertArgumentsUnchanged(MyClassWithPermitted);
  });
  it("serialize a String subclass object", async ({ testCase }: any) => {
    let originalSerializers: any, myString: any, serialized: any, deserialized: any;
    try {
      originalSerializers = await serializers();
      await addSerializers(MyStringSerializer);
      myString = new MyString("foo");
      serialized = await Arguments.serialize([myString]);
      deserialized = await first(
        await await Arguments.deserialize(await JSON.load(await JSON.dump(serialized))),
      );
      expect(deserialized).toBeInstanceOf(MyString);
      expect(deserialized).toEqual(myString);
    } finally {
      Serializers._additionalSerializers = originalSerializers;
    }
  });
  it.skip("serialize a String subclass object without a serializer", async ({ testCase }: any) => {
    const stringWithoutSerializer: any = new StringWithoutSerializer("foo");
    const serialized: any = await Arguments.serialize([stringWithoutSerializer]);
    const deserialized: any = await first(
      await await Arguments.deserialize(await JSON.load(await JSON.dump(serialized))),
    );
    expect(deserialized).toBeInstanceOf(rbCString);
    expect(deserialized).toEqual(stringWithoutSerializer);
  });
  it("serialize a hash", async ({ testCase }: any) => {
    const symbolKey: any = { ":a": 1 };
    const stringKey: any = { a: 1 };
    const indifferentAccess: any = await withIndifferentAccess({ ":a": 1 });
    expect(await first(await Arguments.serialize([symbolKey]))).toEqual({
      a: 1,
      _aj_symbol_keys: ["a"],
    });
    expect(await first(await Arguments.serialize([stringKey]))).toEqual({
      a: 1,
      _aj_symbol_keys: [],
    });
    expect(await first(await Arguments.serialize([indifferentAccess]))).toEqual({
      a: 1,
      _aj_hash_with_indifferent_access: true,
    });
  });
  it.skip("deserialize a hash", async ({ testCase }: any) => {
    const symbolKey: any = { a: 1, _aj_symbol_keys: ["a"] };
    const stringKey: any = { a: 1, _aj_symbol_keys: [] };
    const anotherStringKey: any = { a: 1 };
    const indifferentAccess: any = { a: 1, _aj_hash_with_indifferent_access: true };
    const indifferentAccessSymbolKey: any = await withIndifferentAccess(symbolKey);
    expect(await first(await await Arguments.deserialize([symbolKey]))).toEqual({ ":a": 1 });
    expect(await first(await await Arguments.deserialize([stringKey]))).toEqual({ a: 1 });
    expect(await first(await await Arguments.deserialize([anotherStringKey]))).toEqual({ a: 1 });
    expect(await first(await await Arguments.deserialize([indifferentAccess]))).toEqual({ a: 1 });
    expect(await first(await await Arguments.deserialize([indifferentAccessSymbolKey]))).toEqual({
      ":a": 1,
    });
  });
  it("should maintain hash with indifferent access", async ({ testCase }: any) => {
    const symbolKey: any = { ":a": 1 };
    const stringKey: any = { a: 1 };
    const indifferentAccess: any = await withIndifferentAccess({ ":a": 1 });
    expect(await first(await await testCase.performRoundTrip([symbolKey]))).not.toBeInstanceOf(
      HashWithIndifferentAccess,
    );
    expect(await first(await await testCase.performRoundTrip([stringKey]))).not.toBeInstanceOf(
      HashWithIndifferentAccess,
    );
    expect(await first(await await testCase.performRoundTrip([indifferentAccess]))).toBeInstanceOf(
      HashWithIndifferentAccess,
    );
  });
  it("should maintain time with zone", async ({ testCase }: any) => {
    await useZone("Alaska", async () => {
      const timeWithZone: any = await rbFSend(new RubyTime(2002, 10, 31, 2, 2, 2), "inTimeZone");
      expect(await first(await await testCase.performRoundTrip([timeWithZone]))).toBeInstanceOf(
        TimeWithZone,
      );
      return await await testCase.assertArgumentsUnchanged(timeWithZone);
    });
  });
  it.skip("should maintain a functional duration", async ({ testCase }: any) => {
    const duration: any = await first(
      await await testCase.performRoundTrip([await Duration.years(1)]),
    );
    expect(rbObjIsKindOf(await duration.parts, Hash)).toBe(true);
    expect(await rbBinop(duration, "+", await Duration.years(1))).toEqual(await Duration.years(2));
  });
  it("should disallow non-string/symbol hash keys", async ({ testCase }: any) => {
    await assertRaises(
      [SerializationError],
      {},
      async () => await Arguments.serialize([new Hash().set(1, 2)]),
    );
    await assertRaises(
      [SerializationError],
      {},
      async () => await Arguments.serialize([{ ":a": [new Hash().set(2, 3)] }]),
    );
  });
  it("should not allow reserved hash keys", async ({ testCase }: any) => {
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
      await assertRaises(
        [SerializationError],
        {},
        async () => await Arguments.serialize([{ [key]: 1 }]),
      );
    }
  });
  it("should not allow non-primitive objects", async ({ testCase }: any) => {
    await assertRaises(
      [SerializationError],
      {},
      async () => await Arguments.serialize([new RubyObject()]),
    );
    await assertRaises(
      [SerializationError],
      {},
      async () => await Arguments.serialize([1, [new RubyObject()]]),
    );
  });
  it("allows for keyword arguments", async ({ testCase }: any) => {
    await await KwargsJob.performNow({ argument: 2 });
    expect(await lastValue()).toEqual("Job with argument: 2");
  });
  it("raises a friendly SerializationError for records without ids", async ({ testCase }: any) => {
    const err: any = await assertRaises(
      [SerializationError],
      {},
      async () => await Arguments.serialize([new Person(null)]),
    );
    expect(await err.message).toMatch("Unable to serialize Person without an id.");
  });
});
export const ModuleArgument: any = new Module();
registerConstant("ArgumentSerializationTest::ModuleArgument", ModuleArgument);
export class ClassArgument {
  [key: string]: any;
  static [key: string]: any;
}
registerConstant("ArgumentSerializationTest::ModuleArgument::ClassArgument", ClassArgument);
export class ArgumentSerializationTestClassArgument {
  [key: string]: any;
  static [key: string]: any;
}
registerConstant(
  "ArgumentSerializationTest::ClassArgument",
  ArgumentSerializationTestClassArgument,
);
export class MyClassWithPermitted {
  [key: string]: any;
  static [key: string]: any;

  static isPermitted(): any {}
}
registerConstant("ArgumentSerializationTest::MyClassWithPermitted", MyClassWithPermitted);
export class MyString extends rbCString {
  [key: string]: any;
  static [key: string]: any;
}
registerConstant("ArgumentSerializationTest::MyString", MyString);
export class MyStringSerializer extends ObjectSerializer {
  [key: string]: any;
  static [key: string]: any;

  serialize(argument: any): any {
    return super.serialize({
      value: isSymbol(argument) ? symbolToS(argument) : rbObjAsString(argument),
    });
  }

  deserialize(hash: any): any {
    return new MyString(hash["value"]);
  }

  /** @internal */
  protected klass(): any {
    return MyString;
  }
}
registerConstant("ArgumentSerializationTest::MyStringSerializer", MyStringSerializer);
export class StringWithoutSerializer extends rbCString {
  [key: string]: any;
  static [key: string]: any;
}
registerConstant("ArgumentSerializationTest::StringWithoutSerializer", StringWithoutSerializer);
