import { ArgumentError } from "../attribute-assignment.js";
import { EachValidator } from "../validator.js";
import type { ValidatableRecord } from "../validator.js";
import { isIncludeObj as isInclude } from "@blazetrails/activesupport";
import { resolveValue } from "./resolve-value.js";
import type { AttrNameArg, HelperMethodsHost } from "./helper-methods.js";

export class FormatValidator extends EachValidator {
  declare resolveValue: typeof resolveValue;
  /** @internal */
  declare recordError: typeof recordError;
  /** @internal */
  declare checkOptionsValidity: typeof checkOptionsValidity;
  /** @internal */
  declare regexpUsingMultilineAnchors: typeof regexpUsingMultilineAnchors;

  validateEach(record: ValidatableRecord, attribute: string, value: unknown): void {
    const target = value == null ? "" : String(value);
    if (this.options.with) {
      const regexp = this.resolveValue(record, this.options.with) as RegExp;
      if (!matchStateless(regexp, target)) {
        this.recordError(record, attribute, "with", value);
      }
    } else if (this.options.without) {
      const regexp = this.resolveValue(record, this.options.without) as RegExp;
      if (matchStateless(regexp, target)) {
        this.recordError(record, attribute, "without", value);
      }
    }
  }

  override checkValidityBang(): void {
    if (isInclude(this.options, "with") === isInclude(this.options, "without")) {
      throw new ArgumentError("Either :with or :without must be supplied (but not both)");
    }
    this.checkOptionsValidity("with");
    this.checkOptionsValidity("without");
  }
}

/** @internal */
export function recordError(
  this: { options: Record<string, unknown> },
  record: ValidatableRecord,
  attribute: string,
  name: "with" | "without",
  value: unknown,
): void {
  const rest: Record<string, unknown> = {};
  for (const key of Object.keys(this.options)) {
    if (key !== name) rest[key] = this.options[key];
  }
  rest.value = value;
  record.errors.add(attribute, ":invalid", rest);
}

/** @internal */
export function checkOptionsValidity(
  this: {
    options: Record<string, unknown>;
    regexpUsingMultilineAnchors(regexp: RegExp): boolean;
  },
  name: "with" | "without",
): void {
  const option = this.options[name];
  if (option === undefined || option === null || option === false) return;
  if (option instanceof RegExp) {
    if (this.options.multiline !== true && this.regexpUsingMultilineAnchors(option)) {
      throw new ArgumentError(
        "The provided regular expression is using multiline anchors (^ or $), " +
          "which may present a security risk. Did you mean to use \\A and \\z, " +
          "or forgot to add the :multiline => true option?",
      );
    }
  } else if (typeof option !== "function") {
    throw new ArgumentError(
      `A regular expression or a proc or lambda must be supplied as :${name}`,
    );
  }
}

/** @internal */
export function regexpUsingMultilineAnchors(regexp: RegExp): boolean {
  const source = regexp.source;
  return source.startsWith("^") || (source.endsWith("$") && !source.endsWith("\\$"));
}

function matchStateless(regexp: RegExp, target: string): boolean {
  const before = regexp.lastIndex;
  regexp.lastIndex = 0;
  try {
    return regexp.test(target);
  } finally {
    regexp.lastIndex = before;
  }
}

FormatValidator.prototype.resolveValue = resolveValue;
FormatValidator.prototype.recordError = recordError;
FormatValidator.prototype.checkOptionsValidity = checkOptionsValidity;
FormatValidator.prototype.regexpUsingMultilineAnchors = regexpUsingMultilineAnchors;

export const HelperMethods = {
  validatesFormatOf(this: HelperMethodsHost, ...attrNames: AttrNameArg[]): void {
    return this.validatesWith(FormatValidator, this._mergeAttributes(attrNames));
  },
};
