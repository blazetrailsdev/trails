/**
 * Mirrors: ActiveSupport::CurrentAttributes (current_attributes.rb). Abstract
 * super class that provides an execution-isolated attributes singleton: the
 * instances live in `IsolatedExecutionState` (:170-172), so each logical task
 * gets its own, exactly as Rails gives each fiber/thread its own.
 */

import { ArgumentError } from "@blazetrails/ruby-compat";
import { defineCallbacks, runCallbacks, setCallback } from "./callbacks.js";
import { CodeGenerator } from "./code-generator.js";
import { objectWith } from "./core-ext/object/with.js";
import { include, Module } from "@blazetrails/ruby-compat/include";
import { IsolatedExecutionState } from "./isolated-execution-state.js";

const __FILE__ = import.meta.url;
const __LINE__ = 0;

type AttributeValue = unknown;
type DefaultValue<T> = T | (() => T);

interface AttributeDefinition<T = AttributeValue> {
  default?: DefaultValue<T>;
}

/** A `:reset` callback, instance-exec'd (Rails' `set_callback :reset`). */
type ResetCallback = (this: CurrentAttributes) => void;

/** Mirrors: ActiveSupport::CurrentAttributes::INVALID_ATTRIBUTE_NAMES (:96). */
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

/** Mirrors: ActiveSupport::CurrentAttributes::NOT_SET (current_attributes.rb:98). */
const NOT_SET: unknown = Object.freeze({});

/**
 * Base class for current-attributes objects. Subclass and call
 * `static attribute(name, options?)` to define attributes.
 */
export abstract class CurrentAttributes {
  /** Mirrors: `class_attribute :defaults` (current_attributes.rb:195). */
  public static defaults: Record<string, AttributeValue> = {};

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
   * A TS attribute is one accessor pair, not two methods, so the writer
   * `define_cached_method` (:128) lands on the reader's entry, as do the two
   * `Delegation.generate(singleton_class, …, to: :instance)` calls (:138-139).
   */
  static attribute(...names: string[]): void;
  static attribute(...names: [...string[], AttributeDefinition]): void;
  /**
   * @missingRailsCall generate — PERMANENT: current_attributes.rb:136-137
   *   `Delegation.generate(singleton_class, names, to: :instance, ...)` — Rails
   *   generates the class-level readers/writers by compiling Ruby source onto
   *   the singleton class. trails has no singleton class and
   *   `Delegation.generate` compiles method source strings, so the port defines
   *   the same accessors with `Object.defineProperty` on the constructor.
   *   Language shortcoming.
   * @missingRailsCall merge — PERMANENT: current_attributes.rb:139 `self.defaults =
   *   defaults.merge(names.index_with { default })` — Ruby Hash#merge returning
   *   a new hash is JS object spread; there is no Hash to call `merge` on. Same
   *   substitution as the `cache.ts merged_options -> merge` row.
   */
  static attribute(...args: unknown[]): void {
    const ctor = this as unknown as CurrentAttributesClass;
    const lastArg = args[args.length - 1];
    const hasOptions = typeof lastArg === "object" && lastArg !== null && !Array.isArray(lastArg);
    const options: AttributeDefinition = hasOptions ? (lastArg as AttributeDefinition) : {};
    const names = (hasOptions ? args.slice(0, -1) : args) as string[];
    const defaultValue: unknown = "default" in options ? options.default : NOT_SET;

    const invalidAttributeNames = names.filter((name) => INVALID_ATTRIBUTE_NAMES.includes(name));
    if (invalidAttributeNames.length > 0) {
      throw new ArgumentError(`Restricted attribute names: ${invalidAttributeNames.join(", ")}`);
    }

    CodeGenerator.batch(generatedAttributeMethods.call(ctor), __FILE__, __LINE__, (owner) => {
      for (const name of names) {
        owner.defineCachedMethod(name, { namespace: "current_attributes" }, (batch) => {
          batch.push((mod) =>
            Object.defineProperty(mod, name, {
              get(this: CurrentAttributes) {
                return this.attributes[name];
              },
              /**
               * @missingRailsCall with — PERMANENT: current_attributes.rb:214
               *   `with(**attributes, &block)` — `with` is a JS reserved word,
               *   so trails' port of `Object#with` is exported as `objectWith`
               *   and `set` calls that. Language shortcoming; the Rails name
               *   cannot be spelled.
               */
              set(this: CurrentAttributes, value: unknown) {
                this.attributes[name] = value;
              },
              configurable: true,
            }),
          );
        });
      }
    });

    for (const name of names) {
      Object.defineProperty(ctor, name, {
        configurable: true,
        get(this: typeof CurrentAttributes) {
          return (this.instance() as unknown as Record<string, unknown>)[name];
        },
        /**
         * @missingRailsCall with — PERMANENT: current_attributes.rb:214 `with(**attributes,
         *   &block)` — `with` is a JS reserved word, so trails' port of
         *   `Object#with` is exported as `objectWith` and `set` calls that.
         *   Language shortcoming; the Rails name cannot be spelled.
         */
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

  /**
   * Returns singleton instance for this class in this execution context. If
   * none exists, one is created.
   *
   * Mirrors: CurrentAttributes.instance (current_attributes.rb:102-104)
   */
  static instance<T extends typeof CurrentAttributes>(this: T): InstanceType<T> {
    const key = (this as typeof CurrentAttributes).currentInstancesKey();
    const instances = (this as typeof CurrentAttributes).currentInstances();
    let instance = instances.get(key);
    if (instance === undefined) {
      instance = new (this as unknown as new () => CurrentAttributes)();
      instances.set(key, instance);
    }
    return instance as InstanceType<T>;
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

  /**
   * Mirrors: `delegate :set, to: :instance` (current_attributes.rb:154).
   *
   * @missingRailsCall with — PERMANENT: current_attributes.rb:214 `with(**attributes,
   *   &block)` — `with` is a JS reserved word, so trails' port of `Object#with`
   *   is exported as `objectWith` and `set` calls that. Language shortcoming;
   *   the Rails name cannot be spelled.
   */
  static set<R>(attributes: Record<string, AttributeValue>, block: () => R): R {
    return this.instance().set(attributes, block);
  }

  /** Mirrors: CurrentAttributes.reset_all (current_attributes.rb:156-158) */
  static resetAll(): void {
    for (const instance of this.currentInstances().values()) instance.reset();
  }

  /** Mirrors: CurrentAttributes.clear_all (current_attributes.rb:160-163) */
  static clearAll(): void {
    this.resetAll();
    this.currentInstances().clear();
  }

  /** Mirrors: CurrentAttributes.current_instances (:170-172) @internal */
  private static currentInstances(): Map<string, CurrentAttributes> {
    return IsolatedExecutionState.fetch(
      CURRENT_ATTRIBUTES_INSTANCES,
      () => new Map<string, CurrentAttributes>(),
    );
  }

  /**
   * Mirrors: CurrentAttributes.current_instances_key (:174-176). Ruby memoizes
   * `name.to_sym` in a per-class ivar, so the memo is read as an *own*
   * property — a subclass keys on its own name, never its parent's.
   *
   * @internal
   */
  private static currentInstancesKey(): string {
    if (!Object.prototype.hasOwnProperty.call(this, "_currentInstancesKey")) {
      (this as CurrentAttributesClass)._currentInstancesKey = this.name;
    }
    return (this as CurrentAttributesClass)._currentInstancesKey!;
  }

  // -------------------------------------------------------------------------
  // Instance-level API
  // -------------------------------------------------------------------------

  /**
   * Expose attributes within a block. Mirrors: CurrentAttributes#set (:213-215)
   *
   * @missingRailsCall with — PERMANENT: current_attributes.rb:214 `with(**attributes,
   *   &block)` — `with` is a JS reserved word, so trails' port of `Object#with`
   *   is exported as `objectWith` and `set` calls that. Language shortcoming;
   *   the Rails name cannot be spelled.
   */
  set<R>(attributes: Record<string, AttributeValue>, block: () => R): R {
    return objectWith(this as unknown as Record<string, unknown>, attributes, () => block());
  }

  /** Reset all attributes. Mirrors: CurrentAttributes#reset (:218-222) */
  reset(): void {
    runCallbacks(this, "reset", () => {
      this.attributes = this.resolveDefaults();
    });
  }

  /** Mirrors: CurrentAttributes#resolve_defaults (:225-231) @internal */
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

/** Ruby's `Object#dup` over the values `resolve_defaults` copies. @internal */
function dup(value: unknown): unknown {
  if (Array.isArray(value)) return [...value];
  if (value !== null && typeof value === "object") {
    return Object.assign(Object.create(Object.getPrototypeOf(value) as object), value);
  }
  return value;
}

/**
 * The `IsolatedExecutionState[:current_attributes_instances]` slot key
 * (current_attributes.rb:171).
 */
const CURRENT_ATTRIBUTES_INSTANCES = "current_attributes_instances";

// Internal alias for static method use
type CurrentAttributesClass = typeof CurrentAttributes & {
  defaults: Record<string, AttributeValue>;
  _generatedAttributeMethods?: Module;
  _currentInstancesKey?: string;
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
