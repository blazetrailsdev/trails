import {
  type Block,
  defineAccessorHalf,
  Module,
  NameError,
  rbBlockGivenP,
  rbModName,
} from "@blazetrails/ruby-compat";
import { DescendantsTracker, type AnyClass } from "./descendants-tracker.js";
import { constantize } from "./inflector.js";
import { Delegation, type DelegateOptions } from "./delegation.js";
import { callerLocations } from "./deprecation.js";
import { extractOptionsBang } from "./hash-utils.js";

export function delegate(this: object, ...methods: (string | DelegateOptions)[]): string[] {
  const options = extractOptionsBang(methods);
  const names = methods;
  const {
    to = null,
    prefix = null,
    allowNil = null,
    private: priv = null,
  } = options as DelegateOptions;

  return Delegation.generate(this, names as string[], {
    location: callerLocations(1, 1)[0],
    to,
    prefix,
    allowNil,
    private: priv,
  });
}

/** @missingRailsArgs generate_method_missing — PERMANENT */
export function delegateMissingTo(
  this: { prototype: object },
  target: string,
  options: { allowNil?: boolean } = {},
): void {
  Delegation.generateMethodMissing(this, target, options);
}

export interface MattrOptions {
  default?: unknown;
  instanceWriter?: boolean;
  instanceReader?: boolean;
  instanceAccessor?: boolean;
  location?: unknown;
}

type MattrTarget = Record<string, unknown> & { prototype?: object };

const VALID_ATTR_NAME = /^[a-zA-Z_][a-zA-Z0-9_]*[!?]?$/;

function assertValidAttrName(name: string): void {
  if (!VALID_ATTR_NAME.test(name)) {
    throw new Error(`Invalid attribute name: ${name}`);
  }
}

function setMattrDefault(
  target: MattrTarget,
  name: string,
  storageKey: string,
  options: MattrOptions,
  blk: (() => unknown) | null,
): void {
  const defaultValue = options.default ?? null;
  const symDefaultValue = blk !== null && defaultValue == null ? blk() : defaultValue;
  if (!(symDefaultValue == null && Object.hasOwn(target, storageKey))) {
    target[storageKey] = symDefaultValue;
  }
}

export function mattrReader(
  this: object,
  ...syms: (string | MattrOptions | Block<unknown>)[]
): void {
  const target = this as MattrTarget;
  const blk = rbBlockGivenP(syms[syms.length - 1]) ? (syms.pop() as () => unknown) : null;
  const options = extractOptionsBang(syms) as MattrOptions;
  options.location ??= callerLocations(1, 1)[0];
  const names = syms as string[];
  const instanceReader = options.instanceReader !== false;
  const instanceAccessor = options.instanceAccessor !== false;

  for (const sym of names) {
    if (!/^[_A-Za-z]\w*$/.test(sym)) throw new NameError(`invalid attribute name: ${sym}`);
    const storageKey = `__mattr_${sym}__`;

    defineAccessorHalf(target, sym, { get: () => target[storageKey] });

    if (instanceReader && instanceAccessor) {
      const definition = (methodTable: object) =>
        defineAccessorHalf(methodTable, sym, { get: () => target[sym] });
      if (this instanceof Module) {
        this.moduleEval(definition);
      } else if (target.prototype) {
        definition(target.prototype);
      }
    }

    setMattrDefault(target, sym, storageKey, options, blk);
  }
}

export const cattrReader = mattrReader;

export function mattrWriter(
  this: object,
  ...syms: (string | MattrOptions | Block<unknown>)[]
): void {
  const target = this as MattrTarget;
  const blk = rbBlockGivenP(syms[syms.length - 1]) ? (syms.pop() as () => unknown) : null;
  const options = extractOptionsBang(syms) as MattrOptions;
  options.location ??= callerLocations(1, 1)[0];
  const names = syms as string[];
  const instanceWriter = options.instanceWriter !== false;
  const instanceAccessor = options.instanceAccessor !== false;

  for (const sym of names) {
    if (!/^[_A-Za-z]\w*$/.test(sym)) throw new NameError(`invalid attribute name: ${sym}`);
    const storageKey = `__mattr_${sym}__`;

    defineAccessorHalf(target, sym, {
      set: (val: unknown) => {
        target[storageKey] = val;
      },
    });

    if (instanceWriter && instanceAccessor) {
      const definition = (methodTable: object) =>
        defineAccessorHalf(methodTable, sym, {
          set: (val: unknown) => {
            target[sym] = val;
          },
        });
      if (this instanceof Module) {
        this.moduleEval(definition);
      } else if (target.prototype) {
        definition(target.prototype);
      }
    }

    setMattrDefault(target, sym, storageKey, options, blk);
  }
}

export const cattrWriter = mattrWriter;

export function mattrAccessor(
  this: object,
  ...syms: (string | MattrOptions | Block<unknown>)[]
): void {
  const blk = rbBlockGivenP(syms[syms.length - 1]) ? (syms.pop() as Block<unknown>) : null;
  const options = extractOptionsBang(syms) as MattrOptions;
  const names = syms as string[];
  const location = callerLocations(1, 1)[0];
  const readerOptions: MattrOptions = { ...options, location };
  delete readerOptions.instanceWriter;
  const writerOptions: MattrOptions = { ...options, location };
  delete writerOptions.instanceReader;

  if (blk !== null) mattrReader.call(this, ...names, readerOptions, blk);
  else mattrReader.call(this, ...names, readerOptions);
  mattrWriter.call(this, ...names, writerOptions);
}

export const cattrAccessor = mattrAccessor;

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

export function isAnonymous(klass: object): boolean {
  return rbModName(klass) == null;
}

export function moduleParentName(klass: object): string | null {
  const name = rbModName(klass);
  if (name == null) return null;
  const parts = name.split("::");
  if (parts.length <= 1) return null;
  return parts.slice(0, -1).join("::");
}

export function moduleParent(klass: object): unknown {
  return moduleParentName(klass) != null ? constantize(moduleParentName(klass)!) : Object;
}

export function moduleParents(klass: object): unknown[] {
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

export function registerSubclass(parent: AnyClass, child: AnyClass): void {
  DescendantsTracker.registerSubclass(parent, child);
}

export function subclasses(klass: AnyClass): AnyClass[] {
  return DescendantsTracker.subclasses(klass);
}

export function descendants(klass: AnyClass): AnyClass[] {
  return DescendantsTracker.descendants(klass);
}
