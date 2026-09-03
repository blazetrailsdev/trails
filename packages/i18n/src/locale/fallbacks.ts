import { InvalidLocale, Disabled } from "../exceptions.js";
import type { Locale } from "../i18n.js";
import { tag as tagFor } from "./tag.js";

export type FallbackMappings = Record<Locale, Locale | Locale[]>;

function inspectSymbol(value: Locale): string {
  return /^[a-zA-Z_][a-zA-Z0-9_]*[?!=]?$/.test(value) ? `:${value}` : `:"${value}"`;
}

function inspectLocales(locales: Locale[]): string {
  return `[${locales.map(inspectSymbol).join(", ")}]`;
}

export class Fallbacks extends Map<Locale, Locale[]> {
  static override name = "I18n::Locale::Fallbacks";

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

  get defaults(): Locale[] {
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
      const tags = tagFor(tag)!
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

    if (includeDefaults) result.push(...this.defaults);
    return [...new Set(result)].filter((locale) => locale != null);
  }

  private store(locale: Locale, value: Locale[]): Locale[] {
    this.set(locale, value);
    return value;
  }
}
