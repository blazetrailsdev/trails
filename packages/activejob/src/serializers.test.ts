import { afterEach, beforeEach, describe, it } from "vitest";
import { assert, assertEqual, assertNoDifference, assertRaises } from "@blazetrails/activesupport";
import {
  ArgumentError,
  rbInspect,
  rbModConstSet,
  registerConstant,
} from "@blazetrails/ruby-compat";
import { ActiveJob } from "./namespaces.js";
import { ObjectSerializer } from "./serializers/object-serializer.js";
import type { SerializerLike } from "./namespaces.js";
import "./test-helpers/helper.js";

class SerializersTest {
  static toString(): string {
    return "SerializersTest";
  }
}
registerConstant("SerializersTest", SerializersTest);

class DummyValueObject {
  value: unknown;

  constructor(value: unknown) {
    this.value = value;
  }

  equals(other: DummyValueObject): boolean {
    return this.value === other.value;
  }
}
rbModConstSet(SerializersTest, "DummyValueObject", DummyValueObject);

class DummySerializer extends ObjectSerializer {
  serialize(object: DummyValueObject): Record<string, unknown> {
    return super.serialize({ value: object.value });
  }

  deserialize(hash: Record<string, unknown>): DummyValueObject {
    return new DummyValueObject(hash["value"]);
  }

  /** @internal */
  protected klass(): typeof DummyValueObject {
    return DummyValueObject;
  }
}
rbModConstSet(SerializersTest, "DummySerializer", DummySerializer);

describe("SerializersTest", () => {
  let valueObject: DummyValueObject;
  let originalSerializers: Set<SerializerLike>;

  beforeEach(() => {
    valueObject = new DummyValueObject(123);
    originalSerializers = ActiveJob.Serializers.serializers();
  });

  afterEach(() => {
    ActiveJob.Serializers._additionalSerializers = originalSerializers;
  });

  it("can't serialize unknown object", async () => {
    await assertRaises([ActiveJob.SerializationError], {}, () => {
      ActiveJob.Serializers.serialize(valueObject);
    });
  });

  it("will serialize objects with serializers registered", () => {
    ActiveJob.Serializers.addSerializers(DummySerializer);

    assertEqual(
      { _aj_serialized: "SerializersTest::DummySerializer", value: 123 },
      ActiveJob.Serializers.serialize(valueObject),
    );
  });

  it("won't deserialize unknown hash", async () => {
    const hash = { _dummy_serializer: 123, _aj_symbol_keys: [] };
    const error = await assertRaises([ArgumentError], {}, () => {
      ActiveJob.Serializers.deserialize(hash);
    });
    assertEqual(
      `Serializer name is not present in the argument: ${rbInspect({ _dummy_serializer: 123, _aj_symbol_keys: [] })}`,
      error.message,
    );
  });

  it("won't deserialize unknown serializer", async () => {
    const hash = { _aj_serialized: "DoNotExist", value: 123 };
    const error = await assertRaises([ArgumentError], {}, () => {
      ActiveJob.Serializers.deserialize(hash);
    });
    assertEqual("Serializer DoNotExist is not known", error.message);
  });

  it("will deserialize known serialized objects", () => {
    ActiveJob.Serializers.addSerializers(DummySerializer);
    const hash = { _aj_serialized: "SerializersTest::DummySerializer", value: 123 };
    assertEqual(new DummyValueObject(123), ActiveJob.Serializers.deserialize(hash));
  });

  it("adds new serializer", () => {
    ActiveJob.Serializers.addSerializers(DummySerializer);
    assert(ActiveJob.Serializers.serializers().has(DummySerializer));
  });

  it("can't add serializer with the same key twice", async () => {
    ActiveJob.Serializers.addSerializers(DummySerializer);
    await assertNoDifference(
      () => ActiveJob.Serializers.serializers().size,
      null,
      () => {
        ActiveJob.Serializers.addSerializers(DummySerializer);
      },
    );
  });
});
