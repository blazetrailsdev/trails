type TranslationValue = string | string[] | null | TranslationHash;
interface TranslationHash {
  [key: string]: TranslationValue;
}

function deepMerge(target: TranslationHash, source: TranslationHash): TranslationHash {
  for (const key of Object.keys(source)) {
    const sv = source[key];
    const tv = target[key];
    if (
      sv !== null &&
      typeof sv === "object" &&
      !Array.isArray(sv) &&
      tv !== null &&
      typeof tv === "object" &&
      !Array.isArray(tv)
    ) {
      target[key] = deepMerge(tv as TranslationHash, sv as TranslationHash);
    } else {
      target[key] = sv;
    }
  }
  return target;
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
    deepMerge(this.translations[locale], data);
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

function strftime(date: Date, format: string): string {
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
  const tz = `${tzSign}${pad(tzAbsHours)}${pad(tzAbsMins)}`;

  return format
    .replace(/%a/g, ABBR_DAYNAMES[day])
    .replace(/%A/g, DAYNAMES[day])
    .replace(/%b/g, ABBR_MONTHNAMES[month + 1]!)
    .replace(/%B/g, MONTHNAMES[month + 1] as string)
    .replace(/%d/g, pad(mday))
    .replace(/%e/g, String(mday).padStart(2, " "))
    .replace(/%m/g, pad(month + 1))
    .replace(/%Y/g, String(year))
    .replace(/%H/g, pad(hours))
    .replace(/%M/g, pad(minutes))
    .replace(/%S/g, pad(seconds))
    .replace(/%z/g, tz)
    .replace(/%Z/g, tz)
    .replace(/%p/g, hours < 12 ? "AM" : "PM")
    .replace(/%P/g, hours < 12 ? "am" : "pm");
}

type DateLike = Date;

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
    this._loadDefaults();
  }

  private _loadDefaults(): void {
    this.backend.storeTranslations("en", {
      date: {
        formats: {
          default: "%Y-%m-%d",
          short: "%b %d",
          long: "%B %d, %Y",
        },
        day_names: DAYNAMES,
        abbr_day_names: ABBR_DAYNAMES,
        month_names: MONTHNAMES as any,
        abbr_month_names: ABBR_MONTHNAMES as any,
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
    const keyStr = typeof key === "symbol" ? String(key) : key;
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
    const formatStr = typeof format === "symbol" ? String(format) : format;

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

    return strftime(object, pattern);
  }

  l(object: DateLike, options: LocalizeOptions = {}): string {
    return this.localize(object, options);
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
