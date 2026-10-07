import {
  deleteAt,
  except,
  flatten,
  hasKey,
  last,
  merge,
  mergeBang,
  rbFArray,
  rbObjDup,
  rbObjRespondTo,
  rbStrSend,
  slice,
  Struct,
  toS,
} from "@blazetrails/ruby-compat";

import {
  Concern,
  Module,
  any,
  classify,
  demodulize,
  extend,
  isAnonymous,
  isPlainObject,
  safeConstantize,
  singularize,
  underscore,
} from "@blazetrails/activesupport";

import { ParseError } from "../../action-dispatch/http/parameters.js";

/** @internal */
export const EXCLUDE_PARAMETERS = ["authenticity_token", "_method", "utf8"];

export class Options extends Struct.new("name", "format", "include", "exclude", "klass", "model") {
  declare format: string[];
  declare exclude: string[] | null;
  declare klass: WrapperHostClass | null;
  private includeSet: boolean;
  private nameSet: boolean;

  static fromHash(hash: Record<string, unknown>): Options {
    const name = (hash.name ?? null) as string | null;
    const format = rbFArray(hash.format) as string[];
    const include =
      hash.include != null && hash.include !== false
        ? rbFArray(hash.include).map((attr) => toS(attr))
        : null;
    const exclude =
      hash.exclude != null && hash.exclude !== false
        ? rbFArray(hash.exclude).map((attr) => toS(attr))
        : null;
    return new Options(name, format, include, exclude, null, null);
  }

  constructor(
    name: string | null,
    format: string[],
    include: string[] | null,
    exclude: string[] | null,
    klass: WrapperHostClass | null,
    model: unknown,
  ) {
    super(name, format, include, exclude, klass, model);
    this.includeSet = include != null;
    this.nameSet = name != null;
  }

  get model(): unknown {
    return super.model ?? (this.model = this._defaultWrapModel());
  }

  set model(model: unknown) {
    super.model = model;
  }

  get include(): string[] | null {
    if (this.includeSet) return super.include as string[] | null;

    const m = this.model as WrapModel | null;
    this.includeSet = true;

    if (!(super.include != null || this.exclude != null)) {
      if (rbObjRespondTo(m, "attributeNames") && any(m!.attributeNames!())) {
        this.include = m!.attributeNames!();

        if (
          rbObjRespondTo(m, "storedAttributes") &&
          Object.keys(m!.storedAttributes!()).length > 0
        ) {
          this.include = this.include.concat(
            flatten(Object.values(m!.storedAttributes!())).map((attr) => toS(attr)),
          );
        }

        if (rbObjRespondTo(m, "attributeAliases") && any(Object.keys(m!.attributeAliases!()))) {
          this.include = this.include.concat(Object.keys(m!.attributeAliases!()));
        }

        if (
          rbObjRespondTo(m, "nestedAttributesOptions") &&
          any(Object.keys(m!.nestedAttributesOptions!()))
        ) {
          this.include = this.include.concat(
            Object.keys(m!.nestedAttributesOptions!()).map((key) => toS(key).concat("_attributes")),
          );
        }

        return this.include;
      }
    }
    return null;
  }

  set include(include: string[] | null) {
    super.include = include;
  }

  get name(): string | null {
    if (this.nameSet) return super.name as string | null;

    const m = this.model as WrapModel | null;
    this.nameSet = true;

    if (!(super.name != null || isAnonymous(this.klass!))) {
      return (this.name =
        m != null ? underscore(demodulize(toS(m))) : singularize(this.klass!.controllerName()!));
    }
    return null;
  }

  set name(name: string | null) {
    super.name = name;
  }

  private _defaultWrapModel(): unknown {
    if (isAnonymous(this.klass!)) return null;
    let modelName = classify(
      rbStrSend(this.klass!.name, "deleteSuffix", "Controller")[0] as string,
    );
    let modelKlass: unknown;

    do {
      if ((modelKlass = safeConstantize(modelName) ?? null) != null) {
        void modelKlass;
      } else {
        const namespaces = modelName.split("::");
        deleteAt(namespaces, -2);
        if (last(namespaces) === modelName) break;
        modelName = namespaces.join("::");
      }
    } while (modelKlass == null);

    return modelKlass;
  }
}

/** @internal */
export interface WrapModel {
  attributeNames?(): string[];
  storedAttributes?(): Record<string, unknown[]>;
  attributeAliases?(): Record<string, unknown>;
  nestedAttributesOptions?(): Record<string, unknown>;
}

/** @internal */
export interface ParamsWrapperHost {
  request: {
    hasContentType(): boolean;
    contentMimeType: { ref(): string | null } | null;
    requestParameters: Record<string, unknown>;
    filteredParameters(): Record<string, unknown>;
    parameters: Record<string, unknown>;
  };
  _wrapperOptions: Options;
  _wrapperKey(): string | null;
  _wrapperFormats(): string[];
  _wrapParameters(parameters: Record<string, unknown>): Record<string, unknown>;
  _extractParameters(parameters: Record<string, unknown>): Record<string, unknown>;
  _wrapperEnabled(): boolean;
  _performParameterWrapping(): void;
}

/** @internal */
export interface WrapperHostClass {
  name: string;
  controllerName(): string | null;
  _wrapperOptions: Options;
}

/** @internal */
export function _setWrapperOptions(
  this: { _wrapperOptions: Options },
  options: Record<string, unknown>,
): void {
  this._wrapperOptions = Options.fromHash(options);
}

export function wrapParameters(
  this: WrapperHostClass,
  nameOrModelOrOptions: unknown,
  options: Record<string, unknown> = {},
): void {
  let model: unknown = null;

  if (isPlainObject(nameOrModelOrOptions)) {
    options = nameOrModelOrOptions as Record<string, unknown>;
  } else if (nameOrModelOrOptions === false) {
    options = merge(options, { format: [] });
  } else if (typeof nameOrModelOrOptions === "string") {
    options = merge(options, { name: nameOrModelOrOptions });
  } else {
    model = nameOrModelOrOptions;
  }

  const opts = Options.fromHash(merge(slice(this._wrapperOptions.toH(), "format"), options));
  opts.model = model;
  opts.klass = this;

  this._wrapperOptions = opts;
}

/** @internal */
export function inheritedParamsWrapper(this: WrapperHostClass): void {
  if (any(this._wrapperOptions.format)) {
    const params = rbObjDup(this._wrapperOptions);
    params.klass = this;
    this._wrapperOptions = params;
  }
}

const INHERITED = Symbol("inherited");

/**
 * @internal
 * @noRailsEquivalent PERMANENT
 */
export function deferInherited(this: WrapperHostClass): void {
  const wrapperOptions = Object.getOwnPropertyDescriptor(this, "_wrapperOptions")!;
  Object.defineProperty(this, "_wrapperOptions", {
    ...wrapperOptions,
    get(this: WrapperHostClass) {
      if (
        !Object.prototype.hasOwnProperty.call(this, "_wrapperOptions") &&
        !Object.prototype.hasOwnProperty.call(this, INHERITED)
      ) {
        Object.defineProperty(this, INHERITED, { value: true });
        inheritedParamsWrapper.call(this);
      }
      return wrapperOptions.get!.call(this);
    },
  });
}

/** @internal */
export async function processAction(this: ParamsWrapperHost, ...args: unknown[]): Promise<unknown> {
  if (this._wrapperEnabled()) this._performParameterWrapping();
  return await ParamsWrapper.superMethod(this, "processAction")!(...args);
}

/** @internal */
export function _wrapperKey(this: ParamsWrapperHost): string | null {
  return this._wrapperOptions.name;
}

/** @internal */
export function _wrapperFormats(this: ParamsWrapperHost): string[] {
  return this._wrapperOptions.format;
}

/** @internal */
export function _extractParameters(
  this: ParamsWrapperHost,
  parameters: Record<string, unknown>,
): Record<string, unknown> {
  const includeOnly = this._wrapperOptions.include;
  if (includeOnly != null) {
    return slice(parameters, ...includeOnly);
  } else if (this._wrapperOptions.exclude != null) {
    const exclude = this._wrapperOptions.exclude.concat(EXCLUDE_PARAMETERS);
    return except(parameters, ...exclude);
  } else {
    return except(parameters, ...EXCLUDE_PARAMETERS);
  }
}

/** @internal */
export function _wrapParameters(
  this: ParamsWrapperHost,
  parameters: Record<string, unknown>,
): Record<string, unknown> {
  return { [this._wrapperKey()!]: this._extractParameters(parameters) };
}

/** @internal */
export function _wrapperEnabled(this: ParamsWrapperHost): boolean {
  try {
    if (!this.request.hasContentType()) return false;

    const ref = this.request.contentMimeType!.ref();

    return (
      this._wrapperFormats().includes(ref!) &&
      this._wrapperKey() != null &&
      !hasKey(this.request.parameters, this._wrapperKey()!)
    );
  } catch (err) {
    if (err instanceof ParseError) return false;
    throw err;
  }
}

/** @internal */
export function _performParameterWrapping(this: ParamsWrapperHost): void {
  const wrappedHash = this._wrapParameters(this.request.requestParameters);
  const wrappedKeys = Object.keys(this.request.requestParameters);
  const wrappedFilteredHash = this._wrapParameters(
    slice(this.request.filteredParameters(), ...wrappedKeys),
  );

  mergeBang(this.request.parameters, wrappedHash);
  mergeBang(this.request.requestParameters, wrappedHash);

  mergeBang(this.request.filteredParameters(), wrappedFilteredHash);
}

export const ParamsWrapper: Module = new Module((mod) => {
  extend(mod, Concern);

  mod.defineMethod("processAction", processAction);
  mod.defineMethod("_wrapperKey", _wrapperKey);
  mod.defineMethod("_wrapperFormats", _wrapperFormats);
  mod.defineMethod("_wrapParameters", _wrapParameters);
  mod.defineMethod("_extractParameters", _extractParameters);
  mod.defineMethod("_wrapperEnabled", _wrapperEnabled);
  mod.defineMethod("_performParameterWrapping", _performParameterWrapping);
});
