import { beforeEach, describe, it, expect } from "vitest";
import {
  HashWithIndifferentAccess,
  assertEqual,
  assertNil,
  assertNot,
  assertNotPredicate,
  assertPredicate,
  assertRaises,
} from "@blazetrails/activesupport";
import { Parameters, UnfilteredParameters } from "../../metal/strong-parameters.js";

describe("ParametersMutatorsTest", () => {
  let params: Parameters;

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
  });

  it("delete retains permitted status", () => {
    params.permitBang();
    assertPredicate(params.delete("person") as Parameters, (p) => p.isPermitted());
  });

  it("delete retains unpermitted status", () => {
    assertNotPredicate(params.delete("person") as Parameters, (p) => p.isPermitted());
  });

  it("delete returns the value when the key is present", () => {
    assertEqual("32", (params.get("person") as Parameters).delete("age"));
  });

  it("delete removes the entry when the key present", () => {
    (params.get("person") as Parameters).delete("age");
    assertNot((params.get("person") as Parameters).hasKey("age"));
  });

  it("delete returns nil when the key is not present", () => {
    assertNil((params.get("person") as Parameters).delete("first_name"));
  });

  it("delete returns the value of the given block when the key is not present", () => {
    assertEqual(
      "David",
      (params.get("person") as Parameters).delete("first_name", () => "David"),
    );
  });

  it("delete yields the key to the given block when the key is not present", () => {
    assertEqual(
      "first_name: David",
      (params.get("person") as Parameters).delete("first_name", (k: string) => `${k}: David`),
    );
  });

  it("delete_if retains permitted status", () => {
    params.permitBang();
    assertPredicate(
      params.deleteIf((k) => k === "person"),
      (p) => p.isPermitted(),
    );
  });

  it("delete_if retains unpermitted status", () => {
    assertNotPredicate(
      params.deleteIf((k) => k === "person"),
      (p) => p.isPermitted(),
    );
  });

  it("extract! retains permitted status", () => {
    params.permitBang();
    assertPredicate(params.extractBang("person"), (p) => p.isPermitted());
  });

  it("extract! retains unpermitted status", () => {
    assertNotPredicate(params.extractBang("person"), (p) => p.isPermitted());
  });

  it("keep_if retains permitted status", () => {
    params.permitBang();
    assertPredicate(
      params.keepIf((k, _v) => k === "person"),
      (p) => p.isPermitted(),
    );
  });

  it("keep_if retains unpermitted status", () => {
    assertNotPredicate(
      params.keepIf((k, _v) => k === "person"),
      (p) => p.isPermitted(),
    );
  });

  it("reject! retains permitted status", () => {
    params.permitBang();
    assertPredicate(
      params.rejectBang((k) => k === "person"),
      (p) => p.isPermitted(),
    );
  });

  it("reject! retains unpermitted status", () => {
    assertNotPredicate(
      params.rejectBang((k) => k === "person"),
      (p) => p.isPermitted(),
    );
  });

  it("select! retains permitted status", () => {
    params.permitBang();
    assertPredicate(
      params.selectBang((k) => k !== "person"),
      (p) => p.isPermitted(),
    );
  });

  it("select! retains unpermitted status", () => {
    assertNotPredicate(
      params.selectBang((k) => k !== "person"),
      (p) => p.isPermitted(),
    );
  });

  it("slice! retains permitted status", () => {
    params.permitBang();
    assertPredicate(params.sliceBang("person"), (p) => p.isPermitted());
  });

  it("slice! retains unpermitted status", () => {
    assertNotPredicate(params.sliceBang("person"), (p) => p.isPermitted());
  });

  it("transform_keys! retains permitted status", () => {
    params.permitBang();
    assertPredicate(
      params.transformKeysBang((k) => k),
      (p) => p.isPermitted(),
    );
  });

  it("transform_keys! retains unpermitted status", () => {
    assertNotPredicate(
      params.transformKeysBang((k) => k),
      (p) => p.isPermitted(),
    );
  });

  it("transform_values! retains permitted status", () => {
    params.permitBang();
    assertPredicate(
      params.transformValuesBang((v) => v),
      (p) => p.isPermitted(),
    );
  });

  it("transform_values! retains unpermitted status", () => {
    assertNotPredicate(
      params.transformValuesBang((v) => v),
      (p) => p.isPermitted(),
    );
  });

  it("deep_transform_keys! retains permitted status", () => {
    params.permitBang();
    assertPredicate(
      params.deepTransformKeysBang((k) => k),
      (p) => p.isPermitted(),
    );
  });

  it("deep_transform_keys! transforms nested keys", () => {
    params.permitBang();
    params.deepTransformKeysBang((k) => k.toUpperCase());

    const expectedHash = {
      PERSON: {
        AGE: "32",
        NAME: { FIRST: "David", LAST: "Heinemeier Hansson" },
        ADDRESSES: [{ CITY: "Chicago", STATE: "Illinois" }],
      },
    };
    assertEqual(params.toHash(), expectedHash);
  });

  it("deep_transform_keys transforms nested keys", () => {
    const originalHash = params.toUnsafeH();
    params.permitBang();
    const newParams = params.deepTransformKeys((k) => k.toUpperCase());

    assertEqual(params.toHash(), originalHash);

    const expectedHash = {
      PERSON: {
        AGE: "32",
        NAME: { FIRST: "David", LAST: "Heinemeier Hansson" },
        ADDRESSES: [{ CITY: "Chicago", STATE: "Illinois" }],
      },
    };
    assertEqual(newParams.toHash(), expectedHash);
  });

  it("deep_transform_keys! retains unpermitted status", () => {
    assertNotPredicate(
      params.deepTransformKeysBang((k) => k),
      (p) => p.isPermitted(),
    );
  });

  it("compact retains permitted status", () => {
    params.permitBang();
    assertPredicate(params.compact(), (p) => p.isPermitted());
  });

  it("compact retains unpermitted status", () => {
    assertNotPredicate(params.compact(), (p) => p.isPermitted());
  });

  it("compact! returns nil when no values are nil", () => {
    assertNil(params.compactBang());
  });

  it("compact! retains permitted status", () => {
    params.set("person", null);
    params.permitBang();
    assertPredicate(params.compactBang()!, (p) => p.isPermitted());
  });

  it("compact! retains unpermitted status", () => {
    params.set("person", null);
    assertNotPredicate(params.compactBang()!, (p) => p.isPermitted());
  });

  it("compact_blank retains permitted status", () => {
    params.permitBang();
    assertPredicate(params.compactBlank(), (p) => p.isPermitted());
  });

  it("compact_blank retains unpermitted status", () => {
    assertNotPredicate(params.compactBlank(), (p) => p.isPermitted());
  });

  it("compact_blank! retains permitted status", () => {
    params.permitBang();
    assertPredicate(params.compactBlankBang(), (p) => p.isPermitted());
  });

  it("compact_blank! retains unpermitted status", () => {
    assertNotPredicate(params.compactBlankBang(), (p) => p.isPermitted());
  });

  // BLOCKED: parameters-to-h-returns-a-plain-object-not-hash-with-indifferent-access
  it.skip("to_h returns a ActiveSupport::HashWithIndifferentAccess", () => {
    params.permitBang();
    const paramsHash = params.toH();
    expect(paramsHash).toBeInstanceOf(HashWithIndifferentAccess);
  });

  it("to_h receives a block and transforms keys", () => {
    const params = new Parameters({ name: "Alex", age: "40", location: "Beijing" });
    params.permitBang();
    const paramsHash = params.toH((key, value) => [`${key}_modified`, value]);
    assertEqual(["name_modified", "age_modified", "location_modified"], Object.keys(paramsHash));
  });

  it("to_h receives a block and transforms values", () => {
    const params = new Parameters({ name: "Alex", age: "40", location: "Beijing" });
    params.permitBang();
    const paramsHash = params.toH((key, value) => [
      key,
      typeof value === "string" ? `${value}_modified` : value,
    ]);
    assertEqual(["Alex_modified", "40_modified", "Beijing_modified"], Object.values(paramsHash));
  });

  it("to_h does not include unpermitted params", async () => {
    const params = new Parameters({ name: "Alex", age: "40", location: "Beijing" });
    await assertRaises([UnfilteredParameters], {}, () => {
      params.toH((key, value) => [key, value]);
    });
  });
});
