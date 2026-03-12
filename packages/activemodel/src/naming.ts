/**
 * ModelName — naming conventions for a model class.
 *
 * Mirrors: ActiveModel::Name
 */
import { underscore, pluralize } from "@rails-ts/activesupport";

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

  constructor(className: string, options?: { namespace?: string }) {
    this.name = className;
    this.namespace = options?.namespace ?? null;

    // Handle namespace separator (e.g., "Blog::Post" -> "post")
    const baseName = className.includes("::") ? className.split("::").pop()! : className;

    const lower = underscore(baseName);
    this.singular = lower;
    this.plural = ModelName._uncountables.has(lower) ? lower : pluralize(lower);
    this.element = lower;
    this.collection = this.plural;
    this.paramKey = lower;
    this.routeKey = this.plural;
    this.i18nKey = lower;
  }
}
