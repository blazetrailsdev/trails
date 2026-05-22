/** ActionController::StrongParameters Provides ActionController::Parameters, a hash-like object that controls which parameters are permitted for mass assignment. @see https://api.rubyonrails.org/classes/ActionController/StrongParameters.html @internal */

import { SpellChecker } from "@blazetrails/did-you-mean";

// --- Error classes ---

export class ParameterMissing extends Error {
  readonly param: string;
  readonly keys: string[] | null;
  #cachedCorrections?: string[];

  constructor(param: string, keys: string[] | null = null) {
    super(`param is missing or the value is empty or invalid: ${param}`);
    this.name = "ParameterMissing";
    this.param = param;
    this.keys = keys;
  }

  /**
   * Mirrors Rails' `ParameterMissing#corrections`, memoised via Ruby's
   * `@corrections ||=` idiom. Runs the missing param name through
   * `@blazetrails/did-you-mean`'s SpellChecker against the keys the
   * caller had at the time of the raise.
   */
  get corrections(): string[] {
    if (this.#cachedCorrections !== undefined) return this.#cachedCorrections;
    if (!this.keys) {
      this.#cachedCorrections = [];
      return this.#cachedCorrections;
    }
    this.#cachedCorrections = new SpellChecker({ dictionary: this.keys }).correct(this.param);
    return this.#cachedCorrections;
  }
}

export class ExpectedParameterMissing extends ParameterMissing {
  constructor(param: string, keys: string[] | null = null) {
    super(param, keys);
    this.name = "ExpectedParameterMissing";
  }
}

export class UnpermittedParameters extends Error {
  readonly params: string[];

  constructor(params: string[]) {
    const s = params.length > 1 ? "s" : "";
    super(`found unpermitted parameter${s}: ${params.map((e) => `:${e}`).join(", ")}`);
    this.name = "UnpermittedParameters";
    this.params = params;
  }
}

export class UnfilteredParameters extends Error {
  constructor() {
    super("unable to convert unpermitted parameters to hash");
    this.name = "UnfilteredParameters";
  }
}

export class InvalidParameterKey extends Error {
  constructor(message?: string) {
    super(message ?? "all keys must be Strings or Symbols");
    this.name = "InvalidParameterKey";
  }
}

// --- Scalar type guard ---

/** @internal */
function isPermittedScalar(value: unknown): boolean {
  if (value === null || value === undefined) return true;
  const t = typeof value;
  return t === "string" || t === "number" || t === "boolean";
}

function isBlank(value: unknown): boolean {
  if (value === null || value === undefined || value === false) return true;
  if (typeof value === "string" && value.trim() === "") return true;
  if (Array.isArray(value) && value.length === 0) return true;
  if (value instanceof Parameters) return value.empty;
  if (isPlainObject(value) && Object.keys(value).length === 0) return true;
  return false;
}

// --- Parameters ---

export class Parameters {
  private _data: Record<string, unknown>;
  private _permitted: boolean;
  private _convertedArrays?: Set<string>;

  static permitAllParameters = false;
  static actionOnUnpermittedParameters: "log" | "raise" | false = false;
  static alwaysPermittedParameters: string[] = ["controller", "action"];

  static hookIntoYamlLoading(): void {
    // No-op in TypeScript — YAML deserialization is not a concern
  }

  constructor(data: Record<string, unknown> = {}) {
    this._data = { ...data };
    this._permitted = Parameters.permitAllParameters;
  }

  static nestedAttribute(key: string, value: unknown): boolean {
    return /^-?\d+$/.test(key) && (value instanceof Parameters || isPlainObject(value));
  }

  // --- Permit / require ---

  /** @internal */
  get permitted(): boolean {
    return this._permitted;
  }

  permit(...filters: (string | Record<string, unknown>)[]): Parameters {
    const result = this._permitFilters(filters.flat());
    return result;
  }

  permitAll(): Parameters {
    const p = this.deepDup();
    p.permitBang();
    return p;
  }

  /** Sets permitted to true in-place (recursive). Returns self. */
  permitBang(): this {
    for (const [, value] of Object.entries(this._data)) {
      const values = Array.isArray(value) ? value.flat() : [value];
      for (const v of values) {
        if (v instanceof Parameters) {
          v.permitBang();
        }
      }
    }
    this._permitted = true;
    return this;
  }

  require(key: string | string[]): unknown {
    if (Array.isArray(key)) {
      return key.map((k) => this.require(k));
    }
    const value = this.get(key);
    if (value === false || (value !== null && value !== undefined && !isBlank(value))) {
      return value;
    }
    throw new ParameterMissing(key, Object.keys(this._data));
  }

  expect(...filters: (string | Record<string, (string | Record<string, unknown>)[]>)[]): unknown {
    const flatFilters = filters.flat();
    const params = this._permitFilters(flatFilters as (string | Record<string, unknown>)[], {
      suppressUnpermitted: true,
    });
    const keys = flatFilters.flatMap((f) => (typeof f === "string" ? [f] : Object.keys(f)));
    const values = keys.map((k) => params.require(k));
    return values.length === 1 ? values[0] : values;
  }

  expectBang(
    ...filters: (string | Record<string, (string | Record<string, unknown>)[]>)[]
  ): unknown {
    try {
      return this.expect(...filters);
    } catch (e) {
      if (e instanceof ParameterMissing) {
        throw new ExpectedParameterMissing(e.param, e.keys);
      }
      throw e;
    }
  }

  // --- Hash-like accessors ---

  get(key: string): unknown {
    return this._convertHashesToParameters(key, this._data[key]);
  }

  set(key: string, value: unknown): void {
    this._data[key] = value;
  }

  has(key: string): boolean {
    return key in this._data;
  }

  isKey(key: string): boolean {
    return key in this._data;
  }

  hasKey(key: string): boolean {
    return key in this._data;
  }

  hasValue(value: unknown): boolean {
    return Object.values(this._data).includes(value);
  }

  include(key: string): boolean {
    return key in this._data;
  }

  member(key: string): boolean {
    return key in this._data;
  }

  exclude(key: string): boolean {
    return !(key in this._data);
  }

  get keys(): string[] {
    return Object.keys(this._data);
  }

  get values(): unknown[] {
    return Object.values(this._data);
  }

  get empty(): boolean {
    return Object.keys(this._data).length === 0;
  }

  get length(): number {
    return Object.keys(this._data).length;
  }

  get size(): number {
    return this.length;
  }

  // --- Transformations (non-mutating) ---

  except(...keys: string[]): Parameters {
    const result: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(this._data)) {
      if (!keys.includes(k)) result[k] = v;
    }
    return this._newWithInheritedPermitted(result);
  }

  without(...keys: string[]): Parameters {
    return this.except(...keys);
  }

  slice(...keys: string[]): Parameters {
    const result: Record<string, unknown> = {};
    for (const key of keys) {
      if (key in this._data) result[key] = this._data[key];
    }
    return this._newWithInheritedPermitted(result);
  }

  /** Mutating slice — keeps only the given keys, returns self. */
  sliceBang(...keys: string[]): this {
    const keepSet = new Set(keys);
    for (const k of Object.keys(this._data)) {
      if (!keepSet.has(k)) delete this._data[k];
    }
    return this;
  }

  extract(...keys: string[]): Parameters {
    return this.slice(...keys);
  }

  /** Mutating extract! — removes and returns the key/value pairs. */
  extractBang(...keys: string[]): Parameters {
    const result: Record<string, unknown> = {};
    for (const key of keys) {
      if (key in this._data) {
        result[key] = this._data[key];
        delete this._data[key];
      }
    }
    return this._newWithInheritedPermitted(result);
  }

  merge(other: Parameters | Record<string, unknown>): Parameters {
    const otherData = other instanceof Parameters ? other._toRawHash() : other;
    return this._newWithInheritedPermitted({ ...this._data, ...otherData });
  }

  /** Mutating merge — merges other into self, returns self. */
  mergeBang(
    other: Parameters | Record<string, unknown>,
    block?: (key: string, left: unknown, right: unknown) => unknown,
  ): this {
    const otherData = other instanceof Parameters ? other._toRawHash() : other;
    for (const [k, v] of Object.entries(otherData)) {
      if (block && k in this._data) {
        this._data[k] = block(k, this._data[k], v);
      } else {
        this._data[k] = v;
      }
    }
    return this;
  }

  deepMerge(other: Parameters | Record<string, unknown>): Parameters {
    const otherData = other instanceof Parameters ? other._toRawHash() : other;
    const merged = deepMergeObjects(this._data, otherData);
    return this._newWithInheritedPermitted(merged);
  }

  deepMergeBang(other: Parameters | Record<string, unknown>): this {
    const otherData = other instanceof Parameters ? other._toRawHash() : other;
    this._data = deepMergeObjects(this._data, otherData);
    return this;
  }

  reverseMerge(other: Parameters | Record<string, unknown>): Parameters {
    const otherData = other instanceof Parameters ? other._toRawHash() : other;
    return this._newWithInheritedPermitted({ ...otherData, ...this._data });
  }

  /** Alias for reverseMerge */
  withDefaults(other: Parameters | Record<string, unknown>): Parameters {
    return this.reverseMerge(other);
  }

  /** Mutating reverse merge — merges other into self (self wins), returns self. */
  reverseMergeBang(other: Parameters | Record<string, unknown>): this {
    const otherData = other instanceof Parameters ? other._toRawHash() : other;
    for (const [k, v] of Object.entries(otherData)) {
      if (!(k in this._data)) {
        this._data[k] = v;
      }
    }
    return this;
  }

  /** Alias for reverseMergeBang */
  withDefaultsBang(other: Parameters | Record<string, unknown>): this {
    return this.reverseMergeBang(other);
  }

  /** @deprecated Use reverseMerge instead */
  reversemerge(other: Parameters | Record<string, unknown>): Parameters {
    return this.reverseMerge(other);
  }

  transform(fn: (key: string, value: unknown) => unknown): Parameters {
    const result: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(this._data)) {
      result[k] = fn(k, v);
    }
    return this._newWithInheritedPermitted(result);
  }

  transformKeys(fn: (key: string) => string): Parameters {
    const result: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(this._data)) {
      result[fn(k)] = v;
    }
    return this._newWithInheritedPermitted(result);
  }

  /** Mutating transform_keys! — returns self. */
  transformKeysBang(fn: (key: string) => string): this {
    const entries = Object.entries(this._data);
    this._data = {};
    for (const [k, v] of entries) {
      this._data[fn(k)] = v;
    }
    return this;
  }

  deepTransformKeys(fn: (key: string) => string): Parameters {
    const transformed = this._deepTransformKeysInObject(this._data, fn);
    const raw =
      transformed instanceof Parameters
        ? transformed._toRawHash()
        : (transformed as Record<string, unknown>);
    return this._newWithInheritedPermitted(raw);
  }

  deepTransformKeysBang(fn: (key: string) => string): this {
    const transformed = this._deepTransformKeysInObject(this._data, fn);
    this._data =
      transformed instanceof Parameters
        ? transformed._toRawHash()
        : (transformed as Record<string, unknown>);
    return this;
  }

  transformValues(fn: (value: unknown) => unknown): Parameters {
    const result: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(this._data)) {
      const converted = this._convertValueToParameters(v);
      result[k] = fn(converted);
    }
    return this._newWithInheritedPermitted(result);
  }

  /** Mutating transform_values! — returns self. */
  transformValuesBang(fn: (value: unknown) => unknown): this {
    for (const [k, v] of Object.entries(this._data)) {
      const converted = this._convertValueToParameters(v);
      this._data[k] = fn(converted);
    }
    return this;
  }

  select(fn: (key: string, value: unknown) => boolean): Parameters {
    const result: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(this._data)) {
      if (fn(k, v)) result[k] = v;
    }
    return this._newWithInheritedPermitted(result);
  }

  /** Mutating select! — returns self. */
  selectBang(fn: (key: string, value: unknown) => boolean): this {
    for (const k of Object.keys(this._data)) {
      if (!fn(k, this._data[k])) delete this._data[k];
    }
    return this;
  }

  /** Alias for selectBang */
  keepIf(fn: (key: string, value: unknown) => boolean): this {
    return this.selectBang(fn);
  }

  reject(fn: (key: string, value: unknown) => boolean): Parameters {
    return this.select((k, v) => !fn(k, v));
  }

  /** Mutating reject! — returns self. */
  rejectBang(fn: (key: string, value: unknown) => boolean): this {
    for (const k of Object.keys(this._data)) {
      if (fn(k, this._data[k])) delete this._data[k];
    }
    return this;
  }

  /** Alias for rejectBang */
  deleteIf(fn: (key: string, value: unknown) => boolean): this {
    return this.rejectBang(fn);
  }

  compact(): Parameters {
    return this.select((_k, v) => v !== null && v !== undefined);
  }

  /** Mutating compact! — returns self if changes were made, null otherwise. */
  compactBang(): this | null {
    let changed = false;
    for (const k of Object.keys(this._data)) {
      if (this._data[k] === null || this._data[k] === undefined) {
        delete this._data[k];
        changed = true;
      }
    }
    return changed ? this : null;
  }

  compactBlank(): Parameters {
    return this.select((_k, v) => !isBlank(v));
  }

  compactBlankBang(): this {
    for (const k of Object.keys(this._data)) {
      if (isBlank(this._data[k])) delete this._data[k];
    }
    return this;
  }

  valuesAt(...keys: string[]): unknown[] {
    return keys.map((k) => this.get(k));
  }

  // --- Iteration ---

  each(fn: (key: string, value: unknown) => void): this {
    for (const [k, v] of Object.entries(this._data)) {
      fn(k, this._convertHashesToParameters(k, v));
    }
    return this;
  }

  eachPair(fn: (key: string, value: unknown) => void): this {
    return this.each(fn);
  }

  eachValue(fn: (value: unknown) => void): this {
    for (const [k, v] of Object.entries(this._data)) {
      fn(this._convertHashesToParameters(k, v));
    }
    return this;
  }

  eachKey(fn: (key: string) => void): this {
    for (const k of Object.keys(this._data)) {
      fn(k);
    }
    return this;
  }

  // --- Fetch ---

  fetch(key: string, ...args: unknown[]): unknown {
    if (key in this._data) {
      return this.get(key);
    }
    if (args.length > 0) {
      return this._convertValueToParameters(args[0]);
    }
    const err = new Error(`key not found: "${key}"`);
    err.name = "KeyError";
    throw err;
  }

  dig(...keys: string[]): unknown {
    if (keys.length === 0) {
      throw new Error("wrong number of arguments (given 0, expected 1+)");
    }
    // Convert first key's value like Rails does
    this._convertHashesToParameters(keys[0], this._data[keys[0]]);
    let current: unknown = this._data;
    for (const key of keys) {
      if (current === null || current === undefined) return undefined;
      if (current instanceof Parameters) {
        current = current.get(key);
      } else if (typeof current === "object" && !Array.isArray(current)) {
        const obj = current as Record<string, unknown>;
        current = obj[key];
        if (isPlainObject(current)) {
          current = this._newWithInheritedPermitted(current as Record<string, unknown>);
          obj[key] = current;
        }
      } else {
        return undefined;
      }
    }
    return current;
  }

  // --- Delete ---

  delete(key: string, ...args: unknown[]): unknown {
    if (key in this._data) {
      const val = this._data[key];
      delete this._data[key];
      return this._convertValueToParameters(val);
    }
    if (typeof args[0] === "function") {
      return (args[0] as (key: string) => unknown)(key);
    }
    return args.length > 0 ? args[0] : undefined;
  }

  // --- Conversion ---

  toH(block?: (key: string, value: unknown) => [string, unknown]): Record<string, unknown> {
    if (!this._permitted) {
      throw new UnfilteredParameters();
    }
    const result = this._convertParametersToHashes(this._data, "toH");
    if (block) {
      const transformed: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(result as Record<string, unknown>)) {
        const [nk, nv] = block(k, v);
        transformed[nk] = nv;
      }
      return transformed;
    }
    return result as Record<string, unknown>;
  }

  toHash(): Record<string, unknown> {
    if (this._permitted) {
      return this._convertParametersToHashes(this._data, "toHash") as Record<string, unknown>;
    }
    throw new UnfilteredParameters();
  }

  /** Returns the raw internal data as a plain object (without permission check). */
  _toRawHash(): Record<string, unknown> {
    return { ...this._data };
  }

  toJSON(): Record<string, unknown> {
    return this.toUnsafeHash();
  }

  toUnsafeHash(): Record<string, unknown> {
    return this._convertParametersToHashes(this._data, "toUnsafeHash") as Record<string, unknown>;
  }

  toUnsafeH(): Record<string, unknown> {
    return this.toUnsafeHash();
  }

  stringifyKeys(): Parameters {
    return this.deepDup();
  }

  get convertedArrays(): Set<string> {
    this._convertedArrays ??= new Set<string>();
    return this._convertedArrays;
  }

  toQuery(prefix?: string): string {
    const parts: string[] = [];
    for (const [k, v] of Object.entries(this._data)) {
      const key = prefix ? `${prefix}[${k}]` : k;
      parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(v))}`);
    }
    return parts.join("&");
  }

  toParam(): string {
    return this.toQuery();
  }

  equals(other: Parameters): boolean {
    if (!(other instanceof Parameters)) return false;
    return this._permitted === other._permitted && deepEqualValue(this._data, other._data);
  }

  eql(other: Parameters): boolean {
    return this.equals(other);
  }

  toString(): string {
    return JSON.stringify(this._data);
  }

  inspect(): string {
    const permitted = this._permitted ? " permitted: true" : "";
    return `#<ActionController::Parameters ${JSON.stringify(this._data)}${permitted}>`;
  }

  // --- Deep operations ---

  deepDup(): Parameters {
    const p = new Parameters(structuredClone(this._data));
    p._permitted = this._permitted;
    return p;
  }

  extractValue(key: string, delimiter = "_"): string[] | null {
    const val = this._data[key];
    if (val === null || val === undefined) return null;
    return String(val).split(delimiter);
  }

  // --- Static ---

  static create(data: Record<string, unknown> = {}): Parameters {
    return new Parameters(data);
  }

  // --- Private helpers ---

  private _permitFilters(
    filters: (string | Record<string, unknown>)[],
    options: { suppressUnpermitted?: boolean } = {},
  ): Parameters {
    const params = new Parameters();
    const flatFilters = filters.flat() as (string | Record<string, unknown>)[];

    for (const filter of flatFilters) {
      if (typeof filter === "string") {
        this._permittedScalarFilter(params, filter);
      } else if (typeof filter === "object" && filter !== null) {
        this._hashFilter(params, filter, options);
      }
    }

    if (!options.suppressUnpermitted) {
      this._unpermittedParameters(params);
    }
    params._permitted = true;
    return params;
  }

  private _permittedScalarFilter(params: Parameters, key: string): void {
    if (key in this._data && isPermittedScalar(this._data[key])) {
      params._data[key] = this._data[key];
    }
    // Rails also walks every existing key to copy multi-parameter keys
    // — e.g. `zipcode(90210i)` permitted under the bare `zipcode`. The
    // regex matches the suffix and the prefix must equal the bare key.
    const re = /\(\d+[if]?\)$/;
    for (const k of Object.keys(this._data)) {
      const m = re.exec(k);
      if (!m) continue;
      const prefix = k.slice(0, m.index);
      if (prefix === key && isPermittedScalar(this._data[k])) {
        params._data[k] = this._data[k];
      }
    }
  }

  private _hashFilter(
    params: Parameters,
    filter: Record<string, unknown>,
    options: { suppressUnpermitted?: boolean } = {},
  ): void {
    // Empty filter object {} permits all keys on this Parameters
    if (Object.keys(filter).length === 0) {
      for (const [ek, ev] of Object.entries(this._data)) {
        params._data[ek] = ev;
      }
      return;
    }
    for (const [k, v] of Object.entries(filter)) {
      if (!(k in this._data)) continue;
      const val = this._data[k];

      if (val instanceof Parameters) {
        if (Array.isArray(v)) {
          params._data[k] = val._permitFilters(v as (string | Record<string, unknown>)[], options);
        } else {
          params._data[k] = val;
        }
      } else if (Array.isArray(val)) {
        if (Array.isArray(v) && v.length === 0) {
          params._data[k] = val.filter((item) => isPermittedScalar(item));
        } else if (Array.isArray(v)) {
          params._data[k] = val.map((item) => {
            if (item instanceof Parameters) {
              return item._permitFilters(v as (string | Record<string, unknown>)[], options);
            }
            if (isPlainObject(item)) {
              const nestedParams = new Parameters(item as Record<string, unknown>);
              return nestedParams._permitFilters(
                v as (string | Record<string, unknown>)[],
                options,
              );
            }
            return item;
          });
        } else {
          params._data[k] = val;
        }
      } else if (isPlainObject(val)) {
        if (Array.isArray(v) && v.length === 0) {
          // empty array filter for a hash — permit arbitrary hash
          params._data[k] = val;
        } else if (Array.isArray(v)) {
          const nestedParams = new Parameters(val as Record<string, unknown>);
          nestedParams._permitted = this._permitted;
          params._data[k] = nestedParams._permitFilters(
            v as (string | Record<string, unknown>)[],
            options,
          );
        } else {
          params._data[k] = val;
        }
      } else {
        params._data[k] = val;
      }
    }
  }

  private _unpermittedParameters(params: Parameters): void {
    if (!Parameters.actionOnUnpermittedParameters) return;
    const alwaysPermitted = new Set(Parameters.alwaysPermittedParameters);
    const unpermitted = Object.keys(this._data).filter(
      (k) => !(k in params._data) && !alwaysPermitted.has(k),
    );
    if (unpermitted.length === 0) return;

    if (Parameters.actionOnUnpermittedParameters === "raise") {
      throw new UnpermittedParameters(unpermitted);
    } else if (Parameters.actionOnUnpermittedParameters === "log") {
      console.warn(`found unpermitted parameters: ${unpermitted.join(", ")}`);
    }
  }

  private _newWithInheritedPermitted(data: Record<string, unknown>): Parameters {
    const p = new Parameters(data);
    p._permitted = this._permitted;
    return p;
  }

  private _convertParametersToHashes(value: unknown, using: string): unknown {
    if (Array.isArray(value)) {
      return value.map((v) => this._convertParametersToHashes(v, using));
    }
    if (value instanceof Parameters) {
      if (using === "toUnsafeHash") {
        return value.toUnsafeHash();
      }
      return value.toH();
    }
    if (isPlainObject(value)) {
      const result: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
        result[k] = this._convertParametersToHashes(v, using);
      }
      return result;
    }
    return value;
  }

  private _convertHashesToParameters(key: string, value: unknown): unknown {
    const converted = this._convertValueToParameters(value);
    if (converted !== value) {
      this._data[key] = converted;
    }
    return converted;
  }

  private _convertValueToParameters(value: unknown): unknown {
    if (value instanceof Parameters) return value;
    if (Array.isArray(value)) {
      let mutated = false;
      const result = value.slice();
      for (let i = 0; i < result.length; i++) {
        const original = result[i];
        const converted = this._convertValueToParameters(original);
        if (converted !== original) {
          result[i] = converted;
          mutated = true;
        }
      }
      return mutated ? result : value;
    }
    if (isPlainObject(value)) {
      return this._newWithInheritedPermitted(value as Record<string, unknown>);
    }
    return value;
  }

  /** Rails-private `attr_reader :parameters` — the underlying hash. Trails stores it on `_data`; exposed under the Rails name for parity with the strong-parameters private surface. @internal */
  get parameters(): Record<string, unknown> {
    return this._data;
  }

  /** Rails `nested_attributes?` — true when any key/value pair looks like a nested-attribute index (`/\A-?\d+\z/`). @internal */
  isNestedAttributes(): boolean {
    return Object.entries(this._data).some(([k, v]) => Parameters.nestedAttribute(k, v));
  }

  /** Rails `each_nested_attribute` — yields each nested-attribute pair, returning a new Parameters with the block result. @internal */
  eachNestedAttribute(fn: (value: unknown) => unknown): Parameters {
    const result = new Parameters();
    for (const [k, v] of Object.entries(this._data)) {
      if (Parameters.nestedAttribute(k, v)) {
        result._data[k] = fn(this._convertHashesToParameters(k, v));
      }
    }
    return result;
  }

  /** Rails `permit_filters(filters, on_unpermitted:, explicit_arrays:)` — Rails-named entry point. Delegates to the existing internal `_permitFilters` (the option shape differs slightly; `onUnpermitted` is honoured only when `actionOnUnpermittedParameters` is set on the class — trails has no per-call override yet). @internal */
  permitFilters(
    filters: (string | Record<string, unknown>)[],
    _options: { onUnpermitted?: "raise" | "log" | null; explicitArrays?: boolean } = {},
  ): Parameters {
    return this._permitFilters(filters);
  }

  /** Rails `new_instance_with_inherited_permitted_status(hash)` — wraps a raw hash in a new Parameters that inherits this instance's permitted flag. @internal */
  newInstanceWithInheritedPermittedStatus(hash: Record<string, unknown>): Parameters {
    return this._newWithInheritedPermitted(hash);
  }

  /** Rails `convert_parameters_to_hashes(value, using)` — recursively converts nested Parameters into plain hashes using the given method. @internal */
  convertParametersToHashes(value: unknown, using: string): unknown {
    return this._convertParametersToHashes(value, using);
  }

  /** Rails `convert_hashes_to_parameters(key, value)` — converts a single raw-hash entry to a Parameters, replacing the slot when the underlying value actually changed (Rails' `equal?` identity check). @internal */
  convertHashesToParameters(key: string, value: unknown): unknown {
    return this._convertHashesToParameters(key, value);
  }

  /** Rails `convert_value_to_parameters(value)` — recursively wraps plain hashes/arrays in Parameters instances. @internal */
  convertValueToParameters(value: unknown): unknown {
    return this._convertValueToParameters(value);
  }

  /** Rails `_deep_transform_keys_in_object!(object, &block)` — in-place variant of `_deep_transform_keys_in_object`. Mutates the input. @internal */
  _deepTransformKeysInObjectBang(object: unknown, fn: (key: string) => string): unknown {
    if (object instanceof Parameters) {
      const keys = Object.keys(object._data);
      for (const k of keys) {
        const value = object._data[k];
        delete object._data[k];
        object._data[fn(k)] = this._deepTransformKeysInObjectBang(value, fn);
      }
      return object;
    }
    if (isPlainObject(object)) {
      const target = object as Record<string, unknown>;
      const keys = Object.keys(target);
      for (const k of keys) {
        const value = target[k];
        delete target[k];
        target[fn(k)] = this._deepTransformKeysInObjectBang(value, fn);
      }
      return target;
    }
    if (Array.isArray(object)) {
      for (let i = 0; i < object.length; i++) {
        object[i] = this._deepTransformKeysInObjectBang(object[i], fn);
      }
      return object;
    }
    return object;
  }

  /** Rails `specify_numeric_keys?(filter)` — true when the filter is a hash whose top-level keys include numeric strings (nested-attribute style). @internal */
  isSpecifyNumericKeys(filter: unknown): boolean {
    if (filter && typeof filter === "object" && !Array.isArray(filter)) {
      return Object.keys(filter as Record<string, unknown>).some((k) => /^-?\d+$/.test(k));
    }
    return false;
  }

  /** Rails `array_filter?(filter)` — recognises the `[[:flavor]]` shape used by `params.expect` for explicit-array declarations. @internal */
  isArrayFilter(filter: unknown): boolean {
    return Array.isArray(filter) && filter.length === 1 && Array.isArray(filter[0]);
  }

  /** Rails `each_array_element(object, filter, &block)` — applies the block to each element of an array, or each nested-attribute pair when the input is a Parameters with non-numeric keys. @internal */
  eachArrayElement(object: unknown, filter: unknown, fn: (el: Parameters) => unknown): unknown {
    if (Array.isArray(object)) {
      const out: unknown[] = [];
      for (const el of object) {
        if (el instanceof Parameters) {
          const r = fn(el);
          if (r != null) out.push(r);
        }
      }
      return out;
    }
    if (object instanceof Parameters) {
      if (object.isNestedAttributes() && !this.isSpecifyNumericKeys(filter)) {
        return object.eachNestedAttribute(fn as (v: unknown) => unknown);
      }
    }
    return undefined;
  }

  /** Rails `unpermitted_parameters!(params, on_unpermitted:)` — explicit Rails-named entry point. Delegates to `_unpermittedParameters`. @internal */
  unpermittedParametersBang(params: Parameters): void {
    this._unpermittedParameters(params);
  }

  /** Rails `unpermitted_keys(params)` — keys present on self but absent from the permitted projection, minus the always-permitted list. @internal */
  unpermittedKeys(params: Parameters): string[] {
    const allowed = new Set([
      ...Object.keys(params._data),
      ...Parameters.alwaysPermittedParameters,
    ]);
    return Object.keys(this._data).filter((k) => !allowed.has(k));
  }

  /** Rails `permitted_scalar_filter(params, key)` — copies a scalar value across into `params` when it passes the scalar-type check. @internal */
  permittedScalarFilter(params: Parameters, key: string): void {
    this._permittedScalarFilter(params, key);
  }

  /** Rails `non_scalar?(value)` — true for arrays and Parameters. @internal */
  isNonScalar(value: unknown): boolean {
    return Array.isArray(value) || value instanceof Parameters;
  }

  /** Rails `hash_filter(params, filter, on_unpermitted:, explicit_arrays:)`. @internal */
  hashFilter(
    params: Parameters,
    filter: Record<string, unknown>,
    options: { suppressUnpermitted?: boolean } = {},
  ): void {
    this._hashFilter(params, filter, options);
  }

  /** Rails `permit_value(value, filter, on_unpermitted:, explicit_arrays:)`. Dispatches by filter shape. @internal */
  permitValue(value: unknown, filter: unknown): unknown {
    if (Array.isArray(filter) && filter.length === 0) {
      return this.permitArrayOfScalars(value);
    }
    if (
      filter !== null &&
      typeof filter === "object" &&
      !Array.isArray(filter) &&
      Object.keys(filter as Record<string, unknown>).length === 0
    ) {
      return this.permitHash(value, filter as Record<string, unknown>);
    }
    if (this.isArrayFilter(filter)) {
      return this.permitArrayOfHashes(value, (filter as unknown[])[0]);
    }
    if (this.isNonScalar(value)) {
      return this.permitHashOrArray(value, filter);
    }
    return undefined;
  }

  /** Rails `permit_array_of_scalars(value)`. @internal */
  permitArrayOfScalars(value: unknown): unknown {
    if (Array.isArray(value) && value.every((el) => isPermittedScalar(el))) return value;
    return undefined;
  }

  /** Rails `permit_array_of_hashes(value, filter, ...)`. @internal */
  permitArrayOfHashes(value: unknown, filter: unknown): unknown {
    return this.eachArrayElement(value, filter, (el) =>
      el.permitFilters(
        (Array.isArray(filter) ? filter : [filter]) as (string | Record<string, unknown>)[],
      ),
    );
  }

  /** Rails `permit_hash(value, filter, ...)`. @internal */
  permitHash(value: unknown, filter: Record<string, unknown> | unknown): unknown {
    if (!(value instanceof Parameters)) return undefined;
    if (
      filter !== null &&
      typeof filter === "object" &&
      !Array.isArray(filter) &&
      Object.keys(filter as Record<string, unknown>).length === 0
    ) {
      return this.permitAnyInParameters(value);
    }
    return value.permitFilters(
      (Array.isArray(filter) ? filter : [filter]) as (string | Record<string, unknown>)[],
    );
  }

  /** Rails `permit_hash_or_array(value, filter, ...)`. @internal */
  permitHashOrArray(value: unknown, filter: unknown): unknown {
    const arr = this.permitArrayOfHashes(value, filter);
    if (arr != null) return arr;
    return this.permitHash(value, filter);
  }

  /** Rails `permit_any_in_parameters(params)`. @internal */
  permitAnyInParameters(params: Parameters): Parameters {
    const sanitized = new Parameters();
    params.each((k, v) => {
      if (isPermittedScalar(v)) {
        sanitized._data[k] = v;
      } else if (Array.isArray(v)) {
        sanitized._data[k] = this.permitAnyInArray(v);
      } else if (v instanceof Parameters) {
        sanitized._data[k] = this.permitAnyInParameters(v);
      }
    });
    return sanitized;
  }

  /** Rails `permit_any_in_array(array)`. @internal */
  permitAnyInArray(array: unknown[]): unknown[] {
    const sanitized: unknown[] = [];
    for (const el of array) {
      if (isPermittedScalar(el)) sanitized.push(el);
      else if (Array.isArray(el)) sanitized.push(this.permitAnyInArray(el));
      else if (el instanceof Parameters) sanitized.push(this.permitAnyInParameters(el));
    }
    return sanitized;
  }

  private _deepTransformKeysInObject(object: unknown, fn: (key: string) => string): unknown {
    if (object instanceof Parameters) {
      const result = new Parameters();
      for (const [k, v] of Object.entries(object._data)) {
        result._data[fn(k)] = this._deepTransformKeysInObject(v, fn);
      }
      result._permitted = object._permitted;
      return result;
    }
    if (isPlainObject(object)) {
      const result: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(object as Record<string, unknown>)) {
        result[fn(k)] = this._deepTransformKeysInObject(v, fn);
      }
      return result;
    }
    if (Array.isArray(object)) {
      return object.map((e) => this._deepTransformKeysInObject(e, fn));
    }
    return object;
  }
}

// --- StrongParameters module mixin ---

export interface StrongParameters {
  params: Parameters;
}

// --- Helpers ---

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  if (value instanceof Parameters) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function deepMergeObjects(
  left: Record<string, unknown>,
  right: Record<string, unknown>,
): Record<string, unknown> {
  const result = { ...left };
  for (const [k, v] of Object.entries(right)) {
    if (k in result && isPlainObject(result[k]) && isPlainObject(v)) {
      result[k] = deepMergeObjects(
        result[k] as Record<string, unknown>,
        v as Record<string, unknown>,
      );
    } else if (
      k in result &&
      (result[k] instanceof Parameters || isPlainObject(result[k])) &&
      (v instanceof Parameters || isPlainObject(v))
    ) {
      const leftRaw =
        result[k] instanceof Parameters
          ? (result[k] as Parameters)._toRawHash()
          : (result[k] as Record<string, unknown>);
      const rightRaw =
        v instanceof Parameters ? (v as Parameters)._toRawHash() : (v as Record<string, unknown>);
      const merged = deepMergeObjects(leftRaw, rightRaw);
      result[k] = merged;
    } else {
      result[k] = v;
    }
  }
  return result;
}

function deepEqualValue(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (typeof a !== typeof b) return false;
  if (a === null || b === null) return false;

  if (a instanceof Parameters && b instanceof Parameters) {
    if (a.permitted !== b.permitted) return false;
    return deepEqualValue(a._toRawHash(), b._toRawHash());
  }

  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      if (!deepEqualValue(a[i], b[i])) return false;
    }
    return true;
  }
  if (Array.isArray(a) || Array.isArray(b)) return false;

  if (isPlainObject(a) && isPlainObject(b)) {
    const keysA = Object.keys(a).sort();
    const keysB = Object.keys(b).sort();
    if (keysA.length !== keysB.length) return false;
    for (let i = 0; i < keysA.length; i++) {
      if (keysA[i] !== keysB[i]) return false;
    }
    for (const key of keysA) {
      if (!deepEqualValue(a[key], b[key])) return false;
    }
    return true;
  }

  return false;
}
