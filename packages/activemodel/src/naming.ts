import {
  underscore,
  pluralize,
  singularize,
  humanize,
  tableize,
  demodulize,
  safeConstantize,
  isBlank,
  include,
  ToJsonWithActiveSupportEncoder,
  extended,
  type Included,
} from "@blazetrails/activesupport";
import { ArgumentError, TypeError } from "./attribute-assignment.js";

export interface Naming {
  readonly modelName: ModelName;
}

function modelName(this: NamingHost): ModelName {
  if (!Object.hasOwn(this, "_modelName") || !this._modelName) {
    const namespace = detectRelativeModelNamingParent(this);
    this._modelName = new ModelName(this as unknown as ModelLike, namespace);
  }
  return this._modelName;
}

/** @noRailsEquivalent CONVERGEABLE serializers-json-duplicates-model-name */
export function detectRelativeModelNamingParent(klass: {
  moduleName?: string;
}): { name: string } | null {
  const segments = (klass.moduleName ?? "").split("::").filter((segment) => segment !== "");
  while (segments.length > 0) {
    const parent = safeConstantize(segments.join("::")) as
      | { name: string; useRelativeModelNaming?: () => unknown }
      | null
      | undefined;
    const relative = parent?.useRelativeModelNaming?.();
    if (relative != null && relative !== false) return parent!;
    segments.pop();
  }
  return null;
}

function namingExtended(base: NamingHost): void {
  Object.defineProperty(base.prototype, "modelName", {
    get(this: object): ModelName {
      return (this.constructor as unknown as { modelName: ModelName }).modelName;
    },
    configurable: true,
  });
}

interface NamingHost {
  prototype: object;
  moduleName?: string;
  _modelName?: ModelName | null;
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

/** @internal */
const MISSING_TRANSLATION = -(2 ** 60);

interface ModulePath {
  readonly moduleName?: string;
}

export interface ModelLike {
  readonly name: string;
  readonly _demodulizedName?: string;
  i18nScope?: string;
  lookupAncestors?: () => Array<ModelLike & { modelName: ModelName }>;
  modelName?: ModelName;
}

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging -- Ruby `include` (json.rb:47-49); the class/interface merge is how `include()` surfaces on the type side.
export interface ModelName {
  toJSON: Included<typeof ToJsonWithActiveSupportEncoder>["toJSON"];
}
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class ModelName {
  name: string;

  singular: string;
  plural: string;
  element: string;
  collection: string;
  paramKey: string;
  routeKey: string;
  singularRouteKey: string;
  i18nKey: string;
  isUncountable: boolean;

  private _human: string;
  private _klass: ModelLike | null;
  private _unnamespaced?: string;

  get cacheKey(): string {
    return this.collection;
  }

  equals(other: unknown): boolean {
    if (other instanceof ModelName) return this.name === other.name;
    return this.name === other;
  }

  caseEquals(other: unknown): boolean {
    return this.equals(other);
  }

  compare(other: unknown): number | undefined {
    const name = other instanceof ModelName ? other.name : other;
    if (typeof name !== "string") return undefined;
    return this.name === name ? 0 : this.name < name ? -1 : 1;
  }

  eql(other: unknown): boolean {
    return typeof other === "string" && this.name === other;
  }

  match(pattern: unknown): boolean {
    if (typeof pattern === "string") pattern = new RegExp(pattern);
    if (!(pattern instanceof RegExp)) {
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

  toString(): string {
    return this.name;
  }

  /** @noRailsEquivalent PERMANENT */
  [Symbol.toPrimitive](_hint: string): string {
    return this.name;
  }

  asJson(_options?: unknown): string {
    return this.name;
  }

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

  /** @internal */
  _singularize(string: string): string {
    return underscore(string).replace(/\//g, "_");
  }

  /** @internal */
  i18nKeys(): string[] {
    if (this._cachedI18nKeys) return this._cachedI18nKeys;
    const keys =
      typeof this._klass?.lookupAncestors === "function"
        ? this._klass.lookupAncestors().map((k) => k.modelName.i18nKey)
        : [];
    this._cachedI18nKeys = keys;
    return keys;
  }

  /** @internal */
  private i18nScope(): string[] {
    const klassScope = this._klass?.i18nScope;
    return typeof klassScope === "string" ? [klassScope, "models"] : [];
  }

  private _cachedI18nKeys?: string[];
}

include(ModelName, ToJsonWithActiveSupportEncoder);

/** @noRailsEquivalent PERMANENT */
function builtinClassName(value: unknown): string {
  if (value === null || value === undefined) return "nil";
  if (typeof value === "boolean") return String(value);
  if (typeof value === "number") return Number.isInteger(value) ? "Integer" : "Float";
  if (typeof value === "bigint") return "Integer";
  return (value as { constructor?: { name?: string } })?.constructor?.name ?? typeof value;
}

for (const moduleFunction of Object.keys(Naming)) {
  Object.defineProperty(Naming, moduleFunction, {
    ...Object.getOwnPropertyDescriptor(Naming, moduleFunction)!,
    enumerable: false,
  });
}
Object.defineProperty(Naming, "modelName", {
  get: modelName,
  enumerable: true,
  configurable: true,
});
Object.defineProperty(Naming, extended, {
  value: namingExtended,
  enumerable: false,
  configurable: true,
});
