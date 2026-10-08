import { Scheme, type SchemeOptions } from "./scheme.js";
import { Configuration } from "./errors.js";
import { type ValueType } from "@blazetrails/activemodel";
import {
  classAttribute,
  extractOptionsBang,
  filterMap,
  included,
  kernelArray as Array,
} from "@blazetrails/activesupport";
import { Module, include } from "@blazetrails/ruby-compat";
import { initializeGeneratedModules } from "../attribute-methods.js";
import { EncryptedAttributeType } from "./encrypted-attribute-type.js";
import { Encryption } from "../encryption.js";

/**
 * Mirrors Rails' EncryptableRecord#global_previous_schemes_for.
 * Exported so encryption.ts (Base.encrypts path) can use the same logic.
 * Filters config.previousSchemes to those compatible with the given scheme
 * and merges each one so per-attribute settings (deterministic, downcase)
 * are preserved in the fallback scheme.
 *
 * @internal
 */
export function globalPreviousSchemesFor(scheme: Scheme): Scheme[] {
  return filterMap(Encryption.config.previousSchemes, (previousScheme) => {
    if (scheme.isCompatibleWith(previousScheme)) return scheme.merge(previousScheme);
  });
}

/** @internal */
function schemeFor(options: SchemeOptions): Scheme {
  const { previousSchemes: previous = [], ...rest } = options;
  const scheme = new Scheme(rest);
  scheme.previousSchemes = [...globalPreviousSchemesFor(scheme), ...previous];
  return scheme;
}

const ORIGINAL_ATTRIBUTE_PREFIX = "original_";

export class EncryptableRecord {
  static [included](base: any): void {
    classAttribute.call(base, "encryptedAttributes");

    base.validate(":cantModifyEncryptedAttributesWhenFrozen", {
      if: (record: any) =>
        hasEncryptedAttributes.call(record) && Encryption.context.frozenEncryption,
    });
  }

  /**
   * @internal
   * @noRailsEquivalent CONVERGEABLE encryption-preserve-original-column-check-waits-for-reflection
   */
  static requireOriginalColumnPresent(modelClass: any, name: string, colNames: string[]): void {
    if (Encryption.config.supportUnencryptedData) return;
    const originalName = `${ORIGINAL_ATTRIBUTE_PREFIX}${name}`;
    if (colNames.length === 0 || colNames.includes(originalName)) return;
    throw new Configuration(
      `To use :ignore_case for '${name}' you must create an additional column named '${originalName}'`,
    );
  }

  /**
   * @internal
   * @noRailsEquivalent CONVERGEABLE encryption-preserve-original-column-check-waits-for-reflection
   */
  static requireOriginalColumnsAfterReflection(
    modelClass: any,
    reflectedColumnNames: string[],
  ): void {
    const preserved: Set<string> | undefined = modelClass._ignoreCasePreservedAttributes;
    if (!preserved || preserved.size === 0) return;
    for (const name of preserved) {
      this.requireOriginalColumnPresent(modelClass, name, reflectedColumnNames);
    }
  }

  static loadSchemaBang(this: typeof EncryptableRecord, superFn: () => void): void {
    superFn();

    if (Encryption.config.validateColumnSize) {
      addLengthValidationForEncryptedColumns.call(this);
    }
  }
}

/** @internal */
export function addLengthValidationForEncryptedColumns(this: any): void {
  const attrs: Set<string> = this.encryptedAttributes ?? new Set<string>();
  for (const name of attrs) {
    validateColumnSize.call(this, name);
  }
}

/** @internal */
export function overrideAccessorsToPreserveOriginal(
  this: any,
  name: string,
  originalAttributeName: string,
): void {
  if (!Object.prototype.hasOwnProperty.call(this, "_generatedAttributeMethods")) {
    initializeGeneratedModules.call(this);
  }
  include(
    this,
    new Module((mod) => {
      mod.moduleEval((table) => {
        Object.defineProperty(table, name, {
          configurable: true,
          get(this: any) {
            const value = mod.superMethod(this, name)!();
            if (
              (value != null && value !== false && isEncryptedAttribute.call(this, name)) ||
              !Encryption.config.supportUnencryptedData
            ) {
              return this[originalAttributeName];
            } else {
              return value;
            }
          },
          set(this: any, value: unknown) {
            this[originalAttributeName] = value;
            mod.superMethod(this, `${name}=`)!(value);
          },
        });
      });
    }),
  );
}

/** @internal */
export function validateColumnSize(this: any, attributeName: string): void {
  const limit = this.columnsHash()[attributeName]?.limit;
  if (limit != null) {
    this.validatesLengthOf(attributeName, { maximum: limit });
  }
}

export function encrypts(this: any, ...names: unknown[]): void {
  const options: SchemeOptions = extractOptionsBang(names);
  this.encryptedAttributes ||= new Set<string>();

  for (const name of names as string[]) {
    encryptAttribute.call(this, name, options);
  }
}

export function deterministicEncryptedAttributes(this: any): string[] | undefined {
  return (
    Object.getOwnPropertyDescriptor(this, "_deterministicEncryptedAttributes")?.value ||
    (this._deterministicEncryptedAttributes =
      this.encryptedAttributes &&
      Array<string>(this.encryptedAttributes).filter(
        (attributeName) =>
          (this.typeForAttribute(attributeName) as EncryptedAttributeType).deterministic,
      ))
  );
}

export function sourceAttributeFromPreservedAttribute(
  this: unknown,
  attributeName: string,
): string | undefined {
  return attributeName.startsWith(ORIGINAL_ATTRIBUTE_PREFIX)
    ? attributeName.slice(ORIGINAL_ATTRIBUTE_PREFIX.length)
    : undefined;
}

/** @internal */
export function isEncryptedAttribute(this: any, attributeName: string): boolean {
  const name = this.constructor.attributeAliases?.[attributeName] ?? attributeName;
  if (!(this.constructor.encryptedAttributes ?? new Set<string>()).has(name)) return false;
  const type = this.constructor.typeForAttribute(name) as EncryptedAttributeType;
  return type.isEncrypted(this.readAttributeBeforeTypeCast?.(name));
}

/** @internal */
export function ciphertextFor(this: any, attributeName: string): unknown {
  attributeName = this.constructor.attributeAliases?.[attributeName] ?? attributeName;
  if (isEncryptedAttribute.call(this, attributeName)) {
    return this.readAttributeBeforeTypeCast?.(attributeName);
  }
  return this.readAttributeForDatabase(attributeName);
}

/** @internal */
export async function encrypt(this: any): Promise<boolean | undefined> {
  if (hasEncryptedAttributes.call(this)) {
    return await encryptAttributes.call(this);
  }
}

/** @internal */
export async function decrypt(this: any): Promise<boolean | undefined> {
  if (hasEncryptedAttributes.call(this)) {
    return await decryptAttributes.call(this);
  }
}

/** @internal */
export async function encryptAttributes(this: any): Promise<boolean> {
  validateEncryptionAllowed.call(this);

  return await this.updateColumns(buildEncryptAttributeAssignments.call(this));
}

/** @internal */
export async function decryptAttributes(this: any): Promise<boolean> {
  validateEncryptionAllowed.call(this);

  const decryptAttributeAssignments = buildDecryptAttributeAssignments.call(this);
  return await Encryption.withoutEncryption(() => this.updateColumns(decryptAttributeAssignments));
}

/** @internal */
export function validateEncryptionAllowed(this: any): void {
  if (Encryption.context.frozenEncryption) {
    throw new Configuration("can't be modified because it is encrypted");
  }
}

/** @internal */
export function hasEncryptedAttributes(this: any): boolean {
  return (this.constructor.encryptedAttributes ?? new Set<string>()).size > 0;
}

/** @internal */
export async function _createRecord(
  this: any,
  attributeNames: string[] | undefined,
  superFn: (attributeNames: string[]) => Promise<unknown>,
): Promise<unknown> {
  attributeNames ??= this.attributeNames();
  if (hasEncryptedAttributes.call(this)) {
    attributeNames = [
      ...new Set([...attributeNames!, ...[...this.constructor.encryptedAttributes].map(String)]),
    ];
  }
  return superFn(attributeNames!);
}

/** @internal */
export function buildEncryptAttributeAssignments(this: any): Record<string, unknown> {
  return Object.fromEntries(
    Array<string>(this.constructor.encryptedAttributes).map((attributeName) => [
      attributeName,
      this.readAttribute(attributeName),
    ]),
  );
}

/** @internal */
export function buildDecryptAttributeAssignments(this: any): Record<string, unknown> {
  return Object.fromEntries(
    Array<string>(this.constructor.encryptedAttributes).map((attributeName) => {
      const type = this.constructor.typeForAttribute(attributeName) as EncryptedAttributeType;
      const encryptedValue = ciphertextFor.call(this, attributeName);
      const newValue = type.deserialize(encryptedValue);
      return [attributeName, newValue];
    }),
  );
}

/** @internal */
export function encryptAttribute(this: any, name: string, options: SchemeOptions = {}): void {
  const modelClass = this;
  modelClass.encryptedAttributes.add(name);

  modelClass.decorateAttributes([name], (name: string, castType: ValueType) => {
    const scheme = schemeFor(options);

    return new EncryptedAttributeType({
      scheme,
      castType,
      default: modelClass.columnsHash()[name]?.default ?? undefined,
    });
  });

  if (options.ignoreCase) {
    preserveOriginalEncrypted.call(this, name);
  }

  Encryption.encryptedAttributeWasDeclared(this, name);
}

/**
 * @internal
 * @inventedArm add — CONVERGEABLE encryption-preserve-original-column-check-waits-for-reflection
 */
export function preserveOriginalEncrypted(this: any, name: string): void {
  const modelClass = this;
  const originalAttributeName = `${ORIGINAL_ATTRIBUTE_PREFIX}${name}`;
  modelClass._ignoreCasePreservedAttributes = new Set<string>(
    modelClass._ignoreCasePreservedAttributes,
  ).add(name);

  const columnNames: string[] = this.columnNames?.() ?? [];
  if (
    !Encryption.config.supportUnencryptedData &&
    columnNames.length !== 0 &&
    !columnNames.includes(originalAttributeName)
  ) {
    throw new Configuration(
      `To use :ignore_case for '${name}' you must create an additional column named '${originalAttributeName}'`,
    );
  }

  encrypts.call(this, originalAttributeName);
  overrideAccessorsToPreserveOriginal.call(this, name, originalAttributeName);
}

/** @internal */
export function cantModifyEncryptedAttributesWhenFrozen(this: any): void {
  for (const attribute of this.constructor.encryptedAttributes) {
    if (this.changedAttributes.include(attribute)) {
      this.errors.add(attribute, "can't be modified because it is encrypted");
    }
  }
}

Encryption.EncryptableRecord = EncryptableRecord;
