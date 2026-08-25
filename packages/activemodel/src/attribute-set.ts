import { Attribute, Uninitialized } from "./attribute.js";
import { Type } from "./type/value.js";
import { typeRegistry } from "./type/registry.js";

/**
 * Ruby `Hash#transform_values` over the backing attribute map — the call every
 * bulk reader in attribute_set.rb makes (`attributes.transform_values(&:type)`
 * and friends). Not exported: Ruby gets it from Hash, so it is not part of
 * AttributeSet's surface.
 */
function transformValues<T>(
  attributes: Map<string, Attribute>,
  block: (attr: Attribute) => T,
): Map<string, T> {
  const result = new Map<string, T>();
  for (const [name, attr] of attributes) result.set(name, block(attr));
  return result;
}

/**
 * Ruby `Hash#each_key`, which `keys` and `accessed` iterate before `select`.
 * Not exported, for the same reason as {@link transformValues}.
 */
function eachKey(attributes: Map<string, Attribute>): string[] {
  return [...attributes.keys()];
}

/**
 * A set of Attribute instances keyed by name.
 *
 * Mirrors: ActiveModel::AttributeSet
 */
export class AttributeSet {
  protected _attributes: Map<string, Attribute>;

  /**
   * Yield each underlying Attribute value.
   *
   * Mirrors: `delegate :each_value, to: :attributes` — Hash#each_value over the
   * backing attribute map (every entry, initialized or not).
   */
  eachValue(fn: (attr: Attribute) => void): void {
    for (const attr of this.attributes().values()) fn(attr);
  }

  /**
   * Fetch the Attribute stored under `name`. Mirrors Ruby `Hash#fetch`: with a
   * block (function) the block result is the fallback; with a plain default
   * value that value is returned; with neither, an absent key throws KeyError.
   *
   * Mirrors: `delegate :fetch, to: :attributes`.
   */
  fetch<T = Attribute>(name: string, defaultOrBlock?: T | ((name: string) => T)): Attribute | T {
    const attr = this.attributes().get(name);
    if (attr !== undefined) return attr;
    if (typeof defaultOrBlock === "function") return (defaultOrBlock as (name: string) => T)(name);
    if (defaultOrBlock !== undefined) return defaultOrBlock;
    const err = new Error(`key not found: ${JSON.stringify(name)}`);
    err.name = "KeyError";
    throw err;
  }

  /**
   * Return a copy of the backing attribute map with `names` removed.
   *
   * Mirrors: `delegate :except, to: :attributes` — Hash#except.
   */
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

  /** Mirrors: `def [](name)` (attribute_set.rb:16-18). */
  getAttribute(name: string): Attribute {
    return this._attributes.get(name) ?? this.defaultAttribute(name);
  }

  /** Mirrors: `def []=(name, value)` (attribute_set.rb:20-22). */
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

  /**
   * Whether `name` is an initialized key. Alias of {@link isKey}.
   *
   * Mirrors: `alias :include? :key?`.
   */
  isInclude(name: string): boolean {
    return this.isKey(name);
  }

  keys(): string[] {
    return eachKey(this.attributes()).filter((name) => this.getAttribute(name).isInitialized());
  }

  fetchValue(name: string, block?: (name: string) => unknown): unknown {
    // Mirrors ActiveModel::AttributeSet#fetch_value → `self[name].value(&block)`.
    // A known-but-unselected column is stored as an Uninitialized attribute
    // whose `value(&block)` yields the name to the block (letting `[]` raise
    // MissingAttributeError); an unknown name resolves to the Null default,
    // which ignores the block and returns nil.
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
      // An unknown column (e.g. a computed/aliased extra `select`) is not in the
      // schema, so there is no declared cast type. Rails type-casts it with the
      // result set's `column_types` slice; thread that type here when supplied,
      // falling back to the identity `value` type. Mirrors
      // ActiveModel::AttributeSet::Builder#build_from_database casting unknown
      // keys via `types[name]`.
      // `fromDatabase` is typed for the full `Type`, but only `deserialize` is
      // exercised for an unknown column — one localized cast here keeps the
      // public param structural and the call sites cast-free.
      const colType = (type as Type) ?? typeRegistry.lookup("value");
      this._attributes.set(name, Attribute.fromDatabase(name, value, colType));
    }
  }

  writeFromUser(name: string, value: unknown): unknown {
    // Mirrors attribute_set.rb:58 — `raise FrozenError, "can't modify frozen
    // attributes" if frozen?`, ahead of the frozen-Hash raise every other
    // writer gets from `attributes.freeze`.
    if (Object.isFrozen(this)) {
      const err = new Error("can't modify frozen attributes");
      err.name = "FrozenError";
      throw err;
    }
    // Rails one-liner (attribute_set.rb:58-61):
    //   @attributes[name] = self[name].with_value_from_user(value)
    // An absent name resolves to the `Null` default attribute, whose
    // `withValueFromUser` raises MissingAttributeError. With the schema cache
    // always warm at construction (RFC 0031), every real column — selected or
    // not — is already in the set, so map-absence now reliably means "unknown
    // column" and the Null fallthrough raises exactly like Rails.
    this._attributes.set(name, this.getAttribute(name).withValueFromUser(value));
    return value;
  }

  writeCastValue(name: string, value: unknown): void {
    this.assertNotFrozen();
    this._attributes.set(name, this.getAttribute(name).withCastValue(value));
  }

  /** Mirrors: attribute_set.rb:72-74. */
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

  /**
   * Mirrors: `attributes.reverse_merge!(target_attributes.attributes) && self`
   * (attribute_set.rb:100-102) — Hash#reverse_merge! copies references and
   * clones nothing.
   */
  reverseMergeBang(target: AttributeSet): this {
    this.assertNotFrozen();
    for (const [name, attr] of target.attributes()) {
      if (!this._attributes.has(name)) {
        this._attributes.set(name, attr);
      }
    }
    return this;
  }

  /**
   * The backing attribute map.
   *
   * Mirrors: `protected attr_reader :attributes` — the seam LazyAttributeSet
   * overrides to materialize its lazy values before any bulk read.
   */
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

  /**
   * Mirrors: `def freeze; attributes.freeze; super; end` (attribute_set.rb:67-70).
   * `Object.freeze(this)` is the `super` half, and is what `Object.isFrozen`
   * (Ruby's `frozen?`) reads back; a JS `Map` ignores `Object.freeze`, so the
   * frozen-Hash half is enforced by {@link assertNotFrozen} in every writer.
   */
  freeze(): this {
    Object.freeze(this);
    return this;
  }

  /** Mirrors: attribute_set.rb:82-85 — `@attributes = @attributes.clone`. */
  initializeClone(_other: AttributeSet): void {
    this._attributes = new Map(this._attributes);
  }

  /**
   * The JS spelling of `attributes.freeze`: a `Map` is unaffected by
   * `Object.freeze`, so each writer checks the frozen set explicitly and raises
   * what Ruby's frozen Hash raises.
   */
  private assertNotFrozen(): void {
    if (Object.isFrozen(this)) {
      const err = new Error("can't modify frozen AttributeSet");
      err.name = "FrozenError";
      throw err;
    }
  }

  /**
   * Make AttributeSet iterable — yields [name, value] pairs for compatibility
   * with code that iterates `for (const [k, v] of _attributes)`.
   *
   * @noRailsEquivalent PERMANENT (`vendor/rails/activemodel/lib/active_model/attribute_set.rb:10` —
   *   `delegate :each_value, to: :attributes`).
   * JS iteration protocol — Ruby reaches iteration through Enumerable#each
   */
  *[Symbol.iterator](): IterableIterator<[string, unknown]> {
    for (const name of this.keys()) {
      yield [name, this.fetchValue(name)];
    }
  }
}
