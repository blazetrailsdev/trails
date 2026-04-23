import { underscore, pluralize, singularize, humanize } from "@blazetrails/activesupport";
import { ArgumentError } from "./attribute-assignment.js";

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

  private static _uncountables: Set<string> = new Set([
    "sheep",
    "fish",
    "series",
    "species",
    "money",
    "rice",
  ]);

  static addUncountable(word: string): void {
    this._uncountables.add(word.toLowerCase());
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
