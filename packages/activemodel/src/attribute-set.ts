import { isPlainObject, registerConstant } from "@blazetrails/activesupport";
import { Attribute, Uninitialized } from "./attribute.js";
import type { LazyAttributeHash } from "./attribute-set/builder.js";
import {
  FrozenError,
  KeyError,
  dup,
  eachKey as hashEachKey,
  eachValue,
  except,
  hasKey,
  rbInspect,
  transformValues as hashTransformValues,
} from "@blazetrails/ruby-compat";
import { ValueType } from "./type/value.js";

/** @noRailsEquivalent PERMANENT */
function frozenErrorRaisingStore(attributes: Record<string, Attribute>): Record<string, Attribute> {
  const raiseIfFrozen = (target: Record<string, Attribute>): void => {
    if (Object.isFrozen(target)) {
      throw new FrozenError(`can't modify frozen Hash: ${rbInspect(target)}`, { receiver: target });
    }
  };
  return new Proxy(attributes, {
    set(target, name, value: Attribute): boolean {
      raiseIfFrozen(target);
      return Reflect.set(target, name, value);
    },
    deleteProperty(target, name): boolean {
      raiseIfFrozen(target);
      return Reflect.deleteProperty(target, name);
    },
  });
}

type Attributes = Record<string, Attribute> | LazyAttributeHash;

function isHash(attributes: Attributes): attributes is Record<string, Attribute> {
  return isPlainObject(attributes);
}

function aref(attributes: Attributes, name: string): Attribute | undefined {
  return isHash(attributes) ? attributes[name] : attributes.getAttribute(name);
}

function aset(attributes: Attributes, name: string, value: Attribute): Attribute {
  if (isHash(attributes)) attributes[name] = value;
  else attributes.set(name, value);
  return value;
}

function isKey(attributes: Attributes, name: string): boolean {
  return isHash(attributes) ? hasKey(attributes, name) : attributes.isKey(name);
}

function eachKey(attributes: Attributes, block: (name: string) => void): void {
  if (isHash(attributes)) hashEachKey(attributes, block);
  else attributes.eachKey(block);
}

function transformValues<T>(
  attributes: Attributes,
  block: (attr: Attribute) => T,
): Record<string, T> {
  return isHash(attributes)
    ? hashTransformValues(attributes, block)
    : attributes.transformValues(block);
}

export class AttributeSet {
  protected _attributes: Attributes;

  eachValue(fn: (attr: Attribute) => void): void {
    const attributes = this.attributes();
    if (isHash(attributes)) eachValue(attributes, fn);
    else attributes.eachValue(fn);
  }

  fetch<T = Attribute>(name: string, defaultOrBlock?: T | ((name: string) => T)): Attribute | T {
    const attributes = this.attributes();
    if (isKey(attributes, name)) return aref(attributes, name)!;
    if (typeof defaultOrBlock === "function") return (defaultOrBlock as (name: string) => T)(name);
    if (defaultOrBlock !== undefined) return defaultOrBlock;
    throw new KeyError(`key not found: ${rbInspect(name)}`, { receiver: attributes, key: name });
  }

  except(...names: string[]): Record<string, Attribute> {
    const attributes = this.attributes();
    return isHash(attributes) ? except(attributes, ...names) : attributes.except(...names);
  }

  constructor(attributes: Record<string, Attribute> = {}) {
    this._attributes = frozenErrorRaisingStore(
      Object.setPrototypeOf(attributes, null) as Record<string, Attribute>,
    );
  }

  getAttribute(name: string): Attribute {
    return aref(this._attributes, name) ?? this.defaultAttribute(name);
  }

  set(name: string, value: Attribute): void {
    aset(this._attributes, name, value);
  }

  castTypes(): Record<string, ValueType | null> {
    return transformValues(this.attributes(), (attr) => attr.type);
  }

  valuesBeforeTypeCast(): Record<string, unknown> {
    return transformValues(this.attributes(), (attr) => attr.valueBeforeTypeCast);
  }

  valuesForDatabase(): Record<string, unknown> {
    return transformValues(this.attributes(), (attr) => attr.valueForDatabase);
  }

  isKey(name: string): boolean {
    return isKey(this.attributes(), name) && this.getAttribute(name).isInitialized();
  }

  isInclude(name: string): boolean {
    return this.isKey(name);
  }

  keys(): string[] {
    const keys: string[] = [];
    eachKey(this.attributes(), (name) => {
      if (this.getAttribute(name).isInitialized()) keys.push(name);
    });
    return keys;
  }

  fetchValue(name: string, block?: (name: string) => unknown): unknown {
    const attr = this.getAttribute(name);
    if (block !== undefined && attr instanceof Uninitialized) {
      return block(name);
    }
    return attr.value;
  }

  writeFromDatabase(name: string, value: unknown): void {
    aset(this._attributes, name, this.getAttribute(name).withValueFromDatabase(value));
  }

  writeFromUser(name: string, value: unknown): unknown {
    if (Object.isFrozen(this)) {
      throw new FrozenError("can't modify frozen attributes");
    }
    aset(this._attributes, name, this.getAttribute(name).withValueFromUser(value));
    return value;
  }

  writeCastValue(name: string, value: unknown): Attribute {
    return aset(this._attributes, name, this.getAttribute(name).withCastValue(value));
  }

  deepDup(): AttributeSet {
    return new AttributeSet(transformValues(this.attributes(), (attr) => attr.deepDup()));
  }

  reset(key: string): void {
    if (this.isKey(key)) {
      this.writeFromDatabase(key, null);
    }
  }

  accessed(): string[] {
    const accessed: string[] = [];
    eachKey(this.attributes(), (name) => {
      if (this.getAttribute(name).hasBeenRead()) accessed.push(name);
    });
    return accessed;
  }

  map(fn: (attr: Attribute) => Attribute): AttributeSet {
    const newAttributes = transformValues(this.attributes(), fn);
    return new AttributeSet(newAttributes);
  }

  reverseMergeBang(targetAttributes: AttributeSet): this {
    const target = targetAttributes.attributes();
    eachKey(target, (name) => {
      if (!isKey(this._attributes, name)) aset(this._attributes, name, aref(target, name)!);
    });
    return this;
  }

  protected attributes(): Attributes {
    return this._attributes;
  }

  /** @internal */
  protected defaultAttribute(name: string): Attribute {
    return Attribute.null(name);
  }

  equals(other: unknown): boolean {
    if (!(other instanceof AttributeSet)) return false;
    const attributes = transformValues(this.attributes(), (attr) => attr);
    const otherAttributes = transformValues(other.attributes(), (attr) => attr);
    const names = Object.keys(attributes);
    if (names.length !== Object.keys(otherAttributes).length) return false;
    return names.every(
      (name) => hasKey(otherAttributes, name) && attributes[name].equals(otherAttributes[name]),
    );
  }

  toHash(): Record<string, unknown> {
    const result: Record<string, unknown> = {};
    for (const name of this.keys()) {
      result[name] = this.getAttribute(name).value;
    }
    return result;
  }

  freeze(): this {
    Object.freeze(this.attributes());
    Object.freeze(this);
    return this;
  }

  initializeDup(_: AttributeSet): void {
    const attributes = this._attributes;
    this._attributes = isHash(attributes)
      ? frozenErrorRaisingStore(dup(attributes))
      : attributes.dup();
  }

  initializeClone(_: AttributeSet): void {
    const attributes = this._attributes;
    this._attributes = isHash(attributes)
      ? frozenErrorRaisingStore(dup(attributes))
      : attributes.dup();
  }

  /** @noRailsEquivalent PERMANENT */
  *[Symbol.iterator](): IterableIterator<[string, unknown]> {
    for (const name of this.keys()) {
      yield [name, this.fetchValue(name)];
    }
  }
}

registerConstant("ActiveModel::AttributeSet", AttributeSet);
