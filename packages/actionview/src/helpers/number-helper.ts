import type { Rational } from "@blazetrails/ruby-compat";
import {
  NumberHelper as ActiveSupportNumberHelper,
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
  units?: Record<string, string | SafeBuffer> | string;
  raise?: boolean;
  precision?: number;
  significant?: boolean;
  stripInsignificantZeros?: boolean;
  areaCode?: boolean;
  extension?: string | number;
  countryCode?: string | number;
  [key: string]: unknown;
}

type NumberLike = number | bigint | Rational | string | SafeBuffer | null | undefined;

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
  return htmlEscape(ActiveSupportNumberHelper.numberToPhone(asArg(number), opts));
}

export function numberToCurrency(number: NumberLike, options: NumberHelperOptions = {}) {
  return delegateNumberHelperMethod(ActiveSupportNumberHelper.numberToCurrency, number, options);
}

export function numberToPercentage(number: NumberLike, options: NumberHelperOptions = {}) {
  return delegateNumberHelperMethod(ActiveSupportNumberHelper.numberToPercentage, number, options);
}

export function numberWithDelimiter(number: NumberLike, options: NumberHelperOptions = {}) {
  return delegateNumberHelperMethod(ActiveSupportNumberHelper.numberToDelimited, number, options);
}

export function numberWithPrecision(number: NumberLike, options: NumberHelperOptions = {}) {
  return delegateNumberHelperMethod(ActiveSupportNumberHelper.numberToRounded, number, options);
}

export function numberToHumanSize(number: NumberLike, options: NumberHelperOptions = {}) {
  return delegateNumberHelperMethod(ActiveSupportNumberHelper.numberToHumanSize, number, options);
}

export function numberToHuman(number: NumberLike, options: NumberHelperOptions = {}) {
  return delegateNumberHelperMethod(ActiveSupportNumberHelper.numberToHuman, number, options);
}

/** @internal */
export function delegateNumberHelperMethod(
  method: (n: unknown, o: Record<string, unknown>) => unknown,
  number: NumberLike,
  options: NumberHelperOptions,
): unknown {
  if (number == null) return null;
  const { raise: raiseOnInvalid, ...rest } = escapeUnsafeOptions({ ...options });
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
  if (options.format != null) options.format = htmlEscape(options.format).toString();
  if (options.negativeFormat != null)
    options.negativeFormat = htmlEscape(options.negativeFormat).toString();
  if (options.separator != null) options.separator = htmlEscape(options.separator).toString();
  if (options.delimiter != null) options.delimiter = htmlEscape(options.delimiter).toString();
  if (options.unit != null && !isHtmlSafe(options.unit))
    options.unit = htmlEscape(options.unit).toString();
  if (options.units != null && typeof options.units === "object")
    options.units = escapeUnits(options.units);
  return options;
}

/** @internal */
export function escapeUnits(units: Record<string, string | SafeBuffer>): Record<string, string> {
  const escaped: Record<string, string> = {};
  for (const [k, v] of Object.entries(units)) escaped[k] = htmlEscape(v).toString();
  return escaped;
}

/** @internal */
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

export const NumberHelper = {
  numberToPhone,
  numberToCurrency,
  numberToPercentage,
  numberWithDelimiter,
  numberWithPrecision,
  numberToHumanSize,
  numberToHuman,
  delegateNumberHelperMethod,
  escapeUnsafeOptions,
  escapeUnits,
  wrapWithOutputSafetyHandling,
  validFloat,
  parseFloat,
};
