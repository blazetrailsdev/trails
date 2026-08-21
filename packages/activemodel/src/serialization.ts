import { asJson } from "@blazetrails/activesupport";

import { NoMethodError, RuntimeError } from "./attribute-assignment.js";

/** Minimum shape required of a record object passed to serialization helpers. */
export interface SerializationRecord {
  [key: string]: unknown;
  _attributes?: unknown;
  attributes?: Record<string, unknown>;
  readAttribute?: (key: string) => unknown;
  constructor: { name: string };
}

/**
 * A serialized hash that is also awaitable: sync reads fail loud on an unloaded
 * `include`, `await` lazy-loads it (Rails' `to_ary`) and resolves a plain object.
 * Public serializers type their return as the subset `Record<string, unknown>`.
 */
export type SerializableHash = Record<string, unknown> & PromiseLike<Record<string, unknown>>;

/**
 * Serialize a model's attributes to a (possibly awaitable) hash.
 *
 * Mirrors: ActiveModel::Serialization#serializable_hash
 * (serialization.rb:111-138)
 *
 * Rails serializes an `include`d collection via `records.to_ary.map`, where
 * `CollectionProxy#to_ary` lazily loads it. Trails serialization is synchronous
 * and must issue no DB load (RFC 0022 b2). An include-bearing call therefore
 * returns a thenable: sync access fails loud on an unloaded include, `await`
 * lazy-loads it first. A call with no `:include` returns a plain hash like Rails
 * (no awaitable contract), so promise assimilation can't trigger a spurious load.
 *
 * `sync` is the module-private re-entry flag: a real parameter, not an option,
 * so it travels outside the Rails-shaped `options` object and a caller cannot
 * collide with it (even by casting past the type). When true, the body is built
 * synchronously and nested includes build sync too rather than re-wrapping.
 */
export function serializableHash(
  record: SerializationRecord,
  options: SerializeOptions = {},
  sync = false,
): Record<string, unknown> {
  if (options.include != null && (options.include as unknown) !== false && !sync) {
    return thenableHash(
      () => serializableHash(record, options, true),
      async () => {
        // Await: lazy-load every unloaded include (Rails' `to_ary`), then the
        // sync build finds them all loaded.
        await preloadIncludes(record, options);
        return serializableHash(record, options, true);
      },
    );
  }
  // Prefer an instance-level override (Rails' subclass-override
  // semantics) over the standalone helper. The JSON mixin host's
  // protected delegator just forwards to the standalone
  // `attributeNamesForSerialization` function below, so calling it
  // here is safe and respects any genuine override a Model installs.
  const instanceAttrNames = (record as { attributeNamesForSerialization?: () => string[] })
    .attributeNamesForSerialization;
  let keys =
    typeof instanceAttrNames === "function"
      ? instanceAttrNames.call(record)
      : attributeNamesForSerialization(record);

  if (options.only != null) {
    // Rails: `Array(only).map(&:to_s) & attribute_names`. `Array#&` orders by
    // the left operand and dedupes, so the result follows `only`'s order — not
    // the model's declared order — keeping only names the model actually has.
    const present = new Set(keys);
    const seen = new Set<string>();
    keys = rubyArray(options.only).filter((k) => present.has(k) && !seen.has(k) && seen.add(k));
  } else if (options.except != null) {
    // Rails: `attribute_names -= Array(except).map(&:to_s)` keeps
    // `attribute_names`' order, dropping the excluded names.
    const except = rubyArray(options.except);
    keys = keys.filter((k) => !except.includes(k));
  }

  const result = serializableAttributes(record, keys);

  if (options.methods) {
    for (const method of options.methods) {
      if (typeof record[method] === "function") {
        safeSet(result, method, (record[method] as () => unknown)());
      } else if (method in record) {
        safeSet(result, method, record[method]);
      } else {
        throw new NoMethodError(
          `undefined method '${method}' for an instance of ${record.constructor.name}`,
        );
      }
    }
  }

  serializableAddIncludes(record, options, (assocName, records, opts) => {
    // Mirrors `records.to_ary.map` / `records.serializable_hash`
    // (serialization.rb:140-145). Non-obvious divergence: Rails' `to_ary`
    // lazily loads an unloaded collection from the DB, which synchronous
    // serialization cannot do (RFC 0022 b2). A lazy host collection advertises
    // its load state via `loaded` (Rails' `CollectionProxy#loaded?`); we fail
    // loud on an unloaded one rather than emit a misleading `[]`. Iterables
    // with no `loaded` flag (plain arrays, `to_ary`-style wrappers) are ready.
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

/**
 * Serialization mixin contract — provides serializable_hash.
 *
 * Mirrors: ActiveModel::Serialization
 */
export interface Serialization {
  serializableHash(options?: SerializeOptions): Record<string, unknown>;
}

/**
 * Serialization options.
 */
export interface SerializeOptions {
  // Rails coerces via `Array(only).map(&:to_s)`, so a scalar (`only: "name"`)
  // and a list (`only: ["name"]`) are equivalent. See `rubyArray`.
  only?: string | string[];
  except?: string | string[];
  methods?: string[];
  // Mirrors Rails `:include` polymorphism: a single name, an array of
  // names, a hash of name → opts, or — like `include: [:posts, { comments: {} }]`
  // — an array mixing names and hashes.
  include?:
    | Record<string, SerializeOptions>
    | Array<string | Record<string, SerializeOptions>>
    | string;
}

/**
 * Mirrors: ActiveModel::Serialization#read_attribute_for_serialization
 * (serialization.rb:167 `alias :read_attribute_for_serialization :send`).
 * Public in Rails (declared before the `private` section) and overridable.
 *
 * Pure `send(key)`: keying off member *existence* (`key in record`, the JS
 * analog of `respond_to?`), a value member (getter / data property, including a
 * user override of a declared attribute's reader) is returned, a function member
 * (`def name; …; end` / `attr_accessor :name`) is invoked, a present member that
 * yields `undefined` (nil) does not raise, and a missing member raises like
 * `send`'s `NoMethodError`. There is no `attributes`/`readAttribute` fallback: a
 * storeless host that surfaces values only through an `attributes` hash must
 * expose per-key readers (Rails `attr_accessor` parity) — a reader-less key
 * raises `NoMethodError` like Ruby `send`.
 *
 * The one JS-structural divergence: on an `_attributes`-backed record (trails
 * Model / AR) a declared attribute whose name collides with a framework method
 * on the prototype — the canonical case is `attribute("toJSON")`, which
 * `attribute()` cannot install a getter for because `toJSON` is reserved by
 * `JSON.stringify` — resolves `record[key]` to that method, and invoking it
 * would recurse infinitely (serializableHash → read → toJSON → asJson → …). For
 * such a *store attribute* whose member is a function, we read the stored value
 * instead (pinned by "attribute named toJSON does not shadow Model#toJSON"). A
 * value-returning member still wins (reader overrides honored), and a function
 * member that is NOT a store attribute is a genuine method and is invoked.
 */
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

/**
 * Mirrors: ActiveModel::Serialization#attribute_names_for_serialization
 * (serialization.rb:158-160)
 *
 *   def attribute_names_for_serialization
 *     attributes.keys
 *   end
 *
 * Models can override this hook to scope which attributes appear.
 * Trails has multiple attribute storage shapes (AttributeSet via
 * `_attributes`, Map, plain object) so the fallback walks them in
 * order. Virtual attributes (acceptance/confirmation) are filtered
 * out — they aren't real attributes and shouldn't surface in JSON.
 *
 * @internal Rails-private helper.
 */
type AttributeStore =
  | { keys(): string[]; fetchValue(key: string): unknown }
  | Map<string, unknown>
  | null
  | undefined;

/**
 * Mirrors: ActiveModel::Serialization#serializable_attributes
 * (serialization.rb:162-164)
 *
 *   def serializable_attributes(attribute_names)
 *     attribute_names.index_with { |n| read_attribute_for_serialization(n) }
 *   end
 *
 * Builds a `{ name → value }` hash by dispatching each key through
 * `read_attribute_for_serialization` (aliased to `send` by default), so a
 * per-key reader / store attribute is read for every name.
 *
 * @internal Rails-private helper.
 */
export function serializableAttributes(
  record: SerializationRecord,
  attributeNames: readonly string[],
): Record<string, unknown> {
  // Prefer an instance-level override (Rails' subclass-override semantics for
  // `read_attribute_for_serialization`) over the standalone helper, mirroring
  // how `serializableHash` dispatches `attribute_names_for_serialization`.
  const instanceRead = (record as { readAttributeForSerialization?: (key: string) => unknown })
    .readAttributeForSerialization;
  const read =
    typeof instanceRead === "function"
      ? (key: string) => instanceRead.call(record, key)
      : (key: string) => readAttributeForSerialization(record, key);
  const result: Record<string, unknown> = {};
  for (const key of attributeNames) {
    safeSet(result, key, read(key));
  }
  return result;
}

/**
 * Mirrors: ActiveModel::Serialization#serializable_add_includes
 * (serialization.rb:171-183)
 *
 *   def serializable_add_includes(options = {})
 *     return unless includes = options[:include]
 *     unless includes.is_a?(Hash)
 *       includes = Hash[Array(includes).flat_map { |n| n.is_a?(Hash) ? n.to_a : [[n, {}]] }]
 *     end
 *     includes.each do |association, opts|
 *       if records = send(association)
 *         yield association, records, opts
 *       end
 *     end
 *   end
 *
 * The dispatch is Rails' `send(association)` (see `sendAssociation`):
 * it reads the method/accessor named after the association off the
 * record — exactly how a plain ActiveModel object with
 * `attr_accessor :address` serializes `include: :address`, and how
 * activerecord's generated association readers resolve `include:
 * :comments`. activemodel has no association-specific knowledge; it
 * just dispatches by name and yields `(association, records, opts)`
 * per entry, skipping a nil/undefined result as Rails skips a nil
 * `send`.
 *
 * @internal Rails-private helper.
 */
export function serializableAddIncludes(
  record: SerializationRecord,
  options: SerializeOptions = {},
  callback: (association: string, records: unknown, opts: SerializeOptions) => void,
): void {
  // Rails: `return unless includes = options[:include]` skips on
  // nil/false. Empty string is truthy in Ruby, so JS `!` would
  // diverge. Guard explicitly on null/undefined/false to mirror
  // Ruby truthiness without dropping `""`. The `false` branch also
  // protects against untyped JS callers that bypass the
  // `SerializeOptions.include` shape.
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
    // Rails: `if records = send(association)` skips on nil — a defined-but-nil
    // accessor (an `attr_accessor` left unset, or a loaded singular with no
    // row) is falsy and skipped. `sendAssociation` already raised for a name
    // the record does not respond to, mirroring `send`'s NoMethodError.
    if (records !== null && records !== undefined) {
      callback(assocName, records, assocOpts);
    }
  }
}

/**
 * Ruby `n.is_a?(Hash)` for an `:include` entry — a plain object mapping
 * association names to their own options, as against the String/Symbol (a JS
 * string) and Array spellings the same option takes.
 */
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

/**
 * Resolve an `include`d association for the async path, lazy-loading when the
 * reader reports an unloaded target. Collections expose `loaded` + `load()`
 * (Rails' `CollectionProxy`); an unloaded singular reader returns `null`
 * indistinguishably from a genuine nil, so we consult the `association(name)`
 * holder (when present) for `loaded` + `loadTarget()`. No include-bag.
 */
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

/**
 * Build the awaitable hash returned by `as_json` (json.rb:96-108):
 * `serializable_hash(options).as_json`, then root-wrap (Rails' truthiness —
 * false/nil skip, `true` uses the model element name). Plain when there is
 * nothing to load; thenable only for include-bearing calls.
 */
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

/**
 * Wrap a hash so it is usable both synchronously and via `await`. The sync
 * builder runs lazily on first access (memoized), so construction is
 * side-effect-free and the eager build cannot throw before `.then()` reaches
 * the async path — `await` touches only `then`, never the sync build.
 */
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

/**
 * Rails' `send(association)` from `serializable_add_includes`: read the
 * method/accessor named after the association off the record. For a plain
 * ActiveModel object this is the value behind an `attr_accessor :address` /
 * `:friends` (the Rails serialization tests' setup); for activerecord it is
 * the generated association reader. A function-valued member is invoked,
 * mirroring Ruby's `send(:friends)` calling the accessor method.
 *
 * A name the record does not respond to raises, mirroring Ruby `send`'s
 * `NoMethodError` (`serialization.rb:191` calls `send` unconditionally). A
 * defined accessor that returns nil/undefined does NOT raise — the caller
 * treats it as Rails' falsy `if records = send(...)` skip.
 *
 * @internal Rails-private helper.
 */
function sendAssociation(record: SerializationRecord, name: string): unknown {
  if (!(name in record)) {
    throw new NoMethodError(
      `undefined method '${name}' for an instance of ${record.constructor.name}`,
    );
  }
  const reader = record[name];
  return typeof reader === "function" ? (reader as () => unknown).call(record) : reader;
}

/**
 * Whether `send(association)` returned a collection to map element-wise — the
 * JS analog of a Ruby Enumerable. A real array, or any non-string iterable
 * host collection (e.g. activerecord's `CollectionProxy` iterating its loaded
 * records). Single records, strings, and plain objects are not collections.
 *
 * @internal Rails-private helper.
 */
function isSerializableCollection(value: unknown): value is Iterable<unknown> {
  if (Array.isArray(value)) return true;
  if (value == null || typeof value !== "object") return false;
  if ((value as SerializationRecord)._attributes) return false;
  return typeof (value as { [Symbol.iterator]?: unknown })[Symbol.iterator] === "function";
}

/**
 * Set `key` on `target` as an own data property, even when `key` is
 * `__proto__` (or another magic name that has accessors on
 * `Object.prototype`). A plain assignment would invoke the inherited
 * setter and mutate the target's prototype chain. Used everywhere the
 * key may originate from user input — attribute names, include keys,
 * association names from a JSON-decoded options bag.
 *
 * @noRailsEquivalent PERMANENT — Ruby's `hash[key] = value` always writes an
 *   entry; the JS assignment it ports invokes `Object.prototype`'s `__proto__`
 *   setter instead of writing one
 */
function safeSet(target: Record<string, unknown>, key: string, value: unknown): void {
  Object.defineProperty(target, key, {
    value,
    writable: true,
    enumerable: true,
    configurable: true,
  });
}

/**
 * Ruby `Array(x).map(&:to_s)`: coerce `only`/`except` to a list of strings.
 * `nil`/`undefined` → `[]`, a scalar → `[scalar]`, a list → itself, with every
 * entry stringified so `only: :name` (symbol), `only: "name"`, and
 * `only: ["name"]` all behave identically (serialization.rb:130-133).
 */
function rubyArray(value: string | string[] | null | undefined): string[] {
  if (value == null) return [];
  const list = Array.isArray(value) ? value : [value];
  return list.map((entry) => String(entry));
}
