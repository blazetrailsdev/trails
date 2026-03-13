import { I18n } from "./i18n.js";

/**
 * NestedError — wraps an error from an associated model.
 *
 * Mirrors: ActiveModel::NestedError
 */
export class NestedError {
  readonly base: unknown;
  readonly innerError: ErrorDetail;
  readonly attribute: string;

  constructor(base: unknown, innerError: ErrorDetail, options?: { attribute?: string }) {
    this.base = base;
    this.innerError = innerError;
    this.attribute = options?.attribute ?? innerError.attribute;
  }

  get message(): string {
    return this.innerError.message;
  }

  get fullMessage(): string {
    if (this.attribute === "base") return this.message;
    const attr = this.attribute.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());
    const format = I18n.t("activemodel.errors.format", {
      defaultValue: "%{attribute} %{message}",
    });
    return format.replace("%{attribute}", attr).replace("%{message}", this.message);
  }

  get type(): string {
    return this.innerError.type;
  }
}

/**
 * Error detail stored in the Errors collection.
 */
export interface ErrorDetail {
  attribute: string;
  type: string;
  message: string;
  options?: Record<string, unknown>;
}

/**
 * Errors — collects validation error messages on a model.
 *
 * Mirrors: ActiveModel::Errors
 */
export class Errors {
  private _errors: ErrorDetail[] = [];
  private _base: unknown;

  constructor(base: unknown) {
    this._base = base;
  }

  /**
   * The object this Errors instance is attached to.
   *
   * Mirrors: ActiveModel::Errors#base
   */
  get base(): unknown {
    return this._base;
  }

  /**
   * Returns self. In Ruby, model.errors returns the Errors object;
   * calling errors.errors is an identity operation.
   *
   * Mirrors: ActiveModel::Errors#errors
   */
  get errors(): this {
    return this;
  }

  /**
   * Add an error for an attribute.
   */
  add(
    attribute: string,
    type: string = "invalid",
    options?: { message?: string | ((record: any) => string) } & Record<string, unknown>,
  ): void {
    let message: string;
    if (typeof options?.message === "function") {
      message = options.message(this._base);
    } else if (options?.message) {
      message = this.interpolateMessage(options.message as string, options);
    } else {
      message = this.generateMessage(attribute, type, options);
    }
    this._errors.push({
      attribute,
      type,
      message,
      options: options ? { ...options, message: message } : undefined,
    });
  }

  private interpolateMessage(msg: string, options?: Record<string, unknown>): string {
    if (!options) return msg;
    let result = msg;
    for (const [key, val] of Object.entries(options)) {
      result = result.replace(`%{${key}}`, String(val));
    }
    return result;
  }

  /**
   * Get error messages for a specific attribute.
   */
  get(attribute: string): string[] {
    return this._errors.filter((e) => e.attribute === attribute).map((e) => e.message);
  }

  /**
   * Bracket accessor — alias for get().
   */
  on(attribute: string): string[] {
    return this.get(attribute);
  }

  /**
   * Filter errors by attribute and/or type.
   */
  where(attribute: string, type?: string): ErrorDetail[] {
    return this._errors.filter(
      (e) => e.attribute === attribute && (type === undefined || e.type === type),
    );
  }

  /**
   * All full messages: "Attribute message".
   */
  get fullMessages(): string[] {
    return this._errors.map((e) => this.fullMessage(e.attribute, e.message));
  }

  /**
   * Number of errors.
   */
  get count(): number {
    return this._errors.length;
  }

  get size(): number {
    return this._errors.length;
  }

  /**
   * Whether there are any errors.
   */
  get any(): boolean {
    return this._errors.length > 0;
  }

  get empty(): boolean {
    return this._errors.length === 0;
  }

  /**
   * Clear all errors.
   */
  clear(): void {
    this._errors = [];
  }

  /**
   * Get all error details.
   */
  get details(): ErrorDetail[] {
    return [...this._errors];
  }

  /**
   * All attribute names that have errors.
   */
  get attributeNames(): string[] {
    return [...new Set(this._errors.map((e) => e.attribute))];
  }

  /**
   * Full messages for a specific attribute.
   *
   * Mirrors: ActiveModel::Errors#full_messages_for
   */
  fullMessagesFor(attribute: string): string[] {
    return this._errors
      .filter((e) => e.attribute === attribute)
      .map((e) => this.fullMessage(e.attribute, e.message));
  }

  /**
   * Check if an error of a specific kind exists for an attribute.
   *
   * Mirrors: ActiveModel::Errors#of_kind?
   */
  ofKind(attribute: string, type?: string): boolean {
    if (type === undefined) {
      return this._errors.some((e) => e.attribute === attribute);
    }
    return this._errors.some((e) => e.attribute === attribute && e.type === type);
  }

  /**
   * Check if a specific error has already been added.
   *
   * Mirrors: ActiveModel::Errors#added?
   */
  added(attribute: string, type: string = "invalid", options?: Record<string, unknown>): boolean {
    return this._errors.some((e) => e.attribute === attribute && e.type === type);
  }

  /**
   * Delete errors for an attribute, optionally filtering by type.
   *
   * Mirrors: ActiveModel::Errors#delete
   */
  delete(attribute: string, type?: string): ErrorDetail[] {
    const removed: ErrorDetail[] = [];
    this._errors = this._errors.filter((e) => {
      if (e.attribute === attribute && (type === undefined || e.type === type)) {
        removed.push(e);
        return false;
      }
      return true;
    });
    return removed;
  }

  /**
   * Iterate over each error.
   *
   * Mirrors: ActiveModel::Errors#each
   */
  each(fn: (error: ErrorDetail) => void): void {
    for (const error of this._errors) {
      fn(error);
    }
  }

  /**
   * Copy errors from another Errors instance.
   *
   * Mirrors: ActiveModel::Errors#copy!
   */
  copy(other: Errors): void {
    for (const error of other._errors) {
      this._errors.push({ ...error });
    }
  }

  /**
   * Merge errors from another Errors instance (alias for copy).
   *
   * Mirrors: ActiveModel::Errors#merge!
   */
  merge(other: Errors): void {
    if (other === this) return;
    this.copy(other);
  }

  /**
   * Group error messages by attribute.
   *
   * Mirrors: ActiveModel::Errors#to_hash
   */
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

  /**
   * Check if there are errors for a specific attribute.
   *
   * Mirrors: ActiveModel::Errors#include?
   */
  include(attribute: string): boolean {
    return this._errors.some((e) => e.attribute === attribute);
  }

  /**
   * Return the errors as an array of [attribute, message] pairs.
   *
   * Mirrors: ActiveModel::Errors#to_a (alias for full_messages)
   */
  toArray(): string[] {
    return this.fullMessages;
  }

  /**
   * Generate a full error message for an attribute and message.
   *
   * Mirrors: ActiveModel::Errors#full_message
   */
  fullMessage(attribute: string, message: string): string {
    if (attribute === "base") return message;
    const base = this._base as any;
    const modelClass = base?.constructor;
    const humanAttr = modelClass?.humanAttributeName
      ? modelClass.humanAttributeName(attribute)
      : attribute.replace(/_/g, " ").replace(/^\w/, (c: string) => c.toUpperCase());
    const format = I18n.t("activemodel.errors.format", {
      defaultValue: "%{attribute} %{message}",
    });
    return format.replace("%{attribute}", humanAttr).replace("%{message}", message);
  }

  /**
   * Return all error messages as a flat array.
   *
   * Mirrors: ActiveModel::Errors#messages (as flat list)
   */
  get messages(): Record<string, string[]> {
    return this.toHash();
  }

  /**
   * Generate a localized error message for an attribute and error type.
   *
   * Mirrors: ActiveModel::Errors#generate_message
   */
  generateMessage(
    attribute: string,
    type: string = "invalid",
    options?: Record<string, unknown>,
  ): string {
    if (options?.message && typeof options.message === "string") {
      return this.interpolateMessage(options.message, options);
    }
    const base = this._base as any;
    const modelClass = base?.constructor;
    const modelKey = modelClass?.name
      ? modelClass.name.replace(/([a-z])([A-Z])/g, "$1_$2").toLowerCase()
      : undefined;
    const humanAttr = modelClass?.humanAttributeName
      ? modelClass.humanAttributeName(attribute)
      : attribute.replace(/_/g, " ").replace(/^\w/, (c: string) => c.toUpperCase());

    const i18nOptions: Record<string, unknown> = {
      ...options,
      model: modelKey,
      attribute: humanAttr,
      value: base && attribute !== "base" ? base[attribute] : undefined,
    };

    const defaults: Array<{ key: string } | { message: string }> = [];
    if (modelKey) {
      defaults.push({
        key: `activemodel.errors.models.${modelKey}.attributes.${attribute}.${type}`,
      });
      defaults.push({ key: `activemodel.errors.models.${modelKey}.${type}` });
    }
    defaults.push({ key: `activemodel.errors.messages.${type}` });
    defaults.push({ key: `errors.attributes.${attribute}.${type}` });
    defaults.push({ key: `errors.messages.${type}` });

    const primaryKey = modelKey
      ? `activemodel.errors.models.${modelKey}.attributes.${attribute}.${type}`
      : `activemodel.errors.messages.${type}`;

    return I18n.t(primaryKey, {
      ...i18nOptions,
      defaults: modelKey ? defaults.slice(1) : defaults.slice(0),
      defaultValue: type,
    });
  }

  /**
   * Import a single error from another Errors instance.
   *
   * Mirrors: ActiveModel::Errors#import
   */
  import(error: ErrorDetail, options?: { attribute?: string }): void {
    const attr = options?.attribute ?? error.attribute;
    this._errors.push({ ...error, attribute: attr });
  }

  /**
   * Return errors as a JSON representation.
   *
   * Mirrors: ActiveModel::Errors#as_json
   */
  asJson(_options?: Record<string, unknown>): Record<string, string[]> {
    return this.toHash();
  }

  /**
   * Group errors by attribute, returning ErrorDetail arrays.
   *
   * Mirrors: ActiveModel::Errors#group_by_attribute
   */
  groupByAttribute(): Record<string, ErrorDetail[]> {
    const result: Record<string, ErrorDetail[]> = {};
    for (const error of this._errors) {
      if (!result[error.attribute]) {
        result[error.attribute] = [];
      }
      result[error.attribute].push(error);
    }
    return result;
  }

  /**
   * Return message strings for a specific attribute.
   *
   * Mirrors: ActiveModel::Errors#messages_for
   */
  messagesFor(attribute: string): string[] {
    return this.get(attribute);
  }

  /**
   * Return a string representation of the errors.
   *
   * Mirrors: ActiveModel::Errors#inspect
   */
  inspect(): string {
    const details = this._errors.map((e) => {
      return `#<ActiveModel::Error attribute=${e.attribute}, type=${e.type}, message="${e.message}">`;
    });
    return `#<ActiveModel::Errors [${details.join(", ")}]>`;
  }
}
