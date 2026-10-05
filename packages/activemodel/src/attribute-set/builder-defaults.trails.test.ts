import { describe, it, expect } from "vitest";
import { Builder, LazyAttributeHash } from "./builder.js";
import { Attribute } from "../attribute.js";
import { AttributeSet } from "../attribute-set.js";
import { registry } from "../type.js";
import { ValueType } from "../type/value.js";
import { Marshal, keys, rbObjDup } from "@blazetrails/ruby-compat";

const typeRegistry = registry();

describe("LazyAttributeHash defaultAttributes", () => {
  const strType = typeRegistry.lookup("string");
  const intType = typeRegistry.lookup("integer");

  it("returns the schema default attribute when key is in defaultAttributes but absent from values", () => {
    const types = { status: strType };
    const defaults = { status: Attribute.withCastValue("status", "active", strType) };
    const hash = new LazyAttributeHash(types, {}, {}, defaults);

    const attr = hash.get("status");
    expect(attr!.value()).toBe("active");
  });

  it("user-provided values override defaultAttributes", () => {
    const types = { status: strType };
    const defaults = { status: Attribute.withCastValue("status", "active", strType) };
    const hash = new LazyAttributeHash(types, { status: "archived" }, {}, defaults);

    expect(hash.get("status")!.value()).toBe("archived");
  });

  it("each_key without a block enumerates the keys AttributeSet#keys and #accessed select from", () => {
    const types = { status: strType, age: intType };
    const hash = new LazyAttributeHash(types, { status: "archived", extra: 1 });

    expect(hash.eachKey()).toEqual(["status", "age", "extra"]);

    const set = new AttributeSet(hash);
    expect(set.keys()).toEqual(["status", "extra"]);
    expect(set.accessed()).toEqual([]);
    set.fetchValue("status");
    expect(set.accessed()).toEqual(["status"]);
  });

  it("materializing a mutable schema default twice does not share the value", () => {
    const arrayType = Object.create(new ValueType()) as typeof strType;
    const types = { tags: arrayType };
    const prototype = Attribute.withCastValue("tags", ["a"], arrayType);
    void prototype.value();
    const defaults = { tags: prototype };

    const first = new LazyAttributeHash(types, {}, {}, defaults).get("tags");
    const second = new LazyAttributeHash(types, {}, {}, defaults).get("tags");
    (first!.value() as string[]).push("b");

    expect(first!.value()).toEqual(["a", "b"]);
    expect(second!.value()).toEqual(["a"]);
    expect(prototype.value()).toEqual(["a"]);
  });

  it("returns Uninitialized when key is absent from both values and defaultAttributes", () => {
    const types = { age: intType };
    const hash = new LazyAttributeHash(types, {});

    expect(hash.get("age")!.isInitialized()).toBe(false);
  });

  it("Builder#buildFromDatabase casts a present value using additionalTypes override", () => {
    const types = { score: strType };
    const builder = new Builder(types);
    const additional = { score: intType };
    const set = builder.buildFromDatabase({ score: "42" }, additional);
    expect(set.fetchValue("score")).toBe(42);
  });

  it("LazyAttributeHash uses additionalTypes for present values", () => {
    const hash = new LazyAttributeHash({ score: strType }, { score: "42" }, { score: intType });
    expect(hash.get("score")!.value()).toBe(42);
  });

  it("marshalDump/marshalLoad round-trips all five fields", () => {
    const types = { status: strType, score: strType };
    const additional = { score: intType };
    const defaults = { status: Attribute.withCastValue("status", "active", strType) };
    const original = new LazyAttributeHash(types, { score: "42" }, additional, defaults);
    original.get("score");

    const restored = Object.create(LazyAttributeHash.prototype) as LazyAttributeHash;
    restored.marshalLoad(original.marshalDump());
    expect(restored.delegateHash()["score"].value()).toBe(42);
    const fresh = Object.create(LazyAttributeHash.prototype) as LazyAttributeHash;
    fresh.marshalLoad([types, {}, additional, defaults]);
    expect(fresh.get("status")!.value()).toBe("active");
  });

  it("Marshal.load(Marshal.dump(hash)) answers an equal hash (builder.rb:142-148)", () => {
    const types = { status: strType, score: intType };
    const defaults = { status: Attribute.withCastValue("status", "active", strType) };
    const original = new LazyAttributeHash(types, { score: "42" }, {}, defaults);
    original.get("score");

    const loaded = Marshal.load(Marshal.dump(original)) as LazyAttributeHash;
    expect(loaded).toBeInstanceOf(LazyAttributeHash);
    expect(loaded.equals(Marshal.load(Marshal.dump(original)))).toBe(true);
    expect(loaded.eachKey()).toEqual(original.eachKey());
    for (const key of original.eachKey()) {
      expect(loaded.get(key)!.equals(original.get(key)!)).toBe(true);
    }
    expect(loaded.get("score")!.value()).toBe(42);
    expect(loaded.get("status")!.value()).toBe("active");
  });

  it("a Marshal-loaded hash equals the original, and dups, walks and excepts as it does (builder.rb:95,124-140)", () => {
    const types = { status: strType, score: intType };
    const defaults = { status: Attribute.withCastValue("status", "active", strType) };
    const original = new LazyAttributeHash(types, { score: "42" }, {}, defaults);
    original.get("score");

    const loaded = Marshal.load(Marshal.dump(original)) as LazyAttributeHash;
    expect(loaded.equals(original)).toBe(true);
    expect(original.equals(loaded)).toBe(true);

    const names = (hash: LazyAttributeHash) => {
      const seen: string[] = [];
      hash.eachValue((attr) => seen.push(`${attr.name}=${String(attr.value())}`));
      return seen;
    };
    expect(names(loaded)).toEqual(names(original));
    expect(names(loaded)).toHaveLength(2);

    expect(keys(loaded.except("score"))).toEqual(keys(original.except("score")));
    expect(keys(loaded.except("score"))).toEqual(["status"]);

    const copy = rbObjDup(loaded);
    expect(copy.delegateHash()).not.toBe(loaded.delegateHash());
    expect(copy.equals(original)).toBe(true);
    copy.set("extra", Attribute.withCastValue("extra", 1, intType));
    expect(loaded.isKey("extra")).toBe(false);
  });

  it("materialized default is detached from the prototype — mutation does not bleed across AttributeSets", () => {
    const types = { status: strType };
    const defaultProto = Attribute.withCastValue("status", "active", strType);
    const defaults = { status: defaultProto };

    const builder = new Builder(types, defaults);
    const setA = builder.buildFromDatabase({});
    const setB = builder.buildFromDatabase({});

    setA.set("status", setA.getAttribute("status").withValueFromUser("mutated"));

    expect(setA.fetchValue("status")).toBe("mutated");
    expect(setB.fetchValue("status")).toBe("active");
    expect(defaultProto.value()).toBe("active");
  });
});
