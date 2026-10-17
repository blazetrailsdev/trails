import "./test-helpers/helper.js";
import { assertRaises, assertNoDifference } from "@blazetrails/activesupport";
import "@blazetrails/activesupport/testing/autorun";
import { ArgumentError, rbInspect, registerConstant, rbEqual } from "@blazetrails/ruby-compat";
import { SerializationError } from "./arguments.js";
import { rbEnum, rbSize, TestHost } from "./codegen-runtime.js";
import { Serializers, serializers, serialize, addSerializers, deserialize } from "./serializers.js";
import { ObjectSerializer } from "./serializers/object-serializer.js";
import { describe, beforeEach, afterEach, it, expect } from "vitest";

describe("SerializersTest", () => {
  class SerializersTest extends TestHost {}
  registerConstant("SerializersTest", SerializersTest);
  beforeEach(async ({ testCase }: any) => {
    await testCase.setup();
  });
  afterEach(async ({ testCase }: any) => {
    await testCase.teardown();
  });
  beforeEach(async ({ testCase }: any) => {
    testCase._valueObject = new DummyValueObject(123);
    testCase._originalSerializers = await serializers();
  });
  afterEach(async ({ testCase }: any) => {
    Serializers._additionalSerializers = testCase._originalSerializers;
  });
  it("can't serialize unknown object", async ({ testCase }: any) => {
    await assertRaises(
      [SerializationError],
      {},
      async () => await serialize(testCase._valueObject),
    );
  });
  it("will serialize objects with serializers registered", async ({ testCase }: any) => {
    await addSerializers(DummySerializer);
    expect(await serialize(testCase._valueObject)).toEqual({
      _aj_serialized: "SerializersTest::DummySerializer",
      value: 123,
    });
  });
  it("won't deserialize unknown hash", async ({ testCase }: any) => {
    const hash: any = { _dummy_serializer: 123, _aj_symbol_keys: [] };
    const error: any = await assertRaises([ArgumentError], {}, async () => await deserialize(hash));
    expect(await error.message).toEqual(
      `Serializer name is not present in the argument: ${rbInspect({ _dummy_serializer: 123, _aj_symbol_keys: [] })}`,
    );
  });
  it("won't deserialize unknown serializer", async ({ testCase }: any) => {
    const hash: any = { _aj_serialized: "DoNotExist", value: 123 };
    const error: any = await assertRaises([ArgumentError], {}, async () => await deserialize(hash));
    expect(await error.message).toEqual("Serializer DoNotExist is not known");
  });
  it("will deserialize known serialized objects", async ({ testCase }: any) => {
    await addSerializers(DummySerializer);
    const hash: any = { _aj_serialized: "SerializersTest::DummySerializer", value: 123 };
    expect(await deserialize(hash)).toEqual(new DummyValueObject(123));
  });
  it("adds new serializer", async ({ testCase }: any) => {
    await addSerializers(DummySerializer);
    expect(await rbEnum(await serializers()).includes(DummySerializer)).toBeTruthy();
  });
  it("can't add serializer with the same key twice", async ({ testCase }: any) => {
    await addSerializers(DummySerializer);
    await assertNoDifference(
      async () => await rbSize(await serializers()),
      undefined,
      async () => await addSerializers(DummySerializer),
    );
  });
});
export class DummyValueObject {
  [key: string]: any;
  static [key: string]: any;

  get value(): any {
    return this._value;
  }

  set value(value: any) {
    this._value = value;
  }

  constructor(value: any) {
    this._value = value;
  }

  equals(other: any): any {
    return rbEqual(this.value, other.value);
  }
}
registerConstant("SerializersTest::DummyValueObject", DummyValueObject);
export class DummySerializer extends ObjectSerializer {
  [key: string]: any;
  static [key: string]: any;

  serialize(object: any): any {
    return super.serialize({ value: object.value });
  }

  deserialize(hash: any): any {
    return new DummyValueObject(hash["value"]);
  }

  /** @internal */
  protected klass(): any {
    return DummyValueObject;
  }
}
registerConstant("SerializersTest::DummySerializer", DummySerializer);
