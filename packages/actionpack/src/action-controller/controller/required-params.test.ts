import { describe, it, expect } from "vitest";
import { toParam, toQuery } from "@blazetrails/activesupport";
import { Parameters, ParameterMissing, UnfilteredParameters } from "../metal/strong-parameters.js";

describe("ActionControllerRequiredParamsTest", () => {
  it("missing required parameters will raise exception", () => {
    const params = new Parameters({ name: "John" });
    expect(() => params.require("missing_key")).toThrow(ParameterMissing);
  });

  it("required parameters that are present will not raise", () => {
    const params = new Parameters({ name: "John" });
    expect(params.require("name")).toBe("John");
  });

  it("required parameters with false value will not raise", () => {
    const params = new Parameters({ active: false });
    expect(params.require("active")).toBe(false);
  });
});

describe("ParametersRequireTest", () => {
  it("required parameters should accept and return false value", () => {
    const params = new Parameters({ person: false });
    expect(params.require("person")).toBe(false);
  });

  it("required parameters must not be nil", () => {
    const params = new Parameters({ person: null });
    expect(() => params.require("person")).toThrow(ParameterMissing);
  });

  it("required parameters must not be empty", () => {
    const params = new Parameters({ person: new Parameters({}) });
    expect(() => params.require("person")).toThrow(ParameterMissing);
  });

  it("require array when all required params are present", () => {
    const params = new Parameters({ first: "John", last: "Doe" });
    const result = params.require(["first", "last"]);
    expect(result).toEqual(["John", "Doe"]);
  });

  it("require array when a required param is missing", () => {
    const params = new Parameters({ first: "John" });
    expect(() => params.require(["first", "last"])).toThrow(ParameterMissing);
  });

  it("value params", () => {
    const params = new Parameters({ foo: "bar" });
    expect(params.get("foo")).toBe("bar");
  });

  it("to_param works like in a Hash", () => {
    const params = new Parameters({ nested: { key: "value" } }).permitBang();
    expect(params.toParam()).toBe(toParam({ nested: { key: "value" } }));

    expect(() => new Parameters({ nested: { key: "value" } }).toParam()).toThrow(
      UnfilteredParameters,
    );
  });

  it("to_query works like in a Hash", () => {
    const params = new Parameters({ nested: { key: "value" } }).permitBang();
    expect(params.toQuery()).toBe(toQuery({ nested: { key: "value" } }));

    expect(() => new Parameters({ nested: { key: "value" } }).toQuery()).toThrow(
      UnfilteredParameters,
    );
  });
});
