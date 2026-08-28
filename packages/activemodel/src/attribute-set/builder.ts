import { Attribute, Uninitialized } from "../attribute.js";
import { Type } from "../type/value.js";
import { defaultValue } from "../type.js";
import { AttributeSet } from "../attribute-set.js";

export class Builder {
  readonly types: Map<string, Type>;
  readonly defaultAttributes: Map<string, Attribute>;

  constructor(types: Map<string, Type>, defaultAttributes: Map<string, Attribute> = new Map()) {
    this.types = types;
    this.defaultAttributes = defaultAttributes;
  }

  buildFromDatabase(
    values: Record<string, unknown> = {},
    additionalTypes: Map<string, Type> = new Map(),
  ): AttributeSet {
    return new LazyAttributeSet(values, this.types, additionalTypes, this.defaultAttributes);
  }
}

export class LazyAttributeSet extends AttributeSet {
  private values: Record<string, unknown>;
  private types: Map<string, Type>;
  private additionalTypes: Map<string, Type>;
  private defaultAttributes: Map<string, Attribute>;
  private castedValues: Map<string, unknown>;
  private materialized: boolean;

  constructor(
    values: Record<string, unknown>,
    types: Map<string, Type>,
    additionalTypes: Map<string, Type>,
    defaultAttributes: Map<string, Attribute>,
    attributes: Map<string, Attribute> = new Map(),
  ) {
    super(attributes);
    this.values = values;
    this.types = types;
    this.additionalTypes = additionalTypes;
    this.defaultAttributes = defaultAttributes;
    this.castedValues = new Map();
    this.materialized = false;
  }

  override isKey(name: string): boolean {
    return (
      (Object.hasOwn(this.values, name) || this.types.has(name) || this._attributes.has(name)) &&
      this.getAttribute(name).isInitialized()
    );
  }

  override keys(): string[] {
    const keys = new Set([
      ...Object.keys(this.values),
      ...this.types.keys(),
      ...this._attributes.keys(),
    ]);
    return [...keys].filter((name) => this.getAttribute(name).isInitialized());
  }

  override fetchValue(name: string, block?: (name: string) => unknown): unknown {
    const attr = this._attributes.get(name);
    if (attr) {
      if (block !== undefined && attr instanceof Uninitialized) return block(name);
      return attr.value;
    }

    if (this.castedValues.has(name)) return this.castedValues.get(name);

    let valuePresent = true;
    let value: unknown;
    if (Object.hasOwn(this.values, name)) {
      value = this.values[name];
    } else {
      valuePresent = false;
    }

    if (valuePresent) {
      const type = this.additionalTypes.get(name) ?? this.types.get(name) ?? defaultValue();
      const casted = type.deserialize(value);
      this.castedValues.set(name, casted);
      return casted;
    } else {
      const attr = this.defaultAttribute(name, valuePresent, value);
      if (block !== undefined && attr instanceof Uninitialized) return block(name);
      return attr.value;
    }
  }

  protected override attributes(): Map<string, Attribute> {
    if (!this.materialized) {
      for (const key of Object.keys(this.values)) this.getAttribute(key);
      for (const key of this.types.keys()) this.getAttribute(key);
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

    const type = this.additionalTypes.get(name) ?? this.types.get(name) ?? defaultValue();

    if (valuePresent) {
      const castedValue = this.castedValues.get(name);
      const attr =
        castedValue === undefined
          ? Attribute.fromDatabase(name, value, type)
          : Attribute.fromDatabase(name, value, type, castedValue);
      this._attributes.set(name, attr);
      return attr;
    } else if (this.types.has(name)) {
      const attr = this.defaultAttributes.get(name);
      const built = attr ? attr.dup() : Attribute.uninitialized(name, type);
      this._attributes.set(name, built);
      return built;
    } else {
      return Attribute.null(name);
    }
  }
}

export class LazyAttributeHash {
  private delegate: Map<string, Attribute>;
  private types: Map<string, Type>;
  private values: Record<string, unknown>;
  private additionalTypes: Map<string, Type>;
  private defaultAttributes: Map<string, Attribute>;
  private materialized: boolean;

  transformValues<T>(fn: (attr: Attribute) => T): Map<string, T> {
    const result = new Map<string, T>();
    for (const [name, attr] of this.materialize()) result.set(name, fn(attr));
    return result;
  }

  eachValue(fn: (attr: Attribute) => void): void {
    for (const attr of this.materialize().values()) fn(attr);
  }

  fetch(name: string, defaultOrBlock?: Attribute | ((name: string) => Attribute)): Attribute {
    const materialized = this.materialize();
    const attr = materialized.get(name);
    if (attr !== undefined) return attr;
    if (typeof defaultOrBlock === "function") return defaultOrBlock(name);
    if (defaultOrBlock !== undefined) return defaultOrBlock;
    const err = new Error(`key not found: ${JSON.stringify(name)}`);
    err.name = "KeyError";
    throw err;
  }

  except(...names: string[]): Map<string, Attribute> {
    const drop = new Set(names);
    const result = new Map<string, Attribute>();
    for (const [name, attr] of this.materialize()) {
      if (!drop.has(name)) result.set(name, attr);
    }
    return result;
  }

  constructor(
    types: Map<string, Type>,
    values: Record<string, unknown>,
    additionalTypes: Map<string, Type> = new Map(),
    defaultAttributes: Map<string, Attribute> = new Map(),
    delegateHash: Map<string, Attribute> = new Map(),
  ) {
    this.types = types;
    this.values = values;
    this.additionalTypes = additionalTypes;
    this.materialized = false;
    this.defaultAttributes = defaultAttributes;
    this.delegate = delegateHash;
  }

  isKey(key: string): boolean {
    return this.delegate.has(key) || Object.hasOwn(this.values, key) || this.types.has(key);
  }

  getAttribute(key: string): Attribute {
    return this.delegate.get(key) ?? this.assignDefaultValue(key);
  }

  set(key: string, value: Attribute): void {
    this.delegate.set(key, value);
  }

  deepDup(): LazyAttributeHash {
    const delegateHash = new Map<string, Attribute>();
    for (const [name, attr] of this.delegate) delegateHash.set(name, attr.dup());
    return new LazyAttributeHash(
      this.types,
      this.values,
      this.additionalTypes,
      this.defaultAttributes,
      delegateHash,
    );
  }

  eachKey(fn: (key: string) => void): void {
    const keys = new Set([
      ...this.types.keys(),
      ...Object.keys(this.values),
      ...this.delegate.keys(),
    ]);
    for (const key of keys) fn(key);
  }

  marshalDump(): [
    Map<string, Type>,
    Record<string, unknown>,
    Map<string, Type>,
    Map<string, Attribute>,
    Map<string, Attribute>,
  ] {
    return [this.types, this.values, this.additionalTypes, this.defaultAttributes, this.delegate];
  }

  static marshalLoad(
    values: [
      Map<string, Type>,
      Record<string, unknown>,
      (Map<string, Type> | undefined)?,
      (Map<string, Attribute> | undefined)?,
      (Map<string, Attribute> | undefined)?,
    ],
  ): LazyAttributeHash {
    return new LazyAttributeHash(values[0], values[1], values[2], values[3], values[4]);
  }

  /** @internal */
  protected materialize(): Map<string, Attribute> {
    if (!this.materialized) {
      for (const key of Object.keys(this.values)) this.getAttribute(key);
      for (const key of this.types.keys()) this.getAttribute(key);
      if (!Object.isFrozen(this)) {
        this.materialized = true;
      }
    }
    return this.delegate;
  }

  /** @internal */
  delegateHash(): Map<string, Attribute> {
    return this.delegate;
  }

  /** @internal */
  assignDefaultValue(name: string): Attribute {
    const type = this.additionalTypes.get(name) ?? this.types.get(name) ?? defaultValue();
    let valuePresent = true;
    let value: unknown;
    if (Object.hasOwn(this.values, name)) {
      value = this.values[name];
    } else {
      valuePresent = false;
    }

    if (valuePresent) {
      const attr = Attribute.fromDatabase(name, value, type);
      this.delegate.set(name, attr);
      return attr;
    } else if (this.types.has(name)) {
      const attr = this.defaultAttributes.get(name);
      const built = attr ? attr.dup() : Attribute.uninitialized(name, type);
      this.delegate.set(name, built);
      return built;
    }
    return Attribute.null(name);
  }
}
