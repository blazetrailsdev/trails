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
import { objectWith } from "./core-ext/object/with.js";
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
 * Mirrors: ActiveSupport::CurrentAttributes::INVALID_ATTRIBUTE_NAMES
 * (current_attributes.rb:95), camelCased by the usual rules.
 */
const INVALID_ATTRIBUTE_NAMES = [
  "set",
  "reset",
  "resets",
  "instance",
  "beforeReset",
  "afterReset",
  "resetAll",
  "clearAll",
];

/**
 * Mirrors: ActiveSupport::CurrentAttributes::NOT_SET (current_attributes.rb:97)
 * — the sentinel that tells `resolve_defaults` an attribute was declared
 * without a `default:`, which is distinct from a default of `nil`.
 */
const NOT_SET: unknown = Object.freeze({});

/**
 * Base class for current-attributes objects. Subclass and call
 * `static attribute(name, options?)` to define attributes.
 */
export abstract class CurrentAttributes {
  /**
   * Mirrors: `class_attribute :defaults, instance_writer: false, default: {}.freeze`
   * (current_attributes.rb:196) — name → default value (or `NOT_SET`).
   */
  public static defaults: Record<string, AttributeValue> = {};
  /** @internal per-class instance storage (one per class, reset on each "request") */
  public static _instances: WeakMap<typeof CurrentAttributes, CurrentAttributes> = new WeakMap();

  static {
    // Mirrors `include ActiveSupport::Callbacks; define_callbacks :reset` — the
    // chain lives on the prototype so subclasses inherit it (copy-on-write) and
    // `runCallbacks` can resolve it from an instance.
    defineCallbacks(CurrentAttributes.prototype, "reset");
  }

  /** Mirrors: `attr_accessor :attributes` (current_attributes.rb:198). */
  attributes: Record<string, AttributeValue>;

  constructor() {
    this.attributes = this.resolveDefaults();
  }

  // -------------------------------------------------------------------------
  // Class-level API
  // -------------------------------------------------------------------------

  /**
   * Mirrors: CurrentAttributes.attribute (current_attributes.rb:113-140).
   *
   * current_attributes.rb:128 makes a second
   * `define_cached_method("#{name}=")` call for the writer. A TS attribute is
   * one accessor pair, not two methods, so the writer has no separate
   * descriptor to cache or to copy onto the owner; both Rails definitions land
   * on the reader's entry.
   */
  static attribute(...names: string[]): void;
  static attribute(name: string, options: AttributeDefinition): void;
  static attribute(...args: unknown[]): void {
    const ctor = this as unknown as CurrentAttributesClass;
    const lastArg = args[args.length - 1];
    const hasOptions = typeof lastArg === "object" && lastArg !== null && !Array.isArray(lastArg);
    const options: AttributeDefinition = hasOptions ? (lastArg as AttributeDefinition) : {};
    const names = (hasOptions ? args.slice(0, -1) : args) as string[];
    const defaultValue: unknown = "default" in options ? options.default : NOT_SET;

    const invalidAttributeNames = names.filter((name) => INVALID_ATTRIBUTE_NAMES.includes(name));
    if (invalidAttributeNames.length > 0) {
      throw new Error(`Restricted attribute names: ${invalidAttributeNames.join(", ")}`);
    }

    CodeGenerator.batch(generatedAttributeMethods.call(ctor), __FILE__, __LINE__, (owner) => {
      for (const name of names) {
        owner.defineCachedMethod(name, { namespace: "current_attributes" }, (batch) => {
          batch.push((mod) =>
            Object.defineProperty(mod, name, {
              get(this: CurrentAttributes) {
                return this.attributes[name];
              },
              set(this: CurrentAttributes, value: unknown) {
                this.attributes[name] = value;
              },
              configurable: true,
            }),
          );
        });
      }
    });

    // Mirrors the two `Delegation.generate(singleton_class, …, to: :instance)`
    // calls (current_attributes.rb:138-139): the reader and the writer are one
    // accessor pair on this side, so one `defineProperty` covers both.
    for (const name of names) {
      Object.defineProperty(ctor, name, {
        configurable: true,
        get(this: typeof CurrentAttributes) {
          return (this.instance() as unknown as Record<string, unknown>)[name];
        },
        set(this: typeof CurrentAttributes, value: unknown) {
          (this.instance() as unknown as Record<string, unknown>)[name] = value;
        },
      });
    }

    ctor.defaults = {
      ...ctor.defaults,
      ...Object.fromEntries(names.map((name) => [name, defaultValue])),
    };
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
    ...methods: (string | ((this: InstanceType<T>) => void))[]
  ): void {
    setCallback(this.prototype, "reset", "before", ...(methods as ResetCallback[]));
  }

  /**
   * Registers a callback to run after #reset clears the attributes. Mirrors
   * Rails' `resets` / `after_reset` (`set_callback :reset, :after`).
   */
  static resets<T extends typeof CurrentAttributes>(
    this: T,
    ...methods: (string | ((this: InstanceType<T>) => void))[]
  ): void {
    setCallback(this.prototype, "reset", "after", ...(methods as ResetCallback[]));
  }

  /** Alias for {@link CurrentAttributes.resets} (Rails' `after_reset`). */
  static afterReset<T extends typeof CurrentAttributes>(
    this: T,
    ...methods: (string | ((this: InstanceType<T>) => void))[]
  ): void {
    this.resets(...methods);
  }

  /** Mirrors: `delegate :reset, to: :instance` (current_attributes.rb:154). */
  static reset(): void {
    this.instance().reset();
  }

  /** Mirrors: `delegate :set, to: :instance` (current_attributes.rb:154). */
  static set<R>(attributes: Record<string, AttributeValue>, block?: () => R): R | void {
    return this.instance().set(attributes, block);
  }

  // -------------------------------------------------------------------------
  // Instance-level API
  // -------------------------------------------------------------------------

  /**
   * Expose one or more attributes within a block. Old values are returned
   * after the block concludes.
   *
   * Mirrors: CurrentAttributes#set (current_attributes.rb:213-215)
   */
  set<R>(attributes: Record<string, AttributeValue>, block?: () => R): R | void {
    if (block === undefined) {
      for (const [key, value] of Object.entries(attributes)) {
        (this as unknown as Record<string, unknown>)[key] = value;
      }
      return;
    }
    return objectWith(this as unknown as Record<string, unknown>, attributes, () => block());
  }

  /**
   * Reset all attributes. Should be called before and after actions, when used
   * as a per-request singleton.
   *
   * Mirrors: CurrentAttributes#reset (current_attributes.rb:218-222)
   */
  reset(): void {
    runCallbacks(this, "reset", () => {
      this.attributes = this.resolveDefaults();
    });
  }

  /**
   * Mirrors: CurrentAttributes#resolve_defaults (current_attributes.rb:225-231)
   *
   * @internal
   */
  private resolveDefaults(): Record<string, AttributeValue> {
    const ctor = this.constructor as CurrentAttributesClass;
    const result: Record<string, AttributeValue> = {};
    for (const [key, value] of Object.entries(ctor.defaults)) {
      if (value !== NOT_SET) {
        result[key] = typeof value === "function" ? (value as () => unknown)() : dup(value);
      }
    }
    return result;
  }
}

/**
 * Mirrors Ruby's `Object#dup` for the values `resolve_defaults` copies: a
 * shallow copy for the mutable literals Rails' `default:` accepts, and the
 * value itself for the immutable ones Ruby returns unchanged.
 *
 * @internal
 */
function dup(value: unknown): unknown {
  if (Array.isArray(value)) return [...value];
  if (value !== null && typeof value === "object") {
    return Object.assign(Object.create(Object.getPrototypeOf(value) as object), value);
  }
  return value;
}

// Internal alias for static method use
type CurrentAttributesClass = typeof CurrentAttributes & {
  defaults: Record<string, AttributeValue>;
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
