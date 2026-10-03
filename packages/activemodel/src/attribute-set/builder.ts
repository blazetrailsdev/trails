import { Attribute } from "../attribute.js";
import type { Block } from "@blazetrails/ruby-compat";
import {
  block as rbBlock,
  dup,
  each,
  eachKey,
  eachValue,
  except,
  fetch,
  hasKey,
  keys as hashKeys,
  rbDeclareIvar,
  rbEqual,
  rbObjDup,
  transformValues,
  registerConstant,
} from "@blazetrails/ruby-compat";
import { ValueType } from "../type/value.js";
import { AttributeSet } from "../attribute-set.js";

export class Builder {
  readonly types: Record<string, ValueType>;
  readonly defaultAttributes: Record<string, Attribute>;

  constructor(types: Record<string, ValueType>, defaultAttributes: Record<string, Attribute> = {}) {
    this.types = types;
    this.defaultAttributes = defaultAttributes;
  }

  buildFromDatabase(
    values: Record<string, unknown> = {},
    additionalTypes: Record<string, ValueType> = {},
  ): AttributeSet {
    return new LazyAttributeSet(values, this.types, additionalTypes, this.defaultAttributes);
  }
}

export class LazyAttributeSet extends AttributeSet {
  declare protected _attributes: Record<string, Attribute>;
  private values: Record<string, unknown>;
  private types: Record<string, ValueType>;
  private additionalTypes: Record<string, ValueType>;
  private defaultAttributes: Record<string, Attribute>;
  private castedValues: Record<string, unknown>;
  private materialized: boolean;

  constructor(
    values: Record<string, unknown>,
    types: Record<string, ValueType>,
    additionalTypes: Record<string, ValueType>,
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
      (hasKey(this.values, name) || hasKey(this.types, name) || hasKey(this._attributes, name)) &&
      this.getAttribute(name).isInitialized()
    );
  }

  override keys(): string[] {
    const keys = new Set([
      ...hashKeys(this.values),
      ...hashKeys(this.types),
      ...hashKeys(this._attributes),
    ]);
    return [...keys].filter((name) => this.getAttribute(name).isInitialized());
  }

  override fetchValue(name: string, block?: (name: string) => unknown): unknown {
    const attr = this._attributes[name];
    if (attr) {
      return attr.value(block);
    }

    return fetch<unknown>(
      this.castedValues,
      name,
      rbBlock(() => {
        let valuePresent: boolean = true;
        const value = fetch<unknown>(
          this.values,
          name,
          rbBlock(() => {
            valuePresent = false;
          }),
        );

        if (valuePresent) {
          const type = fetch<ValueType>(this.additionalTypes, name, this.types[name]);
          return (this.castedValues[name] = type.deserialize(value));
        } else {
          const attr = this.defaultAttribute(name, valuePresent, value);
          return attr.value(block);
        }
      }),
    );
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
    valuePresent: boolean = true,
    value: unknown = fetch<unknown>(
      this.values,
      name,
      rbBlock(() => {
        valuePresent = false;
      }),
    ),
  ): Attribute {
    const type = fetch<ValueType>(this.additionalTypes, name, this.types[name]);

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
  private _delegateHash: Record<string, Attribute>;
  private types: Record<string, ValueType>;
  private values: Record<string, unknown>;
  private additionalTypes: Record<string, ValueType>;
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
    types: Record<string, ValueType>,
    values: Record<string, unknown>,
    additionalTypes: Record<string, ValueType> = {},
    defaultAttributes: Record<string, Attribute> = {},
    delegateHash: Record<string, Attribute> = {},
  ) {
    this.types = types;
    this.values = values;
    this.additionalTypes = additionalTypes;
    this.materialized = false;
    this.defaultAttributes = defaultAttributes;
    this._delegateHash = Object.setPrototypeOf(delegateHash, null) as Record<string, Attribute>;
  }

  isKey(key: string): boolean {
    return hasKey(this._delegateHash, key) || hasKey(this.values, key) || hasKey(this.types, key);
  }

  getAttribute(key: string): Attribute {
    return this._delegateHash[key] ?? this.assignDefaultValue(key);
  }

  set(key: string, value: Attribute): void {
    this._delegateHash[key] = value;
  }

  deepDup(): LazyAttributeHash {
    const copy = this.dup();
    copy._delegateHash = transformValues(this.delegateHash(), (attr) => attr.dup());
    return copy;
  }

  private initializeDup(_: LazyAttributeHash): void {
    this._delegateHash = dup(this.delegateHash());
  }

  eachKey(block?: (key: string) => void): string[] {
    const keys = [
      ...new Set([
        ...hashKeys(this.types),
        ...hashKeys(this.values),
        ...hashKeys(this.delegateHash()),
      ]),
    ];
    return each(keys, block);
  }

  equals(other: unknown): boolean {
    if (other instanceof LazyAttributeHash) {
      return rbEqual(this.materialize(), other.materialize());
    } else {
      return rbEqual(this.materialize(), other);
    }
  }

  marshalDump(): [
    Record<string, ValueType>,
    Record<string, unknown>,
    Record<string, ValueType>,
    Record<string, Attribute>,
    Record<string, Attribute>,
  ] {
    return [
      this.types,
      this.values,
      this.additionalTypes,
      this.defaultAttributes,
      this._delegateHash,
    ];
  }

  static marshalLoad(
    values: [
      Record<string, ValueType>,
      Record<string, unknown>,
      (Record<string, ValueType> | undefined)?,
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
    return this._delegateHash;
  }

  /** @internal */
  delegateHash(): Record<string, Attribute> {
    return this._delegateHash;
  }

  /** @internal */
  assignDefaultValue(name: string): Attribute {
    const type = fetch<ValueType>(this.additionalTypes, name, this.types[name]);
    let valuePresent: boolean = true;
    const value = fetch(
      this.values,
      name,
      rbBlock(() => {
        valuePresent = false;
      }),
    );

    if (valuePresent) {
      const attr = Attribute.fromDatabase(name, value, type);
      this._delegateHash[name] = attr;
      return attr;
    } else if (hasKey(this.types, name)) {
      const attr = this.defaultAttributes[name];
      const built = attr ? attr.dup() : Attribute.uninitialized(name, type);
      this._delegateHash[name] = built;
      return built;
    }
    return Attribute.null(name);
  }

  dup(): LazyAttributeHash {
    return rbObjDup(this);
  }
}

rbDeclareIvar(LazyAttributeHash, "@delegate_hash", "_delegateHash");

registerConstant("ActiveModel::AttributeSet::Builder", Builder);
registerConstant("ActiveModel::LazyAttributeSet", LazyAttributeSet);
registerConstant("ActiveModel::LazyAttributeHash", LazyAttributeHash);
