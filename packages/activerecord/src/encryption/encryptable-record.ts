import { Scheme, type SchemeOptions } from "./scheme.js";
import { Contexts } from "./contexts.js";
import { Configuration } from "./errors.js";
import { type ValueType } from "@blazetrails/activemodel";
import { EncryptedAttributeType } from "./encrypted-attribute-type.js";
import { Configurable } from "./configurable.js";
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

const ORIGINAL_ATTRIBUTE_PREFIX = "original_";

export class EncryptableRecord {
  static sourceAttributeFromPreservedAttribute(attributeName: string): string | undefined {
    return attributeName.startsWith(ORIGINAL_ATTRIBUTE_PREFIX)
      ? attributeName.slice(ORIGINAL_ATTRIBUTE_PREFIX.length)
      : undefined;
  }

  /**
   * Raise when a preserved (`ignore_case`) attribute's `original_<name>` column
   * is absent and `supportUnencryptedData` is false — mirrors Rails
   * encryptable_record.rb:101–103. Checked at declaration time against the
   * columns known then. Rails' `column_names` forces a schema load so the set is
   * always complete; ours can be empty at Base.encrypts static-init (the adapter
   * isn't connected yet), so an empty list means "unknown" and we defer rather
   * than raise a false positive — the same fail-open-when-unknown behavior the
   * scheme-based path shipped with.
   * @internal
   * @noRailsEquivalent CONVERGEABLE the missing-original-column raise of encrypts (encryption/encryptable_record.rb:101-103), split out for the deferred re-check.
   */
  static requireOriginalColumnPresent(modelClass: any, name: string, colNames: string[]): void {
    if (Configurable.config.supportUnencryptedData) return;
    const originalName = `${ORIGINAL_ATTRIBUTE_PREFIX}${name}`;
    if (colNames.length === 0 || colNames.includes(originalName)) return;
    throw new Configuration(
      `To use :ignore_case for '${name}' you must create an additional column named '${originalName}'`,
    );
  }

  /**
   * Re-run the `original_<name>` missing-column requirement for every
   * ignoreCase-preserved attribute against the authoritative column set
   * reflected from the real adapter schema. Driven from schema reflection
   * (`applyColumnsHash`), which runs only once the DB columns are known — so
   * unlike the eager `columnNames()` partial-load path, `reflectedColumnNames`
   * distinguishes "schema reflected, column absent" (fail-closed, raise) from
   * "declaration in progress" (never reaches here). Mirrors Rails' fail-closed
   * `preserve_original_encrypted`, whose `column_names` is always complete.
   * @internal
   * @noRailsEquivalent CONVERGEABLE re-runs that same raise once the schema is reflected (encryption/encryptable_record.rb:101-103); Ruby's column_names is always complete.
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
    originalAttributeName: string,
  ): void {
    if (typeof modelClass.beforeSave === "function") {
      modelClass.beforeSave((record: any) => {
        const isNew =
          typeof record.isNewRecord === "function" ? record.isNewRecord() : !record.isPersisted?.();
        const changed: string[] = Array.isArray(record.changedAttributeNamesToSave)
          ? record.changedAttributeNamesToSave
          : [];
        if (!isNew && !changed.includes(name)) return;
        record.writeAttribute(originalAttributeName, record.readAttribute(name));
      });
    }
    Object.defineProperty(modelClass.prototype, name, {
      configurable: true,
      get(this: any) {
        const originalValue = this.readAttribute(originalAttributeName);
        if (originalValue != null) return originalValue;
        return this.readAttribute(name);
      },
      set(this: any, value: unknown) {
        this.writeAttribute(name, value);
        this.writeAttribute(originalAttributeName, value);
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
    throw new Configuration("can't be modified because it is encrypted");
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

  const columnNames: string[] = this.columnNames?.() ?? [];
  if (
    !Configurable.config.supportUnencryptedData &&
    columnNames.length !== 0 &&
    !columnNames.includes(originalAttributeName)
  ) {
    throw new Configuration(
      `To use :ignore_case for '${name}' you must create an additional column named '${originalAttributeName}'`,
    );
  }

  encrypts.call(this, originalAttributeName);
  EncryptableRecord.overrideAccessorsToPreserveOriginal(this, name, originalAttributeName);
}

/** @noRailsEquivalent CONVERGEABLE port-type-serialized-as-a-delegate-class */
export function encryptedTypeOf(type: unknown): EncryptedAttributeType | undefined {
  let current: any = type;
  while (current) {
    if (current instanceof EncryptedAttributeType) return current;
    current = current.subtype ?? current.castType;
  }
  return undefined;
}

registerLoadSchemaOverride(313, EncryptableRecord.loadSchemaBang as never);
