import {
  underscore,
  pluralize,
  singularize,
  humanize,
  tableize,
  demodulize,
  isBlank,
  include,
  ToJsonWithActiveSupportEncoder,
  type Included,
} from "@blazetrails/activesupport";
import { ArgumentError, TypeError } from "./attribute-assignment.js";

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
    | { toModel: () => unknown }
    | { constructor: { modelName: ModelName } };

  export function modelNameFromRecordOrClass(recordOrClass: RecordOrClass): ModelName {
    if (recordOrClass instanceof ModelName) return recordOrClass;
    // naming.rb:342-348 — a record that responds to `to_model` names itself
    // through the proxy that `to_model` returns, not through its own class.
    if ("toModel" in recordOrClass && typeof recordOrClass.toModel === "function") {
      const model = recordOrClass.toModel() as { modelName: ModelName };
      return model.modelName;
    }
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
    return modelNameFromRecordOrClass(recordOrClass).isUncountable;
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
import type { TranslateOptions } from "@blazetrails/i18n";

/** @internal Mirrors ActiveModel::Name::MISSING_TRANSLATION */
const MISSING_TRANSLATION = -(2 ** 60);

/**
 * The enclosing module path a Ruby `klass.name` already carries and a JS class
 * name does not; declared by the model, read only by `ModelName`'s constructor.
 */
interface ModulePath {
  readonly moduleName?: string;
}

export interface ModelLike {
  readonly name: string;
  /**
   * Rails-spelled bare constant name for a class whose JS name was flattened
   * to stay collision-free; stands in for Ruby's `klass.name.demodulize`.
   */
  readonly _demodulizedName?: string;
  i18nScope?: string;
  lookupAncestors?: () => Array<ModelLike & { modelName: ModelName }>;
  modelName?: ModelName;
}

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging -- Ruby `include` (json.rb:47-49); the class/interface merge is how `include()` surfaces on the type side.
export interface ModelName {
  /** `ActiveSupport::ToJsonWithActiveSupportEncoder#to_json` (json.rb:35-43). */
  toJSON: Included<typeof ToJsonWithActiveSupportEncoder>["toJSON"];
}
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class ModelName {
  /** Rails' `@name` — the fully-qualified constant path, e.g. `"Blog::Post"`. */
  name: string;

  /** Snake-cased identifier with namespace joined by `_` — `"blog_post"`. */
  singular: string;
  /** Pluralized `singular` — `"blog_posts"`. */
  plural: string;
  /** Snake-cased bare name only — `"post"`. */
  element: string;
  /** Path form — `"blog/posts"`. */
  collection: string;
  /**
   * URL / form param key — `singular`, or the prefix-dropped name when the
   * namespace is isolated (`useRelativeModelNaming`).
   */
  paramKey: string;
  /** Plural form of `paramKey` (plus `_index` for uncountables). */
  routeKey: string;
  /** Singular form of `routeKey`. */
  singularRouteKey: string;
  /** I18n key in path form — `"blog/post"`. */
  i18nKey: string;
  /** Mirrors `ActiveModel::Name#uncountable?` (naming.rb:209-211). */
  isUncountable: boolean;

  private _human: string;
  private _klass: ModelLike | null;
  private _unnamespaced?: string;

  get cacheKey(): string {
    return this.collection;
  }

  /**
   * Rails `delegate :==, to: :name` (naming.rb:151-152) — `String#==`. Ruby's
   * `String#==` returns `other == self` when `other` responds to `to_str`,
   * which is how two `Name`s compare equal (naming_test.rb:300).
   */
  equals(other: unknown): boolean {
    if (other instanceof ModelName) return this.name === other.name;
    return this.name === other;
  }

  /**
   * Rails `delegate :===, to: :name` (naming.rb:151-152) — `String#===`, which
   * Ruby aliases straight to `String#==` (string.c `rb_str_equal`), so this is
   * {@link ModelName#equals}. `caseEquals` is the settled trails spelling for
   * Ruby `===` (`Range#caseEquals`, `Date#caseEquals`).
   */
  caseEquals(other: unknown): boolean {
    return this.equals(other);
  }

  /**
   * Rails `delegate :<=>, to: :name` (naming.rb:151-152) — `String#<=>`, which
   * answers `nil` for an operand that is neither a String nor `to_str`-able
   * (naming.rb:50-62 documents the String-operand contract). `nil` is spelled
   * `undefined`, the repo's settled spelling for an incomparable spaceship
   * (`activerecord/src/core.ts`'s `compare`).
   *
   * `include Comparable` (naming.rb:10) builds the operators off it; TS has no
   * operator overloading, so call sites spell them `compare(...) < 0` etc.
   */
  compare(other: unknown): number | undefined {
    const name = other instanceof ModelName ? other.name : other;
    if (typeof name !== "string") return undefined;
    return this.name === name ? 0 : this.name < name ? -1 : 1;
  }

  /**
   * Rails `delegate :eql?, to: :name` (naming.rb:151-152) — `String#eql?`,
   * true when the operand is a String of the same content. Unlike
   * {@link ModelName#equals} it does NOT take `String#==`'s `to_str` arm
   * (string.c `rb_str_eql` checks the class first), so another `Name` is not
   * `eql?` to this one.
   */
  eql(other: unknown): boolean {
    return typeof other === "string" && this.name === other;
  }

  /**
   * Rails `delegate :match?, to: :name` (naming.rb:114-128, :151-152) —
   * `String#match?`, which takes a Regexp OR a String that Ruby compiles as
   * the pattern. Returns whether the class name matches (boolean — this is
   * `match?` semantic, not the integer position that Ruby `=~` returns).
   *
   * Preserves `pattern.lastIndex` so repeated calls with `/g` or `/y`
   * regexes stay stable — `RegExp.prototype.test` advances `lastIndex`
   * on stateful flags, but Ruby `match?` is stateless.
   *
   * Anything else raises the `TypeError` Ruby's `get_pat` raises (string.c
   * `rb_str_match_m_p` -> `get_pat`), not a trails-invented `ArgumentError`.
   */
  match(pattern: unknown): boolean {
    if (typeof pattern === "string") pattern = new RegExp(pattern);
    if (!(pattern instanceof RegExp)) {
      // Rule keys on the constructor name, so the ported mirror trips it too —
      // same suppression `calculations.ts` and `cache/store.ts` carry.
      // eslint-disable-next-line blazetrails/rails-error-parity
      throw new TypeError(`wrong argument type ${builtinClassName(pattern)} (expected Regexp)`);
    }
    const savedLastIndex = pattern.lastIndex;
    try {
      return pattern.test(this.name);
    } finally {
      pattern.lastIndex = savedLastIndex;
    }
  }

  /** Rails `delegate :to_s, :to_str, to: :name` (naming.rb:151-152). */
  toString(): string {
    return this.name;
  }

  /**
   * Implicit coercion hook so `String(mn)`, `` `${mn}` ``, `mn + ""` all work.
   *
   * @noRailsEquivalent PERMANENT — Ruby gets this from `Name`'s `to_str`; JS
   *   reads only `Symbol.toPrimitive` when coercing an object to a string
   */
  [Symbol.toPrimitive](_hint: string): string {
    return this.name;
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

  /**
   * Mirrors Rails `ActiveModel::Name#initialize` (naming.rb:166-185), same four
   * positional arguments: `(klass, namespace = nil, name = nil, locale = :en)`.
   *
   * Rails' `klass.name` is the fully-qualified constant path. A JS class name
   * carries no module path, so the qualified name is reassembled from the
   * `moduleName` / `_demodulizedName` carriers the model declares; `klass` also
   * accepts that qualified name as a bare string, for a `ModelName` built with
   * no host class to walk for I18n lookup.
   */
  constructor(
    klass: ModelLike | string,
    namespace: { name: string } | null = null,
    name: string | null = null,
    locale = "en",
  ) {
    const constant = typeof klass === "string" ? null : (klass as ModelLike & ModulePath);
    this.name =
      name ??
      (constant === null
        ? (klass as string)
        : constant.moduleName
          ? `${constant.moduleName}::${constant._demodulizedName ?? constant.name}`
          : (constant._demodulizedName ?? constant.name));

    if (isBlank(this.name))
      throw new ArgumentError(
        "Class name cannot be blank. You need to supply a name argument when anonymous class given",
      );

    if (namespace) {
      const prefix = `${namespace.name}::`;
      this._unnamespaced = this.name.startsWith(prefix)
        ? this.name.slice(prefix.length)
        : this.name;
    }
    this._klass = constant;
    this.singular = this._singularize(this.name);
    this.plural = pluralize(this.singular, locale);
    this.isUncountable = this.plural === this.singular;
    this.element = underscore(demodulize(this.name));
    this._human = humanize(this.element);
    this.collection = tableize(this.name);
    this.paramKey = namespace ? this._singularize(this._unnamespaced!) : this.singular;
    this.i18nKey = underscore(this.name);

    this.routeKey = namespace ? pluralize(this.paramKey, locale) : this.plural;
    this.singularRouteKey = singularize(this.routeKey, locale);
    if (this.isUncountable) this.routeKey += "_index";
  }

  human(options: TranslateOptions = {}): string {
    const i18nKeys = this.i18nKeys();
    const i18nScope = this.i18nScope();
    if (i18nKeys.length === 0 || i18nScope.length === 0) return this._human;

    const [key, ...defaults] = i18nKeys as unknown[];
    const defaultChain: unknown[] = defaults.map((k) => `:${k as string}`);
    if (options.default != null && options.default !== false) defaultChain.push(options.default);
    defaultChain.push(MISSING_TRANSLATION);

    let translation = I18n.translate(key as string, {
      scope: i18nScope,
      count: 1,
      ...options,
      default: defaultChain,
    });
    if (translation === MISSING_TRANSLATION) translation = this._human;
    return translation as string;
  }

  /**
   * Flatten a class name into the singular `_`-joined form. Mirrors
   * Rails `_singularize` (activemodel/lib/active_model/naming.rb:216-218):
   * `ActiveSupport::Inflector.underscore(string).tr("/", "_")`.
   *
   * @internal Rails-private helper.
   */
  _singularize(string: string): string {
    return underscore(string).replace(/\//g, "_");
  }

  /**
   * Lazy list of i18n lookup keys for this model and its ancestors.
   * Mirrors Rails `i18n_keys` (activemodel/lib/active_model/naming.rb:220-226).
   *
   * @internal Rails-private helper.
   */
  i18nKeys(): string[] {
    if (this._cachedI18nKeys) return this._cachedI18nKeys;
    const keys =
      typeof this._klass?.lookupAncestors === "function"
        ? this._klass.lookupAncestors().map((k) => k.modelName.i18nKey)
        : [];
    this._cachedI18nKeys = keys;
    return keys;
  }

  /**
   * Mirrors Rails `i18n_scope` (activemodel/lib/active_model/naming.rb:228-230).
   * `respond_to?(:i18n_scope)` is a `typeof` check because the trails
   * counterpart is a property, not a method.
   *
   * @internal Rails-private helper.
   */
  private i18nScope(): string[] {
    const klassScope = this._klass?.i18nScope;
    return typeof klassScope === "string" ? [klassScope, "models"] : [];
  }

  private _cachedI18nKeys?: string[];
}

include(ModelName, ToJsonWithActiveSupportEncoder);

/**
 * The JS spelling of MRI's `rb_builtin_class_name`, which is what `get_pat`
 * (string.c) interpolates into `wrong argument type %s (expected Regexp)`:
 * `nil` / `true` / `false` for the special constants, the class name
 * otherwise. JS has one numeric type where Ruby has two, so an integral
 * `number` reports `Integer` and a fractional one `Float`, as MRI does.
 *
 * @noRailsEquivalent Module-private message helper for `ModelName#match`'s
 *   ported `TypeError`; Ruby gets the class name from the object itself.
 */
function builtinClassName(value: unknown): string {
  if (value === null || value === undefined) return "nil";
  if (typeof value === "boolean") return String(value);
  if (typeof value === "number") return Number.isInteger(value) ? "Integer" : "Float";
  if (typeof value === "bigint") return "Integer";
  return (value as { constructor?: { name?: string } })?.constructor?.name ?? typeof value;
}
