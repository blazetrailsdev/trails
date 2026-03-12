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

function isNumeric(value: unknown): boolean {
  if (value === null || value === undefined || value === "") return false;
  return !isNaN(Number(value));
}

// More accurate rounding to avoid floating-point issues like 31.825 -> 31.82
function preciseRound(num: number, decimalPlaces: number): number {
  if (decimalPlaces <= 0) return Math.round(num * Math.pow(10, -decimalPlaces < 0 ? 0 : 0)) / 1;
  const factor = Math.pow(10, decimalPlaces);
  return Math.round((num + Number.EPSILON) * factor) / factor;
}

export function numberToPhone(number: unknown, options: NumberToPhoneOptions = {}): string {
  if (!isNumeric(number)) return String(number);
  const { areaCode = false, delimiter = "-", extension, countryCode } = options;
  const str = String(number).replace(/\D/g, "");

  let result: string;
  if (str.length <= 7) {
    result = str.slice(0, -4) + delimiter + str.slice(-4);
  } else if (str.length <= 10) {
    const area = str.slice(0, -7);
    const prefix = str.slice(-7, -4);
    const line = str.slice(-4);
    if (areaCode && area) {
      result = `(${area}) ${prefix}${delimiter}${line}`;
    } else {
      result = area
        ? `${area}${delimiter}${prefix}${delimiter}${line}`
        : `${prefix}${delimiter}${line}`;
    }
  } else {
    // More than 10 digits - area code takes everything before last 7
    const area = str.slice(0, -7);
    const prefix = str.slice(-7, -4);
    const line = str.slice(-4);
    if (areaCode && area) {
      result = `(${area}) ${prefix}${delimiter}${line}`;
    } else {
      result = area
        ? `${area}${delimiter}${prefix}${delimiter}${line}`
        : `${prefix}${delimiter}${line}`;
    }
  }

  if (countryCode !== undefined) {
    if (delimiter === "") {
      result = `+${countryCode}${result}`;
    } else {
      result = `+${countryCode}${delimiter}${result}`;
    }
  }

  if (extension !== undefined) {
    result = `${result} x ${extension}`;
  }

  return result;
}

export function numberWithDelimiter(
  number: unknown,
  options: NumberWithDelimiterOptions = {},
): string {
  if (!isNumeric(number)) return String(number);
  const { delimiter = ",", separator = "." } = options;
  const str = String(number);
  const parts = str.split(".");
  const intPart = parts[0];
  const decPart = parts[1];

  const delimited = intPart.replace(/(\d)(?=(\d{3})+(?!\d))/g, `$1${delimiter}`);
  if (decPart !== undefined) {
    return `${delimited}${separator}${decPart}`;
  }
  return delimited;
}

export function numberToRounded(number: unknown, options: NumberToRoundedOptions = {}): string {
  if (!isNumeric(number)) return String(number);
  const {
    precision = 3,
    separator = ".",
    delimiter = "",
    significant = false,
    stripInsignificantZeros = false,
  } = options;

  const num = Number(number);

  let rounded: number;
  let effectivePrecision = precision;
  let str: string;

  if (significant && precision > 0) {
    if (num === 0) {
      rounded = 0;
      str = rounded.toFixed(precision - 1);
    } else {
      const magnitude = Math.floor(Math.log10(Math.abs(num)));
      const decimalPlaces = precision - 1 - magnitude;
      if (decimalPlaces >= 0) {
        rounded = preciseRound(num, decimalPlaces);
        str = rounded.toFixed(decimalPlaces);
      } else {
        // Round to significant digits for large numbers
        const factor = Math.pow(10, -decimalPlaces);
        rounded = Math.round(num / factor) * factor;
        str = rounded.toFixed(0);
      }
    }
  } else {
    rounded = preciseRound(num, precision);
    effectivePrecision = precision;
    str = rounded.toFixed(effectivePrecision);
  }

  if (stripInsignificantZeros) {
    // Check if the number is very large (scientific notation territory)
    if (Math.abs(num) >= 1e13) {
      const magnitude = Math.floor(Math.log10(Math.abs(num)));
      const coeff = num / Math.pow(10, magnitude);
      let coeffStr = preciseRound(coeff, 2)
        .toFixed(2)
        .replace(/\.?0+$/, "");
      return `${coeffStr} x 10^${magnitude}`;
    }
    // Only strip trailing zeros after the decimal point
    if (str.includes(".")) {
      str = str.replace(/\.?0+$/, "");
    }
    if (str === "" || str === "-") return "0";
  }

  const parts = str.split(".");
  const intPart = parts[0];
  const decPart = parts[1];

  let result = delimiter ? intPart.replace(/(\d)(?=(\d{3})+(?!\d))/g, `$1${delimiter}`) : intPart;

  if (decPart !== undefined) {
    result = `${result}${separator}${decPart}`;
  }
  return result;
}

export function numberToCurrency(number: unknown, options: NumberToCurrencyOptions = {}): string {
  const {
    precision = 2,
    unit = "$",
    separator = ".",
    delimiter = ",",
    negativeFormat = "(%u%n)",
  } = options;
  const userFormat = options.format;

  if (!isNumeric(number)) return String(number);
  const num = Number(number);
  const isNegative = num < 0;
  const abs = Math.abs(num);
  const rounded = preciseRound(abs, precision).toFixed(precision);
  const parts = rounded.split(".");
  const intDelimited = parts[0].replace(/(\d)(?=(\d{3})+(?!\d))/g, `$1${delimiter}`);
  const formatted = precision > 0 ? `${intDelimited}${separator}${parts[1]}` : intDelimited;

  if (userFormat !== undefined) {
    // When user explicitly provides format, use it for all numbers
    const numStr = isNegative ? `-${formatted}` : formatted;
    return userFormat.replace("%u", unit).replace("%n", numStr);
  }
  const fmt = isNegative ? negativeFormat : "%u%n";
  return fmt.replace("%u", unit).replace("%n", formatted);
}

export function numberToPercentage(
  number: unknown,
  options: NumberToPercentageOptions = {},
): string {
  if (!isNumeric(number)) return `${number}%`;
  const { format = "%n%", ...roundedOptions } = options;
  const rounded = numberToRounded(number, roundedOptions);
  return format.replace("%n", rounded);
}

const STORAGE_UNITS = ["Bytes", "KB", "MB", "GB", "TB", "PB", "EB"];

export function numberToHumanSize(number: unknown, options: NumberToHumanSizeOptions = {}): string {
  if (!isNumeric(number)) return String(number);
  const {
    precision = 3,
    separator = ".",
    delimiter = "",
    significant = true,
    stripInsignificantZeros = true,
  } = options;

  const num = Number(number);
  const isNegative = num < 0;
  const abs = Math.abs(num);

  if (abs === 0) return "0 Bytes";
  if (abs === 1) return isNegative ? "-1 Byte" : "1 Byte";

  let unitIndex = 0;
  let value = abs;
  while (value >= 1024 && unitIndex < STORAGE_UNITS.length - 1) {
    value /= 1024;
    unitIndex++;
  }

  const unit = STORAGE_UNITS[unitIndex];
  const rounded = numberToRounded(isNegative ? -value : value, {
    precision,
    separator,
    delimiter,
    significant,
    stripInsignificantZeros: unitIndex === 0 ? true : stripInsignificantZeros,
  });

  return `${rounded} ${unit}`;
}

const HUMAN_UNITS: Array<[number, string]> = [
  [1e15, "Quadrillion"],
  [1e12, "Trillion"],
  [1e9, "Billion"],
  [1e6, "Million"],
  [1e3, "Thousand"],
];

export function numberToHuman(number: unknown, options: NumberToHumanOptions = {}): string {
  if (!isNumeric(number)) return String(number);
  const {
    precision = 3,
    separator = ".",
    delimiter = "",
    significant = true,
    stripInsignificantZeros = true,
    units,
    format = "%n %u",
  } = options;

  const num = Number(number);
  const abs = Math.abs(num);

  // Use custom units if provided
  if (units) {
    const unitKeys = ["quadrillion", "trillion", "billion", "million", "thousand", "unit"];
    const thresholds: Array<[number, string]> = [
      [1e15, "quadrillion"],
      [1e12, "trillion"],
      [1e9, "billion"],
      [1e6, "million"],
      [1e3, "thousand"],
      [1, "unit"],
    ];
    for (const [threshold, key] of thresholds) {
      if (abs >= threshold && units[key] !== undefined) {
        const value = num / threshold;
        const rounded = numberToRounded(value, {
          precision,
          separator,
          delimiter,
          significant,
          stripInsignificantZeros,
        });
        return format.replace("%n", rounded).replace("%u", units[key]);
      }
    }
    // If no unit found
    if (units["unit"] !== undefined) {
      const rounded = numberToRounded(num, {
        precision,
        separator,
        delimiter,
        significant,
        stripInsignificantZeros,
      });
      return format.replace("%n", rounded).replace("%u", units["unit"]).trim();
    }
    const rounded = numberToRounded(num, {
      precision,
      separator,
      delimiter,
      significant,
      stripInsignificantZeros,
    });
    return rounded;
  }

  for (const [threshold, label] of HUMAN_UNITS) {
    if (abs >= threshold) {
      const value = num / threshold;
      const rounded = numberToRounded(value, {
        precision,
        separator,
        delimiter,
        significant,
        stripInsignificantZeros,
      });
      return format.replace("%n", rounded).replace("%u", label);
    }
  }

  const rounded = numberToRounded(num, {
    precision,
    separator,
    delimiter,
    significant,
    stripInsignificantZeros,
  });
  return rounded;
}

export const NumberHelper = {
  numberToPhone,
  numberToCurrency,
  numberToPercentage,
  numberWithDelimiter,
  numberToRounded,
  numberToHumanSize,
  numberToHuman,
};
