import { Attribute, Uninitialized } from "../attribute.js";
import { KeyError, eachKey, hasKey, transformValues } from "@blazetrails/ruby-compat";
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
      eachKey(this.values, (key) => this.getAttribute(key));
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
  private delegate: Record<string, Attribute>;
  private types: Map<string, Type>;
  private values: Record<string, unknown>;
  private additionalTypes: Map<string, Type>;
  private defaultAttributes: Map<string, Attribute>;
  private materialized: boolean;

  transformValues<T>(fn: (attr: Attribute) => T): Record<string, T> {
    return transformValues(this.materialize(), fn);
  }

  eachValue(fn: (attr: Attribute) => void): void {
    for (const attr of Object.values(this.materialize())) fn(attr);
  }

  fetch(name: string, defaultOrBlock?: Attribute | ((name: string) => Attribute)): Attribute {
    const materialized = this.materialize();
    if (hasKey(materialized, name)) return materialized[name];
    if (typeof defaultOrBlock === "function") return defaultOrBlock(name);
    if (defaultOrBlock !== undefined) return defaultOrBlock;
    throw new KeyError(`key not found: ${JSON.stringify(name)}`);
  }

  except(...names: string[]): Record<string, Attribute> {
    const drop = new Set(names);
    const result: Record<string, Attribute> = {};
    for (const [name, attr] of Object.entries(this.materialize())) {
      if (!drop.has(name)) result[name] = attr;
    }
    return result;
  }

  constructor(
    types: Map<string, Type>,
    values: Record<string, unknown>,
    additionalTypes: Map<string, Type> = new Map(),
    defaultAttributes: Map<string, Attribute> = new Map(),
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
    return hasKey(this.delegate, key) || Object.hasOwn(this.values, key) || this.types.has(key);
  }

  getAttribute(key: string): Attribute {
    return this.delegate[key] ?? this.assignDefaultValue(key);
  }

  set(key: string, value: Attribute): void {
    this.delegate[key] = value;
  }

  deepDup(): LazyAttributeHash {
    const delegateHash = transformValues(this.delegate, (attr) => attr.dup());
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
      ...Object.keys(this.delegate),
    ]);
    for (const key of keys) fn(key);
  }

  marshalDump(): [
    Map<string, Type>,
    Record<string, unknown>,
    Map<string, Type>,
    Map<string, Attribute>,
    Record<string, Attribute>,
  ] {
    return [this.types, this.values, this.additionalTypes, this.defaultAttributes, this.delegate];
  }

  static marshalLoad(
    values: [
      Map<string, Type>,
      Record<string, unknown>,
      (Map<string, Type> | undefined)?,
      (Map<string, Attribute> | undefined)?,
      (Record<string, Attribute> | undefined)?,
    ],
  ): LazyAttributeHash {
    return new LazyAttributeHash(values[0], values[1], values[2], values[3], values[4]);
  }

  /** @internal */
  protected materialize(): Record<string, Attribute> {
    if (!this.materialized) {
      eachKey(this.values, (key) => this.getAttribute(key));
      for (const key of this.types.keys()) this.getAttribute(key);
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
      this.delegate[name] = attr;
      return attr;
    } else if (this.types.has(name)) {
      const attr = this.defaultAttributes.get(name);
      const built = attr ? attr.dup() : Attribute.uninitialized(name, type);
      this.delegate[name] = built;
      return built;
    }
    return Attribute.null(name);
  }
}
