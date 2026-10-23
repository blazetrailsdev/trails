import type {} from "@blazetrails/vitest-matchers";
import "./test-helpers/helper.js";
import { assertRaises, assertNoDifference } from "@blazetrails/activesupport";
import { ArgumentError, rbInspect, registerConstant } from "@blazetrails/ruby-compat";
import { SerializationError } from "./arguments.js";
import { Serializers } from "./serializers.js";
import { ObjectSerializer } from "./serializers/object-serializer.js";
import { beforeEach, afterEach, expect, it, describe } from "vitest";
import type { Set } from "@blazetrails/ruby-compat";

class SerializersTest {}

describe("SerializersTest", () => {
  let valueObject: unknown;
  let originalSerializers: unknown;

  beforeEach(() => {
    valueObject = new DummyValueObject(123);
    originalSerializers = Serializers.serializers();
  });

  afterEach(() => {
    Serializers._additionalSerializers = originalSerializers as Set<unknown>;
  });

  it("can't serialize unknown object", async () => {
    await assertRaises([SerializationError], {}, () => Serializers.serialize(valueObject));
  });

  it("will serialize objects with serializers registered", () => {
    Serializers.addSerializers(DummySerializer);
    expect(Serializers.serialize(valueObject)).toEqualRuby({
      _aj_serialized: "SerializersTest::DummySerializer",
      value: 123,
    });
  });

  it("won't deserialize unknown hash", async () => {
    const hash: Record<string, unknown> = { _dummy_serializer: 123, _aj_symbol_keys: [] };
    const error = await assertRaises([ArgumentError], {}, () => Serializers.deserialize(hash));
    expect(await error.message).toEqualRuby(
      `Serializer name is not present in the argument: ${rbInspect({ _dummy_serializer: 123, _aj_symbol_keys: [] })}`,
    );
  });

  it("won't deserialize unknown serializer", async () => {
    const hash: Record<string, unknown> = { _aj_serialized: "DoNotExist", value: 123 };
    const error = await assertRaises([ArgumentError], {}, () => Serializers.deserialize(hash));
    expect(await error.message).toEqual("Serializer DoNotExist is not known");
  });

  it("will deserialize known serialized objects", () => {
    Serializers.addSerializers(DummySerializer);
    const hash: Record<string, unknown> = {
      _aj_serialized: "SerializersTest::DummySerializer",
      value: 123,
    };
    expect(Serializers.deserialize(hash)).toEqualRuby(new DummyValueObject(123));
  });

  it("adds new serializer", async () => {
    Serializers.addSerializers(DummySerializer);
    expect(await Serializers.serializers().isInclude(DummySerializer)).toBeRubyTruthy();
  });

  it("can't add serializer with the same key twice", async () => {
    Serializers.addSerializers(DummySerializer);
    await assertNoDifference(
      async () => await Serializers.serializers().size(),
      undefined,
      () => Serializers.addSerializers(DummySerializer),
    );
  });
});
export class DummyValueObject {
  declare _value: number;

  static toString(): string {
    return "SerializersTest::DummyValueObject";
  }

  get value() {
    return this._value;
  }

  set value(value) {
    this._value = value;
  }

  constructor(value: number) {
    this._value = value;
  }

  equals(other: Record<string, unknown>) {
    return this.value === other.value;
  }
}
registerConstant("SerializersTest::DummyValueObject", DummyValueObject);
export class DummySerializer extends ObjectSerializer {
  static toString(): string {
    return "SerializersTest::DummySerializer";
  }

  serialize(object: Record<string, unknown>) {
    return super.serialize({ value: object.value });
  }

  deserialize(hash: Record<string, unknown>) {
    return new DummyValueObject(hash["value"] as number);
  }

  /** @internal */
  protected klass() {
    return DummyValueObject;
  }
}
registerConstant("SerializersTest::DummySerializer", DummySerializer);
