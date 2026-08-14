import { DescendantsTracker, type AnyClass } from "./descendants-tracker.js";
import { constantize } from "./inflector.js";

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
 *
 * @missingRailsCall caller_locations — Rails passes `location: caller_locations(1, 1).first`
 * into the generated definition (module/delegation.rb:160-165) so an error raised inside it points at the
 * declaring line rather than at the framework file. trails generates real JS functions,
 * which carry a real stack, and there is no `module_eval` file/line to attribute.
 * Converging is story 0023-surfaced-deviations/converge-module-ext-generated-method-locations.
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

function popMattrOptions(namesAndOptions: (string | MattrOptions)[]): MattrOptions {
  return typeof namesAndOptions[namesAndOptions.length - 1] === "object" &&
    namesAndOptions[namesAndOptions.length - 1] !== null
    ? (namesAndOptions.pop() as MattrOptions)
    : {};
}

/**
 * Ruby defines the reader and the writer as two independent methods; JS holds
 * both halves of an accessor in one property descriptor, so defining one half
 * has to preserve whichever half is already there.
 */
function defineAccessorHalf(
  target: object,
  name: string,
  half: { get?: () => unknown; set?: (value: unknown) => void },
): void {
  const existing = Object.getOwnPropertyDescriptor(target, name);
  Object.defineProperty(target, name, {
    configurable: true,
    enumerable: false,
    get: half.get ?? existing?.get,
    set: half.set ?? existing?.set,
  });
}

/**
 * Resolves and stores the attribute's default. Rails' `sym_default_value` is
 * the block's return when a block was given and `default` is nil; trails spells
 * a Ruby block as a function-valued `default`.
 *
 * Mirrors: the shared tail of `mattr_reader` / `mattr_writer`
 * (module/attribute_accessors.rb:68-69, 134-135).
 */
function setMattrDefault(
  target: any,
  name: string,
  storageKey: string,
  options: MattrOptions,
): void {
  const rawDefault = options.default;
  const symDefaultValue = typeof rawDefault === "function" ? rawDefault() : rawDefault;
  if (!(symDefaultValue == null && Object.hasOwn(target, storageKey))) {
    target[storageKey] = symDefaultValue;
  }
}

/**
 * mattrReader — defines a class attribute and creates class and instance
 * reader methods.
 *
 * Mirrors: Module#mattr_reader (`module/attribute_accessors.rb:54-73`).

 */
export function mattrReader(target: any, ...namesAndOptions: (string | MattrOptions)[]): void {
  const options = popMattrOptions(namesAndOptions);
  const syms = namesAndOptions as string[];
  const instanceReader = options.instanceReader !== false;
  const instanceAccessor = options.instanceAccessor !== false;

  for (const sym of syms) {
    assertValidAttrName(sym);
    const storageKey = `__mattr_${sym}__`;

    defineAccessorHalf(target, sym, { get: () => target[storageKey] });

    if (instanceReader && instanceAccessor && target.prototype) {
      defineAccessorHalf(target.prototype, sym, { get: () => target[sym] });
    }

    setMattrDefault(target, sym, storageKey, options);
  }
}

/**
 * cattrReader — alias for mattrReader (`module/attribute_accessors.rb:74`).
 */
export const cattrReader = mattrReader;

/**
 * mattrWriter — defines a class attribute and creates class and instance
 * writer methods to allow assignment to the attribute.
 *
 * Mirrors: Module#mattr_writer (`module/attribute_accessors.rb:121-139`).
 */
export function mattrWriter(target: any, ...namesAndOptions: (string | MattrOptions)[]): void {
  const options = popMattrOptions(namesAndOptions);
  const syms = namesAndOptions as string[];
  const instanceWriter = options.instanceWriter !== false;
  const instanceAccessor = options.instanceAccessor !== false;

  for (const sym of syms) {
    assertValidAttrName(sym);
    const storageKey = `__mattr_${sym}__`;

    defineAccessorHalf(target, sym, {
      set: (val: unknown) => {
        target[storageKey] = val;
      },
    });

    if (instanceWriter && instanceAccessor && target.prototype) {
      defineAccessorHalf(target.prototype, sym, {
        set: (val: unknown) => {
          target[sym] = val;
        },
      });
    }

    setMattrDefault(target, sym, storageKey, options);
  }
}

/**
 * cattrWriter — alias for mattrWriter (`module/attribute_accessors.rb:140`).
 */
export const cattrWriter = mattrWriter;

/**
 * mattrAccessor — defines both class and instance accessors for class
 * attributes.
 *
 * Mirrors: Module#mattr_accessor (`module/attribute_accessors.rb:208-212`).
 * Rails forwards the block to `mattr_reader` only and passes the (then nil)
 * `default:` on to `mattr_writer`, where the `unless` guard makes it a no-op
 * because the reader already stored it; dropping `default` here is the same
 * thing spelled without a block/kwarg split. *
 * @missingRailsCall caller_locations — Rails passes `location: caller_locations(1, 1).first`
 * into the generated definition (module/attribute_accessors.rb:208-211) so an error raised inside it points at the
 * declaring line rather than at the framework file. trails generates real JS functions,
 * which carry a real stack, and there is no `module_eval` file/line to attribute.
 * Converging is story 0023-surfaced-deviations/converge-module-ext-generated-method-locations.
 */
export function mattrAccessor(target: any, ...namesAndOptions: (string | MattrOptions)[]): void {
  const options = popMattrOptions(namesAndOptions);
  const syms = namesAndOptions as string[];
  const writerOptions: MattrOptions = { ...options };
  delete writerOptions.default;

  mattrReader(target, ...syms, options);
  mattrWriter(target, ...syms, writerOptions);
}

/**
 * cattrAccessor — alias for mattrAccessor (`module/attribute_accessors.rb:213`).
 */
export const cattrAccessor = mattrAccessor;

/**
 * configAccessor — defines inheritable configuration accessors (config_accessor in Rails).
 * Works like mattrAccessor but uses a separate config hash namespace.
 *
 * @internal
 */
export function configAccessor(target: any, ...namesAndOptions: (string | MattrOptions)[]): void {
  mattrAccessor(target, ...namesAndOptions);
}

let _attrInternalNamingFormat = "_%s_";

export function getAttrInternalNamingFormat(): string {
  return _attrInternalNamingFormat;
}

export function setAttrInternalNamingFormat(format: string): void {
  if (format.startsWith("@")) {
    throw new Error("invalid attribute storage format");
  }
  const count = (format.match(/%s/g) || []).length;
  if (count !== 1) {
    throw new Error("naming format must contain exactly one %s placeholder");
  }
  _attrInternalNamingFormat = format;
}

function internalStorageKey(name: string): string {
  return _attrInternalNamingFormat.replace("%s", name);
}

/**
 * attrInternalReader — defines a reader for an attribute stored in a prefixed key.
 */
export function attrInternalReader(target: object, ...names: string[]): void {
  for (const name of names) {
    assertValidAttrName(name);
    const storageKey = internalStorageKey(name);
    defineAccessorHalf(target, name, {
      get(this: Record<string, unknown>) {
        return this[storageKey];
      },
    });
  }
}

/**
 * attrInternalWriter — defines a writer for an attribute stored in a prefixed key.
 */
export function attrInternalWriter(target: object, ...names: string[]): void {
  for (const name of names) {
    assertValidAttrName(name);
    const storageKey = internalStorageKey(name);
    defineAccessorHalf(target, name, {
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
 * attrInternalAccessor — declares an attribute reader and writer backed by an
 * internally-named instance variable.
 *
 * Mirrors: Module#attr_internal_accessor (`module/attr_internal.rb:16-19`).
 */
export function attrInternalAccessor(target: object, ...attrs: string[]): void {
  attrInternalReader(target, ...attrs);
  attrInternalWriter(target, ...attrs);
}

/**
 * attrInternal — alias for attrInternalAccessor
 * (`module/attr_internal.rb:20`).
 */
export const attrInternal = attrInternalAccessor;

/**
 * isAnonymous — returns true if a class/function has no name.
 * Mirrors Ruby's Module#anonymous?.
 */
export function isAnonymous(klass: { name: string }): boolean {
  return !klass.name || klass.name === "";
}

/**
 * moduleParentName — returns the parent namespace name of a class (best-effort in JS).
 * In Ruby this would parse the constant path. In JS/TS we can only go by convention.
 */
export function moduleParentName(klass: { name: string }): string | null {
  const name = klass.name ?? "";
  const parts = name.split("::");
  if (parts.length <= 1) return null;
  return parts.slice(0, -1).join("::");
}

/**
 * moduleParent — returns the module which contains this one according to its
 * name. The parent of top-level and anonymous modules is `Object`.
 *
 * Mirrors: Module#module_parent (`core_ext/module/introspection.rb:36-38`).
 */
export function moduleParent(klass: { name: string }): unknown {
  const parentName = moduleParentName(klass);
  return parentName != null ? constantize(parentName) : Object;
}

/**
 * moduleParents — returns all the parents of this module according to its
 * name, ordered from nested outwards. The receiver is not contained within the
 * result.
 *
 * Mirrors: Module#module_parents (`core_ext/module/introspection.rb:54-64`).
 */
export function moduleParents(klass: { name: string }): unknown[] {
  const parents: unknown[] = [];
  const parentName = moduleParentName(klass);
  if (parentName != null) {
    const parts = parentName.split("::");
    while (parts.length > 0) {
      parents.push(constantize(parts.join("::")));
      parts.pop();
    }
  }
  if (!parents.includes(Object)) parents.push(Object);
  return parents;
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

export function registerSubclass(parent: AnyClass, child: AnyClass): void {
  DescendantsTracker.registerSubclass(parent, child);
}

export function subclasses(klass: AnyClass): AnyClass[] {
  return DescendantsTracker.subclasses(klass);
}

export function descendants(klass: AnyClass): AnyClass[] {
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
