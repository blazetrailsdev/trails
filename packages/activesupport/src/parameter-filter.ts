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
 * A Ruby block filter. Rails' blocks mutate `value` in place (via
 * `String#replace`) and their return value is discarded; a JS string is an
 * immutable primitive, so a block hands its replacement back by returning it.
 * The only sanctioned deviation here — everything else follows the Ruby.
 *
 * A block cannot rewrite the key in the port, and does not need to: Rails
 * hands the block `key.dup` (parameter_filter.rb:149), a copy local to
 * `value_for_key`, while `call` writes `filtered_params[key]` with its own
 * unmutated key (:129) — so a key mutation never reaches the filtered hash in
 * Rails either. `value_for_key` returns the value alone in both, which is why
 * a `{ key, value }` return shape would be surface Rails' block does not have.
 */
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

  /**
   * Precompiles an array of filters that otherwise would be passed directly to
   * the constructor. Depending on the quantity and types of filters,
   * precompilation can improve filtering performance, especially in the case
   * where the ParameterFilter instance itself cannot be retained (but the
   * precompiled filters can be retained).
   *
   * Ruby joins the escaped string patterns and the given Regexps into a single
   * Regexp per group, spelling each case-insensitive part with the inline
   * `(?i:...)` group (parameter_filter.rb:58-65). JS has no inline flag group,
   * so {@link ignoreCaseSource} spells the same matching case-sensitively —
   * each cased character expanded to a `[aA]` class — and the group is joined
   * into ONE Regexp exactly as Rails'.
   */
  static precompileFilters(filters: Filter[]): Array<FilterProc | RegExp> {
    const patterns: Array<{
      source: string;
      ignoreCase: boolean;
      unicode: boolean;
      unicodeSets: boolean;
    }> = [];
    const compiled: Array<FilterProc | RegExp> = [];

    for (const filter of filters) {
      if (typeof filter === "function") {
        compiled.push(filter);
      } else if (filter instanceof RegExp) {
        patterns.push({
          source: filter.source,
          ignoreCase: filter.ignoreCase,
          unicode: filter.flags.includes("u"),
          unicodeSets: filter.flags.includes("v"),
        });
      } else {
        patterns.push({
          source: escapeRegexp(String(filter)),
          ignoreCase: true,
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
      const sources = group.map((pattern) =>
        pattern.ignoreCase
          ? ignoreCaseSource(pattern.source, pattern.unicode || pattern.unicodeSets)
          : pattern.source,
      );
      // A `\p{...}` escape only means a Unicode property under `u`/`v`; without
      // it the escape is the letter `p`, which Ruby has no spelling for. Ruby's
      // Regexp is always Unicode-aware, so the joined Regexp carries `u`
      // whenever any member of the group was written with it.
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
    originalParams: Record<string, unknown> | null = params,
  ): Record<string, unknown> {
    // `params.class.new` (parameter_filter.rb:126). A null-prototype hash has
    // no constructor — no class, in Ruby's terms — so it allocates a plain
    // Object, the nearest thing JS has to its class.
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

/** The Unicode flag the joined Regexp of a group must carry: the widest one any
 *  member was written with, since a `v` source is not always legal under `u`. */
function unicodeFlag(group: Array<{ unicode: boolean; unicodeSets: boolean }>): string {
  if (group.some((pattern) => pattern.unicodeSets)) return "v";
  return group.some((pattern) => pattern.unicode) ? "u" : "";
}

/** A cased character spelled as the class matching both of its cases, or the
 *  character unchanged when it has no other case. */
function bothCases(char: string): string {
  const lower = char.toLowerCase();
  const upper = char.toUpperCase();
  return lower === upper || lower.length !== 1 || upper.length !== 1 ? char : `[${lower}${upper}]`;
}

/**
 * A Unicode property escape as `(?i:...)` matches it: Ruby case-folds the
 * subject, so `\p{Lu}` matches a lowercase letter and `\p{Ll}` an uppercase one
 * — both are `\p{L}` — while the negated `\P{Lu}` is the complement of that,
 * `\P{L}`. Any other property is case-blind and passes through.
 */
function ignoreCaseProperty(property: string): string {
  return property === "Lu" || property === "Ll" ? "L" : property;
}

/** The index of the `]` closing the character class open at `start`, or the end
 *  of the source when it is unterminated. A `]` in the first member position is
 *  a literal, as is one preceded by a backslash. */
function classEnd(source: string, start: number): number {
  let i = start + 1;
  if (source[i] === "^") i++;
  if (source[i] === "]") i++;
  for (; i < source.length; i++) {
    if (source[i] === "\\") i++;
    else if (source[i] === "]") return i;
  }
  return source.length - 1;
}

/**
 * A character class as `(?i:...)` matches it: each cased member gains its other
 * case, in place, so `[xy]` is `[xXyY]` and a cased range gains the range of
 * its folded endpoints, `[a-c]` → `[a-cA-C]`. Nesting `[aA]` is not an option
 * here, which is why the member expansion is written out rather than reusing
 * {@link bothCases}.
 */
function ignoreCaseClass(klass: string, unicode: boolean): string {
  const negated = klass.startsWith("[^");
  const body = klass.slice(negated ? 2 : 1, -1);
  let out = "";
  for (let i = 0; i < body.length; i++) {
    const char = body[i];
    if (char === "\\") {
      const next = body[i + 1];
      if (unicode && (next === "p" || next === "P") && body[i + 2] === "{") {
        const end = body.indexOf("}", i + 3);
        if (end !== -1) {
          out += `\\${next}{${ignoreCaseProperty(body.slice(i + 3, end))}}`;
          i = end;
          continue;
        }
      }
      out += char + (next ?? "");
      i++;
      continue;
    }
    const to = body[i + 1] === "-" && i + 2 < body.length ? body[i + 2] : undefined;
    if (to !== undefined) {
      out += `${char}-${to}`;
      const folded = `${swapCase(char)}-${swapCase(to)}`;
      if (folded !== `${char}-${to}`) out += folded;
      i += 2;
      continue;
    }
    out += char;
    const other = swapCase(char);
    if (other !== char) out += other;
  }
  return `[${negated ? "^" : ""}${out}]`;
}

/** The character's other case, or the character itself when it has none. */
function swapCase(char: string): string {
  const lower = char.toLowerCase();
  const upper = char.toUpperCase();
  if (lower.length !== 1 || upper.length !== 1) return char;
  return char === lower ? upper : lower;
}

/**
 * Ruby spells a case-insensitive alternative inline as `(?i:...)`
 * (parameter_filter.rb:59) so one Regexp can carry both case-sensitive and
 * case-insensitive parts. JS has no inline flag group, so the same matching is
 * spelled case-sensitively by expanding each cased character to a `[aA]` class.
 *
 * Total, so `precompileFilters` emits one Regexp per group for every input
 * exactly as `Regexp.new(patterns.join("|"))` does (parameter_filter.rb:64-65).
 * The spans where a letter is not a pattern letter are copied verbatim: the
 * `<name>` of a named group (`(?<name>`, but not the lookbehinds `(?<=` /
 * `(?<!`) or of a named backreference (`\k<name>`). A character class and a
 * Unicode property escape expand under their own rules
 * ({@link ignoreCaseClass}, {@link ignoreCaseProperty}).
 */
function ignoreCaseSource(source: string, unicode: boolean): string {
  let out = "";
  for (let i = 0; i < source.length; i++) {
    const char = source[i];
    if (char === "\\") {
      const next = source[i + 1];
      if (unicode && (next === "p" || next === "P") && source[i + 2] === "{") {
        const end = source.indexOf("}", i + 3);
        if (end !== -1) {
          out += `\\${next}{${ignoreCaseProperty(source.slice(i + 3, end))}}`;
          i = end;
          continue;
        }
      }
      if (next === "k" && source[i + 2] === "<") {
        const end = source.indexOf(">", i + 3);
        if (end !== -1) {
          out += source.slice(i, end + 1);
          i = end;
          continue;
        }
      }
      out += char + (next ?? "");
      i++;
      continue;
    }
    if (char === "[") {
      const end = classEnd(source, i);
      out += ignoreCaseClass(source.slice(i, end + 1), unicode);
      i = end;
      continue;
    }
    if (source.startsWith("(?<", i) && source[i + 3] !== "=" && source[i + 3] !== "!") {
      const end = source.indexOf(">", i + 3);
      if (end !== -1) {
        out += source.slice(i, end + 1);
        i = end;
        continue;
      }
    }
    out += bothCases(char);
  }
  return out;
}

/** Mirrors Ruby's `Regexp.escape`, which JS has no built-in for. `-` is left
 *  alone: it is literal outside a character class in both languages, and `\-`
 *  is not a legal identity escape under a `u`-flagged JS Regexp, which
 *  {@link ParameterFilter.precompileFilters} can join an escaped string into. */
function escapeRegexp(source: string): string {
  return source.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Ruby's `value.is_a?(Hash)` — a plain object, not a class instance. */
function isHash(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object") return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}
