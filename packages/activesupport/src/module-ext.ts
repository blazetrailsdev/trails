import { DescendantsTracker } from "./descendants-tracker.js";

/**
 * Module extensions mirroring Rails ActiveSupport module/class extensions.
 * Covers delegate, mattr_accessor, cattr_accessor, attr_internal, and helpers.
 */

/**
 * delegate — creates methods on target that forward to another property.
 * Mirrors Rails Module#delegate.
 *
 * Usage:
 *   delegate(MyClass.prototype, "street", "city", { to: "place" });
 *   delegate(MyClass.prototype, "name", { to: "place", prefix: true });
 */
export function delegate(
  target: object,
  ...args: [...string[], { to: string; prefix?: boolean | string; allowNil?: boolean }]
): string[] {
  const options = args[args.length - 1] as {
    to: string;
    prefix?: boolean | string;
    allowNil?: boolean;
  };
  const methods = args.slice(0, -1) as string[];
  const { to, prefix, allowNil = false } = options;

  const generatedNames: string[] = [];

  for (const method of methods) {
    let methodName: string;
    if (prefix === true) {
      methodName = `${to}_${method}`;
    } else if (typeof prefix === "string" && prefix) {
      methodName = `${prefix}_${method}`;
    } else {
      methodName = method;
    }

    generatedNames.push(methodName);

    Object.defineProperty(target, methodName, {
      configurable: true,
      enumerable: false,
      get(this: Record<string, unknown>) {
        const delegatee = this[to];
        if (delegatee === null || delegatee === undefined) {
          if (allowNil) return undefined;
          throw new Error(`${methodName} delegated to ${to}, but ${to} is nil`);
        }
        return (delegatee as Record<string, unknown>)[method];
      },
      set(this: Record<string, unknown>, value: unknown) {
        const delegatee = this[to];
        if (delegatee === null || delegatee === undefined) {
          if (allowNil) return;
          throw new Error(`${methodName} delegated to ${to}, but ${to} is nil`);
        }
        (delegatee as Record<string, unknown>)[method] = value;
      },
    });
  }

  return generatedNames;
}

/**
 * delegateMissingTo — forwards any missing method calls to the named property.
 * Mirrors Rails Module#delegate_missing_to.
 */
export function delegateMissingTo(target: object, property: string): void {
  // In TypeScript/JS we implement this via a Proxy wrapper helper.
  // This attaches a marker; the proxy must be applied at construction time.
  (target as Record<string, unknown>).__delegateMissingTo__ = property;
}

export interface MattrOptions {
  default?: unknown;
  instanceWriter?: boolean;
  instanceReader?: boolean;
  instanceAccessor?: boolean;
}

const VALID_ATTR_NAME = /^[a-zA-Z_][a-zA-Z0-9_]*[!?]?$/;

function assertValidAttrName(name: string): void {
  if (!VALID_ATTR_NAME.test(name)) {
    throw new Error(`Invalid attribute name: ${name}`);
  }
}

/**
 * mattrAccessor — defines class-level attribute accessors (mattr_accessor).
 * Also adds instance-level delegates by default (like Rails).
 * Supports: default, instanceWriter, instanceReader, instanceAccessor options.
 */
export function mattrAccessor(target: any, ...namesAndOptions: (string | MattrOptions)[]): void {
  const options: MattrOptions =
    typeof namesAndOptions[namesAndOptions.length - 1] === "object" &&
    namesAndOptions[namesAndOptions.length - 1] !== null
      ? (namesAndOptions.pop() as MattrOptions)
      : {};

  const names = namesAndOptions as string[];
  const addInstanceReader = options.instanceAccessor !== false && options.instanceReader !== false;
  const addInstanceWriter = options.instanceAccessor !== false && options.instanceWriter !== false;

  for (const name of names) {
    assertValidAttrName(name);
    const storageKey = `__mattr_${name}__`;

    // Resolve default value once at definition time
    const rawDefault = options.default;
    const resolvedDefault = typeof rawDefault === "function" ? rawDefault() : rawDefault;

    if ("default" in options || typeof rawDefault === "function") {
      (target as Record<string, unknown>)[storageKey] = resolvedDefault;
    }

    // Class-level getter/setter
    Object.defineProperty(target, name, {
      configurable: true,
      enumerable: false,
      get() {
        return (target as Record<string, unknown>)[storageKey];
      },
      set(value: unknown) {
        (target as Record<string, unknown>)[storageKey] = value;
      },
    });

    // Instance-level delegates
    if (target.prototype && (addInstanceReader || addInstanceWriter)) {
      if (addInstanceReader && addInstanceWriter) {
        Object.defineProperty(target.prototype, name, {
          configurable: true,
          enumerable: false,
          get() {
            return (target as Record<string, unknown>)[name];
          },
          set(value: unknown) {
            (target as Record<string, unknown>)[name] = value;
          },
        });
      } else if (addInstanceReader) {
        Object.defineProperty(target.prototype, name, {
          configurable: true,
          enumerable: false,
          get() {
            return (target as Record<string, unknown>)[name];
          },
        });
      } else if (addInstanceWriter) {
        // Only writer — define a method, not a setter-only property (which would be odd)
        Object.defineProperty(target.prototype, `${name}=`, {
          configurable: true,
          enumerable: false,
          value(value: unknown) {
            (target as Record<string, unknown>)[name] = value;
          },
        });
      }
    }
  }
}

/**
 * cattrAccessor — alias for mattrAccessor (cattr_accessor in Rails).
 */
export const cattrAccessor = mattrAccessor;

/**
 * configAccessor — defines inheritable configuration accessors (config_accessor in Rails).
 * Works like mattrAccessor but uses a separate config hash namespace.
 */
export function configAccessor(target: any, ...namesAndOptions: (string | MattrOptions)[]): void {
  mattrAccessor(target, ...namesAndOptions);
}

/**
 * attrInternal — defines instance-level attribute with underscore-prefixed storage.
 * Mirrors Rails Module#attr_internal_accessor.
 */
export function attrInternal(target: object, ...names: string[]): void {
  for (const name of names) {
    const storageKey = `_${name}_`;
    Object.defineProperty(target, name, {
      configurable: true,
      enumerable: false,
      get(this: Record<string, unknown>) {
        return this[storageKey];
      },
      set(this: Record<string, unknown>, value: unknown) {
        this[storageKey] = value;
      },
    });

    Object.defineProperty(target, `${name}=`, {
      configurable: true,
      enumerable: false,
      value(this: Record<string, unknown>, value: unknown) {
        this[storageKey] = value;
      },
    });
  }
}

/**
 * isAnonymous — returns true if a class/function has no name.
 * Mirrors Ruby's Module#anonymous?.
 */
export function isAnonymous(klass: Function): boolean {
  return !klass.name || klass.name === "";
}

/**
 * moduleParentName — returns the parent namespace name of a class (best-effort in JS).
 * In Ruby this would parse the constant path. In JS/TS we can only go by convention.
 */
export function moduleParentName(klass: Function): string | null {
  const name = klass.name ?? "";
  const parts = name.split("::");
  if (parts.length <= 1) return null;
  return parts.slice(0, -1).join("::");
}

/**
 * suppress — runs fn(), swallowing any error that is an instance of one of the given classes.
 * Re-raises errors that don't match. Mirrors Ruby's Kernel#suppress.
 */
export function suppress<T>(
  fn: () => T,
  ...errorClasses: Array<new (...args: any[]) => Error>
): T | undefined {
  try {
    return fn();
  } catch (e) {
    if (errorClasses.some((cls) => e instanceof cls)) return undefined;
    throw e;
  }
}

// ── Descendants tracking ──────────────────────────────────────────────────────

export function registerSubclass(parent: Function, child: Function): void {
  DescendantsTracker.registerSubclass(parent, child);
}

export function subclasses(klass: Function): Function[] {
  return DescendantsTracker.subclasses(klass);
}

export function descendants(klass: Function): Function[] {
  return DescendantsTracker.descendants(klass);
}

// ── Rescuable ────────────────────────────────────────────────────────────────

type ErrorHandler = ((error: Error) => void) | string;

interface RescueEntry {
  errorClasses: Array<new (...args: any[]) => Error>;
  handler: ErrorHandler;
}

const _rescueHandlers = new WeakMap<object, RescueEntry[]>();

function getRescueHandlers(target: object): RescueEntry[] {
  if (!_rescueHandlers.has(target)) _rescueHandlers.set(target, []);
  return _rescueHandlers.get(target)!;
}

/**
 * rescueFrom — registers an error handler on the class.
 * Mirrors Rails Rescuable::ClassMethods#rescue_from.
 *
 * Usage:
 *   rescueFrom(MyClass, SomeError, { with: (e) => console.log(e) });
 *   rescueFrom(MyClass, SomeError, { with: "handleError" });
 */
export function rescueFrom(target: any, ...errorClassesAndOptions: any[]): void {
  const lastArg = errorClassesAndOptions[errorClassesAndOptions.length - 1];
  const hasOptions = typeof lastArg === "object" && lastArg !== null && !lastArg.prototype;
  const options: { with?: ErrorHandler } = hasOptions ? errorClassesAndOptions.pop() : {};
  const errorClasses = errorClassesAndOptions as Array<new (...args: any[]) => Error>;
  const handler = options.with;
  if (!handler) throw new Error("rescueFrom requires a :with handler");
  getRescueHandlers(target).push({ errorClasses, handler });
}

/**
 * handleRescue — attempts to handle an error using registered rescueFrom handlers.
 * Returns true if handled. Call from inside a try/catch.
 */
export function handleRescue(target: any, error: Error): boolean {
  const handlers = getRescueHandlers(target);
  for (const { errorClasses, handler } of [...handlers].reverse()) {
    if (errorClasses.some((cls) => error instanceof cls)) {
      if (typeof handler === "function") {
        handler(error);
      } else if (typeof handler === "string") {
        const method = target[handler] ?? target.prototype?.[handler];
        if (typeof method === "function") method.call(target, error);
      }
      return true;
    }
  }
  return false;
}
