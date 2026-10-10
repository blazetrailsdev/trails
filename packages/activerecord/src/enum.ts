import type { Base } from "./base.js";
import {
  HashWithIndifferentAccess,
  camelize,
  deepDup,
  underscore,
  isBlank,
  isPlainObject,
  pluralize,
  presence,
  upcaseFirst,
} from "@blazetrails/activesupport";
import { ArgumentError, RuntimeError, ValueType, defaultValue } from "@blazetrails/activemodel";
import {
  Module,
  include,
  rbInspect,
  rbModDefineMethod,
  registerConstant,
  toS,
} from "@blazetrails/ruby-compat";
import {
  isDangerousAttributeMethod,
  isDangerousClassMethod,
  isMethodDefinedWithin,
} from "./attribute-methods.js";
import { ActiveRecord } from "./namespaces.js";
import { isReplayingOverColdSchema } from "./attributes.js";

type EnumValue = number | string | boolean | null;

interface EnumInstanceHost {
  updateBang(attrs: Record<string, unknown>): Promise<true | undefined>;
  readAttribute(name: string): unknown;
  readAttributeForDatabase(name: string): unknown;
  writeAttribute(name: string, value: unknown): void;
}

export class EnumType extends ValueType<string> {
  /** @internal */
  readonly name: string;
  private _mapping: HashWithIndifferentAccess<EnumValue>;
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
    this._subtypeType = subtype;
    this._raiseOnInvalidValues = raiseOnInvalidValues;
  }

  override type(): string | undefined {
    return this.subtype.type();
  }

  get subtype(): ValueType<unknown> {
    return this._subtypeType;
  }

  cast(value: unknown): string | null {
    if (this._mapping.hasKey(value as string)) {
      return toS(value);
    } else if (this._mapping.hasValue(value)) {
      return this._mapping.key(value);
    } else {
      return (presence(value) ?? null) as string | null;
    }
  }

  deserialize(value: unknown): string | null {
    return this._mapping.key(this._subtypeType.deserialize(value));
  }

  serialize(value: unknown): number | string | boolean | null {
    return this._subtypeType.serialize(this._mapping.fetch(value as string, value as EnumValue)) as
      | number
      | string
      | boolean
      | null;
  }

  isSerializable(value: unknown, block?: (castValue: unknown) => void): boolean {
    return this._subtypeType.isSerializable(
      this._mapping.fetch(value as string, value as EnumValue),
      block,
    );
  }

  assertValidValue(value: unknown): void {
    if (!this._raiseOnInvalidValues) return;

    if (
      !(isBlank(value) || this._mapping.hasKey(value as string) || this._mapping.hasValue(value))
    ) {
      throw new ArgumentError(`'${value}' is not a valid ${this.name}`);
    }
  }

  /** @internal */
  get mapping(): HashWithIndifferentAccess<EnumValue> {
    return this._mapping;
  }
}

function enumMethodNamesFor(valueMethodName: string): {
  predicateName: string;
  bangName: string;
  scopeName: string;
  notScopeName: string;
} {
  const scopeName = camelize(valueMethodName, false);
  return {
    predicateName: `is${upcaseFirst(scopeName)}`,
    bangName: `${scopeName}Bang`,
    scopeName,
    notScopeName: `not${upcaseFirst(scopeName)}`,
  };
}

export class EnumMethods extends Module {
  private _klass: typeof import("./base.js").Base;

  constructor(klass: typeof import("./base.js").Base) {
    super();
    this._klass = klass;
  }

  /** @internal */
  get klass(): typeof import("./base.js").Base {
    return this._klass;
  }

  /** @internal */
  defineEnumMethods(
    name: string,
    valueMethodName: string,
    value: EnumValue,
    scopes: boolean,
    instanceMethods: boolean,
  ): void {
    const klass = this.klass;
    const { predicateName, bangName, scopeName, notScopeName } =
      enumMethodNamesFor(valueMethodName);
    if (instanceMethods) {
      klass.detectEnumConflictBang(name, predicateName);
      this.defineMethod(predicateName, function (this: EnumInstanceHost) {
        return (this as unknown as Record<string, unknown>)[`${name}ForDatabase`] === value;
      });

      klass.detectEnumConflictBang(name, bangName);
      this.defineMethod(bangName, function (this: EnumInstanceHost) {
        return this.updateBang({ [name]: value });
      });
    }

    if (scopes) {
      klass.detectEnumConflictBang(name, scopeName, true);
      klass.scope(scopeName, function (this: any) {
        return this.where({ [name]: value });
      });

      klass.detectEnumConflictBang(name, notScopeName, true);
      klass.scope(notScopeName, function (this: any) {
        return this.where().not({ [name]: value });
      });
    }
  }
}

export interface EnumMacroOptions {
  prefix?: boolean | string | null;
  suffix?: boolean | string | null;
  scopes?: boolean;
  instanceMethods?: boolean;
  validate?: boolean | Record<string, unknown>;
  default?: unknown;
}

function enumMethod(
  this: typeof Base,
  name: string,
  values: string[] | Record<string, EnumValue>,
  options?: EnumMacroOptions,
): void {
  if (values == null || (values as unknown) === false) {
    [values, options] = [(options ?? {}) as Record<string, EnumValue>, {}];
  }
  _enum.call(this, name, values, options);
}

export { enumMethod as enum };

/**
 * @internal
 * @inventedArm if — PERMANENT
 */
export function _enum(
  this: typeof import("./base.js").Base,
  name: string,
  values: string[] | Record<string, EnumValue>,
  {
    prefix = null,
    suffix = null,
    scopes = true,
    instanceMethods = true,
    validate = false,
    ...options
  }: EnumMacroOptions = {},
): void {
  assertValidEnumDefinitionValues(values);
  assertValidEnumOptions(options);

  const enumValues = new HashWithIndifferentAccess<EnumValue>();
  name = toS(name);

  this.detectEnumConflictBang(name, pluralize(name), true);
  rbModDefineMethod({ prototype: this }, pluralize(name), {
    get() {
      return enumValues;
    },
  });
  if (!Object.prototype.hasOwnProperty.call(this, "__class_attr_definedEnums")) {
    this.definedEnums = deepDup(this.definedEnums);
  }
  this.definedEnums[name] = enumValues;

  this.detectEnumConflictBang(name, name);
  this.detectEnumConflictBang(name, `${name}=`);

  this.attribute(name, options);

  this.decorateAttributes([name], (_name: string, subtype: ValueType | null) => {
    if (subtype === defaultValue() && !isReplayingOverColdSchema()) {
      throw new RuntimeError(
        `Undeclared attribute type for enum '${name}' in ${this.name}. Enums must be` +
          " backed by a database column or declared with an explicit type" +
          " via `attribute`.",
      );
    }

    if (subtype instanceof EnumType) subtype = subtype.subtype;
    return new EnumType(name, enumValues, subtype!, !validate);
  });

  const valueMethodNames: string[] = [];
  this._enumMethodsModule().moduleEval(() => {
    prefix =
      prefix != null && prefix !== false
        ? prefix === true
          ? `${underscore(name)}_`
          : `${underscore(prefix)}_`
        : null;

    suffix =
      suffix != null && suffix !== false
        ? suffix === true
          ? `_${underscore(name)}`
          : `_${underscore(suffix)}`
        : null;

    const pairs: [string, EnumValue][] = !Array.isArray(values)
      ? Object.entries(values)
      : values.map((label, value) => [label, value]);
    // eslint-disable-next-line prefer-const
    for (let [label, value] of pairs) {
      enumValues.set(label, value);
      label = toS(label);

      const valueMethodName = `${prefix ?? ""}${label}${suffix ?? ""}`;
      valueMethodNames.push(valueMethodName);
      this._enumMethodsModule().defineEnumMethods(
        name,
        valueMethodName,
        value,
        scopes,
        instanceMethods,
      );

      const methodFriendlyLabel = label.replace(/[^\w\x80-￿]+/g, "_");
      const valueMethodAlias = `${prefix ?? ""}${methodFriendlyLabel}${suffix ?? ""}`;

      if (valueMethodAlias !== valueMethodName && !valueMethodNames.includes(valueMethodAlias)) {
        valueMethodNames.push(valueMethodAlias);
        this._enumMethodsModule().defineEnumMethods(
          name,
          valueMethodAlias,
          value,
          scopes,
          instanceMethods,
        );
      }
    }
  });
  if (scopes) this.detectNegativeEnumConditionsBang(valueMethodNames);

  if (validate) {
    if (!isPlainObject(validate)) validate = {};
    this.validatesInclusionOf(name, { in: enumValues.keys(), ...(validate as object) });
  }

  enumValues.freeze();
}

/** @internal */
const _enumMethodsModuleRegistry = new WeakMap<typeof import("./base.js").Base, EnumMethods>();

/** @internal */
export function _enumMethodsModule(this: typeof import("./base.js").Base): EnumMethods {
  let enumMethodsModule = _enumMethodsModuleRegistry.get(this);
  enumMethodsModule ??= (() => {
    const mod = new EnumMethods(this);
    include(this as unknown as new (...args: unknown[]) => unknown, mod);
    _enumMethodsModuleRegistry.set(this, mod);
    return mod;
  })();
  return enumMethodsModule;
}

/** @internal */
export function detectEnumConflictBang(
  this: typeof import("./base.js").Base,
  enumName: string,
  methodName: string,
  klassMethod = false,
): void {
  if (klassMethod && isDangerousClassMethod.call(this, methodName)) {
    raiseConflictError.call(this, enumName, methodName, { type: "class" });
  } else if (klassMethod && isMethodDefinedWithin.call(this, methodName, ActiveRecord.Relation)) {
    raiseConflictError.call(this, enumName, methodName, {
      type: "class",
      source: "ActiveRecord::Relation",
    });
  } else if (klassMethod && methodName === "id") {
    raiseConflictError.call(this, enumName, methodName);
  } else if (!klassMethod && isDangerousAttributeMethod.call(this as any, methodName)) {
    raiseConflictError.call(this, enumName, methodName);
  } else if (
    !klassMethod &&
    isMethodDefinedWithin.call(this, methodName, this._enumMethodsModule(), Module)
  ) {
    raiseConflictError.call(this, enumName, methodName, { source: "another enum" });
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

/** @internal */
export function assertValidEnumDefinitionValues(
  values: any,
): Record<string, string | number | boolean | null> | string[] {
  if (isPlainHash(values)) {
    const keys = Object.keys(values as object);
    if (keys.length === 0) {
      throw new ArgumentError(`Enum values ${rbInspect(values)} must not be empty.`);
    }
    if (keys.some((k) => isBlank(toS(k)))) {
      throw new ArgumentError(`Enum values ${rbInspect(values)} must not contain a blank name.`);
    }
    return values;
  }

  if (Array.isArray(values)) {
    if (values.length === 0) {
      throw new ArgumentError(`Enum values ${rbInspect(values)} must not be empty.`);
    }
    const allValid =
      values.every((v) => typeof v === "string" && v.startsWith(":")) ||
      values.every((v) => typeof v === "string" && !v.startsWith(":"));
    if (!allValid) {
      throw new ArgumentError(
        `Enum values ${rbInspect(values)} must only contain symbols or strings.`,
      );
    }
    if (values.some((v) => isBlank(toS(v)))) {
      throw new ArgumentError(`Enum values ${rbInspect(values)} must not contain a blank name.`);
    }
    return values;
  }

  throw new ArgumentError(
    `Enum values ${rbInspect(values)} must be either a non-empty hash or an array.`,
  );
}

function isPlainHash(value: unknown): boolean {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

/** @internal */
export function assertValidEnumOptions(options: object): void {
  const invalidKeys = Object.keys(options).filter((key) =>
    ["_prefix", "_suffix", "_scopes", "_default", "_instance_methods"].includes(key),
  );
  if (invalidKeys.length > 0) {
    throw new ArgumentError(
      `invalid option(s): ${invalidKeys.map((k) => `:${k}`).join(", ")}. Valid options are: :prefix, :suffix, :scopes, :default, :instance_methods, and :validate.`,
    );
  }
}

/** @internal */
export function detectNegativeEnumConditionsBang(
  this: typeof import("./base.js").Base,
  methodNames: string[],
): void {
  if (this.logger == null) return;

  for (const potentialNot of methodNames.filter((m) => m.startsWith("not_"))) {
    const invertedForm = potentialNot.replace("not_", "");
    if (methodNames.includes(invertedForm)) {
      this.logger.warn(
        `Enum element '${potentialNot}' in ${this.name} uses the prefix 'not_'.` +
          " This has caused a conflict with auto generated negative scopes." +
          " Avoid using enum elements starting with 'not' where the positive form is also an element.",
      );
    }
  }
}

registerConstant("ActiveRecord::Enum::EnumType", EnumType);
