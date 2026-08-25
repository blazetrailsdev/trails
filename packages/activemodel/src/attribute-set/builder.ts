import { Attribute, Uninitialized } from "../attribute.js";
import { Type } from "../type/value.js";
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

/** Mirrors: ActiveModel::LazyAttributeSet */
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
      // builder.rb:43 `attr.value(&block)`. trails' `Attribute#value` is a getter,
      // so `Uninitialized#value`'s yield-the-name arm lives at the call site.
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
      const type = this.additionalTypes.get(name) ?? this.types.get(name)!;
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

  /**
   * Mirrors `LazyAttributeSet#default_attribute` (builder.rb:69-88). Ruby
   * defaults `value` to `values.fetch(name) { value_present = false }`,
   * evaluated only when the caller omits it, and `Attribute#initialize` keeps
   * its computed-value slot empty when the 4th argument is nil
   * (attribute.rb:37) — hence the two guards below.
   */
  protected override defaultAttribute(
    name: string,
    valuePresent?: boolean,
    value?: unknown,
  ): Attribute {
    if (valuePresent === undefined) {
      valuePresent = Object.hasOwn(this.values, name);
      value = valuePresent ? this.values[name] : undefined;
    }

    const type = this.additionalTypes.get(name) ?? this.types.get(name);

    if (valuePresent) {
      const castedValue = this.castedValues.get(name);
      const attr =
        castedValue === undefined
          ? Attribute.fromDatabase(name, value, type!)
          : Attribute.fromDatabase(name, value, type!, castedValue);
      this._attributes.set(name, attr);
      return attr;
    } else if (this.types.has(name)) {
      const attr = this.defaultAttributes.get(name);
      const built = attr ? attr.dup() : Attribute.uninitialized(name, type!);
      this._attributes.set(name, built);
      return built;
    } else {
      return Attribute.null(name);
    }
  }
}

/**
 * Lazy hash of attribute objects, materializes on demand.
 *
 * Mirrors: ActiveModel::LazyAttributeHash
 */
export class LazyAttributeHash {
  private delegate: Map<string, Attribute>;
  private types: Map<string, Type>;
  private values: Record<string, unknown>;
  private additionalTypes: Map<string, Type>;
  private defaultAttributes: Map<string, Attribute>;
  private materialized: boolean;

  /**
   * Return a new map applying `fn` to each materialized Attribute.
   *
   * Mirrors: `delegate :transform_values, to: :materialize` — Hash#transform_values
   * (generic over the block result, e.g. `attributes.transform_values(&:type)`).
   */
  transformValues<T>(fn: (attr: Attribute) => T): Map<string, T> {
    const result = new Map<string, T>();
    for (const [name, attr] of this.materialize()) result.set(name, fn(attr));
    return result;
  }

  /**
   * Yield each materialized Attribute value.
   *
   * Mirrors: `delegate :each_value, to: :materialize` — Hash#each_value.
   */
  eachValue(fn: (attr: Attribute) => void): void {
    for (const attr of this.materialize().values()) fn(attr);
  }

  /**
   * Fetch the materialized Attribute under `name`. Mirrors Ruby `Hash#fetch`:
   * with a block (function) the block result is the fallback; with a plain
   * default value that value is returned; with neither, an absent key throws
   * KeyError.
   *
   * Mirrors: `delegate :fetch, to: :materialize`.
   */
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

  /**
   * Return a copy of the materialized hash with `names` removed.
   *
   * Mirrors: `delegate :except, to: :materialize` — Hash#except.
   */
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

  /** Mirrors: `def key?(key)` (builder.rb:106-108). */
  isKey(key: string): boolean {
    return this.delegate.has(key) || Object.hasOwn(this.values, key) || this.types.has(key);
  }

  /** Mirrors: `def [](key)` (builder.rb:110-112). */
  getAttribute(key: string): Attribute {
    return this.delegate.get(key) ?? this.assignDefaultValue(key);
  }

  /** Mirrors: `def []=(key, value)` (builder.rb:114-116). */
  set(key: string, value: Attribute): void {
    this.delegate.set(key, value);
  }

  /**
   * Mirrors: `def deep_dup` (builder.rb:118-122) — `dup` (which copies the
   * delegate hash, builder.rb:124-127) with every entry replaced by its own
   * `Attribute#dup`. `types`/`values` stay shared, as Ruby's shallow `dup` does.
   */
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

  /**
   * Mirrors: LazyAttributeHash#each_key (builder.rb:129-132) — unions
   * `types | values | delegate_hash` and yields every key. Unlike `keys`, it
   * does not drop uninitialized attributes.
   */
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
    data: [
      Map<string, Type>,
      Record<string, unknown>,
      (Map<string, Type> | undefined)?,
      (Map<string, Attribute> | undefined)?,
      (Map<string, Attribute> | undefined)?,
    ],
  ): LazyAttributeHash {
    return new LazyAttributeHash(data[0], data[1], data[2], data[3], data[4]);
  }

  /**
   * Force every value/type key into the delegate hash and return it.
   *
   * Mirrors: LazyAttributeHash#materialize (protected) — `values.each_key`
   * and `types.each_key` resolve through `self[key]`, then `delegate_hash`
   * is returned.
   *
   * @internal Rails-private helper.
   */
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

  /** @internal Rails-private helper. Mirrors: LazyAttributeHash#delegate_hash (attr_reader) */
  delegateHash(): Map<string, Attribute> {
    return this.delegate;
  }

  /**
   * @internal Rails-private helper. Mirrors: `def assign_default_value(name)`
   * (builder.rb:165-180). Ruby's implicit `nil` when `name` is in neither table
   * is `Attribute.null(name)` here, the null object `AttributeSet#default_attribute`
   * (attribute_set.rb:114-116) returns for the same case — `[]` is typed to an
   * Attribute, and TS has no nil that answers `value`.
   */
  assignDefaultValue(name: string): Attribute {
    const type = this.additionalTypes.get(name) ?? this.types.get(name);
    let valuePresent = true;
    let value: unknown;
    if (Object.hasOwn(this.values, name)) {
      value = this.values[name];
    } else {
      valuePresent = false;
    }

    if (valuePresent) {
      const attr = Attribute.fromDatabase(name, value, type!);
      this.delegate.set(name, attr);
      return attr;
    } else if (this.types.has(name)) {
      const attr = this.defaultAttributes.get(name);
      const built = attr ? attr.dup() : Attribute.uninitialized(name, type!);
      this.delegate.set(name, built);
      return built;
    }
    return Attribute.null(name);
  }
}
