import { asJson } from "@blazetrails/activesupport";

import { NoMethodError, RuntimeError } from "./attribute-assignment.js";

export interface SerializationRecord {
  _attributes?: unknown;
  attributes?: Record<string, unknown>;
  constructor: { name: string };
}

export type SerializableHash = Record<string, unknown> & PromiseLike<Record<string, unknown>>;

export function serializableHash(
  record: SerializationRecord,
  options: SerializeOptions = {},
  sync = false,
): Record<string, unknown> {
  if (options.include != null && (options.include as unknown) !== false && !sync) {
    return thenableHash(
      () => serializableHash(record, options, true),
      async () => {
        await preloadIncludes(record, options);
        return serializableHash(record, options, true);
      },
    );
  }
  const instanceAttrNames = (record as { attributeNamesForSerialization?: () => string[] })
    .attributeNamesForSerialization;
  let keys =
    typeof instanceAttrNames === "function"
      ? instanceAttrNames.call(record)
      : attributeNamesForSerialization(record);

  if (options.only != null) {
    const present = new Set(keys);
    const seen = new Set<string>();
    keys = rubyArray(options.only).filter((k) => present.has(k) && !seen.has(k) && seen.add(k));
  } else if (options.except != null) {
    const except = rubyArray(options.except);
    keys = keys.filter((k) => !except.includes(k));
  }

  const result = serializableAttributes(record, keys);

  if (options.methods) {
    for (const method of options.methods) {
      const value = (record as Record<string, unknown>)[method];
      if (typeof value === "function") {
        safeSet(result, method, (value as () => unknown).call(record));
      } else if (method in record) {
        safeSet(result, method, value);
      } else {
        throw new NoMethodError(
          `undefined method '${method}' for an instance of ${record.constructor.name}`,
        );
      }
    }
  }

  serializableAddIncludes(record, options, (assocName, records, opts) => {
    if (isSerializableCollection(records)) {
      if ((records as { loaded?: unknown }).loaded === false) {
        throw new RuntimeError(
          `Cannot serialize the '${assocName}' association: its collection is not ` +
            `loaded. Load it first (await the association, or eager-load via ` +
            `includes / preload) — synchronous serialization cannot query the database.`,
        );
      }
      const items = Array.isArray(records) ? records : Array.from(records);
      safeSet(
        result,
        assocName,
        items.map((r) => serializableHash(r as SerializationRecord, opts, true)),
      );
    } else if (
      records &&
      typeof records === "object" &&
      (records as unknown as SerializationRecord)._attributes
    ) {
      safeSet(
        result,
        assocName,
        serializableHash(records as unknown as SerializationRecord, opts, true),
      );
    } else {
      safeSet(result, assocName, records);
    }
  });

  return result;
}

export class Serialization {
  serializableHash(options?: SerializeOptions): Record<string, unknown> {
    return serializableHash(this as unknown as SerializationRecord, options);
  }

  readAttributeForSerialization(key: string): unknown {
    return readAttributeForSerialization(this as unknown as SerializationRecord, key);
  }
}

export interface SerializeOptions {
  only?: string | string[];
  except?: string | string[];
  methods?: string[];
  include?:
    | Record<string, SerializeOptions>
    | Array<string | Record<string, SerializeOptions>>
    | string;
}

export function readAttributeForSerialization(record: SerializationRecord, key: string): unknown {
  const attrStore = record._attributes as AttributeStore;
  const hasStore =
    (attrStore && typeof (attrStore as { fetchValue?: unknown }).fetchValue === "function") ||
    attrStore instanceof Map;

  const inRecord = key in (record as object);
  const reader = inRecord ? (record as Record<string, unknown>)[key] : undefined;

  if (inRecord && typeof reader !== "function") return reader;

  const storeHasKey =
    attrStore instanceof Map
      ? attrStore.has(key)
      : attrStore && typeof (attrStore as { keys?: unknown }).keys === "function"
        ? (attrStore as { keys(): string[] }).keys().includes(key)
        : false;
  if (hasStore && storeHasKey) {
    return attrStore instanceof Map
      ? attrStore.get(key)
      : (attrStore as { fetchValue(k: string): unknown }).fetchValue(key);
  }

  if (inRecord) return (reader as () => unknown).call(record);
  throw new NoMethodError(
    `undefined method '${key}' for an instance of ${record.constructor.name}`,
  );
}

/** @internal */
export function attributeNamesForSerialization(record: SerializationRecord): string[] {
  const attrStore = record._attributes as AttributeStore;
  let keys: string[];
  if (
    attrStore &&
    typeof (attrStore as { keys?: unknown }).keys === "function" &&
    !(attrStore instanceof Map)
  ) {
    keys = (attrStore as { keys(): string[] }).keys();
  } else if (attrStore instanceof Map) {
    keys = Array.from(attrStore.keys());
  } else if (record.attributes) {
    keys = Object.keys(record.attributes);
  } else {
    keys = [];
  }
  return keys;
}

/** @internal */
type AttributeStore =
  | { keys(): string[]; fetchValue(key: string): unknown }
  | Map<string, unknown>
  | null
  | undefined;

/** @internal */
export function serializableAttributes(
  record: SerializationRecord,
  attributeNames: readonly string[],
): Record<string, unknown> {
  const instanceRead = (record as { readAttributeForSerialization?: (key: string) => unknown })
    .readAttributeForSerialization;
  const read =
    typeof instanceRead === "function"
      ? (n: string) => instanceRead.call(record, n)
      : (n: string) => readAttributeForSerialization(record, n);
  const result: Record<string, unknown> = {};
  for (const n of attributeNames) {
    safeSet(result, n, read(n));
  }
  return result;
}

/** @internal */
export function serializableAddIncludes(
  record: SerializationRecord,
  options: SerializeOptions = {},
  callback: (association: string, records: unknown, opts: SerializeOptions) => void,
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
        for (const [k, v] of Object.entries(n)) safeSet(includes as Record<string, unknown>, k, v);
      } else {
        safeSet(includes as Record<string, unknown>, n, {});
      }
    }
  }

  for (const [assocName, assocOpts] of Object.entries(includes)) {
    const records = sendAssociation(record, assocName);
    if (records !== null && records !== undefined) {
      callback(assocName, records, assocOpts);
    }
  }
}

function isIncludeHash(value: unknown): value is Record<string, SerializeOptions> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Recursively lazy-load every `include`d association (and nested includes) via
 * `resolveIncludeAsync`, so the subsequent sync pass finds them all loaded.
 *
 * The entry walk is `serialization.rb:188`'s own
 * `Array(includes).flat_map { |n| n.is_a?(Hash) ? n.to_a : [[n, {}]] }`, taken
 * without the `Hash[...]` that wraps it there. That wrapper only dedupes, and
 * dropping it can visit a name twice — which for a preload is a superset of the
 * work, never a miss, so the sync pass still finds everything loaded.
 * `serializableAddIncludes` keeps the wrapper, since Rails' own iteration is
 * over the deduped hash.
 *
 * @noRailsEquivalent Serves trails' awaitable `serializable_hash` (RFC 0022 b2).
 */
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
      ? Array.isArray(records)
        ? records
        : Array.from(records)
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
  if (raw !== null && raw !== undefined) return raw;

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

export function asJsonThenable(
  serialize: () => Record<string, unknown>,
  root: boolean | string | null | undefined,
  element: () => string,
  options: SerializeOptions,
): Record<string, unknown> {
  const finalize = (raw: unknown): Record<string, unknown> => {
    const hash = asJson(raw) as Record<string, unknown>;
    if (root === false || root == null) return hash;
    return { [root === true ? element() : root]: hash };
  };
  if (options.include == null || (options.include as unknown) === false)
    return finalize(serialize());
  return thenableHash(
    () => finalize(serialize()),
    async () => finalize(await serialize()),
  );
}

export function thenableHash(
  sync: () => Record<string, unknown>,
  async: () => Promise<Record<string, unknown>>,
): SerializableHash {
  let memo: Record<string, unknown> | undefined;
  const built = () => (memo ??= sync());
  const proxy = new Proxy({} as Record<string, unknown>, {
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
      if (!Object.prototype.hasOwnProperty.call(obj, key)) return undefined;
      const desc = Object.getOwnPropertyDescriptor(obj, key)!;
      desc.configurable = true;
      return desc;
    },
    getPrototypeOf() {
      return Object.prototype;
    },
  });
  return proxy as SerializableHash;
}

/** @internal */
function sendAssociation(record: SerializationRecord, name: string): unknown {
  if (!(name in record)) {
    throw new NoMethodError(
      `undefined method '${name}' for an instance of ${record.constructor.name}`,
    );
  }
  const reader = (record as Record<string, unknown>)[name];
  return typeof reader === "function" ? (reader as () => unknown).call(record) : reader;
}

/** @internal */
function isSerializableCollection(value: unknown): value is Iterable<unknown> {
  if (Array.isArray(value)) return true;
  if (value == null || typeof value !== "object") return false;
  if ((value as SerializationRecord)._attributes) return false;
  return typeof (value as { [Symbol.iterator]?: unknown })[Symbol.iterator] === "function";
}

/** @noRailsEquivalent PERMANENT */
function safeSet(target: Record<string, unknown>, key: string, value: unknown): void {
  Object.defineProperty(target, key, {
    value,
    writable: true,
    enumerable: true,
    configurable: true,
  });
}

function rubyArray(value: string | string[] | null | undefined): string[] {
  if (value == null) return [];
  const list = Array.isArray(value) ? value : [value];
  return list.map((entry) => String(entry));
}
