import { DescendantsTracker, type AnyClass } from "./descendants-tracker.js";
import { constantize } from "./inflector.js";
import { Delegation, type DelegateOptions } from "./delegation.js";
import { extractOptionsBang } from "./hash-utils.js";

/** @missingRailsArgs generate — PERMANENT */
export function delegate(this: object, ...methods: (string | DelegateOptions)[]): string[] {
  const [names, options] = extractOptionsBang(methods);
  const { to, prefix, allowNil } = options as unknown as DelegateOptions;

  return Delegation.generate(this, names as string[], { to, prefix, allowNil });
}

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

export const cattrReader = mattrReader;

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

export const cattrWriter = mattrWriter;

export function mattrAccessor(this: any, ...syms: (string | MattrOptions)[]): void {
  const [names, options] = extractOptionsBang(syms) as [string[], MattrOptions];
  const writerOptions: MattrOptions = { ...options };
  delete writerOptions.default;

  mattrReader.call(this, ...names, options);
  mattrWriter.call(this, ...names, writerOptions);
}

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

export function attrInternalAccessor(this: object, ...attrs: string[]): void {
  attrInternalReader.call(this, ...attrs);
  attrInternalWriter.call(this, ...attrs);
}

export const attrInternal = attrInternalAccessor;

export function isAnonymous(klass: { name: string }): boolean {
  return !klass.name || klass.name === "";
}

export function moduleParentName(klass: { name: string }): string | null {
  const name = klass.name ?? "";
  const parts = name.split("::");
  if (parts.length <= 1) return null;
  return parts.slice(0, -1).join("::");
}

export function moduleParent(klass: { name: string }): unknown {
  return moduleParentName(klass) != null ? constantize(moduleParentName(klass)!) : Object;
}

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

export function registerSubclass(parent: AnyClass, child: AnyClass): void {
  DescendantsTracker.registerSubclass(parent, child);
}

export function subclasses(klass: AnyClass): AnyClass[] {
  return DescendantsTracker.subclasses(klass);
}

export function descendants(klass: AnyClass): AnyClass[] {
  return DescendantsTracker.descendants(klass);
}

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
