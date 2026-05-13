import { Error as ActiveModelError } from "./error.js";
import { NestedError } from "./nested-error.js";

/**
 * ErrorDetail is now an alias for ActiveModel::Error.
 * Previously a plain interface, now the real Error class.
 */
export type ErrorDetail = ActiveModelError;

/** Per-error details hash shape: { error: type, ...filteredOptions } */
export type ErrorDetailHash = { error: string; [k: string]: unknown };

// Singleton frozen empty array returned for missing-key lookups on messages/details.
// Rails uses EMPTY_ARRAY = [].freeze (activemodel/lib/active_model/errors.rb:265).
const EMPTY_ARRAY: readonly never[] = Object.freeze([]);

/**
 * Errors — collects validation error messages on a model.
 *
 * Mirrors: ActiveModel::Errors
 */
export class Errors<TBase extends object = object> {
  private _errors: ActiveModelError[] = [];
  private _base: TBase | null;

  constructor(base: TBase | null) {
    this._base = base;
  }

  get base(): TBase | null {
    return this._base;
  }

  get errors(): this {
    return this;
  }

  /**
   * Add an error for `attribute`. Returns the new `Error`. Mirrors Rails
   * `Errors#add` (activemodel/lib/active_model/errors.rb:342-354):
   *
   *   def add(attribute, type = :invalid, **options)
   *     error = Error.new(@base, attribute, type, **options)
   *     if exception = options[:strict]
   *       exception = ActiveModel::StrictValidationFailed if exception == true
   *       raise exception, error.full_message
   *     end
   *     @errors.append(error)
   *     error
   *   end
   *
   * `strict: true` raises `StrictValidationFailed`; `strict:
   * CustomErrorClass` raises the supplied exception class. The error is
   * still returned when not strict so callers can chain on it.
   */
  add(
    attribute: string,
    type: string | ((record: TBase | null, options: Record<string, unknown>) => string) = "invalid",
    options?: {
      message?: string | ((record: TBase | null) => string);
    } & Record<string, unknown>,
  ): ActiveModelError {
    const [normAttr, normType, normOpts] = this.normalizeArguments(attribute, type, options);
    const error = new ActiveModelError(this._base, normAttr, normType, normOpts);
    const strict = normOpts.strict;
    if (strict) {
      const ExceptionClass: new (message?: string) => globalThis.Error =
        strict === true
          ? StrictValidationFailed
          : (strict as new (message?: string) => globalThis.Error);
      throw new ExceptionClass(error.fullMessage);
    }
    this._errors.push(error);
    return error;
  }

  /**
   * Coerce the arguments to `add` / `where` into a normalized triple.
   * Mirrors Rails `normalize_arguments`
   * (activemodel/lib/active_model/errors.rb:490-497): if `type` is
   * callable, evaluate it against the base + options; return
   * `[attribute, type, options]`.
   *
   * @internal Rails-private helper.
   */
  normalizeArguments(
    attribute: string,
    type: string | ((record: TBase | null, options: Record<string, unknown>) => string),
    options?: Record<string, unknown>,
  ): [string, string, Record<string, unknown>] {
    const opts = { ...(options ?? {}) };
    const resolvedType = typeof type === "function" ? type(this._base, opts) : type;
    return [attribute, resolvedType, opts];
  }

  get(attribute: string): string[] {
    return this._errors.filter((e) => e.attribute === attribute).map((e) => e.message);
  }

  on(attribute: string): string[] {
    return this.get(attribute);
  }

  /**
   * Search errors matching `attribute`, `type`, or `options`. Mirrors
   * Rails `errors.rb:189-194` — delegates to `Error#match?` (subset
   * match on options).
   */
  where(
    attribute: string,
    type?: string | ((record: TBase | null, options: Record<string, unknown>) => string),
    options?: Record<string, unknown>,
  ): ActiveModelError[] {
    if (type === undefined) {
      return this._errors.filter((e) => e.match(attribute));
    }
    const [normAttr, normType, normOpts] = this.normalizeArguments(attribute, type, options);
    return this._errors.filter((e) => e.match(normAttr, normType, normOpts));
  }

  get fullMessages(): string[] {
    return this._errors.map((e) => e.fullMessage);
  }

  get count(): number {
    return this._errors.length;
  }

  get size(): number {
    return this._errors.length;
  }

  get any(): boolean {
    return this._errors.length > 0;
  }

  get empty(): boolean {
    return this._errors.length === 0;
  }

  clear(): void {
    this._errors = [];
  }

  /**
   * The actual array of `Error` objects, exposed as a plain array. Mirrors
   * Rails' `attr_reader :errors` + `alias :objects :errors` where `objects`
   * returns `@errors` directly (activemodel/lib/active_model/errors.rb:107-108).
   */
  get objects(): ActiveModelError[] {
    return this._errors;
  }

  /**
   * Remove duplicate errors in place. Mirrors Rails' delegated `@errors.uniq!`
   * (activemodel/lib/active_model/errors.rb:103). Two errors are equal when
   * they share attribute, raw type, and options (Rails'
   * `Error#==` / `deep_dup` treats these fields as the identity).
   */
  uniqBang(): void {
    const seen = new Set<string>();
    const out: ActiveModelError[] = [];
    for (const error of this._errors) {
      const key = `${error.attribute} ${error.rawType} ${JSON.stringify(error.options ?? {})}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(error);
    }
    this._errors = out;
  }

  /**
   * Returns a Map of attributes to arrays of per-error detail hashes.
   * Each entry is `{ error: type, ...filteredOptions }` (reserved option keys
   * stripped). Missing-key `.get()` returns the singleton frozen `[]`.
   * Mirrors Rails `errors.rb:276-284` + `Error#details` (error.rb:154-157).
   */
  get details(): Map<string, ReadonlyArray<ErrorDetailHash>> {
    const grouped = this.groupByAttribute();
    const map = new Map<string, ReadonlyArray<ErrorDetailHash>>();
    for (const [attr, errors] of Object.entries(grouped)) {
      map.set(
        attr,
        errors.map((e) => e.details as ErrorDetailHash),
      );
    }
    // Proxy: override only `get` so missing keys return EMPTY_ARRAY (Rails
    // hash.default = EMPTY_ARRAY). All other Map methods bound to target so
    // native Map internals (`size`, `forEach`, etc.) keep the correct receiver.
    return new Proxy(map, {
      get(target, prop, receiver) {
        if (prop === "get") {
          return (key: string) => target.get(key) ?? EMPTY_ARRAY;
        }
        const val = Reflect.get(target, prop, target);
        return typeof val === "function" ? val.bind(target) : val;
      },
    });
  }

  get attributeNames(): string[] {
    return [...new Set(this._errors.map((e) => e.attribute))];
  }

  fullMessagesFor(attribute: string): string[] {
    return this._errors.filter((e) => e.attribute === attribute).map((e) => e.fullMessage);
  }

  fullMessage(attribute: string, message: string): string {
    return ActiveModelError.fullMessage(attribute, message, this._base);
  }

  /**
   * Returns `true` if an error of the given type exists on `attribute`.
   * Mirrors Rails `errors.rb:395-403` Symbol-vs-String dispatch:
   * if `type` looks like an i18n key (no spaces → Symbol-like), use `where`;
   * otherwise treat it as a full message string and check `messagesFor`.
   */
  ofKind(attribute: string, type?: string): boolean {
    if (type === undefined) {
      return this._errors.some((e) => e.attribute === attribute);
    }
    if (!type.includes(" ")) {
      // Symbol-like: check for errors of this exact type.
      return this.where(attribute, type).length > 0;
    }
    // String branch: full-message lookup (Rails else clause).
    return this.messagesFor(attribute).includes(type);
  }

  /**
   * Returns `true` if an error with this exact attribute/type/options has
   * been added. Mirrors Rails `Errors#added?`
   * (activemodel/lib/active_model/errors.rb:372-388) Symbol-vs-String dispatch:
   * if `type` looks like an i18n key (no spaces → Symbol-like), use strict match;
   * otherwise treat it as a full message string and check `messagesFor`.
   */
  added(attribute: string, type: string = "invalid", options?: Record<string, unknown>): boolean {
    if (!type.includes(" ")) {
      // Symbol-like branch: strict attribute/type/options match.
      return this._errors.some((e) => e.strictMatch(attribute, type, options));
    }
    // String branch: full-message lookup (Rails else clause in added?).
    return this.messagesFor(attribute).includes(type);
  }

  /**
   * Remove and return errors matching `attribute`/`type`/`options`.
   * Returns the removed errors when non-empty, or `null` when nothing was
   * removed. Mirrors Rails `errors.rb:215-222` — `matches.map(&:message).presence`
   * returns `nil` for an empty array.
   */
  delete(
    attribute: string,
    type?: string,
    options?: Record<string, unknown>,
  ): ActiveModelError[] | null {
    const matches = this.where(attribute, type, options);
    if (matches.length === 0) return null;
    const toRemove = new Set(matches);
    this._errors = this._errors.filter((e) => !toRemove.has(e));
    return matches;
  }

  each(fn: (error: ActiveModelError) => void): void {
    for (const error of this._errors) {
      fn(error);
    }
  }

  /**
   * Makes `Errors` iterable so `for (const e of errors)`, `[...errors]`,
   * and `Array.from(errors)` all work. Mirrors Rails' `include Enumerable`
   * on the Errors class (activemodel/lib/active_model/errors.rb:62) and
   * its `def_delegators :@errors, :each, :clear, :empty?, :size, :uniq!`
   * (errors.rb:103) — `each` powers the Enumerable surface in Ruby; the
   * TS analog is the iterator protocol.
   */
  [Symbol.iterator](): IterableIterator<ActiveModelError> {
    return this._errors[Symbol.iterator]();
  }

  /**
   * Replace this collection's errors with a deep-duped copy of `other`'s,
   * rebinding each error's `base` to this collection's base. Mirrors
   * Rails' `ActiveModel::Errors#copy!`
   * (activemodel/lib/active_model/errors.rb:138-143):
   *
   *   def copy!(other)
   *     @errors = other.errors.deep_dup
   *     @errors.each { |error| error.instance_variable_set(:@base, @base) }
   *   end
   */
  copyBang<U extends object>(other: Errors<U>): void {
    this._errors = other._errors.map((e) => e.dupWithBase(this._base));
  }

  /** Alias for `copyBang` — Rails ships only `copy!`. */
  copy<U extends object>(other: Errors<U>): void {
    this.copyBang(other);
  }

  /**
   * Merge errors from `other`, wrapping each as a `NestedError` so the
   * original error + its options remain accessible. Mirrors Rails'
   * `ActiveModel::Errors#merge!`
   * (activemodel/lib/active_model/errors.rb:174-180):
   *
   *   def merge!(other)
   *     return errors if equal?(other)
   *     other.errors.each { |error| import(error) }
   *   end
   */
  mergeBang<U extends object>(other: Errors<U>): void {
    if (Object.is(other, this)) return;
    for (const error of other._errors) {
      this.import(error);
    }
  }

  /** Alias for `mergeBang` — Rails ships only `merge!`. */
  merge<U extends object>(other: Errors<U>): void {
    this.mergeBang(other);
  }

  /**
   * Returns a Map of attributes to message arrays. When `fullMessages` is
   * true, each message is the full message (e.g. "Name can't be blank").
   * Mirrors Rails `errors.rb:256-261`.
   */
  toHash(fullMessages = false): Map<string, string[]> {
    const map = new Map<string, string[]>();
    for (const error of this._errors) {
      const msg = fullMessages ? error.fullMessage : error.message;
      const existing = map.get(error.attribute);
      if (existing) {
        existing.push(msg);
      } else {
        map.set(error.attribute, [msg]);
      }
    }
    return map;
  }

  include(attribute: string): boolean {
    return this._errors.some((e) => e.attribute === attribute);
  }

  toArray(): string[] {
    return this.fullMessages;
  }

  /**
   * Returns a Map of attributes to their short message arrays. Missing-key
   * `.get()` returns the singleton frozen `[]`. Mirrors Rails `errors.rb:268-273`.
   */
  get messages(): Map<string, readonly string[]> {
    const base = this.toHash(false);
    // Proxy: missing key returns EMPTY_ARRAY (Rails hash.default = EMPTY_ARRAY).
    return new Proxy(base, {
      get(target, prop, receiver) {
        if (prop === "get") {
          return (key: string) => target.get(key) ?? EMPTY_ARRAY;
        }
        const val = Reflect.get(target, prop, target);
        return typeof val === "function" ? val.bind(target) : val;
      },
    });
  }

  generateMessage(
    attribute: string,
    type: string = "invalid",
    options?: Record<string, unknown>,
  ): string {
    return ActiveModelError.generateMessage(attribute, type, this._base, options);
  }

  /**
   * Import a single error, wrapping it as a `NestedError` so the original
   * error object + its options stay reachable. Mirrors Rails'
   * `ActiveModel::Errors#import`
   * (activemodel/lib/active_model/errors.rb:154-161):
   *
   *   def import(error, override_options = {})
   *     ...
   *     @errors.append(NestedError.new(@base, error, override_options))
   *   end
   */
  import(error: ActiveModelError, options?: { attribute?: string; type?: string }): void {
    this._errors.push(new NestedError(this._base, error, options));
  }

  asJson(_options?: Record<string, unknown>): Record<string, string[]> {
    const result: Record<string, string[]> = {};
    for (const [attr, msgs] of this.toHash(false)) {
      result[attr] = msgs;
    }
    return result;
  }

  /**
   * @internal Rails-private helper.
   */
  groupByAttribute(): Record<string, ActiveModelError[]> {
    const result: Record<string, ActiveModelError[]> = {};
    for (const error of this._errors) {
      if (!result[error.attribute]) {
        result[error.attribute] = [];
      }
      result[error.attribute].push(error);
    }
    return result;
  }

  messagesFor(attribute: string): string[] {
    return this.get(attribute);
  }

  inspect(): string {
    const details = this._errors.map((e) => e.inspect());
    return `#<ActiveModel::Errors [${details.join(", ")}]>`;
  }
}

/**
 * Raised when a strict validation fails.
 *
 * Mirrors: ActiveModel::StrictValidationFailed
 */
export class StrictValidationFailed extends globalThis.Error {
  constructor(message?: string) {
    super(message);
    this.name = "StrictValidationFailed";
  }
}

/**
 * Raised when an unknown attribute is set via mass assignment.
 *
 * Mirrors: ActiveModel::UnknownAttributeError
 */
export class UnknownAttributeError<TRecord extends object = object> extends globalThis.Error {
  readonly record: TRecord;
  readonly attribute: string;

  constructor(record: TRecord, attribute: string) {
    const model = record.constructor?.name ?? "Record";
    super(`unknown attribute '${attribute}' for ${model}.`);
    this.name = "UnknownAttributeError";
    this.record = record;
    this.attribute = attribute;
  }
}

/**
 * Mirrors: ActiveModel::RangeError
 */
export class ActiveModelRangeError extends globalThis.RangeError {
  constructor(message?: string) {
    super(message);
    this.name = "ActiveModelRangeError";
  }
}
