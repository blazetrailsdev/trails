import { beforeEach, describe, it } from "vitest";
import {
  Hash,
  KeyError,
  STDOUT,
  StringIO,
  block,
  fetch,
  last,
  mergeBang,
  rbInspect,
  type Tempfile,
} from "@blazetrails/ruby-compat";
import { Date, DateTime, Time } from "@blazetrails/date";
import { UploadedFile as RackTestUploadedFile } from "@blazetrails/rack-test";
import {
  BigDecimal,
  HashWithIndifferentAccess,
  assert,
  assertEmpty,
  assertEqual,
  assertInstanceOf,
  assertMatch,
  assertNil,
  assertNot,
  assertNotEqual,
  assertNotKindOf,
  assertNotPredicate,
  assertPredicate,
  assertRaises,
  assertSame,
} from "@blazetrails/activesupport";
import { UploadedFile } from "../../../action-dispatch/http/upload.js";
import {
  InvalidParameterKey,
  ParameterMissing,
  Parameters,
  UnfilteredParameters,
} from "../../metal/strong-parameters.js";

const thisFile = new URL(import.meta.url).pathname;

describe("ParametersPermitTest", () => {
  function assertFilteredOut(params: Parameters, key: string) {
    assertNot(params.hasKey(key), `key ${rbInspect(key)} has not been filtered out`);
  }

  let params: Parameters;
  let structFields: string[];

  beforeEach(() => {
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

    structFields = [];
    for (const number of ["0", "1", "12"]) {
      for (const suffix of ["", "i", "f"]) {
        structFields.push(`sf(${number}${suffix})`);
      }
    }
  });

  function walkPermitted(params: Parameters) {
    params.each(([_k, v]) => {
      if (v instanceof Parameters) {
        walkPermitted(v);
      } else if (Array.isArray(v)) {
        v.forEach((_x) => walkPermitted(v as unknown as Parameters));
      }
    });
  }

  it("iteration should not impact permit", () => {
    const hash = { foo: { bar: { "0": { baz: "hello", zot: "1" } } } };
    const params = new Parameters(hash);

    walkPermitted(params);

    const sanitized = (params.get("foo") as Parameters).permit({ bar: ["baz"] });
    assertEqual({ "0": { baz: "hello" } }, (sanitized.get("bar") as Parameters).toUnsafeH());
  });

  it("if nothing is permitted, the hash becomes empty", () => {
    const params = new Parameters({ id: "1234" });
    const permitted = params.permit();
    assertPredicate(permitted, (p) => p.isPermitted());
    assertEmpty(permitted);
  });

  it("key: permitted scalar values", () => {
    let values: unknown[] = ["a", "a", null];
    values = values.concat([0, 1.0, 2n ** 128n, new BigDecimal(1)]);
    values = values.concat([true, false]);
    values = values.concat([Date.today(), Time.now(), DateTime.now()]);
    values = values.concat([
      STDOUT,
      new StringIO(),
      new UploadedFile({ tempfile: thisFile as unknown as Tempfile }),
      new RackTestUploadedFile(thisFile),
    ]);

    for (const value of values) {
      let params = new Parameters({ id: value });
      let permitted = params.permit("id");
      if (value === null) {
        assertNil(permitted.get("id"));
      } else {
        assertEqual(value, permitted.get("id"));
      }

      for (const sf of structFields) {
        params = new Parameters({ [sf]: value });
        permitted = params.permit("sf");
        if (value === null) {
          assertNil(permitted.get(sf));
        } else {
          assertEqual(value, permitted.get(sf));
        }
      }
    }
  });

  it("key: unknown keys are filtered out", () => {
    const params = new Parameters({ id: "1234", injected: "injected" });
    const permitted = params.permit("id");
    assertEqual("1234", permitted.get("id"));
    assertFilteredOut(permitted, "injected");
  });

  it("key: arrays are filtered out", () => {
    for (const array of [[], [1], ["1"]]) {
      let params = new Parameters({ id: array });
      let permitted = params.permit("id");
      assertFilteredOut(permitted, "id");

      for (const sf of structFields) {
        params = new Parameters({ [sf]: array });
        permitted = params.permit("sf");
        assertFilteredOut(permitted, sf);
      }
    }
  });

  it("key: hashes are filtered out", () => {
    for (const hash of [{}, { foo: 1 }, { foo: "bar" }]) {
      let params = new Parameters({ id: hash });
      let permitted = params.permit("id");
      assertFilteredOut(permitted, "id");

      for (const sf of structFields) {
        params = new Parameters({ [sf]: hash });
        permitted = params.permit("sf");
        assertFilteredOut(permitted, sf);
      }
    }
  });

  it("key: non-permitted scalar values are filtered out", () => {
    let params = new Parameters({ id: new (class {})() });
    let permitted = params.permit("id");
    assertFilteredOut(permitted, "id");

    for (const sf of structFields) {
      params = new Parameters({ [sf]: new (class {})() });
      permitted = params.permit("sf");
      assertFilteredOut(permitted, sf);
    }
  });

  it("key: it is not assigned if not present in params", () => {
    const params = new Parameters({ name: "Joe" });
    const permitted = params.permit("id");
    assertNot(permitted.hasKey("id"));
  });

  it("key to empty array: empty arrays pass", () => {
    const params = new Parameters({ id: [] });
    const permitted = params.permit({ id: [] });
    assertEqual([], permitted.get("id"));
  });

  it("do not break params filtering on nil values", () => {
    const params = new Parameters({ a: 1, b: [1, 2, 3], c: null });

    const permitted = params.permit("a", { c: [], b: [] });
    assertEqual(1, permitted.get("a"));
    assertEqual([1, 2, 3], permitted.get("b"));
    assertNil(permitted.get("c"));
  });

  it("key to empty array: arrays of permitted scalars pass", () => {
    for (const array of [["foo"], [1], ["foo", "bar"], [1, 2, 3]]) {
      const params = new Parameters({ id: array });
      const permitted = params.permit({ id: [] });
      assertEqual(array, permitted.get("id"));
    }
  });

  it("key to empty array: permitted scalar values do not pass", () => {
    for (const permittedScalar of ["foo", 1]) {
      const params = new Parameters({ id: permittedScalar });
      const permitted = params.permit({ id: [] });
      assertFilteredOut(permitted, "id");
    }
  });

  it("key to empty array: arrays of non-permitted scalar do not pass", () => {
    for (const nonPermittedScalar of [[new (class {})()], [[]], [[1]], [{}], [{ id: "1" }]]) {
      const params = new Parameters({ id: nonPermittedScalar });
      const permitted = params.permit({ id: [] });
      assertFilteredOut(permitted, "id");
    }
  });

  it("key to empty hash: arbitrary hashes are permitted", () => {
    const params = new Parameters({
      username: "fxn",
      preferences: {
        scheme: "Marazul",
        font: {
          name: "Source Code Pro",
          size: 12,
        },
        tabstops: [4, 8, 12, 16],
        suspicious: [true, new (class {})(), false, /yo!/],
        dubious: [{ a: "a", b: /wtf!/ }, { c: "c" }],
        injected: new (class {})(),
        nested: [
          [1, 2],
          [3, 4],
        ],
      },
      hacked: 1,
    });

    const permitted = params.permit("username", { preferences: {}, hacked: {} });
    const preferences = permitted.get("preferences") as Parameters;

    assertEqual("fxn", permitted.get("username"));
    assertEqual("Marazul", preferences.get("scheme"));
    assertEqual("Source Code Pro", (preferences.get("font") as Parameters).get("name"));
    assertEqual(12, (preferences.get("font") as Parameters).get("size"));
    assertEqual([4, 8, 12, 16], preferences.get("tabstops"));
    assertEqual([true, false], preferences.get("suspicious"));
    assertEqual("a", (preferences.get("dubious") as Parameters[])[0].get("a"));
    assertEqual("c", (preferences.get("dubious") as Parameters[])[1].get("c"));
    assertEqual(
      [
        [1, 2],
        [3, 4],
      ],
      preferences.get("nested"),
    );

    assertFilteredOut((preferences.get("dubious") as Parameters[])[0], "b");
    assertFilteredOut(preferences, "injected");
    assertFilteredOut(permitted, "hacked");
  });

  it("fetch raises ParameterMissing exception", async () => {
    const e = await assertRaises([ParameterMissing], {}, () => {
      params.fetch("foo");
    });
    assertEqual("foo", e.param);
  });

  it("fetch with a default value of a hash does not mutate the object", () => {
    const params = new Parameters({});
    params.fetch("foo", {});
    assertNil(params.get("foo"));
  });

  it("hashes in array values get wrapped", () => {
    const params = new Parameters({ foo: [{}, {}] });
    (params.get("foo") as Parameters[]).forEach((hash) => {
      assertNotPredicate(hash, (h) => h.isPermitted());
    });
  });

  it("arrays are converted at most once", () => {
    const params = new Parameters({ foo: [{}] });
    assertSame(params.get("foo"), params.get("foo"));
  });

  it("mutated arrays are detected", () => {
    const params = new Parameters({ users: [{ id: 1 }] });

    const permitted = params.permit({ users: ["id"] });
    (permitted.get("users") as unknown[]).push({ injected: 1 });
    assertNotPredicate(last(permitted.get("users") as Parameters[])!, (p) => p.isPermitted());
  });

  it("grow until set rehashes", () => {
    const params = new Parameters({ users: [{ id: 1 }] });

    const permitted = params.permit({ users: ["id"] });
    (permitted.get("users") as unknown[]).push({ injected: 1 });
    for (let i = 0; i < 20; i++) {
      const list = [`foo${i}`];
      permitted.set("xx", list);
      assertEqual(permitted.get("xx"), list);
    }
    assertNotPredicate(last(permitted.get("users") as Parameters[])!, (p) => p.isPermitted());
  });

  it("fetch doesn't raise ParameterMissing exception if there is a default", () => {
    assertEqual("monkey", params.fetch("foo", "monkey"));
    assertEqual(
      "monkey",
      params.fetch(
        "foo",
        block(() => "monkey"),
      ),
    );
  });

  it("fetch doesn't raise ParameterMissing exception if there is a default that is nil", () => {
    assertNil(params.fetch("foo", null));
    assertNil(
      params.fetch(
        "foo",
        block(() => null),
      ),
    );
  });

  it("KeyError in fetch block should not be covered up", async () => {
    const params = new Parameters();
    const e = await assertRaises([KeyError], {}, () => {
      params.fetch(
        "missing_key",
        block(() => fetch({}, "also_missing")),
      );
    });
    assertMatch(/"also_missing"$/, e.message);
  });

  it("not permitted is sticky beyond merges", () => {
    assertNotPredicate(params.merge({ a: "b" }), (p) => p.isPermitted());
  });

  it("permitted is sticky beyond merges", () => {
    params.permitBang();
    assertPredicate(params.merge({ a: "b" }), (p) => p.isPermitted());
  });

  it("merge with parameters", () => {
    const otherParams = new Parameters({ id: "1234" }).permitBang();
    const mergedParams = params.merge(otherParams);

    assert(mergedParams.get("id"));
  });

  it("not permitted is sticky beyond merge!", () => {
    assertNotPredicate(params.mergeBang({ a: "b" }), (p) => p.isPermitted());
  });

  it("permitted is sticky beyond merge!", () => {
    params.permitBang();
    assertPredicate(params.mergeBang({ a: "b" }), (p) => p.isPermitted());
  });

  it("merge! with parameters", () => {
    const otherParams = new Parameters({ id: "1234" }).permitBang();
    params.mergeBang(otherParams);

    assertEqual("1234", params.get("id"));
    assertEqual("32", (params.get("person") as Parameters).get("age"));
  });

  it("not permitted is sticky beyond deep merges", () => {
    assertNotPredicate(params.deepMerge({ a: "b" }), (p) => p.isPermitted());
  });

  it("permitted is sticky beyond deep merges", () => {
    params.permitBang();
    assertPredicate(params.deepMerge({ a: "b" }), (p) => p.isPermitted());
  });

  it("not permitted is sticky beyond deep_merge!", () => {
    assertNotPredicate(params.deepMergeBang({ a: "b" }), (p) => p.isPermitted());
  });

  it("permitted is sticky beyond deep_merge!", () => {
    params.permitBang();
    assertPredicate(params.deepMergeBang({ a: "b" }), (p) => p.isPermitted());
  });

  it("deep_merge with other Hash", () => {
    const [first, last] = (params.dig("person", "name") as Parameters).valuesAt("first", "last");
    const mergedParams = params.deepMerge({ person: { name: { last: "A." } } });

    assertEqual(first, mergedParams.dig("person", "name", "first"));
    assertNotEqual(last, mergedParams.dig("person", "name", "last"));
    assertEqual("A.", mergedParams.dig("person", "name", "last"));
  });

  it("deep_merge! with other Hash", () => {
    const [first, last] = (params.dig("person", "name") as Parameters).valuesAt("first", "last");
    params.deepMergeBang({ person: { name: { last: "A." } } });

    assertEqual(first, params.dig("person", "name", "first"));
    assertNotEqual(last, params.dig("person", "name", "last"));
    assertEqual("A.", params.dig("person", "name", "last"));
  });

  it("deep_merge with other Parameters", () => {
    const [first, last] = (params.dig("person", "name") as Parameters).valuesAt("first", "last");
    const otherParams = new Parameters({ person: { name: { last: "A." } } }).permitBang();
    const mergedParams = params.deepMerge(otherParams);

    assertEqual(first, mergedParams.dig("person", "name", "first"));
    assertNotEqual(last, mergedParams.dig("person", "name", "last"));
    assertEqual("A.", mergedParams.dig("person", "name", "last"));
  });

  it("deep_merge! with other Parameters", () => {
    const [first, last] = (params.dig("person", "name") as Parameters).valuesAt("first", "last");
    const otherParams = new Parameters({ person: { name: { last: "A." } } }).permitBang();
    params.deepMergeBang(otherParams);

    assertEqual(first, params.dig("person", "name", "first"));
    assertNotEqual(last, params.dig("person", "name", "last"));
    assertEqual("A.", params.dig("person", "name", "last"));
  });

  it("#reverse_merge with parameters", () => {
    const defaultParams = new Parameters({ id: "1234", person: {} }).permitBang();
    const mergedParams = params.reverseMerge(defaultParams);

    assertEqual("1234", mergedParams.get("id"));
    assertNotPredicate(mergedParams.get("person") as Parameters, (p) => p.isEmpty());
  });

  it("#with_defaults is an alias of reverse_merge", () => {
    const defaultParams = new Parameters({ id: "1234", person: {} }).permitBang();
    const mergedParams = params.withDefaults(defaultParams);

    assertEqual("1234", mergedParams.get("id"));
    assertNotPredicate(mergedParams.get("person") as Parameters, (p) => p.isEmpty());
  });

  it("not permitted is sticky beyond reverse_merge", () => {
    assertNotPredicate(params.reverseMerge({ a: "b" }), (p) => p.isPermitted());
  });

  it("permitted is sticky beyond reverse_merge", () => {
    params.permitBang();
    assertPredicate(params.reverseMerge({ a: "b" }), (p) => p.isPermitted());
  });

  it("#reverse_merge! with parameters", () => {
    const defaultParams = new Parameters({ id: "1234", person: {} }).permitBang();
    params.reverseMergeBang(defaultParams);

    assertEqual("1234", params.get("id"));
    assertNotPredicate(params.get("person") as Parameters, (p) => p.isEmpty());
  });

  it("#with_defaults! is an alias of reverse_merge!", () => {
    const defaultParams = new Parameters({ id: "1234", person: {} }).permitBang();
    params.withDefaultsBang(defaultParams);

    assertEqual("1234", params.get("id"));
    assertNotPredicate(params.get("person") as Parameters, (p) => p.isEmpty());
  });

  it("modifying the parameters", () => {
    (params.get("person") as Parameters).set("hometown", "Chicago");
    (params.get("person") as Parameters).set("family", { brother: "Jonas" });

    assertEqual("Chicago", (params.get("person") as Parameters).get("hometown"));
    assertEqual(
      "Jonas",
      ((params.get("person") as Parameters).get("family") as Parameters).get("brother"),
    );
  });

  it("permit! is recursive", () => {
    params.set("nested_array", [
      [
        { x: 2, y: 3 },
        { x: 21, y: 42 },
      ],
    ]);
    params.permitBang();
    const person = params.get("person") as Parameters;
    const nestedArray = params.get("nested_array") as Parameters[][];
    assertPredicate(params, (p) => p.isPermitted());
    assertPredicate(person, (p) => p.isPermitted());
    assertPredicate(person.get("name") as Parameters, (p) => p.isPermitted());
    assertPredicate((person.get("addresses") as Parameters[])[0], (p) => p.isPermitted());
    assertPredicate(nestedArray[0][0], (p) => p.isPermitted());
    assertPredicate(nestedArray[0][1], (p) => p.isPermitted());
  });

  it("permitted takes a default value when Parameters.permit_all_parameters is set", () => {
    try {
      Parameters.permitAllParameters = true;
      const params = new Parameters({
        person: {
          age: "32",
          name: { first: "David", last: "Heinemeier Hansson" },
        },
      });

      assertPredicate(params.slice("person"), (p) => p.isPermitted());
      assertPredicate((params.get("person") as Parameters).get("name") as Parameters, (p) =>
        p.isPermitted(),
      );
    } finally {
      Parameters.permitAllParameters = false;
    }
  });

  it("permitting parameters as an array", () => {
    assertEqual("32", (params.get("person") as Parameters).permit(["age"]).get("age"));
  });

  it("to_h raises UnfilteredParameters on unfiltered params", async () => {
    await assertRaises([UnfilteredParameters], {}, () => {
      params.toH();
    });
  });

  it("to_h returns converted hash on permitted params", () => {
    params.permitBang();

    assertInstanceOf(HashWithIndifferentAccess, params.toH());
    assertNotKindOf(Parameters, params.toH());
  });

  it("to_h returns converted hash when .permit_all_parameters is set", () => {
    try {
      Parameters.permitAllParameters = true;
      const params = new Parameters({ crab: "Senjougahara Hitagi" });

      assertInstanceOf(HashWithIndifferentAccess, params.toH());
      assertNotKindOf(Parameters, params.toH());
      assertEqual({ crab: "Senjougahara Hitagi" }, params.toH());
    } finally {
      Parameters.permitAllParameters = false;
    }
  });

  it("to_hash raises UnfilteredParameters on unfiltered params", async () => {
    await assertRaises([UnfilteredParameters], {}, () => {
      params.toHash();
    });
  });

  it("to_hash returns converted hash on permitted params", () => {
    params.permitBang();

    assertInstanceOf(Hash, params.toHash());
    assertNotKindOf(Parameters, params.toHash());
  });

  it("parameters can be implicit converted to Hash", () => {
    const params = new Parameters();
    params.permitBang();

    assertEqual({ a: 1 }, mergeBang({ a: 1 }, params));
  });

  it("to_hash returns converted hash when .permit_all_parameters is set", () => {
    try {
      Parameters.permitAllParameters = true;
      const params = new Parameters({ crab: "Senjougahara Hitagi" });

      assertInstanceOf(Hash, params.toHash());
      assertNotKindOf(Parameters, params.toHash());
      assertEqual({ crab: "Senjougahara Hitagi" }, params.toHash());
    } finally {
      Parameters.permitAllParameters = false;
    }
  });

  it("to_unsafe_h returns unfiltered params", () => {
    assertInstanceOf(HashWithIndifferentAccess, params.toUnsafeH());
    assertNotKindOf(Parameters, params.toUnsafeH());
  });

  it("to_unsafe_h returns unfiltered params even after accessing few keys", () => {
    const params = new Parameters({ f: { language_facet: ["Tibetan"] } });
    const expected = { f: { language_facet: ["Tibetan"] } };

    assertInstanceOf(Parameters, params.get("f"));
    assertEqual(expected, params.toUnsafeH());
  });

  it("to_unsafe_h does not mutate the parameters", () => {
    const params = new Parameters({ f: { language_facet: ["Tibetan"] } });
    params.get("f");

    params.toUnsafeH();

    assertNotPredicate(params, (p) => p.isPermitted());
    assertNotPredicate(params.get("f") as Parameters, (p) => p.isPermitted());
  });

  it("to_h only deep dups Ruby collections", () => {
    const company = new (class {
      dupped?: boolean;
      dup() {
        return (this.dupped = true);
      }
    })();

    let params = new Parameters({ prem: { likes: ["dancing"] } });
    assertEqual({ prem: { likes: ["dancing"] } }, params.permitBang().toH());

    params = new Parameters({ companies: [company, "acme"] });
    assertEqual({ companies: [company, "acme"] }, params.permitBang().toH());
    assertNot(company.dupped);
  });

  it("to_unsafe_h only deep dups Ruby collections", () => {
    const company = new (class {
      dupped?: boolean;
      dup() {
        return (this.dupped = true);
      }
    })();

    let params = new Parameters({ prem: { likes: ["dancing"] } });
    assertEqual({ prem: { likes: ["dancing"] } }, params.toUnsafeH());

    params = new Parameters({ companies: [company, "acme"] });
    assertEqual({ companies: [company, "acme"] }, params.toUnsafeH());
    assertNot(company.dupped);
  });

  it("include? returns true when the key is present", () => {
    assert(params.include("person"));
    assert(params.include("person"));
    assertNot(params.include("gorilla"));
  });

  it("scalar values should be filtered when array or hash is specified", () => {
    const params = new Parameters({ foo: "bar" });

    assert(params.permit("foo").hasKey("foo"));
    assertNot(params.permit({ foo: [] }).hasKey("foo"));
    assertNot(params.permit({ foo: ["bar"] }).hasKey("foo"));
    assertNot(params.permit({ foo: "bar" }).hasKey("foo"));
  });

  it("#permitted? is false by default", () => {
    const params = new Parameters();

    assertEqual(false, params.isPermitted());
  });

  it("only String and Symbol keys are allowed", async () => {
    await assertRaises([InvalidParameterKey], {}, () => {
      new Parameters(new Hash<unknown, unknown>().set({ foo: 1 }, "bar") as Hash<string, unknown>);
    });
  });
});
