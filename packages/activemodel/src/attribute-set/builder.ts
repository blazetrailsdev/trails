import { Attribute } from "../attribute.js";
import type { Block, Hash } from "@blazetrails/ruby-compat";
import {
  hashAref,
  hashAset,
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
  readonly defaultAttributes: Record<string, Attribute> | Hash<string, Attribute>;

  constructor(
    types: Record<string, ValueType>,
    defaultAttributes: Record<string, Attribute> | Hash<string, Attribute> = {},
  ) {
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
  private defaultAttributes: Record<string, Attribute> | Hash<string, Attribute>;
  private castedValues: Record<string, unknown>;
  private materialized: boolean;

  constructor(
    values: Record<string, unknown>,
    types: Record<string, ValueType>,
    additionalTypes: Record<string, ValueType>,
    defaultAttributes: Record<string, Attribute> | Hash<string, Attribute>,
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
    const attr = hashAref(this._attributes, name) as Attribute | null;
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
          const type = fetch<ValueType>(
            this.additionalTypes,
            name,
            hashAref(this.types, name) as ValueType,
          );
          return hashAset(this.castedValues, name, type.deserialize(value));
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
    const type = fetch<ValueType>(
      this.additionalTypes,
      name,
      hashAref(this.types, name) as ValueType,
    );

    if (valuePresent) {
      const attr = Attribute.fromDatabase(name, value, type, hashAref(this.castedValues, name));
      hashAset(this._attributes, name, attr);
      return attr;
    } else if (hasKey(this.types, name)) {
      const attr = hashAref(this.defaultAttributes, name) as Attribute | null;
      const built = attr ? attr.dup() : Attribute.uninitialized(name, type);
      hashAset(this._attributes, name, built);
      return built;
    } else {
      return Attribute.null(name);
    }
  }
}

export class LazyAttributeHash {
  declare private _delegateHash: Record<string, Attribute>;
  declare private types: Record<string, ValueType>;
  declare private values: Record<string, unknown>;
  declare private additionalTypes: Record<string, ValueType>;
  declare private defaultAttributes: Record<string, Attribute>;
  declare private materialized: boolean;

  transformValues<T>(fn: (attr: Attribute) => T): Record<string, T> {
    return transformValues(this.materialize(), fn);
  }

  eachValue(fn: (attr: Attribute) => void): void {
    eachValue(this.materialize(), fn);
  }

  fetch(name: string, ...rest: [] | [Attribute | Block<Attribute>]): Attribute {
    return fetch(this.materialize(), name, ...rest);
  }

  except(...names: string[]): Record<string, Attribute> | Hash<string, Attribute> {
    return except(this.materialize(), ...names);
  }

  constructor(
    types: Record<string, ValueType>,
    values: Record<string, unknown>,
    additionalTypes: Record<string, ValueType> = {},
    defaultAttributes: Record<string, Attribute> = {},
    delegateHash: Record<string, Attribute> = {},
  ) {
    this.initialize(types, values, additionalTypes, defaultAttributes, delegateHash);
  }

  isKey(key: string): boolean {
    return hasKey(this._delegateHash, key) || hasKey(this.values, key) || hasKey(this.types, key);
  }

  get(key: string): Attribute | undefined {
    return (hashAref(this.delegateHash(), key) as Attribute | null) ?? this.assignDefaultValue(key);
  }

  set(key: string, value: Attribute): void {
    hashAset(this.delegateHash(), key, value);
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

  /** @missingRailsCall initialize — PERMANENT */
  marshalLoad(values: unknown[]): void {
    this.initialize(...(values as Parameters<LazyAttributeHash["initialize"]>));
  }

  /** @internal */
  protected materialize(): Record<string, Attribute> {
    if (!this.materialized) {
      eachKey(this.values, (key) => this.get(key));
      eachKey(this.types, (key) => this.get(key));
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
  assignDefaultValue(name: string): Attribute | undefined {
    const type = fetch<ValueType>(
      this.additionalTypes,
      name,
      hashAref(this.types, name) as ValueType,
    );
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
      hashAset(this.delegateHash(), name, attr);
      return attr;
    } else if (hasKey(this.types, name)) {
      const attr = hashAref(this.defaultAttributes, name) as Attribute | null;
      const built = attr ? attr.dup() : Attribute.uninitialized(name, type);
      hashAset(this.delegateHash(), name, built);
      return built;
    }
  }

  private initialize(
    types: Record<string, ValueType>,
    values: Record<string, unknown>,
    additionalTypes: Record<string, ValueType> = {},
    defaultAttributes: Record<string, Attribute> = {},
    delegateHash: Record<string, Attribute> = {},
  ): void {
    this.types = types;
    this.values = values;
    this.additionalTypes = additionalTypes;
    this.materialized = false;
    this._delegateHash = delegateHash;
    this.defaultAttributes = defaultAttributes;
  }

  dup(): LazyAttributeHash {
    return rbObjDup(this);
  }
}

rbDeclareIvar(LazyAttributeHash, "@delegate_hash", "_delegateHash");

registerConstant("ActiveModel::AttributeSet::Builder", Builder);
registerConstant("ActiveModel::LazyAttributeSet", LazyAttributeSet);
registerConstant("ActiveModel::LazyAttributeHash", LazyAttributeHash);
