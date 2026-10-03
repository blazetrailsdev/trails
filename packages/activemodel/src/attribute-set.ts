import { deepDup, indexWith, reverseMergeBang } from "@blazetrails/activesupport";
import { Attribute } from "./attribute.js";
import type { LazyAttributeHash } from "./attribute-set/builder.js";
import {
  FrozenError,
  block,
  eachKey,
  eachValue,
  except,
  fetch,
  hasKey,
  hashAref,
  hashAset,
  rbDeclareIvar,
  rbEqual,
  rbObjClone,
  rbObjDup,
  transformValues,
  registerConstant,
} from "@blazetrails/ruby-compat";
import { ValueType } from "./type/value.js";

type Attributes = Record<string, Attribute> | LazyAttributeHash;

export class AttributeSet {
  protected _attributes: Attributes;

  eachValue(fn: (attr: Attribute) => void): void {
    eachValue(this.attributes(), fn);
  }

  fetch<T = Attribute>(name: string, defaultOrBlock?: T | ((name: string) => T)): Attribute | T {
    const attributes = this.attributes();
    if (defaultOrBlock === undefined) return fetch<Attribute>(attributes, name);
    return typeof defaultOrBlock === "function"
      ? fetch(attributes, name, block(defaultOrBlock as (name: string) => Attribute))
      : fetch(attributes, name, defaultOrBlock as Attribute);
  }

  except(...names: string[]): Record<string, Attribute> {
    return except(this.attributes(), ...names);
  }

  constructor(attributes: Attributes = {}) {
    this._attributes = attributes;
  }

  getAttribute(name: string): Attribute {
    return (
      (hashAref(this._attributes, name) as Attribute | null | undefined) ??
      this.defaultAttribute(name)
    );
  }

  set(name: string, value: Attribute): void {
    hashAset(this._attributes, name, value);
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
    return eachKey(this.attributes()).filter((name) => this.getAttribute(name).isInitialized());
  }

  fetchValue(name: string, block?: (name: string) => unknown): unknown {
    return this.getAttribute(name).value(block);
  }

  writeFromDatabase(name: string, value: unknown): void {
    hashAset(this._attributes, name, this.getAttribute(name).withValueFromDatabase(value));
  }

  writeFromUser(name: string, value: unknown): unknown {
    if (Object.isFrozen(this)) {
      throw new FrozenError("can't modify frozen attributes");
    }
    hashAset(this._attributes, name, this.getAttribute(name).withValueFromUser(value));
    return value;
  }

  writeCastValue(name: string, value: unknown): Attribute {
    return hashAset(this._attributes, name, this.getAttribute(name).withCastValue(value));
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
    this._attributes = rbObjDup(this._attributes);
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
    return eachKey(this.attributes()).filter((name) => this.getAttribute(name).hasBeenRead());
  }

  map(fn: (attr: Attribute) => Attribute): AttributeSet {
    const newAttributes = transformValues(this.attributes(), fn);
    return new AttributeSet(newAttributes);
  }

  reverseMergeBang(targetAttributes: AttributeSet): this {
    return reverseMergeBang(this.attributes(), targetAttributes.attributes()) && this;
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
