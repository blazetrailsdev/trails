/**
 * Mirrors: i18n/lib/i18n/backend/base.rb
 *
 * Ruby mixes `Base` into a backend with `include`; the JS equivalent is an
 * abstract class that concrete backends extend, which keeps the file layout of
 * the gem. `store_translations` (base.rb:24-26), `available_locales`
 * (base.rb:97-99) and `lookup` (base.rb:116-118) keep the gem's raising bodies
 * rather than being `abstract`: Ruby lets a partial backend exist and fail at
 * call time, and `Chain` includes `Base` without defining a `lookup` at all.
 *
 * A Ruby Symbol value is a JS string that keeps its leading colon — `":short"`
 * is `:short` — which is the discriminator Ruby gets from the type, and is how
 * the value already renders through `inspect`. That is the spelling `localize`,
 * `default` and `resolve` all use for the `Symbol === x` arms of the gem
 * (base.rb:84, base.rb:154).
 */

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
  tBang,
  type Locale,
  type TranslationKey,
} from "../i18n.js";
import { interpolate as interpolateString } from "../interpolate/ruby.js";
import { throwException, catchException } from "../throw-catch.js";
import {
  transliterate,
  type HashTransliterator,
  type ProcTransliterator,
} from "./transliterator.js";
import { except, type TranslationData } from "../utils.js";
import { tr } from "./flatten.js";
import { parseYaml } from "../yaml.js";

export type TranslateOptions = { [key: string]: unknown };

/** Reads a translation file and hands back its contents. */
export type FileReader = (filename: string) => Promise<string>;

let fileReader: FileReader | undefined;
const fileContents = new Map<string, string>();
const localeModules = new Map<string, unknown>();

/**
 * @noRailsEquivalent PERMANENT — the gem reads translation files with Ruby core —
 * `YAML.load_file` (base.rb:246) and `JSON.load_file` (base.rb:262). JS has no
 * filesystem in the language, and `packages/i18n` imports nothing from `node:*`
 * so it stays usable off a server, so the host registers the reader instead.
 */
export function registerFileReader(reader: FileReader): void {
  fileReader = reader;
}

/**
 * Reads every file in `I18n.load_path` into memory, so that the gem's loading
 * chain — `load_translations` / `load_file` / `load_yml` / `load_json`, and
 * `Simple#init_translations` above them — can stay synchronous exactly as the
 * gem writes it.
 *
 * @noRailsEquivalent PERMANENT — the gem has no preload because Ruby reads
 * files synchronously, so `init_translations` can read at its four lazy call
 * sites (simple.rb:83-86). Here the read is a Promise and those sites are
 * synchronous in Rails all the way up through `Error#message`,
 * `Naming#human` and `NumberConverter#format`; making them async would push a
 * deviation through five packages to remove one from this file. Awaiting the
 * I/O once at boot keeps the async fs and leaves every ported body verbatim.
 */
/**
 * Registers an already-imported JavaScript locale module under the load-path
 * entry that names it, so that `load_rb`'s port can evaluate it synchronously.
 *
 * @noRailsEquivalent PERMANENT — `load_rb` (base.rb:254) is
 * `eval(IO.read(filename), binding, filename)`: Ruby evaluates a source file
 * synchronously, wherever it sits. JS evaluates one with `import()`, which is a
 * Promise, and the four lazy `init_translations` call sites (simple.rb:83-86)
 * are synchronous in Rails all the way up. A host that puts a `.js` file on the
 * load path has already imported it, so it hands the module over here — the
 * module counterpart of `preloadTranslationFiles` below.
 */
export function registerLocaleModule(filename: string, translations: unknown): void {
  localeModules.set(filename, translations);
}

export async function preloadTranslationFiles(...filenames: (string | string[])[]): Promise<void> {
  const paths = filenames.length === 0 ? config().loadPath : filenames;
  for (const filename of paths.flat()) {
    fileContents.set(filename, await readTranslationFile(filename));
  }
}

/**
 * Drops the preloaded bytes and re-reads `I18n.load_path`, so that the
 * `load_translations` the next lazy `init_translations` runs sees what is on
 * disk now — which is what `YAML.load_file` (base.rb:246) does on every
 * `I18n.reload!` in the gem. A host that never registered a reader has no
 * files to re-read, and `I18n.reload!` there is only the in-memory clear.
 *
 * @noRailsEquivalent PERMANENT — the counterpart of `preloadTranslationFiles`
 * above: the gem's re-read is a synchronous `YAML.load_file` inside
 * `init_translations`, and the four call sites that reach it are synchronous in
 * Rails all the way up. Awaiting the re-read at `I18n.reload!` — the one seam
 * the gem also treats as a whole-backend reset — is what the language leaves.
 */
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

function readFile(filename: string): string {
  const contents = fileContents.get(filename);
  if (contents === undefined) {
    throw new Error(
      `I18n cannot read ${filename}: reading translation files is async, so await I18n.preloadTranslationFiles() after setting I18n.load_path.`,
    );
  }
  return contents;
}

/** Mirrors: Ruby's `File.extname`, down to the leading dot. */
function extname(filename: string): string {
  const base = filename.slice(filename.lastIndexOf("/") + 1);
  const dot = base.lastIndexOf(".");
  return dot <= 0 ? "" : base.slice(dot);
}

/** Mirrors: Ruby's `Exception#inspect`, which the rescues in load_yml/load_json use. */
function inspectError(e: unknown): string {
  return e instanceof Error ? `#<${e.name}: ${e.message}>` : String(e);
}

/** Mirrors: Ruby's core `NotImplementedError`, which base.rb raises. */
class NotImplementedError extends Error {
  constructor() {
    super("NotImplementedError");
    this.name = "NotImplementedError";
  }
}

/**
 * Ruby `x.nil?`, which — unlike JS `x == null` — is an ordinary method an
 * object may override. `I18n::Backend::KeyValue::SubtreeProxy` does exactly
 * that (key_value.rb:178-180), and the four `entry.nil?` tests in `translate`
 * below are what make its lazy, still-unfetched form behave as a miss.
 */
function isNil(value: unknown): boolean {
  if (value == null) return true;
  if (typeof value !== "object") return false;
  const nil = (value as { nil?: unknown }).nil;
  return typeof nil === "function" && (nil as () => boolean).call(value) === true;
}

/** Ruby truthiness: only `nil` and `false` are falsy — `0` and `""` are not. */
function truthy(value: unknown): boolean {
  return value !== undefined && value !== null && value !== false;
}

function isHash(value: unknown): value is TranslationData {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Ruby `Symbol === x`. A Ruby Symbol is a JS string that keeps its leading
 * colon (`":short"`), which is the discriminator Ruby gets from the type.
 */
function isSymbol(value: unknown): value is string {
  return typeof value === "string" && value.startsWith(":");
}

/** Ruby `#to_s` (i18n gem `lib/i18n.rb:447`), for the values a format argument can hold. */
function toS(subject: unknown): string {
  if (subject == null) return "";
  return isSymbol(subject) ? subject.slice(1) : String(subject);
}

/**
 * Ruby `respond_to?`. A Ruby reader that returns a value is a property or a
 * getter in JS, not a function, so membership — not callability — is the test.
 */
function respondTo(object: unknown, name: string): boolean {
  return (
    object != null && (typeof object === "object" || typeof object === "function") && name in object
  );
}

/**
 * The duck type `localize` accepts: the gem asks the object for `strftime`,
 * `wday`, `mon`, `hour` and `sec` and nothing else.
 */
interface Localizable {
  strftime(format: string): string;
  wday: number;
  mon: number;
  hour?: number;
  sec?: number;
}

export abstract class Base {
  /** Mirrors: `include I18n::Backend::Transliterator` (base.rb:9). */
  transliterate = transliterate;
  /** @internal Ruby's `@transliterators` ivar, which has no public reader. */
  transliterators?: Record<Locale, HashTransliterator | ProcTransliterator>;

  private eagerLoadedFlag = false;

  /**
   * Accepts a list of paths to translation files. Loads translations from
   * plain JavaScript (*.js), YAML files (*.yml), or JSON files (*.json). See
   * #loadJs, #loadYml, and #loadJson for details. Ruby's optional block is the trailing argument here.
   */
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

  /**
   * This method receives a locale, a data hash and options for storing
   * translations. Should be implemented.
   */
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
      if (reserved) throw new ReservedInterpolationKey(`:${reserved[1]}`, entry);
    }
    return entry;
  }

  exists(locale: Locale, key: TranslationKey, options: TranslateOptions = EMPTY_HASH): boolean {
    return this.lookup(locale, key, options.scope) != null;
  }

  /**
   * Acts the same as `strftime`, but uses a localized version of the format
   * string. Takes a key from the date/time formats translations as a format
   * argument (*e.g.*, `short` in `date.formats`).
   */
  localize(
    locale: Locale,
    object: unknown,
    format: unknown = ":default",
    options: TranslateOptions = EMPTY_HASH,
  ): unknown {
    if (object == null && "default" in options) {
      return options.default;
    }
    if (!respondTo(object, "strftime")) {
      throw new ArgumentError(
        `Object must be a Date, DateTime or Time object. ${inspect(object)} given.`,
      );
    }

    if (isSymbol(format)) {
      const key = format;
      const type = respondTo(object, "sec") ? "time" : "date";
      options = { ...options, raise: true, object, locale };
      format = t(`:${type}.formats.${key.slice(1)}`, options);
    }

    format = this.translateLocalizationFormat(locale, object as Localizable, format, options);
    return (object as Localizable).strftime(format as string);
  }

  /**
   * Returns an array of locales for which translations are available ignoring
   * the reserved translation meta data key `i18n`.
   */
  availableLocales(): Locale[] {
    throw new NotImplementedError();
  }

  reloadBang(): void {
    if (this.eagerLoaded()) this.eagerLoadBang();
  }

  eagerLoadBang(): void {
    this.eagerLoadedFlag = true;
  }

  protected eagerLoaded(): boolean {
    return this.eagerLoadedFlag;
  }

  /** The method which actually looks up for the translation in the store. */
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

  /**
   * Evaluates defaults. If given subject is an Array, it walks the array and
   * returns the first translation that can be resolved. Otherwise it tries to
   * resolve the translation directly.
   */
  protected default(
    locale: Locale,
    object: TranslationKey | null | undefined,
    subject: unknown,
    options: TranslateOptions = EMPTY_HASH,
  ): unknown {
    const rest =
      Object.keys(options).length === 1 && "default" in options ? {} : except(options, "default");

    if (Array.isArray(subject)) {
      for (const item of subject) {
        const result = this.resolve(locale, object, item, rest);
        if (result != null) return result;
      }
      return null;
    }
    return this.resolve(locale, object, subject, rest);
  }

  /**
   * Resolves a translation. If the given subject is a Symbol, it will be
   * translated with the given options. If it is a Proc then it will be
   * evaluated. All other subjects will be returned directly.
   */
  protected resolve(
    locale: Locale,
    object: TranslationKey | null | undefined,
    subject: unknown,
    options: TranslateOptions = EMPTY_HASH,
  ): unknown {
    if (options.resolve === false) return subject;
    const result = catchException(() => {
      if (isSymbol(subject)) {
        // The gem goes through `I18n.translate`, which — with `throw: true` —
        // hands a MissingTranslation straight back to this `catch`, exactly as
        // calling the backend does. The `I18n.t` facade is not ported yet.
        return config().backend.translate(locale, subject, {
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

  /**
   * Picks a translation from a pluralized mnemonic subkey according to English
   * pluralization rules:
   * - It will pick the `one` subkey if count is equal to 1.
   * - It will pick the `other` subkey otherwise.
   * - It will pick the `zero` subkey in the special case where count is equal
   *   to 0 and there is a `zero` subkey present. This behaviour is not standard
   *   with regards to the CLDR pluralization rules.
   */
  protected pluralize(_locale: Locale, entry: unknown, count: unknown): unknown {
    const subject = isHash(entry) ? except(entry, "attributes") : entry;
    if (!isHash(subject) || !truthy(count)) return subject;

    const key = this.pluralizationKey(subject, count);
    if (!(key in subject)) throw new InvalidPluralizationData(subject, count, key);
    return subject[key];
  }

  /**
   * Interpolates values into a given subject. Arrays are interpolated
   * element-wise, recursively.
   */
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

  /**
   * Deep interpolation.
   *
   *     deepInterpolate({ people: { ann: "Ann is %{ann}" } }, { ann: "good" })
   *     //=> { people: { ann: "Ann is good" } }
   */
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

  /**
   * Loads a single translations file by delegating to #loadJs or #loadYml
   * depending on the file extension and directly merges the data to the
   * existing translations. Raises I18n::UnknownFileType for all other file
   * extensions.
   */
  protected loadFile(filename: string): TranslationData {
    const type = tr(extname(filename), ".", "").toLowerCase();
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

  /**
   * Loads a plain JavaScript translations file. Evaluating the file must yield
   * translation data with locales as toplevel keys — the gem `eval`s Ruby
   * source for that hash, and a JS module's exports are the same hash.
   *
   * @noRailsEquivalent PERMANENT — the JS analogue of the gem's `load_rb`
   * (base.rb:254-257) — there is no Ruby source to `eval` here.
   */
  protected loadJs(filename: string): [unknown, boolean] {
    const translations = readLocaleModule(filename);
    return [translations, false];
  }

  /**
   * Loads a YAML translations file. The data must have locales as toplevel
   * keys. Only the pre-Psych-4 arm of the gem's `YAML.respond_to?
   * (:unsafe_load_file)` probe exists here — there is no Psych to probe, and
   * `parseYaml` neither symbolizes nor freezes, so `keys_symbolized` is false.
   *
   * @missingRailsCall load_file — Ruby's `YAML.load_file` (base.rb:246) reads
   * and parses in one call; JS has neither, so the read is served from the
   * preload (`preloadTranslationFiles`) and the parse goes through `parseYaml`.
   */
  protected loadYml(filename: string): [unknown, boolean] {
    try {
      return [parseYaml(readFile(filename)), false];
    } catch (e) {
      throw new InvalidLocaleData(filename, inspectError(e));
    }
  }

  /**
   * Mirrors: `alias_method :load_yaml, :load_yml` (base.rb:272). The call goes
   * through `Base.prototype` rather than `this` because `alias_method` copies
   * the method entry as it stands here, so a subclass override of `loadYml` is
   * not observed by the alias.
   */
  protected loadYaml(filename: string): [unknown, boolean] {
    return Base.prototype.loadYml.call(this, filename);
  }

  /**
   * Loads a JSON translations file. The data must have locales as toplevel
   * keys. As in #loadYml, only the arm of the gem's `JSON.respond_to?
   * (:load_file)` probe that neither symbolizes nor freezes exists here.
   *
   * @missingRailsCall load_file — Ruby's `JSON.load_file` (base.rb:262) reads
   * and parses in one call; `JSON.parse` only parses, so the read is served
   * from the preload (`preloadTranslationFiles`).
   */
  protected loadJson(filename: string): [unknown, boolean] {
    try {
      return [JSON.parse(readFile(filename)), false];
    } catch (e) {
      throw new InvalidLocaleData(filename, inspectError(e));
    }
  }

  protected pluralizationKey(entry: TranslationData, count: unknown): string {
    if (count === 0 && "zero" in entry) return "zero";
    return count === 1 ? "one" : "other";
  }
}
