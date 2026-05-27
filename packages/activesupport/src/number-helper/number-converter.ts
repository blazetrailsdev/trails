import { I18n } from "../i18n.js";

export type NumberFormatOptions = object;

const DEFAULTS: Record<string, Record<string, unknown>> = {
  format: {
    separator: ".",
    delimiter: ",",
    precision: 3,
    significant: false,
    stripInsignificantZeros: false,
  },
  currency: {
    format: "%u%n",
    negativeFormat: "-%u%n",
    unit: "$",
    separator: ".",
    delimiter: ",",
    precision: 2,
    significant: false,
    stripInsignificantZeros: false,
  },
  percentage: {
    delimiter: "",
    format: "%n%",
  },
  precision: {
    delimiter: "",
  },
  human: {
    delimiter: "",
    precision: 3,
    significant: true,
    stripInsignificantZeros: true,
    storage_units: {
      format: "%n %u",
      units: {
        byte: { one: "Byte", other: "Bytes" },
        kb: "KB",
        mb: "MB",
        gb: "GB",
        tb: "TB",
        pb: "PB",
        eb: "EB",
        zb: "ZB",
      },
    },
    decimal_units: {
      format: "%n %u",
      units: {
        unit: "",
        thousand: "Thousand",
        million: "Million",
        billion: "Billion",
        trillion: "Trillion",
        quadrillion: "Quadrillion",
      },
    },
  },
};

const I18N_KEY_MAP: Record<string, string> = {
  round_mode: "roundMode",
  strip_insignificant_zeros: "stripInsignificantZeros",
  negative_format: "negativeFormat",
};

function camelizeI18nKeys(obj: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    result[I18N_KEY_MAP[k] ?? k] = v;
  }
  return result;
}

export abstract class NumberConverter<TOptions extends NumberFormatOptions = NumberFormatOptions> {
  protected number: unknown;
  protected opts: TOptions;
  private _options: Record<string, unknown> | undefined;

  static namespace: string | undefined;

  static convert(number: unknown, options?: any): string {
    return new (this as any)(number, options ?? {}).execute();
  }

  constructor(number: unknown, options: TOptions = {} as TOptions) {
    this.number = number;
    this.opts = options;
  }

  execute(): string {
    if (this.number === null || this.number === undefined) return String(this.number);
    if (this.validateFloat && !this.isValidFloat()) return String(this.number);
    return this.convert();
  }

  protected abstract convert(): string;

  protected get validateFloat(): boolean {
    return false;
  }

  protected isValidFloat(): boolean {
    const n = Number(this.number);
    return !isNaN(n) && isFinite(n);
  }

  protected numberAsFloat(): number {
    return Number(this.number);
  }

  protected get options(): Record<string, unknown> {
    if (!this._options) {
      this._options = this.formatOptions();
    }
    return this._options;
  }

  protected formatOptions(): Record<string, unknown> {
    return { ...this.defaultFormatOptions(), ...this.i18nFormatOptions(), ...this.opts };
  }

  protected defaultFormatOptions(): Record<string, unknown> {
    const ns = (this.constructor as typeof NumberConverter).namespace;
    const base = { ...DEFAULTS.format };
    if (ns && DEFAULTS[ns]) {
      const nsDefaults = DEFAULTS[ns];
      for (const [k, v] of Object.entries(nsDefaults)) {
        if (typeof v !== "object" || v === null) {
          base[k] = v;
        }
      }
    }
    return base;
  }

  protected i18nFormatOptions(): Record<string, unknown> {
    const locale = (this.opts as Record<string, unknown>).locale as string | undefined;
    const raw = I18n.translate("number.format", { locale, default: {} });
    const options =
      typeof raw === "object" && raw !== null && !Array.isArray(raw)
        ? camelizeI18nKeys({ ...(raw as Record<string, unknown>) })
        : {};

    const ns = (this.constructor as typeof NumberConverter).namespace;
    if (ns) {
      const nsRaw = I18n.translate(`number.${ns}.format`, { locale, default: {} });
      if (typeof nsRaw === "object" && nsRaw !== null && !Array.isArray(nsRaw)) {
        Object.assign(options, camelizeI18nKeys({ ...(nsRaw as Record<string, unknown>) }));
      }
    }
    return options;
  }

  protected translateNumberValueWithDefault(
    key: string,
    i18nOptions: Record<string, unknown> = {},
  ): unknown {
    return I18n.translate(key, {
      scope: "number",
      default: this.defaultValue(key) as any,
      ...i18nOptions,
    });
  }

  protected translateInLocale(key: string, i18nOptions: Record<string, unknown> = {}): unknown {
    return this.translateNumberValueWithDefault(key, {
      locale: this.options.locale as string | undefined,
      ...i18nOptions,
    });
  }

  private defaultValue(key: string): unknown {
    const parts = key.split(".");
    let current: unknown = DEFAULTS;
    for (const part of parts) {
      if (current === null || current === undefined || typeof current !== "object")
        return undefined;
      current = (current as Record<string, unknown>)[part];
    }
    return current;
  }
}
