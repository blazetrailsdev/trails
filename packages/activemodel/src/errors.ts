import {
  deepDup,
  include,
  presence,
  ToJsonWithActiveSupportEncoder,
  type Included,
} from "@blazetrails/activesupport";
import {
  Enumerable,
  FrozenError,
  groupBy,
  type Hash,
  hasKey,
  isEmpty,
  rbEqual,
  rbInspect,
  rbDeclareIvar,
  rbModConstSet,
  rbModName,
  rbObjDup,
  symbolToS,
  toSym,
  transformValues,
} from "@blazetrails/ruby-compat";
import { Error as ActiveModelError } from "./error.js";
import { NestedError } from "./nested-error.js";
import { ActiveModel } from "./namespaces.js";

export type ErrorDetail = ActiveModelError;

export type ErrorDetailHash = { error: string; [k: string]: unknown };

const EMPTY_ARRAY: readonly never[] = new Proxy(Object.freeze([]), {
  set(target): boolean {
    throw new FrozenError(`can't modify frozen Array: ${rbInspect(target)}`, { receiver: target });
  },
  deleteProperty(target): boolean {
    throw new FrozenError(`can't modify frozen Array: ${rbInspect(target)}`, { receiver: target });
  },
});

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging -- Ruby `include` (core_ext/object/json.rb:47-49); the class/interface merge is how `include()` surfaces on the type side.
export class Errors<TBase extends object = object> {
  private _errors: ActiveModelError[] = [];
  private _base: TBase | null;

  each(fn: (error: ActiveModelError) => void): void {
    this._errors.forEach(fn);
  }

  clear(): void {
    this._errors.length = 0;
  }

  isEmpty(): boolean {
    return isEmpty(this._errors);
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

  initializeDup(other: Errors<TBase>): void {
    this._errors = deepDup(other.errors);
  }

  copyBang<U extends object>(other: Errors<U>): void {
    this._errors = deepDup(other._errors);
    this._errors.forEach((error) => {
      error.base = this._base;
    });
  }

  /** @missingRailsName base — PERMANENT */
  import(
    error: ActiveModelError,
    overrideOptions: { attribute?: string; type?: string } = {},
  ): void {
    for (const key of ["attribute", "type"] as const) {
      if (hasKey(overrideOptions, key)) {
        overrideOptions[key] = toSym(overrideOptions[key]);
      }
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

  isInclude(attribute: string): boolean {
    return this._errors.some((e) => e.match(symbolToS(toSym(attribute))));
  }

  hasKey(attribute: string): boolean {
    return this.isInclude(attribute);
  }

  isKey(attribute: string): boolean {
    return this.isInclude(attribute);
  }

  delete(
    attribute: string,
    type?: string,
    options?: Record<string, unknown>,
  ): (string | null)[] | null {
    [attribute, type, options] = this.normalizeArguments(attribute, type, options);
    const matches = this.where(attribute, type, options);
    for (const error of matches) {
      this._errors = this._errors.filter((e) => !rbEqual(e, error));
    }
    return presence(matches.map((error) => error.message)) ?? null;
  }

  get(attribute: string): (string | null)[] {
    return this.messagesFor(attribute);
  }

  get attributeNames(): readonly string[] {
    return Object.freeze([...new Set(this._errors.map((e) => e.attribute))]);
  }

  asJson(options: Record<string, unknown> | null = null): Hash<string, (string | null)[]> {
    return this.toHash((options && options["fullMessages"]) as boolean);
  }

  get messages(): Map<string, readonly (string | null)[]> {
    const hash: Hash<string, readonly (string | null)[]> = this.toHash();
    hash.setDefault(EMPTY_ARRAY);
    hash.freeze();
    return hash;
  }

  get details(): Map<string, ReadonlyArray<ErrorDetailHash>> {
    const hash: Hash<string, ReadonlyArray<ErrorDetailHash>> = transformValues(
      this.groupByAttribute(),
      (errors) => errors.map((error) => error.details as ErrorDetailHash),
    );
    hash.setDefault(EMPTY_ARRAY);
    hash.freeze();
    return hash;
  }

  groupByAttribute(): Hash<string, ActiveModelError[]> {
    return groupBy(this._errors, (error) => error.attribute);
  }

  add(
    attribute: string,
    type:
      | string
      | null
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
      throw new ExceptionClass(error.fullMessage ?? undefined);
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

  get fullMessages(): (string | null)[] {
    return this._errors.map((e) => e.fullMessage);
  }

  fullMessagesFor(attribute: string): readonly (string | null)[] {
    return Object.freeze(this.where(attribute).map((e) => e.fullMessage));
  }

  messagesFor(attribute: string): (string | null)[] {
    return this.where(attribute).map((e) => e.message);
  }

  /** @missingRailsName base — PERMANENT */
  fullMessage(attribute: string, message: string | null): string | null {
    return ActiveModelError.fullMessage(attribute, message, this._base);
  }

  /** @missingRailsName base — PERMANENT */
  generateMessage(
    attribute: string,
    type: string = ":invalid",
    options: Record<string, unknown> = {},
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
    type: string | null | ((record: TBase | null, options: Record<string, unknown>) => string),
    options?: Record<string, unknown>,
  ): [string, string | null, Record<string, unknown>];
  /** @internal */
  normalizeArguments(
    attribute: string,
    type?: string | ((record: TBase | null, options: Record<string, unknown>) => string),
    options?: Record<string, unknown>,
  ): [string, string | undefined, Record<string, unknown>];
  /** @internal */
  normalizeArguments(
    attribute: string,
    type?: string | null | ((record: TBase | null, options: Record<string, unknown>) => string),
    options?: Record<string, unknown>,
  ): [string, string | null | undefined, Record<string, unknown>] {
    const opts = { ...(options ?? {}) };
    const resolvedType = typeof type === "function" ? type(this._base, opts) : type;
    return [symbolToS(toSym(attribute)), resolvedType, opts];
  }

  dup(): this {
    return rbObjDup(this);
  }

  get count(): number {
    return this._errors.length;
  }

  toHash(fullMessages = false): Hash<string, (string | null)[]> {
    const messageMethod = fullMessages ? "fullMessage" : "message";
    return transformValues(this.groupByAttribute(), (errors) =>
      errors.map((error) => error[messageMethod]),
    );
  }

  toArray(): (string | null)[] {
    return this.fullMessages;
  }

  inspect(): string {
    const inspection = rbInspect(this._errors);

    return `#<${rbModName(this.constructor as typeof Errors) ?? ""} ${inspection}>`;
  }
}

export interface Errors<TBase extends object = object> {
  map<R>(block: (error: ActiveModelError) => R): R[];
  first(): ActiveModelError | null;
  first(n: number): ActiveModelError[];
  isAny(block?: (error: ActiveModelError) => unknown): boolean;
  [Symbol.iterator](): IterableIterator<ActiveModelError>;
  toJSON: Included<typeof ToJsonWithActiveSupportEncoder>["toJSON"];
}

include(Errors, Enumerable);
include(Errors, ToJsonWithActiveSupportEncoder);

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

rbModConstSet(ActiveModel, "Errors", Errors);
rbDeclareIvar(Errors, "@errors", "_errors");
rbDeclareIvar(Errors, "@base", "_base");
ActiveModel.RangeError = RangeError;
ActiveModel.StrictValidationFailed = StrictValidationFailed;
ActiveModel.UnknownAttributeError = UnknownAttributeError;
