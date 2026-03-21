/**
 * ModelName — naming conventions for a model class.
 *
 * Mirrors: ActiveModel::Name
 */
import { underscore, pluralize, humanize } from "@rails-ts/activesupport";
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
    this.routeKey = this.plural;
    this.i18nKey = lower;
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
    const scope = typeof this._klass.i18nScope === "string" ? this._klass.i18nScope : "activemodel";
    return [scope, "models"];
  }
}
