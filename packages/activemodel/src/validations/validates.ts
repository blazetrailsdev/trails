import { camelize, extractOptionsBang, sliceBang } from "@blazetrails/activesupport";

import { ArgumentError, NameError } from "../attribute-assignment.js";

import { Range, rbModConstGet } from "@blazetrails/ruby-compat";

export interface ValidatesHost {
  _validatesDefaultKeys(): string[];
  _parseValidatesOptions(options: unknown): Record<string, unknown>;
  validates(...args: unknown[]): void;
  validatesWith(...args: unknown[]): void;
}

export function validates(
  this: ValidatesHost,
  ...args: [...attributes: string[], rules: Record<string, unknown>]
): void {
  const extracted = extractOptionsBang(args as unknown[]);
  const attributes = args as unknown[];
  const defaults = { ...extracted };
  const validations = sliceBang(defaults, ...this._validatesDefaultKeys());

  if (attributes.length === 0) {
    throw new ArgumentError("You need to supply at least one attribute");
  }
  if (Object.keys(validations).length === 0) {
    throw new ArgumentError("You need to supply at least one validation");
  }

  defaults.attributes = attributes;

  for (const [rawKey, options] of Object.entries(validations)) {
    const key = `${camelize(rawKey)}Validator`;

    let validator: unknown;
    try {
      validator = rbModConstGet(this, key);
    } catch (e) {
      if (e instanceof NameError) throw new ArgumentError(`Unknown validator: '${key}'`);
      throw e;
    }

    if (options == null || options === false) continue;

    this.validatesWith(validator, { ...defaults, ...this._parseValidatesOptions(options) });
  }
}

export function validatesBang(
  this: ValidatesHost,
  ...args: [...attributes: string[], rules: Record<string, unknown>]
): void {
  const options = extractOptionsBang(args as unknown[]);
  const attributes = args as unknown[];
  options.strict = true;
  this.validates(...(attributes as string[]), options);
}

/** @internal */
export function _validatesDefaultKeys(): string[] {
  return ["if", "unless", "on", "allowBlank", "allowNil", "strict", "exceptOn"];
}

/** @internal */
export function _parseValidatesOptions(options: unknown): Record<string, unknown> {
  if (options === true) return {};
  if (options !== null && typeof options === "object" && options.constructor === Object) {
    return options as Record<string, unknown>;
  }
  if (options instanceof Range || Array.isArray(options)) return { in: options };
  return { with: options };
}
