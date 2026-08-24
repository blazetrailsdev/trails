import { Range, camelize, extractOptionsBang, sliceBang } from "@blazetrails/activesupport";

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

type ValidatorClass = new (options: Record<string, unknown>) => Validator;

/**
 * Ruby resolves `const_get("#{key.to_s.camelize}Validator")`
 * (validates.rb:121-126) against the model class, whose ancestry reaches
 * `ActiveModel::Validations` and so its bundled validator constants. JS has no
 * constant lookup that walks a class's namespace, so the bundled half of that
 * ancestry is this table; the class's own statics are consulted first, which is
 * where a model-local `TitleValidator` lives.
 */
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

/** The `Model` surface `validates` self-sends. */
export interface ValidatesHost {
  _validatesDefaultKeys(): string[];
  _parseValidatesOptions(options: unknown): Record<string, unknown>;
  validates(...args: unknown[]): void;
  validatesWith(...args: unknown[]): void;
}

/**
 * Mirrors: ActiveModel::Validations::ClassMethods#validates
 * (validations/validates.rb:111-133).
 */
export function validates(
  this: ValidatesHost,
  ...attributes: [...attributes: string[], rules: Record<string, unknown>]
): void {
  const [rest, extracted] = extractOptionsBang(attributes as unknown[]);
  const attrs = rest as string[];
  const defaults = { ...extracted };
  const validations = sliceBang(defaults, ...this._validatesDefaultKeys());

  if (attrs.length === 0) {
    throw new ArgumentError("You need to supply at least one attribute");
  }
  if (Object.keys(validations).length === 0) {
    throw new ArgumentError("You need to supply at least one validation");
  }

  defaults.attributes = attrs;

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

/**
 * Mirrors: ActiveModel::Validations::ClassMethods#validates!
 * (validations/validates.rb:153-157).
 */
export function validatesBang(
  this: ValidatesHost,
  ...attributes: [...attributes: string[], rules: Record<string, unknown>]
): void {
  const [rest, options] = extractOptionsBang(attributes as unknown[]);
  options.strict = true;
  this.validates(...(rest as string[]), options);
}

/**
 * Mirrors: ActiveModel::Validations::ClassMethods#_validates_default_keys
 * (validations/validates.rb:162-164).
 *
 * @internal Rails-private helper.
 */
export function _validatesDefaultKeys(): string[] {
  return ["if", "unless", "on", "allowBlank", "allowNil", "strict", "exceptOn"];
}

/**
 * Mirrors: ActiveModel::Validations::ClassMethods#_parse_validates_options
 * (validations/validates.rb:166-178).
 *
 * @internal Rails-private helper.
 */
export function _parseValidatesOptions(options: unknown): Record<string, unknown> {
  if (options === true) return {};
  if (options !== null && typeof options === "object" && options.constructor === Object) {
    return options as Record<string, unknown>;
  }
  if (options instanceof Range || Array.isArray(options)) return { in: options };
  return { with: options };
}
