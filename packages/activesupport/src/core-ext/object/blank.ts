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
 * overrides, dispatched on the value class.
 */
export function isBlank(value: unknown): boolean {
  // blank.rb:56 — NilClass#blank?
  if (value === null || value === undefined) return NilClass.isBlank(value);
  // blank.rb:69 / :82 — FalseClass#blank? and TrueClass#blank?
  if (typeof value === "boolean")
    return value ? TrueClass.isBlank(value) : FalseClass.isBlank(value);
  // blank.rb:96 — `alias_method :blank?, :empty?` on Array.
  if (Array.isArray(value)) return value.length === 0;
  // blank.rb:120 — Symbol#blank?. A Ruby Symbol is a JS string, so this arm is
  // only reached by a genuine JS `symbol`; the string spelling falls to String.
  if (typeof value === "symbol") return Symbol.isBlank(value);
  // blank.rb:145-153 — String#blank?
  if (typeof value === "string") return String.isBlank(value);
  // blank.rb:167-169 — Numeric#blank? is always false, including for 0.
  if (typeof value === "number" || typeof value === "bigint") return false;
  // blank.rb:182-184 — Time#blank?
  // boundary: the `Time` arm below is typed on the JS `Date` this dispatches to.
  if (value instanceof Date) return Time.isBlank(value);
  // `Object#blank?`'s `respond_to?(:empty?)` arm: `Object.keys` reports none
  // for a Set or Map, which answer by size.
  if (value instanceof Set || value instanceof Map) return value.size === 0;
  // The same arm for any other object that answers `empty?`. Ruby probes one
  // spelling; trails has two — `isEmpty` from the conventions table, and the
  // `empty` getter actionpack's Hash-like wrappers (`Parameters`, `FlashHash`)
  // carry — so both are probed. Only a boolean-valued reader answers here: a
  // method-shaped `isEmpty()` is not invoked, because trails has async ones
  // (`Relation#isEmpty` runs a query) and Ruby's `blank?` issues no I/O.
  const empty = (value as { isEmpty?: unknown }).isEmpty ?? (value as { empty?: unknown }).empty;
  if (typeof empty === "boolean") return empty;
  // blank.rb:111 — `alias_method :blank?, :empty?` on Hash.
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
