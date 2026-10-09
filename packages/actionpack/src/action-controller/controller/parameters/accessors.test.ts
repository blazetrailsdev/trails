import { beforeEach, describe, it } from "vitest";
import {
  assert,
  assertEmpty,
  assertEqual,
  assertKindOf,
  assertMatch,
  assertNil,
  assertNot,
  assertNotEmpty,
  assertNotPredicate,
  assertPredicate,
  assertSame,
} from "@blazetrails/activesupport";
import { Enumerator, rbInspect } from "@blazetrails/ruby-compat";
import { Parameters } from "../../metal/strong-parameters.js";

describe("ParametersAccessorsTest", () => {
  let params: Parameters;
  beforeEach(() => {
    Parameters.permitAllParameters = false;

    params = new Parameters({
      person: {
        age: "32",
        name: {
          first: "David",
          last: "Heinemeier Hansson",
        },
        addresses: [{ city: "Chicago", state: "Illinois" }],
      },
    });
  });

  it("each returns self", () => {
    assertSame(
      params,
      params.each((_) => _),
    );
  });

  it("each_pair returns self", () => {
    assertSame(
      params,
      params.eachPair((_) => _),
    );
  });

  it("each_value returns self", () => {
    assertSame(
      params,
      params.eachValue((_) => _),
    );
  });

  it("[] retains permitted status", () => {
    params.permitBang();
    assertPredicate(params.get("person") as Parameters, (p) => p.permitted);
    assertPredicate(
      (params.get("person") as Parameters).get("name") as Parameters,
      (p) => p.permitted,
    );
  });

  it("[] retains unpermitted status", () => {
    assertNotPredicate(params.get("person") as Parameters, (p) => p.permitted);
    assertNotPredicate(
      (params.get("person") as Parameters).get("name") as Parameters,
      (p) => p.permitted,
    );
  });

  it("as_json returns the JSON representation of the parameters hash", () => {
    assertNot(Object.hasOwn(params.asJson(), "parameters"));
    assertNot(Object.hasOwn(params.asJson(), "permitted"));
    assert(Object.hasOwn(params.asJson(), "person"));
  });

  it("to_s returns the string representation of the parameters hash", () => {
    assertEqual(
      rbInspect({
        person: {
          age: "32",
          name: { first: "David", last: "Heinemeier Hansson" },
          addresses: [{ city: "Chicago", state: "Illinois" }],
        },
      }),
      params.toString(),
    );
  });

  it("each carries permitted status", () => {
    params.permitBang();
    params.each(([key, value]) => {
      if (key === "person") assertPredicate(value as Parameters, (p) => p.permitted);
    });
  });

  it("each carries unpermitted status", () => {
    params.each(([key, value]) => {
      if (key === "person") assertNot((value as Parameters).permitted);
    });
  });

  it("each returns key,value array for block with arity 1", () => {
    params.each((arg) => {
      assertKindOf(Array, arg);
      assertEqual("person", arg[0]);
      assertKindOf(Parameters, arg[1]);
    });
  });

  it("each without a block returns an enumerator", () => {
    assertKindOf(Enumerator, params.each());
    assertEqual(params, new Parameters(Object.fromEntries(params.each())));
  });

  it("each_pair carries permitted status", () => {
    params.permitBang();
    params.eachPair(([key, value]) => {
      if (key === "person") assertPredicate(value as Parameters, (p) => p.permitted);
    });
  });

  it("each_pair carries unpermitted status", () => {
    params.eachPair(([key, value]) => {
      if (key === "person") assertNot((value as Parameters).permitted);
    });
  });

  it("each_pair returns key,value array for block with arity 1", () => {
    params.eachPair((arg) => {
      assertKindOf(Array, arg);
      assertEqual("person", arg[0]);
      assertKindOf(Parameters, arg[1]);
    });
  });

  it("each_pair without a block returns an enumerator", () => {
    assertKindOf(Enumerator, params.eachPair());
    assertEqual(params, new Parameters(Object.fromEntries(params.eachPair())));
  });

  it("each_value carries permitted status", () => {
    params.permitBang();
    params.eachValue((value) => {
      assertPredicate(value as Parameters, (p) => p.permitted);
    });
  });

  it("each_value carries unpermitted status", () => {
    params.eachValue((value) => {
      assertNotPredicate(value as Parameters, (p) => p.permitted);
    });
  });

  it("each_value without a block returns an enumerator", () => {
    assertKindOf(Enumerator, params.eachValue());
    assertEqual(params.values, [...params.eachValue()]);
  });

  it("each_key converts to hash for permitted", () => {
    params.permitBang();
    params.eachKey((key) => {
      if (key === "person") assertKindOf(String, key);
    });
  });

  it("each_key converts to hash for unpermitted", () => {
    params.eachKey((key) => {
      if (key === "person") assertKindOf(String, key);
    });
  });

  it("each_key without a block returns an enumerator", () => {
    assertKindOf(Enumerator, params.eachKey());
    assertEqual(params.keys, [...params.eachKey()]);
  });

  it("empty? returns true when params contains no key/value pairs", () => {
    const params = new Parameters();
    assertEmpty(params);
  });

  it("empty? returns false when any params are present", () => {
    assertNotEmpty(params);
  });

  it("except retains permitted status", () => {
    params.permitBang();
    assertPredicate(params.except("person"), (p) => p.permitted);
    assertPredicate((params.get("person") as Parameters).except("name"), (p) => p.permitted);
  });

  it("except retains unpermitted status", () => {
    assertNotPredicate(params.except("person"), (p) => p.permitted);
    assertNotPredicate((params.get("person") as Parameters).except("name"), (p) => p.permitted);
  });

  it("without retains permitted status", () => {
    params.permitBang();
    assertPredicate(params.without("person"), (p) => p.permitted);
    assertPredicate((params.get("person") as Parameters).without("name"), (p) => p.permitted);
  });

  it("without retains unpermitted status", () => {
    assertNotPredicate(params.without("person"), (p) => p.permitted);
    assertNotPredicate((params.get("person") as Parameters).without("name"), (p) => p.permitted);
  });

  it("exclude? returns true if the given key is not present in the params", () => {
    assert(params.exclude("address"));
  });

  it("exclude? returns false if the given key is present in the params", () => {
    assertNot(params.exclude("person"));
  });

  it("fetch retains permitted status", () => {
    params.permitBang();
    assertPredicate(params.fetch("person") as Parameters, (p) => p.permitted);
    assertPredicate(
      (params.get("person") as Parameters).fetch("name") as Parameters,
      (p) => p.permitted,
    );
  });

  it("fetch retains unpermitted status", () => {
    assertNotPredicate(params.fetch("person") as Parameters, (p) => p.permitted);
    assertNotPredicate(
      (params.get("person") as Parameters).fetch("name") as Parameters,
      (p) => p.permitted,
    );
  });

  it("has_key? returns true if the given key is present in the params", () => {
    assert(params.hasKey("person"));
  });

  it("has_key? returns false if the given key is not present in the params", () => {
    assertNot(params.hasKey("address"));
  });

  it("has_value? returns true if the given value is present in the params", () => {
    const params = new Parameters({ city: "Chicago", state: "Illinois" });
    assert(params.hasValue("Chicago"));
  });

  it("has_value? returns false if the given value is not present in the params", () => {
    const params = new Parameters({ city: "Chicago", state: "Illinois" });
    assertNot(params.hasValue("New York"));
  });

  it("include? returns true if the given key is present in the params", () => {
    assert(params.include("person"));
  });

  it("include? returns false if the given key is not present in the params", () => {
    assertNot(params.include("address"));
  });

  it("key? returns true if the given key is present in the params", () => {
    assert(params.isKey("person"));
  });

  it("key? returns false if the given key is not present in the params", () => {
    assertNot(params.isKey("address"));
  });

  it("member? returns true if the given key is present in the params", () => {
    assert(params.member("person"));
  });

  it("member? returns false if the given key is not present in the params", () => {
    assertNot(params.member("address"));
  });

  it("keys returns an array of the keys of the params", () => {
    assertEqual(["person"], params.keys);
    assertEqual(["age", "name", "addresses"], (params.get("person") as Parameters).keys);
  });

  it("reject retains permitted status", () => {
    assertNotPredicate(
      params.reject((k) => k === "person"),
      (p) => p.permitted,
    );
  });

  it("reject retains unpermitted status", () => {
    params.permitBang();
    assertPredicate(
      params.reject((k) => k === "person"),
      (p) => p.permitted,
    );
  });

  it("select retains permitted status", () => {
    params.permitBang();
    assertPredicate(
      params.select((k) => k === "person"),
      (p) => p.permitted,
    );
  });

  it("select retains unpermitted status", () => {
    assertNotPredicate(
      params.select((k) => k === "person"),
      (p) => p.permitted,
    );
  });

  it("slice retains permitted status", () => {
    params.permitBang();
    assertPredicate(params.slice("person"), (p) => p.permitted);
  });

  it("slice retains unpermitted status", () => {
    assertNotPredicate(params.slice("person"), (p) => p.permitted);
  });

  it("transform_keys retains permitted status", () => {
    params.permitBang();
    assertPredicate(
      params.transformKeys((k) => k),
      (p) => p.permitted,
    );
  });

  it("transform_keys retains unpermitted status", () => {
    assertNotPredicate(
      params.transformKeys((k) => k),
      (p) => p.permitted,
    );
  });

  // BLOCKED: parameters-transform-keys-and-values-have-no-enumerator-arm
  it.skip("transform_keys without a block returns an enumerator", () => {
    // @ts-expect-error -- the block-less arm is unported
    assertKindOf(Enumerator, params.transformKeys());
    assertKindOf(
      Parameters,
      // @ts-expect-error -- the block-less arm is unported
      params.transformKeys().each((k) => k),
    );
  });

  // BLOCKED: parameters-transform-keys-and-values-have-no-enumerator-arm
  it.skip("transform_keys! without a block returns an enumerator", () => {
    // @ts-expect-error -- the block-less arm is unported
    assertKindOf(Enumerator, params.transformKeysBang());
    assertKindOf(
      Parameters,
      // @ts-expect-error -- the block-less arm is unported
      params.transformKeysBang().each((k) => k),
    );
  });

  it("deep_transform_keys retains permitted status", () => {
    params.permitBang();
    assertPredicate(
      params.deepTransformKeys((k) => k),
      (p) => p.permitted,
    );
  });

  it("deep_transform_keys retains unpermitted status", () => {
    assertNotPredicate(
      params.deepTransformKeys((k) => k),
      (p) => p.permitted,
    );
  });

  it("transform_values retains permitted status", () => {
    params.permitBang();
    assertPredicate(
      params.transformValues((v) => v),
      (p) => p.permitted,
    );
  });

  it("transform_values retains unpermitted status", () => {
    assertNotPredicate(
      params.transformValues((v) => v),
      (p) => p.permitted,
    );
  });

  it("transform_values converts hashes to parameters", () => {
    params.transformValues((value) => {
      assertKindOf(Parameters, value);
      return value;
    });
  });

  // BLOCKED: parameters-transform-keys-and-values-have-no-enumerator-arm
  it.skip("transform_values without a block returns an enumerator", () => {
    // @ts-expect-error -- the block-less arm is unported
    assertKindOf(Enumerator, params.transformValues());
    assertKindOf(
      Parameters,
      // @ts-expect-error -- the block-less arm is unported
      params.transformValues().each((v) => v),
    );
  });

  it("transform_values! converts hashes to parameters", () => {
    params.transformValuesBang((value) => assertKindOf(Parameters, value));
  });

  // BLOCKED: parameters-transform-keys-and-values-have-no-enumerator-arm
  it.skip("transform_values! without a block returns an enumerator", () => {
    // @ts-expect-error -- the block-less arm is unported
    assertKindOf(Enumerator, params.transformValuesBang());
    assertKindOf(
      Parameters,
      // @ts-expect-error -- the block-less arm is unported
      params.transformValuesBang().each((v) => v),
    );
  });

  it("value? returns true if the given value is present in the params", () => {
    const params = new Parameters({ city: "Chicago", state: "Illinois" });
    assert(params.isValue("Chicago"));
  });

  it("value? returns false if the given value is not present in the params", () => {
    const params = new Parameters({ city: "Chicago", state: "Illinois" });
    assertNot(params.isValue("New York"));
  });

  it("values returns an array of the values of the params", () => {
    const params = new Parameters({
      city: "Chicago",
      state: "Illinois",
      person: new Parameters({ first_name: "David" }),
    });
    assertEqual(["Chicago", "Illinois", new Parameters({ first_name: "David" })], params.values);
  });

  it("values_at retains permitted status", () => {
    params.permitBang();
    assertPredicate(params.valuesAt("person")[0] as Parameters, (p) => p.permitted);
    assertPredicate(
      (params.get("person") as Parameters).valuesAt("name")[0] as Parameters,
      (p) => p.permitted,
    );
  });

  it("values_at retains unpermitted status", () => {
    assertNotPredicate(params.valuesAt("person")[0] as Parameters, (p) => p.permitted);
    assertNotPredicate(
      (params.get("person") as Parameters).valuesAt("name")[0] as Parameters,
      (p) => p.permitted,
    );
  });

  it("is equal to Parameters instance with same params", () => {
    const params1 = new Parameters({ a: 1, b: 2 });
    const params2 = new Parameters({ a: 1, b: 2 });
    assert(params1.equals(params2));
    assert(params1.hash() === params2.hash());
  });

  it("is equal to Parameters instance with same permitted params", () => {
    const params1 = new Parameters({ a: 1, b: 2 }).permit("a");
    const params2 = new Parameters({ a: 1, b: 2 }).permit("a");
    assert(params1.equals(params2));
    assert(params1.hash() === params2.hash());
  });

  it("is equal to Parameters instance with same different source params, but same permitted params", () => {
    const params1 = new Parameters({ a: 1, b: 2 }).permit("a");
    const params2 = new Parameters({ a: 1, c: 3 }).permit("a");
    assert(params1.equals(params2));
    assert(params2.equals(params1));
    assert(params1.hash() === params2.hash());
    assert(params2.hash() === params1.hash());
  });

  it("is not equal to an unpermitted Parameters instance with same params", () => {
    const params1 = new Parameters({ a: 1 }).permit("a");
    const params2 = new Parameters({ a: 1 });
    assert(!params1.equals(params2));
    assert(!params2.equals(params1));
    assert(params1.hash() !== params2.hash());
    assert(params2.hash() !== params1.hash());
  });

  it("is not equal to Parameters instance with different permitted params", () => {
    const params1 = new Parameters({ a: 1, b: 2 }).permit("a", "b");
    const params2 = new Parameters({ a: 1, b: 2 }).permit("a");
    assert(!params1.equals(params2));
    assert(!params2.equals(params1));
    assert(params1.hash() !== params2.hash());
    assert(params2.hash() !== params1.hash());
  });

  it("equality with simple types works", () => {
    assert(!params.equals("Hello"));
    assert(!params.equals(42));
    assert(!params.equals(false));
  });

  it("inspect shows both class name, parameters and permitted flag", () => {
    const hash = {
      person: {
        age: "32",
        name: {
          first: "David",
          last: "Heinemeier Hansson",
        },
        addresses: [{ city: "Chicago", state: "Illinois" }],
      },
    };

    assertEqual(
      `#<ActionController::Parameters ${rbInspect(hash)} permitted: false>`,
      params.inspect(),
    );
  });

  it("inspect prints updated permitted flag in the output", () => {
    assertMatch(/permitted: false/, params.inspect());

    params.permitBang();

    assertMatch(/permitted: true/, params.inspect());
  });

  it("#dig delegates the dig method to its values", () => {
    assertEqual("David", params.dig("person", "name", "first"));
    assertEqual("Chicago", params.dig("person", "addresses", 0, "city"));
  });

  it("#dig converts hashes to parameters", () => {
    assertKindOf(Parameters, params.dig("person"));
    assertKindOf(Parameters, params.dig("person", "addresses", 0));
    assert((params.dig("person", "addresses") as unknown[]).every((v) => v instanceof Parameters));
  });

  it("mutating #dig return value mutates underlying parameters", () => {
    (params.dig("person", "name") as Parameters).set("first", "Bill");
    assertEqual("Bill", params.dig("person", "name", "first"));

    (params.dig("person", "addresses") as unknown[])[0] = {
      city: "Boston",
      state: "Massachusetts",
    };
    assertEqual("Boston", params.dig("person", "addresses", 0, "city"));
  });

  it("#extract_value splits param by delimiter", () => {
    const params = new Parameters({
      id: "1_123",
      tags: "ruby,rails,web",
      blank_tags: ",ruby,,rails,",
    });

    assertEqual(["1", "123"], params.extractValue("id"));
    assertEqual(["ruby", "rails", "web"], params.extractValue("tags", { delimiter: "," }));
    assertEqual(
      ["", "ruby", "", "rails", ""],
      params.extractValue("blank_tags", { delimiter: "," }),
    );
    assertNil(params.extractValue("non_existent_key"));
  });
});
