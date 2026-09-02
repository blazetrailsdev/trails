import { DescendantsTracker, type AnyClass } from "./descendants-tracker.js";
import { constantize } from "./inflector.js";
import { Delegation, type DelegateOptions } from "./delegation.js";
import { extractOptionsBang } from "./hash-utils.js";

/**
 * Module extensions mirroring Rails ActiveSupport module/class extensions.
 * Covers delegate, mattr_accessor, cattr_accessor, attr_internal, and helpers.
 */

/**
 * delegate — provides a delegate class method to easily expose contained
 * objects' public methods as your own.
 *
 * Mirrors: Module#delegate (`core_ext/module/delegation.rb:160-170`), a thin
 * front for `ActiveSupport::Delegation.generate`.
 *
 * @missingRailsArgs generate — PERMANENT: `location:` names the
 * `caller_locations` line Ruby stamps on the source `module_eval` compiles, and
 * `private:` sets the generated `def`'s visibility. TS defines the delegators
 * directly with `Object.defineProperty` and has no runtime method visibility,
 * so neither keyword has a counterpart to carry.
 *
 * Usage:
 *   delegate.call(MyClass.prototype, "street", "city", { to: "place" });
 *   delegate.call(MyClass.prototype, "name", { to: "place", prefix: true });
 */
export function delegate(this: object, ...methods: (string | DelegateOptions)[]): string[] {
  const [names, options] = extractOptionsBang(methods);
  const { to, prefix, allowNil } = options as unknown as DelegateOptions;

  return Delegation.generate(this, names as string[], { to, prefix, allowNil });
}

/**
 * delegateMissingTo — forwards any method the receiver does not define to the
 * named property.
 *
 * Mirrors: Module#delegate_missing_to
 * (`core_ext/module/delegation.rb:218-224`). Ruby defines `method_missing` on
 * the owner; the trails idiom is a `Proxy`, so this returns the wrapped object
 * rather than mutating `target` in place.
 */
export function delegateMissingTo<T extends object>(
  host: T,
  target: string,
  { allowNil }: { allowNil?: boolean } = {},
): T {
  return Delegation.generateMethodMissing(host, target, { allowNil });
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
export function mattrReader(this: any, ...syms: (string | MattrOptions)[]): void {
  const target = this;
  const [names, options] = extractOptionsBang(syms) as [string[], MattrOptions];
  const instanceReader = options.instanceReader !== false;
  const instanceAccessor = options.instanceAccessor !== false;

  for (const sym of names) {
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
export function mattrWriter(this: any, ...syms: (string | MattrOptions)[]): void {
  const target = this;
  const [names, options] = extractOptionsBang(syms) as [string[], MattrOptions];
  const instanceWriter = options.instanceWriter !== false;
  const instanceAccessor = options.instanceAccessor !== false;

  for (const sym of names) {
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
 * Rails passes `default: default` to BOTH calls and forwards the block (`&blk`)
 * to `mattr_reader` only. The writer's `default:` never takes effect, because
 * `mattr_writer`'s `unless sym_default_value.nil? && class_variable_defined?`
 * guard (attribute_accessors.rb:135) sees the value the reader already stored;
 * trails drops `default` before the writer call instead, which is the same
 * no-op reached without evaluating a function-valued default a second time.
 */
export function mattrAccessor(this: any, ...syms: (string | MattrOptions)[]): void {
  const [names, options] = extractOptionsBang(syms) as [string[], MattrOptions];
  const writerOptions: MattrOptions = { ...options };
  delete writerOptions.default;

  mattrReader.call(this, ...names, options);
  mattrWriter.call(this, ...names, writerOptions);
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
 * @noRailsEquivalent CONVERGEABLE Backed by the private
 * `Configurable::ClassMethods#config_accessor` (configurable.rb:111-128, made private at :129); the privates
 * manifest cannot back it here because trails hosts it in module-ext.ts rather than a
 * configurable.ts, and the manifest keys private names by the .rb they live in.
 */
export function configAccessor(this: any, ...syms: (string | MattrOptions)[]): void {
  mattrAccessor.call(this, ...syms);
}

let _attrInternalNamingFormat = "_%s";

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
export function attrInternalReader(this: object, ...attrs: string[]): void {
  const target = this;
  for (const name of attrs) {
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
export function attrInternalWriter(this: object, ...attrs: string[]): void {
  const target = this;
  for (const name of attrs) {
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
export function attrInternalAccessor(this: object, ...attrs: string[]): void {
  attrInternalReader.call(this, ...attrs);
  attrInternalWriter.call(this, ...attrs);
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
  return moduleParentName(klass) != null ? constantize(moduleParentName(klass)!) : Object;
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
 *   rescueFrom.call(MyClass, SomeError, { with: (e) => console.log(e) });
 *   rescueFrom.call(MyClass, SomeError, { with: "handleError" });
 */
export function rescueFrom(
  this: any,
  ...klasses: Array<(new (...args: any[]) => Error) | { with?: ErrorHandler }>
): void {
  const [errorClasses, options] = extractOptionsBang(klasses) as [
    Array<new (...args: any[]) => Error>,
    { with?: ErrorHandler },
  ];
  const handler = options.with;
  if (!handler) throw new Error("rescueFrom requires a :with handler");
  getRescueHandlers(this).push({ errorClasses, handler });
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
