import { describe, it, expect, expectTypeOf } from "vitest";
import { rbObjDup } from "@blazetrails/ruby-compat";
import { Psych } from "@blazetrails/ruby-compat/psych";
import { Parameters, UnpermittedParameters } from "./strong-parameters.js";

describe("Parameters#unpermitted_parameters!", () => {
  it("raises on_unpermitted: :raise regardless of the class default", () => {
    const params = new Parameters({ name: "John", admin: true });
    expect(() =>
      params.unpermittedParametersBang(new Parameters({ name: "John" }), {
        onUnpermitted: "raise",
      }),
    ).toThrow(new UnpermittedParameters(["admin"]).message);
  });
});

describe("Parameters#expect types", () => {
  const params = new Parameters({
    id: "1",
    post: { title: "Hi", body: "There" },
    comment: { text: "ok" },
  });

  it("a single hash filter returns the permitted Parameters", () => {
    const post = params.expect({ post: ["title", "body"] });
    expectTypeOf(post).toEqualTypeOf<Parameters>();
    expect(post).toBeInstanceOf(Parameters);
    expect(post.permitted).toBe(true);
    expectTypeOf(params.expectBang({ post: ["title"] })).toEqualTypeOf<Parameters>();
  });

  it("a hash naming several keys returns one Parameters per key", () => {
    const values = params.expect({ post: ["title"], comment: ["text"] });
    expectTypeOf(values).toEqualTypeOf<Parameters[]>();
    expect(values).toHaveLength(2);
  });

  it("several scalar keys return one value per key", () => {
    const values = params.expect("id", "id");
    expectTypeOf(values).toEqualTypeOf<unknown[]>();
    expect(values).toEqual(["1", "1"]);
  });

  it("array and array-of-hashes filters fall through to the untyped overload", () => {
    const withTags = new Parameters({
      post: { title: "Hi" },
      tags: ["a"],
      comments: [{ text: "ok" }],
    });
    expectTypeOf(withTags.expect({ tags: [] })).toBeUnknown();
    expectTypeOf(withTags.expect({ comments: [["text"]] })).toBeUnknown();
    expectTypeOf(withTags.expect({ post: ["title"], tags: [] })).toBeUnknown();
    expect(withTags.expect({ tags: [] })).toEqual(["a"]);
  });

  it("a scalar key returns the scalar", () => {
    const id = params.expect("id");
    expectTypeOf(id).toBeUnknown();
    expect(id).toBe("1");
  });
});

describe("ActionController::Parameters", () => {
  it("hashes by class, content and permitted flag, whatever the insertion order", () => {
    const left = new Parameters({ a: "1", b: "2" });
    const right = new Parameters({ b: "2", a: "1" });
    expect(left.eql(right)).toBe(true);
    expect(left.hash()).toBe(right.hash());
    expect(left.hash()).not.toBe(new Parameters({ a: "1", b: "3" }).hash());
    expect(left.hash()).not.toBe(new Parameters({ a: "1", b: "2" }).permitBang().hash());
  });

  it("binds each alias_method name to its original's function", () => {
    const proto = Parameters.prototype;
    expect(proto.hasKey).toBe(proto.include);
    expect(proto.isKey).toBe(proto.include);
    expect(proto.member).toBe(proto.include);
    expect(proto.toParam).toBe(proto.toQuery);
    expect(proto.toUnsafeHash).toBe(proto.toUnsafeH);
    expect(proto.each).toBe(proto.eachPair);
    expect(proto.without).toBe(proto.except);
    expect(proto.keepIf).toBe(proto.selectBang);
    expect(proto.deleteIf).toBe(proto.rejectBang);
    expect(proto.withDefaults).toBe(proto.reverseMerge);
    expect(proto.withDefaultsBang).toBe(proto.reverseMergeBang);
    expect(new Parameters({ a: 1 }).include("toString")).toBe(false);
    expect(new Parameters({ a: 1 }).exclude("toString")).toBe(true);
    expect(new Parameters({ a: 1 }).exclude("a")).toBe(false);
  });

  it("aliases required to require", () => {
    const params = new Parameters({ person: { name: "Francesco" } });
    expect(Parameters.prototype.required).toBe(Parameters.prototype.require);
    expect((params.required("person") as Parameters).get("name")).toBe("Francesco");
    expect(() => params.required("missing")).toThrow(
      "param is missing or the value is empty or invalid: missing",
    );
  });

  it("dups through initialize_copy, sharing nested values but not the top-level hash", () => {
    const params = new Parameters({ person: { name: "Francesco" }, tags: ["a"] });
    const person = params.get("person");
    for (const dupped of [rbObjDup(params), params.stringifyKeys()]) {
      expect(dupped.get("person")).toBe(person);
      dupped.set("extra", "1");
      expect(params.hasKey("extra")).toBe(false);
    }
  });

  it("initializes from each coder tag and encodes parameters and permitted", () => {
    const allocate = (tag: string, map: Record<string, unknown>) => {
      const params = Object.create(Parameters.prototype) as Parameters;
      params.initWith(Object.assign(new Psych.Coder(tag), map));
      return params;
    };

    const legacy = allocate("!ruby/hash:ActionController::Parameters", { key: ":value" });
    expect([legacy.get("key"), legacy.permitted]).toEqual([":value", false]);

    const withIvars = allocate("!ruby/hash-with-ivars:ActionController::Parameters", {
      elements: { key: ":value" },
      ivars: { ":@permitted": true },
    });
    expect([withIvars.get("key"), withIvars.permitted]).toEqual([":value", true]);

    const object = allocate("!ruby/object:ActionController::Parameters", {
      parameters: { key: ":value" },
      permitted: true,
    });
    expect([object.get("key"), object.permitted]).toEqual([":value", true]);

    const coder = new Psych.Coder(null);
    object.encodeWith(coder);
    expect({ ...coder }).toEqual({ parameters: { key: ":value" }, permitted: true });
  });
});
