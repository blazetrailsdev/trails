import { Attribute, Uninitialized } from "./attribute.js";
import { KeyError } from "@blazetrails/ruby-compat";
import { Type } from "./type/value.js";
import { typeRegistry } from "./type/registry.js";

function transformValues<T>(
  attributes: Map<string, Attribute>,
  block: (attr: Attribute) => T,
): Map<string, T> {
  const result = new Map<string, T>();
  for (const [name, attr] of attributes) result.set(name, block(attr));
  return result;
}

function eachKey(attributes: Map<string, Attribute>): string[] {
  return [...attributes.keys()];
}

export class AttributeSet {
  protected _attributes: Map<string, Attribute>;

  eachValue(fn: (attr: Attribute) => void): void {
    for (const attr of this.attributes().values()) fn(attr);
  }

  fetch<T = Attribute>(name: string, defaultOrBlock?: T | ((name: string) => T)): Attribute | T {
    const attr = this.attributes().get(name);
    if (attr !== undefined) return attr;
    if (typeof defaultOrBlock === "function") return (defaultOrBlock as (name: string) => T)(name);
    if (defaultOrBlock !== undefined) return defaultOrBlock;
    throw new KeyError(`key not found: ${JSON.stringify(name)}`);
  }

  except(...names: string[]): Map<string, Attribute> {
    const drop = new Set(names);
    const result = new Map<string, Attribute>();
    for (const [name, attr] of this.attributes()) {
      if (!drop.has(name)) result.set(name, attr);
    }
    return result;
  }

  constructor(attributes: Map<string, Attribute> = new Map()) {
    this._attributes = attributes;
  }

  getAttribute(name: string): Attribute {
    return this._attributes.get(name) ?? this.defaultAttribute(name);
  }

  set(name: string, value: Attribute): void {
    this.assertNotFrozen();
    this._attributes.set(name, value);
  }

  castTypes(): Record<string, Type> {
    return Object.fromEntries(transformValues(this.attributes(), (attr) => attr.type));
  }

  valuesBeforeTypeCast(): Record<string, unknown> {
    return Object.fromEntries(
      transformValues(this.attributes(), (attr) => attr.valueBeforeTypeCast),
    );
  }

  valuesForDatabase(): Record<string, unknown> {
    return Object.fromEntries(transformValues(this.attributes(), (attr) => attr.valueForDatabase));
  }

  isKey(name: string): boolean {
    const attr = this.attributes().get(name);
    return attr !== undefined && attr.isInitialized();
  }

  isInclude(name: string): boolean {
    return this.isKey(name);
  }

  keys(): string[] {
    return eachKey(this.attributes()).filter((name) => this.getAttribute(name).isInitialized());
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
    const existing = this._attributes.get(name);
    if (existing) {
      this._attributes.set(name, existing.withValueFromDatabase(value));
    } else {
      const colType = (type as Type) ?? typeRegistry.lookup("value");
      this._attributes.set(name, Attribute.fromDatabase(name, value, colType));
    }
  }

  writeFromUser(name: string, value: unknown): unknown {
    if (Object.isFrozen(this)) {
      const err = new Error("can't modify frozen attributes");
      err.name = "FrozenError";
      throw err;
    }
    this._attributes.set(name, this.getAttribute(name).withValueFromUser(value));
    return value;
  }

  writeCastValue(name: string, value: unknown): void {
    this.assertNotFrozen();
    this._attributes.set(name, this.getAttribute(name).withCastValue(value));
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
    return eachKey(this.attributes()).filter((name) => this.getAttribute(name).hasBeenRead());
  }

  map(fn: (attr: Attribute) => Attribute): AttributeSet {
    const newAttributes = transformValues(this.attributes(), fn);
    return new AttributeSet(newAttributes);
  }

  reverseMergeBang(targetAttributes: AttributeSet): this {
    this.assertNotFrozen();
    for (const [name, attr] of targetAttributes.attributes()) {
      if (!this._attributes.has(name)) {
        this._attributes.set(name, attr);
      }
    }
    return this;
  }

  protected attributes(): Map<string, Attribute> {
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
    this._attributes = new Map(this._attributes);
  }

  private assertNotFrozen(): void {
    if (Object.isFrozen(this)) {
      const err = new Error("can't modify frozen AttributeSet");
      err.name = "FrozenError";
      throw err;
    }
  }

  /** @noRailsEquivalent PERMANENT */
  *[Symbol.iterator](): IterableIterator<[string, unknown]> {
    for (const name of this.keys()) {
      yield [name, this.fetchValue(name)];
    }
  }
}
