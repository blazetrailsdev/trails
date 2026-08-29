import { ConfigurationError } from "./errors.js";
import type { Base } from "./base.js";
import { HashWithIndifferentAccess, withIndifferentAccess } from "@blazetrails/activesupport";
import { buildColumnSerializer } from "./attribute-methods/serialization.js";
import type { YamlColumnOptions } from "./coders/yaml-column.js";
import { getOrCreateModuleCarrier } from "./module-carrier.js";

interface CoderLike {
  dump(v: unknown): unknown;
  load(v: unknown): unknown;
}

export class IndifferentCoder {
  readonly storeAttribute: string;
  readonly coder: CoderLike | null;

  constructor(storeAttribute: string, coder?: CoderLike | null) {
    this.storeAttribute = storeAttribute;
    this.coder = coder ?? null;
  }

  dump(obj: unknown): unknown {
    if (this.coder) return this.coder.dump(asRegularHash(obj));
    return JSON.stringify(asRegularHash(obj));
  }

  load(value: unknown): HashWithIndifferentAccess<unknown> {
    if (this.coder) {
      const coerced = value === null || value === undefined || value === false ? "" : value;
      return asIndifferentHash(this.coder.load(coerced));
    }
    if (value === null || value === undefined || value === "") return asIndifferentHash(null);
    if (typeof value === "string") {
      try {
        return asIndifferentHash(JSON.parse(value));
      } catch {
        return asIndifferentHash(null);
      }
    }
    return asIndifferentHash(value);
  }

  /**
   * @internal
   * @noRailsEquivalent CONVERGEABLE Store::ClassMethods#store_accessor's accessor lookup (store.rb:112); Ruby reads the constant inline.
   */
  accessor(): typeof IndifferentHashAccessor {
    return IndifferentHashAccessor;
  }
}

const _storedAttributes = new WeakMap<typeof Base, Record<string, string[]>>();

const _storeAccessorsModules = new WeakMap<typeof Base, Set<string>>();

const _storeModuleProtos = new WeakMap<typeof Base, object>();

/** @internal */
function getOrCreateStoreModuleProto(modelClass: typeof Base): object {
  return getOrCreateModuleCarrier(modelClass, _storeModuleProtos);
}

function _storeAccessorsModule(this: typeof Base): Set<string> {
  if (!_storeAccessorsModules.has(this)) {
    _storeAccessorsModules.set(this, new Set());
  }
  return _storeAccessorsModules.get(this)!;
}

export function localStoredAttributes(this: typeof Base): Record<string, string[]> | undefined {
  return _storedAttributes.get(this);
}

export function storedAttributes(this: typeof Base): Record<string, string[]> {
  const modelClass = this;
  const parent = Object.getPrototypeOf(modelClass) as typeof Base | null;
  const parentAttrs =
    typeof parent?.storedAttributes === "function" ? parent.storedAttributes() : {};
  const local = localStoredAttributes.call(modelClass);
  if (!local) return parentAttrs;
  const merged: Record<string, string[]> = { ...parentAttrs };
  for (const [store, keys] of Object.entries(local)) {
    merged[store] = [...new Set([...(parentAttrs[store] ?? []), ...keys])];
  }
  return merged;
}

export class HashAccessor {
  static read(object: Base, attribute: string, key: string): unknown {
    this.prepare(object, attribute);
    const data = object.readAttribute(attribute);
    if (data === null || data === undefined) return null;
    const obj = this._readHash(data);
    return obj[key] ?? null;
  }

  static write(object: Base, attribute: string, key: string, value: unknown): void {
    this.prepare(object, attribute);
    if (value !== this.read(object, attribute, key)) {
      const raw = object.readAttribute(attribute);
      const obj = this._writeHash(raw);
      obj[key] = value;
      object.writeAttribute(attribute, obj);
    }
  }

  static prepare(object: Base, attribute: string): void {
    const val = object.readAttribute(attribute);
    if (val === null || val === undefined || val === false) {
      object.writeAttribute(attribute, {});
    } else if (
      typeof val === "object" &&
      !Array.isArray(val) &&
      !(val instanceof HashWithIndifferentAccess) &&
      (Object.getPrototypeOf(val) === Object.prototype || Object.getPrototypeOf(val) === null)
    ) {
      const hwia = new HashWithIndifferentAccess(val as Record<string, unknown>);
      object.writeAttribute(attribute, hwia.toHash());
    }
  }

  protected static _readHash(data: unknown): Readonly<Record<string, unknown>> {
    if (data instanceof HashWithIndifferentAccess) return data.toHash();
    if (data === null || data === undefined) return {};
    if (typeof data === "string") return JSON.parse(data);
    if (typeof data === "object" && !Array.isArray(data)) return data as Record<string, unknown>;
    return {};
  }

  protected static _writeHash(data: unknown): Record<string, unknown> {
    if (data instanceof HashWithIndifferentAccess) return data.toHash();
    if (data === null || data === undefined) return {};
    if (typeof data === "string") {
      const parsed = JSON.parse(data);
      if (parsed !== null && typeof parsed === "object" && !Array.isArray(parsed)) {
        return { ...parsed };
      }
      return {};
    }
    if (typeof data === "object" && !Array.isArray(data)) {
      return { ...(data as Record<string, unknown>) };
    }
    return {};
  }
}

export class IndifferentHashAccessor extends HashAccessor {
  static override prepare(object: Base, attribute: string): void {
    const val = object.readAttribute(attribute);
    if (!(val instanceof HashWithIndifferentAccess)) {
      object.writeAttribute(attribute, asIndifferentHash(val));
    }
  }
}

export class StringKeyedHashAccessor extends HashAccessor {
  static override read(object: Base, attribute: string, key: unknown): unknown {
    return super.read(object, attribute, String(key));
  }

  static override write(object: Base, attribute: string, key: unknown, value: unknown): void {
    super.write(object, attribute, String(key), value);
  }
}

interface StoreAccessorOptions {
  prefix?: boolean | string;
  suffix?: boolean | string;
}

type StoreAccessorArgs =
  | Array<string | string[]>
  | [...keys: Array<string | string[]>, options: StoreAccessorOptions];

export interface StoreOptions {
  accessors?: string[];
  prefix?: boolean | string;
  suffix?: boolean | string;
  coder?: unknown;
  yaml?: YamlColumnOptions;
}

function storeAccessor(
  this: typeof Base,
  storeAttribute: string,
  ...args: StoreAccessorArgs
): void {
  let prefix: boolean | string | null = null;
  let suffix: boolean | string | null = null;
  const last = args[args.length - 1];
  if (last !== null && typeof last === "object" && !Array.isArray(last)) {
    args.pop();
    prefix = last.prefix ?? null;
    suffix = last.suffix ?? null;
  }
  const keys = (args as Array<string | string[]>).flat(Infinity) as string[];

  const accessorPrefix =
    typeof prefix === "string" ? `${prefix}_` : prefix === true ? `${storeAttribute}_` : "";
  const accessorSuffix =
    typeof suffix === "string" ? `_${suffix}` : suffix === true ? `_${storeAttribute}` : "";

  const storeModuleProto = getOrCreateStoreModuleProto(this);
  for (const key of keys) {
    const accessorKey = `${accessorPrefix}${key}${accessorSuffix}`;
    this._storeAccessorsModule().add(accessorKey);

    Object.defineProperty(storeModuleProto, accessorKey, {
      set: function (this: Base, value: unknown) {
        this.writeStoreAttribute(storeAttribute, key, value);
      },
      get: function (this: Base) {
        return this.readStoreAttribute(storeAttribute, key);
      },
      configurable: true,
    });

    const cap = accessorKey.charAt(0).toUpperCase() + accessorKey.slice(1);
    const define = (name: string, fn: (this: StoreDirtyHost) => unknown): void => {
      if (Object.prototype.hasOwnProperty.call(storeModuleProto, name)) return;
      Object.defineProperty(storeModuleProto, name, {
        value: fn,
        writable: true,
        configurable: true,
      });
    };

    define(`${accessorKey}Changed`, function (this) {
      if (!this.attributeChanged(storeAttribute)) return false;
      const [prevStore, newStore] = this.changes[storeAttribute] ?? [undefined, undefined];
      return dig(prevStore, key) !== dig(newStore, key);
    });
    define(`${accessorKey}Change`, function (this) {
      if (!this.attributeChanged(storeAttribute)) return null;
      const [prevStore, newStore] = this.changes[storeAttribute] ?? [undefined, undefined];
      return [dig(prevStore, key) ?? null, dig(newStore, key) ?? null];
    });
    define(`${accessorKey}Was`, function (this) {
      if (!this.attributeChanged(storeAttribute)) return null;
      const [prevStore] = this.changes[storeAttribute] ?? [undefined];
      return dig(prevStore, key) ?? null;
    });
    define(`isSavedChangeTo${cap}`, function (this) {
      if (!this.isSavedChangeToAttribute?.(storeAttribute)) return false;
      const [prevStore, newStore] = this.savedChanges?.[storeAttribute] ?? [undefined, undefined];
      return dig(prevStore, key) !== dig(newStore, key);
    });
    define(`savedChangeTo${cap}`, function (this) {
      if (!this.isSavedChangeToAttribute?.(storeAttribute)) return null;
      const [prevStore, newStore] = this.savedChanges?.[storeAttribute] ?? [undefined, undefined];
      return [dig(prevStore, key) ?? null, dig(newStore, key) ?? null];
    });
    define(`${accessorKey}BeforeLastSave`, function (this) {
      if (!this.isSavedChangeToAttribute?.(storeAttribute)) return null;
      const [prevStore] = this.savedChanges?.[storeAttribute] ?? [undefined];
      return dig(prevStore, key) ?? null;
    });
  }

  let localStored = this.localStoredAttributes();
  if (!localStored) {
    localStored = {};
    _storedAttributes.set(this, localStored);
  }
  localStored[storeAttribute] ??= [];
  localStored[storeAttribute] = [...new Set([...localStored[storeAttribute], ...keys])];
}

interface StoreDirtyHost {
  attributeChanged(name: string): boolean;
  isSavedChangeToAttribute(name: string): boolean;
  changes: Record<string, [unknown, unknown]>;
  savedChanges: Record<string, [unknown, unknown]>;
}

function dig(obj: unknown, key: string): unknown {
  if (obj == null) return undefined;
  if (obj instanceof HashWithIndifferentAccess) {
    return (obj.toHash() as Record<string, unknown>)[key];
  }
  if (typeof obj === "object") return (obj as Record<string, unknown>)[key];
  return undefined;
}

function store(this: typeof Base, storeAttribute: string, options: StoreOptions = {}): void {
  const coder = buildColumnSerializer(storeAttribute, options.coder, Object, options.yaml);
  if (
    coder != null &&
    (typeof (coder as any).dump !== "function" || typeof (coder as any).load !== "function")
  ) {
    throw new ConfigurationError(
      `store coder for '${storeAttribute}' must implement dump() and load(), ` +
        `but got ${typeof coder}.`,
    );
  }
  this.serialize(storeAttribute, {
    coder: new IndifferentCoder(storeAttribute, coder as CoderLike | null) as any,
  });

  if (options.accessors !== undefined) {
    this.storeAccessor(storeAttribute, options.accessors, {
      prefix: options.prefix,
      suffix: options.suffix,
    });
  }
}

export const ClassMethods = {
  store,
  storeAccessor,
  _storeAccessorsModule,
};

/** @internal */
export function storeAccessorFor(this: Base, storeAttribute: string): typeof HashAccessor {
  const type = this.typeForAttribute(storeAttribute) as { accessor?: () => unknown };
  if (typeof type?.accessor !== "function") {
    throw new ConfigurationError(
      `the column '${storeAttribute}' has not been configured as a store. ` +
        `Please make sure the column is declared serializable via 'ActiveRecord.store' or, ` +
        `if your database supports it, use a structured column type like hstore or json.`,
    );
  }
  return type.accessor() as typeof HashAccessor;
}

export function readStoreAttribute(this: Base, storeAttribute: string, key: string): unknown {
  const accessor = this.storeAccessorFor(storeAttribute);
  return accessor.read(this, storeAttribute, key);
}

export function writeStoreAttribute(
  this: Base,
  storeAttribute: string,
  key: string,
  value: unknown,
): void {
  const accessor = this.storeAccessorFor(storeAttribute);
  accessor.write(this, storeAttribute, key, value);
}

/** @internal */
function asRegularHash(obj: unknown): Record<string, unknown> {
  if (obj == null) return {};
  if (obj instanceof HashWithIndifferentAccess) return obj.toHash();
  if (typeof obj !== "object" || Array.isArray(obj)) return {};
  const proto = Object.getPrototypeOf(obj);
  return proto === Object.prototype || proto === null
    ? { ...(obj as Record<string, unknown>) }
    : {};
}

export function asIndifferentHash(obj: unknown): HashWithIndifferentAccess<unknown> {
  if (obj instanceof HashWithIndifferentAccess) return obj;
  if (obj !== null && obj !== undefined && typeof obj === "object" && !Array.isArray(obj)) {
    return withIndifferentAccess(obj as Record<string, unknown>);
  }
  return new HashWithIndifferentAccess();
}
