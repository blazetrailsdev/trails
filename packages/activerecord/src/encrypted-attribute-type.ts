import { Type } from "@blazetrails/activemodel";
import type { Encryptor } from "./encryption.js";

/**
 * Type decorator that transparently encrypts/decrypts attribute values.
 *
 * Mirrors: ActiveRecord::Encryption::EncryptedAttributeType
 *
 * Wraps an existing type. Values are stored encrypted (serialize → encrypt),
 * and decrypted on read (deserialize → decrypt). The inner type handles
 * normal casting; this layer adds the encryption envelope.
 */
export class EncryptedAttributeType extends Type<unknown> {
  readonly name: string;
  readonly innerType: Type;
  private readonly encryptor: Encryptor;

  constructor(innerType: Type, encryptor: Encryptor) {
    super();
    this.innerType = innerType;
    this.encryptor = encryptor;
    this.name = innerType.name;
  }

  /**
   * Return a fresh EncryptedAttributeType wrapping `innerType` with the
   * same encryptor. Used by schema reflection to re-wrap with the
   * adapter-resolved cast type without exposing the encryptor field.
   */
  withInnerType(innerType: Type): EncryptedAttributeType {
    return new EncryptedAttributeType(innerType, this.encryptor);
  }

  cast(value: unknown): unknown {
    return this.innerType.cast(value);
  }

  deserialize(value: unknown): unknown {
    if (typeof value === "string") {
      try {
        value = this.encryptor.decrypt(value);
      } catch {
        // Decryption failed — value may be plaintext, pass through
      }
    }
    return this.innerType.deserialize(value);
  }

  serialize(value: unknown): unknown {
    const serialized = this.innerType.serialize(value);
    if (typeof serialized === "string") {
      return this.encryptor.encrypt(serialized);
    }
    return serialized;
  }

  isChanged(oldValue: unknown, newValue: unknown, newValueBeforeTypeCast?: unknown): boolean {
    return this.innerType.isChanged(oldValue, newValue, newValueBeforeTypeCast);
  }
}
