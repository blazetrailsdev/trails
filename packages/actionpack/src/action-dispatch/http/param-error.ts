/**
 * ActionDispatch::ParamError
 *
 * Port of `actionpack/lib/action_dispatch/http/param_error.rb`. Defines the
 * `ParamError` hierarchy raised when request parameters cannot be parsed or
 * have an unexpected shape, plus a {@link ParamError.matches} helper that
 * mirrors Rails' `def self.===(other)` override — Rails uses `===` so a
 * `rescue ParamError` catches Rack's parallel exception classes
 * (`Rack::Utils::ParameterTypeError`, `Rack::Utils::InvalidParameterError`,
 * `Rack::QueryParser::ParamsTooDeepError`). JavaScript's `instanceof` cannot
 * be overridden the same way, so consumers call `ParamError.matches(err)`.
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

  static matches(other: unknown): boolean {
    return (
      other instanceof ParamError ||
      other instanceof RackParameterTypeError ||
      other instanceof RackInvalidParameterError ||
      other instanceof RackParamsTooDeepError
    );
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
