/**
 * Blank extensions — mirrors Rails' core_ext/object/blank.rb
 *
 * In Ruby, these are monkey-patches on built-in classes. In TypeScript,
 * `presence` is a standalone function and the per-class `blank?`/`present?`
 * arms are statics on type-specific classes, one per Ruby reopening.
 *
 * `isBlank` below is `Object#blank?` (blank.rb:18-20) — the entry point Ruby
 * reaches by dynamic dispatch. TypeScript has no per-class dispatch on a
 * built-in, so it switches on the value class in blank.rb's own order and
 * routes to that class's arm. `Array`, `Hash` and `Numeric` have no class here:
 * their arms (`alias_method :blank?, :empty?` at blank.rb:96/111, and
 * blank.rb:167-169) are one expression each, applied inline at the switch.
 */

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
 * `Object#blank?` (`core_ext/object/blank.rb:18-20`) plus the per-class
 * overrides, dispatched on the value class in blank.rb's own order: `NilClass`
 * (:56), `FalseClass` (:69), `TrueClass` (:82), `Array` (:96), `Hash` (:111),
 * `Symbol` (:120), `String` (:145-153), `Numeric` (:167-169), `Time`
 * (:182-184). `Array`, `Hash` and `Numeric` get no class of their own here:
 * their arms are `alias_method :blank?, :empty?` and a bare `false`, applied at
 * the switch.
 *
 * A Ruby Symbol is a JS string, so the `Symbol` arm is reached only by a
 * genuine JS `symbol`; the string spelling falls through to `String`.
 *
 * `Object#blank?`'s `respond_to?(:empty?)` arm answers for `Set` and `Map`,
 * which `Object.keys` reports as empty, and for any other object carrying a
 * boolean `isEmpty` (the conventions-table spelling of `empty?`) or `empty`
 * (the getter actionpack's Hash-like wrappers carry). A method-shaped
 * `isEmpty()` is deliberately not invoked: trails has async ones
 * (`Relation#isEmpty` runs a query) and Ruby's `blank?` issues no I/O.
 */
export function isBlank(value: unknown): boolean {
  if (value === null || value === undefined) return NilClass.isBlank(value);
  if (typeof value === "boolean")
    return value ? TrueClass.isBlank(value) : FalseClass.isBlank(value);
  if (Array.isArray(value)) return value.length === 0;
  if (typeof value === "symbol") return Symbol.isBlank(value);
  if (typeof value === "string") return String.isBlank(value);
  if (typeof value === "number" || typeof value === "bigint") return false;
  // boundary: the `Time` arm is typed on the JS `Date` this dispatches to.
  if (value instanceof Date) return Time.isBlank(value);
  if (value instanceof Set || value instanceof Map) return value.size === 0;
  const empty = (value as { isEmpty?: unknown }).isEmpty ?? (value as { empty?: unknown }).empty;
  if (typeof empty === "boolean") return empty;
  if (typeof value === "object") return Object.keys(value).length === 0;
  return false;
}

/**
 * `Object#present?` (`core_ext/object/blank.rb:25-27`): `!blank?`.
 */
export function isPresent(value: unknown): boolean {
  return !isBlank(value);
}

/**
 * `Object#presence` (`core_ext/object/blank.rb:44-46`): `self if present?`.
 * Ruby's `nil` return for a blank receiver is `undefined` here, so the
 * `presence ?? default` idiom reads the way `presence || default` does in Ruby.
 */
export function presence<T>(value: T): T | undefined {
  return isPresent(value) ? value : undefined;
}
