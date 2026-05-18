/**
 * ActionDispatch::ParamError
 *
 * Port of `actionpack/lib/action_dispatch/http/param_error.rb`. Defines the
 * `ParamError` hierarchy raised when request parameters cannot be parsed or
 * have an unexpected shape.
 *
 * Rails overrides `self.===` on `ParamError` so a `rescue ParamError` also
 * catches the parallel Rack exception classes (`Rack::Utils::ParameterTypeError`,
 * `Rack::Utils::InvalidParameterError`, `Rack::QueryParser::ParamsTooDeepError`).
 * JavaScript exposes the same dispatch hook via `Symbol.hasInstance`: defining
 * it on `ParamError` makes `err instanceof ParamError` return true for those
 * Rack errors too, so `rescueFrom(ParamError)` (which uses `instanceof`) works
 * the same as Rails' `rescue ParamError`.
 */

import {
  ParameterTypeError as RackParameterTypeError,
  InvalidParameterError as RackInvalidParameterError,
  ParamsTooDeepError as RackParamsTooDeepError,
} from "@blazetrails/rack";

import { ParseError } from "./parameters.js";

export class ParamError extends ParseError {
  constructor(message?: string) {
    super(message);
    this.name = "ActionDispatch::ParamError";
  }

  static [Symbol.hasInstance](other: unknown): boolean {
    // Rails only overrides `self.===` on `ParamError`; subclasses fall back
    // to the default semantics. Mirror that — only ParamError itself should
    // claim Rack's parallel exceptions.
    if (this === ParamError) {
      if (
        other instanceof RackParameterTypeError ||
        other instanceof RackInvalidParameterError ||
        other instanceof RackParamsTooDeepError
      ) {
        return true;
      }
    }
    // Walk the prototype chain looking for ParamError.prototype, mirroring
    // the default `instanceof` semantics that this override replaces.
    let proto: object | null = other == null ? null : Object.getPrototypeOf(other);
    while (proto !== null) {
      if (proto === this.prototype) return true;
      proto = Object.getPrototypeOf(proto);
    }
    return false;
  }
}

export class ParameterTypeError extends ParamError {
  constructor(message?: string) {
    super(message);
    this.name = "ActionDispatch::ParameterTypeError";
  }
}

export class InvalidParameterError extends ParamError {
  constructor(message?: string) {
    super(message);
    this.name = "ActionDispatch::InvalidParameterError";
  }
}

export class ParamsTooDeepError extends ParamError {
  constructor(message?: string) {
    super(message);
    this.name = "ActionDispatch::ParamsTooDeepError";
  }
}
