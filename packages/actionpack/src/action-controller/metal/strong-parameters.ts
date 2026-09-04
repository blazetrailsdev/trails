/** @internal */

import { SpellChecker } from "@blazetrails/did-you-mean";
import { Time, actsLikeDate, actsLikeTime } from "@blazetrails/date";
import { UploadedFile as RackTestUploadedFile } from "@blazetrails/rack-test";
import {
  IO,
  Rational,
  StringIO,
  KeyError,
  block,
  type ConflictBlock,
  eachPair,
  hasKey,
  merge,
  mergeBang,
} from "@blazetrails/ruby-compat";
import { BigDecimal, isBlank } from "@blazetrails/activesupport";

import { UploadedFile } from "../../action-dispatch/http/upload.js";

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

/** @internal */
const PERMITTED_SCALAR_TYPES: ((value: unknown) => boolean)[] = [
  (value) => typeof value === "string",
  (value) => typeof value === "string",
  (value) => value === null || value === undefined,
  (value) =>
    typeof value === "number" ||
    typeof value === "bigint" ||
    value instanceof BigDecimal ||
    value instanceof Rational,
  (value) => value === true,
  (value) => value === false,
  (value) => actsLikeDate(value),
  (value) => value instanceof Time || actsLikeTime(value),
  (value) => value instanceof StringIO,
  (value) => value instanceof IO,
  (value) => value instanceof UploadedFile,
  (value) => value instanceof RackTestUploadedFile,
];

/** @internal */
function isPermittedScalar(value: unknown): boolean {
  return PERMITTED_SCALAR_TYPES.some((type) => type(value));
}

export class Parameters {
  private _data: Record<string, unknown>;
  private _permitted: boolean;
  private _convertedArrays?: Set<string>;

  static permitAllParameters = false;
  static actionOnUnpermittedParameters: "log" | "raise" | false = false;
  static alwaysPermittedParameters: string[] = ["controller", "action"];

  static hookIntoYamlLoading(): void {}

  constructor(data: Record<string, unknown> = {}) {
    this._data = { ...data };
    this._permitted = Parameters.permitAllParameters;
  }

  static nestedAttribute(key: string, value: unknown): boolean {
    return /^-?\d+$/.test(key) && (value instanceof Parameters || isPlainObject(value));
  }

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

  permitBang(): this {
    this.eachPair((_key, value) => {
      const values = Array.isArray(value) ? value.flat() : [value];
      for (const v of values) {
        if (v instanceof Parameters) {
          v.permitBang();
        }
      }
    });
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

  get(key: string): unknown {
    return this._convertHashesToParameters(key, this._data[key]);
  }

  set(key: string, value: unknown): void {
    this._data[key] = value;
  }

  has(key: string): boolean {
    return hasKey(this._data, key);
  }

  isKey(key: string): boolean {
    return hasKey(this._data, key);
  }

  hasKey(key: string): boolean {
    return hasKey(this._data, key);
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

  merge(otherHash: Parameters | Record<string, unknown>): Parameters {
    const otherData = otherHash instanceof Parameters ? otherHash._toRawHash() : otherHash;
    return this._newWithInheritedPermitted({ ...this._data, ...otherData });
  }

  mergeBang(otherHash: Parameters | Record<string, unknown>, block?: ConflictBlock<unknown>): this {
    const otherData = otherHash instanceof Parameters ? otherHash._toRawHash() : otherHash;
    mergeBang(this._data, otherData, ...(block ? [block] : []));
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

  /** @missingRailsArgs merge — PERMANENT */
  reverseMerge(otherHash: Parameters | Record<string, unknown>): Parameters {
    const otherData = otherHash instanceof Parameters ? otherHash._toRawHash() : otherHash;
    return this._newWithInheritedPermitted(merge(otherData, this._data));
  }

  withDefaults(otherHash: Parameters | Record<string, unknown>): Parameters {
    return this.reverseMerge(otherHash);
  }

  reverseMergeBang(otherHash: Parameters | Record<string, unknown>): this {
    const otherData = otherHash instanceof Parameters ? otherHash._toRawHash() : otherHash;
    mergeBang(
      this._data,
      otherData,
      block((_key: string, left: unknown, _right: unknown) => left),
    );
    return this;
  }

  withDefaultsBang(otherHash: Parameters | Record<string, unknown>): this {
    return this.reverseMergeBang(otherHash);
  }

  /** @deprecated */
  reversemerge(otherHash: Parameters | Record<string, unknown>): Parameters {
    return this.reverseMerge(otherHash);
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

  selectBang(fn: (key: string, value: unknown) => boolean): this {
    for (const k of Object.keys(this._data)) {
      if (!fn(k, this._data[k])) delete this._data[k];
    }
    return this;
  }

  keepIf(fn: (key: string, value: unknown) => boolean): this {
    return this.selectBang(fn);
  }

  reject(fn: (key: string, value: unknown) => boolean): Parameters {
    return this.select((k, v) => !fn(k, v));
  }

  rejectBang(fn: (key: string, value: unknown) => boolean): this {
    for (const k of Object.keys(this._data)) {
      if (fn(k, this._data[k])) delete this._data[k];
    }
    return this;
  }

  deleteIf(fn: (key: string, value: unknown) => boolean): this {
    return this.rejectBang(fn);
  }

  compact(): Parameters {
    return this.select((_k, v) => v !== null && v !== undefined);
  }

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
    return this.reject((_k, v) => isBlank(v));
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
    eachPair(this._data, (key, value) => {
      fn(this._convertHashesToParameters(key, value));
    });
    return this;
  }

  eachKey(fn: (key: string) => void): this {
    for (const k of Object.keys(this._data)) {
      fn(k);
    }
    return this;
  }

  fetch(key: string, ...args: unknown[]): unknown {
    if (key in this._data) {
      return this.get(key);
    }
    if (args.length > 0) {
      return this._convertValueToParameters(args[0]);
    }
    throw new KeyError(`key not found: "${key}"`);
  }

  dig(...keys: string[]): unknown {
    if (keys.length === 0) {
      throw new Error("wrong number of arguments (given 0, expected 1+)");
    }
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
          current = this._newWithInheritedPermitted(current);
          obj[key] = current;
        }
      } else {
        return undefined;
      }
    }
    return current;
  }

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

  toQuery(args?: string): string {
    const parts: string[] = [];
    for (const [k, v] of Object.entries(this._data)) {
      const key = args ? `${args}[${k}]` : k;
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

  deepDup(): Parameters {
    const p = new Parameters(structuredClone(this._data));
    p._permitted = this._permitted;
    return p;
  }

  /** @missingRailsArgs split — PERMANENT */
  extractValue(key: string, delimiter = "_"): string[] | null {
    const val = this._data[key];
    if (val === null || val === undefined) return null;
    return String(val).split(delimiter);
  }

  static create(data: Record<string, unknown> = {}): Parameters {
    return new Parameters(data);
  }

  private _permitFilters(
    filters: (string | Record<string, unknown>)[],
    options: { suppressUnpermitted?: boolean } = {},
  ): Parameters {
    const params = new Parameters();
    const flatFilters = filters.flat();

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

  private _permittedScalarFilter(params: Parameters, permittedKey: string): void {
    if (this.hasKey(permittedKey) && isPermittedScalar(this._data[permittedKey])) {
      params._data[permittedKey] = this._data[permittedKey];
    }
    const re = /\(\d+[if]?\)$/;
    this.eachKey((key) => {
      const m = re.exec(key);
      if (!m) return;
      const preMatch = key.slice(0, m.index);
      if (preMatch !== permittedKey) return;
      if (isPermittedScalar(this._data[key])) params._data[key] = this._data[key];
    });
  }

  private _hashFilter(
    params: Parameters,
    filter: Record<string, unknown>,
    options: { suppressUnpermitted?: boolean } = {},
  ): void {
    if (Object.keys(filter).length === 0) {
      for (const [ek, ev] of Object.entries(this._data)) {
        params._data[ek] = ev;
      }
      return;
    }
    for (const [k, v] of Object.entries(filter)) {
      if (!this.hasKey(k)) continue;
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
              const nestedParams = new Parameters(item);
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
          params._data[k] = val;
        } else if (Array.isArray(v)) {
          const nestedParams = new Parameters(val);
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
      for (const [k, v] of Object.entries(value)) {
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
      return this._newWithInheritedPermitted(value);
    }
    return value;
  }

  /** @internal */
  get parameters(): Record<string, unknown> {
    return this._data;
  }

  /** @internal */
  isNestedAttributes(): boolean {
    return Object.entries(this._data).some(([k, v]) => Parameters.nestedAttribute(k, v));
  }

  /** @internal */
  eachNestedAttribute(fn: (value: unknown) => unknown): Parameters {
    const result = new Parameters();
    for (const [k, v] of Object.entries(this._data)) {
      if (Parameters.nestedAttribute(k, v)) {
        result._data[k] = fn(this._convertHashesToParameters(k, v));
      }
    }
    return result;
  }

  /** @internal */
  permitFilters(
    filters: (string | Record<string, unknown>)[],
    _options: { onUnpermitted?: "raise" | "log" | null; explicitArrays?: boolean } = {},
  ): Parameters {
    return this._permitFilters(filters);
  }

  /** @internal */
  newInstanceWithInheritedPermittedStatus(hash: Record<string, unknown>): Parameters {
    return this._newWithInheritedPermitted(hash);
  }

  /** @internal */
  convertParametersToHashes(value: unknown, using: string): unknown {
    return this._convertParametersToHashes(value, using);
  }

  /** @internal */
  convertHashesToParameters(key: string, value: unknown): unknown {
    return this._convertHashesToParameters(key, value);
  }

  /** @internal */
  convertValueToParameters(value: unknown): unknown {
    return this._convertValueToParameters(value);
  }

  /** @internal */
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
      const target = object;
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

  /** @internal */
  isSpecifyNumericKeys(filter: unknown): boolean {
    if (filter && typeof filter === "object" && !Array.isArray(filter)) {
      return Object.keys(filter as Record<string, unknown>).some((k) => /^-?\d+$/.test(k));
    }
    return false;
  }

  /** @internal */
  isArrayFilter(filter: unknown): boolean {
    return Array.isArray(filter) && filter.length === 1 && Array.isArray(filter[0]);
  }

  /** @internal */
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

  /** @internal */
  unpermittedParametersBang(params: Parameters): void {
    this._unpermittedParameters(params);
  }

  /** @internal */
  unpermittedKeys(params: Parameters): string[] {
    const allowed = new Set([
      ...Object.keys(params._data),
      ...Parameters.alwaysPermittedParameters,
    ]);
    return Object.keys(this._data).filter((k) => !allowed.has(k));
  }

  /** @internal */
  permittedScalarFilter(params: Parameters, permittedKey: string): void {
    this._permittedScalarFilter(params, permittedKey);
  }

  /** @internal */
  isNonScalar(value: unknown): boolean {
    return Array.isArray(value) || value instanceof Parameters;
  }

  /** @internal */
  hashFilter(
    params: Parameters,
    filter: Record<string, unknown>,
    options: { suppressUnpermitted?: boolean } = {},
  ): void {
    this._hashFilter(params, filter, options);
  }

  /** @internal */
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

  /** @internal */
  permitArrayOfScalars(value: unknown): unknown {
    if (Array.isArray(value) && value.every((el) => isPermittedScalar(el))) return value;
    return undefined;
  }

  /** @internal */
  permitArrayOfHashes(value: unknown, filter: unknown): unknown {
    return this.eachArrayElement(value, filter, (el) =>
      el.permitFilters(
        (Array.isArray(filter) ? filter : [filter]) as (string | Record<string, unknown>)[],
      ),
    );
  }

  /** @internal */
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

  /** @internal */
  permitHashOrArray(value: unknown, filter: unknown): unknown {
    const arr = this.permitArrayOfHashes(value, filter);
    if (arr != null) return arr;
    return this.permitHash(value, filter);
  }

  /** @internal */
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

  /** @internal */
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
      for (const [k, v] of Object.entries(object)) {
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

export interface StrongParameters {
  params: Parameters;
}

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
      result[k] = deepMergeObjects(result[k], v);
    } else if (
      k in result &&
      (result[k] instanceof Parameters || isPlainObject(result[k])) &&
      (v instanceof Parameters || isPlainObject(v))
    ) {
      const leftRaw = result[k] instanceof Parameters ? result[k]._toRawHash() : result[k];
      const rightRaw = v instanceof Parameters ? v._toRawHash() : v;
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
