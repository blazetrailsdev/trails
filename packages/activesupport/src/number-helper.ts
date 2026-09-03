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
  locale?: string;
  precision?: number;
  unit?: string;
  separator?: string;
  delimiter?: string;
  format?: string;
  negativeFormat?: string;
  roundMode?: string;
}

export interface NumberToPercentageOptions {
  locale?: string;
  precision?: number;
  separator?: string;
  delimiter?: string;
  format?: string;
  stripInsignificantZeros?: boolean;
  significant?: boolean;
  roundMode?: string;
}

export interface NumberWithDelimiterOptions {
  locale?: string;
  delimiter?: string;
  separator?: string;
  delimiterPattern?: RegExp;
}

export interface NumberToRoundedOptions {
  locale?: string;
  precision?: number;
  separator?: string;
  delimiter?: string;
  significant?: boolean;
  stripInsignificantZeros?: boolean;
  roundMode?: string;
}

export interface NumberToHumanSizeOptions {
  locale?: string;
  precision?: number;
  separator?: string;
  delimiter?: string;
  significant?: boolean;
  stripInsignificantZeros?: boolean;
  roundMode?: string;
}

export interface NumberToHumanOptions {
  locale?: string;
  precision?: number;
  separator?: string;
  delimiter?: string;
  significant?: boolean;
  stripInsignificantZeros?: boolean;
  units?: Record<string, string> | string;
  format?: string;
  roundMode?: string;
}

export function numberToPhone(number: unknown, options: NumberToPhoneOptions = {}): unknown {
  return NumberToPhoneConverter.convert(number, options);
}

export function numberToDelimited(
  number: unknown,
  options: NumberWithDelimiterOptions = {},
): unknown {
  return NumberToDelimitedConverter.convert(number, options);
}

export function numberWithDelimiter(
  number: unknown,
  options: NumberWithDelimiterOptions = {},
): unknown {
  return numberToDelimited(number, options);
}

export function numberToRounded(number: unknown, options: NumberToRoundedOptions = {}): unknown {
  return NumberToRoundedConverter.convert(number, options);
}

export function numberToCurrency(number: unknown, options: NumberToCurrencyOptions = {}): unknown {
  return NumberToCurrencyConverter.convert(number, options);
}

export function numberToPercentage(
  number: unknown,
  options: NumberToPercentageOptions = {},
): unknown {
  return NumberToPercentageConverter.convert(number, options);
}

export function numberToHumanSize(
  number: unknown,
  options: NumberToHumanSizeOptions = {},
): unknown {
  return NumberToHumanSizeConverter.convert(number, options);
}

export function numberToHuman(number: unknown, options: NumberToHumanOptions = {}): unknown {
  return NumberToHumanConverter.convert(number, options);
}

const _helpers = {
  numberToPhone,
  numberToCurrency,
  numberToPercentage,
  numberToDelimited,
  numberWithDelimiter,
  numberToRounded,
  numberToHumanSize,
  numberToHuman,
};

export namespace NumberHelper {
  export const numberToPhone = _helpers.numberToPhone;
  export const numberToCurrency = _helpers.numberToCurrency;
  export const numberToPercentage = _helpers.numberToPercentage;
  export const numberToDelimited = _helpers.numberToDelimited;
  export const numberWithDelimiter = _helpers.numberWithDelimiter;
  export const numberToRounded = _helpers.numberToRounded;
  export const numberToHumanSize = _helpers.numberToHumanSize;
  export const numberToHuman = _helpers.numberToHuman;
}
