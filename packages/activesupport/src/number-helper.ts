/**
 * NumberHelper — formatting numbers into currencies, percentages, phone numbers, and more.
 * Mirrors ActiveSupport::NumberHelper.
 *
 * Each helper function delegates to a converter class that contains the actual logic,
 * matching Rails' architecture where NumberHelper methods call Converter.convert().
 */

import { NumberToPhoneConverter } from "./number-helper/number-to-phone-converter.js";
import { NumberToDelimitedConverter } from "./number-helper/number-to-delimited-converter.js";
import { NumberToRoundedConverter } from "./number-helper/number-to-rounded-converter.js";
import { NumberToCurrencyConverter } from "./number-helper/number-to-currency-converter.js";
import { NumberToPercentageConverter } from "./number-helper/number-to-percentage-converter.js";
import { NumberToHumanSizeConverter } from "./number-helper/number-to-human-size-converter.js";
import { NumberToHumanConverter } from "./number-helper/number-to-human-converter.js";

export interface NumberToPhoneOptions {
  areaCode?: boolean;
  delimiter?: string;
  extension?: string | number;
  countryCode?: string | number;
}

export interface NumberToCurrencyOptions {
  precision?: number;
  unit?: string;
  separator?: string;
  delimiter?: string;
  format?: string;
  negativeFormat?: string;
}

export interface NumberToPercentageOptions {
  precision?: number;
  separator?: string;
  delimiter?: string;
  format?: string;
  stripInsignificantZeros?: boolean;
  significant?: boolean;
}

export interface NumberWithDelimiterOptions {
  delimiter?: string;
  separator?: string;
}

export interface NumberToRoundedOptions {
  precision?: number;
  separator?: string;
  delimiter?: string;
  significant?: boolean;
  stripInsignificantZeros?: boolean;
}

export interface NumberToHumanSizeOptions {
  precision?: number;
  separator?: string;
  delimiter?: string;
  significant?: boolean;
  stripInsignificantZeros?: boolean;
}

export interface NumberToHumanOptions {
  precision?: number;
  separator?: string;
  delimiter?: string;
  significant?: boolean;
  stripInsignificantZeros?: boolean;
  units?: Record<string, string>;
  format?: string;
}

export function numberToPhone(number: unknown, options: NumberToPhoneOptions = {}): string {
  return NumberToPhoneConverter.convert(number, options);
}

export function numberWithDelimiter(
  number: unknown,
  options: NumberWithDelimiterOptions = {},
): string {
  return NumberToDelimitedConverter.convert(number, options);
}

export function numberToRounded(number: unknown, options: NumberToRoundedOptions = {}): string {
  return NumberToRoundedConverter.convert(number, options);
}

export function numberToCurrency(number: unknown, options: NumberToCurrencyOptions = {}): string {
  return NumberToCurrencyConverter.convert(number, options);
}

export function numberToPercentage(
  number: unknown,
  options: NumberToPercentageOptions = {},
): string {
  return NumberToPercentageConverter.convert(number, options);
}

export function numberToHumanSize(number: unknown, options: NumberToHumanSizeOptions = {}): string {
  return NumberToHumanSizeConverter.convert(number, options);
}

export function numberToHuman(number: unknown, options: NumberToHumanOptions = {}): string {
  return NumberToHumanConverter.convert(number, options);
}

const _helpers = {
  numberToPhone,
  numberToCurrency,
  numberToPercentage,
  numberWithDelimiter,
  numberToRounded,
  numberToHumanSize,
  numberToHuman,
};

export namespace NumberHelper {
  export const numberToPhone = _helpers.numberToPhone;
  export const numberToCurrency = _helpers.numberToCurrency;
  export const numberToPercentage = _helpers.numberToPercentage;
  export const numberWithDelimiter = _helpers.numberWithDelimiter;
  export const numberToRounded = _helpers.numberToRounded;
  export const numberToHumanSize = _helpers.numberToHumanSize;
  export const numberToHuman = _helpers.numberToHuman;
}
