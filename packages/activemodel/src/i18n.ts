type TranslationValue = string | { one?: string; other?: string } | TranslationTree;
interface TranslationTree {
  [key: string]: TranslationValue;
}
type Translations = Record<string, TranslationTree>;

interface TranslateOptions {
  count?: number;
  defaults?: Array<{ key: string } | { message: string }>;
  defaultValue?: string;
  [key: string]: unknown;
}

function deepClone(obj: TranslationTree): TranslationTree {
  const result: TranslationTree = {};
  for (const key of Object.keys(obj)) {
    const val = obj[key];
    if (val && typeof val === "object" && !Array.isArray(val)) {
      result[key] = deepClone(val as TranslationTree);
    } else {
      result[key] = val;
    }
  }
  return result;
}

function deepMerge(target: TranslationTree, source: TranslationTree): TranslationTree {
  for (const key of Object.keys(source)) {
    const sv = source[key];
    const tv = target[key];
    if (
      sv &&
      typeof sv === "object" &&
      !Array.isArray(sv) &&
      tv &&
      typeof tv === "object" &&
      !Array.isArray(tv)
    ) {
      target[key] = deepMerge(tv as TranslationTree, sv as TranslationTree);
    } else if (sv && typeof sv === "object" && !Array.isArray(sv)) {
      target[key] = deepClone(sv as TranslationTree);
    } else {
      target[key] = sv;
    }
  }
  return target;
}

function dig(obj: TranslationTree, path: string[]): TranslationValue | undefined {
  let current: TranslationValue = obj;
  for (const segment of path) {
    if (current === null || current === undefined || typeof current !== "object") return undefined;
    current = (current as TranslationTree)[segment];
  }
  return current;
}

function interpolate(str: string, options: Record<string, unknown>): string {
  return str.replace(/%\{(\w+)\}/g, (_, key) => {
    return options[key] !== undefined ? String(options[key]) : `%{${key}}`;
  });
}

class I18nService {
  locale: string = "en";
  translations: Translations = {};

  constructor() {
    this.storeTranslations("en", defaultEnTranslations);
  }

  t(key: string, options?: TranslateOptions): string {
    const result = this.lookup(key);
    if (result !== undefined) {
      return this.resolve(result, options);
    }

    if (options?.defaults) {
      for (const entry of options.defaults) {
        if ("key" in entry) {
          const val = this.lookup(entry.key);
          if (val !== undefined) return this.resolve(val, options);
        } else if ("message" in entry) {
          return interpolate(entry.message, options ?? {});
        }
      }
    }

    if (options?.defaultValue !== undefined) {
      return interpolate(options.defaultValue, options ?? {});
    }

    return key;
  }

  storeTranslations(locale: string, data: TranslationTree): void {
    if (!this.translations[locale]) {
      this.translations[locale] = {};
    }
    deepMerge(this.translations[locale], data);
  }

  reset(): void {
    this.translations = {};
    this.locale = "en";
    this.storeTranslations("en", defaultEnTranslations);
  }

  private lookup(key: string): TranslationValue | undefined {
    const localeData = this.translations[this.locale];
    if (!localeData) return undefined;
    return dig(localeData, key.split("."));
  }

  private resolve(value: TranslationValue, options?: TranslateOptions): string {
    if (typeof value === "string") {
      return interpolate(value, options ?? {});
    }
    if (value && typeof value === "object" && options?.count !== undefined) {
      const plural = value as { one?: string; other?: string };
      const form = options.count === 1 ? "one" : "other";
      const str = plural[form] ?? plural["other"];
      if (typeof str === "string") {
        return interpolate(str, options);
      }
    }
    if (typeof value === "string") return value;
    return "";
  }
}

const messages: TranslationTree = {
  invalid: "is invalid",
  blank: "can't be blank",
  present: "must be blank",
  too_short: {
    one: "is too short (minimum is 1 character)",
    other: "is too short (minimum is %{count} characters)",
  },
  too_long: {
    one: "is too long (maximum is 1 character)",
    other: "is too long (maximum is %{count} characters)",
  },
  wrong_length: {
    one: "is the wrong length (should be 1 character)",
    other: "is the wrong length (should be %{count} characters)",
  },
  not_a_number: "is not a number",
  not_an_integer: "must be an integer",
  greater_than: "must be greater than %{count}",
  greater_than_or_equal_to: "must be greater than or equal to %{count}",
  less_than: "must be less than %{count}",
  less_than_or_equal_to: "must be less than or equal to %{count}",
  equal_to: "must be equal to %{count}",
  other_than: "must be other than %{count}",
  odd: "must be odd",
  even: "must be even",
  inclusion: "is not included in the list",
  exclusion: "is reserved",
  taken: "has already been taken",
  confirmation: "doesn't match %{attribute}",
  accepted: "must be accepted",
  empty: "can't be empty",
  not_a_date: "is not a valid date",
  required: "must exist",
};

const defaultEnTranslations: TranslationTree = {
  activemodel: {
    errors: {
      format: "%{attribute} %{message}",
      messages: { ...messages },
    },
  },
  errors: {
    format: "%{attribute} %{message}",
    messages: { ...messages },
    attributes: {},
  },
};

export const I18n = new I18nService();
