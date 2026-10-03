import {
  deepDup,
  indexWith,
  isPlainObject,
  reverseMergeBang as hashReverseMergeBang,
} from "@blazetrails/activesupport";
import { Attribute } from "./attribute.js";
import type { LazyAttributeHash } from "./attribute-set/builder.js";
import {
  FrozenError,
  block,
  dup,
  eachKey,
  eachValue,
  except,
  fetch,
  hasKey,
  hashAref,
  hashAset,
  rbDeclareIvar,
  rbFPublicSend,
  rbEqual,
  rbObjClone,
  transformValues as hashTransformValues,
  registerConstant,
} from "@blazetrails/ruby-compat";
import { ValueType } from "./type/value.js";

type Attributes = Record<string, Attribute> | LazyAttributeHash;

function aref(attributes: Attributes, name: string): Attribute | undefined {
  return isPlainObject(attributes)
    ? ((hashAref(attributes, name) as Attribute | null) ?? undefined)
    : attributes.getAttribute(name);
}

function aset(attributes: Attributes, name: string, value: Attribute): Attribute {
  if (isPlainObject(attributes)) return hashAset(attributes, name, value);
  attributes.set(name, value);
  return value;
}

function reverseMergeBang(attributes: Attributes, otherHash: Attributes): unknown {
  if (!isPlainObject(attributes)) return rbFPublicSend(attributes, "reverseMergeBang", otherHash);
  if (!isPlainObject(otherHash)) return rbFPublicSend(otherHash, "merge", attributes);
  return hashReverseMergeBang(attributes, otherHash);
}

function transformValues<T>(
  attributes: Attributes,
  block: (attr: Attribute) => T,
): Record<string, T> {
  return isPlainObject(attributes)
    ? hashTransformValues(attributes, block)
    : attributes.transformValues(block);
}

export class AttributeSet {
  protected _attributes: Attributes;

  eachValue(fn: (attr: Attribute) => void): void {
    const attributes = this.attributes();
    if (isPlainObject(attributes)) eachValue(attributes, fn);
    else attributes.eachValue(fn);
  }

  fetch<T = Attribute>(name: string, defaultOrBlock?: T | ((name: string) => T)): Attribute | T {
    const attributes = this.attributes() as Record<string, Attribute>;
    if (defaultOrBlock === undefined) return fetch<Attribute>(attributes, name);
    return typeof defaultOrBlock === "function"
      ? fetch(attributes, name, block(defaultOrBlock as (name: string) => Attribute))
      : fetch(attributes, name, defaultOrBlock as Attribute);
  }

  except(...names: string[]): Record<string, Attribute> {
    const attributes = this.attributes();
    return isPlainObject(attributes) ? except(attributes, ...names) : attributes.except(...names);
  }

  constructor(attributes: Attributes = {}) {
    this._attributes = attributes;
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
    return hasKey(this.attributes(), name) && this.getAttribute(name).isInitialized();
  }

  isInclude(name: string): boolean {
    return this.isKey(name);
  }

  keys(): string[] {
    return eachKey(this.attributes() as Record<string, Attribute>).filter((name) =>
      this.getAttribute(name).isInitialized(),
    );
  }

  fetchValue(name: string, block?: (name: string) => unknown): unknown {
    return this.getAttribute(name).value(block);
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

  freeze(): this {
    Object.freeze(this.attributes());
    Object.freeze(this);
    return this;
  }

  deepDup(): AttributeSet {
    return new AttributeSet(transformValues(this.attributes(), (attr) => deepDup(attr)));
  }

  initializeDup(_: AttributeSet): void {
    const attributes = this._attributes;
    this._attributes = isPlainObject(attributes) ? dup(attributes) : attributes.dup();
  }

  initializeClone(_: AttributeSet): void {
    this._attributes = rbObjClone(this._attributes);
  }

  reset(key: string): void {
    if (this.isKey(key)) {
      this.writeFromDatabase(key, null);
    }
  }

  accessed(): string[] {
    return eachKey(this.attributes() as Record<string, Attribute>).filter((name) =>
      this.getAttribute(name).hasBeenRead(),
    );
  }

  map(fn: (attr: Attribute) => Attribute): AttributeSet {
    const newAttributes = transformValues(this.attributes(), fn);
    return new AttributeSet(newAttributes);
  }

  reverseMergeBang(targetAttributes: AttributeSet): this {
    return (reverseMergeBang(this.attributes(), targetAttributes.attributes()) as object) && this;
  }

  equals(other: unknown): boolean {
    return other instanceof AttributeSet && rbEqual(this.attributes(), other.attributes());
  }

  protected attributes(): Attributes {
    return this._attributes;
  }

  /** @internal */
  protected defaultAttribute(name: string): Attribute {
    return Attribute.null(name);
  }

  toHash(): Record<string, unknown> {
    return Object.fromEntries(indexWith(this.keys(), (name) => this.getAttribute(name).value()));
  }

  toH(): Record<string, unknown> {
    return this.toHash();
  }
}

rbDeclareIvar(AttributeSet, "@attributes", "_attributes");

registerConstant("ActiveModel::AttributeSet", AttributeSet);
