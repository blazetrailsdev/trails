/**
 * Clusivity — shared logic for inclusion/exclusion validators.
 *
 * Mirrors: ActiveModel::Validations::Clusivity (clusivity.rb)
 *
 * Rails ships Clusivity as a module included by both InclusionValidator
 * and ExclusionValidator. It provides `check_validity!`, the membership
 * test `include?`, the cached `delimiter` accessor, and the
 * `inclusion_method(enumerable)` selector. In TS we expose each as a
 * `this`-typed function that the validator classes attach to their
 * prototypes (see InclusionValidator.prototype.* / ExclusionValidator
 * .prototype.* assignments in inclusion.ts / exclusion.ts). Prototype
 * placement matters because `EachValidator`'s constructor calls
 * `this.checkValidity()` before subclass class fields initialize — and
 * because subclass overrides should be honored, matching Rails' Ruby
 * method-lookup semantics.
 */
import { resolveValue } from "./resolve-value.js";

export { resolveValue };

export const ERROR_MESSAGE =
  "An object with the method #include? or a proc, lambda or symbol is required, " +
  "and must be supplied as the :in (or :within) option of the configuration hash";

export interface Clusivity {
  checkValidity(): void;
  resolveValue(record: unknown, value: unknown): unknown;
  delimiter(): unknown;
  inclusionMethod(enumerable: unknown): "include?" | "cover?";
  isInclude(record: unknown, value: unknown): boolean;
}

interface ClusivityHost {
  options: Record<string, unknown>;
  resolveValue(record: unknown, value: unknown): unknown;
  delimiter(): unknown;
  inclusionMethod(enumerable: unknown): "include?" | "cover?";
  _delimiterCache?: unknown;
}

/**
 * Mirrors: clusivity.rb:31-33
 *   def delimiter
 *     @delimiter ||= options[:in] || options[:within]
 *   end
 *
 * Memoized so a Proc passed as `:in` / `:within` is captured once
 * per validator instance, matching Rails' `||=` semantics.
 *
 * @internal
 */
export function delimiter(this: ClusivityHost): unknown {
  // Rails `@delimiter ||= ...` recomputes only when the cached value
  // is nil or false (Ruby falsiness). JS falsiness is wider — `0` and
  // `""` are truthy in Ruby but falsy in JS — so use an explicit
  // nil-or-false sentinel check instead of plain truthiness.
  if (
    this._delimiterCache !== undefined &&
    this._delimiterCache !== null &&
    this._delimiterCache !== false
  ) {
    return this._delimiterCache;
  }
  // Rails: `options[:in] || options[:within]` — Ruby's `||` falls
  // back when the left side is nil OR false, not just nullish. JS `??`
  // would cache an explicit `false` and ignore `within`; reproduce
  // Ruby semantics explicitly.
  const inOpt = this.options.in;
  this._delimiterCache =
    inOpt !== undefined && inOpt !== null && inOpt !== false ? inOpt : this.options.within;
  return this._delimiterCache;
}

/**
 * Mirrors: clusivity.rb:40-50
 *
 *   def inclusion_method(enumerable)
 *     if enumerable.is_a? Range
 *       case enumerable.begin || enumerable.end
 *       when Numeric, Time, DateTime, Date then :cover?
 *       else :include?
 *       end
 *     else
 *       :include?
 *     end
 *   end
 *
 * TS has no first-class Range; iterables are treated uniformly as
 * `include?`. If a Range-like type lands later, the cover-vs-include
 * branch slots in here.
 *
 * @internal
 */
export function inclusionMethod(_enumerable: unknown): "include?" | "cover?" {
  return "include?";
}

/**
 * Mirrors: clusivity.rb:21-29
 *   def include?(record, value)
 *     members = resolve_value(record, delimiter)
 *     if value.is_a?(Array)
 *       value.all? { |v| members.public_send(inclusion_method(members), v) }
 *     else
 *       members.public_send(inclusion_method(members), value)
 *     end
 *   end
 *
 * `resolve_value` resolves Procs and Symbol-method references; a string
 * option treated as a method name only if the record responds to it
 * (resolve-value.ts).
 *
 * @internal
 */
export function isInclude(this: ClusivityHost, record: unknown, value: unknown): boolean {
  // Route through `this.delimiter()` / `this.inclusionMethod(...)` so
  // a subclass that overrides either gets the same dispatch Rails'
  // Ruby method lookup would give it. Direct calls to the free
  // functions would bypass overrides.
  const members = this.resolveValue(record, this.delimiter());
  // Rails: `members.public_send(inclusion_method(members), v)`. The
  // cover-vs-include branch slots in via inclusionMethod when a Range
  // type lands without reworking the call path.
  const method = this.inclusionMethod(members);
  if (Array.isArray(value)) {
    return value.every((v) => testMembership(members, v, method));
  }
  return testMembership(members, value, method);
}

function testMembership(members: unknown, value: unknown, method: "include?" | "cover?"): boolean {
  if (method === "cover?") {
    // Range#cover? semantics — start/end endpoint check. No first-class
    // Range type in TS yet; if/when it lands, dispatch goes here.
    return isMemberOf(members, value);
  }
  return isMemberOf(members, value);
}

function isMemberOf(members: unknown, value: unknown): boolean {
  // Rails: nil.include?(value) raises NoMethodError. A Proc that returns
  // nil from resolve_value would surface a misconfigured validator
  // loudly. Mirror that — silent `return false` would convert a config
  // bug into a routine validation failure.
  if (members === null || members === undefined) {
    throw new TypeError(
      `inclusion/exclusion: :in or :within resolved to ${members === null ? "null" : "undefined"}`,
    );
  }
  // String#include? in Ruby is substring match; JS String#includes matches
  // when value is also a string.
  if (typeof members === "string") {
    return typeof value === "string" && members.includes(value);
  }
  // Set / Map both expose .has — for Map this is key membership, matching
  // Ruby's Hash#include?(key). Custom collections that implement .has
  // pick up the same fast path.
  if (members instanceof Set || members instanceof Map) return members.has(value);
  // Array.includes covers Array; many custom collections also expose
  // .includes(item) and behave like Rails' #include?.
  if (Array.isArray(members)) return members.includes(value);
  const m = members as { includes?: (v: unknown) => boolean; has?: (v: unknown) => boolean };
  if (typeof m.includes === "function") return m.includes(value);
  if (typeof m.has === "function") return m.has(value);
  if (typeof (members as Iterable<unknown>)[Symbol.iterator] === "function") {
    for (const item of members as Iterable<unknown>) {
      if (item === value) return true;
    }
    return false;
  }
  return false;
}

/**
 * Rails: `options.except(:in, :within).merge!(value: value)` — passes
 * through every validator option except the collection keys, with the
 * rejected value merged in for i18n interpolation
 * (inclusion.rb:11, exclusion.rb:11).
 */
export function exceptInWithinMergeValue(
  options: Record<string, unknown>,
  value: unknown,
): Record<string, unknown> {
  const rest: Record<string, unknown> = {};
  for (const key of Object.keys(options)) {
    if (key !== "in" && key !== "within") rest[key] = options[key];
  }
  rest.value = value;
  return rest;
}

/**
 * Mirrors: clusivity.rb:14-18
 *   def check_validity!
 *     unless delimiter.respond_to?(:include?) || delimiter.respond_to?(:call) || delimiter.respond_to?(:to_sym)
 *       raise ArgumentError, ERROR_MESSAGE
 *     end
 *   end
 *
 * TS analogues for the three Ruby duck checks:
 * - `respond_to?(:include?)` ↔ array / iterable / Set
 * - `respond_to?(:call)` ↔ function
 * - `respond_to?(:to_sym)` ↔ string (resolved via resolveValue at call time)
 */
export function checkValidityBang(this: ClusivityHost): void {
  const d = this.delimiter();
  if (d === undefined || d === null) {
    throw new Error(ERROR_MESSAGE);
  }
  // Symmetric with isMemberOf — anything membership accepts must also
  // pass validity. Maps Ruby duck checks to TS analogues:
  //   respond_to?(:include?) ↔ string (substring), Array, Set, iterable,
  //                            custom .includes / .has
  //   respond_to?(:call)     ↔ function
  //   respond_to?(:to_sym)   ↔ string (resolved via resolveValue at call time)
  const isString = typeof d === "string";
  const hasIncludeMethod =
    typeof d === "object" &&
    d !== null &&
    (typeof (d as { includes?: unknown }).includes === "function" ||
      typeof (d as { has?: unknown }).has === "function");
  const isIterable =
    Array.isArray(d) ||
    d instanceof Set ||
    d instanceof Map ||
    (typeof d === "object" &&
      d !== null &&
      typeof (d as Record<symbol, unknown>)[Symbol.iterator] === "function");
  const isCallable = typeof d === "function";
  if (!isString && !hasIncludeMethod && !isIterable && !isCallable) {
    throw new Error(ERROR_MESSAGE);
  }
}
