import { HashWithIndifferentAccess } from "./hash-with-indifferent-access.js";
import { regexpEscape } from "@blazetrails/ruby-compat";

export type FilterProc = (
  key: string,
  value: unknown,
  originalParams?: Record<string, unknown> | null,
) => unknown;

export type Filter = string | RegExp | FilterProc;

export interface ParameterFilterOptions {
  mask?: unknown;
}

export class ParameterFilter {
  static readonly FILTERED = "[FILTERED]";

  static precompileFilters(filters: Filter[]): Array<FilterProc | RegExp> {
    const patterns: Array<{
      source: string;
      unicode: boolean;
      unicodeSets: boolean;
    }> = [];
    const compiled: Array<FilterProc | RegExp> = [];

    for (const filter of filters) {
      if (typeof filter === "function") {
        compiled.push(filter);
      } else if (filter instanceof RegExp) {
        patterns.push({
          source: filter.ignoreCase ? `(?i:${filter.source})` : filter.source,
          unicode: filter.flags.includes("u"),
          unicodeSets: filter.flags.includes("v"),
        });
      } else {
        patterns.push({
          source: `(?i:${regexpEscape(String(filter))})`,
          unicode: false,
          unicodeSets: false,
        });
      }
    }

    const deepPatterns: typeof patterns = [];
    for (let i = patterns.length - 1; i >= 0; i--) {
      if (patterns[i].source.includes("\\.")) deepPatterns.unshift(...patterns.splice(i, 1));
    }

    for (const group of [patterns, deepPatterns]) {
      const sources = group.map((pattern) => pattern.source);
      if (sources.length > 0) {
        compiled.push(new RegExp(sources.join("|"), unicodeFlag(group)));
      }
    }

    return compiled;
  }

  private mask: unknown;
  private noFilters!: boolean;
  private regexps!: RegExp[];
  private deepRegexps!: RegExp[] | null;
  private blocks!: FilterProc[] | null;

  constructor(
    filters: Filter[] = [],
    { mask = ParameterFilter.FILTERED }: ParameterFilterOptions = {},
  ) {
    this.mask = mask;
    this.compileFiltersBang(filters);
  }

  filter(params: Record<string, unknown>): Record<string, unknown> {
    if (!this.noFilters) return this.call(params);
    if (params instanceof HashWithIndifferentAccess) {
      return params.dup() as unknown as Record<string, unknown>;
    }
    return { ...params };
  }

  filterParam(key: string, value: unknown): unknown {
    return this.noFilters ? value : this.valueForKey(key, value);
  }

  private compileFiltersBang(filters: Filter[]): void {
    this.noFilters = filters.length === 0;
    if (this.noFilters) return;

    this.regexps = [];
    const strings: string[] = [];
    this.deepRegexps = null;
    let deepStrings: string[] | null = null;
    this.blocks = null;

    for (const item of filters) {
      if (typeof item === "function") {
        (this.blocks ??= []).push(item);
      } else if (item instanceof RegExp) {
        if (item.source.includes("\\.")) {
          (this.deepRegexps ??= []).push(item);
        } else {
          this.regexps.push(item);
        }
      } else {
        const s = regexpEscape(String(item));
        if (s.includes("\\.")) {
          (deepStrings ??= []).push(s);
        } else {
          strings.push(s);
        }
      }
    }

    if (strings.length > 0) this.regexps.push(new RegExp(strings.join("|"), "i"));
    if (deepStrings) (this.deepRegexps ??= []).push(new RegExp(deepStrings.join("|"), "i"));
  }

  private call(
    params: Record<string, unknown>,
    fullParentKey: string | null = null,
    originalParams: Record<string, unknown> | null = params,
  ): Record<string, unknown> {
    if (params instanceof HashWithIndifferentAccess) {
      const filteredParams = new HashWithIndifferentAccess<unknown>();
      (params as HashWithIndifferentAccess<unknown>).forEach((value, key) => {
        filteredParams.set(key, this.valueForKey(key, value, fullParentKey, originalParams));
      });
      return filteredParams as unknown as Record<string, unknown>;
    }

    const filteredParams = new ((params.constructor ?? Object) as ObjectConstructor)() as Record<
      string,
      unknown
    >;

    for (const [key, value] of Object.entries(params)) {
      filteredParams[key] = this.valueForKey(key, value, fullParentKey, originalParams);
    }

    return filteredParams;
  }

  private valueForKey(
    key: string,
    value: unknown,
    fullParentKey: string | null = null,
    originalParams: Record<string, unknown> | null = null,
  ): unknown {
    let fullKey: string | undefined;
    if (this.deepRegexps) {
      fullKey = fullParentKey != null ? `${fullParentKey}.${key}` : String(key);
    }

    if (this.regexps.some((r) => r.test(String(key)))) {
      value = this.mask;
    } else if (this.deepRegexps?.some((r) => r.test(fullKey!))) {
      value = this.mask;
    } else if (isHash(value)) {
      value = this.call(value, fullKey ?? null, originalParams);
    } else if (Array.isArray(value)) {
      value = value.map((v) => this.valueForKey(key, v, fullParentKey, originalParams));
    } else if (this.blocks) {
      for (const b of this.blocks) {
        const result = b.length === 2 ? b(key, value) : b(key, value, originalParams);
        if (result !== undefined) value = result;
      }
    }

    return value;
  }
}

function unicodeFlag(group: Array<{ unicode: boolean; unicodeSets: boolean }>): string {
  if (group.some((pattern) => pattern.unicodeSets)) return "v";
  return group.some((pattern) => pattern.unicode) ? "u" : "";
}

function isHash(value: unknown): value is Record<string, unknown> {
  if (value instanceof HashWithIndifferentAccess) return true;
  if (value === null || typeof value !== "object") return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}
