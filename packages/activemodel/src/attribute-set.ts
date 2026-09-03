import { Attribute, Uninitialized } from "./attribute.js";
import {
  FrozenError,
  KeyError,
  dup,
  eachKey,
  except,
  hasKey,
  transformValues,
} from "@blazetrails/ruby-compat";
import { Type } from "./type/value.js";
import { defaultValue } from "./type.js";

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
    throw new KeyError(`key not found: ${JSON.stringify(name)}`);
  }

  except(...names: string[]): Record<string, Attribute> {
    return except(this.attributes(), ...names);
  }

  constructor(attributes: Record<string, Attribute> = {}) {
    this._attributes = Object.setPrototypeOf(attributes, null) as Record<string, Attribute>;
  }

  getAttribute(name: string): Attribute {
    return this._attributes[name] ?? this.defaultAttribute(name);
  }

  set(name: string, value: Attribute): void {
    this.assertNotFrozen();
    this._attributes[name] = value;
  }

  castTypes(): Record<string, Type> {
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
    this.assertNotFrozen();
    const existing = this._attributes[name];
    if (existing) {
      this._attributes[name] = existing.withValueFromDatabase(value);
    } else {
      const colType = (type as Type) ?? defaultValue();
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
    this.assertNotFrozen();
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
    this.assertNotFrozen();
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

  toHash(): Record<string, unknown> {
    const result: Record<string, unknown> = {};
    for (const name of this.keys()) {
      result[name] = this.getAttribute(name).value;
    }
    return result;
  }

  freeze(): this {
    Object.freeze(this);
    return this;
  }

  initializeClone(_other: AttributeSet): void {
    this._attributes = dup(this._attributes);
  }

  private assertNotFrozen(): void {
    if (Object.isFrozen(this)) {
      throw new FrozenError("can't modify frozen AttributeSet");
    }
  }

  /** @noRailsEquivalent PERMANENT */
  *[Symbol.iterator](): IterableIterator<[string, unknown]> {
    for (const name of this.keys()) {
      yield [name, this.fetchValue(name)];
    }
  }
}
