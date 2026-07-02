import type { Base } from "./base.js";
import { camelize, isBlank, pluralize } from "@blazetrails/activesupport";
import { ArgumentError, ValueType, IntegerType, typeRegistry } from "@blazetrails/activemodel";

/** Value a label can map to — matches Rails' hash-value support for enums. */
type EnumValue = number | string | boolean | null;

/**
 * Infer the storage subtype from the mapping values (nulls ignored): uniform
 * numbers mean an integer-backed column, uniform booleans a boolean-backed one,
 * anything else a string-backed one. Mirrors Rails resolving the subtype from
 * the underlying attribute type — trails falls back to the mapping shape when
 * the schema-derived attribute definition isn't available yet.
 */
function inferSubtype(values: Iterable<EnumValue>): string {
  let sawValue = false;
  let allNumbers = true;
  let allBooleans = true;
  for (const v of values) {
    if (v === null || v === undefined) continue;
    sawValue = true;
    if (typeof v !== "number") allNumbers = false;
    if (typeof v !== "boolean") allBooleans = false;
  }
  if (!sawValue) return "integer";
  if (allNumbers) return "integer";
  if (allBooleans) return "boolean";
  return "string";
}

/**
 * Build the ValueType instance backing an enum subtype's cast/serialize.
 * Mirrors Rails passing the column's real `Type::Value` into `EnumType.new`:
 * resolve the declared subtype name through the shared type registry so
 * float/decimal/datetime/etc. columns delegate to their actual type. Falls
 * back to IntegerType only for names the registry doesn't know.
 */
function subtypeInstance(subtype: string): ValueType<unknown> {
  try {
    return typeRegistry.lookup(subtype) as ValueType<unknown>;
  } catch {
    return new IntegerType();
  }
}

/**
 * Enum definition — maps symbolic names to integer values.
 *
 * Mirrors: ActiveRecord::Enum
 */

/**
 * EnumType cache keyed on the `_enums` mapping object. Each enum stores one
 * stable mapping Record in `_enums`, so keying on its identity lets the
 * read/serialize helpers reuse a single EnumType instead of reallocating one
 * per call.
 */
const enumTypeCache = new WeakMap<object, EnumType>();

/**
 * Build (and cache) an EnumType for the deserialize/serialize helpers below
 * from the canonical `_enums` mapping. The subtype only governs the
 * integer/string coercion fallback, so infer it from the mapping's value
 * types — uniform numbers mean an integer-backed column, anything else a
 * string-backed one.
 */
export function enumTypeFor(name: string, mapping: Record<string, EnumValue>): EnumType {
  const cached = enumTypeCache.get(mapping);
  if (cached) return cached;
  const entries = Object.entries(mapping);
  const subtype = inferSubtype(entries.map(([, v]) => v));
  const enumType = new EnumType(name, new Map(entries), subtype);
  enumTypeCache.set(mapping, enumType);
  return enumType;
}

/**
 * Register an EnumType in the attribute set and install the label-returning
 * accessor, the single Rails-faithful storage model used by the `Base.enum`
 * macro (`_enum`). After this, the attribute
 * stores the label string (via EnumType.cast on write), the getter returns it,
 * and assignment runs `assertValidValue`.
 *
 * Mirrors: ActiveRecord::Enum#_enum calling `klass.attribute(name, enum_type)`.
 *
 * @internal
 */
export function installEnumAttribute(
  klass: typeof Base,
  attribute: string,
  enumType: EnumType,
): void {
  // Rails' _enum uses `attribute(name)` (bare) + `decorate_attributes` so the
  // EnumType is layered on top of the column-seeded FromDatabase attribute,
  // leaving the default on the deserialize path for free (enum.rb:238-247). That
  // relies on `_default_attributes` re-seeding from `columns_hash` on every
  // rebuild; trails instead seeds from the cached `_attributeDefinitions` map and
  // `decorateAttributes` no-ops on a not-yet-reflected column (the def doesn't
  // exist until schema loads), so a bare-attribute + decorate port drops the
  // EnumType entirely for models whose enum is declared before first query.
  // (Empirically regresses type.serialize / find-via-where.) Converging trails'
  // `_defaultAttributes` onto Rails' column-seed-then-replay is tracked as a
  // follow-up story. Here we register the type directly — which also matches
  // Rails' lower-level `attribute(name, type)` form — so it lands in
  // `_attributeDefinitions` and survives schema reflection / resetColumnInformation
  // (schema-sourced defs get scrubbed and re-reflected as the plain column type).
  klass.attribute(attribute, enumType);

  // Mark the enum column's default as schema-sourced so it seeds via
  // from_database (deserialize) rather than as a user default (cast): cast(0) on
  // an EnumType yields null, deserialize(0) yields the "default" label. This
  // recovers what Rails' build_from_user / decorate_attributes gives for free.
  // The flag is honored on both declaration orderings: when the schema is
  // already loaded, `attribute()` above merged the column default (0) onto the
  // def, so `_defaultAttributes` seeds fromDatabase(0) directly (attributes.ts);
  // when the enum is declared first, schema reflection later re-injects the
  // column default onto this user-declared def (model-schema.ts). `attribute()`
  // already invalidated the default-attributes cache, so no extra reset is
  // needed — the mutation is visible before the next `_defaultAttributes()`.
  const def = klass._attributeDefinitions?.get(attribute) as
    | { defaultFromSchema?: boolean }
    | undefined;
  if (def != null) {
    def.defaultFromSchema = true;
  }
  // Define the getter after attribute() so the EnumType is already in
  // _attributeDefinitions / the pending-type queue when we overwrite whatever
  // accessor attribute() installed.
  Object.defineProperty(klass.prototype, attribute, {
    get(this: Base) {
      return (this as unknown as { _attributes: Map<string, unknown> })._attributes.get(attribute);
    },
    set(this: Base, value: unknown) {
      // Custom setter only because the paired custom getter would otherwise make
      // the property read-only. Validation is NOT done here: Rails' enum has no
      // custom writer — `EnumType#assert_valid_value` is invoked by the attribute
      // write pipeline (ActiveModel::Attribute#with_value_from_user), which our
      // writeAttribute → withValueFromUser mirrors. So `record.status = "angry"`
      // still raises ArgumentError, via the type, on every write path.
      (this as unknown as EnumInstanceHost).writeAttribute(attribute, value);
    },
    configurable: true,
  });
}

/** Minimal instance-side surface for enum-generated prototype callbacks. */
interface EnumInstanceHost {
  updateBang(attrs: Record<string, unknown>): Promise<true | undefined>;
  readAttributeForDatabase(name: string): unknown;
  writeAttribute(name: string, value: unknown): void;
}

/**
 * Standalone `defineEnum(modelClass, …)` — retained as a thin re-export alias
 * of the `Base.enum` / `_enum` macro so the historical call sites and the
 * `declare` synthesize emitter keep one import. All enum surface generation,
 * the EnumType registration, and the `_enums` registry now live in `_enum`;
 * this just forwards with the class as the receiver.
 */
export function defineEnum(
  modelClass: typeof Base,
  attribute: string,
  valuesInput: string[] | Record<string, string | number | boolean | null>,
  options?: { prefix?: boolean | string; suffix?: boolean | string },
): void {
  _enum.call(modelClass, attribute, valuesInput, options);
}

/**
 * EnumType — wraps an underlying type to handle enum cast/serialize/deserialize.
 *
 * Mirrors: ActiveRecord::Enum::EnumType
 */
export class EnumType extends ValueType<string> {
  /** @internal */
  override readonly name: string;
  private _mapping: ReadonlyMap<string, EnumValue>;
  private _reverseMapping: ReadonlyMap<EnumValue, string>;
  private _raiseOnInvalidValues: boolean;
  private _subtypeType: ValueType<unknown>;
  readonly subtype: string;

  constructor(
    name: string,
    mapping: ReadonlyMap<string, EnumValue>,
    subtype: string,
    raiseOnInvalidValues = true,
  ) {
    super();
    this.name = name;
    this._mapping = mapping;
    const reverse = new Map<EnumValue, string>();
    for (const [k, v] of mapping) {
      // Keep the first label for a given value — mirrors Ruby Hash#key, so an
      // aliased value (e.g. aliased_field: "happy") deserializes to the
      // canonical label ("happy"), not the alias.
      if (!reverse.has(v)) reverse.set(v, k);
    }
    this._reverseMapping = reverse;
    this._raiseOnInvalidValues = raiseOnInvalidValues;
    this.subtype = subtype;
    this._subtypeType = subtypeInstance(subtype);
  }

  // Rails' EnumType does `delegate :type, to: :subtype` — callers that
  // ask what an enum column's storage type is want the underlying
  // column type (e.g. "integer"), not the enum's attribute name. Our
  // subtype is already the type string, so return it directly.
  override type(): string {
    return this.subtype;
  }

  /**
   * The underlying value type this enum wraps (Rails' `subtype` Type object).
   * Calculations unwrap the EnumType to its subtype before casting an aggregate
   * value (`type = type.subtype if Enum::EnumType === type`), so min/max/sum
   * return the raw integer (0), not the enum label ("easy").
   */
  subtypeType(): ValueType<unknown> {
    return this._subtypeType;
  }

  // Mirrors Rails EnumType#cast:
  //   if mapping.has_key?(value)   -> value.to_s   (value is a label)
  //   elsif mapping.has_value?(value) -> mapping.key(value)  (return the label)
  //   else value.presence
  cast(value: unknown): string | null {
    if (typeof value === "string" && this._mapping.has(value)) {
      return value;
    }
    if (this._reverseMapping.has(value as EnumValue)) {
      return this._reverseMapping.get(value as EnumValue)!;
    }
    // Rails `value.presence` — blank values (nil, false, blank strings) become
    // nil; anything else passes through unchanged (e.g. the string "true" so a
    // later `serialize` can type-cast it against the boolean subtype).
    return isBlank(value) ? null : (value as string);
  }

  // Mirrors Rails: `mapping.key(subtype.deserialize(value))` — coerce the raw
  // database value through the storage subtype, then reverse-map to the label.
  deserialize(value: unknown): string | null {
    const sub = this._subtypeType.deserialize(value) as EnumValue;
    return this._reverseMapping.get(sub) ?? null;
  }

  // Mirrors Rails: `subtype.serialize(mapping.fetch(value, value))` — a label
  // maps to its stored value, anything else passes through the subtype's cast
  // (so e.g. the string "true" type-casts to boolean `true` for a query).
  serialize(value: unknown): number | string | boolean | null {
    const mapped =
      typeof value === "string" && this._mapping.has(value) ? this._mapping.get(value)! : value;
    return this._subtypeType.serialize(mapped) as number | string | boolean | null;
  }

  // The in-memory value is the label string; the database value is the mapped
  // integer/string/boolean. Callers that prefer serializeCastValue (e.g.
  // insertAll/upsertAll bulk paths) must still get the mapping value, not the
  // identity label — so delegate to serialize rather than inheriting the
  // identity default from ValueType.
  serializeCastValue(value: unknown): number | string | boolean | null {
    return this.serialize(value);
  }

  // Mirrors Rails: `subtype.serializable?(mapping.fetch(value, value))`.
  isSerializable(value: unknown): boolean {
    const mapped =
      typeof value === "string" && this._mapping.has(value) ? this._mapping.get(value)! : value;
    return this._subtypeType.isSerializable(mapped);
  }

  assertValidValue(value: unknown): void {
    if (!this._raiseOnInvalidValues) return;
    // Rails: `unless value.blank? || mapping.has_key?(value) || mapping.has_value?(value)`
    // — a blank value (nil, false, or a whitespace-only string) is always
    // allowed and casts to nil.
    if (isBlank(value)) return;
    if (typeof value === "string" && this._mapping.has(value)) return;
    if (this._reverseMapping.has(value as EnumValue)) return;
    throw new ArgumentError(`'${value}' is not a valid ${this.name}`);
  }

  /** @internal */
  get mapping(): ReadonlyMap<string, EnumValue> {
    return this._mapping;
  }
}

/**
 * Module that holds enum instance/scope methods generated by `_enum`.
 * Rails defines this as a private inner class and mixes it into the model.
 *
 * Mirrors: ActiveRecord::Enum::EnumMethods
 */
export class EnumMethods {
  private _klass: typeof import("./base.js").Base;

  constructor(klass: typeof import("./base.js").Base) {
    this._klass = klass;
  }

  /** @internal */
  get klass(): typeof import("./base.js").Base {
    return this._klass;
  }

  /**
   * @internal
   * Define predicate, bang, and scope methods for a single enum value.
   */
  defineEnumMethods(
    name: string,
    valueMethodName: string,
    value: string | number,
    scopes: boolean,
    instanceMethods: boolean,
  ): void {
    const klass = this.klass;
    if (instanceMethods) {
      detectEnumConflictBang.call(klass, name, `${valueMethodName}?`);
      Object.defineProperty(klass.prototype, `${valueMethodName}?`, {
        value: function (this: EnumInstanceHost) {
          return this.readAttributeForDatabase(name) === value;
        },
        writable: true,
        configurable: true,
      });
      detectEnumConflictBang.call(klass, name, `${valueMethodName}!`);
      Object.defineProperty(klass.prototype, `${valueMethodName}!`, {
        value: function (this: EnumInstanceHost) {
          // Returns update!'s result (true), mirroring Rails' bang setter.
          return this.updateBang({ [name]: value });
        },
        writable: true,
        configurable: true,
      });
    }
    if (scopes) {
      const notName = `not${valueMethodName.charAt(0).toUpperCase()}${valueMethodName.slice(1)}`;
      detectEnumConflictBang.call(klass, name, valueMethodName, true);
      klass.scope(valueMethodName, (rel: any) => rel.where({ [name]: value }));
      detectEnumConflictBang.call(klass, name, notName, true);
      klass.scope(notName, (rel: any) => rel.whereNot({ [name]: value }));
    }
  }
}

/**
 * Public `enum` macro. Validates then delegates to the private `_enum` impl.
 *
 * `_enum` is the single enum entry point: it defines `is{Name}()` predicates,
 * persisting `{name}Bang()` setters, per-value scopes plus auto `not*` scopes,
 * friendly-name/original-form variants for special-char labels, and a static
 * `pluralize(attribute)` mapping accessor (e.g. `status` → `statuses`). The
 * standalone `defineEnum(klass, …)` is a thin re-export alias of this.
 *
 * Mirrors: ActiveRecord::Enum.enum (the ClassMethods macro).
 */
export function enumMethod(
  this: typeof Base,
  attribute: string,
  mapping: Record<string, EnumValue>,
  options?: {
    prefix?: boolean | string;
    suffix?: boolean | string;
    scopes?: boolean;
    instanceMethods?: boolean;
    validate?: boolean | Record<string, unknown>;
  },
): void {
  _enum.call(this, attribute, mapping, options);
}

// Alias the Base.enum implementation under the Rails-idiomatic name so
// api:compare can match `ActiveRecord::Enum#enum` to this file. The runtime
// binding wired onto Base uses the real (un-reserved-word) internal name.
export { enumMethod as enum };

/**
 * Private implementation backing the `enum` macro.
 * Validates values/options, registers the type, and defines all enum methods.
 *
 * Mirrors: ActiveRecord::Enum#_enum (private)
 *
 * @internal
 */
export function _enum(
  this: typeof import("./base.js").Base,
  name: string,
  values: string[] | Record<string, string | number | boolean | null>,
  options?: {
    prefix?: boolean | string;
    suffix?: boolean | string;
    scopes?: boolean;
    instanceMethods?: boolean;
    validate?: boolean | Record<string, unknown>;
  },
): void {
  if (values == null) throw new ArgumentError(`${String(name)} enum values must not be nil`);
  assertValidEnumDefinitionValues(values);
  assertValidEnumOptions(options ?? {});

  const attribute = name;
  const mapping = Array.isArray(values)
    ? Object.fromEntries(values.map((v, i) => [v, i]))
    : (values as Record<string, EnumValue>);

  if (!Object.prototype.hasOwnProperty.call(this, "_enums")) {
    this._enums = new Map(this._enums);
  }
  this._enums.set(attribute, mapping);

  const prefixStr =
    options?.prefix === true
      ? attribute
      : typeof options?.prefix === "string"
        ? options.prefix
        : "";
  const suffixStr =
    options?.suffix === true
      ? attribute
      : typeof options?.suffix === "string"
        ? options.suffix
        : "";

  const methodName = (n: string) => {
    if (prefixStr && suffixStr) return `${prefixStr}_${n}_${suffixStr}`;
    if (prefixStr) return `${prefixStr}_${n}`;
    if (suffixStr) return `${n}_${suffixStr}`;
    return n;
  };
  const toCamel = (s: string) => camelize(s, false);

  const attrName = attribute;

  // Read subtype from _attributeDefinitions directly — never call typeForAttribute()
  // here, because typeForAttribute() triggers loadSchema(), which sets _schemaLoaded
  // prematurely and blocks the real DB schema reflection from running later.
  // Mirrors Rails' decorate_attributes block receiving the subtype lazily; we
  // resolve it now from user-declared defs (e.g. `attribute("status", "string")`)
  // and fall back to "integer" otherwise.
  let subtype: string;
  try {
    const existingDef = (this as any)._attributeDefinitions?.get(name);
    const t: string = existingDef?.type?.type?.() ?? "value";
    // No user-declared attribute type yet (schema not reflected): infer the
    // storage subtype from the mapping's value shapes (booleans → boolean,
    // strings → string, numbers → integer).
    subtype =
      t === "value"
        ? inferSubtype(Object.values(mapping))
        : /integer/i.test(t) || t === "smallint"
          ? "integer"
          : t;
  } catch {
    subtype = "integer";
  }

  // Register EnumType so typeForAttribute() returns it for predicate-builder
  // serialization — e.g. where({status: "draft"}) serializes "draft" → 0 — and
  // install the label-returning accessor via the shared installEnumAttribute.
  // Mirrors Rails `EnumType.new(..., raise_on_invalid_values: !validate)`: with
  // `validate:` set, an invalid assignment is caught by the inclusion validator
  // rather than raising on write, so the type must not raise.
  const validate = options?.validate ?? false;
  const enumType = new EnumType(name, new Map(Object.entries(mapping)), subtype, !validate);
  installEnumAttribute(this, attrName, enumType);

  // Conflict-detection pass, then the generation pass — both ported from the
  // former standalone `defineEnum`, now folded in so `_enum` is the single enum
  // entry point. Generates camelCase predicate (`isDraft`), bang setter
  // (`draftBang`), per-value scope + auto `not*` scope, plus friendly-name and
  // original-form variants for labels containing special characters. Rails has
  // no plain in-memory setter, so none is generated.
  //
  // `definedNames` tracks positive method names only (predicate / bang / scope).
  // The auto-generated `not*` scope names are deliberately excluded: a value
  // literally named like `notActive` colliding with the `not*` scope of `active`
  // is NOT a hard conflict \u2014 Rails only *warns* about it (via
  // detectNegativeEnumConditionsBang below). Folding negative-scope names back
  // into this set would resurrect the pre-empting ArgumentError.
  const definedNames = new Set<string>();
  const valueMethodNames: string[] = [];
  for (const [n] of Object.entries(mapping)) {
    const fullName = toCamel(methodName(n));
    const capitalizedFullName = camelize(methodName(n));
    const predicateName = `is${capitalizedFullName}`;
    const bangName = `${fullName}Bang`;
    const notScopeName = `not${capitalizedFullName}`;
    const friendlyName = toCamel(methodName(n).replace(/[^\w\x80-\uffff]+/g, "_"));

    // Rails feeds both the value method name and its special-char-stripped
    // friendly alias into detect_negative_enum_conditions! (enum.rb:266-279),
    // pushing the alias only when it differs and isn't already present.
    valueMethodNames.push(fullName);
    if (friendlyName !== fullName && !valueMethodNames.includes(friendlyName)) {
      valueMethodNames.push(friendlyName);
    }

    if (definedNames.has(predicateName)) raiseConflictError.call(this, attribute, predicateName);
    if (definedNames.has(bangName)) raiseConflictError.call(this, attribute, bangName);
    if (definedNames.has(fullName))
      raiseConflictError.call(this, attribute, fullName, { type: "class" });
    definedNames.add(predicateName);
    definedNames.add(bangName);
    definedNames.add(fullName);

    if (predicateName in (this.prototype as object))
      raiseConflictError.call(this, attribute, predicateName);
    if (bangName in (this.prototype as object)) raiseConflictError.call(this, attribute, bangName);
    if (fullName in (this as object))
      raiseConflictError.call(this, attribute, fullName, { type: "class" });
    if (notScopeName in (this as object))
      raiseConflictError.call(this, attribute, notScopeName, { type: "class" });
    if (friendlyName !== fullName) {
      const fp = `is${friendlyName.charAt(0).toUpperCase()}${friendlyName.slice(1)}`;
      if (fp in (this.prototype as object)) raiseConflictError.call(this, attribute, fp);
      if (`${friendlyName}Bang` in (this.prototype as object))
        raiseConflictError.call(this, attribute, `${friendlyName}Bang`);
      if (friendlyName in (this as object))
        raiseConflictError.call(this, attribute, friendlyName, { type: "class" });
      const notFriendlyName = `not${friendlyName.charAt(0).toUpperCase()}${friendlyName.slice(1)}`;
      if (notFriendlyName in (this as object))
        raiseConflictError.call(this, attribute, notFriendlyName, { type: "class" });
    }
  }

  // Rails only warns (never raises) when an enum element's auto-generated
  // negative scope (`not*`) would clash with a positively-named element, and
  // skips the check entirely when scopes are disabled.
  // Mirrors: `detect_negative_enum_conditions!(value_method_names) if scopes`.
  if (options?.scopes !== false) {
    detectNegativeEnumConditionsBang(valueMethodNames);
  }

  for (const [n, value] of Object.entries(mapping)) {
    const fullName = toCamel(methodName(n));
    const capitalizedFullName = camelize(methodName(n));
    const predicateName = `is${capitalizedFullName}`;
    const bangName = `${fullName}Bang`;
    const notScopeName = `not${capitalizedFullName}`;
    const friendlyName = toCamel(methodName(n).replace(/[^\w\x80-\uffff]+/g, "_"));

    this.scope(fullName, (rel: any) => rel.where({ [attribute]: value }));

    if (friendlyName !== fullName) {
      this.scope(friendlyName, (rel: any) => rel.where({ [attribute]: value }));
      const notFriendlyName = `not${friendlyName.charAt(0).toUpperCase()}${friendlyName.slice(1)}`;
      this.scope(notFriendlyName, (rel: any) => rel.whereNot({ [attribute]: value }));
      const fp = `is${friendlyName.charAt(0).toUpperCase()}${friendlyName.slice(1)}`;
      Object.defineProperty(this.prototype, fp, {
        value: function (this: Base) {
          return this.readAttribute(attribute) === n;
        },
        writable: true,
        configurable: true,
      });
      Object.defineProperty(this.prototype, `${friendlyName}Bang`, {
        value: function (this: EnumInstanceHost) {
          return this.updateBang({ [attribute]: value });
        },
        writable: true,
        configurable: true,
      });
    }

    // Predicate: user.active? → user.isActive()
    Object.defineProperty(this.prototype, predicateName, {
      value: function (this: Base) {
        return this.readAttribute(attribute) === n;
      },
      writable: true,
      configurable: true,
    });

    // Bang setter: user.active! → user.activeBang() persists via update!.
    // Mirrors Rails: klass.define_method("#{value_method_name}!") { update!(name => value) }
    Object.defineProperty(this.prototype, bangName, {
      value: function (this: EnumInstanceHost) {
        return this.updateBang({ [attribute]: value });
      },
      writable: true,
      configurable: true,
    });

    // whereNot scope: Model.notDraft()
    this.scope(notScopeName, (rel: any) => rel.whereNot({ [attribute]: value }));

    // Original-form predicate/bang for labels with special chars (spaces,
    // hyphens). Rails: define_method("American Bobtail?"), reachable via
    // bracket notation only.
    const originalName = methodName(n);
    if (/[^\w\x80-\uffff]/.test(originalName)) {
      Object.defineProperty(this.prototype, `is${originalName}`, {
        value: function (this: Base) {
          return this.readAttribute(attribute) === n;
        },
        writable: true,
        configurable: true,
      });
      Object.defineProperty(this.prototype, `${originalName}Bang`, {
        value: function (this: EnumInstanceHost) {
          return this.updateBang({ [attribute]: value });
        },
        writable: true,
        configurable: true,
      });
    }
  }

  // Mirrors Rails:
  //   if validate
  //     validate = {} unless Hash === validate
  //     validates_inclusion_of name, in: enum_values.keys, **validate
  //   end
  // A truthy `validate` adds an inclusion validation over the enum labels; a
  // hash form forwards its options (e.g. `{ allowNil: true }`) to the validator.
  if (validate) {
    const validateOptions = typeof validate === "object" ? validate : {};
    (this as unknown as { validatesInclusionOf: (...a: unknown[]) => void }).validatesInclusionOf(
      attribute,
      { in: Object.keys(mapping), ...validateOptions },
    );
  }

  // Mapping accessor under the pluralized attribute name (e.g. User.statuses
  // for `status`). Rails: `singleton_class.define_method(name.to_s.pluralize)`.
  Object.defineProperty(this, pluralize(attribute), {
    get() {
      return { ...mapping };
    },
    configurable: true,
  });
}

/** Cache of per-class EnumMethods modules.
 * @internal */
// JS-idiomatic equivalent of Rails' per-class `@_enum_methods_module` ivar.
const _enumMethodsModuleRegistry = new WeakMap<typeof import("./base.js").Base, EnumMethods>();

/**
 * Lazily create and cache the EnumMethods module for this class.
 *
 * Mirrors: ActiveRecord::Enum#_enum_methods_module (private)
 *
 * @internal
 */
export function _enumMethodsModule(this: typeof import("./base.js").Base): EnumMethods {
  let mod = _enumMethodsModuleRegistry.get(this);
  if (!mod) {
    mod = new EnumMethods(this);
    _enumMethodsModuleRegistry.set(this, mod);
  }
  return mod;
}

/**
 * Raise if the proposed enum method name would conflict with an existing method.
 *
 * Mirrors: ActiveRecord::Enum#detect_enum_conflict! (private)
 *
 * @internal
 */
export function detectEnumConflictBang(
  this: typeof import("./base.js").Base,
  enumName: string,
  methodName: string,
  _klassMethod = false,
): void {
  // Walk the prototype chain (mirrors Rails method_defined? semantics).
  const target = _klassMethod ? this : this.prototype;
  if (methodName in (target as object)) {
    raiseConflictError.call(this, enumName, methodName);
  }
}

/**
 * Raise an ArgumentError describing the method conflict.
 *
 * Mirrors: ActiveRecord::Enum#raise_conflict_error (private)
 *
 * @internal
 */
export function raiseConflictError(
  this: typeof import("./base.js").Base,
  enumName: string,
  methodName: string,
  options: { type?: string; source?: string } = {},
): never {
  const type = options.type ?? "instance";
  const source = options.source ?? "Active Record";
  throw new ArgumentError(
    `You tried to define an enum named "${enumName}" on the model "${this.name}", but ` +
      `this will generate a ${type} method "${methodName}", which is already defined by ${source}.`,
  );
}

/**
 * Get the human-readable enum value for an attribute.
 * Delegates to EnumType.deserialize for the mapping lookup.
 */
export function readEnumValue(record: Base, attribute: string): string | null {
  const ctor = record.constructor as typeof Base;
  const mapping = ctor._enums?.get(attribute);
  if (!mapping) return null;

  // Storage is now label-based (EnumType cast runs on write), so the stored
  // value is usually the label string itself. Fall back to deserialize for any
  // raw storage value (e.g. an integer read straight off the database row).
  const stored = record.readAttribute(attribute);
  if (typeof stored === "string" && Object.prototype.hasOwnProperty.call(mapping, stored))
    return stored;
  return enumTypeFor(attribute, mapping).deserialize(stored);
}

/**
 * Cast an enum value (string name or number) to its storage value (integer or string,
 * depending on the attribute subtype). Delegates to EnumType.serialize for the mapping lookup.
 */
export function castEnumValue(
  modelClass: typeof Base,
  attribute: string,
  value: unknown,
): number | string | boolean | null {
  const mapping = modelClass._enums?.get(attribute);
  if (!mapping) return null;

  return enumTypeFor(attribute, mapping).serialize(value);
}

/**
 * Validate enum values are non-empty array or hash with proper types.
 * Mirrors: ActiveRecord::Enum#assert_valid_enum_definition_values (private)
 *
 * Accepts both strings and symbols in arrays (Rails parity). JavaScript symbols
 * are the closest equivalent to Ruby symbols; strings are used directly.
 *
 * @internal
 */
export function assertValidEnumDefinitionValues(
  values: any,
): Record<string, string | number | boolean | null> | (string | symbol)[] {
  if (Array.isArray(values)) {
    if (values.length === 0) {
      throw new ArgumentError("Enum values must not be empty.");
    }
    const allValid = values.every((v) => typeof v === "string" || typeof v === "symbol");
    if (!allValid) {
      throw new ArgumentError(
        `Enum values must only contain strings or symbols, got: ${Array.from(
          new Set(values.map((v) => typeof v)),
        ).join(", ")}`,
      );
    }
    if (
      values.some((v) => {
        if (typeof v === "symbol") {
          // Reject Symbol("") / Symbol("   ") — mirror Ruby Symbol#blank?
          const desc = v.description ?? Symbol.keyFor(v) ?? "";
          return isBlank(desc);
        }
        return isBlank(v);
      })
    ) {
      throw new ArgumentError("Enum values must not contain a blank name.");
    }
    return values;
  }

  if (isPlainHash(values)) {
    // Use Reflect.ownKeys so symbol-keyed entries (e.g. { [Symbol('draft')]: 0 })
    // aren't silently dropped by Object.keys; symbols are validated alongside
    // strings to mirror Ruby Hash + Symbol semantics.
    const keys = Reflect.ownKeys(values as object);
    if (keys.length === 0) {
      throw new ArgumentError("Enum values must not be empty.");
    }
    if (
      keys.some((k) => {
        if (typeof k === "symbol") {
          const desc = k.description ?? Symbol.keyFor(k) ?? "";
          return isBlank(desc);
        }
        return isBlank(k);
      })
    ) {
      throw new ArgumentError("Enum values must not contain a blank name.");
    }
    for (const k of keys) {
      const value = (values as Record<string | symbol, unknown>)[k as string];
      const isFiniteNumber = typeof value === "number" && Number.isFinite(value);
      if (
        !(
          typeof value === "string" ||
          isFiniteNumber ||
          typeof value === "boolean" ||
          value === null
        )
      ) {
        throw new ArgumentError(
          `Enum values must be only booleans, finite numbers, strings, or null, got: ${
            typeof value === "number" ? String(value) : typeof value
          }`,
        );
      }
    }
    return values;
  }

  throw new ArgumentError("Enum values must be either a non-empty hash or an array.");
}

/** True for plain JS objects (Object.prototype or null proto), matching Ruby Hash semantics. */
function isPlainHash(value: unknown): boolean {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

/**
 * Validate enum options: reject underscore-prefixed variants.
 * Mirrors: ActiveRecord::Enum#assert_valid_enum_options (private)
 *
 * @internal
 */
export function assertValidEnumOptions(options: unknown): void {
  if (!options || !isPlainHash(options)) return;

  // Rails: options.keys & %i[_prefix _suffix _scopes _default _instance_methods]
  // Note: _validate is NOT in this list — it is rejected at the enum definition
  // level, not as an option key (enum.rb:361-365).
  const invalidKeys = ["_prefix", "_suffix", "_scopes", "_default", "_instance_methods"];
  const found = Object.keys(options).filter((k) => invalidKeys.includes(k));

  if (found.length > 0) {
    // Rails: invalid_keys.map(&:inspect) — inspect on a Ruby symbol produces ":key"
    throw new ArgumentError(
      `invalid option(s): ${found.map((k) => `:${k}`).join(", ")}. Valid options are: :prefix, :suffix, :scopes, :default, :instance_methods, and :validate.`,
    );
  }
}

/** Default warn sink — overridable via setEnumWarn so hosts can route warnings. */
let _enumWarn: (msg: string) => void = (msg) => console.warn(msg);

export function setEnumWarn(fn: (msg: string) => void): void {
  _enumWarn = fn;
}

/**
 * Warn on negative enum condition conflicts (e.g., both "notDraft" and "draft").
 * Mirrors: ActiveRecord::Enum#detect_negative_enum_conditions! (private)
 *
 * @internal
 */
export function detectNegativeEnumConditionsBang(methodNames: string[]): void {
  const methodNameSet = new Set(methodNames);
  for (const notMethod of methodNames) {
    const normalized = normalizeNegativeEnumPositiveForm(notMethod);
    if (!normalized) continue;
    const { prefix, positiveForm } = normalized;
    if (methodNameSet.has(positiveForm)) {
      _enumWarn(
        `Enum uses prefix '${prefix}' which conflicts with auto-generated negative scope '${notMethod}' ` +
          `while positive form '${positiveForm}' also exists.`,
      );
    }
  }
}

function normalizeNegativeEnumPositiveForm(
  methodName: string,
): { prefix: "not" | "not_"; positiveForm: string } | null {
  if (methodName.startsWith("not_")) {
    const rest = methodName.substring(4);
    if (rest.length === 0) return null;
    return { prefix: "not_", positiveForm: rest.charAt(0).toLowerCase() + rest.slice(1) };
  }
  // Match camelCase generated form: "notDraft" — next char must be uppercase
  // (so unrelated identifiers like "notebook" / "notify" don't get treated
  // as negative scopes for "ebook" / "ify").
  if (methodName.startsWith("not") && methodName.length > 3) {
    const next = methodName.charAt(3);
    if (next !== next.toUpperCase() || next === next.toLowerCase()) return null;
    const rest = methodName.substring(3);
    return { prefix: "not", positiveForm: rest.charAt(0).toLowerCase() + rest.slice(1) };
  }
  return null;
}
