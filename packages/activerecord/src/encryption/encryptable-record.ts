import { Scheme, type SchemeOptions } from "./scheme.js";
import { Contexts } from "./contexts.js";
import { Configuration as ConfigurationError } from "./errors.js";
import { type Type } from "@blazetrails/activemodel";
import { EncryptedAttributeType } from "./encrypted-attribute-type.js";
import { Configurable } from "./configurable.js";
import { encryptionHooks } from "../encryption-hooks.js";
import { registerLoadSchemaOverride } from "../load-schema-overrides-slot.js";

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
  return Configurable.config.previousSchemes
    .filter((previousScheme) => scheme.isCompatibleWith(previousScheme))
    .map((previousScheme) => scheme.merge(previousScheme));
}

/** @internal */
function schemeFor(options: SchemeOptions): Scheme {
  const { previousSchemes: previous = [], ...rest } = options;
  const scheme = new Scheme(rest);
  scheme.previousSchemes = [...globalPreviousSchemesFor(scheme), ...previous];
  return scheme;
}

interface PendingEncryption {
  name: string;
  readonly scheme: Scheme;
}

const ORIGINAL_ATTRIBUTE_PREFIX = "original_";

export class EncryptableRecord {
  static sourceAttributeFromPreservedAttribute(attributeName: string): string | undefined {
    return attributeName.startsWith(ORIGINAL_ATTRIBUTE_PREFIX)
      ? attributeName.slice(ORIGINAL_ATTRIBUTE_PREFIX.length)
      : undefined;
  }

  /**
   * @internal
   * @noRailsEquivalent CONVERGEABLE
   */
  static registerPendingEncryption(modelClass: any, pending: PendingEncryption): void {
    if (!Object.prototype.hasOwnProperty.call(modelClass, "_pendingEncryptions")) {
      modelClass._pendingEncryptions = [...(modelClass._pendingEncryptions ?? [])];
    }
    modelClass._pendingEncryptions.push(pending);
  }

  /**
   * @internal
   * @noRailsEquivalent CONVERGEABLE
   */
  static pushEncryptionDecorator(modelClass: any, name: string, pending: PendingEncryption): void {
    modelClass.decorateAttributes([name], (attrName: string, castType: Type) => {
      return new EncryptedAttributeType({
        scheme: pending.scheme,
        castType,
        default: modelClass.columnsHash()[attrName]?.default ?? undefined,
      });
    });
  }

  /**
   * @internal
   * @noRailsEquivalent CONVERGEABLE
   */
  static requireOriginalColumnPresent(modelClass: any, name: string, colNames: string[]): void {
    if (Configurable.config.supportUnencryptedData) return;
    const originalName = `${ORIGINAL_ATTRIBUTE_PREFIX}${name}`;
    if (colNames.length === 0 || colNames.includes(originalName)) return;
    throw new ConfigurationError(
      `To use :ignore_case for '${name}' you must create an additional column named '${originalName}'`,
    );
  }

  /**
   * @internal
   * @noRailsEquivalent CONVERGEABLE
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

  /**
   * @internal
   * @missingRailsCall encrypted_attribute? — PERMANENT
   * @missingRailsCall include — PERMANENT
   */
  static overrideAccessorsToPreserveOriginal(
    modelClass: any,
    name: string,
    originalName: string,
  ): void {
    if (typeof modelClass.beforeSave === "function") {
      modelClass.beforeSave((record: any) => {
        const isNew =
          typeof record.isNewRecord === "function" ? record.isNewRecord() : !record.isPersisted?.();
        const changed: string[] = Array.isArray(record.changedAttributeNamesToSave)
          ? record.changedAttributeNamesToSave
          : [];
        if (!isNew && !changed.includes(name)) return;
        record.writeAttribute(originalName, record.readAttribute(name));
      });
    }
    Object.defineProperty(modelClass.prototype, name, {
      configurable: true,
      get(this: any) {
        const originalValue = this.readAttribute(originalName);
        if (originalValue != null) return originalValue;
        return this.readAttribute(name);
      },
      set(this: any, value: unknown) {
        this.writeAttribute(name, value);
        this.writeAttribute(originalName, value);
      },
    });
  }

  static loadSchemaBang(this: typeof EncryptableRecord, superFn: () => void): void {
    superFn();

    if (Configurable.config.validateColumnSize) {
      EncryptableRecord.addLengthValidationForEncryptedColumns(this);
    }
  }

  /** @internal */
  static addLengthValidationForEncryptedColumns(modelClass: any): void {
    const attrs: Set<string> = modelClass.encryptedAttributes ?? new Set<string>();
    for (const name of attrs) {
      validateColumnSize.call(modelClass, name);
    }
  }

  /** @internal */
  static _createRecord(record: any, attributeNames?: string[]): unknown {
    const names =
      attributeNames ??
      (typeof record.attributeNames === "function" ? record.attributeNames() : []);
    const encryptedAttrs: Set<string> = record.constructor.encryptedAttributes ?? new Set<string>();
    const merged = [...new Set<string>([...names, ...[...encryptedAttrs].map(String)])];
    return record._createRecord?.(merged);
  }

  /** @internal */
  static cantModifyEncryptedAttributesWhenFrozen(record: any): void {
    const klass = record.constructor;
    const encryptedAttrs: Set<string> = klass.encryptedAttributes ?? new Set();
    const changed: string[] = Array.isArray(record.changedAttributeNamesToSave)
      ? record.changedAttributeNamesToSave
      : [];
    for (const attr of changed) {
      if (encryptedAttrs.has(attr)) {
        record.errors?.add?.(attr, "can't be modified because it is encrypted");
      }
    }
  }
}

/** @internal */
export function validateColumnSize(this: any, attributeName: string): void {
  const limit = this.columnsHash()[attributeName]?.limit;
  if (limit != null) {
    this.validatesLengthOf(attributeName, { maximum: limit });
  }
}

export function encrypts(this: any, ...namesAndOptions: unknown[]): void {
  let options: SchemeOptions = {};
  const names: string[] = [];

  for (const arg of namesAndOptions) {
    if (typeof arg === "string") {
      names.push(arg);
    } else if (typeof arg === "object" && arg !== null) {
      options = arg as SchemeOptions;
    }
  }

  this.encryptedAttributes ??= new Set<string>();

  for (const name of names) {
    encryptAttribute.call(this, name, options);
  }
}

export function deterministicEncryptedAttributes(this: any): Set<string> {
  if (Object.prototype.hasOwnProperty.call(this, "_deterministicEncryptedAttributes")) {
    return this._deterministicEncryptedAttributes;
  }
  const result = new Set<string>();
  for (const attributeName of this.encryptedAttributes ?? new Set<string>()) {
    const type = encryptedTypeOf(this.typeForAttribute(attributeName));
    if (type?.deterministic) {
      result.add(attributeName);
    }
  }
  this._deterministicEncryptedAttributes = result;
  return result;
}

/** @internal */
export function encryptedAttribute(this: any, attributeName: string): boolean {
  const name = this.constructor.attributeAliases?.[attributeName] ?? attributeName;
  if (!(this.constructor.encryptedAttributes ?? new Set<string>()).has(name)) return false;
  const type = encryptedTypeOf(this.constructor.typeForAttribute(name));
  if (!type) return false;
  return type.isEncrypted(this.readAttributeBeforeTypeCast?.(name));
}

/** @internal */
export function ciphertextFor(this: any, attributeName: string): unknown {
  attributeName = this.constructor.attributeAliases?.[attributeName] ?? attributeName;
  if (encryptedAttribute.call(this, attributeName)) {
    return this.readAttributeBeforeTypeCast?.(attributeName);
  }
  return this.readAttributeForDatabase(attributeName);
}

/** @internal */
export async function encrypt(this: any): Promise<void> {
  if (hasEncryptedAttributes.call(this)) {
    await encryptAttributes.call(this);
  }
}

/** @internal */
export async function decrypt(this: any): Promise<void> {
  if (hasEncryptedAttributes.call(this)) {
    await decryptAttributes.call(this);
  }
}

/** @internal */
export async function encryptAttributes(this: any): Promise<void> {
  validateEncryptionAllowed.call(this);

  await this.updateColumns(buildEncryptAttributeAssignments.call(this));
}

/** @internal */
export async function decryptAttributes(this: any): Promise<void> {
  validateEncryptionAllowed.call(this);

  const decryptAttributeAssignments = buildDecryptAttributeAssignments.call(this);
  await Contexts.withoutEncryption(() => this.updateColumns(decryptAttributeAssignments));
}

/** @internal */
export function validateEncryptionAllowed(this: any): void {
  if (Contexts.context.frozenEncryption) {
    throw new ConfigurationError("can't be modified because it is encrypted");
  }
}

/** @internal */
export function hasEncryptedAttributes(this: any): boolean {
  return (this.constructor.encryptedAttributes ?? new Set<string>()).size > 0;
}

/** @internal */
export function buildEncryptAttributeAssignments(this: any): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const attributeName of this.constructor.encryptedAttributes ?? new Set<string>()) {
    result[attributeName] =
      typeof this.readAttribute === "function"
        ? this.readAttribute(attributeName)
        : this[attributeName];
  }
  return result;
}

/** @internal */
export function buildDecryptAttributeAssignments(this: any): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const attributeName of this.constructor.encryptedAttributes ?? new Set<string>()) {
    const type = this.constructor.typeForAttribute(attributeName) as {
      deserialize: (v: unknown) => unknown;
    };
    const encryptedValue = ciphertextFor.call(this, attributeName);
    result[attributeName] = type.deserialize(encryptedValue);
  }
  return result;
}

/** @internal */
export function encryptAttribute(this: any, name: string, options: SchemeOptions = {}): void {
  const modelClass = this;
  modelClass.encryptedAttributes.add(name);
  delete modelClass._deterministicEncryptedAttributes;

  const pending: PendingEncryption = {
    name,
    get scheme(): Scheme {
      return schemeFor(options);
    },
  };

  EncryptableRecord.registerPendingEncryption(this, pending);
  EncryptableRecord.pushEncryptionDecorator(this, name, pending);
  encryptionHooks.applyPendingEncryptions(modelClass);

  if (options.ignoreCase) {
    preserveOriginalEncrypted.call(this, name);
  }

  Configurable.encryptedAttributeWasDeclared(this, name);
}

/** @internal */
export function preserveOriginalEncrypted(this: any, name: string): void {
  const modelClass = this;
  const originalAttributeName = `${ORIGINAL_ATTRIBUTE_PREFIX}${name}`;
  if (!Object.prototype.hasOwnProperty.call(modelClass, "_ignoreCasePreservedAttributes")) {
    modelClass._ignoreCasePreservedAttributes = new Set<string>(
      modelClass._ignoreCasePreservedAttributes ?? [],
    );
  }
  modelClass._ignoreCasePreservedAttributes.add(name);

  EncryptableRecord.requireOriginalColumnPresent(this, name, this.columnNames?.() ?? []);

  encrypts.call(this, originalAttributeName);
  EncryptableRecord.overrideAccessorsToPreserveOriginal(this, name, originalAttributeName);
}

export function encryptedTypeOf(type: unknown): EncryptedAttributeType | undefined {
  let current: any = type;
  while (current) {
    if (current instanceof EncryptedAttributeType) return current;
    current = current.subtype ?? current.castType;
  }
  return undefined;
}

registerLoadSchemaOverride(313, EncryptableRecord.loadSchemaBang as never);
