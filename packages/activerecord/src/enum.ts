import type { Base } from "./base.js";
import {
  HashWithIndifferentAccess,
  camelize,
  isBlank,
  pluralize,
} from "@blazetrails/activesupport";
import { ArgumentError, IntegerType, ValueType, defaultValue } from "@blazetrails/activemodel";
import { lookup as arTypeLookup } from "./type.js";
import { dangerousAttributeMethods, isDangerousAttributeMethod } from "./attribute-methods.js";
import { getOrCreateModuleCarrier } from "./module-carrier.js";
import { isDangerousClassMethod, isRelationInstanceMethod } from "./scoping/named.js";
import { loadSchema as reflectSchemaSync } from "./model-schema.js";

type EnumValue = number | string | boolean | null;

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

function subtypeInstance(subtype: string): ValueType<unknown> {
  try {
    return arTypeLookup(subtype);
  } catch {
    return new IntegerType();
  }
}

function enumTypeFrom(
  name: string,
  mapping: Record<string, EnumValue>,
  reflected: ValueType | null,
  raiseOnInvalidValues: boolean,
): EnumType {
  let subtype: ValueType<unknown>;
  if (reflected instanceof EnumType) {
    subtype = reflected.subtypeType();
  } else {
    const rv = reflected!;
    subtype = rv.type() == null ? subtypeInstance(inferSubtype(Object.values(mapping))) : rv;
  }
  return new EnumType(
    name,
    new HashWithIndifferentAccess<EnumValue>(mapping),
    subtype,
    raiseOnInvalidValues,
  );
}

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
 * @noRailsEquivalent CONVERGEABLE the attribute(...) + decorate_attributes pair of Enum#_enum (enum.rb:222-247), extracted from the macro body.
 */
export function installEnumAttribute(
  klass: typeof Base,
  name: string,
  mapping: Record<string, EnumValue>,
  raiseOnInvalidValues: boolean,
  attributeOptions?: { default?: unknown },
): void {
  if (attributeOptions && "default" in attributeOptions) {
    klass.attribute(name, { default: attributeOptions.default });
  } else {
    klass.attribute(name);
  }
  klass.decorateAttributes([name], (_name: string, subtype: ValueType | null) => {
    if (subtype === defaultValue()) {
      throw new Error(
        `Undeclared attribute type for enum '${name}' in ${klass.name}. Enums must be` +
          " backed by a database column or declared with an explicit type" +
          " via `attribute`.",
      );
    }
    return enumTypeFrom(name, mapping, subtype, raiseOnInvalidValues);
  });

  Object.defineProperty(klass.prototype, name, {
    get(this: Base) {
      return (this as unknown as EnumInstanceHost).readAttribute(name);
    },
    set(this: Base, value: unknown) {
      (this as unknown as EnumInstanceHost).writeAttribute(name, value);
    },
    configurable: true,
  });
}

interface EnumInstanceHost {
  updateBang(attrs: Record<string, unknown>): Promise<true | undefined>;
  readAttribute(name: string): unknown;
  readAttributeForDatabase(name: string): unknown;
  writeAttribute(name: string, value: unknown): void;
}

export function defineEnum(
  modelClass: typeof Base,
  attribute: string,
  valuesInput: string[] | Record<string, string | number | boolean | null>,
  options?: EnumMacroOptions,
): void {
  _enum.call(modelClass, attribute, valuesInput, options);
}

export class EnumType extends ValueType<string> {
  /** @internal */
  readonly name: string;
  private _mapping: HashWithIndifferentAccess<EnumValue>;
  private _reverseMapping: ReadonlyMap<EnumValue, string>;
  private _raiseOnInvalidValues: boolean;
  private _subtypeType: ValueType<unknown>;

  constructor(
    name: string,
    mapping: HashWithIndifferentAccess<EnumValue>,
    subtype: ValueType<unknown>,
    raiseOnInvalidValues = true,
  ) {
    super();
    this.name = name;
    this._mapping = mapping;
    const reverse = new Map<EnumValue, string>();
    for (const [k, v] of mapping.entries()) {
      if (!reverse.has(v)) reverse.set(v, k);
    }
    this._reverseMapping = reverse;
    this._raiseOnInvalidValues = raiseOnInvalidValues;
    this._subtypeType = subtype;
  }

  get subtype(): string | undefined {
    return this._subtypeType.type();
  }

  override type(): string | undefined {
    return this.subtype;
  }

  subtypeType(): ValueType<unknown> {
    return this._subtypeType;
  }

  cast(value: unknown): string | null {
    if (this._mapping.hasKey(value as string)) {
      return value as string;
    }
    if (this._reverseMapping.has(value as EnumValue)) {
      return this._reverseMapping.get(value as EnumValue)!;
    }
    return isBlank(value) ? null : (value as string);
  }

  deserialize(value: unknown): string | null {
    const sub = this._subtypeType.deserialize(value) as EnumValue;
    return this._reverseMapping.get(sub) ?? null;
  }

  serialize(value: unknown): number | string | boolean | null {
    return this._subtypeType.serialize(this._mapping.fetch(value as string, value as EnumValue)) as
      | number
      | string
      | boolean
      | null;
  }

  serializeCastValue(value: unknown): number | string | boolean | null {
    return this.serialize(value);
  }

  isSerializable(value: unknown, block?: (castValue: unknown) => void): boolean {
    return this._subtypeType.isSerializable(
      this._mapping.fetch(value as string, value as EnumValue),
      block,
    );
  }

  assertValidValue(value: unknown): void {
    if (!this._raiseOnInvalidValues) return;
    if (isBlank(value)) return;
    if (this._mapping.hasKey(value as string)) return;
    if (this._reverseMapping.has(value as EnumValue)) return;
    throw new ArgumentError(`'${value}' is not a valid ${this.name}`);
  }

  /** @internal */
  get mapping(): HashWithIndifferentAccess<EnumValue> {
    return this._mapping;
  }
}

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

const _enumCarriers = new WeakMap<typeof import("./base.js").Base, object>();

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
   * @noRailsEquivalent PERMANENT
   */
  carrier(): object {
    return getOrCreateModuleCarrier(this._klass, _enumCarriers);
  }

  /**
   * @internal
   * @missingRailsCall define_method — PERMANENT
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
    if (instanceMethods) {
      const carrier = this.carrier();
      Object.defineProperty(carrier, predicateName, {
        value: function (this: EnumInstanceHost) {
          const recordClass = (this as unknown as { constructor: typeof Base }).constructor;
          return castEnumValue(recordClass, name, this.readAttribute(name)) === value;
        },
        writable: true,
        configurable: true,
      });
      Object.defineProperty(carrier, bangName, {
        value: function (this: EnumInstanceHost) {
          return this.updateBang({ [name]: value });
        },
        writable: true,
        configurable: true,
      });
    }
    if (scopes) {
      klass.scope(valueMethodName, function (this: any) {
        return this.where({ [name]: value });
      });
      klass.scope(notName, function (this: any) {
        return this.where().not({ [name]: value });
      });
    }
  }
}

export interface EnumMacroOptions {
  prefix?: boolean | string;
  suffix?: boolean | string;
  scopes?: boolean;
  instanceMethods?: boolean;
  validate?: boolean | Record<string, unknown>;
  default?: unknown;
}

export function enumMethod(
  this: typeof Base,
  name: string,
  values: string[] | Record<string, EnumValue>,
  options?: EnumMacroOptions,
): void {
  _enum.call(this, name, values, options);
}

export { enumMethod as enum };

/**
 * @missingRailsCall define_method — PERMANENT
 * @internal
 */
export function _enum(
  this: typeof import("./base.js").Base,
  name: string,
  values: string[] | Record<string, string | number | boolean | null>,
  options?: EnumMacroOptions,
): void {
  if (values == null) throw new ArgumentError(`${String(name)} enum values must not be nil`);
  assertValidEnumDefinitionValues(values);
  assertValidEnumOptions(options ?? {});

  const mapping = Array.isArray(values)
    ? Object.fromEntries(values.map((v, i) => [v, i]))
    : (values as Record<string, EnumValue>);

  if (!Object.prototype.hasOwnProperty.call(this, "_enums")) {
    this._enums = new Map(this._enums);
  }

  detectEnumConflictBang.call(this, name, pluralize(name), true);

  this._enums.set(name, mapping);

  detectEnumConflictBang.call(this, name, name);
  detectEnumConflictBang.call(this, name, `${name}=`);

  const prefixStr =
    options?.prefix === true ? name : typeof options?.prefix === "string" ? options.prefix : "";
  const suffixStr =
    options?.suffix === true ? name : typeof options?.suffix === "string" ? options.suffix : "";

  const methodName = (n: string) => {
    if (prefixStr && suffixStr) return `${prefixStr}_${n}_${suffixStr}`;
    if (prefixStr) return `${prefixStr}_${n}`;
    if (suffixStr) return `${n}_${suffixStr}`;
    return n;
  };
  const toCamel = (s: string) => camelize(s, false);

  const validate = options?.validate ?? false;
  installEnumAttribute(
    this,
    name,
    mapping,
    !validate,
    options && "default" in options ? { default: options.default } : undefined,
  );

  const scopes = options?.scopes !== false;
  const instanceMethods = options?.instanceMethods !== false;

  const dangerousMethods = dangerousAttributeMethods();
  const enumMethodsHost = this as unknown as { _enumMethodsModuleNames?: Set<string> };
  if (!Object.prototype.hasOwnProperty.call(this, "_enumMethodsModuleNames")) {
    enumMethodsHost._enumMethodsModuleNames = new Set<string>();
  }
  const enumMethodNames = enumMethodsHost._enumMethodsModuleNames!;
  const definedNames = new Set<string>();
  const valueMethodNames: string[] = [];
  const methodsModule = this._enumMethodsModule();
  for (const [n, value] of Object.entries(mapping)) {
    const valueMethodName = toCamel(methodName(n));
    const { predicateName, bangName, notScopeName } = enumMethodNamesFor(valueMethodName);
    const valueMethodAlias = toCamel(methodName(n).replace(/[^\w\x80-\uffff]+/g, "_"));

    valueMethodNames.push(valueMethodName);
    const aliasIsNew =
      valueMethodAlias !== valueMethodName && !valueMethodNames.includes(valueMethodAlias);
    if (aliasIsNew) {
      valueMethodNames.push(valueMethodAlias);
    }

    if (instanceMethods) {
      if (definedNames.has(predicateName))
        raiseConflictError.call(this, name, predicateName, { source: "another enum" });
      if (definedNames.has(bangName))
        raiseConflictError.call(this, name, bangName, { source: "another enum" });
      definedNames.add(predicateName);
      definedNames.add(bangName);
      if (dangerousMethods.has(predicateName)) raiseConflictError.call(this, name, predicateName);
      if (enumMethodNames.has(predicateName))
        raiseConflictError.call(this, name, predicateName, { source: "another enum" });
      if (dangerousMethods.has(bangName)) raiseConflictError.call(this, name, bangName);
      if (enumMethodNames.has(bangName))
        raiseConflictError.call(this, name, bangName, { source: "another enum" });
    }
    if (scopes) {
      if (definedNames.has(valueMethodName))
        raiseConflictError.call(this, name, valueMethodName, { type: "class" });
      definedNames.add(valueMethodName);
      detectEnumConflictBang.call(this, name, valueMethodName, true);
      detectEnumConflictBang.call(this, name, notScopeName, true);
    }
    if (aliasIsNew) {
      const {
        predicateName: fp,
        bangName: friendlyBang,
        notScopeName: notFriendlyName,
      } = enumMethodNamesFor(valueMethodAlias);
      if (instanceMethods) {
        if (definedNames.has(fp))
          raiseConflictError.call(this, name, fp, { source: "another enum" });
        if (definedNames.has(friendlyBang))
          raiseConflictError.call(this, name, friendlyBang, { source: "another enum" });
        definedNames.add(fp);
        definedNames.add(friendlyBang);
        if (dangerousMethods.has(fp)) raiseConflictError.call(this, name, fp);
        if (enumMethodNames.has(fp))
          raiseConflictError.call(this, name, fp, { source: "another enum" });
        if (dangerousMethods.has(friendlyBang)) raiseConflictError.call(this, name, friendlyBang);
        if (enumMethodNames.has(friendlyBang))
          raiseConflictError.call(this, name, friendlyBang, { source: "another enum" });
      }
      if (scopes) {
        detectEnumConflictBang.call(this, name, valueMethodAlias, true);
        detectEnumConflictBang.call(this, name, notFriendlyName, true);
      }
    }

    methodsModule.defineEnumMethods(name, valueMethodName, value, scopes, instanceMethods);
    if (aliasIsNew) {
      methodsModule.defineEnumMethods(name, valueMethodAlias, value, scopes, instanceMethods);
    }

    const originalName = methodName(n);
    if (instanceMethods && /[^\w\x80-\uffff]/.test(originalName)) {
      const carrier = methodsModule.carrier();
      Object.defineProperty(carrier, `is${originalName}`, {
        value: function (this: Base) {
          return this.readAttribute(name) === n;
        },
        writable: true,
        configurable: true,
      });
      Object.defineProperty(carrier, `${originalName}Bang`, {
        value: function (this: EnumInstanceHost) {
          return this.updateBang({ [name]: value });
        },
        writable: true,
        configurable: true,
      });
    }

    if (instanceMethods) {
      const names = enumMethodNamesFor(valueMethodName);
      enumMethodNames.add(names.predicateName);
      enumMethodNames.add(names.bangName);
      if (aliasIsNew) {
        const valueMethodAliasNames = enumMethodNamesFor(valueMethodAlias);
        enumMethodNames.add(valueMethodAliasNames.predicateName);
        enumMethodNames.add(valueMethodAliasNames.bangName);
      }
    }
  }

  if (scopes) {
    detectNegativeEnumConditionsBang(valueMethodNames);
  }

  if (validate) {
    const validateOptions = typeof validate === "object" ? validate : {};
    this.validatesInclusionOf(name, { in: Object.keys(mapping), ...validateOptions });
  }

  const frozenMapping = Object.freeze({ ...mapping });
  Object.defineProperty(this, pluralize(name), {
    get() {
      return frozenMapping;
    },
    configurable: true,
  });
}

/** @internal */
const _enumMethodsModuleRegistry = new WeakMap<typeof import("./base.js").Base, EnumMethods>();

/**
 * @missingRailsCall include — PERMANENT
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
 * @missingRailsCall method_defined_within? — PERMANENT
 * @internal
 */
export function detectEnumConflictBang(
  this: typeof import("./base.js").Base,
  enumName: string,
  methodName: string,
  _klassMethod = false,
): void {
  if (_klassMethod) {
    if (isDangerousClassMethod(methodName)) {
      raiseConflictError.call(this, enumName, methodName, { type: "class" });
    }
    if (isRelationInstanceMethod(methodName)) {
      raiseConflictError.call(this, enumName, methodName, {
        type: "class",
        source: "ActiveRecord::Relation",
      });
    }
    if (methodName === "id") {
      raiseConflictError.call(this, enumName, methodName);
    }
    return;
  }
  if (isDangerousAttributeMethod.call(this as any, methodName)) {
    raiseConflictError.call(this, enumName, methodName);
  }
}

/** @internal */
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
 * Fetch the single registered EnumType for an enum attribute — the one source
 * of truth built lazily from the reflected column type via the
 * `decorateAttributes` decorator. Resolves through the replayed AttributeSet
 * (`_defaultAttributes`), NOT the pending `PendingType` the declaration pushed:
 * that type is the pre-reflection (mapping-shape-inferred) EnumType, whereas the
 * replayed decorator rebuilds the EnumType from the reflected column subtype.
 * Returns null when the attribute isn't an enum on this class.
 *
 * @internal
 * @noRailsEquivalent CONVERGEABLE reads the EnumType off the replayed attribute set the way Ruby reads attribute_types[name] (enum.rb:222-247).
 */
export function enumTypeOf(klass: typeof Base, attribute: string): EnumType | null {
  const host = klass as unknown as {
    _enums?: Map<string, unknown>;
    attributeAliases?: Record<string, string>;
    _defaultAttributes(): { getAttribute(n: string): { type: ValueType } };
  };
  reflectSchemaSync.call(klass);
  if (!host._enums?.has(attribute)) return null;
  const resolved = host.attributeAliases?.[attribute] ?? attribute;
  const type = host._defaultAttributes().getAttribute(resolved).type;
  return type instanceof EnumType ? type : null;
}

export function readEnumValue(record: Base, attribute: string): string | null {
  const ctor = record.constructor as typeof Base;
  const mapping = ctor._enums?.get(attribute);
  if (!mapping) return null;

  const stored = record.readAttribute(attribute);
  if (typeof stored === "string" && Object.prototype.hasOwnProperty.call(mapping, stored))
    return stored;
  return enumTypeOf(ctor, attribute)?.deserialize(stored) ?? null;
}

export function castEnumValue(
  modelClass: typeof Base,
  attribute: string,
  value: unknown,
): number | string | boolean | null {
  return enumTypeOf(modelClass, attribute)?.serialize(value) ?? null;
}

/** @internal */
export function assertValidEnumDefinitionValues(
  values: any,
): Record<string, string | number | boolean | null> | string[] {
  if (Array.isArray(values)) {
    if (values.length === 0) {
      throw new ArgumentError("Enum values must not be empty.");
    }
    const allValid =
      values.every((v) => typeof v === "string" && v.startsWith(":")) ||
      values.every((v) => typeof v === "string" && !v.startsWith(":"));
    if (!allValid) {
      throw new ArgumentError(
        `Enum values must only contain strings or symbols, got: ${Array.from(
          new Set(values.map((v) => typeof v)),
        ).join(", ")}`,
      );
    }
    if (values.some((v) => isBlank(v.startsWith(":") ? v.slice(1) : v))) {
      throw new ArgumentError("Enum values must not contain a blank name.");
    }
    return values;
  }

  if (isPlainHash(values)) {
    const keys = Object.keys(values as object);
    if (keys.length === 0) {
      throw new ArgumentError("Enum values must not be empty.");
    }
    if (keys.some((k) => isBlank(k.startsWith(":") ? k.slice(1) : k))) {
      throw new ArgumentError("Enum values must not contain a blank name.");
    }
    for (const k of keys) {
      const value = (values as Record<string, unknown>)[k];
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

function isPlainHash(value: unknown): boolean {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

/** @internal */
export function assertValidEnumOptions(options: unknown): void {
  if (!options || !isPlainHash(options)) return;

  const invalidKeys = ["_prefix", "_suffix", "_scopes", "_default", "_instance_methods"];
  const found = Object.keys(options).filter((k) => invalidKeys.includes(k));

  if (found.length > 0) {
    throw new ArgumentError(
      `invalid option(s): ${found.map((k) => `:${k}`).join(", ")}. Valid options are: :prefix, :suffix, :scopes, :default, :instance_methods, and :validate.`,
    );
  }
}

let _enumWarn: (msg: string) => void = (msg) => console.warn(msg);

/**
 * @internal
 * @noRailsEquivalent PERMANENT
 */
export function setEnumWarn(fn: (msg: string) => void): void {
  _enumWarn = fn;
}

/** @internal */
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
  if (methodName.startsWith("not") && methodName.length > 3) {
    const next = methodName.charAt(3);
    if (next !== next.toUpperCase() || next === next.toLowerCase()) return null;
    const rest = methodName.substring(3);
    return { prefix: "not", positiveForm: rest.charAt(0).toLowerCase() + rest.slice(1) };
  }
  return null;
}
