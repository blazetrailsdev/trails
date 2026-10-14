import { describe, it, expect, beforeAll } from "vitest";
import { MessagePack, UnserializableObjectError } from "../message-pack.js";
import { env as ENV, registerConstant, setEnv } from "@blazetrails/ruby-compat";
import { assertNotNil } from "../testing/assertions.js";

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
  const dump = (object: unknown) => MessagePack.CacheSerializer.dump(object);
  const load = (dumped: Uint8Array) => MessagePack.CacheSerializer.load(dumped);

  const assertRoundtrip = (object: HasValue) => {
    const serialized = dump(object);
    expect(serialized).toBeInstanceOf(Uint8Array);

    const deserialized = load(serialized);
    expect(deserialized).toBeInstanceOf(object.constructor);
    expect(deserialized).toEqual(object);
  };

  beforeAll(() => {
    registerConstant("DefinesJsonCreate", DefinesJsonCreate);
    registerConstant("DefinesFromMsgpackExt", DefinesFromMsgpackExt);
  });

  it("works with ENV['RAILS_MAX_THREADS']", () => {
    const originalEnv = { ...ENV };
    setEnv("RAILS_MAX_THREADS", "1");
    try {
      const serialized = dump("value");
      expect(serialized).toBeInstanceOf(Uint8Array);

      const deserialized = load(serialized);
      expect(typeof deserialized).toBe("string");
      expect(deserialized).toBe("value");
    } finally {
      for (const name of Object.keys(ENV)) if (!(name in originalEnv)) setEnv(name, undefined);
      for (const [name, value] of Object.entries(originalEnv)) setEnv(name, value);
    }
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
    assertNotNil(dumped);
    expect(load(dumped)).toBeUndefined();
  });
});
