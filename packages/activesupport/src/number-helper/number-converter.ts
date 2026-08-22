import { Rational } from "@blazetrails/date";
import { I18n } from "../i18n.js";
import { camelize } from "../inflector.js";
import { BigDecimal } from "../core-ext/big-decimal/conversions.js";

/** `BigDecimal.double_fig * 2`, the default precision `Rational#to_d(0)` uses. */
const RATIONAL_DEFAULT_PRECISION = 32;

/** What `BigDecimal(str, exception: false)` accepts (number_converter.rb:183). */
export const BIGDECIMAL_STRING = /^\s*[+-]?(\d+(\.\d*)?|\.\d+)([eE][+-]?\d+)?\s*$/;

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
    if (this.validateFloat && !this.validBigdecimal()) return String(this.number);
    return this.convert();
  }

  protected abstract convert(): string;

  protected get validateFloat(): boolean {
    return false;
  }

  /**
   * Mirrors: ActiveSupport::NumberHelper::NumberConverter#valid_bigdecimal
   * (number_converter.rb:178-187).
   *
   * The String arm reproduces `BigDecimal(number, exception: false)` — the
   * whole string must parse, so `"1,11"` and `"12.5abc"` are `null`, while
   * surrounding whitespace and an exponent are accepted. The final arm is
   * Ruby's `number.to_d rescue nil`: a `BigDecimal` is already converted, and
   * anything else answering `to_d` is converted through it.
   *
   * The `when Float, Rational` arm is `number.to_d(0)`; `to_d(0)` on a
   * Rational is BigDecimal's default precision — `BigDecimal.double_fig * 2`,
   * so `Rational(1, 3).to_d(0)` carries 32 significant digits on MRI 3.3.11 —
   * which has to be supplied here because this port raises without a
   * precision for a Rational, exactly as `Kernel#BigDecimal` does. A Float
   * needs no explicit precision: its decimal expansion is already finite.
   */
  protected validBigdecimal(): BigDecimal | null {
    const number = this.number;
    if (number instanceof Rational) return new BigDecimal(number, RATIONAL_DEFAULT_PRECISION);
    if (typeof number === "number" && !Number.isFinite(number)) return null;
    if (typeof number === "number" || typeof number === "bigint") {
      return new BigDecimal(number);
    }
    if (typeof number === "string") {
      return BIGDECIMAL_STRING.test(number) ? new BigDecimal(number.trim()) : null;
    }
    if (number instanceof BigDecimal) return number;
    const toD = (number as { toD?: () => unknown } | null | undefined)?.toD;
    if (typeof toD !== "function") return null;
    try {
      const converted = toD.call(number);
      return converted instanceof BigDecimal
        ? converted
        : new BigDecimal(converted as string | number | bigint);
    } catch {
      return null;
    }
  }

  /**
   * @missingRailsCall merge — PERMANENT: Verified per-site (RFC 0106):
   *   `format_options.merge(opts)` (number_converter.rb:142) is object spread `{
   *   ...this.formatOptions(), ...this.opts }`; `Hash#merge` has no JS call
   *   form.
   */
  protected get options(): Record<string, unknown> {
    if (!this._options) {
      this._options = { ...this.formatOptions(), ...this.opts };
    }
    return this._options;
  }

  protected formatOptions(): Record<string, unknown> {
    return { ...this.defaultFormatOptions(), ...this.i18nFormatOptions() };
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
    const options: Record<string, unknown> = {};
    if (typeof raw === "object" && raw !== null && !Array.isArray(raw)) {
      for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
        options[camelize(k, "lower")] = v;
      }
    }

    const ns = (this.constructor as typeof NumberConverter).namespace;
    if (ns) {
      const nsRaw = I18n.translate(`number.${ns}.format`, { locale, default: {} });
      if (typeof nsRaw === "object" && nsRaw !== null && !Array.isArray(nsRaw)) {
        for (const [k, v] of Object.entries(nsRaw as Record<string, unknown>)) {
          options[camelize(k, "lower")] = v;
        }
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
