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
    if (this === ParamError) {
      if (
        other instanceof RackParameterTypeError ||
        other instanceof RackInvalidParameterError ||
        other instanceof RackParamsTooDeepError
      ) {
        return true;
      }
    }
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
