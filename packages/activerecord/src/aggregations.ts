import type { Base } from "./base.js";
import { addAggregateReflection, create } from "./reflection.js";
import { assertValidKeys, camelize, constantize, prepend } from "@blazetrails/activesupport";

/**
 * Aggregation cache and composed-of value-object support.
 *
 * Mirrors: ActiveRecord::Aggregations
 */

// ---------------------------------------------------------------------------
// Cache accessors
// ---------------------------------------------------------------------------

export function getAggregationCache(record: Base): Map<string, unknown> {
  const self = record as any;
  if (!self._aggregationCache) self._aggregationCache = new Map<string, unknown>();
  return self._aggregationCache as Map<string, unknown>;
}

/** @internal */
export function clearAggregationCache(record: Base): void {
  const self = record as any;
  if (self._aggregationCache && record.isPersisted()) {
    (self._aggregationCache as Map<string, unknown>).clear();
  }
}

// ---------------------------------------------------------------------------
// ClassMethods
// ---------------------------------------------------------------------------

interface ComposedOfOptions {
  /**
   * Ruby's `:class_name`, constantized at reader/writer time
   * (aggregations.rb:249-253, 262) and defaulting to `name.camelize`. The class
   * itself is also accepted, for a value object that is not registered as a
   * constant.
   */
  className?: (new (...args: any[]) => any) | string;
  mapping?: [string, string][] | [string, string];
  /** Ruby's `:constructor`; a String names a class method, as `send` does. */
  constructorFn?: ((...args: any[]) => any) | string;
  converter?: (value: unknown) => unknown;
  allowNil?: boolean;
}

/**
 * Configure a composed-of value object on a model.
 *
 * Mirrors: ActiveRecord::Aggregations::ClassMethods#composed_of
 */
export function composedOf(
  modelClass: typeof Base,
  partId: string,
  options: ComposedOfOptions,
): void {
  assertValidKeys(options as unknown as Record<string, unknown>, [
    "className",
    "mapping",
    "allowNil",
    "constructorFn",
    "converter",
  ]);

  includeAggregations(modelClass);

  const name = partId;
  const className = options.className ?? camelize(name);
  // `options[:mapping] || [ name, name ]`, then `[ mapping ] unless
  // mapping.first.is_a?(Array)` (aggregations.rb:229-230) — the inferred pair
  // names the attribute after the aggregation itself.
  let mapping: [string, string][] | [string, string] = options.mapping ?? [name, name];
  if (!Array.isArray(mapping[0])) mapping = [mapping] as [string, string][];
  const allowNil = options.allowNil ?? false;
  const constructor = options.constructorFn ?? "new";
  const converter = options.converter;

  readerMethod(modelClass, name, className, mapping as [string, string][], allowNil, constructor);
  writerMethod(modelClass, name, className, mapping as [string, string][], allowNil, converter);

  // Rails forwards the options hash whole (aggregations.rb:244). When
  // `className` was given as the value-object CLASS rather than its name, the
  // two keys the reflection reads are overlaid onto it.
  const reflection = create(
    "composedOf",
    partId,
    null,
    typeof options.className === "function"
      ? { ...options, className: options.className.name, anonymousClass: options.className }
      : { ...options },
    modelClass,
  );
  addAggregateReflection(modelClass, partId, reflection);
}

/**
 * `class_name.constantize` (aggregations.rb:249-253, 262) — resolved where Ruby
 * resolves it, inside the generated method, so a value object registered after
 * the `composedOf` call still binds. A class passed in place of its name is
 * already the resolved constant.
 *
 * @internal
 */
function resolveClass(
  className: (new (...args: any[]) => any) | string,
): new (...args: any[]) => any {
  return typeof className === "string"
    ? (constantize(className) as new (...args: any[]) => any)
    : className;
}

/**
 * @internal
 * Mirrors: ActiveRecord::Aggregations::ClassMethods#reader_method
 */
function readerMethod(
  modelClass: typeof Base,
  name: string,
  className: (new (...args: any[]) => any) | string,
  mapping: [string, string][],
  allowNil: boolean,
  constructor: ((...args: any[]) => any) | string,
): void {
  const existing = Object.getOwnPropertyDescriptor(modelClass.prototype, name);
  Object.defineProperty(modelClass.prototype, name, {
    enumerable: existing?.enumerable ?? false,
    get(this: Base): unknown {
      const cache = getAggregationCache(this);
      if (
        cache.get(name) == null &&
        (!allowNil || mapping.some(([key]) => this.readAttribute(key) != null))
      ) {
        const attrs = mapping.map(([key]) => this.readAttribute(key));
        // `constructor.respond_to?(:call)` (aggregations.rb:251-253); the String
        // arm is Ruby's `class_name.constantize.send(constructor, *attrs)`, whose
        // default `:new` has no `send`-able JS spelling.
        const object =
          typeof constructor === "function"
            ? constructor(...attrs)
            : constructor === "new"
              ? new (resolveClass(className))(...attrs)
              : (resolveClass(className) as any)[constructor](...attrs);
        cache.set(name, object == null ? object : Object.freeze(object));
      }
      return cache.get(name) ?? null;
    },
    configurable: true,
  });
}

function _decompose(
  record: Base,
  cache: Map<string, unknown>,
  name: string,
  mapping: [string, string][],
  value: unknown,
): void {
  const result: Record<string, unknown> = {};
  for (const [modelAttr, valueAttr] of mapping) {
    const prop = (value as any)[valueAttr];
    const resolved = typeof prop === "function" ? (prop as () => unknown).call(value) : prop;
    if (resolved === undefined) {
      throw new TypeError(
        `Cannot decompose value: '${valueAttr}' is not a property of the assigned object`,
      );
    }
    result[modelAttr] = resolved;
  }
  for (const [modelAttr] of mapping) record.writeAttribute(modelAttr, result[modelAttr]);
  // Mirrors Rails: part.dup.freeze — copy first, then freeze the copy.
  const proto = Object.getPrototypeOf(value as object) ?? Object.prototype;
  cache.set(name, Object.freeze(Object.assign(Object.create(proto), value)));
}

/**
 * @internal
 * Mirrors: ActiveRecord::Aggregations::ClassMethods#writer_method
 */
function writerMethod(
  modelClass: typeof Base,
  name: string,
  className: (new (...args: any[]) => any) | string,
  mapping: [string, string][],
  allowNil: boolean,
  converter?: (value: unknown) => unknown,
): void {
  const existing = Object.getOwnPropertyDescriptor(modelClass.prototype, name);
  Object.defineProperty(modelClass.prototype, name, {
    enumerable: existing?.enumerable ?? false,
    get: existing?.get,
    set(this: Base, value: unknown): void {
      const klass = resolveClass(className);
      const cache = getAggregationCache(this);
      // allow_nil: true → clear all mapped columns when nil and store null in cache.
      // allow_nil: false (default) → fall through so decomposition raises naturally
      // (mirrors Rails: nil.send(:method) → NoMethodError).
      if ((value === null || value === undefined) && allowNil === true) {
        for (const [modelAttr] of mapping) this.writeAttribute(modelAttr, null);
        cache.set(name, null);
        return;
      }
      if (value instanceof klass) {
        for (const [modelAttr, valueAttr] of mapping)
          this.writeAttribute(modelAttr, value[valueAttr]);
        cache.set(
          name,
          Object.freeze(Object.assign(Object.create(Object.getPrototypeOf(value)), value)),
        );
        return;
      }
      // Rails guard: converter is never called when part.nil? (aggregations.rb:265).
      if (converter && value != null) {
        const converted = converter(value);
        if (converted == null) {
          for (const [modelAttr] of mapping) this.writeAttribute(modelAttr, null);
          cache.set(name, null);
        } else if (converted instanceof klass) {
          for (const [modelAttr, valueAttr] of mapping)
            this.writeAttribute(modelAttr, (converted as any)[valueAttr]);
          cache.set(
            name,
            Object.freeze(
              Object.assign(Object.create(Object.getPrototypeOf(converted)), converted),
            ),
          );
        } else {
          // Converter returned a non-null non-klass value: decompose via the mapped
          // accessor, mirroring Rails which falls through unconditionally after conversion
          // (aggregations.rb:279-281 — no second is_a?(klass) check).
          _decompose(this, cache, name, mapping, converted);
        }
        return;
      }
      // Non-klass, no converter (or nil with allowNil:false): decompose by reading each
      // mapped attribute. Mirrors Rails: part.send(value_attr) raises NoMethodError when
      // the method doesn't exist; we throw if the property is absent.
      _decompose(this, cache, name, mapping, value);
    },
    configurable: true,
  });
}

// ---------------------------------------------------------------------------
// Instance methods
// ---------------------------------------------------------------------------

/**
 * Give the dup an independent shallow copy of the source's aggregation cache.
 * Cached value objects are frozen so sharing references is safe.
 *
 * Mirrors: ActiveRecord::Aggregations#initialize_dup — Rails copies the source's
 * `@aggregation_cache` because Ruby's `Object#dup` has already shared the ivar
 * onto the new record before `initialize_dup` runs. Trails builds the dup via a
 * fresh `new ctor({})` (see persistence.ts `dup`), so the dup starts with an
 * empty cache and we must copy from `other` (the source) explicitly rather than
 * from `this`.
 */
export function copyAggregationCacheForDup(this: Base, other: unknown): void {
  const src = (other as { _aggregationCache?: Map<string, unknown> })?._aggregationCache;
  if (src) (this as { _aggregationCache?: Map<string, unknown> })._aggregationCache = new Map(src);
}

type ReloadOptions = { lock?: boolean | string; unscoped?: boolean };
type ReloadFn<T extends Base> = (this: T, options?: ReloadOptions) => Promise<T>;

/**
 * Clear the aggregation cache before reloading from the database, then delegate
 * to the inherited `reload` (Ruby `super`). `inheritedReload` is the reload
 * method that sat on the prototype when Aggregations was mixed in, captured at
 * include time so the delegation walks the real ancestry
 * (Aggregations → AutosaveAssociation → Persistence) rather than hardcoding a
 * jump straight to Persistence#reload. This keeps the autosave hop live for
 * when AutosaveAssociation#reload is ported (it resets marked-for-destruction /
 * loaded association targets before its own `super`).
 *
 * Mirrors: ActiveRecord::Aggregations#reload
 */
export function reload<T extends Base>(inheritedReload: ReloadFn<T>): ReloadFn<T> {
  return function (this: T, options?: ReloadOptions): Promise<T> {
    clearAggregationCache(this);
    return inheritedReload.call(this, options);
  };
}

/**
 * Symbol marking a model prototype that has already had Aggregations mixed in.
 * Mirrors Rails' `unless self < Aggregations` guard in `composed_of` — the
 * module is included at most once per class regardless of how many
 * `composed_of` declarations it carries.
 */
const aggregationsIncluded = Symbol.for("@blazetrails/activerecord:aggregationsIncluded");

/**
 * Lazily mix Aggregations' instance methods onto a model that declares
 * `composed_of`. Mirrors Rails, where `ActiveRecord::Aggregations` is NOT
 * unconditionally included on `Base` — `composed_of` pulls it in only when a
 * model actually needs it (aggregations.rb:228-229). Models without a
 * `composed_of` declaration never carry `reload`/`initialize_dup` overrides.
 *
 * The overrides wrap the model's inherited methods (Ruby's `super`): `reload`
 * clears the aggregation cache first, and `initialize_dup` copies the cache
 * before running the inherited dup chain (Locking::Optimistic → Timestamp).
 */
export function includeAggregations(modelClass: typeof Base): void {
  const proto = modelClass.prototype as Record<string | symbol, any>;
  // `unless self < Aggregations`: skip when the module already sits in the
  // ancestry, whether from a prior composed_of on this class OR inherited from a
  // superclass that declared one. A prototype-chain read (not hasOwnProperty)
  // mirrors Ruby's ancestry check and stops a subclass from re-wrapping reload/
  // initialize_dup (which would run the cache copy twice).
  if (proto[aggregationsIncluded]) return;
  Object.defineProperty(proto, aggregationsIncluded, {
    value: true,
    configurable: true,
    enumerable: false,
  });

  // Aggregations#reload clears the aggregation cache then calls super. Capture
  // the inherited reload (Ruby `super`) at include time so the delegation walks
  // the real ancestry (Aggregations → AutosaveAssociation → Persistence) rather
  // than hardcoding a jump straight to Persistence#reload. Keeps the autosave hop
  // live for when AutosaveAssociation#reload is ported.
  const inheritedReload = proto.reload as ReloadFn<Base>;
  Object.defineProperty(proto, "reload", {
    value: reload(inheritedReload),
    writable: true,
    configurable: true,
    enumerable: false,
  });

  // Aggregations#init_internals supers then allocates the cache
  // (aggregations.rb:21-23); Aggregations#initialize_dup copies it, then supers
  // (aggregations.rb:6-9). `prepend()` is the ancestry splice `include
  // Aggregations` performs: both links sit above the chains base.ts wires.
  prepend(proto, {
    initInternals,
    initializeDup(this: Base, super_: (other: unknown) => void, other: unknown): void {
      copyAggregationCacheForDup.call(this, other);
      super_(other);
    },
  });
}

/**
 * @internal
 * Mirrors: ActiveRecord::Aggregations#init_internals
 */
function initInternals(this: Base, super_: () => void): void {
  super_();
  (this as any)._aggregationCache = new Map<string, unknown>();
}
