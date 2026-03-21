import { deepMergeInPlace } from "./hash-utils.js";

type TranslationValue = string | (string | null)[] | null | TranslationHash;
interface TranslationHash {
  [key: string]: TranslationValue;
}

function dig(obj: TranslationHash, keys: string[]): TranslationValue | undefined {
  let current: TranslationValue = obj;
  for (const k of keys) {
    if (current === null || typeof current !== "object" || Array.isArray(current)) {
      return undefined;
    }
    current = (current as TranslationHash)[k];
    if (current === undefined) return undefined;
  }
  return current;
}

class SimpleBackend {
  private translations: Record<string, TranslationHash> = {};

  storeTranslations(locale: string, data: TranslationHash): void {
    if (!this.translations[locale]) {
      this.translations[locale] = {};
    }
    deepMergeInPlace(this.translations[locale], data as Record<string, unknown>);
  }

  lookup(locale: string, key: string): TranslationValue | undefined {
    const store = this.translations[locale];
    if (!store) return undefined;
    const parts = key.split(".");
    return dig(store, parts);
  }
}

const DAYNAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const ABBR_DAYNAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHNAMES: (string | null)[] = [
  null,
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];
const ABBR_MONTHNAMES: (string | null)[] = [
  null,
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

function pad(n: number, width = 2): string {
  return String(n).padStart(width, "0");
}

function tzAbbreviation(date: Date): string {
  try {
    const parts = new Intl.DateTimeFormat("en-US", { timeZoneName: "short" }).formatToParts(date);
    const tzPart = parts.find((p) => p.type === "timeZoneName");
    if (tzPart) return tzPart.value;
  } catch {
    // fall through
  }
  const tzOffset = date.getTimezoneOffset();
  const tzSign = tzOffset <= 0 ? "+" : "-";
  const tzAbsHours = Math.floor(Math.abs(tzOffset) / 60);
  const tzAbsMins = Math.abs(tzOffset) % 60;
  return `${tzSign}${pad(tzAbsHours)}${pad(tzAbsMins)}`;
}

interface StrftimeNames {
  dayNames?: string[];
  abbrDayNames?: string[];
  monthNames?: (string | null)[];
  abbrMonthNames?: (string | null)[];
}

function strftime(date: Date, format: string, names: StrftimeNames = {}): string {
  const dayNames = names.dayNames ?? DAYNAMES;
  const abbrDayNames = names.abbrDayNames ?? ABBR_DAYNAMES;
  const monthNames = names.monthNames ?? MONTHNAMES;
  const abbrMonthNames = names.abbrMonthNames ?? ABBR_MONTHNAMES;

  const day = date.getDay();
  const mday = date.getDate();
  const month = date.getMonth(); // 0-based
  const year = date.getFullYear();
  const hours = date.getHours();
  const minutes = date.getMinutes();
  const seconds = date.getSeconds();

  const tzOffset = date.getTimezoneOffset();
  const tzSign = tzOffset <= 0 ? "+" : "-";
  const tzAbsHours = Math.floor(Math.abs(tzOffset) / 60);
  const tzAbsMins = Math.abs(tzOffset) % 60;
  const tzNumeric = `${tzSign}${pad(tzAbsHours)}${pad(tzAbsMins)}`;

  let result = "";
  for (let i = 0; i < format.length; i++) {
    if (format[i] !== "%") {
      result += format[i];
      continue;
    }

    if (i + 1 >= format.length) {
      result += "%";
      break;
    }

    const spec = format[i + 1];
    i++;

    switch (spec) {
      case "%":
        result += "%";
        break;
      case "a":
        result += abbrDayNames[day];
        break;
      case "A":
        result += dayNames[day];
        break;
      case "b":
        result += abbrMonthNames[month + 1] ?? "";
        break;
      case "B":
        result += monthNames[month + 1] ?? "";
        break;
      case "d":
        result += pad(mday);
        break;
      case "e":
        result += String(mday).padStart(2, " ");
        break;
      case "m":
        result += pad(month + 1);
        break;
      case "Y":
        result += String(year);
        break;
      case "H":
        result += pad(hours);
        break;
      case "M":
        result += pad(minutes);
        break;
      case "S":
        result += pad(seconds);
        break;
      case "z":
        result += tzNumeric;
        break;
      case "Z":
        result += tzAbbreviation(date);
        break;
      case "p":
        result += hours < 12 ? "AM" : "PM";
        break;
      case "P":
        result += hours < 12 ? "am" : "pm";
        break;
      default:
        result += "%" + spec;
        break;
    }
  }

  return result;
}

type DateLike = Date;

function symbolToString(value: string | symbol): string {
  if (typeof value === "symbol") {
    return value.description ?? "";
  }
  return value;
}

interface LocalizeOptions {
  format?: string | symbol;
  locale?: string;
  type?: "date" | "time";
}

interface TranslateOptions {
  locale?: string;
  default?: TranslationValue;
}

class I18nModule {
  locale = "en";
  defaultLocale = "en";
  backend = new SimpleBackend();

  constructor() {
    this.loadDefaults();
  }

  loadDefaults(): void {
    this.backend.storeTranslations("en", {
      date: {
        formats: {
          default: "%Y-%m-%d",
          short: "%b %d",
          long: "%B %d, %Y",
        },
        day_names: DAYNAMES,
        abbr_day_names: ABBR_DAYNAMES,
        month_names: MONTHNAMES,
        abbr_month_names: ABBR_MONTHNAMES,
        order: ["year", "month", "day"],
      },
      time: {
        formats: {
          default: "%a, %d %b %Y %H:%M:%S %z",
          short: "%d %b %H:%M",
          long: "%B %d, %Y %H:%M",
        },
        am: "am",
        pm: "pm",
      },
      support: {
        array: {
          words_connector: ", ",
          two_words_connector: " and ",
          last_word_connector: ", and ",
        },
      },
    });
  }

  translate(key: string | symbol, options: TranslateOptions = {}): TranslationValue {
    const locale = options.locale ?? this.locale;
    const keyStr = symbolToString(key);
    const result = this.backend.lookup(locale, keyStr);
    if (result !== undefined) return result;
    if (options.default !== undefined) return options.default;
    return `Translation missing: ${locale}.${keyStr}`;
  }

  t(key: string | symbol, options: TranslateOptions = {}): TranslationValue {
    return this.translate(key, options);
  }

  localize(object: DateLike, options: LocalizeOptions = {}): string {
    const locale = options.locale ?? this.locale;
    const format = options.format ?? "default";
    const formatStr = symbolToString(format);

    const scope = options.type ?? (this._isDateOnly(object) ? "date" : "time");

    let pattern: string;
    if (formatStr.includes("%")) {
      pattern = formatStr;
    } else {
      const looked = this.backend.lookup(locale, `${scope}.formats.${formatStr}`);
      if (typeof looked === "string") {
        pattern = looked;
      } else {
        pattern = scope === "date" ? "%Y-%m-%d" : "%a, %d %b %Y %H:%M:%S %z";
      }
    }

    const names: StrftimeNames = {
      dayNames: this._lookupArray(locale, "date.day_names") ?? DAYNAMES,
      abbrDayNames: this._lookupArray(locale, "date.abbr_day_names") ?? ABBR_DAYNAMES,
      monthNames: this._lookupNullableArray(locale, "date.month_names") ?? MONTHNAMES,
      abbrMonthNames: this._lookupNullableArray(locale, "date.abbr_month_names") ?? ABBR_MONTHNAMES,
    };

    return strftime(object, pattern, names);
  }

  l(object: DateLike, options: LocalizeOptions = {}): string {
    return this.localize(object, options);
  }

  private _lookupArray(locale: string, key: string): string[] | null {
    const val = this.backend.lookup(locale, key);
    if (Array.isArray(val)) return val as string[];
    return null;
  }

  private _lookupNullableArray(locale: string, key: string): (string | null)[] | null {
    const val = this.backend.lookup(locale, key);
    if (Array.isArray(val)) return val;
    return null;
  }

  private _isDateOnly(d: Date): boolean {
    return (
      d.getHours() === 0 &&
      d.getMinutes() === 0 &&
      d.getSeconds() === 0 &&
      d.getMilliseconds() === 0
    );
  }
}

export const I18n = new I18nModule();
export { strftime };
