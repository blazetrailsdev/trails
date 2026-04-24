import {
  underscore,
  pluralize,
  singularize,
  humanize,
  Inflections,
} from "@blazetrails/activesupport";
import { ArgumentError } from "./attribute-assignment.js";

function sameSegments(a: readonly string[] | null, b: readonly string[] | null): boolean {
  if (a === b) return true;
  if (a == null || b == null) return false;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

/**
 * Naming mixin — provides model_name on classes and naming helpers.
 *
 * Mirrors: ActiveModel::Naming
 */
export interface Naming {
  readonly modelName: ModelName;
}

// eslint-disable-next-line @typescript-eslint/no-namespace
export namespace Naming {
  type RecordOrClass =
    | ModelName
    | { modelName: ModelName }
    | { constructor: { modelName: ModelName } };

  export function modelNameFromRecordOrClass(recordOrClass: RecordOrClass): ModelName {
    if (recordOrClass instanceof ModelName) return recordOrClass;
    if ("modelName" in recordOrClass) return recordOrClass.modelName;
    return (recordOrClass.constructor as { modelName: ModelName }).modelName;
  }

  export function plural(recordOrClass: RecordOrClass): string {
    return modelNameFromRecordOrClass(recordOrClass).plural;
  }

  export function singular(recordOrClass: RecordOrClass): string {
    return modelNameFromRecordOrClass(recordOrClass).singular;
  }

  export function isUncountable(recordOrClass: RecordOrClass): boolean {
    const mn = modelNameFromRecordOrClass(recordOrClass);
    return mn.singular === mn.plural;
  }

  export function singularRouteKey(recordOrClass: RecordOrClass): string {
    return modelNameFromRecordOrClass(recordOrClass).singularRouteKey;
  }

  export function routeKey(recordOrClass: RecordOrClass): string {
    return modelNameFromRecordOrClass(recordOrClass).routeKey;
  }

  export function paramKey(recordOrClass: RecordOrClass): string {
    return modelNameFromRecordOrClass(recordOrClass).paramKey;
  }
}
import { I18n } from "./i18n.js";

interface ModelLike {
  readonly name: string;
  i18nScope?: string;
  lookupAncestors?: () => ModelLike[];
  modelName?: ModelName;
}

export class ModelName {
  /** Bare class name (no separators), e.g. `"Post"`. */
  readonly name: string;
  /** Namespace segments from outermost to innermost; `null` if top-level. */
  readonly namespace: readonly string[] | null;

  /** Snake-cased identifier with namespace joined by `_` — `"blog_post"`. */
  readonly singular: string;
  /** Pluralized `singular` — `"blog_posts"`. */
  readonly plural: string;
  /** Snake-cased bare name only — `"post"`. */
  readonly element: string;
  /** Path form — `"blog/posts"`. */
  readonly collection: string;
  /**
   * URL / form param key. Drops the namespace prefix — matches Rails'
   * isolated-namespace `param_key = _singularize(@unnamespaced)` semantic.
   */
  readonly paramKey: string;
  /** Plural form of `paramKey` (plus `_index` for uncountables). */
  readonly routeKey: string;
  /** Singular form of `routeKey`. */
  readonly singularRouteKey: string;
  /** I18n key in path form — `"blog/post"`. */
  readonly i18nKey: string;

  private _humanFallback: string;
  private _klass: ModelLike | null;

  // Uncountable lookup delegates to `@blazetrails/activesupport`'s
  // `Inflections.instance("en")` — the same store Rails models go
  // through via `ActiveSupport::Inflector.inflections { |i| i.uncountable ... }`
  // (activesupport/lib/active_support/inflections.rb). Previously we
  // maintained a local 6-word set that ignored user-added inflections
  // and diverged from activesupport's own pluralize() which uses the
  // shared store.
  private static get _uncountables(): Set<string> {
    return Inflections.instance("en").uncountables;
  }

  /**
   * Register an uncountable word. Mirrors Rails
   * `ActiveSupport::Inflector.inflections.uncountable(word)` — writes
   * through to the shared inflector store so `pluralize("sheep")`,
   * `ModelName`, and every other inflection consumer see it.
   */
  static addUncountable(word: string): void {
    Inflections.instance("en").uncountable(word);
  }

  /**
   * Construct a ModelName.
   *
   * `name` must be a bare class identifier. The Ruby `::` separator has no
   * JavaScript equivalent, so namespace membership is declared explicitly
   * via `options.namespace` — either a single string (`"Blog"`), a segment
   * array for arbitrary nesting (`["Admin", "Blog"]`), or a module-like
   * object with a string `name` field (`{ name: "Blog" }`, Rails-porting
   * ergonomics). `klass` lets the human-name / I18n lookup walk the class's
   * ancestors.
   *
   * Field math follows Rails' `ActiveModel::Name#initialize`
   * (activemodel/lib/active_model/naming.rb:166-185) but operates on the
   * namespace segments directly rather than round-tripping through a
   * Ruby-shaped `::`-joined string — equivalent output, no Ruby-ism in
   * TS code.
   */
  constructor(
    name: string,
    options?: {
      namespace?: string | readonly string[] | { name: string };
      klass?: ModelLike;
    },
  ) {
    this._klass = options?.klass ?? null;
    const rawNs = options?.namespace ?? null;
    const invalidNamespace = (): ArgumentError =>
      new ArgumentError(
        "options.namespace must be a non-blank string, an array of non-blank strings, or an object with a non-blank string `name`",
      );
    let segments: string[];
    if (rawNs == null) {
      segments = [];
    } else if (typeof rawNs === "string") {
      segments = [rawNs];
    } else if (Array.isArray(rawNs)) {
      if (!rawNs.every((s) => typeof s === "string")) throw invalidNamespace();
      segments = [...rawNs];
    } else if (
      typeof rawNs === "object" &&
      typeof (rawNs as { name?: unknown }).name === "string"
    ) {
      segments = [(rawNs as { name: string }).name];
    } else {
      throw invalidNamespace();
    }
    // Trim + reject blank segments. `underscore("")` and `underscore(" ")`
    // leak through as empty / whitespace tails, which would produce invalid
    // identifiers in `singular`, `collection`, `i18nKey`.
    segments = segments.map((s) => s.trim());
    if (segments.some((s) => s.length === 0)) throw invalidNamespace();

    // Rails' `@name.blank?` guard — anonymous class without an explicit name.
    if (!name || !name.trim()) {
      throw new ArgumentError(
        "Class name cannot be blank. You need to supply a name argument when anonymous class given",
      );
    }
    // Reject Ruby-style separators. TS classes don't carry `::` in their
    // `.name`, so presence here means a caller pasted a Ruby-shaped
    // string — point them at the right option.
    const hasRubySeparator = (s: string): boolean => s.includes("::");
    if (hasRubySeparator(name) || segments.some(hasRubySeparator)) {
      throw new ArgumentError(
        'ModelName arguments must not contain "::" — pass namespace segments as options.namespace (string, string[], or { name: string })',
      );
    }

    this.name = name;
    this.namespace = segments.length > 0 ? Object.freeze([...segments]) : null;

    const bareUnderscored = underscore(name);
    const segmentsUnderscored = segments.map(underscore);

    // Rails `@singular = _singularize(@name)` flattens the path separator
    // to `_`; the segments-join is the exact equivalent.
    this.singular = [...segmentsUnderscored, bareUnderscored].join("_");
    // Rails `@plural = pluralize(@singular)`.
    this.plural = ModelName._uncountables.has(this.singular)
      ? this.singular
      : pluralize(this.singular);
    const uncountable = this.plural === this.singular;
    // Rails `@element = underscore(demodulize(@name))` — bare name only.
    this.element = bareUnderscored;
    this._humanFallback = humanize(this.element);
    // Rails `@collection = tableize(@name)` — path form, last segment
    // pluralized. Derive the last segment from `this.plural` (rather than
    // pluralizing the bare name independently) so any uncountable decision
    // made above — via `ModelName._uncountables` or via activesupport's
    // Inflector — applies identically here.
    let collectionTail: string;
    if (segmentsUnderscored.length === 0) {
      collectionTail = this.plural;
    } else {
      const prefix = `${segmentsUnderscored.join("_")}_`;
      collectionTail = this.plural.startsWith(prefix)
        ? this.plural.slice(prefix.length)
        : pluralize(bareUnderscored);
    }
    this.collection = [...segmentsUnderscored, collectionTail].join("/");
    // Rails `@param_key = namespace ? _singularize(@unnamespaced) : @singular`.
    // In TS we require an explicit namespace, so the isolated shape is the
    // only one expressible — `paramKey` drops the prefix when present.
    this.paramKey = segments.length > 0 ? this.element : this.singular;
    // Rails `@i18n_key = @name.underscore.to_sym` — path form with bare name.
    this.i18nKey = [...segmentsUnderscored, bareUnderscored].join("/");
    // Rails `@route_key = namespace ? pluralize(@param_key) : @plural.dup`.
    let routeKey = segments.length > 0 ? pluralize(this.paramKey) : this.plural;
    if (uncountable) routeKey = `${routeKey}_index`;
    this.routeKey = routeKey;
    this.singularRouteKey = singularize(this.routeKey);
  }

  get cacheKey(): string {
    return this.collection;
  }

  // ---------------------------------------------------------------------------
  // String-ness — Rails `ActiveModel::Name < String` (naming.rb:10, :151-152):
  //   include Comparable
  //   delegate :==, :===, :<=>, :=~, :"!~", :eql?, :match?, :to_s,
  //            :to_str, :as_json, to: :name
  //
  // JS can't overload operators, so we expose methods + the one coercion
  // hook JS does have: `Symbol.toPrimitive`. That covers IMPLICIT string
  // coercion only — `String(modelName)`, template literals, `modelName +
  // ""`, and loose `==` against a string. It does NOT trigger on strict
  // `===` / `Object.is` / matchers that use strict identity without
  // coercion; for those, callers use `mn.name` or `mn.equals(other)`.
  // ---------------------------------------------------------------------------

  /**
   * Mirrors Rails `to_s` / `to_str` delegated to `@name`
   * (naming.rb:131-152). Rails' `@name` is the full constant path
   * (`"Blog::Post"`). TS has no `::` constant syntax and we
   * deliberately reject `::` at the input boundary (see constructor),
   * so `toString` returns the bare identifier (`"Post"`). Two
   * instances with the same bare name but different namespaces will
   * coerce to the same string — callers that care about namespaced
   * identity should use `.equals(other)` / `.compare(other)` (which
   * compare the full name + namespace identity) or read `.namespace`
   * directly.
   */
  toString(): string {
    return this.name;
  }

  /** Implicit coercion hook so `String(mn)`, `"${mn}"`, `mn + ""` all work. */
  [Symbol.toPrimitive](_hint: string): string {
    return this.name;
  }

  /**
   * Mirrors Rails `@name == other` (String#==). When comparing to
   * another `ModelName`, both the bare name AND namespace segments
   * must match — so `ModelName("Post")` and
   * `ModelName("Post", { namespace: "Blog" })` are NOT equal. When
   * comparing to a string, only `.name` is matched (a plain string
   * can't express a namespace).
   */
  equals(other: unknown): boolean {
    if (other instanceof ModelName) {
      if (this.name !== other.name) return false;
      return sameSegments(this.namespace, other.namespace);
    }
    return typeof other === "string" && this.name === other;
  }

  /**
   * Mirrors Rails `@name <=> other` (String#<=>). Returns `-1`, `0`,
   * or `1`. Throws `ArgumentError` for non-string / non-ModelName
   * arguments. For ModelName-to-ModelName, compares the full
   * identity (name + namespace) so namespace-differing models sort
   * distinctly; for ModelName-to-string, compares `.name` only.
   */
  compare(other: unknown): -1 | 0 | 1 {
    if (other instanceof ModelName) {
      // Single string compare over the full constant path — matches
      // Rails' `String#<=>` on `@name` (e.g. "Admin::Other" < "Blog::Post"
      // by first segment, regardless of bare-name ordering). We join
      // with `/` (not `::`) to keep Ruby syntax out of TS code.
      const l = ModelName._qualified(this);
      const r = ModelName._qualified(other);
      if (l === r) return 0;
      return l < r ? -1 : 1;
    }
    if (typeof other === "string") {
      if (this.name === other) return 0;
      return this.name < other ? -1 : 1;
    }
    throw new ArgumentError("comparison of ModelName with non-string failed");
  }

  private static _qualified(mn: ModelName): string {
    return [...(mn.namespace ?? []), mn.name].join("/");
  }

  /**
   * Mirrors Rails `@name.match?(regexp)`. Returns whether the class
   * name matches the given regex (boolean — this is `match?` semantic,
   * not the integer position that Ruby `=~` returns).
   *
   * Preserves `pattern.lastIndex` so repeated calls with `/g` or `/y`
   * regexes stay stable — `RegExp.prototype.test` advances `lastIndex`
   * on stateful flags, but Ruby `match?` is stateless.
   */
  match(pattern: unknown): boolean {
    if (!(pattern instanceof RegExp)) {
      throw new ArgumentError("ModelName#match requires a RegExp");
    }
    const savedLastIndex = pattern.lastIndex;
    try {
      return pattern.test(this.name);
    } finally {
      pattern.lastIndex = savedLastIndex;
    }
  }

  /**
   * Mirrors Rails `@name.as_json` — `String#as_json` just returns the
   * string (and accepts an ignored `options` Hash). Returns `this.name`
   * as-is; accepts (but ignores) an options argument so callers match
   * Rails' signature and the rest of this codebase's `asJson(options?)`
   * conventions. Lets `JSON.stringify(mn)` emit the plain class name
   * rather than `{}` / the object form.
   */
  asJson(_options?: unknown): string {
    return this.name;
  }

  /** JSON.stringify hook — delegates to `asJson`. */
  toJSON(): string {
    return this.asJson();
  }

  get human(): string {
    if (!this._klass) return this._humanFallback;

    const i18nKeys = this._i18nKeys();
    const i18nScope = this._i18nScope();
    if (i18nKeys.length === 0 || i18nScope.length === 0) return this._humanFallback;

    const [primaryKey, ...restKeys] = i18nKeys;
    const scopePrefix = i18nScope.join(".");
    const fullKey = `${scopePrefix}.${primaryKey}`;

    const defaults: Array<{ key: string } | { message: string }> = restKeys.map((k) => ({
      key: `${scopePrefix}.${k}`,
    }));
    defaults.push({ message: this._humanFallback });

    return I18n.t(fullKey, { defaults });
  }

  private _i18nKeys(): string[] {
    if (!this._klass) return [];
    if (typeof this._klass.lookupAncestors === "function") {
      return this._klass.lookupAncestors().map((k) => {
        if (k.modelName) return k.modelName.i18nKey;
        return underscore(k.name);
      });
    }
    return [this.i18nKey];
  }

  private _i18nScope(): string[] {
    if (!this._klass) return [];
    const klassScope = this._klass.i18nScope;
    const scope = typeof klassScope === "string" ? klassScope : "activemodel";
    return [scope, "models"];
  }
}
