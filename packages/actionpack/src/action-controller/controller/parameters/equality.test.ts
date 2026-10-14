import { beforeEach, describe, it } from "vitest";
import { assert, assertNot, assertNotEqual } from "@blazetrails/activesupport";
import { toH } from "@blazetrails/ruby-compat";
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
    const hash = toH([...params.eachPair()]);
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
    const params = new Parameters({ foo: { bar: "baz" } });
    assert(params.hasValue({ bar: "baz" }));
    params.get("foo");
    assert(params.hasValue({ bar: "baz" }));
  });

  it("has_value? works with parameters", () => {
    const params = new Parameters({ foo: { bar: "baz" } });
    assert(params.hasValue(new Parameters({ bar: "baz" })));
  });
});
