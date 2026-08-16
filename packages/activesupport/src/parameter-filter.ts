/**
 * = Active Support Parameter Filter
 *
 * `ParameterFilter` replaces values in a Hash-like object if their keys match
 * one of the specified filters.
 *
 * Matching based on nested keys is possible by using dot notation, e.g.
 * `"credit_card.number"`.
 *
 * If a proc is given as a filter, each key and value of the Hash-like and of
 * any nested Hashes will be passed to it.
 *
 *     // Replaces values with "[FILTERED]" for keys that match /password/i.
 *     new ParameterFilter(["password"]);
 *
 *     // Replaces values for the exact key "pin" and for keys that begin with
 *     // "pin_".
 *     new ParameterFilter([/^pin$/, /^pin_/]);
 *
 * Mirrors: ActiveSupport::ParameterFilter (parameter_filter.rb:39-156).
 */

/**
 * A Ruby block filter. Rails' blocks mutate `key`/`value` in place (via
 * `String#replace`) and their return value is discarded; a JS string is an
 * immutable primitive, so a block hands its replacement back by returning it.
 * The only sanctioned deviation here — everything else follows the Ruby.
 */
export type FilterProc = (
  key: string,
  value: unknown,
  originalParams?: Record<string, unknown>,
) => unknown;

export type Filter = string | RegExp | FilterProc;

export interface ParameterFilterOptions {
  mask?: unknown;
}

export class ParameterFilter {
  static readonly FILTERED = "[FILTERED]";

  /**
   * Precompiles an array of filters that otherwise would be passed directly to
   * the constructor. Depending on the quantity and types of filters,
   * precompilation can improve filtering performance, especially in the case
   * where the ParameterFilter instance itself cannot be retained (but the
   * precompiled filters can be retained).
   *
   * Ruby joins the escaped string patterns and the given Regexps into a single
   * Regexp, spelling each string's case-insensitivity with the inline
   * `(?i:...)` group. JS regular expressions have no inline flag groups — `i`
   * is a whole-pattern flag — so the case-insensitive patterns are joined into
   * their own Regexp rather than sharing one with the case-sensitive ones. The
   * shallow-before-deep ordering, and the contents of each group, are Rails'.
   */
  static precompileFilters(filters: Filter[]): Array<FilterProc | RegExp> {
    const patterns: Array<{ source: string; ignoreCase: boolean }> = [];
    const compiled: Array<FilterProc | RegExp> = [];

    for (const filter of filters) {
      if (typeof filter === "function") {
        compiled.push(filter);
      } else if (filter instanceof RegExp) {
        patterns.push({ source: filter.source, ignoreCase: filter.ignoreCase });
      } else {
        patterns.push({ source: escapeRegexp(String(filter)), ignoreCase: true });
      }
    }

    const deepPatterns: typeof patterns = [];
    for (let i = patterns.length - 1; i >= 0; i--) {
      if (patterns[i].source.includes("\\.")) deepPatterns.unshift(...patterns.splice(i, 1));
    }

    for (const group of [patterns, deepPatterns]) {
      for (const ignoreCase of [false, true]) {
        const sources = group.filter((p) => p.ignoreCase === ignoreCase).map((p) => p.source);
        if (sources.length > 0) {
          compiled.push(new RegExp(sources.join("|"), ignoreCase ? "i" : ""));
        }
      }
    }

    return compiled;
  }

  private mask: unknown;
  private noFilters!: boolean;
  private regexps!: RegExp[];
  private deepRegexps!: RegExp[] | null;
  private blocks!: FilterProc[] | null;

  /**
   * Create instance with given filters. Supported type of filters are String,
   * RegExp, and function. Other types of filters are treated as String using
   * `String()`. For function filters, key, value, and optional original hash is
   * passed to the arguments.
   *
   * ==== Options
   *
   * * `mask` - A replaced object when filtered. Defaults to `"[FILTERED]"`.
   */
  constructor(
    filters: Filter[] = [],
    { mask = ParameterFilter.FILTERED }: ParameterFilterOptions = {},
  ) {
    this.mask = mask;
    this.compileFiltersBang(filters);
  }

  /** Mask value of `params` if key matches one of filters. */
  filter(params: Record<string, unknown>): Record<string, unknown> {
    return this.noFilters ? { ...params } : this.call(params);
  }

  /**
   * Returns filtered value for given key. For function filters, third argument
   * is not populated.
   */
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
        const s = escapeRegexp(String(item));
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
    originalParams: Record<string, unknown> = params,
  ): Record<string, unknown> {
    // `params.class.new` (parameter_filter.rb:126): a plain JS object has no
    // constructor to call, so the same prototype is the same class.
    const filteredParams = Object.create(Object.getPrototypeOf(params)) as Record<string, unknown>;

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
      value = this.call(value, fullKey ?? null, originalParams ?? value);
    } else if (Array.isArray(value)) {
      value = value.map((v) => this.valueForKey(key, v, fullParentKey, originalParams));
    } else if (this.blocks) {
      for (const b of this.blocks) {
        const result = b.length === 2 ? b(key, value) : b(key, value, originalParams ?? undefined);
        if (result !== undefined) value = result;
      }
    }

    return value;
  }
}

/** Mirrors Ruby's `Regexp.escape`, which JS has no built-in for. */
function escapeRegexp(source: string): string {
  return source.replace(/[.*+?^${}()|[\]\\-]/g, "\\$&");
}

/** Ruby's `value.is_a?(Hash)` — a plain object, not a class instance. */
function isHash(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object") return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}
