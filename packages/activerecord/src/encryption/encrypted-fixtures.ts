/**
 * Encrypted fixtures — support for encrypted attributes in fixtures.
 *
 * Mirrors: ActiveRecord::Encryption::EncryptedFixtures
 */

import { EncryptableRecord } from "./encryptable-record.js";

/**
 * Encrypts fixture data for model classes that use encrypted attributes.
 * Iterates all encrypted attributes declared on the model class, encrypts
 * their values in the fixture, and also processes preserved-original columns.
 *
 * Mirrors: ActiveRecord::Encryption::EncryptedFixtures
 */
export class EncryptedFixtures {
  readonly fixture: Record<string, unknown>;
  private _cleanValues: Record<string, unknown> = Object.create(null) as Record<string, unknown>;

  constructor(fixture: Record<string, unknown>, modelClass: any) {
    this.fixture = { ...fixture };
    this._encryptFixtureData(this.fixture, modelClass);
    this._processPreservedOriginalColumns(this.fixture, modelClass);
  }

  private _encryptFixtureData(fixture: Record<string, unknown>, modelClass: any): void {
    const encryptedAttrs: Set<string> = modelClass?._encryptedAttributes ?? new Set();
    for (const attr of encryptedAttrs) {
      const attrStr = String(attr);
      if (Object.prototype.hasOwnProperty.call(fixture, attrStr)) {
        this._cleanValues[attrStr] = fixture[attrStr];
        const type = modelClass?._attributeDefinitions?.get?.(attrStr)?.type;
        if (type?.serialize) {
          fixture[attrStr] = type.serialize(fixture[attrStr]);
        }
      }
    }
  }

  private _processPreservedOriginalColumns(
    fixture: Record<string, unknown>,
    modelClass: any,
  ): void {
    const encryptedAttrs: Set<string> = modelClass?._encryptedAttributes ?? new Set();
    for (const attr of encryptedAttrs) {
      const sourceAttr = EncryptableRecord.sourceAttributeFromPreservedAttribute(String(attr));
      if (sourceAttr !== undefined) {
        const cleanValue = this._cleanValues[sourceAttr];
        if (cleanValue !== undefined) {
          const type = modelClass?._attributeDefinitions?.get?.(String(attr))?.type;
          if (type?.serialize) {
            fixture[String(attr)] = type.serialize(cleanValue);
          }
        }
      }
    }
  }
}

/** @deprecated Use EncryptedFixtures class instead */
export function encryptFixtureData(
  data: Record<string, unknown>,
  encryptedAttributes: string[],
  encrypt: (value: unknown) => unknown,
): Record<string, unknown> {
  const result = { ...data };
  for (const attr of encryptedAttributes) {
    if (attr in result) {
      result[attr] = encrypt(result[attr]);
    }
  }
  return result;
}
