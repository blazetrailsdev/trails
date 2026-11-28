import { asJson, indexWith, isBlank } from "@blazetrails/activesupport";
import { rbCheckArrayType } from "@blazetrails/ruby-compat/array";
import { hashAset } from "@blazetrails/ruby-compat/hash";
import { rbModInstanceMethod } from "@blazetrails/ruby-compat/include";
import { camelized, rbFSend, rbObjRespondTo } from "@blazetrails/ruby-compat/object";

import { NoMethodError, RuntimeError } from "./attribute-assignment.js";

export interface SerializationRecord {
  attributes?: Record<string, unknown>;
  constructor: { name: string };
  readAttributeForSerialization(key: string): unknown;
  attributeNamesForSerialization(): string[];
  serializableAttributes(attributeNames: readonly string[]): Record<string, unknown>;
  serializableAddIncludes(
    options: SerializeOptions,
    block: (association: string, records: unknown, opts: SerializeOptions) => void,
  ): void;
}

export type SerializableHash = Record<string, unknown> & PromiseLike<Record<string, unknown>>;

export function serializableHash(
  this: SerializationRecord,
  options: SerializeOptions | null = null,
  sync = false,
): Record<string, unknown> {
  if (options?.include != null && (options.include as unknown) !== false && !sync) {
    return thenableHash(
      () => serializableHash.call(this, options, true),
      async () => {
        await preloadIncludes(this, options);
        return serializableHash.call(this, options, true);
      },
    );
  }
  let attributeNames = this.attributeNamesForSerialization();

  if (options == null || isBlank(options)) return this.serializableAttributes(attributeNames);

  if (options.only != null) {
    const present = new Set(attributeNames);
    const seen = new Set<string>();
    attributeNames = rubyArray(options.only)
      .map((k) => String(k))
      .filter((k) => present.has(k) && !seen.has(k) && seen.add(k));
  } else if (options.except != null) {
    const except = rubyArray(options.except).map((k) => String(k));
    attributeNames = attributeNames.filter((k) => !except.includes(k));
  }

  const result = this.serializableAttributes(attributeNames);

  for (const method of rubyArray(options.methods)) {
    const n = String(method);
    hashAset(
      result,
      method,
      rbFSend(this, camelized(n.endsWith("?") ? `is_${n.slice(0, -1)}` : n)),
    );
  }

  this.serializableAddIncludes(options, (assocName, records, opts) => {
    if (isSerializableCollection(records)) {
      if ((records as { loaded?: unknown }).loaded === false) {
        throw new RuntimeError(
          `Cannot serialize the '${assocName}' association: its collection is not ` +
            `loaded. Load it first (await the association, or eager-load via ` +
            `includes / preload) — synchronous serialization cannot query the database.`,
        );
      }
      const items = rbCheckArrayType(records);
      if (items == null) throw new NoMethodError("undefined method 'map' for nil");
      hashAset(
        result,
        assocName,
        items.map((a) => {
          if (!rbObjRespondTo(a, "serializableHash")) {
            throw new NoMethodError(
              `undefined method 'serializableHash' for an instance of ${(a as object).constructor.name}`,
            );
          }
          return (a as { serializableHash(o: SerializeOptions): unknown }).serializableHash(opts);
        }),
      );
    } else {
      if (!rbObjRespondTo(records, "serializableHash")) {
        throw new NoMethodError(
          `undefined method 'serializableHash' for an instance of ${(records as object).constructor.name}`,
        );
      }
      hashAset(
        result,
        assocName,
        (records as { serializableHash(o: SerializeOptions): unknown }).serializableHash(opts),
      );
    }
  });

  return result;
}

export class Serialization {
  declare serializableHash: typeof serializableHash;

  declare readAttributeForSerialization: typeof readAttributeForSerialization;

  /** @internal */
  declare attributeNamesForSerialization: typeof attributeNamesForSerialization;

  /** @internal */
  declare serializableAttributes: typeof serializableAttributes;

  /** @internal */
  declare serializableAddIncludes: typeof serializableAddIncludes;
}

export interface SerializeOptions {
  only?: string | string[];
  except?: string | string[];
  methods?: string | string[];
  include?:
    | Record<string, SerializeOptions>
    | Array<string | Record<string, SerializeOptions>>
    | string;
}

export function readAttributeForSerialization(this: SerializationRecord, key: string): unknown {
  return rbFSend(this, key);
}

/** @internal */
export function attributeNamesForSerialization(this: SerializationRecord): string[] {
  return Object.keys(this.attributes!);
}

/** @internal */
export function serializableAttributes(
  this: SerializationRecord,
  attributeNames: readonly string[],
): Record<string, unknown> {
  const readable = attributeNames.filter((n) => {
    if (Object.hasOwn(this, n) || !(n in this) || n in Object.prototype) return true;
    let link = Object.getPrototypeOf(this) as object;
    while (!Object.hasOwn(link, n)) link = Object.getPrototypeOf(link) as object;
    if (typeof Object.getOwnPropertyDescriptor(link, n)!.value !== "function") return true;
    const { owner } = rbModInstanceMethod(this.constructor as never, n);
    return typeof owner === "function" && this instanceof owner;
  });
  return indexWith(readable, (n) => this.readAttributeForSerialization(n));
}

/** @internal */
export function serializableAddIncludes(
  this: SerializationRecord,
  options: SerializeOptions = {},
  block: (association: string, records: unknown, opts: SerializeOptions) => void,
): void {
  const includeOpt = options.include as
    | string
    | Array<string | Record<string, SerializeOptions>>
    | Record<string, SerializeOptions>
    | false
    | null
    | undefined;
  if (includeOpt == null || includeOpt === false) return;

  let includes: Record<string, SerializeOptions>;
  if (isIncludeHash(includeOpt)) {
    includes = includeOpt;
  } else {
    includes = {};
    for (const n of Array.isArray(includeOpt) ? includeOpt : [includeOpt]) {
      if (isIncludeHash(n)) {
        for (const [k, v] of Object.entries(n)) hashAset(includes, k, v);
      } else {
        hashAset(includes, n, {});
      }
    }
  }

  for (const [assocName, assocOpts] of Object.entries(includes)) {
    const records = sendAssociation(this, assocName);
    if (records !== null && records !== undefined) {
      block(assocName, records, assocOpts);
    }
  }
}

Serialization.prototype.serializableHash = serializableHash;
Serialization.prototype.readAttributeForSerialization = readAttributeForSerialization;
Serialization.prototype.attributeNamesForSerialization = attributeNamesForSerialization;
Serialization.prototype.serializableAttributes = serializableAttributes;
Serialization.prototype.serializableAddIncludes = serializableAddIncludes;

function isIncludeHash(value: unknown): value is Record<string, SerializeOptions> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function preloadIncludes(
  record: SerializationRecord,
  options: SerializeOptions,
): Promise<void> {
  const includeOpt = options.include;
  if (includeOpt == null || (includeOpt as unknown) === false) return;
  const entries: Array<[string, SerializeOptions]> = isIncludeHash(includeOpt)
    ? Object.entries(includeOpt)
    : (Array.isArray(includeOpt) ? includeOpt : [includeOpt]).flatMap((n) =>
        isIncludeHash(n) ? Object.entries(n) : [[n, {}] as [string, SerializeOptions]],
      );
  for (const [name, opts] of entries) {
    const records = await resolveIncludeAsync(record, name);
    const children = isSerializableCollection(records)
      ? (rbCheckArrayType(records) ?? [])
      : records != null && typeof records === "object"
        ? [records]
        : [];
    for (const child of children) {
      await preloadIncludes(child as SerializationRecord, opts);
    }
  }
}

async function resolveIncludeAsync(record: SerializationRecord, name: string): Promise<unknown> {
  const raw = sendAssociation(record, name);
  if (isSerializableCollection(raw)) {
    const coll = raw as { loaded?: unknown; load?: () => unknown };
    if (coll.loaded === false && typeof coll.load === "function") {
      await coll.load();
    }
    return raw;
  }
  if (raw !== null && raw !== undefined) {
    const proxy = raw as { isAttached?: unknown; load?: () => unknown };
    if (typeof proxy.isAttached === "function") await proxy.load?.();
    return raw;
  }

  const associationFn = (record as { association?: (n: string) => unknown }).association;
  if (typeof associationFn === "function") {
    let holder: { loaded?: unknown; loadTarget?: () => unknown } | undefined;
    try {
      holder = associationFn.call(record, name) as typeof holder;
    } catch {
      return raw;
    }
    if (holder && holder.loaded === false && typeof holder.loadTarget === "function") {
      return await holder.loadTarget();
    }
  }
  return raw;
}

/** @noRailsEquivalent PERMANENT */
export function asJsonThenable(
  serialize: () => Record<string, unknown>,
  block: (hash: Record<string, unknown>) => Record<string, unknown>,
  options: SerializeOptions,
): Record<string, unknown> {
  const finalize = (raw: unknown): Record<string, unknown> =>
    block(asJson(raw) as Record<string, unknown>);
  if (options.include == null || (options.include as unknown) === false)
    return finalize(serialize());
  return thenableHash(
    () => finalize(serialize()),
    async () => finalize(await serialize()),
  );
}

/** @noRailsEquivalent PERMANENT */
export function thenableHash(
  sync: () => Record<string, unknown>,
  async: () => Promise<Record<string, unknown>>,
): SerializableHash {
  let memo: Record<string, unknown> | undefined;
  const built = () => (memo ??= sync());
  const proxy = new Proxy(
    {},
    {
      get(_t, key) {
        if (key === "then")
          return (onF?: ((v: unknown) => unknown) | null, onR?: ((e: unknown) => unknown) | null) =>
            async().then(onF, onR);
        if (key === "catch") return (onR?: ((e: unknown) => unknown) | null) => async().catch(onR);
        if (key === "finally") return (onF?: (() => void) | null) => async().finally(onF);
        return built()[key as string];
      },
      has(_t, key) {
        if (key === "then" || key === "catch" || key === "finally") return false;
        return key in built();
      },
      ownKeys() {
        return Reflect.ownKeys(built());
      },
      getOwnPropertyDescriptor(_t, key) {
        const obj = built();
        if (!Object.hasOwn(obj, key)) return undefined;
        const desc = Object.getOwnPropertyDescriptor(obj, key)!;
        desc.configurable = true;
        return desc;
      },
      getPrototypeOf() {
        return Object.prototype;
      },
    },
  );
  return proxy as SerializableHash;
}

/** @internal */
function sendAssociation(record: SerializationRecord, name: string): unknown {
  if (!(name in record)) {
    throw new NoMethodError(
      `undefined method '${name}' for an instance of ${record.constructor.name}`,
    );
  }
  const reader: unknown = Reflect.get(record, name);
  return typeof reader === "function" ? (reader as () => unknown).call(record) : reader;
}

/** @internal */
function isSerializableCollection(value: unknown): value is Iterable<unknown> {
  return rbObjRespondTo(value, "toAry");
}

function rubyArray(value: string | string[] | null | undefined): string[] {
  if (value == null) return [];
  const list = Array.isArray(value) ? value : [value];
  return list.map((entry) => String(entry));
}

type MemberFn = (...args: never[]) => unknown;

type DataKeys<M> = {
  [K in keyof M]-?: M[K] extends MemberFn ? never : M[K] extends PromiseLike<unknown> ? never : K;
}[keyof M] &
  string;

type ThenableKeys<M> = {
  [K in keyof M]-?: M[K] extends PromiseLike<unknown> ? K : never;
}[keyof M] &
  string;

type ReaderKeys<M> = {
  [K in keyof M]-?: M[K] extends MemberFn ? (M[K] extends () => unknown ? K : never) : K;
}[keyof M] &
  string;

type Elements<X> = X extends readonly (infer E)[] ? E : X;

type Camelize<S extends string> = S extends `${infer H}_${infer T}`
  ? `${H}${Capitalize<Camelize<T>>}`
  : S;

type Underscore<S extends string> = S extends `${infer C}${infer R}`
  ? `${C extends Lowercase<C> ? C : `_${Lowercase<C>}`}${Underscore<R>}`
  : S;

type MethodMember<S extends string> = S extends `${infer P}?` ? Camelize<`is_${P}`> : Camelize<S>;

type RailsMethodName<K extends string> =
  | K
  | Underscore<K>
  | (K extends `is${infer P}`
      ? P extends Capitalize<P>
        ? `${Underscore<Uncapitalize<P>>}?`
        : never
      : never);

/** @noRailsEquivalent PERMANENT */
export type AttributeKeys<M, B = object> = Exclude<DataKeys<M>, keyof B>;

/** @noRailsEquivalent PERMANENT */
export type AssociationKeys<M, B = object> = Exclude<ThenableKeys<M>, keyof B>;

/** @noRailsEquivalent PERMANENT */
export type MethodNames<M, B = object> = RailsMethodName<Exclude<ReaderKeys<M>, keyof B>>;

/** @noRailsEquivalent PERMANENT */
export type AssociationTarget<M, A extends keyof M> = NonNullable<Elements<Awaited<M[A]>>>;

/** @noRailsEquivalent PERMANENT */
export interface TypedSerializeOptions<M, B = object> {
  only?: AttributeKeys<M, B> | readonly AttributeKeys<M, B>[] | null;
  except?: AttributeKeys<M, B> | readonly AttributeKeys<M, B>[] | null;
  methods?: MethodNames<M, B> | readonly MethodNames<M, B>[] | null;
  include?:
    | AssociationKeys<M, B>
    | TypedIncludeHash<M, B>
    | readonly (AssociationKeys<M, B> | TypedIncludeHash<M, B>)[]
    | null;
}

/** @noRailsEquivalent PERMANENT */
export type TypedIncludeHash<M, B = object> = {
  [A in AssociationKeys<M, B>]?: TypedSerializeOptions<AssociationTarget<M, A>, B>;
};

/** @noRailsEquivalent PERMANENT */
export type JsonValue<V> = V extends string | number | boolean | null
  ? V
  : V extends undefined
    ? null
    : V extends bigint
      ? string
      : V extends { asJson(): infer R }
        ? JsonValue<R>
        : V extends { toJSON(): infer R }
          ? R
          : V extends readonly (infer E)[]
            ? JsonValue<E>[]
            : V extends PromiseLike<unknown>
              ? Record<string, never>
              : V extends object
                ? { [K in keyof V]: JsonValue<V[K]> }
                : unknown;

type Present<X> = X extends null | undefined ? never : X;

type SelectedKeys<M, O, B> = O extends { only: infer On }
  ? [Present<On>] extends [never]
    ? ExceptKeys<M, O, B>
    : Extract<Elements<Present<On>>, AttributeKeys<M, B>>
  : ExceptKeys<M, O, B>;

type ExceptKeys<M, O, B> = O extends { except: infer Ex }
  ? Exclude<AttributeKeys<M, B>, Elements<Present<Ex>>>
  : AttributeKeys<M, B>;

type MethodsPart<M, O> = O extends { methods: infer Ms }
  ? {
      [S in Elements<Present<Ms>> & string]: MethodMember<S> extends keyof M
        ? M[MethodMember<S>] extends MemberFn
          ? M[MethodMember<S>] extends () => infer R
            ? R
            : never
          : M[MethodMember<S>]
        : never;
    }
  : unknown;

type IncludeKeys<E> = E extends string ? E : E extends object ? keyof E & string : never;

type IncludeOptionsFor<E, K extends string> = E extends string
  ? E extends K
    ? object
    : never
  : E extends { [P in K]?: infer Opt }
    ? Opt
    : never;

type IncludedKeys<M, O> = O extends { include: infer I }
  ? IncludeKeys<Elements<Present<I>>> & keyof M
  : never;

type IncludedOptions<O, K extends string> = O extends { include: infer I }
  ? IncludeOptionsFor<Elements<Present<I>>, K>
  : never;

type RecordJson<T, Opt, B> = T extends readonly (infer R)[]
  ? Serialized<R, Opt, B>[]
  : Serialized<T, Opt, B>;

type NullableIncludes<M, O> = {
  [K in IncludedKeys<M, O>]: null extends Awaited<M[K]>
    ? K
    : undefined extends Awaited<M[K]>
      ? K
      : never;
}[IncludedKeys<M, O>];

type IncludesPart<M, O, B> = {
  [K in Exclude<IncludedKeys<M, O>, NullableIncludes<M, O>>]: RecordJson<
    Awaited<M[K]>,
    IncludedOptions<O, K & string>,
    B
  >;
} & {
  [K in NullableIncludes<M, O>]?: RecordJson<
    NonNullable<Awaited<M[K]>>,
    IncludedOptions<O, K & string>,
    B
  >;
};

type Flatten<T> = { [K in keyof T]: T[K] } & {};

/** @noRailsEquivalent PERMANENT */
export type Serialized<M, O = object, B = object> = Flatten<
  { [K in SelectedKeys<M, O, B>]: M[K] } & MethodsPart<M, O> & IncludesPart<M, O, B>
>;

/** @noRailsEquivalent PERMANENT */
export type SerializedJson<M, O = object, B = object> = JsonValue<Serialized<M, O, B>>;
