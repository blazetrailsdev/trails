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

type ResetCallback = (this: CurrentAttributes) => void;

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

const NOT_SET: unknown = Object.freeze({});

export abstract class CurrentAttributes {
  public static defaults: Record<string, AttributeValue> = {};

  static {
    defineCallbacks(CurrentAttributes.prototype, "reset");
  }

  attributes: Record<string, AttributeValue>;

  constructor() {
    this.attributes = this.resolveDefaults();
  }

  static attribute(...names: string[]): void;
  static attribute(...names: [...string[], AttributeDefinition]): void;
  /**
   * @missingRailsCall generate — PERMANENT
   * @missingRailsCall merge — PERMANENT
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
              /** @missingRailsCall with — PERMANENT */
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
        /** @missingRailsCall with — PERMANENT */
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

  static beforeReset<T extends typeof CurrentAttributes>(
    this: T,
    ...methods: (string | ((this: InstanceType<T>) => void))[]
  ): void {
    setCallback(this.prototype, "reset", "before", ...(methods as ResetCallback[]));
  }

  static resets<T extends typeof CurrentAttributes>(
    this: T,
    ...methods: (string | ((this: InstanceType<T>) => void))[]
  ): void {
    setCallback(this.prototype, "reset", "after", ...(methods as ResetCallback[]));
  }

  static afterReset<T extends typeof CurrentAttributes>(
    this: T,
    ...methods: (string | ((this: InstanceType<T>) => void))[]
  ): void {
    this.resets(...methods);
  }

  static reset(): void {
    this.instance().reset();
  }

  /** @missingRailsCall with — PERMANENT */
  static set<R>(attributes: Record<string, AttributeValue>, block: () => R): R {
    return this.instance().set(attributes, block);
  }

  static resetAll(): void {
    for (const instance of this.currentInstances().values()) instance.reset();
  }

  static clearAll(): void {
    this.resetAll();
    this.currentInstances().clear();
  }

  /** @internal */
  private static currentInstances(): Map<string, CurrentAttributes> {
    return IsolatedExecutionState.fetch(
      CURRENT_ATTRIBUTES_INSTANCES,
      () => new Map<string, CurrentAttributes>(),
    );
  }

  /** @internal */
  private static currentInstancesKey(): string {
    if (!Object.prototype.hasOwnProperty.call(this, "_currentInstancesKey")) {
      (this as CurrentAttributesClass)._currentInstancesKey = this.name;
    }
    return (this as CurrentAttributesClass)._currentInstancesKey!;
  }

  /** @missingRailsCall with — PERMANENT */
  set<R>(attributes: Record<string, AttributeValue>, block: () => R): R {
    return objectWith(this as unknown as Record<string, unknown>, attributes, () => block());
  }

  reset(): void {
    runCallbacks(this, "reset", () => {
      this.attributes = this.resolveDefaults();
    });
  }

  /** @internal */
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

/** @internal */
function dup(value: unknown): unknown {
  if (Array.isArray(value)) return [...value];
  if (value !== null && typeof value === "object") {
    return Object.assign(Object.create(Object.getPrototypeOf(value) as object), value);
  }
  return value;
}

const CURRENT_ATTRIBUTES_INSTANCES = "current_attributes_instances";

type CurrentAttributesClass = typeof CurrentAttributes & {
  defaults: Record<string, AttributeValue>;
  _generatedAttributeMethods?: Module;
  _currentInstancesKey?: string;
};

/** @internal */
function generatedAttributeMethods(this: CurrentAttributesClass): Module {
  if (!Object.prototype.hasOwnProperty.call(this, "_generatedAttributeMethods")) {
    const mod = new Module();
    include(this as unknown as new (...args: unknown[]) => unknown, mod);
    this._generatedAttributeMethods = mod;
  }
  return this._generatedAttributeMethods!;
}
