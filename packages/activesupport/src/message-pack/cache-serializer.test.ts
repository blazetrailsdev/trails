import { describe, it, expect, beforeAll } from "vitest";
import {
  MessagePackCacheSerializer,
  UnserializableObjectError,
  registerObjectClass,
} from "./index.js";

class HasValue {
  constructor(readonly value: string) {}
}

class DefinesJsonCreate extends HasValue {
  static jsonCreate(hash: unknown): DefinesJsonCreate {
    return new DefinesJsonCreate((hash as { as_json: string }).as_json);
  }
  asJson(): { as_json: string } {
    return { as_json: this.value };
  }
}

class DefinesFromMsgpackExt extends DefinesJsonCreate {
  static fromMsgpackExt(string: unknown): DefinesFromMsgpackExt {
    return new DefinesFromMsgpackExt((string as string).replace(/msgpack_ext$/, ""));
  }
  toMsgpackExt(): string {
    return this.value + "msgpack_ext";
  }
}

class Unserializable extends HasValue {
  asJson(): Record<string, never> {
    return {};
  }
  toMsgpackExt(): string {
    return "";
  }
}

describe("MessagePackCacheSerializerTest", () => {
  const dump = (object: unknown) => MessagePackCacheSerializer.dump(object);
  const load = (dumped: Buffer) => MessagePackCacheSerializer.load(dumped);

  const assertRoundtrip = (object: HasValue) => {
    const serialized = dump(object);
    expect(serialized).toBeInstanceOf(Buffer);

    const deserialized = load(serialized);
    expect(deserialized).toBeInstanceOf(object.constructor);
    expect(deserialized).toEqual(object);
  };

  beforeAll(() => {
    registerObjectClass(DefinesJsonCreate);
    registerObjectClass(DefinesFromMsgpackExt);
  });

  it("uses #to_msgpack_ext and ::from_msgpack_ext to roundtrip unregistered objects", () => {
    assertRoundtrip(new DefinesFromMsgpackExt("foo"));
  });

  it("uses #as_json and ::json_create to roundtrip unregistered objects", () => {
    assertRoundtrip(new DefinesJsonCreate("foo"));
  });

  it("raises error when unable to serialize an unregistered object", () => {
    expect(() => dump(new Unserializable("foo"))).toThrow(UnserializableObjectError);
  });

  it("raises error when serializing an unregistered object with an anonymous class", () => {
    const Anon = class extends DefinesFromMsgpackExt {};
    Object.defineProperty(Anon, "name", { value: "" });
    expect(() => dump(new Anon("foo"))).toThrow(UnserializableObjectError);
  });

  it("handles missing class gracefully", () => {
    const Klass = class extends DefinesFromMsgpackExt {};
    Object.defineProperty(Klass, "name", { value: "DoesNotActuallyExist" });

    const dumped = dump(new Klass("foo"));
    expect(dumped).not.toBeNull();
    expect(load(dumped)).toBeUndefined();
  });
});
