import { Attribute, Uninitialized } from "./attribute.js";
import {
  FrozenError,
  KeyError,
  dup,
  eachKey,
  except,
  hasKey,
  rbInspect,
  transformValues,
} from "@blazetrails/ruby-compat";
import { ValueType } from "./type/value.js";
import { defaultValue } from "./type.js";

/** @noRailsEquivalent PERMANENT */
function frozenErrorRaisingStore(attributes: Record<string, Attribute>): Record<string, Attribute> {
  const raiseIfFrozen = (target: Record<string, Attribute>): void => {
    if (Object.isFrozen(target)) {
      throw new FrozenError(`can't modify frozen Hash: ${rbInspect(target)}`);
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

export class AttributeSet {
  protected _attributes: Record<string, Attribute>;

  eachValue(fn: (attr: Attribute) => void): void {
    for (const attr of Object.values(this.attributes())) fn(attr);
  }

  fetch<T = Attribute>(name: string, defaultOrBlock?: T | ((name: string) => T)): Attribute | T {
    const attributes = this.attributes();
    if (hasKey(attributes, name)) return attributes[name];
    if (typeof defaultOrBlock === "function") return (defaultOrBlock as (name: string) => T)(name);
    if (defaultOrBlock !== undefined) return defaultOrBlock;
    throw new KeyError(`key not found: ${rbInspect(name)}`);
  }

  except(...names: string[]): Record<string, Attribute> {
    return except(this.attributes(), ...names);
  }

  constructor(attributes: Record<string, Attribute> = {}) {
    this._attributes = frozenErrorRaisingStore(
      Object.setPrototypeOf(attributes, null) as Record<string, Attribute>,
    );
  }

  getAttribute(name: string): Attribute {
    return this._attributes[name] ?? this.defaultAttribute(name);
  }

  set(name: string, value: Attribute): void {
    this._attributes[name] = value;
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
    return hasKey(this.attributes(), name) && this.getAttribute(name).isInitialized();
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

  writeFromDatabase(
    name: string,
    value: unknown,
    type?: { deserialize(value: unknown): unknown },
  ): void {
    const existing = this._attributes[name];
    if (existing) {
      this._attributes[name] = existing.withValueFromDatabase(value);
    } else {
      const colType = (type as ValueType) ?? defaultValue();
      this._attributes[name] = Attribute.fromDatabase(name, value, colType);
    }
  }

  writeFromUser(name: string, value: unknown): unknown {
    if (Object.isFrozen(this)) {
      throw new FrozenError("can't modify frozen attributes");
    }
    this._attributes[name] = this.getAttribute(name).withValueFromUser(value);
    return value;
  }

  writeCastValue(name: string, value: unknown): void {
    this._attributes[name] = this.getAttribute(name).withCastValue(value);
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
    for (const [name, attr] of Object.entries(targetAttributes.attributes())) {
      if (!hasKey(this._attributes, name)) {
        this._attributes[name] = attr;
      }
    }
    return this;
  }

  protected attributes(): Record<string, Attribute> {
    return this._attributes;
  }

  /** @internal */
  protected defaultAttribute(name: string): Attribute {
    return Attribute.null(name);
  }

  equals(other: unknown): boolean {
    if (!(other instanceof AttributeSet)) return false;
    const attributes = this.attributes();
    const otherAttributes = other.attributes();
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

  initializeDup(_other: AttributeSet): void {
    this._attributes = frozenErrorRaisingStore(dup(this._attributes));
  }

  initializeClone(_other: AttributeSet): void {
    this._attributes = frozenErrorRaisingStore(dup(this._attributes));
  }

  /** @noRailsEquivalent PERMANENT */
  *[Symbol.iterator](): IterableIterator<[string, unknown]> {
    for (const name of this.keys()) {
      yield [name, this.fetchValue(name)];
    }
  }
}
