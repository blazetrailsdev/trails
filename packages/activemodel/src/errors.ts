import { deepDup } from "@blazetrails/activesupport";
import { Hash, transformValues } from "@blazetrails/ruby-compat";
import { Error as ActiveModelError } from "./error.js";
import { NestedError } from "./nested-error.js";

export type ErrorDetail = ActiveModelError;

export type ErrorDetailHash = { error: string; [k: string]: unknown };

const EMPTY_ARRAY: readonly never[] = Object.freeze([]);

export class Errors<TBase extends object = object> {
  private _errors: ActiveModelError[] = [];
  private _base: TBase | null;

  each(fn: (error: ActiveModelError) => void): void {
    this._errors.forEach(fn);
  }

  clear(): void {
    this._errors.length = 0;
  }

  get empty(): boolean {
    return this._errors.length === 0;
  }

  get size(): number {
    return this._errors.length;
  }

  uniqBang(): void {
    this._errors = this._errors.filter(
      (error, i) => this._errors.findIndex((other) => error.equals(other)) === i,
    );
  }

  get errors(): ActiveModelError[] {
    return this._errors;
  }

  get objects(): ActiveModelError[] {
    return this.errors;
  }

  constructor(base: TBase | null) {
    this._base = base;
  }

  copyBang<U extends object>(other: Errors<U>): void {
    this._errors = deepDup(other._errors);
    this._errors.forEach((error) => {
      error.base = this._base;
    });
  }

  import(
    error: ActiveModelError,
    overrideOptions: { attribute?: string; type?: string } = {},
  ): void {
    const type = overrideOptions.type;
    if (type !== undefined) {
      overrideOptions.type = type.startsWith(":") ? type : `:${type}`;
    }
    this._errors.push(new NestedError(this._base, error, overrideOptions));
  }

  mergeBang<U extends object>(other: Errors<U>): ActiveModelError[] {
    if (Object.is(other, this)) return this.errors;

    const errors = other.errors;
    for (const error of errors) {
      this.import(error);
    }
    return errors;
  }

  where(
    attribute: string,
    type?: string | ((record: TBase | null, options: Record<string, unknown>) => string),
    options?: Record<string, unknown>,
  ): ActiveModelError[] {
    const [normAttr, normType, normOpts] = this.normalizeArguments(attribute, type, options);
    return this._errors.filter((e) => e.match(normAttr, normType, normOpts));
  }

  include(attribute: string): boolean {
    return this._errors.some((e) => e.attribute === attribute);
  }

  hasKey(attribute: string): boolean {
    return this.include(attribute);
  }

  isKey(attribute: string): boolean {
    return this.include(attribute);
  }

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

  get(attribute: string): string[] {
    return this.messagesFor(attribute);
  }

  get attributeNames(): string[] {
    return [...new Set(this._errors.map((e) => e.attribute))];
  }

  asJson(options?: Record<string, unknown> | null): Record<string, string[]> {
    const result: Record<string, string[]> = {};
    for (const [attr, msgs] of this.toHash(
      options != null && (options["fullMessages"] as boolean | undefined),
    )) {
      result[attr] = msgs;
    }
    return result;
  }

  get messages(): Map<string, readonly string[]> {
    const hash: Hash<string, readonly string[]> = this.toHash();
    hash.setDefault(EMPTY_ARRAY);
    return hash;
  }

  get details(): Map<string, ReadonlyArray<ErrorDetailHash>> {
    const hash = new Hash<string, ReadonlyArray<ErrorDetailHash>>(EMPTY_ARRAY);
    for (const [attr, details] of Object.entries(
      transformValues(this.groupByAttribute(), (errors) =>
        errors.map((e) => e.details as ErrorDetailHash),
      ),
    )) {
      hash.set(attr, details);
    }
    return hash;
  }

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

  add(
    attribute: string,
    type:
      | string
      | ((record: TBase | null, options: Record<string, unknown>) => string) = ":invalid",
    options?: {
      message?: string | ((record: TBase | null, options: Record<string, unknown>) => string);
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

  added(
    attribute: string,
    type:
      | string
      | ((record: TBase | null, options: Record<string, unknown>) => string) = ":invalid",
    options?: Record<string, unknown>,
  ): boolean {
    let normType: string;
    [attribute, normType, options] = this.normalizeArguments(attribute, type, options);
    if (normType.startsWith(":")) {
      return this._errors.some((e) => e.strictMatch(attribute, normType, options));
    }
    return this.messagesFor(attribute).includes(normType);
  }

  ofKind(
    attribute: string,
    type:
      | string
      | ((record: TBase | null, options: Record<string, unknown>) => string) = ":invalid",
  ): boolean {
    [attribute, type] = this.normalizeArguments(attribute, type);
    if (type.startsWith(":")) {
      return this.where(attribute, type).length > 0;
    }
    return this.messagesFor(attribute).includes(type);
  }

  get fullMessages(): string[] {
    return this._errors.map((e) => e.fullMessage);
  }

  fullMessagesFor(attribute: string): string[] {
    return this.where(attribute).map((e) => e.fullMessage);
  }

  messagesFor(attribute: string): string[] {
    return this.where(attribute).map((e) => e.message);
  }

  fullMessage(attribute: string, message: string): string {
    return ActiveModelError.fullMessage(attribute, message, this._base);
  }

  generateMessage(
    attribute: string,
    type: string = ":invalid",
    options?: Record<string, unknown>,
  ): string {
    return ActiveModelError.generateMessage(attribute, type, this._base, options);
  }

  /** @internal */
  normalizeArguments(
    attribute: string,
    type: string | ((record: TBase | null, options: Record<string, unknown>) => string),
    options?: Record<string, unknown>,
  ): [string, string, Record<string, unknown>];
  /** @internal */
  normalizeArguments(
    attribute: string,
    type?: string | ((record: TBase | null, options: Record<string, unknown>) => string),
    options?: Record<string, unknown>,
  ): [string, string | undefined, Record<string, unknown>];
  /** @internal */
  normalizeArguments(
    attribute: string,
    type?: string | ((record: TBase | null, options: Record<string, unknown>) => string),
    options?: Record<string, unknown>,
  ): [string, string | undefined, Record<string, unknown>] {
    const opts = { ...(options ?? {}) };
    const resolvedType = typeof type === "function" ? type(this._base, opts) : type;
    return [attribute, resolvedType, opts];
  }

  /** @noRailsEquivalent PERMANENT */
  [Symbol.iterator](): IterableIterator<ActiveModelError> {
    return this._errors[Symbol.iterator]();
  }

  get count(): number {
    return this._errors.length;
  }

  get any(): boolean {
    return this._errors.length > 0;
  }

  toHash(fullMessages = false): Hash<string, string[]> {
    const messageMethod = fullMessages ? "fullMessage" : "message";
    const hash = new Hash<string, string[]>();
    for (const [attribute, errors] of Object.entries(
      transformValues(this.groupByAttribute(), (errors) =>
        errors.map((error) => error[messageMethod]),
      ),
    )) {
      hash.set(attribute, errors);
    }
    return hash;
  }

  toArray(): string[] {
    return this.fullMessages;
  }

  inspect(): string {
    const details = this._errors.map((e) => e.inspect());
    return `#<ActiveModel::Errors [${details.join(", ")}]>`;
  }
}

export class StrictValidationFailed extends globalThis.Error {
  constructor(message?: string) {
    super(message);
    this.name = "StrictValidationFailed";
  }
}

export class RangeError extends globalThis.RangeError {
  constructor(message?: string) {
    super(message);
    this.name = "RangeError";
  }
}

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
