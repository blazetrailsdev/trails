/**
 * CurrentAttributes — thread-isolated attribute store.
 * Mirrors ActiveSupport::CurrentAttributes behavior.
 *
 * Each subclass maintains its own isolated storage using AsyncLocalStorage
 * (when available) or falling back to a module-level store. In Node.js
 * tests, we use a simple synchronous store (no async context).
 */

import { defineCallbacks, runCallbacks, setCallback } from "./callbacks.js";
import { CodeGenerator } from "./code-generator.js";
import { include, Module } from "./include.js";

const __FILE__ = import.meta.url;
const __LINE__ = 0;

type AttributeValue = unknown;
type DefaultValue<T> = T | (() => T);

interface AttributeDefinition<T = AttributeValue> {
  default?: DefaultValue<T>;
}

/** A `:reset` callback, instance-exec'd (Rails' `set_callback :reset`). */
type ResetCallback = (this: CurrentAttributes) => void;

/**
 * Base class for current-attributes objects. Subclass and call
 * `static attribute(name, options?)` to define attributes.
 */
export abstract class CurrentAttributes {
  /** @internal per-class attribute definitions */
  public static _definitions: Map<string, AttributeDefinition> = new Map();
  /** @internal per-class instance storage (one per class, reset on each "request") */
  public static _instances: WeakMap<typeof CurrentAttributes, CurrentAttributes> = new WeakMap();

  static {
    // Mirrors `include ActiveSupport::Callbacks; define_callbacks :reset` — the
    // chain lives on the prototype so subclasses inherit it (copy-on-write) and
    // `runCallbacks` can resolve it from an instance.
    defineCallbacks(CurrentAttributes.prototype, "reset");
  }

  /** @internal per-instance attribute values */
  protected _attributes: Map<string, AttributeValue> = new Map();

  // -------------------------------------------------------------------------
  // Class-level API
  // -------------------------------------------------------------------------

  /**
   * Define one or more attributes on this class.
   * ```ts
   * static { this.attribute("user", "account"); }
   * ```
   */
  private static readonly RESTRICTED_NAMES = new Set(["reset", "set"]);

  /**
   * Mirrors: CurrentAttributes.attribute (current_attributes.rb:114-140).
   *
   * current_attributes.rb:128 makes a second
   * `define_cached_method("#{name}=")` call for the writer. A TS attribute is
   * one accessor pair, not two methods, so the writer has no separate
   * descriptor to cache or to copy onto the owner; both Rails definitions land
   * on the reader's entry.
   */
  static attribute(...names: string[]): void;
  static attribute(name: string, options: AttributeDefinition): void;
  static attribute(name: string, ...rest: unknown[]): void {
    const ctor = this as unknown as CurrentAttributesClass;
    if (!Object.prototype.hasOwnProperty.call(ctor, "_definitions")) {
      ctor._definitions = new Map(ctor._definitions);
    }
    const lastArg = rest[rest.length - 1];
    const hasOptions =
      lastArg !== undefined &&
      typeof lastArg === "object" &&
      lastArg !== null &&
      !Array.isArray(lastArg);
    const options: AttributeDefinition = hasOptions ? (lastArg as AttributeDefinition) : {};
    const extraNames = hasOptions ? rest.slice(0, -1) : rest;
    const allNames = [name, ...(extraNames as string[])];
    const restricted = allNames.filter((n) => CurrentAttributes.RESTRICTED_NAMES.has(n));
    if (restricted.length > 0) {
      throw new Error(`Restricted attribute names: ${restricted.join(", ")}`);
    }

    for (const n of allNames) ctor._definitions.set(n, options);

    CodeGenerator.batch(generatedAttributeMethods.call(ctor), __FILE__, __LINE__, (owner) => {
      for (const name of allNames) {
        owner.defineCachedMethod(name, { namespace: "current_attributes" }, (batch) => {
          batch.push((mod) =>
            Object.defineProperty(mod, name, {
              get(this: CurrentAttributes) {
                return this._get(name);
              },
              set(this: CurrentAttributes, value: unknown) {
                this._set(name, value);
              },
              configurable: true,
            }),
          );
        });
      }
    });
  }

  /** Returns the singleton instance for this class (creates one if needed). */
  static instance<T extends typeof CurrentAttributes>(this: T): InstanceType<T> {
    const ctor = this as unknown as CurrentAttributesClass;
    if (!ctor._instances.has(ctor)) {
      ctor._instances.set(ctor, new (ctor as unknown as new () => CurrentAttributes)());
    }
    return ctor._instances.get(ctor) as InstanceType<T>;
  }

  /**
   * Registers a callback to run before #reset clears the attributes. Mirrors
   * Rails' `before_reset` (`set_callback :reset, :before`).
   */
  static beforeReset<T extends typeof CurrentAttributes>(
    this: T,
    callback: (this: InstanceType<T>) => void,
  ): void {
    setCallback(this.prototype, "reset", "before", callback as ResetCallback);
  }

  /**
   * Registers a callback to run after #reset clears the attributes. Mirrors
   * Rails' `resets` / `after_reset` (`set_callback :reset, :after`).
   */
  static resets<T extends typeof CurrentAttributes>(
    this: T,
    callback: (this: InstanceType<T>) => void,
  ): void {
    setCallback(this.prototype, "reset", "after", callback as ResetCallback);
  }

  /** Alias for {@link CurrentAttributes.resets} (Rails' `after_reset`). */
  static afterReset<T extends typeof CurrentAttributes>(
    this: T,
    callback: (this: InstanceType<T>) => void,
  ): void {
    this.resets(callback);
  }

  /**
   * Resets this class's instance: runs the `:reset` callbacks around clearing
   * all attributes. Mirrors Rails
   * `run_callbacks :reset { self.attributes = resolve_defaults }` — clearing
   * `_attributes` is equivalent since defaults are re-evaluated lazily on read.
   */
  static reset(): void {
    const inst = this.instance();
    runCallbacks(inst, "reset", () => {
      inst._attributes.clear();
    });
  }

  /** Set multiple attributes at once via the class. */
  static set(attrs: Record<string, AttributeValue>): void {
    const inst = this.instance();
    for (const [k, v] of Object.entries(attrs)) {
      (inst as unknown as Record<string, unknown>)[k] = v;
    }
  }

  /** Delegate class-level method calls to the instance. */
  static new<T extends typeof CurrentAttributes>(this: T): InstanceType<T> {
    return new (this as unknown as new () => CurrentAttributes)() as InstanceType<T>;
  }

  // Proxy class-level attribute reads/writes to instance via Proxy trick.
  // We do this in the constructor of concrete subclasses.
  static _setupProxy(): void {
    // noop: JS doesn't allow class-level dynamic property dispatch easily;
    // users call CurrentAttributes.instance().attr or override accessors.
  }

  // -------------------------------------------------------------------------
  // Instance-level API
  // -------------------------------------------------------------------------

  protected _get(name: string): AttributeValue {
    const ctor = this.constructor as CurrentAttributesClass;
    if (this._attributes.has(name)) return this._attributes.get(name);
    const def = ctor._definitions.get(name);
    if (def && def.default !== undefined) {
      const val =
        typeof def.default === "function" ? (def.default as () => unknown)() : def.default;
      this._attributes.set(name, val);
      return val;
    }
    return undefined;
  }

  protected _set(name: string, value: AttributeValue): void {
    this._attributes.set(name, value);
  }

  get attributes(): Record<string, AttributeValue> {
    const ctor = this.constructor as CurrentAttributesClass;
    const result: Record<string, AttributeValue> = {};
    for (const [name] of ctor._definitions) {
      if (this._attributes.has(name)) {
        result[name] = this._attributes.get(name);
      }
    }
    return result;
  }
}

// Internal alias for static method use
type CurrentAttributesClass = typeof CurrentAttributes & {
  _definitions: Map<string, AttributeDefinition>;
  _instances: WeakMap<typeof CurrentAttributes, CurrentAttributes>;
  _generatedAttributeMethods?: Module;
};

/**
 * @internal Rails-private helper. Mirrors: CurrentAttributes#generated_attribute_methods
 *
 *   def generated_attribute_methods
 *     @generated_attribute_methods ||= Module.new.tap { |mod| include mod }
 *   end
 *
 * (current_attributes.rb:166-168.) The `||=` is on a per-class ivar, so the
 * memo is checked as an *own* property — a subclass builds and includes its
 * own module rather than reusing its parent's.
 */
function generatedAttributeMethods(this: CurrentAttributesClass): Module {
  if (!Object.prototype.hasOwnProperty.call(this, "_generatedAttributeMethods")) {
    const mod = new Module();
    include(this as unknown as new (...args: unknown[]) => unknown, mod);
    this._generatedAttributeMethods = mod;
  }
  return this._generatedAttributeMethods!;
}
