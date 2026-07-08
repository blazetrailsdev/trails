import type { Base } from "./base.js";
import { camelize, isBlank, pluralize } from "@blazetrails/activesupport";
import {
  ArgumentError,
  ValueType,
  IntegerType,
  Type,
  typeRegistry,
  isDecoratorReplay,
} from "@blazetrails/activemodel";
import { dangerousAttributeMethods } from "./attribute-methods.js";
import { isDangerousClassMethod, isRelationInstanceMethod } from "./scoping/named.js";
// The synchronous schema reflector (warm-cache path), NOT the async
// `Base.loadSchema()` — mirrors what `Base.typeForAttribute` calls.
import { loadSchema as reflectSchemaSync } from "./model-schema.js";

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
 * Resolve the enum's storage subtype from the reflected attribute type — the
 * single source of truth, mirroring Rails' `decorate_attributes` block
 * (`subtype = subtype.subtype if EnumType === subtype; EnumType.new(name,
 * enum_values, subtype, ...)`, enum.rb:239-246). The `reflected` type is
 * whatever the attribute currently resolves to when the pending decorator
 * replays: after the schema is loaded that is the column's real `Type::Value`,
 * so the EnumType always delegates cast/serialize/deserialize to the actual
 * column type.
 *
 * trails' column-seed-then-replay now seeds the override attribute with the
 * reflected `type_for_column` in phase 1 of `_defaultAttributes`
 * (attributes.ts), so the `reflected` argument the decorator receives at replay
 * time is already the column's real `Type::Value` — no per-def stash needed,
 * mirroring Rails' block verbatim (`subtype = subtype.subtype if EnumType ===
 * subtype`).
 *
 * Two fallbacks mirror the surrounding replay machinery rather than Rails
 * directly: an already-decorated EnumType is unwrapped to its own subtype (a
 * re-replay), and — because trails' decorator also runs eagerly at
 * class-definition time, before the schema is reflected — a still-default
 * `value` type falls back to inferring the subtype from the mapping's value
 * shapes so pre-reflection casts are not identity no-ops.
 */
function enumTypeFrom(
  name: string,
  mapping: Record<string, EnumValue>,
  reflected: Type,
  raiseOnInvalidValues: boolean,
): EnumType {
  let subtype: ValueType<unknown>;
  if (reflected instanceof EnumType) {
    subtype = reflected.subtypeType();
  } else {
    const rv = reflected as ValueType<unknown>;
    subtype = rv.type() === "value" ? subtypeInstance(inferSubtype(Object.values(mapping))) : rv;
  }
  return new EnumType(name, new Map(Object.entries(mapping)), subtype, raiseOnInvalidValues);
}

/**
 * Enum definition — maps symbolic names to integer values.
 *
 * Mirrors: ActiveRecord::Enum
 */

/**
 * Register an EnumType in the attribute set and install the label-returning
 * accessor, the single Rails-faithful storage model used by the `Base.enum`
 * macro (`_enum`). After this, the attribute
 * stores the label string (via EnumType.cast on write), the getter returns it,
 * and assignment runs `assertValidValue`.
 *
 * Mirrors: ActiveRecord::Enum#_enum calling `attribute(name, **options)` then
 * `decorate_attributes([name]) { |_n, subtype| EnumType.new(...) }` (enum.rb:238-247).
 *
 * @internal
 */
export function installEnumAttribute(
  klass: typeof Base,
  attribute: string,
  name: string,
  mapping: Record<string, EnumValue>,
  raiseOnInvalidValues: boolean,
  attributeOptions?: { default?: unknown },
): void {
  // Rails' _enum uses `attribute(name)` (bare) + `decorate_attributes`, layering
  // the EnumType on top of the column-seeded FromDatabase attribute so the enum
  // default flows through `deserialize` for free (enum.rb:238-247). trails'
  // `_defaultAttributes` now mirrors Rails' column-seed-then-replay
  // (attributes.ts): phase 1 seeds the real DB column via `fromDatabase` with the
  // column's raw default, phase 2 replays the bare `attribute` (a PendingType that
  // keeps the FromDatabase wrapper) and this `decorateAttributes` (which swaps the
  // type to the EnumType). cast(0) on an EnumType yields null; deserialize(0)
  // yields the "default" label — so the column-default path is exactly what makes
  // the enum default work, recovered here without any special-casing.
  // Rails' `_enum` forwards its leftover kwargs (e.g. `default:`) into
  // `attribute(name, **options)` (enum.rb:237), so the macro-level `default:`
  // seeds the attribute default and flows through the EnumType on read. Pass a
  // bare `attribute(name)` when there are no options to preserve the
  // column-seeded FromDatabase attribute.
  if (attributeOptions && "default" in attributeOptions) {
    klass.attribute(attribute, { default: attributeOptions.default });
  } else {
    klass.attribute(attribute);
  }
  // Rails resolves the subtype lazily inside the decorate block from the
  // reflected column type (enum.rb:239-246); the decorator re-runs on every
  // _defaultAttributes replay, so once the schema is loaded `reflected` is the
  // column's real Type::Value and the EnumType delegates to it.
  klass.decorateAttributes([attribute], (_name: string, reflected: Type, host?: unknown) => {
    // Rails raises inside the `decorate_attributes` block when the decorated
    // subtype is `ActiveModel::Type.default_value` — an enum name with no backing
    // column and no explicit type (enum.rb:240-245). trails can't mirror that via
    // the `reflected` subtype: its alias-aware column-seeding hands the aliased
    // phantom the *target* column's type at replay (so `reflected.type()` is e.g.
    // "integer", not "value"). Instead check the real column via
    // `assertEnumTypeDeclared` (an alias-unaware `columnForAttribute` lookup).
    //
    // Resolve the check against the *materializing* class (`host`), not the
    // declaring `klass`: Rails replays a superclass's pending decorator into the
    // subclass's attribute set (attribute_registration.rb:81-87), so a concrete
    // subclass of an abstract parent (e.g. `Lion` < abstract `Cat`) checks its own
    // columns — while an abstract parent that declares an enum defers until a
    // concrete subclass materializes rather than throwing `TableNotSpecified` on
    // its own tableless schema.
    //
    // Two trails-specific gates: `isDecoratorReplay()` skips the eager
    // class-definition-time application (a back-compat convenience Rails lacks,
    // when the subtype is still the bare default), and `!target.abstractClass`
    // skips the rare direct materialization of an abstract class itself.
    const target = (host as typeof Base | undefined) ?? klass;
    if (isDecoratorReplay() && !target.abstractClass) {
      assertEnumTypeDeclared(target, attribute);
    }
    return enumTypeFrom(name, mapping, reflected, raiseOnInvalidValues);
  });

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
  readAttribute(name: string): unknown;
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

  constructor(
    name: string,
    mapping: ReadonlyMap<string, EnumValue>,
    subtype: ValueType<unknown>,
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
    // Rails passes the column's real `Type::Value` instance into `EnumType.new`
    // and stores it as `subtype`; cast/serialize/deserialize delegate to it.
    this._subtypeType = subtype;
  }

  // Rails' EnumType does `delegate :type, to: :subtype` — callers that ask what
  // an enum column's storage type is want the underlying column type (e.g.
  // "integer"), so delegate to the subtype's own `type()`.
  get subtype(): string {
    return this._subtypeType.type();
  }

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
 * Derive the generated method names for a single enum value from its trails
 * camelCase value method name (e.g. `draft`, `apiKey`). The predicate and
 * negative scope capitalize the value name via a plain first-char upcase
 * (`cap`), NOT `camelize(x, true)` (upper-first) — the two diverge on acronym
 * labels (`apiKey` → `isApiKey` vs. `isAPIKey`). Both the conflict-detection
 * pass and `defineEnumMethods` route through this single helper so the name a
 * method is defined under always matches the name conflict detection records.
 */
function enumMethodNamesFor(valueMethodName: string): {
  predicateName: string;
  bangName: string;
  notScopeName: string;
} {
  const capitalized = `${valueMethodName.charAt(0).toUpperCase()}${valueMethodName.slice(1)}`;
  return {
    predicateName: `is${capitalized}`,
    bangName: `${valueMethodName}Bang`,
    notScopeName: `not${capitalized}`,
  };
}

/**
 * Module that holds enum instance/scope methods generated by `_enum`.
 * Rails defines this as a private inner class and mixes it into the model.
 *
 * Mirrors: ActiveRecord::Enum::EnumMethods
 */
export class EnumMethods {
  private _klass: typeof import("./base.js").Base;
  private _carrier?: object;

  constructor(klass: typeof import("./base.js").Base) {
    this._klass = klass;
  }

  /** @internal */
  get klass(): typeof import("./base.js").Base {
    return this._klass;
  }

  /**
   * @internal
   * The per-class prototype carrier that holds generated enum methods,
   * interposed between the model prototype and its parent — the runtime
   * analogue of Rails' anonymous `_enum_methods_module` `include`d into the
   * class (enum.rb:251). Generated methods live BELOW the class body in the
   * ancestor chain, so a class-body method of the same name shadows the
   * generated one and reaches it via `super` (the interposed prototype is what
   * `super.<method>()` resolves to from a method whose home object is the model
   * prototype). Installing directly on `klass.prototype` instead would clobber
   * (or be clobbered by) class-body methods with no `super` chain between them.
   * Created lazily and once per class; all of a class's enums share it.
   */
  carrier(): object {
    if (!this._carrier) {
      const proto = this._klass.prototype as object;
      const carrier = Object.create(Object.getPrototypeOf(proto)) as object;
      Object.setPrototypeOf(proto, carrier);
      this._carrier = carrier;
    }
    return this._carrier;
  }

  /**
   * @internal
   * Define predicate, bang, and scope methods for a single enum value.
   *
   * `valueMethodName` is the trails camelCase value method name (e.g. `draft`,
   * `americanBobtail`); the generated surface is the trails idiom of Rails'
   * `#{value_method_name}?` / `#{value_method_name}!` / scope / `not_...`:
   * the predicate `is{Name}`, the persisting bang `{name}Bang`, the positive
   * scope `{name}`, and the auto negative scope `not{Name}`.
   */
  defineEnumMethods(
    name: string,
    valueMethodName: string,
    value: EnumValue,
    scopes: boolean,
    instanceMethods: boolean,
  ): void {
    const klass = this.klass;
    const { predicateName, bangName, notScopeName: notName } = enumMethodNamesFor(valueMethodName);
    // Conflict detection lives in `_enum`'s dedicated pre-generation pass (it
    // consults trails-specific state — the per-class `_enumMethodsModuleNames`
    // set and the dangerous-method set — and runs before any method is defined,
    // so it can't be routed through the interleaved Rails-style
    // `detect_enum_conflict!` here without false-positiving on a prior value's
    // auto `not*` scope). This generator only defines the surface.
    if (instanceMethods) {
      // Install on the interposed carrier (not `klass.prototype`) so a
      // class-body method of the same name shadows the generated one and can
      // delegate to it via `super`. Mirrors Rails' `_enum_methods_module`.
      const carrier = this.carrier();
      Object.defineProperty(carrier, predicateName, {
        value: function (this: EnumInstanceHost) {
          // Rails compares `#{name}_for_database == value`; trails stores the
          // label, so serialize the stored label back to its database value
          // (via castEnumValue) and compare. Robust on fresh/unsaved records
          // where the raw `valueForDatabase` attribute path isn't wired yet.
          return castEnumValue(klass, name, this.readAttribute(name)) === value;
        },
        writable: true,
        configurable: true,
      });
      Object.defineProperty(carrier, bangName, {
        value: function (this: EnumInstanceHost) {
          // Returns update!'s result (true), mirroring Rails' bang setter.
          return this.updateBang({ [name]: value });
        },
        writable: true,
        configurable: true,
      });
    }
    if (scopes) {
      klass.scope(valueMethodName, (rel: any) => rel.where({ [name]: value }));
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
    default?: unknown;
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
    default?: unknown;
  },
): void {
  if (values == null) throw new ArgumentError(`${String(name)} enum values must not be nil`);
  assertValidEnumDefinitionValues(values);
  assertValidEnumOptions(options ?? {});

  // Rails guards the enum *name* itself against reserved Active Record methods
  // before generating any value methods: the pluralized mapping accessor
  // (`name.pluralize`, e.g. `column` → `columns`) as a class method, and the
  // reader/writer (`name`, `name=`) as instance methods.
  // Mirrors enum.rb `detect_enum_conflict!(name, name.pluralize, true)` and the
  // two `detect_enum_conflict!(name, name)` / `detect_enum_conflict!(name, "#{name}=")` calls.
  detectEnumConflictBang.call(this, name, pluralize(name), true);
  detectEnumConflictBang.call(this, name, name);
  detectEnumConflictBang.call(this, name, `${name}=`);

  const attribute = name;
  const mapping = Array.isArray(values)
    ? Object.fromEntries(values.map((v, i) => [v, i]))
    : (values as Record<string, EnumValue>);

  // Resolve an `alias_attribute` target: `enum :aliased_status` on
  // `alias_attribute :aliased_status, :status` stores through the real `status`
  // column. Storage, the EnumType, the reader accessor, and the generated
  // predicate/scope conditions all key off the resolved column so reads and
  // `where(...)` hit the backing attribute; the value-method *names* still
  // derive from the enum labels (unaffected by the alias). Mirrors Rails, where
  // the aliased attribute delegates to its target everywhere.
  // The alias is resolved eagerly here, matching Rails: `enum`'s
  // `decorate_attributes([name])` resolves the name through `attribute_aliases`
  // at declaration time (enum.rb:238, activemodel attribute_methods.rb:396) and
  // bakes it into a pending modification that is never re-evaluated. So
  // `alias_attribute` MUST precede `enum` (the order Rails' own suite uses).
  // Declaring `enum` first keys everything off the un-aliased name, which has no
  // column of its own; real Rails raises `Undeclared attribute type for enum` on
  // first use (verified against vendored Rails). trails converges via
  // `assertEnumTypeDeclared` on the un-aliased name — mirroring Rails' `subtype
  // == ActiveModel::Type.default_value` branch (enum.rb:240-245) — run from the
  // enum decorator's deferred replay (gated by `isDecoratorReplay()`, so it never
  // fires on trails' eager class-definition-time decorator application), matching
  // Rails' lazy timing.
  const attrName =
    (this as unknown as { _attributeAliases?: Record<string, string> })._attributeAliases?.[
      attribute
    ] ?? attribute;

  if (!Object.prototype.hasOwnProperty.call(this, "_enums")) {
    this._enums = new Map(this._enums);
  }
  this._enums.set(attrName, mapping);

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

  // Rails raises for an enum on an attribute with no declared type AND no
  // backing DB column, but only once the schema is reflected (inside the
  // `decorate_attributes` block, at `type_for_attribute`). We can't tell a real
  // column apart from a typeless attribute at `enum` time, so any enum NOT
  // explicitly typed via `attribute(name, type)` is queued for a deferred check
  // (`_enumsPendingTypeCheck`) that `typeForAttribute` runs post-loadSchema and
  // clears once a backing column is confirmed. See `assertEnumTypeDeclared`.
  // "Explicitly typed" means the user declared a concrete attribute *type*
  // (`attribute(name, "integer")`), NOT merely a default (`attribute(name,
  // { default })`) or nothing. Rails pushes a `PendingType` only when a type is
  // present (attribute_registration.rb:12-18); a default-only / type-less
  // attribute keeps the fallback `value` type until the column reflects, so its
  // subtype must still come from the column (enum decorates the column type,
  // enum.rb:238-248). Requiring a user-provided def AND a concrete (non-`value`)
  // type distinguishes the two: a default-only attribute's type is still the
  // `value` default at `enum` time, so it is treated as column-reflected.
  const existingDef = (this as any)._attributeDefinitions?.get(attrName);
  const existingTypeName =
    typeof existingDef?.type?.type === "function" ? existingDef.type.type() : undefined;
  const explicitlyTyped =
    (existingDef?.source === "user" || existingDef?.userProvided === true) &&
    existingTypeName != null &&
    existingTypeName !== "value";
  const pendingHost = this as unknown as { _enumsPendingTypeCheck?: Set<string> };
  if (!explicitlyTyped) {
    if (!Object.prototype.hasOwnProperty.call(this, "_enumsPendingTypeCheck")) {
      pendingHost._enumsPendingTypeCheck = new Set(pendingHost._enumsPendingTypeCheck);
    }
    pendingHost._enumsPendingTypeCheck!.add(attrName);
  } else if (pendingHost._enumsPendingTypeCheck?.has(attrName)) {
    // An explicit type now backs the enum — drop any inherited pending marker.
    pendingHost._enumsPendingTypeCheck = new Set(pendingHost._enumsPendingTypeCheck);
    pendingHost._enumsPendingTypeCheck.delete(attrName);
  }

  // Register the EnumType so typeForAttribute() returns it for predicate-builder
  // serialization — e.g. where({status: "draft"}) serializes "draft" → 0 — and
  // install the label-returning accessor via the shared installEnumAttribute.
  // The subtype is NOT resolved here: installEnumAttribute wires a
  // `decorateAttributes` decorator that builds the EnumType lazily from the
  // reflected column type on each replay (Rails' `decorate_attributes` model),
  // so we never eagerly guess it from the mapping shape.
  // Mirrors Rails `EnumType.new(..., raise_on_invalid_values: !validate)`: with
  // `validate:` set, an invalid assignment is caught by the inclusion validator
  // rather than raising on write, so the type must not raise.
  const validate = options?.validate ?? false;
  installEnumAttribute(
    this,
    attrName,
    name,
    mapping,
    !validate,
    options && "default" in options ? { default: options.default } : undefined,
  );

  // Rails' `_enum` takes `scopes: true, instance_methods: true` keyword
  // defaults; `scopes: false` suppresses per-value scope generation and
  // `instance_methods: false` suppresses predicate/bang generation.
  const scopesEnabled = options?.scopes !== false;
  const instanceMethodsEnabled = options?.instanceMethods !== false;

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
  const dangerousMethods = dangerousAttributeMethods();
  // Mirror Rails' `_enum_methods_module`: the second `detect_enum_conflict!`
  // instance-method branch (enum.rb:383-384) raises "...already defined by
  // another enum" when a *different* enum on the same class already generated a
  // value method with this name. `dangerousAttributeMethods()` covers only
  // framework methods, so we track enum-generated predicate/bang names and
  // consult them here; the set is populated during the generation pass below, so
  // the conflict pass only sees names from prior `enum()` declarations.
  //
  // Crucially the set is per-class and NOT inherited: Rails' `_enum_methods_module`
  // is a class-instance variable (enum.rb:326-332) that Ruby does not inherit, so
  // a subclass gets a fresh, empty module on first use — a subclass enum reusing a
  // *parent* enum's value-method name does not conflict (the child's method just
  // shadows via MRO). We therefore seed a fresh empty set per class rather than
  // copying the parent's, while `hasOwnProperty` still lets multiple enums on the
  // *same* class accumulate into one set.
  const enumMethodsHost = this as unknown as { _enumMethodsModuleNames?: Set<string> };
  if (!Object.prototype.hasOwnProperty.call(this, "_enumMethodsModuleNames")) {
    enumMethodsHost._enumMethodsModuleNames = new Set<string>();
  }
  const enumMethodNames = enumMethodsHost._enumMethodsModuleNames!;
  const definedNames = new Set<string>();
  const valueMethodNames: string[] = [];
  for (const [n] of Object.entries(mapping)) {
    const fullName = toCamel(methodName(n));
    const { predicateName, bangName, notScopeName } = enumMethodNamesFor(fullName);
    const friendlyName = toCamel(methodName(n).replace(/[^\w\x80-\uffff]+/g, "_"));

    // Rails feeds both the value method name and its special-char-stripped
    // friendly alias into detect_negative_enum_conditions! (enum.rb:266-279),
    // pushing the alias only when it differs and isn't already present.
    valueMethodNames.push(fullName);
    if (friendlyName !== fullName && !valueMethodNames.includes(friendlyName)) {
      valueMethodNames.push(friendlyName);
    }

    // Rails runs `detect_enum_conflict!` for the `?`/`!` methods *only* inside
    // `if instance_methods` and for the value/`not_` scopes *only* inside
    // `if scopes` (enum.rb:302-321). Gate each family the same way so an enum
    // opting out of a surface also opts out of its conflict checks — e.g.
    // `instance_methods: false` must not raise on a predicate-name collision it
    // will never generate.
    if (instanceMethodsEnabled) {
      if (definedNames.has(predicateName)) raiseConflictError.call(this, attribute, predicateName);
      if (definedNames.has(bangName)) raiseConflictError.call(this, attribute, bangName);
      definedNames.add(predicateName);
      definedNames.add(bangName);
      // Instance value methods (predicate/bang) only conflict with *dangerous*
      // Active Record instance methods — a plain user override (`def published!;
      // super; end`) is allowed and simply wins over the generated method, so we
      // must not raise merely because the name exists on the prototype.
      // Mirrors enum.rb's `dangerous_attribute_method?` gate.
      if (dangerousMethods.has(predicateName))
        raiseConflictError.call(this, attribute, predicateName);
      if (enumMethodNames.has(predicateName))
        raiseConflictError.call(this, attribute, predicateName, { source: "another enum" });
      if (dangerousMethods.has(bangName)) raiseConflictError.call(this, attribute, bangName);
      if (enumMethodNames.has(bangName))
        raiseConflictError.call(this, attribute, bangName, { source: "another enum" });
    }
    if (scopesEnabled) {
      if (definedNames.has(fullName))
        raiseConflictError.call(this, attribute, fullName, { type: "class" });
      definedNames.add(fullName);
      // The value/`not*` scope names are class methods, so route them through
      // the class-method conflict detector, which consults all three Rails
      // sub-branches (a *dangerous* class method — RESTRICTED_CLASS_METHODS plus
      // methods `Base` itself defines; a Relation instance method; and the `id`
      // special-case), each raising with the correct type/source rather than the
      // generic scope error. A scope inherited from a parent enum or a plain
      // user static on the model/an ancestor is NOT a conflict.
      detectEnumConflictBang.call(this, attribute, fullName, true);
      detectEnumConflictBang.call(this, attribute, notScopeName, true);
    }
    if (friendlyName !== fullName) {
      const {
        predicateName: fp,
        bangName: friendlyBang,
        notScopeName: notFriendlyName,
      } = enumMethodNamesFor(friendlyName);
      if (instanceMethodsEnabled) {
        if (dangerousMethods.has(fp)) raiseConflictError.call(this, attribute, fp);
        if (enumMethodNames.has(fp))
          raiseConflictError.call(this, attribute, fp, { source: "another enum" });
        if (dangerousMethods.has(friendlyBang))
          raiseConflictError.call(this, attribute, friendlyBang);
        if (enumMethodNames.has(friendlyBang))
          raiseConflictError.call(this, attribute, friendlyBang, { source: "another enum" });
      }
      if (scopesEnabled) {
        detectEnumConflictBang.call(this, attribute, friendlyName, true);
        detectEnumConflictBang.call(this, attribute, notFriendlyName, true);
      }
    }
  }

  // Rails only warns (never raises) when an enum element's auto-generated
  // negative scope (`not*`) would clash with a positively-named element, and
  // skips the check entirely when scopes are disabled.
  // Mirrors: `detect_negative_enum_conditions!(value_method_names) if scopes`.
  if (scopesEnabled) {
    detectNegativeEnumConditionsBang(valueMethodNames);
  }

  // Rails generates the per-value methods inside `_enum_methods_module`
  // (enum.rb:251); route trails' generation through the same module so
  // `EnumMethods.defineEnumMethods` is the single generator.
  const methodsModule = this._enumMethodsModule();
  for (const [n, value] of Object.entries(mapping)) {
    const fullName = toCamel(methodName(n));
    const friendlyName = toCamel(methodName(n).replace(/[^\w\x80-\uffff]+/g, "_"));

    // Route the value method name — and, when it differs, its special-char
    // friendly alias — through the single generator, mirroring Rails' two
    // `define_enum_methods` calls per value (enum.rb:265-278). This defines the
    // predicate `is{Name}`, the persisting bang `{name}Bang`, the positive
    // scope `{name}`, and the auto negative scope `not{Name}`.
    methodsModule.defineEnumMethods(
      attrName,
      fullName,
      value,
      scopesEnabled,
      instanceMethodsEnabled,
    );
    if (friendlyName !== fullName) {
      methodsModule.defineEnumMethods(
        attrName,
        friendlyName,
        value,
        scopesEnabled,
        instanceMethodsEnabled,
      );
    }

    // Original-form predicate/bang for labels with special chars (spaces,
    // hyphens). Rails: define_method("American Bobtail?"), reachable via
    // bracket notation only.
    const originalName = methodName(n);
    if (instanceMethodsEnabled && /[^\w\x80-\uffff]/.test(originalName)) {
      const carrier = methodsModule.carrier();
      Object.defineProperty(carrier, `is${originalName}`, {
        value: function (this: Base) {
          return this.readAttribute(attrName) === n;
        },
        writable: true,
        configurable: true,
      });
      Object.defineProperty(carrier, `${originalName}Bang`, {
        value: function (this: EnumInstanceHost) {
          return this.updateBang({ [attrName]: value });
        },
        writable: true,
        configurable: true,
      });
    }

    // Record the generated instance-method names so a later enum on this class
    // (or a subclass) that would generate the same predicate/bang raises
    // "already defined by another enum" — mirroring membership in Rails'
    // `_enum_methods_module`. Only record when the predicate/bang were actually
    // defined (`instance_methods: false` defines neither, so a later enum reusing
    // the name must not conflict).
    if (instanceMethodsEnabled) {
      const names = enumMethodNamesFor(fullName);
      enumMethodNames.add(names.predicateName);
      enumMethodNames.add(names.bangName);
      if (friendlyName !== fullName) {
        const friendlyNames = enumMethodNamesFor(friendlyName);
        enumMethodNames.add(friendlyNames.predicateName);
        enumMethodNames.add(friendlyNames.bangName);
      }
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
    this.validatesInclusionOf(attribute, { in: Object.keys(mapping), ...validateOptions });
  }

  // Mapping accessor under the pluralized attribute name (e.g. User.statuses
  // for `status`). Rails: `singleton_class.define_method(name.to_s.pluralize)`.
  // Rails returns the frozen `pairs` hash (enum.rb) so callers can't mutate the
  // canonical mapping — `Book.statuses["bad"] = 40` raises "can't modify frozen".
  // Freeze once and hand back the same object so mutation attempts throw a
  // TypeError in strict mode.
  const frozenMapping = Object.freeze({ ...mapping });
  Object.defineProperty(this, pluralize(attribute), {
    get() {
      return frozenMapping;
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
  // Rails splits the two: a class method is dangerous per `dangerous_class_method?`
  // (a fixed set plus anything `Base` — not a subclass — responds to), an
  // instance method per `dangerous_attribute_method?` (membership in the
  // precomputed `Base.instance_methods` set). The instance branch consults that
  // single curated set rather than walking the model's prototype chain, so a
  // user override or an `alias_attribute` reader on the model (or an ancestor)
  // is NOT treated as a conflict — only genuine framework methods are.
  if (_klassMethod) {
    // Rails' `dangerous_class_method?` is a fixed RESTRICTED_CLASS_METHODS list
    // plus the methods `Base` itself defines (never a subclass or intermediate
    // ancestor). `isDangerousClassMethod` walks statics from `Base`, so a
    // user/scope class method on the model or an intermediate ancestor whose
    // name matches an enum's `pluralize(name)` no longer false-positives — while
    // reserved names like `columns` (defined on `Base`) still raise.
    if (isDangerousClassMethod(methodName)) {
      raiseConflictError.call(this, enumName, methodName, { type: "class" });
    }
    // Sub-branch 2 (enum.rb:377-378): a class method that `Relation` defines as
    // an instance method — e.g. `records`, `to_ary`, `scope_for_create` — is a
    // conflict because the generated scope shadows it. Rails reports
    // `source: Relation.name` ("ActiveRecord::Relation").
    if (isRelationInstanceMethod(methodName)) {
      raiseConflictError.call(this, enumName, methodName, {
        type: "class",
        source: "ActiveRecord::Relation",
      });
    }
    // Sub-branch 3 (enum.rb:379-380): a scope literally named `id` conflicts
    // with AR querying. Rails raises the *instance*-type message here (default
    // type/source), matching `method_name.to_sym == :id`.
    if (methodName === "id") {
      raiseConflictError.call(this, enumName, methodName);
    }
    return;
  }
  if (dangerousAttributeMethods().has(methodName)) {
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
 * Raise if an enum was declared on an attribute that ends up with no declared
 * type — no backing DB column and no explicit `attribute(name, type)`. Called
 * lazily from `typeForAttribute` (after `loadSchema`) so the check sees real
 * columns, mirroring Rails raising inside the `decorate_attributes` block when
 * `subtype == ActiveModel::Type.default_value`.
 *
 * @internal
 */
export function assertEnumTypeDeclared(klass: typeof Base, name: string): void {
  const host = klass as unknown as {
    _enumsPendingTypeCheck?: Set<string>;
    columnForAttribute(n: string): { type?: unknown };
  };
  const pending = host._enumsPendingTypeCheck;
  if (!pending || !pending.has(name)) return;
  // A backing DB column resolves the subtype (`columnForAttribute` returns the
  // schema column; unknown names yield a NullColumn with `type: null`).
  const column = host.columnForAttribute(name);
  if (column && column.type != null) {
    // Backed by a real column — clear the marker so we don't re-check on every
    // subsequent `typeForAttribute` call. Copy-on-write to avoid mutating an
    // inherited set shared with the parent class.
    if (!Object.prototype.hasOwnProperty.call(klass, "_enumsPendingTypeCheck")) {
      host._enumsPendingTypeCheck = new Set(pending);
    }
    host._enumsPendingTypeCheck!.delete(name);
    return;
  }
  throw undeclaredEnumTypeError(klass, name);
}

/** The Rails "Undeclared attribute type for enum" RuntimeError message. */
function undeclaredEnumTypeError(klass: typeof Base, name: string): Error {
  return new Error(
    `Undeclared attribute type for enum '${name}' in ${klass.name}. Enums must be` +
      " backed by a database column or declared with an explicit type" +
      " via `attribute`.",
  );
}

/**
 * Fetch the single registered EnumType for an enum attribute — the one source
 * of truth built lazily from the reflected column type via the
 * `decorateAttributes` decorator. Resolves through the replayed AttributeSet
 * (`_defaultAttributes`), NOT `_attributeDefinitions`: reflection skips a
 * userProvided enum def, so its `type` stays the pre-reflection (mapping-shape-
 * inferred) EnumType, whereas the replayed decorator rebuilds the EnumType from
 * the reflected column subtype. Returns null when the attribute isn't an enum
 * on this class.
 *
 * @internal
 */
export function enumTypeOf(klass: typeof Base, attribute: string): EnumType | null {
  const host = klass as unknown as {
    _enums?: Map<string, unknown>;
    _attributeAliases?: Record<string, string>;
    _defaultAttributes(): { getAttribute(n: string): { type: Type } };
  };
  // Check the *un-resolved* name before resolving the alias: an `enum` declared
  // before its `alias_attribute` keys a phantom `_enums` entry under the
  // un-aliased name, so resolving first would look past it to the backing column
  // and silently return null. `assertEnumTypeDeclared` raises only when the name
  // has no column of its own (Rails' `subtype == default_value` condition), so a
  // column-backed enum whose name is later aliased is unaffected. Mirrors Rails
  // routing type casting through `type_for_attribute(name)`, whose
  // `decorate_attributes` block raises (type_caster/map.rb:10-16, enum.rb:240-245).
  assertEnumTypeDeclared(klass, attribute);
  const resolved = host._attributeAliases?.[attribute] ?? attribute;
  if (!host._enums?.has(resolved)) return null;
  // Reflect synchronously from the warm schema cache before reading the
  // attribute set — the SAME path `Base.typeForAttribute` uses (base.ts). The
  // public `Base.loadSchema()` is async and would fire-and-forget, letting a
  // caller read the pre-reflection (mapping-inferred) EnumType; this sync
  // reflection seeds the reflected column type and rebuilds `_defaultAttributes`
  // before we read it, so the reflected subtype is already in place.
  reflectSchemaSync.call(klass);
  // Mirror `Base.typeForAttribute`'s guard: a typeless enum (no backing column,
  // no explicit `attribute` type) must raise rather than silently serialize
  // through the pre-reflection fallback (Rails raises from the enum
  // `decorate_attributes` block, enum.rb:240-245).
  assertEnumTypeDeclared(klass, resolved);
  const type = host._defaultAttributes().getAttribute(resolved).type;
  return type instanceof EnumType ? type : null;
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
  return enumTypeOf(ctor, attribute)?.deserialize(stored) ?? null;
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
  return enumTypeOf(modelClass, attribute)?.serialize(value) ?? null;
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
