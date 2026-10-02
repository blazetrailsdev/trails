import {
  indexWith,
  isPlainObject,
  reverseMergeBang as hashReverseMergeBang,
} from "@blazetrails/activesupport";
import { Attribute } from "./attribute.js";
import type { LazyAttributeHash } from "./attribute-set/builder.js";
import type { Block } from "@blazetrails/ruby-compat";
import {
  FrozenError,
  block,
  dup,
  eachKey as hashEachKey,
  eachValue,
  except,
  fetch as hashFetch,
  hasKey,
  rbDeclareIvar,
  rbFPublicSend,
  rbInspect,
  rbEqual,
  rbObjClone,
  transformValues as hashTransformValues,
  registerConstant,
} from "@blazetrails/ruby-compat";
import { ValueType } from "./type/value.js";

/** @noRailsEquivalent CONVERGEABLE attribute-set-and-serialization-plain-object-hash-helpers */
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

function eachKey(attributes: Attributes): string[] {
  return isHash(attributes) ? hashEachKey(attributes) : attributes.eachKey();
}

function fetch(
  attributes: Attributes,
  name: string,
  ...rest: [] | [Attribute] | [Block<Attribute>]
): Attribute {
  if (!isHash(attributes)) return attributes.fetch(name, ...rest);
  return rest.length === 0
    ? hashFetch<Attribute>(attributes, name)
    : hashFetch<Attribute>(attributes, name, rest[0] as Attribute);
}

function reverseMergeBang(attributes: Attributes, otherHash: Attributes): unknown {
  if (!isHash(attributes)) return rbFPublicSend(attributes, "reverseMergeBang", otherHash);
  if (!isHash(otherHash)) return rbFPublicSend(otherHash, "merge", attributes);
  return hashReverseMergeBang(attributes, otherHash);
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
    if (defaultOrBlock === undefined) return fetch(attributes, name);
    return typeof defaultOrBlock === "function"
      ? fetch(attributes, name, block(defaultOrBlock as (name: string) => Attribute))
      : fetch(attributes, name, defaultOrBlock as Attribute);
  }

  except(...names: string[]): Record<string, Attribute> {
    const attributes = this.attributes();
    return isHash(attributes) ? except(attributes, ...names) : attributes.except(...names);
  }

  constructor(attributes: Attributes = {}) {
    this._attributes = isHash(attributes)
      ? frozenErrorRaisingStore(
          Object.setPrototypeOf(attributes, null) as Record<string, Attribute>,
        )
      : attributes;
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
    return eachKey(this.attributes()).filter((name) => this.getAttribute(name).isInitialized());
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
    return new AttributeSet(transformValues(this.attributes(), (attr) => attr.deepDup()));
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
      ? frozenErrorRaisingStore(rbObjClone(attributes))
      : rbObjClone(attributes);
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
