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

  describe("instanceof (Symbol.hasInstance override mirrors Rails' self.===)", () => {
    it("matches Rack parameter exceptions", () => {
      expect(new RackParameterTypeError("x") instanceof ParamError).toBe(true);
      expect(new RackInvalidParameterError("x") instanceof ParamError).toBe(true);
      expect(new RackParamsTooDeepError("x") instanceof ParamError).toBe(true);
    });

    it("returns false for unrelated errors and non-objects", () => {
      expect(new Error("nope") instanceof ParamError).toBe(false);
      expect((null as unknown) instanceof ParamError).toBe(false);
      expect((undefined as unknown) instanceof ParamError).toBe(false);
    });

    it("subclass instanceof check still resolves the default chain", () => {
      expect(new ParameterTypeError() instanceof ParameterTypeError).toBe(true);
    });

    it("Rack errors do not match individual ActionDispatch subclasses", () => {
      // Rails only overrides `self.===` on ParamError; subclasses retain
      // default semantics, so an unrelated Rack error must not be caught
      // by a `rescueFrom(InvalidParameterError)`.
      expect(new RackParameterTypeError("x") instanceof InvalidParameterError).toBe(false);
      expect(new RackParameterTypeError("x") instanceof ParameterTypeError).toBe(false);
      expect(new RackInvalidParameterError("x") instanceof ParameterTypeError).toBe(false);
      expect(new RackParamsTooDeepError("x") instanceof ParamsTooDeepError).toBe(false);
    });
  });
});
