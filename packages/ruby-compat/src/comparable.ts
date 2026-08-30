/**
 * Ruby's core `Comparable` module (`vendor/ruby/compar.c:313`
 * `Init_Comparable`) and the `<=>` send every one of its members is derived
 * from. JS has no `<=>` operator and no module to include, so both halves live
 * here: {@link cmp} is the send, and the derived operators are `this`-typed
 * functions a class assigns to itself (CLAUDE.md "Module mixins" — `include()`
 * / `Included<>` is ActiveSupport's, and this package takes no workspace
 * dependencies).
 *
 * The nullable return is the whole point: Ruby's `<=>` answers **nil** for an
 * operand it cannot place (`Float::NAN <=> 0`, `Object#<=>` against an
 * unrelated object), and a `cmp` typed `number` silently loses that arm. Every
 * derived operator goes through {@link cmpint}, which turns that nil into
 * `rb_cmperr`'s `ArgumentError`; `equals` is the one that does not raise.
 *
 * @boundary-file: a JS `Date` is compared as epoch millis, since Ruby's
 *   `Time#<=>` (`vendor/ruby/time.c:3951` `time_cmp`) orders by the instant and
 *   JS `Date` carries no relational operators of its own.
 */

import { ArgumentError } from "./argument-error.js";
import { rbEqual } from "./rb-equal.js";

/**
 * The Ruby class name `rb_obj_class` reports in `rb_cmperr`'s message
 * (`vendor/ruby/compar.c:28`) — `Date::Infinity`, which no JS
 * `constructor.name` can spell. A JS `Symbol` because it is a brand, not a
 * Ruby Symbol value.
 *
 * @noRailsEquivalent PERMANENT — the brand standing in for `rb_obj_class`
 * (`vendor/ruby/compar.c:28`); Ruby core, not Rails.
 */
export const rubyClass = Symbol.for("@blazetrails/ruby-compat:rubyClass");

/**
 * The receiver of the mixin: a class that defines `<=>`. Ruby spells that
 * `compareTo` here, since `Comparable#==` already claims `equals`.
 *
 * @noRailsEquivalent PERMANENT — Ruby core `Comparable`
 * (`vendor/ruby/compar.c:315`), which Rails inherits rather than defines.
 */
export interface Comparable {
  compareTo(other: unknown): number | null;
  readonly [rubyClass]?: string;
}

/**
 * The same `<=>` under the other spelling trails gives it: `@blazetrails/date`
 * names `Date#<=>` and `Rational#<=>` `cmp`, ActiveSupport names
 * `TimeWithZone#<=>` `compareTo`. One Ruby method, two TS names.
 *
 * @noRailsEquivalent PERMANENT — the one Ruby `<=>`
 * (`vendor/ruby/compar.c:315`) under trails' second TS spelling of it.
 */
interface CmpSpelling {
  cmp(other: unknown): number | null;
}

/**
 * Ruby's `a <=> b` over the values trails carries: the receiver's own `<=>`
 * when it has one, and otherwise the relational reading `Integer#<=>`,
 * `Float#<=>` and `String#<=>` each define, falling back to the inherited
 * `Object#<=>` (`vendor/ruby/object.c:1665` `rb_obj_cmp`) for everything else.
 * `nil` for an operand it cannot place, which includes `Float::NAN`, a
 * cross-type operand, and `rb_obj_cmp`'s unequal arm.
 *
 * @boundary: a Temporal value has neither `<=>` spelling nor a JS ordering, so
 * it reaches `rb_obj_cmp`; `calculations.ts`'s `compare` — the one caller that
 * orders Temporal receivers — hands over each side's epoch reading instead.
 *
 * @noRailsEquivalent PERMANENT — Ruby core `Comparable` — the `<=>` send it is defined over
 * (`vendor/ruby/compar.c:315`), which Rails inherits rather than defines.
 */
export function cmp(a: unknown, b: unknown): number | null {
  if (a === null || a === undefined || b === null || b === undefined) {
    return a === b ? 0 : null;
  }
  // boundary: Date endpoints are compared as epoch millis.
  if (a instanceof Date) a = a.getTime();
  if (b instanceof Date) b = b.getTime();
  if (isComparable(a)) return a.compareTo(b) ?? null;
  if (isCmpSpelling(a)) return a.cmp(b) ?? null;
  if (typeof a === "number" || typeof a === "bigint") {
    /* `rb_int_cmp` (`vendor/ruby/numeric.c:4696`) and `flo_cmp`
       (`vendor/ruby/numeric.c:1700`) answer nil for a non-Numeric, and for NaN. */
    if (typeof b !== "number" && typeof b !== "bigint") return null;
    if (Number.isNaN(a as number) || Number.isNaN(b as number)) return null;
    return a < b ? -1 : a > b ? 1 : 0;
  }
  if (typeof a === "string") {
    /* `rb_str_cmp_m` (`vendor/ruby/string.c:3803`) answers nil for a non-String. */
    if (typeof b !== "string") return null;
    return a < b ? -1 : a > b ? 1 : 0;
  }
  /* `vendor/ruby/object.c:1665` `rb_obj_cmp` — the inherited `<=>`: `0` for an
     `==` operand and nil otherwise, rather than JS relational coercion, which
     orders `false` before `true` where Ruby answers nil. */
  return rbEqual(a, b) ? 0 : null;
}

function isComparable(value: unknown): value is Comparable {
  return typeof (value as { compareTo?: unknown }).compareTo === "function";
}

function isCmpSpelling(value: unknown): value is CmpSpelling {
  return typeof (value as { cmp?: unknown }).cmp === "function";
}

/**
 * Ruby's `rb_cmperr` (`vendor/ruby/compar.c:28`), which names the operand by
 * `inspect` when it is a special constant or a Float and by `rb_obj_class`
 * otherwise.
 */
function rbCmperr(x: Comparable, y: unknown): never {
  const classname =
    y === null ||
    y === undefined ||
    typeof y === "boolean" ||
    typeof y === "number" ||
    typeof y === "bigint"
      ? String(y)
      : ((y as object).constructor?.name ?? typeof y);
  throw new ArgumentError(`comparison of ${rbObjClass(x)} with ${classname} failed`);
}

function rbObjClass(x: Comparable): string {
  return x[rubyClass] ?? x.constructor.name;
}

/**
 * Ruby's `cmpint` (`vendor/ruby/compar.c:91`), the one body every operator
 * below is derived from: a `nil` `<=>` is an `ArgumentError`, not a `false`.
 * @noRailsEquivalent PERMANENT — Ruby core `Comparable` `cmpint` (`vendor/ruby/compar.c:91`).
 */
export function cmpint(this: Comparable, other: unknown): number {
  const c = this.compareTo(other);
  if (c === null || c === undefined) rbCmperr(this, other);
  return c;
}

/** Ruby `Comparable#<` (`vendor/ruby/compar.c:133` `cmp_lt`).
 *  @noRailsEquivalent PERMANENT — Ruby core `Comparable` `cmp_lt` (`vendor/ruby/compar.c:133`). */
export function lessThan(this: Comparable, other: unknown): boolean {
  return cmpint.call(this, other) < 0;
}

/** Ruby `Comparable#<=` (`vendor/ruby/compar.c:147` `cmp_le`).
 *  @noRailsEquivalent PERMANENT — Ruby core `Comparable` `cmp_le` (`vendor/ruby/compar.c:147`). */
export function lessThanOrEqual(this: Comparable, other: unknown): boolean {
  return cmpint.call(this, other) <= 0;
}

/** Ruby `Comparable#>` (`vendor/ruby/compar.c:105` `cmp_gt`).
 *  @noRailsEquivalent PERMANENT — Ruby core `Comparable` `cmp_gt` (`vendor/ruby/compar.c:105`). */
export function greaterThan(this: Comparable, other: unknown): boolean {
  return cmpint.call(this, other) > 0;
}

/** Ruby `Comparable#>=` (`vendor/ruby/compar.c:119` `cmp_ge`).
 *  @noRailsEquivalent PERMANENT — Ruby core `Comparable` `cmp_ge` (`vendor/ruby/compar.c:119`). */
export function greaterThanOrEqual(this: Comparable, other: unknown): boolean {
  return cmpint.call(this, other) >= 0;
}

/**
 * Ruby `Comparable#==` (`vendor/ruby/compar.c:79` `cmp_equal`), the one
 * derived operator that does NOT raise: an incomparable operand — a `nil`
 * `<=>` — is `false` here. An identical object is `true` before `<=>` is sent
 * at all.
 * @noRailsEquivalent PERMANENT — Ruby core `Comparable` `cmp_equal` (`vendor/ruby/compar.c:79`).
 */
export function equals(this: Comparable, other: unknown): boolean {
  if ((this as unknown) === other) return true;
  const c = this.compareTo(other);
  if (c === null || c === undefined) return false;
  return c === 0;
}

/**
 * Ruby `Comparable#between?` (`vendor/ruby/compar.c:168` `cmp_between`), which
 * is `cmpint` on both ends and so raises for an operand `<=>` cannot place.
 * @noRailsEquivalent PERMANENT — Ruby core `Comparable` `cmp_between` (`vendor/ruby/compar.c:168`).
 */
export function isBetween(this: Comparable, min: unknown, max: unknown): boolean {
  return cmpint.call(this, min) >= 0 && cmpint.call(this, max) <= 0;
}
