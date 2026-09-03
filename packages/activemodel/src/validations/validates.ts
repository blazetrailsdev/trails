import { camelize, extractOptionsBang, sliceBang } from "@blazetrails/activesupport";

import { ArgumentError } from "../attribute-assignment.js";

import { Validator } from "../validator.js";
import { AbsenceValidator } from "./absence.js";
import { AcceptanceValidator } from "./acceptance.js";
import { ComparisonValidator } from "./comparison.js";
import { ConfirmationValidator } from "./confirmation.js";
import { ExclusionValidator } from "./exclusion.js";
import { FormatValidator } from "./format.js";
import { InclusionValidator } from "./inclusion.js";
import { LengthValidator } from "./length.js";
import { NumericalityValidator } from "./numericality.js";
import { PresenceValidator } from "./presence.js";
import { Range } from "@blazetrails/ruby-compat";

type ValidatorClass = new (options: Record<string, unknown>) => Validator;

const BUNDLED_VALIDATORS: Record<string, ValidatorClass> = {
  AbsenceValidator,
  AcceptanceValidator,
  ComparisonValidator,
  ConfirmationValidator,
  ExclusionValidator,
  FormatValidator,
  InclusionValidator,
  LengthValidator,
  NumericalityValidator,
  PresenceValidator,
};

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
  const [attributes, extracted] = extractOptionsBang(args as unknown[]);
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

    const validator = (this as unknown as Record<string, unknown>)[key] ?? BUNDLED_VALIDATORS[key];
    if (typeof validator !== "function") {
      throw new ArgumentError(`Unknown validator: '${key}'`);
    }

    if (options == null || options === false) continue;

    this.validatesWith(validator, { ...defaults, ...this._parseValidatesOptions(options) });
  }
}

export function validatesBang(
  this: ValidatesHost,
  ...args: [...attributes: string[], rules: Record<string, unknown>]
): void {
  const [attributes, options] = extractOptionsBang(args as unknown[]);
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
