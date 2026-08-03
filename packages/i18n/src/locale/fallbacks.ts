/**
 * Mirrors: i18n/lib/i18n/locale/fallbacks.rb
 *
 * Locale fallbacks will compute a number of fallback locales for a given
 * locale. For example:
 *
 *     I18n.fallbacks().get("es-MX") // => ["es-MX", "es", "en"]
 *
 * Locale fallbacks always fall back to
 *
 *   * all parent locales of a given locale (e.g. "es" for "es-MX") first,
 *   * the current default locales and all of their parents second
 *
 * The default locales are set to [] by default but can be set to something
 * else.
 *
 * One can additionally add any number of additional fallback locales manually.
 * These will be added before the default locales to the fallback chain. For
 * example:
 *
 *     // using a custom locale as default fallback locale
 *
 *     I18n.setFallbacks(new Fallbacks("en-GB", { "de-AT": "de", "de-CH": "de" }));
 *     I18n.fallbacks().get("de-AT"); // => ["de-AT", "de", "en-GB", "en"]
 *     I18n.fallbacks().get("de-CH"); // => ["de-CH", "de", "en-GB", "en"]
 *
 *     // mapping fallbacks to an existing instance
 *
 *     // people speaking Catalan also speak Spanish as spoken in Spain
 *     const fallbacks = I18n.fallbacks();
 *     fallbacks.map({ ca: "es-ES" });
 *     fallbacks.get("ca"); // => ["ca", "es-ES", "es", "en-US", "en"]
 *
 * Ruby subclasses `Hash`; the JS analogue of a Hash is a `Map`, so `[]` — which
 * `docs/ruby-ts-conventions.md` maps to `get()` — lands on `Map#get` and its
 * `super` call is the gem's `super`.
 */

import { InvalidLocale, Disabled } from "../exceptions.js";
import type { Locale } from "../i18n.js";
import { tag as tagFor } from "./tag.js";

/** A mapping argument: `{ "de-AT": "de-DE" }` or `{ sms: ["se-FI", "fi-FI"] }`. */
export type FallbackMappings = Record<Locale, Locale | Locale[]>;

/**
 * Ruby's `Symbol#inspect`, which quotes any symbol that is not a plain
 * identifier — `:"de-AT"`, but `:de`. `inspect` in `../exceptions.js` renders
 * translation values, not locales.
 */
function inspectSymbol(value: Locale): string {
  return /^[a-zA-Z_][a-zA-Z0-9_]*[?!=]?$/.test(value) ? `:${value}` : `:"${value}"`;
}

function inspectLocales(locales: Locale[]): string {
  return `[${locales.map(inspectSymbol).join(", ")}]`;
}

export class Fallbacks extends Map<Locale, Locale[]> {
  private mapStore: Record<Locale, Locale[]> = {};
  private defaultsStore: Locale[] = [];

  constructor(...mappings: (Locale | Locale[] | FallbackMappings)[]) {
    super();
    const last = mappings[mappings.length - 1];
    if (typeof last === "object" && last !== null && !Array.isArray(last)) {
      this.map(mappings.pop() as FallbackMappings);
    }
    this.setDefaults(mappings.length === 0 ? [] : (mappings as (Locale | Locale[])[]));
  }

  setDefaults(defaults: (Locale | Locale[])[]): void {
    this.defaultsStore = defaults.flatMap((default_) => this.compute(default_, false));
  }

  defaults(): Locale[] {
    return this.defaultsStore;
  }

  override get(locale: Locale | false | null | undefined): Locale[] {
    if (locale == null) throw new InvalidLocale(locale);
    if (locale === false) throw new Disabled("fallback#[]");
    locale = String(locale);
    return super.get(locale) ?? this.store(locale, this.compute(locale));
  }

  map(mappings: FallbackMappings): void;
  map<T>(block: (key: Locale, value: Locale[]) => T): T[];
  map(...args: unknown[]): unknown {
    const block =
      typeof args[args.length - 1] === "function"
        ? (args.pop() as (key: Locale, value: Locale[]) => unknown)
        : undefined;
    if (args.length === 1 && !block) {
      const mappings = args[0] as FallbackMappings;
      for (const [from, to] of Object.entries(mappings)) {
        for (const _to of ([] as Locale[]).concat(to)) {
          this.mapStore[from] ??= [];
          this.mapStore[from].push(_to);
        }
      }
      return undefined;
    } else {
      return Object.entries(this.mapStore).map(([key, value]) => block!(key, value));
    }
  }

  empty(): boolean {
    return Object.keys(this.mapStore).length === 0 && this.defaultsStore.length === 0;
  }

  inspect(): string {
    const map = Object.entries(this.mapStore)
      .map(([key, value]) => `${inspectSymbol(key)}=>${inspectLocales(value)}`)
      .join(", ");
    return `#<${this.constructor.name} @map={${map}} @defaults=${inspectLocales(this.defaultsStore)}>`;
  }

  protected compute(
    tags: Locale | Locale[] | null | undefined,
    includeDefaults = true,
    exclude: Locale[] = [],
  ): Locale[] {
    let result: Locale[] = [];
    for (const tag of tags == null ? [] : ([] as Locale[]).concat(tags)) {
      const tags = tagFor(tag)
        .selfAndParents()
        .map((t) => t.toSym())
        .filter((t) => !exclude.includes(t));
      result = result.concat(tags);
      for (const _tag of tags) {
        if (this.mapStore[_tag]) {
          result = result.concat(this.compute(this.mapStore[_tag], false, exclude.concat(result)));
        }
      }
    }

    if (includeDefaults) result.push(...this.defaults());
    return [...new Set(result)].filter((locale) => locale != null);
  }

  /** Ruby's `Hash#store`, which `[]` calls for its return value. */
  private store(locale: Locale, value: Locale[]): Locale[] {
    this.set(locale, value);
    return value;
  }
}
