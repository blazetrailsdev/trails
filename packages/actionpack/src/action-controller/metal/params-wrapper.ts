/**
 * ActionController::ParamsWrapper::Options + private mixin methods
 *
 * Configuration data container for parameter wrapping plus the
 * controller-instance mixin functions that perform the wrapping at
 * `process_action` time. Mirrors `metal/params_wrapper.rb`.
 * @see https://api.rubyonrails.org/classes/ActionController/ParamsWrapper.html
 */

import { demodulize, singularize, underscore } from "@blazetrails/activesupport";

import { ParseError } from "../../action-dispatch/http/parameters.js";

/** @internal */
export const EXCLUDE_PARAMETERS = ["authenticity_token", "_method", "utf8"];

export class Options {
  name: string | null;
  format: string[] | null;
  include: string[] | null;
  exclude: string[] | null;
  klass: unknown;
  model: unknown;
  /**
   * Tracks whether `name` was explicitly provided (mirrors Rails'
   * `@name_set` mutex flag in `Options#initialize` — `@name_set = name`
   * is truthy only when a name was passed in). Used by the `inherited`
   * hook to decide whether to re-derive the default on subclass dup.
   */
  nameSet: boolean;

  constructor(
    name: string | null = null,
    format: string[] | null = null,
    include: string[] | null = null,
    exclude: string[] | null = null,
    klass: unknown = null,
    model: unknown = null,
  ) {
    this.name = name;
    this.format = format;
    this.include = include;
    this.exclude = exclude;
    this.klass = klass;
    this.model = model;
    this.nameSet = name != null;
  }

  static fromHash(hash: Record<string, unknown>): Options {
    const rawFormat = hash.format;
    const format =
      rawFormat == null
        ? null
        : Array.isArray(rawFormat)
          ? (rawFormat as string[])
          : [rawFormat as string];
    return new Options(
      (hash.name as string | null) ?? null,
      format,
      (hash.include as string[] | null) ?? null,
      (hash.exclude as string[] | null) ?? null,
      hash.klass ?? null,
      hash.model ?? null,
    );
  }
}

export function wrapParameters(
  params: Record<string, unknown>,
  name: string,
  include?: string[] | null,
  exclude?: string[] | null,
): Record<string, unknown> {
  const wrapped: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(params)) {
    if (key === name || key === "controller" || key === "action") continue;
    if (include && !include.includes(key)) continue;
    if (exclude && exclude.includes(key)) continue;
    wrapped[key] = value;
  }
  return { ...params, [name]: wrapped };
}

/** @internal */
export interface ParamsWrapperHost {
  request: {
    hasContentType(): boolean;
    contentMimeType: { ref(): string | null } | null;
    requestParameters: Record<string, unknown>;
    filteredParameters(): Record<string, unknown>;
    params: Record<string, unknown>;
  };
  _wrapperOptions: Options;
}

/** @internal */
export interface WrapperHostClass {
  name?: string | null;
}

/**
 * Sets `_wrapper_options` on the controller class (class-method mixin).
 * @internal
 */
export function _setWrapperOptions(
  this: { _wrapperOptions: Options },
  options: Record<string, unknown>,
): void {
  this._wrapperOptions = Options.fromHash(options);
}

/**
 * Returns the wrapper key under which wrapped params are stored.
 * @internal
 */
export function _wrapperKey(this: ParamsWrapperHost): string | null {
  return this._wrapperOptions.name;
}

/**
 * Returns the list of enabled formats.
 * @internal
 */
export function _wrapperFormats(this: ParamsWrapperHost): string[] | null {
  return this._wrapperOptions.format;
}

/**
 * Returns the subset of `parameters` selected by include/exclude options.
 * @internal
 */
export function _extractParameters(
  this: ParamsWrapperHost,
  parameters: Record<string, unknown>,
): Record<string, unknown> {
  const opts = this._wrapperOptions;
  if (opts.include) {
    const includeOnly = opts.include;
    const out: Record<string, unknown> = {};
    for (const k of includeOnly) {
      if (Object.hasOwn(parameters, k)) out[k] = parameters[k];
    }
    return out;
  }
  const exclude = opts.exclude ? [...opts.exclude, ...EXCLUDE_PARAMETERS] : EXCLUDE_PARAMETERS;
  const out: Record<string, unknown> = {};
  for (const k of Object.keys(parameters)) {
    if (!exclude.includes(k)) out[k] = parameters[k];
  }
  return out;
}

/**
 * Wraps `parameters` into `{ wrapperKey => extractedParameters }`.
 * @internal
 */
export function _wrapParameters(
  this: ParamsWrapperHost,
  parameters: Record<string, unknown>,
): Record<string, unknown> {
  const key = _wrapperKey.call(this);
  if (!key) return {};
  return { [key]: _extractParameters.call(this, parameters) };
}

/**
 * Checks if parameter wrapping should be performed for this request.
 * Mirrors Rails' `_wrapper_enabled?`.
 * @internal
 */
export function _wrapperEnabled(this: ParamsWrapperHost): boolean {
  try {
    if (!this.request.hasContentType()) return false;
    const ref = this.request.contentMimeType?.ref();
    if (!ref) return false;
    const formats = _wrapperFormats.call(this);
    const key = _wrapperKey.call(this);
    if (!formats || !formats.includes(ref)) return false;
    if (!key) return false;
    return !Object.hasOwn(this.request.params, key);
  } catch (err) {
    if (err instanceof ParseError) return false;
    throw err;
  }
}

/**
 * Performs the wrap: merges wrapped hash into `request.parameters`,
 * `request.requestParameters`, and `request.filteredParameters()`.
 * @internal
 */
export function _performParameterWrapping(this: ParamsWrapperHost): void {
  const reqParams = this.request.requestParameters;
  const wrappedHash = _wrapParameters.call(this, reqParams);
  const wrappedKeys = Object.keys(reqParams);
  const filtered = this.request.filteredParameters();
  const slice: Record<string, unknown> = {};
  for (const k of wrappedKeys) {
    if (Object.hasOwn(filtered, k)) slice[k] = filtered[k];
  }
  const wrappedFiltered = _wrapParameters.call(this, slice);
  Object.assign(this.request.params, wrappedHash);
  Object.assign(this.request.requestParameters, wrappedHash);
  Object.assign(filtered, wrappedFiltered);
}

/**
 * Derive the wrapper model name from the controller class name.
 * Rails uses `safe_constantize` to look up a model class by traversing
 * namespaces (`Foo::Bar::UsersController` → `Foo::Bar::User`, `Foo::User`,
 * `User`); we don't have a global constant registry, so we return the
 * demodulized, singularized, snake_case name as a string fallback. Callers
 * that need a real model class should pass `model:` explicitly to
 * `wrap_parameters`.
 * @internal
 */
export function _defaultWrapModel(this: { _wrapperOptions: Options }): string | null {
  const klass = this._wrapperOptions.klass as WrapperHostClass | null | undefined;
  const name = klass?.name;
  if (!name) return null;
  const stripped = name.replace(/Controller$/, "");
  if (!stripped) return null;
  return underscore(singularize(demodulize(stripped)));
}
