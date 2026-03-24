// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyRecord = any;

import { Error as ActiveModelError } from "./error.js";

/**
 * ErrorDetail is now an alias for ActiveModel::Error.
 * Previously a plain interface, now the real Error class.
 */
export type ErrorDetail = ActiveModelError;

/**
 * Errors — collects validation error messages on a model.
 *
 * Mirrors: ActiveModel::Errors
 */
export class Errors {
  private _errors: ActiveModelError[] = [];
  private _base: AnyRecord;

  constructor(base: AnyRecord) {
    this._base = base;
  }

  get base(): AnyRecord {
    return this._base;
  }

  get errors(): this {
    return this;
  }

  add(
    attribute: string,
    type: string = "invalid",
    options?: { message?: string | ((record: AnyRecord) => string) } & Record<string, unknown>,
  ): void {
    const error = new ActiveModelError(this._base, attribute, type, { ...options });
    this._errors.push(error);
  }

  get(attribute: string): string[] {
    return this._errors.filter((e) => e.attribute === attribute).map((e) => e.message);
  }

  on(attribute: string): string[] {
    return this.get(attribute);
  }

  where(attribute: string, type?: string): ActiveModelError[] {
    return this._errors.filter(
      (e) => e.attribute === attribute && (type === undefined || e.type === type),
    );
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

  get details(): ActiveModelError[] {
    return [...this._errors];
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

  ofKind(attribute: string, type?: string): boolean {
    if (type === undefined) {
      return this._errors.some((e) => e.attribute === attribute);
    }
    return this._errors.some((e) => e.attribute === attribute && e.type === type);
  }

  added(attribute: string, type: string = "invalid", _options?: Record<string, unknown>): boolean {
    return this._errors.some((e) => e.attribute === attribute && e.type === type);
  }

  delete(attribute: string, type?: string): ActiveModelError[] {
    const removed: ActiveModelError[] = [];
    this._errors = this._errors.filter((e) => {
      if (e.attribute === attribute && (type === undefined || e.type === type)) {
        removed.push(e);
        return false;
      }
      return true;
    });
    return removed;
  }

  each(fn: (error: ActiveModelError) => void): void {
    for (const error of this._errors) {
      fn(error);
    }
  }

  copy(other: Errors): void {
    for (const error of other._errors) {
      this._errors.push(
        new ActiveModelError(this._base, error.attribute, error.rawType, { ...error.options }),
      );
    }
  }

  merge(other: Errors): void {
    if (other === this) return;
    this.copy(other);
  }

  toHash(): Record<string, string[]> {
    const result: Record<string, string[]> = {};
    for (const error of this._errors) {
      if (!result[error.attribute]) {
        result[error.attribute] = [];
      }
      result[error.attribute].push(error.message);
    }
    return result;
  }

  include(attribute: string): boolean {
    return this._errors.some((e) => e.attribute === attribute);
  }

  toArray(): string[] {
    return this.fullMessages;
  }

  get messages(): Record<string, string[]> {
    return this.toHash();
  }

  generateMessage(
    attribute: string,
    type: string = "invalid",
    options?: Record<string, unknown>,
  ): string {
    return ActiveModelError.generateMessage(attribute, type, this._base, options);
  }

  import(error: ActiveModelError, options?: { attribute?: string }): void {
    const attr = options?.attribute ?? error.attribute;
    this._errors.push(new ActiveModelError(this._base, attr, error.rawType, { ...error.options }));
  }

  asJson(_options?: Record<string, unknown>): Record<string, string[]> {
    return this.toHash();
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
export class UnknownAttributeError extends globalThis.Error {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  readonly record: any;
  readonly attribute: string;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  constructor(record: any, attribute: string) {
    const model = record?.constructor?.name ?? "Record";
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
