/**
 * ActionView::Helpers::NumberHelper — thin wrappers around `@blazetrails/activesupport`
 * NumberHelper that add `raise: true`, HTML-escaping of user-supplied format options,
 * and html_safe marking when the input parses as a number or is already html_safe.
 */

import {
  NumberHelper,
  SafeBuffer,
  htmlEscape,
  htmlSafe,
  isHtmlSafe,
} from "@blazetrails/activesupport";

export class InvalidNumberError extends Error {
  number: unknown;
  constructor(number: unknown) {
    super(String(number));
    this.name = "InvalidNumberError";
    this.number = number;
  }
}

export interface NumberHelperOptions {
  format?: string | SafeBuffer;
  negativeFormat?: string | SafeBuffer;
  separator?: string | SafeBuffer;
  delimiter?: string | SafeBuffer;
  unit?: string | SafeBuffer;
  units?: Record<string, string | SafeBuffer>;
  raise?: boolean;
  precision?: number;
  significant?: boolean;
  stripInsignificantZeros?: boolean;
  areaCode?: boolean;
  extension?: string | number;
  countryCode?: string | number;
  [key: string]: unknown;
}

type NumberLike = number | string | SafeBuffer | null | undefined;

const asArg = (n: NumberLike): unknown => (n instanceof SafeBuffer ? n.toString() : n);

export function numberToPhone(
  number: NumberLike,
  options: NumberHelperOptions = {},
): SafeBuffer | null {
  if (number == null) return null;
  const { raise: raiseOnInvalid, ...rest } = options;
  if (raiseOnInvalid) parseFloat(number, true);
  const opts: Record<string, unknown> = { ...rest };
  if (opts.delimiter instanceof SafeBuffer) opts.delimiter = opts.delimiter.toString();
  return htmlEscape(NumberHelper.numberToPhone(asArg(number), opts));
}

export function numberToCurrency(number: NumberLike, options: NumberHelperOptions = {}) {
  return delegateNumberHelperMethod(NumberHelper.numberToCurrency, number, options);
}

export function numberToPercentage(number: NumberLike, options: NumberHelperOptions = {}) {
  return delegateNumberHelperMethod(NumberHelper.numberToPercentage, number, options);
}

export function numberWithDelimiter(number: NumberLike, options: NumberHelperOptions = {}) {
  return delegateNumberHelperMethod(NumberHelper.numberWithDelimiter, number, options);
}

export function numberWithPrecision(number: NumberLike, options: NumberHelperOptions = {}) {
  return delegateNumberHelperMethod(NumberHelper.numberToRounded, number, options);
}

export function numberToHumanSize(number: NumberLike, options: NumberHelperOptions = {}) {
  return delegateNumberHelperMethod(NumberHelper.numberToHumanSize, number, options);
}

export function numberToHuman(number: NumberLike, options: NumberHelperOptions = {}) {
  return delegateNumberHelperMethod(NumberHelper.numberToHuman, number, options);
}

/** @internal */
export function delegateNumberHelperMethod(
  method: (n: unknown, o: Record<string, unknown>) => unknown,
  number: NumberLike,
  options: NumberHelperOptions,
): unknown {
  if (number == null) return null;
  const { raise: raiseOnInvalid, ...rest } = escapeUnsafeOptions(options);
  return wrapWithOutputSafetyHandling(
    number,
    !!raiseOnInvalid,
    method(asArg(number), rest as Record<string, unknown>),
  );
}

/**
 * @internal
 * @missingRailsArgs html_safe? — PERMANENT
 */
export function escapeUnsafeOptions(options: NumberHelperOptions): NumberHelperOptions {
  const out: NumberHelperOptions = { ...options };
  if (out.format != null) out.format = htmlEscape(out.format).toString();
  if (out.negativeFormat != null) out.negativeFormat = htmlEscape(out.negativeFormat).toString();
  if (out.separator != null) out.separator = htmlEscape(out.separator).toString();
  if (out.delimiter != null) out.delimiter = htmlEscape(out.delimiter).toString();
  if (out.unit != null && !isHtmlSafe(out.unit)) out.unit = htmlEscape(out.unit).toString();
  if (out.units != null && typeof out.units === "object") out.units = escapeUnits(out.units);
  return out;
}

/** @internal */
export function escapeUnits(units: Record<string, string | SafeBuffer>): Record<string, string> {
  const escaped: Record<string, string> = {};
  for (const [k, v] of Object.entries(units)) escaped[k] = htmlEscape(v).toString();
  return escaped;
}

/**
 * Mirrors: `wrap_with_output_safety_handling` (number_helper.rb:141-152). On the
 * `valid_float` arm `NumberConverter#execute` took its `convert` arm, so
 * `formatted_number` (number_helper.rb:148) is a String.
 *
 * @internal
 */
export function wrapWithOutputSafetyHandling(
  number: unknown,
  raiseOnInvalid: boolean,
  formatted: unknown,
): unknown {
  const valid = validFloat(number);
  if (raiseOnInvalid && !valid) throw new InvalidNumberError(number);
  return valid || isHtmlSafe(number) ? htmlSafe(formatted as string) : formatted;
}

/** @internal */
export const validFloat = (number: unknown) => parseFloat(number, false) !== null;

// Ruby's Float() rejects strings with trailing junk; mimic with a strict numeric regex.
const FLOAT_RE = /^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?$/;

/** @internal */
export function parseFloat(number: unknown, raiseError: boolean): number | null {
  if (typeof number === "number") return Number.isFinite(number) ? number : null;
  const str =
    typeof number === "string" ? number : number instanceof SafeBuffer ? number.toString() : null;
  const n = str && FLOAT_RE.test(str.trim()) ? Number(str.trim()) : NaN;
  if (Number.isFinite(n)) return n;
  if (raiseError) throw new InvalidNumberError(number);
  return null;
}
