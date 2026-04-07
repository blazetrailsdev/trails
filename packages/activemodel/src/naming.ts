import { underscore, pluralize, humanize } from "@blazetrails/activesupport";

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
    return modelNameFromRecordOrClass(recordOrClass).singular;
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
  readonly name: string;
  readonly singular: string;
  readonly plural: string;
  readonly element: string;
  readonly collection: string;
  readonly paramKey: string;
  readonly routeKey: string;
  readonly i18nKey: string;
  readonly namespace: string | null;

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

  constructor(className: string, options?: { namespace?: string; klass?: ModelLike }) {
    this.name = className;
    this.namespace = options?.namespace ?? null;
    this._klass = options?.klass ?? null;

    // Handle namespace separator (e.g., "Blog::Post" -> "post")
    const baseName = className.includes("::") ? className.split("::").pop()! : className;

    const lower = underscore(baseName);
    this.singular = lower;
    this.plural = ModelName._uncountables.has(lower) ? lower : pluralize(lower);
    this.element = lower;
    this._humanFallback = humanize(lower);
    this.collection = this.plural;
    this.paramKey = lower;
    // Rails: uncountable nouns get _index suffix on route_key
    this.routeKey = this.singular === this.plural ? `${this.plural}_index` : this.plural;
    this.i18nKey = lower;
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

/**
 * Mirrors: ActiveModel::Name
 *
 * Inherits from ModelName — matches the Rails class name exactly.
 * ModelName remains the primary export for backwards compatibility.
 */
export class Name extends ModelName {}
