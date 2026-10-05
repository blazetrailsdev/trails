import {
  except,
  flatten,
  hasKey,
  last,
  merge,
  mergeBang,
  rbArray,
  rbObjDup,
  rbObjRespondTo,
  rbStrSend,
  slice,
  toS,
} from "@blazetrails/ruby-compat";

import {
  any,
  classify,
  demodulize,
  isAnonymous,
  isPlainObject,
  safeConstantize,
  singularize,
  underscore,
} from "@blazetrails/activesupport";

import { ParseError } from "../../action-dispatch/http/parameters.js";

/** @internal */
export const EXCLUDE_PARAMETERS = ["authenticity_token", "_method", "utf8"];

export class Options {
  private _name: string | null;
  format: string[];
  private _include: string[] | null;
  exclude: string[] | null;
  klass: WrapperHostClass | null;
  private _model: unknown;
  private includeSet: boolean;
  private nameSet: boolean;

  static fromHash(hash: Record<string, unknown>): Options {
    const name = (hash.name ?? null) as string | null;
    const format = rbArray(hash.format) as string[];
    const include =
      hash.include != null && hash.include !== false
        ? rbArray(hash.include).map((attr) => toS(attr))
        : null;
    const exclude =
      hash.exclude != null && hash.exclude !== false
        ? rbArray(hash.exclude).map((attr) => toS(attr))
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
    this._name = name;
    this.format = format;
    this._include = include;
    this.exclude = exclude;
    this.klass = klass;
    this._model = model;
    this.includeSet = include != null;
    this.nameSet = name != null;
  }

  get model(): unknown {
    return this._model ?? (this.model = this._defaultWrapModel());
  }

  set model(model: unknown) {
    this._model = model;
  }

  get include(): string[] | null {
    if (this.includeSet) return this._include;

    const m = this.model as WrapModel | null;
    this.includeSet = true;

    if (!(this._include != null || this.exclude != null)) {
      if (rbObjRespondTo(m, "attributeNames") && any(m!.attributeNames!())) {
        this.include = m!.attributeNames!();

        if (
          rbObjRespondTo(m, "storedAttributes") &&
          Object.keys(m!.storedAttributes!()).length > 0
        ) {
          this.include = this._include!.concat(
            flatten(Object.values(m!.storedAttributes!())).map((attr) => toS(attr)),
          );
        }

        if (rbObjRespondTo(m, "attributeAliases") && any(Object.keys(m!.attributeAliases!()))) {
          this.include = this._include!.concat(Object.keys(m!.attributeAliases!()));
        }

        if (
          rbObjRespondTo(m, "nestedAttributesOptions") &&
          any(Object.keys(m!.nestedAttributesOptions!()))
        ) {
          this.include = this._include!.concat(
            Object.keys(m!.nestedAttributesOptions!()).map((key) => toS(key).concat("_attributes")),
          );
        }

        return this._include;
      }
    }
    return null;
  }

  set include(include: string[] | null) {
    this._include = include;
  }

  get name(): string | null {
    if (this.nameSet) return this._name;

    const m = this.model as WrapModel | null;
    this.nameSet = true;

    if (!(this._name != null || isAnonymous(this.klass!))) {
      return (this.name =
        m != null ? underscore(demodulize(toS(m))) : singularize(this.klass!.controllerName()!));
    }
    return null;
  }

  set name(name: string | null) {
    this._name = name;
  }

  /** @noRailsEquivalent CONVERGEABLE params-wrapper-options-is-not-a-struct */
  toH(): Record<string, unknown> {
    return {
      name: this._name,
      format: this.format,
      include: this._include,
      exclude: this.exclude,
      klass: this.klass,
      model: this._model,
    };
  }

  private _defaultWrapModel(): unknown {
    if (isAnonymous(this.klass!)) return null;
    let modelName = classify(
      rbStrSend(this.klass!.name, "deleteSuffix", "Controller")[0] as string,
    );
    let modelKlass: unknown;

    do {
      if ((modelKlass = safeConstantize(modelName) ?? null) != null) {
        break;
      } else {
        const namespaces = modelName.split("::");
        if (namespaces.length >= 2) namespaces.splice(-2, 1);
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
  return { [_wrapperKey.call(this)!]: _extractParameters.call(this, parameters) };
}

/** @internal */
export function _wrapperEnabled(this: ParamsWrapperHost): boolean {
  try {
    if (!this.request.hasContentType()) return false;

    const ref = this.request.contentMimeType!.ref();

    return (
      _wrapperFormats.call(this).includes(ref!) &&
      _wrapperKey.call(this) != null &&
      !hasKey(this.request.parameters, _wrapperKey.call(this)!)
    );
  } catch (err) {
    if (err instanceof ParseError) return false;
    throw err;
  }
}

/** @internal */
export function _performParameterWrapping(this: ParamsWrapperHost): void {
  const wrappedHash = _wrapParameters.call(this, this.request.requestParameters);
  const wrappedKeys = Object.keys(this.request.requestParameters);
  const wrappedFilteredHash = _wrapParameters.call(
    this,
    slice(this.request.filteredParameters(), ...wrappedKeys),
  );

  mergeBang(this.request.parameters, wrappedHash);
  mergeBang(this.request.requestParameters, wrappedHash);

  mergeBang(this.request.filteredParameters(), wrappedFilteredHash);
}
