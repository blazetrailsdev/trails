import { Hash, Rational, isSymbol, rbObjDup, symbolToS } from "@blazetrails/ruby-compat";
import { I18n } from "../i18n.js";
import { camelize } from "../inflector.js";
import { BigDecimal } from "../core-ext/big-decimal/conversions.js";
import { SafeBuffer } from "../core-ext/string/output-safety.js";
import { classAttribute } from "../class-attribute.js";

const RATIONAL_DEFAULT_PRECISION = 32;

export const BIGDECIMAL_STRING = /^\s*[+-]?(\d+(\.\d*)?|\.\d+)([eE][+-]?\d+)?\s*$/;

export type NumberFormatOptions = object;

const DEFAULTS = new Hash<string, unknown>()
  .set(":format", {
    separator: ".",
    delimiter: ",",
    precision: 3,
    significant: false,
    stripInsignificantZeros: false,
  })
  .set(
    ":currency",
    new Hash<string, unknown>().set(":format", {
      format: "%u%n",
      negativeFormat: "-%u%n",
      unit: "$",
      separator: ".",
      delimiter: ",",
      precision: 2,
      significant: false,
      stripInsignificantZeros: false,
    }),
  )
  .set(":percentage", new Hash<string, unknown>().set(":format", { delimiter: "", format: "%n%" }))
  .set(":precision", new Hash<string, unknown>().set(":format", { delimiter: "" }))
  .set(
    ":human",
    new Hash<string, unknown>()
      .set(":format", {
        delimiter: "",
        precision: 3,
        significant: true,
        stripInsignificantZeros: true,
      })
      .set(
        ":storage_units",
        new Hash<string, unknown>()
          .set(":format", "%n %u")
          .set(
            ":units",
            new Hash<string, unknown>()
              .set(":byte", "Bytes")
              .set(":kb", "KB")
              .set(":mb", "MB")
              .set(":gb", "GB")
              .set(":tb", "TB"),
          ),
      )
      .set(
        ":decimal_units",
        new Hash<string, unknown>()
          .set(":format", "%n %u")
          .set(
            ":units",
            new Hash<string, unknown>()
              .set(":unit", "")
              .set(":thousand", "Thousand")
              .set(":million", "Million")
              .set(":billion", "Billion")
              .set(":trillion", "Trillion")
              .set(":quadrillion", "Quadrillion"),
          ),
      ),
  );

export abstract class NumberConverter<TOptions extends NumberFormatOptions = NumberFormatOptions> {
  protected number: unknown;
  protected opts: TOptions;
  protected _options: Record<string, unknown> | undefined;

  declare static namespace: string | undefined;
  declare static isNamespace: boolean;
  declare static validateFloat: boolean | undefined;
  declare static isValidateFloat: boolean;
  declare isValidateFloat: boolean;

  static {
    classAttribute.call(this, "namespace");
    classAttribute.call(this, "validateFloat");
  }

  static convert(number: unknown, options?: any): any {
    return new (this as any)(number, options ?? {}).execute();
  }

  constructor(number: unknown, options: TOptions = {} as TOptions) {
    this.number = number;
    this.opts = options;
  }

  execute(): unknown {
    if (this.number == null || this.number === false) return null;
    if (this.isValidateFloat && !this.validBigdecimal()) return this.number;
    return this.convert();
  }

  protected abstract convert(): string;

  protected validBigdecimal(): BigDecimal | null {
    const number = this.number;
    if (number instanceof Rational) return new BigDecimal(number, RATIONAL_DEFAULT_PRECISION);
    if (typeof number === "number" || typeof number === "bigint") {
      return new BigDecimal(number);
    }
    if (typeof number === "string" || number instanceof SafeBuffer) {
      if (/[de]/i.test(String(number))) return null;
      return BIGDECIMAL_STRING.test(String(number)) ? new BigDecimal(String(number).trim()) : null;
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

  protected get options(): Record<string, unknown> {
    if (!this._options) {
      this._options = { ...this.formatOptions(), ...(this.opts as Record<string, unknown>) };
    }
    return this._options;
  }

  protected formatOptions(): Record<string, unknown> {
    return Object.assign(this.defaultFormatOptions(), this.i18nFormatOptions());
  }

  protected defaultFormatOptions(): Record<string, unknown> {
    const options = rbObjDup(DEFAULTS.get(":format") as Record<string, unknown>);
    const ns = (this.constructor as typeof NumberConverter).namespace;
    if (ns)
      Object.assign(options, (DEFAULTS.get(`:${ns}`) as Hash<string, unknown>).get(":format"));
    return options;
  }

  protected i18nFormatOptions(): Record<string, unknown> {
    const locale = (this.opts as Record<string, unknown>).locale as string | undefined;
    const raw = rbObjDup(I18n.translate("number.format", { locale, default: {} }));
    const options: Record<string, unknown> = {};
    if (typeof raw === "object" && raw !== null && !Array.isArray(raw)) {
      for (const [k, v] of raw instanceof Map ? raw : Object.entries(raw)) {
        options[camelize(isSymbol(k) ? symbolToS(k) : String(k), "lower")] = v;
      }
    }

    const ns = (this.constructor as typeof NumberConverter).namespace;
    if (ns) {
      const nsRaw = I18n.translate(`number.${ns}.format`, { locale, default: {} });
      if (typeof nsRaw === "object" && nsRaw !== null && !Array.isArray(nsRaw)) {
        for (const [k, v] of nsRaw instanceof Map ? nsRaw : Object.entries(nsRaw)) {
          options[camelize(isSymbol(k) ? symbolToS(k) : String(k), "lower")] = v;
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
      default: this.defaultValue(key),
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
    return key
      .split(".")
      .reduce<unknown>((defaults, k) => (defaults as Hash<string, unknown>).get(`:${k}`), DEFAULTS);
  }
}
