import { beforeEach, describe, it, expect } from "vitest";
import { assert, assertNot, assertNotEqual } from "@blazetrails/activesupport";
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

  it("parameters are not equal to the hash", () => {
    const hash: Record<string, unknown> = {};
    params.eachPair((key, value) => {
      hash[key] = value;
    });
    assertNotEqual(params, hash);
  });

  it("not eql? to equivalent hash", () => {
    const hash = {};
    params = new Parameters(hash);
    assertNot(params.eql(hash));
  });

  it("not eql? to equivalent nested hash", () => {
    const params1 = new Parameters({ foo: {} });
    const params2 = new Parameters({ foo: new Parameters({}) });
    assertNot(params1.eql(params2));
  });

  it("not eql? when permitted is different", () => {
    const permitted = params.permit("person");
    assertNot(params.eql(permitted));
  });

  it("eql? when equivalent", () => {
    const permitted = params.permit("person");
    assert(params.permit("person").eql(permitted));
  });

  it("has_value? converts hashes to parameters", () => {
    const params = new Parameters({ a: { nested: "value" } });
    params.get("a");
    expect(params.hasValue(params.get("a"))).toBe(true);
  });

  it("has_value? works with parameters", () => {
    const inner = new Parameters({ x: "1" });
    const params = new Parameters({ a: inner });
    expect(params.hasValue(inner)).toBe(true);
  });
});
