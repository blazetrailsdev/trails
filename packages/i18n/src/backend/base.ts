import {
  ArgumentError,
  InvalidLocale,
  InvalidLocaleData,
  InvalidPluralizationData,
  MissingTranslation,
  MissingTranslationData,
  ReservedInterpolationKey,
  inspect,
  UnknownFileType,
} from "../exceptions.js";
import {
  EMPTY_HASH,
  RESERVED_KEYS,
  config,
  reservedKeysPattern,
  t,
  toSym,
  translate,
  tBang,
  type Locale,
  type TranslationKey,
} from "../i18n.js";
import { NotImplementedError, isSymbol, symbolToS } from "@blazetrails/ruby-compat";
import { Temporal, strftime } from "@blazetrails/date";
import { interpolate as interpolateString } from "../interpolate/ruby.js";
import { throwException, catchException } from "../throw-catch.js";
import {
  transliterate,
  type HashTransliterator,
  type ProcTransliterator,
} from "./transliterator.js";
import { except, type TranslationData } from "../utils.js";
import { tr } from "./flatten.js";

export type TranslateOptions = { [key: string]: unknown };

export type FileReader = (filename: string) => Promise<string>;

let fileReader: FileReader | undefined;
let yamlParse: ((source: string) => unknown) | undefined;
const fileContents = new Map<string, string>();
const localeModules = new Map<string, unknown>();

/** @noRailsEquivalent PERMANENT */
export function registerFileReader(reader: FileReader): void {
  fileReader = reader;
}

/** @noRailsEquivalent PERMANENT */
export function registerLocaleModule(filename: string, translations: unknown): void {
  localeModules.set(filename, translations);
}

/** @noRailsEquivalent PERMANENT */
export async function preloadTranslationFiles(...filenames: (string | string[])[]): Promise<void> {
  yamlParse ??= (
    await import("yaml").catch(() => {
      throw new Error(
        "I18n cannot read YAML locale files without the `yaml` package. Install it with `npm install yaml`.",
      );
    })
  ).parse;
  const paths = filenames.length === 0 ? config().loadPath : filenames;
  for (const filename of paths.flat()) {
    fileContents.set(filename, await readTranslationFile(filename));
  }
}

/** @noRailsEquivalent PERMANENT */
export async function reloadTranslationFiles(): Promise<void> {
  if (!fileReader) return;
  fileContents.clear();
  await preloadTranslationFiles();
}

function readTranslationFile(filename: string): Promise<string> {
  if (!fileReader) {
    throw new Error(
      "I18n cannot read translation files: register a reader with registerFileReader().",
    );
  }
  return fileReader(filename);
}

function readLocaleModule(filename: string): unknown {
  if (!localeModules.has(filename)) {
    throw new Error(
      `I18n cannot evaluate ${filename}: importing a module is async, so register it with I18n.registerLocaleModule() before putting it on I18n.load_path.`,
    );
  }
  return localeModules.get(filename);
}

function readYaml(source: string): unknown {
  if (!yamlParse) {
    throw new Error(
      "I18n cannot parse YAML: resolving the `yaml` package is async, so await I18n.preloadTranslationFiles() before loading a .yml file.",
    );
  }
  return yamlParse(source);
}

function deepFreeze(value: unknown): unknown {
  if (typeof value !== "object" || value === null) return value;
  if (Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value)) deepFreeze(child);
  return value;
}

function readFile(filename: string): string {
  const contents = fileContents.get(filename);
  if (contents === undefined) {
    throw new Error(
      `I18n cannot read ${filename}: reading translation files is async, so await I18n.preloadTranslationFiles() after setting I18n.load_path.`,
    );
  }
  return contents;
}

function extname(filename: string): string {
  const base = filename.slice(filename.lastIndexOf("/") + 1);
  const dot = base.lastIndexOf(".");
  return dot <= 0 ? "" : base.slice(dot);
}

function inspectError(e: unknown): string {
  return e instanceof Error ? `#<${e.name}: ${e.message}>` : String(e);
}

function isNil(value: unknown): boolean {
  if (value == null) return true;
  if (typeof value !== "object") return false;
  const nil = (value as { nil?: unknown }).nil;
  return typeof nil === "function" && (nil as () => boolean).call(value) === true;
}

function truthy(value: unknown): boolean {
  return value !== undefined && value !== null && value !== false;
}

function isHash(value: unknown): value is TranslationData {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function toS(subject: unknown): string {
  if (subject == null) return "";
  return isSymbol(subject) ? symbolToS(subject) : String(subject);
}

function respondTo(object: unknown, name: string): boolean {
  return (
    object != null && (typeof object === "object" || typeof object === "function") && name in object
  );
}

interface Localizable {
  strftime(format: string): string;
  wday: number;
  mon: number;
  hour?: number;
  sec?: number;
}

/** @internal */
function temporalLocalizable(
  object: Temporal.PlainDate | Temporal.PlainDateTime | Temporal.ZonedDateTime | Temporal.Instant,
): Localizable {
  const plain =
    object instanceof Temporal.Instant
      ? object.toZonedDateTimeISO("UTC").toPlainDateTime()
      : object instanceof Temporal.ZonedDateTime
        ? object.toPlainDateTime()
        : object;
  const localizable: Localizable = {
    strftime: (format: string) => strftime(object, format),
    wday: plain.dayOfWeek % 7,
    mon: plain.month,
  };
  if (!(object instanceof Temporal.PlainDate)) {
    localizable.hour = (plain as Temporal.PlainDateTime).hour;
    localizable.sec = (plain as Temporal.PlainDateTime).second;
  }
  return localizable;
}

/** @internal */
function localizable(object: unknown): unknown {
  if (
    object instanceof Temporal.PlainDate ||
    object instanceof Temporal.PlainDateTime ||
    object instanceof Temporal.ZonedDateTime ||
    object instanceof Temporal.Instant
  ) {
    return temporalLocalizable(object);
  }
  return object;
}

export abstract class Base {
  transliterate = transliterate;
  /**
   * @internal
   * @noRailsEquivalent PERMANENT
   */
  transliterators?: Record<Locale, HashTransliterator | ProcTransliterator>;

  private eagerLoadedFlag = false;

  loadTranslations(...filenames: unknown[]): void {
    const block =
      typeof filenames[filenames.length - 1] === "function"
        ? (filenames.pop() as (filename: string, loadedTranslations: TranslationData) => void)
        : undefined;
    if (filenames.length === 0) filenames = config().loadPath;
    for (const filename of (filenames as (string | string[])[]).flat()) {
      const loadedTranslations = this.loadFile(filename);
      if (block) block(filename, loadedTranslations);
    }
  }

  storeTranslations(
    _locale: Locale,
    _data: TranslationData,
    _options: TranslateOptions = EMPTY_HASH,
  ): unknown {
    throw new NotImplementedError();
  }

  translate(
    locale: Locale | null | undefined,
    key: TranslationKey | null | undefined,
    options: TranslateOptions = EMPTY_HASH,
  ): unknown {
    if (key === "") throw new ArgumentError();
    if (!truthy(locale)) throw new InvalidLocale(locale);
    if (key == null && !("default" in options)) return null;

    let entry: unknown =
      key == null ? null : (this.lookup(locale!, key, options.scope, options) ?? null);

    if (isNil(entry) && "default" in options) {
      entry = this.default(locale!, key, options.default, options);
    } else {
      entry = this.resolveEntry(locale!, key, entry, options);
    }

    const count = options.count;

    if (isNil(entry) && (this.subtrees() || !truthy(count))) {
      if (("default" in options && options.default != null) || !("default" in options)) {
        throwException(new MissingTranslation(locale!, key as TranslationKey, options));
      }
    }

    if (truthy(count)) entry = this.pluralize(locale!, entry, count);

    if (isNil(entry) && !this.subtrees()) {
      throwException(new MissingTranslation(locale!, key as TranslationKey, options));
    }

    const deepInterpolation = options.deepInterpolation;
    const skipInterpolation = options.skipInterpolation;
    const values = Object.keys(options).length > 0 ? except(options, ...RESERVED_KEYS) : undefined;
    if (!truthy(skipInterpolation) && values && Object.keys(values).length > 0) {
      entry = truthy(deepInterpolation)
        ? this.deepInterpolate(locale!, entry, values)
        : this.interpolate(locale!, entry, values);
    } else if (typeof entry === "string") {
      const reserved = reservedKeysPattern().exec(entry);
      if (reserved) throw new ReservedInterpolationKey(toSym(reserved[1]), entry);
    }
    return entry;
  }

  exists(locale: Locale, key: TranslationKey, options: TranslateOptions = EMPTY_HASH): boolean {
    return this.lookup(locale, key, options.scope) != null;
  }

  localize(
    locale: Locale,
    object: unknown,
    format: unknown = ":default",
    options: TranslateOptions = EMPTY_HASH,
  ): unknown {
    if (object == null && "default" in options) {
      return options.default;
    }
    object = localizable(object);
    if (!respondTo(object, "strftime")) {
      throw new ArgumentError(
        `Object must be a Date, DateTime or Time object. ${inspect(object)} given.`,
      );
    }

    if (isSymbol(format)) {
      const key = format;
      const type = respondTo(object, "sec") ? "time" : "date";
      options = { ...options, raise: true, object, locale };
      format = t(`:${type}.formats.${symbolToS(key)}`, options);
    }

    format = this.translateLocalizationFormat(locale, object as Localizable, format, options);
    return (object as Localizable).strftime(format as string);
  }

  availableLocales(): Locale[] {
    throw new NotImplementedError();
  }

  async reloadBang(): Promise<void> {
    await reloadTranslationFiles();
    if (this.eagerLoaded()) await this.eagerLoadBang();
  }

  async eagerLoadBang(): Promise<void> {
    this.eagerLoadedFlag = true;
  }

  protected eagerLoaded(): boolean {
    return this.eagerLoadedFlag;
  }

  protected lookup(
    _locale: Locale,
    _key: TranslationKey,
    _scope: unknown = [],
    _options: TranslateOptions = EMPTY_HASH,
  ): unknown {
    throw new NotImplementedError();
  }

  protected subtrees(): boolean {
    return true;
  }

  protected default(
    locale: Locale,
    object: TranslationKey | null | undefined,
    subject: unknown,
    options: TranslateOptions = EMPTY_HASH,
  ): unknown {
    options =
      Object.keys(options).length === 1 && "default" in options ? {} : except(options, "default");

    if (Array.isArray(subject)) {
      for (const item of subject) {
        const result = this.resolve(locale, object, item, options);
        if (result != null) return result;
      }
      return null;
    }
    return this.resolve(locale, object, subject, options);
  }

  protected resolve(
    locale: Locale,
    object: TranslationKey | null | undefined,
    subject: unknown,
    options: TranslateOptions = EMPTY_HASH,
  ): unknown {
    if (options.resolve === false) return subject;
    const result = catchException(() => {
      if (isSymbol(subject)) {
        return translate(subject, {
          ...options,
          locale,
          throw: true,
          skipInterpolation: true,
        });
      }
      if (typeof subject === "function") {
        const dateOrTime =
          options.object != null && options.object !== false ? options.object : object;
        delete options.object;
        return this.resolve(
          locale,
          object,
          (subject as (value: unknown, options: TranslateOptions) => unknown)(dateOrTime, options),
        );
      }
      return subject;
    });
    return result instanceof MissingTranslation ? null : result;
  }

  protected resolveEntry(
    locale: Locale,
    object: TranslationKey | null | undefined,
    subject: unknown,
    options: TranslateOptions = EMPTY_HASH,
  ): unknown {
    return this.resolve(locale, object, subject, options);
  }

  protected pluralize(_locale: Locale, entry: unknown, count: unknown): unknown {
    entry = isHash(entry) ? except(entry, "attributes") : entry;
    if (!isHash(entry) || !truthy(count)) return entry;

    const key = this.pluralizationKey(entry, count);
    if (!(key in entry)) throw new InvalidPluralizationData(entry, count, key);
    return entry[key];
  }

  protected interpolate(
    locale: Locale,
    subject: unknown,
    values: TranslationData = EMPTY_HASH,
  ): unknown {
    if (Object.keys(values).length === 0) return subject;
    if (typeof subject === "string") return interpolateString(subject, values);
    if (Array.isArray(subject)) {
      return subject.map((element) => this.interpolate(locale, element, values));
    }
    return subject;
  }

  protected deepInterpolate(
    locale: Locale,
    data: unknown,
    values: TranslationData = EMPTY_HASH,
  ): unknown {
    if (Object.keys(values).length === 0) return data;
    if (typeof data === "string") return interpolateString(data, values);
    if (Array.isArray(data)) return data.map((v) => this.deepInterpolate(locale, v, values));
    if (isHash(data)) {
      const result: TranslationData = {};
      for (const [k, v] of Object.entries(data)) {
        result[k] = this.deepInterpolate(locale, v, values);
      }
      return result;
    }
    return data;
  }

  protected translateLocalizationFormat(
    locale: Locale,
    object: Localizable,
    format: unknown,
    _options: TranslateOptions,
  ): string {
    try {
      return toS(format).replace(/%(|\^)[aAbBpP]/g, (match) => {
        switch (match) {
          case "%a":
            return (tBang("date.abbr_day_names", { locale, format }) as string[])[object.wday];
          case "%^a":
            return (tBang("date.abbr_day_names", { locale, format }) as string[])[
              object.wday
            ].toUpperCase();
          case "%A":
            return (tBang("date.day_names", { locale, format }) as string[])[object.wday];
          case "%^A":
            return (tBang("date.day_names", { locale, format }) as string[])[
              object.wday
            ].toUpperCase();
          case "%b":
            return (tBang("date.abbr_month_names", { locale, format }) as string[])[object.mon];
          case "%^b":
            return (tBang("date.abbr_month_names", { locale, format }) as string[])[
              object.mon
            ].toUpperCase();
          case "%B":
            return (tBang("date.month_names", { locale, format }) as string[])[object.mon];
          case "%^B":
            return (tBang("date.month_names", { locale, format }) as string[])[
              object.mon
            ].toUpperCase();
          case "%p":
            return (
              tBang(`time.${(respondTo(object, "hour") ? object.hour! : 0) < 12 ? "am" : "pm"}`, {
                locale,
                format,
              }) as string
            ).toUpperCase();
          case "%P":
            return (
              tBang(`time.${(respondTo(object, "hour") ? object.hour! : 0) < 12 ? "am" : "pm"}`, {
                locale,
                format,
              }) as string
            ).toLowerCase();
          default:
            return "";
        }
      });
    } catch (e) {
      if (e instanceof MissingTranslationData) return e.message;
      throw e;
    }
  }

  protected loadFile(filename: string): TranslationData {
    let type = extname(filename);
    type = tr(type, ".", "").toLowerCase();
    const loader = (this as unknown as Record<string, unknown>)[
      `load${type.charAt(0).toUpperCase()}${type.slice(1)}`
    ];
    if (typeof loader !== "function") throw new UnknownFileType(type, filename);
    const [data, keysSymbolized] = (
      loader as (this: Base, filename: string) => [unknown, boolean]
    ).call(this, filename);
    if (!isHash(data)) {
      throw new InvalidLocaleData(filename, "expects it to return a hash, but does not");
    }
    for (const [locale, d] of Object.entries(data)) {
      this.storeTranslations(locale, (truthy(d) ? d : {}) as TranslationData, {
        skipSymbolizeKeys: keysSymbolized,
      });
    }
    return data;
  }

  protected loadJs(filename: string): [unknown, boolean] {
    const translations = readLocaleModule(filename);
    return [translations, false];
  }

  /** @missingRailsCall load_file — PERMANENT */
  protected loadYml(filename: string): [unknown, boolean] {
    try {
      return [deepFreeze(readYaml(readFile(filename))), true];
    } catch (e) {
      throw new InvalidLocaleData(filename, inspectError(e));
    }
  }

  protected loadYaml(filename: string): [unknown, boolean] {
    return Base.prototype.loadYml.call(this, filename);
  }

  /** @missingRailsCall load_file — PERMANENT */
  protected loadJson(filename: string): [unknown, boolean] {
    try {
      return [deepFreeze(JSON.parse(readFile(filename))), true];
    } catch (e) {
      throw new InvalidLocaleData(filename, inspectError(e));
    }
  }

  protected pluralizationKey(entry: TranslationData, count: unknown): string {
    if (count === 0 && "zero" in entry) return "zero";
    return count === 1 ? "one" : "other";
  }
}
