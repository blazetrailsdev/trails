/**
 * Blank extensions — mirrors Rails' core_ext/object/blank.rb
 *
 * In Ruby, these are monkey-patches on built-in classes. In TypeScript,
 * `presence` is a standalone function and the per-class `blank?`/`present?`
 * arms are statics on type-specific classes, one per Ruby reopening.
 */

import { isBlank, isPresent } from "../../string-utils.js";

const BLANK_RE = /^\s*$/;

export class NilClass {
  static isBlank(_value: null | undefined): true {
    return true;
  }
  static isPresent(_value: null | undefined): false {
    return false;
  }
}

export class FalseClass {
  static isBlank(_value: false): true {
    return true;
  }
  static isPresent(_value: false): false {
    return false;
  }
}

export class TrueClass {
  static isBlank(_value: true): false {
    return false;
  }
  static isPresent(_value: true): true {
    return true;
  }
}

export class Symbol {
  static isBlank(value: string | symbol): boolean {
    const str = typeof value === "symbol" ? (value.description ?? "") : value;
    return str.length === 0;
  }
  static isPresent(value: string | symbol): boolean {
    return !Symbol.isBlank(value);
  }
}

export class String {
  static readonly BLANK_RE = BLANK_RE;

  static isBlank(value: string): boolean {
    return value.length === 0 || BLANK_RE.test(value);
  }
  static isPresent(value: string): boolean {
    return !String.isBlank(value);
  }
}

export class Time {
  static isBlank(_value: Date): false {
    return false;
  }
  static isPresent(_value: Date): true {
    return true;
  }
}

/**
 * `Object#presence` (`core_ext/object/blank.rb:44-46`): `self if present?`.
 * Ruby's `nil` return for a blank receiver is `undefined` here, so the
 * `presence ?? default` idiom reads the way `presence || default` does in Ruby.
 */
export function presence<T>(value: T): T | undefined {
  return isPresent(value) ? value : undefined;
}

export { isBlank, isPresent };
