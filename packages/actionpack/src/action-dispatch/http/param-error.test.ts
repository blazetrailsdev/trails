import { describe, it, expect } from "vitest";

import {
  ParameterTypeError as RackParameterTypeError,
  InvalidParameterError as RackInvalidParameterError,
  ParamsTooDeepError as RackParamsTooDeepError,
} from "@blazetrails/rack";

import { ParseError } from "./parameters.js";
import {
  ParamError,
  ParameterTypeError,
  InvalidParameterError,
  ParamsTooDeepError,
} from "./param-error.js";

describe("ActionDispatch::ParamError", () => {
  it("is a subclass of ParseError", () => {
    expect(new ParamError()).toBeInstanceOf(ParseError);
  });

  it("preserves the message", () => {
    expect(new ParamError("bad").message).toBe("bad");
  });

  it("ParameterTypeError, InvalidParameterError, ParamsTooDeepError descend from ParamError", () => {
    expect(new ParameterTypeError()).toBeInstanceOf(ParamError);
    expect(new InvalidParameterError()).toBeInstanceOf(ParamError);
    expect(new ParamsTooDeepError()).toBeInstanceOf(ParamError);
  });

  describe(".matches", () => {
    it("returns true for ParamError instances", () => {
      expect(ParamError.matches(new ParamError())).toBe(true);
      expect(ParamError.matches(new ParameterTypeError())).toBe(true);
    });

    it("returns true for Rack parameter exceptions", () => {
      expect(ParamError.matches(new RackParameterTypeError("x"))).toBe(true);
      expect(ParamError.matches(new RackInvalidParameterError("x"))).toBe(true);
      expect(ParamError.matches(new RackParamsTooDeepError("x"))).toBe(true);
    });

    it("returns false for unrelated errors", () => {
      expect(ParamError.matches(new Error("nope"))).toBe(false);
      expect(ParamError.matches("not an error")).toBe(false);
    });
  });
});
