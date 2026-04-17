import { Scheme, type SchemeOptions } from "./scheme.js";
import { EncryptedAttributeType } from "./encrypted-attribute-type.js";
import { Configurable } from "./configurable.js";

/**
 * Provides the `encrypts` declaration for model classes, enabling
 * transparent attribute encryption/decryption. This is wired into
 * Base.encrypts() via the encryption.ts module.
 *
 * Mirrors: ActiveRecord::Encryption::EncryptableRecord
 *
 * Usage:
 *   EncryptableRecord.encrypts(User, "email", { deterministic: true })
 */
export class EncryptableRecord {
  /**
   * Declare that attributes should be encrypted. Registers an
   * EncryptedAttributeType for each named attribute directly into
   * _attributeDefinitions and notifies Configurable listeners.
   */
  static encrypts(modelClass: any, ...namesAndOptions: unknown[]): void {
    let options: SchemeOptions = {};
    const names: string[] = [];

    for (const arg of namesAndOptions) {
      if (typeof arg === "string") {
        names.push(arg);
      } else if (typeof arg === "object" && arg !== null) {
        options = arg as SchemeOptions;
      }
    }

    const scheme = new Scheme(options);

    if (!modelClass._encryptedAttributes) {
      modelClass._encryptedAttributes = new Set<string>();
    }

    for (const name of names) {
      modelClass._encryptedAttributes.add(name);

      // Get existing cast type from attribute definitions if available.
      // If already encrypted, unwrap to avoid double-encryption.
      const existingDef = modelClass._attributeDefinitions?.get?.(name);
      let castType = existingDef?.type;
      if (castType instanceof EncryptedAttributeType) {
        castType = castType.castType;
      }

      const encryptedType = new EncryptedAttributeType({
        scheme,
        castType,
      });

      // Register directly into _attributeDefinitions (not via attribute()
      // which expects a string type name)
      if (modelClass._attributeDefinitions?.set) {
        modelClass._attributeDefinitions.set(name, {
          name,
          type: encryptedType,
          defaultValue: existingDef?.defaultValue ?? null,
          // When there's no pre-existing def, this encryption placeholder is
          // waiting for schema reflection to supply the real cast type.
          // Mark it schema-sourced so loadSchemaFromAdapter can wrap the
          // adapter-resolved type (applyPendingEncryptions re-runs after).
          userProvided: existingDef?.userProvided ?? false,
          source: existingDef?.source ?? "schema",
        });
      }

      Configurable.encryptedAttributeWasDeclared(modelClass, name);
    }
  }

  static hasEncryptedAttributes(modelClass: any): boolean {
    return (modelClass._encryptedAttributes?.size ?? 0) > 0;
  }

  static encryptedAttributes(modelClass: any): Set<string> {
    return modelClass._encryptedAttributes ?? new Set();
  }

  static deterministicEncryptedAttributes(modelClass: any): Set<string> {
    const result = new Set<string>();
    for (const name of this.encryptedAttributes(modelClass)) {
      const type = getAttributeType(modelClass, name);
      if (type instanceof EncryptedAttributeType && type.deterministic) {
        result.add(name);
      }
    }
    return result;
  }
}

/**
 * Get the attribute type from a model class's _attributeDefinitions.
 */
export function getAttributeType(klass: any, name: string): unknown {
  const def = klass._attributeDefinitions?.get?.(name);
  return def?.type;
}
