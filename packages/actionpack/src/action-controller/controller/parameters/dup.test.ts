import { beforeEach, describe, it, expect } from "vitest";
import { assert, assertNot, assertNotEqual } from "@blazetrails/activesupport";
import { rbObjDup } from "@blazetrails/ruby-compat";
import { Parameters } from "../../metal/strong-parameters.js";

describe("ParametersDupTest", () => {
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

  it("a duplicate maintains the original's permitted status", () => {
    params.permitBang();
    const duppedParams = rbObjDup(params);
    assert(duppedParams.isPermitted());
  });

  it("a duplicate maintains the original's parameters", () => {
    params.permitBang();
    const duppedParams = rbObjDup(params);
    expect(duppedParams.toH()).toEqual(params.toH());
  });

  it("changes to a duplicate's parameters do not affect the original", () => {
    const duppedParams = rbObjDup(params);
    duppedParams.delete("person");
    assertNotEqual(params, duppedParams);
  });

  it("changes to a duplicate's permitted status do not affect the original", () => {
    const duppedParams = rbObjDup(params);
    duppedParams.permitBang();
    assertNotEqual(params, duppedParams);
  });

  it("deep_dup content", () => {
    const duppedParams = params.deepDup();
    (duppedParams.get("person") as Parameters).set("age", "45");
    ((duppedParams.get("person") as Parameters).get("addresses") as unknown[]).length = 0;

    expect((duppedParams.get("person") as Parameters).get("age")).not.toEqual(
      (params.get("person") as Parameters).get("age"),
    );
    expect((duppedParams.get("person") as Parameters).get("addresses")).not.toEqual(
      (params.get("person") as Parameters).get("addresses"),
    );
  });

  it("deep_dup @permitted", () => {
    const duppedParams = params.deepDup();
    duppedParams.permitBang();

    assertNot(params.isPermitted());
  });

  it("deep_dup @permitted is being copied", () => {
    params.permitBang();
    assert(params.deepDup().isPermitted());
  });
});
