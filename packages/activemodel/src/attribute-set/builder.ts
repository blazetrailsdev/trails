import { Attribute, Uninitialized } from "../attribute.js";
import type { Block } from "@blazetrails/ruby-compat";
import {
  eachKey,
  eachValue,
  except,
  fetch,
  hasKey,
  transformValues,
} from "@blazetrails/ruby-compat";
import { Type } from "../type/value.js";
import { AttributeSet } from "../attribute-set.js";

export class Builder {
  readonly types: Record<string, Type>;
  readonly defaultAttributes: Record<string, Attribute>;

  constructor(types: Record<string, Type>, defaultAttributes: Record<string, Attribute> = {}) {
    this.types = types;
    this.defaultAttributes = defaultAttributes;
  }

  buildFromDatabase(
    values: Record<string, unknown> = {},
    additionalTypes: Record<string, Type> = {},
  ): AttributeSet {
    return new LazyAttributeSet(values, this.types, additionalTypes, this.defaultAttributes);
  }
}

export class LazyAttributeSet extends AttributeSet {
  private values: Record<string, unknown>;
  private types: Record<string, Type>;
  private additionalTypes: Record<string, Type>;
  private defaultAttributes: Record<string, Attribute>;
  private castedValues: Record<string, unknown>;
  private materialized: boolean;

  constructor(
    values: Record<string, unknown>,
    types: Record<string, Type>,
    additionalTypes: Record<string, Type>,
    defaultAttributes: Record<string, Attribute>,
    attributes: Record<string, Attribute> = {},
  ) {
    super(attributes);
    this.values = values;
    this.types = types;
    this.additionalTypes = additionalTypes;
    this.defaultAttributes = defaultAttributes;
    this.castedValues = {};
    this.materialized = false;
  }

  override isKey(name: string): boolean {
    return (
      (Object.hasOwn(this.values, name) ||
        hasKey(this.types, name) ||
        hasKey(this._attributes, name)) &&
      this.getAttribute(name).isInitialized()
    );
  }

  override keys(): string[] {
    const keys = new Set([
      ...Object.keys(this.values),
      ...Object.keys(this.types),
      ...Object.keys(this._attributes),
    ]);
    return [...keys].filter((name) => this.getAttribute(name).isInitialized());
  }

  override fetchValue(name: string, block?: (name: string) => unknown): unknown {
    const attr = this._attributes[name];
    if (attr) {
      if (block !== undefined && attr instanceof Uninitialized) return block(name);
      return attr.value;
    }

    if (hasKey(this.castedValues, name)) return this.castedValues[name];

    let valuePresent = true;
    let value: unknown;
    if (Object.hasOwn(this.values, name)) {
      value = this.values[name];
    } else {
      valuePresent = false;
    }

    if (valuePresent) {
      const type = fetch<Type>(this.additionalTypes, name, this.types[name]);
      const casted = type.deserialize(value);
      this.castedValues[name] = casted;
      return casted;
    } else {
      const attr = this.defaultAttribute(name, valuePresent, value);
      if (block !== undefined && attr instanceof Uninitialized) return block(name);
      return attr.value;
    }
  }

  protected override attributes(): Record<string, Attribute> {
    if (!this.materialized) {
      eachKey(this.values, (key) => this.getAttribute(key));
      eachKey(this.types, (key) => this.getAttribute(key));
      this.materialized = true;
    }
    return this._attributes;
  }

  protected override defaultAttribute(
    name: string,
    valuePresent?: boolean,
    value?: unknown,
  ): Attribute {
    if (valuePresent === undefined) {
      valuePresent = Object.hasOwn(this.values, name);
      value = valuePresent ? this.values[name] : undefined;
    }

    const type = fetch<Type>(this.additionalTypes, name, this.types[name]);

    if (valuePresent) {
      const attr = Attribute.fromDatabase(name, value, type, this.castedValues[name]);
      this._attributes[name] = attr;
      return attr;
    } else if (hasKey(this.types, name)) {
      const attr = this.defaultAttributes[name];
      const built = attr ? attr.dup() : Attribute.uninitialized(name, type);
      this._attributes[name] = built;
      return built;
    } else {
      return Attribute.null(name);
    }
  }
}

export class LazyAttributeHash {
  private delegate: Record<string, Attribute>;
  private types: Record<string, Type>;
  private values: Record<string, unknown>;
  private additionalTypes: Record<string, Type>;
  private defaultAttributes: Record<string, Attribute>;
  private materialized: boolean;

  transformValues<T>(fn: (attr: Attribute) => T): Record<string, T> {
    return transformValues(this.materialize(), fn);
  }

  eachValue(fn: (attr: Attribute) => void): void {
    eachValue(this.materialize(), fn);
  }

  fetch(name: string, ...rest: [] | [Attribute] | [Block<Attribute>]): Attribute {
    const materialized = this.materialize();
    return rest.length === 0
      ? fetch<Attribute>(materialized, name)
      : fetch<Attribute>(materialized, name, rest[0] as Attribute);
  }

  except(...names: string[]): Record<string, Attribute> {
    return except(this.materialize(), ...names);
  }

  constructor(
    types: Record<string, Type>,
    values: Record<string, unknown>,
    additionalTypes: Record<string, Type> = {},
    defaultAttributes: Record<string, Attribute> = {},
    delegateHash: Record<string, Attribute> = {},
  ) {
    this.types = types;
    this.values = values;
    this.additionalTypes = additionalTypes;
    this.materialized = false;
    this.defaultAttributes = defaultAttributes;
    this.delegate = Object.setPrototypeOf(delegateHash, null) as Record<string, Attribute>;
  }

  isKey(key: string): boolean {
    return hasKey(this.delegate, key) || hasKey(this.values, key) || hasKey(this.types, key);
  }

  getAttribute(key: string): Attribute {
    return this.delegate[key] ?? this.assignDefaultValue(key);
  }

  set(key: string, value: Attribute): void {
    this.delegate[key] = value;
  }

  deepDup(): LazyAttributeHash {
    const copy = new LazyAttributeHash(
      this.types,
      this.values,
      this.additionalTypes,
      this.defaultAttributes,
      transformValues(this.delegate, (attr) => attr.dup()),
    );
    copy.materialized = this.materialized;
    return copy;
  }

  eachKey(fn: (key: string) => void): void {
    const keys = new Set([
      ...Object.keys(this.types),
      ...Object.keys(this.values),
      ...Object.keys(this.delegate),
    ]);
    for (const key of keys) fn(key);
  }

  marshalDump(): [
    Record<string, Type>,
    Record<string, unknown>,
    Record<string, Type>,
    Record<string, Attribute>,
    Record<string, Attribute>,
  ] {
    return [this.types, this.values, this.additionalTypes, this.defaultAttributes, this.delegate];
  }

  static marshalLoad(
    values: [
      Record<string, Type>,
      Record<string, unknown>,
      (Record<string, Type> | undefined)?,
      (Record<string, Attribute> | undefined)?,
      (Record<string, Attribute> | undefined)?,
    ],
  ): LazyAttributeHash {
    return new LazyAttributeHash(values[0], values[1], values[2], values[3], values[4]);
  }

  /** @internal */
  protected materialize(): Record<string, Attribute> {
    if (!this.materialized) {
      eachKey(this.values, (key) => this.getAttribute(key));
      eachKey(this.types, (key) => this.getAttribute(key));
      if (!Object.isFrozen(this)) {
        this.materialized = true;
      }
    }
    return this.delegate;
  }

  /** @internal */
  delegateHash(): Record<string, Attribute> {
    return this.delegate;
  }

  /** @internal */
  assignDefaultValue(name: string): Attribute {
    const type = fetch<Type>(this.additionalTypes, name, this.types[name]);
    let valuePresent = true;
    let value: unknown;
    if (Object.hasOwn(this.values, name)) {
      value = this.values[name];
    } else {
      valuePresent = false;
    }

    if (valuePresent) {
      const attr = Attribute.fromDatabase(name, value, type);
      this.delegate[name] = attr;
      return attr;
    } else if (hasKey(this.types, name)) {
      const attr = this.defaultAttributes[name];
      const built = attr ? attr.dup() : Attribute.uninitialized(name, type);
      this.delegate[name] = built;
      return built;
    }
    return Attribute.null(name);
  }
}
