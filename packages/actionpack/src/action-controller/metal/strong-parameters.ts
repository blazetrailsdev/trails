/** @internal */

import { Correctable, SpellChecker } from "@blazetrails/did-you-mean";
import { Time, actsLikeDate, actsLikeTime } from "@blazetrails/date";
import { UploadedFile as RackTestUploadedFile } from "@blazetrails/rack-test";
import {
  Hash,
  IO,
  Rational,
  StringIO,
  KeyError,
  aryFetch,
  aryIncludes,
  block as blockOf,
  type ConflictBlock,
  eachPair,
  type Enumerator,
  hashAset,
  hashDelete,
  keys as hashKeys,
  isEmpty,
  isModuleIncluded,
  rbBlockGivenP,
  rbEql,
  rbEqual,
  rbFSend,
  rbHash,
  rbInspect,
  rbModConstSet,
  rbModName,
  rbObjClass,
  rbObjDup,
  rbObjRespondTo,
  toEnum,
} from "@blazetrails/ruby-compat";
import { coderTag, type Psych } from "@blazetrails/ruby-compat/psych";
import { YAML } from "@blazetrails/ruby-compat/yaml";
import {
  BigDecimal,
  DeepMergeable,
  type HashWithIndifferentAccess,
  Notifications,
  cattrAccessor,
  ToJsonWithActiveSupportEncoder,
  asJson,
  deepDup,
  deepTransformKeys,
  deepTransformKeysBang,
  filterMap,
  include,
  isBlank,
  toQuery,
  withIndifferentAccess,
  type Included,
} from "@blazetrails/activesupport";

import { UploadedFile } from "../../action-dispatch/http/upload.js";
import { ActionController } from "../../namespaces.js";

export class ParameterMissing extends KeyError {
  readonly param: string;
  readonly keys: string[] | null;
  #corrections?: string[];

  constructor(param: string, keys: string[] | null = null) {
    super(`param is missing or the value is empty or invalid: ${param}`);
    this.name = "ActionController::ParameterMissing";
    this.param = param;
    this.keys = keys;
  }

  get corrections(): string[] {
    return (this.#corrections ||= new SpellChecker({ dictionary: this.keys! }).correct(
      String(this.param),
    ));
  }
}
include(ParameterMissing, Correctable);

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

type OnUnpermitted = "log" | "raise" | false | null;

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

type IsUnion<T, U = T> = T extends unknown ? ([U] extends [T] ? false : true) : never;

type ExpectedHashFilter = readonly [
  string | Record<string, unknown>,
  ...(string | Record<string, unknown>)[],
];
type ExpectedHash<K extends string> = true extends IsUnion<K> ? Parameters[] : Parameters;

/** @internal */
function isPermittedScalar(value: unknown): boolean {
  return PERMITTED_SCALAR_TYPES.some((type) => type(value));
}

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging -- Ruby `include` (json.rb:47-49); the class/interface merge is how `include()` surfaces on the type side.
export interface Parameters {
  toJSON: Included<typeof ToJsonWithActiveSupportEncoder>["toJSON"];
  deepMerge(other: Parameters | Record<string, unknown>, block?: ConflictBlock<unknown>): this;
  deepMergeBang(other: Parameters | Record<string, unknown>, block?: ConflictBlock<unknown>): this;
}

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class Parameters {
  /** @internal */
  protected parameters: HashWithIndifferentAccess<unknown>;
  private _permitted: boolean;
  private loggingContext: Record<string, unknown>;
  private _convertedArrays?: Hash<unknown[], true>;

  static permitAllParameters = false;
  static actionOnUnpermittedParameters: OnUnpermitted = false;
  declare static alwaysPermittedParameters: string[];
  declare alwaysPermittedParameters: string[];

  static {
    cattrAccessor.call(this, "alwaysPermittedParameters", { default: ["controller", "action"] });
  }

  static hookIntoYamlLoading(): void {
    YAML.loadTags["!ruby/hash-with-ivars:ActionController::Parameters"] = rbModName(this)!;
    YAML.loadTags["!ruby/hash:ActionController::Parameters"] = rbModName(this)!;
  }

  constructor(
    parameters: Record<string, unknown> | Hash<string, unknown> = {},
    loggingContext: Record<string, unknown> = {},
  ) {
    this.parameters = withIndifferentAccess(parameters);
    this.loggingContext = loggingContext;
    this._permitted = Parameters.permitAllParameters;
  }

  static nestedAttribute(key: string, value: unknown): boolean {
    return (
      /^-?\d+$/.test(key) &&
      (value instanceof Hash || isPlainObject(value) || value instanceof Parameters)
    );
  }

  isPermitted(): boolean {
    return this._permitted;
  }

  permit(...filters: (string | Record<string, unknown>)[]): Parameters {
    return this.permitFilters(filters, {
      onUnpermitted: Parameters.actionOnUnpermittedParameters,
      explicitArrays: false,
    });
  }

  permitBang(): this {
    this.eachPair(([_key, value]) => {
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

  require(key: string[]): unknown[];
  require(key: string): unknown;
  require(key: string | string[]): unknown {
    if (Array.isArray(key)) {
      return key.map((k) => this.require(k));
    }
    const value = this.get(key);
    if (value === false || (value !== null && value !== undefined && !isBlank(value))) {
      return value;
    }
    throw new ParameterMissing(key, [...this.parameters.keys()]);
  }

  declare required: Parameters["require"];

  expect<K extends string>(filter: Record<K, ExpectedHashFilter>): ExpectedHash<K>;
  expect(key: string): unknown;
  expect(...keys: [string, string, ...string[]]): unknown[];
  expect(...filters: (string | Record<string, unknown>)[]): unknown;
  expect(...filters: (string | Record<string, unknown>)[]): unknown {
    const flatFilters = filters.flat();
    const params = this.permitFilters(filters);
    const keys = flatFilters.flatMap((f) => (typeof f === "string" ? [f] : Object.keys(f)));
    const values = params.require(keys);
    return values.length === 1 ? values[0] : values;
  }

  expectBang<K extends string>(filter: Record<K, ExpectedHashFilter>): ExpectedHash<K>;
  expectBang(key: string): unknown;
  expectBang(...keys: [string, string, ...string[]]): unknown[];
  expectBang(...filters: (string | Record<string, unknown>)[]): unknown;
  expectBang(...filters: (string | Record<string, unknown>)[]): unknown {
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
    return this._convertHashesToParameters(key, this.parameters.get(key));
  }

  set(key: string, value: unknown): void {
    this.parameters.set(key, value);
  }

  hasValue(value: unknown): boolean {
    return aryIncludes([...this.eachValue()], this.convertValueToParameters(value));
  }

  declare isValue: Parameters["hasValue"];

  include(key: string): boolean {
    return this.parameters.include(key);
  }

  declare hasKey: Parameters["include"];
  declare isKey: Parameters["include"];
  declare member: Parameters["include"];

  exclude(key: string): boolean {
    return !this.parameters.include(key);
  }

  get keys(): string[] {
    return [...this.parameters.keys()];
  }

  get values(): unknown[] {
    return [...toEnum(this, "eachValue")];
  }

  isEmpty(): boolean {
    return isEmpty(this.parameters);
  }

  except(...keys: string[]): Parameters {
    return this._newWithInheritedPermitted(this.parameters.except(...keys));
  }

  declare without: Parameters["except"];

  slice(...keys: string[]): Parameters {
    return this._newWithInheritedPermitted(this.parameters.slice(...keys));
  }

  sliceBang(...keys: string[]): this {
    this.parameters.sliceBang(...keys);
    return this;
  }

  extractBang(...keys: string[]): Parameters {
    return this._newWithInheritedPermitted(this.parameters.extractBang(...keys));
  }

  merge(otherHash: Parameters | Record<string, unknown>): Parameters {
    const otherData = otherHash instanceof Parameters ? otherHash.toH() : otherHash;
    return this._newWithInheritedPermitted(this.parameters.merge(otherData));
  }

  mergeBang(otherHash: Parameters | Record<string, unknown>, block?: ConflictBlock<unknown>): this {
    const otherData = otherHash instanceof Parameters ? otherHash.toH() : otherHash;
    this.parameters.mergeBang(otherData, ...(block ? [block] : []));
    return this;
  }

  /** @inventedArm isPlainObject — PERMANENT */
  isDeepMerge(otherHash: unknown): boolean {
    return (
      isPlainObject(otherHash) ||
      (typeof otherHash === "object" &&
        otherHash !== null &&
        isModuleIncluded(otherHash.constructor as { prototype: object }, DeepMergeable))
    );
  }

  reverseMerge(otherHash: Parameters | Record<string, unknown>): Parameters {
    const otherData = otherHash instanceof Parameters ? otherHash.toH() : otherHash;
    return this._newWithInheritedPermitted(withIndifferentAccess(otherData).merge(this.parameters));
  }

  declare withDefaults: Parameters["reverseMerge"];

  reverseMergeBang(otherHash: Parameters | Record<string, unknown>): this {
    const otherData = otherHash instanceof Parameters ? otherHash.toH() : otherHash;
    this.parameters.mergeBang(otherData, (_key: string, left: unknown, _right: unknown) => left);
    return this;
  }

  declare withDefaultsBang: Parameters["reverseMergeBang"];

  transformKeys(fn: (key: string) => string): Parameters {
    return this._newWithInheritedPermitted(this.parameters.transformKeys(fn));
  }

  transformKeysBang(fn: (key: string) => string): this {
    this.parameters.transformKeysBang(fn);
    return this;
  }

  deepTransformKeys(fn: (key: string) => string): Parameters {
    return this._newWithInheritedPermitted(
      (this._deepTransformKeysInObject(this.parameters, fn) as Parameters).toUnsafeH(),
    );
  }

  deepTransformKeysBang(fn: (key: string) => string): this {
    this.parameters = withIndifferentAccess(
      (this._deepTransformKeysInObject(this.parameters, fn) as Parameters).toUnsafeH(),
    );
    return this;
  }

  transformValues(fn: (value: unknown) => unknown): Parameters {
    return this._newWithInheritedPermitted(
      this.parameters.transformValues((v) => fn(this.convertValueToParameters(v))),
    );
  }

  transformValuesBang(fn: (value: unknown) => unknown): this {
    this.parameters.transformValuesBang((v) => fn(this.convertValueToParameters(v)));
    return this;
  }

  select(fn: (key: string, value: unknown) => boolean): Parameters {
    return this._newWithInheritedPermitted(this.parameters.select(fn));
  }

  selectBang(fn: (key: string, value: unknown) => boolean): this {
    this.parameters.selectBang(fn);
    return this;
  }

  declare keepIf: Parameters["selectBang"];

  reject(fn: (key: string, value: unknown) => boolean): Parameters {
    return this._newWithInheritedPermitted(this.parameters.reject(fn));
  }

  rejectBang(fn: (key: string, value: unknown) => boolean): this {
    this.parameters.rejectBang(fn);
    return this;
  }

  declare deleteIf: Parameters["rejectBang"];

  compact(): Parameters {
    return this._newWithInheritedPermitted(
      this.parameters.compact() as HashWithIndifferentAccess<unknown>,
    );
  }

  compactBang(): this | null {
    return this.parameters.compactBang() ? this : null;
  }

  compactBlank(): Parameters {
    return this.reject((_k, v) => isBlank(v));
  }

  compactBlankBang(): this {
    return this.rejectBang((_k, v) => isBlank(v));
  }

  valuesAt(...keys: string[]): unknown[] {
    return this.convertValueToParameters(this.parameters.valuesAt(...keys)) as unknown[];
  }

  eachPair(): Enumerator<[string, unknown]>;
  eachPair(block: (pair: [string, unknown]) => void): this;
  eachPair(block?: (pair: [string, unknown]) => void): this | Enumerator<[string, unknown]> {
    if (!block) return toEnum(this, "eachPair");
    eachPair(this.parameters, (key, value) => {
      block([key, this._convertHashesToParameters(key, value)]);
    });

    return this;
  }

  declare each: Parameters["eachPair"];

  eachValue(): Enumerator<unknown>;
  eachValue(block: (value: unknown) => void): this;
  eachValue(block?: (value: unknown) => void): this | Enumerator<unknown> {
    if (!block) return toEnum(this, "eachValue");
    eachPair(this.parameters, (key, value) => {
      block(this._convertHashesToParameters(key, value));
    });

    return this;
  }

  eachKey(): Enumerator<string>;
  eachKey(block: (key: string) => void): this;
  eachKey(block?: (key: string) => void): this | Enumerator<string> {
    if (!block) return toEnum(this, "eachKey");
    for (const key of this.parameters.keys()) {
      block(key);
    }
    return this;
  }

  fetch(key: string, ...args: unknown[]): unknown {
    const blockGiven = rbBlockGivenP(args[args.length - 1]) ? (args.pop() as () => unknown) : null;
    return this.convertValueToParameters(
      this.parameters.fetch(key, () => {
        if (blockGiven) {
          return blockGiven();
        } else {
          return aryFetch(
            args,
            0,
            blockOf(() => {
              throw new ParameterMissing(key, [...this.parameters.keys()]);
            }),
          );
        }
      }),
    );
  }

  dig(...keys: (string | number)[]): unknown {
    this._convertHashesToParameters(keys[0] as string, this.parameters.get(keys[0] as string));
    return this.parameters.dig(...(keys as [string, ...(string | number)[]]));
  }

  delete(key: string, block?: (key: string) => unknown): unknown {
    return this.convertValueToParameters(this.parameters.delete(key, block));
  }

  toH(block?: (key: string, value: unknown) => [string, unknown]): Record<string, unknown> {
    if (!this._permitted) {
      throw new UnfilteredParameters();
    }
    const result = this._convertParametersToHashes(this.parameters, "toH");
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
      return this._convertParametersToHashes(this.parameters, "toHash") as Record<string, unknown>;
    }
    throw new UnfilteredParameters();
  }

  asJson(options: Record<string, unknown> | null = null): Record<string, unknown> {
    return asJson(this.parameters, options) as Record<string, unknown>;
  }

  toUnsafeH(): Record<string, unknown> {
    return this._convertParametersToHashes(this.parameters, "toUnsafeH") as Record<string, unknown>;
  }

  declare toUnsafeHash: Parameters["toUnsafeH"];

  stringifyKeys(): Parameters {
    return rbObjDup(this);
  }

  get convertedArrays(): Hash<unknown[], true> {
    this._convertedArrays ??= new Hash<unknown[], true>();
    return this._convertedArrays;
  }

  toQuery(args?: string): string {
    return toQuery(this.toH(), args);
  }

  declare toParam: Parameters["toQuery"];

  equals(other: unknown): boolean {
    if (rbObjRespondTo(other, "isPermitted")) {
      return (
        this.isPermitted() === (other as Parameters).isPermitted() &&
        rbEqual(this.parameters, (other as Parameters).parameters)
      );
    } else {
      return this === other;
    }
  }

  eql(other: unknown): boolean {
    return (
      rbObjClass(this) === rbObjClass(other) &&
      this.isPermitted() === (other as Parameters).isPermitted() &&
      rbEql(this.parameters, (other as Parameters).parameters)
    );
  }

  hash(): number {
    return rbHash([this.constructor, this.parameters, this._permitted]);
  }

  toString(): string {
    return rbInspect(this.parameters);
  }

  inspect(): string {
    return `#<${rbModName(rbObjClass(this))} ${rbInspect(this.parameters)} permitted: ${this._permitted}>`;
  }

  initWith(coder: Psych.Coder): void {
    switch (coder[coderTag]) {
      case "!ruby/hash:ActionController::Parameters":
        this.parameters = withIndifferentAccess({ ...coder });
        this._permitted = false;
        break;
      case "!ruby/hash-with-ivars:ActionController::Parameters":
        this.parameters = withIndifferentAccess(coder["elements"] as Record<string, unknown>);
        this._permitted = (coder["ivars"] as Record<string, boolean>)[":@permitted"];
        break;
      case "!ruby/object:ActionController::Parameters":
        this.parameters = coder["parameters"] as HashWithIndifferentAccess<unknown>;
        this._permitted = coder["permitted"] as boolean;
        break;
    }
  }

  encodeWith(coder: Psych.Coder): void {
    coder["parameters"] = this.parameters;
    coder["permitted"] = this._permitted;
  }

  deepDup(): Parameters {
    const duplicate = new (this.constructor as typeof Parameters)(
      deepDup(this.parameters),
      this.loggingContext,
    );
    duplicate._permitted = this._permitted;
    return duplicate;
  }

  extractValue(
    key: string,
    { delimiter = "_" }: { delimiter?: string | RegExp } = {},
  ): string[] | null {
    const value = this.parameters.get(key);
    return value == null ? null : (rbFSend(value, "split", delimiter, -1) as string[]);
  }

  private _hashFilter(
    params: Parameters,
    filter: Record<string, unknown>,
    {
      onUnpermitted = Parameters.actionOnUnpermittedParameters,
      explicitArrays = false,
    }: { onUnpermitted?: OnUnpermitted; explicitArrays?: boolean } = {},
  ): void {
    this.slice(...Object.keys(filter)).each(([key, value]) => {
      if (value == null || value === false) return;
      if (!this.hasKey(key)) return;
      const result = this.permitValue(value, filter[key], { onUnpermitted, explicitArrays });
      if (result != null) params.set(key, result);
    });
  }

  private _newWithInheritedPermitted(
    data: Record<string, unknown> | Hash<string, unknown>,
  ): Parameters {
    const p = new Parameters(data, this.loggingContext);
    p._permitted = this._permitted;
    return p;
  }

  private _convertParametersToHashes(value: unknown, using: string): unknown {
    if (Array.isArray(value)) {
      return value.map((v) => this._convertParametersToHashes(v, using));
    }
    if (value instanceof Hash) {
      const result: Record<string, unknown> = {};
      for (const [k, v] of value) {
        result[k as string] = this._convertParametersToHashes(v, using);
      }
      return result;
    }
    if (value instanceof Parameters) {
      if (using === "toUnsafeH") {
        return value.toUnsafeH();
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
    const converted = this.convertValueToParameters(value);
    if (converted !== value) {
      this.parameters.set(key, converted);
    }
    return converted;
  }

  /** @internal */
  isNestedAttributes(): boolean {
    return this.parameters.any(([k, v]) => Parameters.nestedAttribute(k, v));
  }

  /** @internal */
  eachNestedAttribute(fn: (value: unknown) => unknown): Parameters {
    const hash = new Parameters();
    this.each(([k, v]) => {
      if (Parameters.nestedAttribute(k, v)) hash.set(k, fn(v));
    });
    return hash;
  }

  /** @internal */
  permitFilters(
    filters: (string | Record<string, unknown>)[],
    {
      onUnpermitted = null,
      explicitArrays = true,
    }: { onUnpermitted?: OnUnpermitted; explicitArrays?: boolean } = {},
  ): Parameters {
    const params = new Parameters();

    for (const filter of filters.flat()) {
      if (typeof filter === "string") {
        this.permittedScalarFilter(params, filter);
      } else if (typeof filter === "object" && filter !== null) {
        this._hashFilter(params, filter, { onUnpermitted, explicitArrays });
      }
    }

    this.unpermittedParametersBang(params, { onUnpermitted });

    return params.permitBang();
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
    if (Array.isArray(value)) {
      if (this.convertedArrays.has(value)) return value;
      const converted = value.map((_) => this.convertValueToParameters(_));
      this.convertedArrays.set(rbObjDup(converted), true);
      return converted;
    } else if (value instanceof Hash || isPlainObject(value)) {
      return new (this.constructor as typeof Parameters)(
        value as Hash<string, unknown>,
        this.loggingContext,
      );
    } else {
      return value;
    }
  }

  /** @internal */
  _deepTransformKeysInObjectBang(object: unknown, block: (key: string) => string): unknown {
    if (object instanceof Hash || isPlainObject(object)) {
      for (const key of hashKeys<string>(object)) {
        const value = hashDelete(object, key);
        hashAset(object, block(key), this._deepTransformKeysInObjectBang(value, block));
      }
      return object;
    } else if (object instanceof Parameters) {
      if (object.isPermitted()) {
        return deepTransformKeysBang(object.toH(), block);
      } else {
        return deepTransformKeysBang(object.toUnsafeH(), block);
      }
    } else if (Array.isArray(object)) {
      object.forEach((e, i) => (object[i] = this._deepTransformKeysInObjectBang(e, block)));
      return object;
    } else {
      return object;
    }
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
  eachArrayElement(object: unknown, filter: unknown, block: (el: Parameters) => unknown): unknown {
    if (Array.isArray(object)) {
      return filterMap(
        object.filter((el): el is Parameters => el instanceof Parameters),
        block,
      );
    } else if (object instanceof Parameters) {
      if (object.isNestedAttributes() && !this.isSpecifyNumericKeys(filter)) {
        return object.eachNestedAttribute(block as (v: unknown) => unknown);
      }
    }
    return undefined;
  }

  /** @internal */
  unpermittedParametersBang(
    params: Parameters,
    {
      onUnpermitted = Parameters.actionOnUnpermittedParameters,
    }: { onUnpermitted?: OnUnpermitted } = {},
  ): void {
    if (!onUnpermitted) return;
    const unpermittedKeys = this.unpermittedKeys(params);
    if (unpermittedKeys.length > 0) {
      switch (onUnpermitted) {
        case "log": {
          const name = "unpermitted_parameters.action_controller";
          Notifications.instrument(name, {
            keys: unpermittedKeys,
            context: this.loggingContext,
          });
          break;
        }
        case "raise":
          throw new UnpermittedParameters(unpermittedKeys);
      }
    }
  }

  /** @internal */
  unpermittedKeys(params: Parameters): string[] {
    return this.keys
      .filter((key) => !params.keys.includes(key))
      .filter((key) => !this.alwaysPermittedParameters.includes(key));
  }

  /** @internal */
  permittedScalarFilter(params: Parameters, permittedKey: string): void {
    if (this.hasKey(permittedKey) && isPermittedScalar(this.get(permittedKey))) {
      params.set(permittedKey, this.get(permittedKey));
    }

    this.eachKey((key) => {
      const match = /\(\d+[if]?\)$/.exec(key);
      if (!match) return;
      if (key.slice(0, match.index) !== permittedKey) return;

      if (isPermittedScalar(this.get(key))) params.set(key, this.get(key));
    });
  }

  /** @internal */
  isNonScalar(value: unknown): boolean {
    return Array.isArray(value) || value instanceof Parameters;
  }

  /** @internal */
  hashFilter(
    params: Parameters,
    filter: Record<string, unknown>,
    {
      onUnpermitted = Parameters.actionOnUnpermittedParameters,
      explicitArrays = false,
    }: { onUnpermitted?: OnUnpermitted; explicitArrays?: boolean } = {},
  ): void {
    this._hashFilter(params, filter, { onUnpermitted, explicitArrays });
  }

  /** @internal */
  permitValue(
    value: unknown,
    filter: unknown,
    { onUnpermitted, explicitArrays }: { onUnpermitted: OnUnpermitted; explicitArrays: boolean },
  ): unknown {
    if (Array.isArray(filter) && filter.length === 0) {
      return this.permitArrayOfScalars(value);
    }
    if (
      filter !== null &&
      typeof filter === "object" &&
      !Array.isArray(filter) &&
      Object.keys(filter as Record<string, unknown>).length === 0
    ) {
      return this.permitHash(value, filter as Record<string, unknown>, {
        onUnpermitted,
        explicitArrays,
      });
    }
    if (this.isArrayFilter(filter)) {
      return this.permitArrayOfHashes(value, (filter as unknown[])[0], {
        onUnpermitted,
        explicitArrays,
      });
    }
    if (explicitArrays) {
      return this.permitHash(value, filter, { onUnpermitted, explicitArrays });
    }
    if (this.isNonScalar(value)) {
      return this.permitHashOrArray(value, filter, { onUnpermitted, explicitArrays });
    }
    return undefined;
  }

  /** @internal */
  permitArrayOfScalars(value: unknown): unknown {
    if (Array.isArray(value) && value.every((el) => isPermittedScalar(el))) return value;
    return undefined;
  }

  /** @internal */
  permitArrayOfHashes(
    value: unknown,
    filter: unknown,
    { onUnpermitted, explicitArrays }: { onUnpermitted: OnUnpermitted; explicitArrays: boolean },
  ): unknown {
    return this.eachArrayElement(value, filter, (el) =>
      el.permitFilters(
        (Array.isArray(filter) ? filter : [filter]) as (string | Record<string, unknown>)[],
        { onUnpermitted, explicitArrays },
      ),
    );
  }

  /** @internal */
  permitHash(
    value: unknown,
    filter: Record<string, unknown> | unknown,
    { onUnpermitted, explicitArrays }: { onUnpermitted: OnUnpermitted; explicitArrays: boolean },
  ): unknown {
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
      { onUnpermitted, explicitArrays },
    );
  }

  /** @internal */
  permitHashOrArray(
    value: unknown,
    filter: unknown,
    { onUnpermitted, explicitArrays }: { onUnpermitted: OnUnpermitted; explicitArrays: boolean },
  ): unknown {
    const arr = this.permitArrayOfHashes(value, filter, { onUnpermitted, explicitArrays });
    if (arr != null) return arr;
    return this.permitHash(value, filter, { onUnpermitted, explicitArrays });
  }

  /** @internal */
  permitAnyInParameters(params: Parameters): Parameters {
    const sanitized = new Parameters();
    params.each(([k, v]) => {
      if (isPermittedScalar(v)) {
        sanitized.set(k, v);
      } else if (Array.isArray(v)) {
        sanitized.set(k, this.permitAnyInArray(v));
      } else if (v instanceof Parameters) {
        sanitized.set(k, this.permitAnyInParameters(v));
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

  private _deepTransformKeysInObject(object: unknown, block: (key: string) => string): unknown {
    if (object instanceof Hash || isPlainObject(object)) {
      const result = new (this.constructor as typeof Parameters)();
      eachPair(object as Hash<string, unknown>, (key, value) => {
        result.set(block(key), this._deepTransformKeysInObject(value, block));
      });
      return result;
    } else if (object instanceof Parameters) {
      if (object.isPermitted()) {
        return deepTransformKeys(object.toH(), block);
      } else {
        return deepTransformKeys(object.toUnsafeH(), block);
      }
    } else if (Array.isArray(object)) {
      return object.map((e) => this._deepTransformKeysInObject(e, block));
    } else {
      return object;
    }
  }

  /** @internal */
  protected initializeCopy(_source: this): void {
    this.parameters = this.parameters.dup();
  }
}

Parameters.prototype.hasKey = Parameters.prototype.include;
Parameters.prototype.isKey = Parameters.prototype.include;
Parameters.prototype.isValue = Parameters.prototype.hasValue;
Parameters.prototype.member = Parameters.prototype.include;
Parameters.prototype.toParam = Parameters.prototype.toQuery;
Parameters.prototype.toUnsafeHash = Parameters.prototype.toUnsafeH;
Parameters.prototype.each = Parameters.prototype.eachPair;
Parameters.prototype.required = Parameters.prototype.require;
Parameters.prototype.without = Parameters.prototype.except;
Parameters.prototype.keepIf = Parameters.prototype.selectBang;
Parameters.prototype.deleteIf = Parameters.prototype.rejectBang;
Parameters.prototype.withDefaults = Parameters.prototype.reverseMerge;
Parameters.prototype.withDefaultsBang = Parameters.prototype.reverseMergeBang;

include(Parameters, DeepMergeable);
include(Parameters, ToJsonWithActiveSupportEncoder);

interface StrongParametersHost {
  _params: Parameters | Record<string, unknown> | null;
  actionName: string;
  request: {
    parameters: Record<string, unknown>;
    filteredParameters(): Record<string, unknown>;
  };
}

export class StrongParameters {
  get params(): Parameters {
    const self = this as unknown as StrongParametersHost;
    return (self._params ??= new Parameters(self.request.parameters, {
      controller: this.constructor.name,
      action: self.actionName,
      request: self.request,
      params: self.request.filteredParameters(),
    })) as Parameters;
  }

  set params(value: Parameters | Record<string, unknown>) {
    (this as unknown as StrongParametersHost)._params = isPlainObject(value)
      ? new Parameters(value)
      : value;
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  if (value instanceof Parameters) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

rbModConstSet(ActionController, "ParameterMissing", ParameterMissing);
rbModConstSet(ActionController, "Parameters", Parameters);
Parameters.hookIntoYamlLoading();
