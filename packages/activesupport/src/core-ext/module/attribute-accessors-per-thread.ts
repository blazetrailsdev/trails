import { NameError } from "@blazetrails/ruby-compat";
import { IsolatedExecutionState } from "../../isolated-execution-state.js";
import { extractOptionsBang } from "../../hash-utils.js";

interface ThreadMattrReaderOptions {
  instanceReader?: boolean;
  instanceAccessor?: boolean;
  default?: unknown;
}

interface ThreadMattrWriterOptions {
  instanceWriter?: boolean;
  instanceAccessor?: boolean;
}

interface ThreadMattrAccessorOptions extends ThreadMattrReaderOptions, ThreadMattrWriterOptions {}

type Module = { prototype: object } & Record<string, any>;

let lastObjectId = 0;
const objectIds = new WeakMap<object, number>();

function objectId(obj: object): number {
  let id = objectIds.get(obj);
  if (id === undefined) objectIds.set(obj, (id = ++lastObjectId));
  return id;
}

function threadMattrKey(klass: Module, sym: string): string {
  const ivar = `@__thread_mattr_${sym}`;
  if (!Object.prototype.hasOwnProperty.call(klass, ivar)) {
    Object.defineProperty(klass, ivar, {
      value: `attr_${sym}_${objectId(klass)}`,
      configurable: true,
      enumerable: false,
    });
  }
  return klass[ivar];
}

function defineHalf(
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

export function threadMattrReader(
  this: Module,
  ...args: (string | ThreadMattrReaderOptions)[]
): void {
  const {
    instanceReader = true,
    instanceAccessor = true,
    default: defaultOption = null,
  } = extractOptionsBang(args) as ThreadMattrReaderOptions;
  const syms = args as string[];
  let _default = defaultOption;
  for (const sym of syms) {
    if (!/^[_A-Za-z]\w*$/.test(sym)) throw new NameError(`invalid attribute name: ${sym}`);

    if (_default == null) {
      defineHalf(this, sym, {
        get(this: Module) {
          return IsolatedExecutionState.get(threadMattrKey(this, sym)) ?? null;
        },
      });
    } else {
      if (!Object.isFrozen(_default)) {
        _default = Object.freeze(
          Array.isArray(_default) ? [..._default] : { ...(_default as object) },
        );
      }
      const defaultValue = _default;
      Object.defineProperty(this, `${sym}_default_value`, {
        configurable: true,
        enumerable: false,
        writable: true,
        value: () => defaultValue,
      });
      defineHalf(this, sym, {
        get(this: Module) {
          const key = threadMattrKey(this, sym);
          const value = IsolatedExecutionState.get(key);
          if (value == null && !IsolatedExecutionState.isKey(key)) {
            return IsolatedExecutionState.set(key, this[`${sym}_default_value`]());
          } else {
            return value;
          }
        },
      });
    }

    if (instanceReader && instanceAccessor) {
      defineHalf(this.prototype, sym, {
        get(this: { constructor: Module }) {
          return this.constructor[sym];
        },
      });
    }
  }
}

export const threadCattrReader = threadMattrReader;

export function threadMattrWriter(
  this: Module,
  ...args: (string | ThreadMattrWriterOptions)[]
): void {
  const { instanceWriter = true, instanceAccessor = true } = extractOptionsBang(
    args,
  ) as ThreadMattrWriterOptions;
  const syms = args as string[];
  for (const sym of syms) {
    if (!/^[_A-Za-z]\w*$/.test(sym)) throw new NameError(`invalid attribute name: ${sym}`);

    defineHalf(this, sym, {
      set(this: Module, obj: unknown) {
        IsolatedExecutionState.set(threadMattrKey(this, sym), obj);
      },
    });

    if (instanceWriter && instanceAccessor) {
      defineHalf(this.prototype, sym, {
        set(this: { constructor: Module }, obj: unknown) {
          this.constructor[sym] = obj;
        },
      });
    }
  }
}

export const threadCattrWriter = threadMattrWriter;

export function threadMattrAccessor(
  this: Module,
  ...args: (string | ThreadMattrAccessorOptions)[]
): void {
  const {
    instanceReader = true,
    instanceWriter = true,
    instanceAccessor = true,
    default: _default,
  } = extractOptionsBang(args) as ThreadMattrAccessorOptions;
  const syms = args as string[];
  threadMattrReader.call(this, ...syms, { instanceReader, instanceAccessor, default: _default });
  threadMattrWriter.call(this, ...syms, { instanceWriter, instanceAccessor });
}

export const threadCattrAccessor = threadMattrAccessor;
