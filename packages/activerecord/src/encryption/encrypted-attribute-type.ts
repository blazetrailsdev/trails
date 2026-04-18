import { Type, StringType } from "@blazetrails/activemodel";
import type { Scheme } from "./scheme.js";
import type { Encryptor } from "./encryptor.js";
import type { WrappedType } from "./wrapped-type.js";
import { isEncryptionDisabled, isProtectedMode } from "./context.js";
import { Configurable } from "./configurable.js";
import { Encryption as EncryptionError } from "./errors.js";

/**
 * An ActiveModel type that encrypts/decrypts attribute values. This is
 * the central piece connecting the encryption system with `encrypts`
 * declarations in model classes.
 *
 * Mirrors: ActiveRecord::Encryption::EncryptedAttributeType
 */
export class EncryptedAttributeType extends Type implements WrappedType {
  readonly name = "encrypted";
  readonly scheme: Scheme;
  readonly castType: Type;
  private _previousType: boolean;
  private _default?: unknown;
  private _encryptor: Encryptor;
  private _previousTypes?: EncryptedAttributeType[];

  constructor(options: {
    scheme: Scheme;
    castType?: Type;
    previousType?: boolean;
    default?: unknown;
  }) {
    super();
    this.scheme = options.scheme;
    this.castType = options.castType ?? new StringType();
    this._previousType = options.previousType ?? false;
    this._default = options.default;
    this._encryptor = options.scheme.encryptor;
  }

  /**
   * Return a fresh EncryptedAttributeType wrapping `innerType` with the
   * same scheme. Used by schema reflection to re-wrap with the
   * adapter-resolved cast type without reconstructing scheme/options.
   *
   * Shared contract with the simpler Encryptor-based
   * EncryptedAttributeType in the parent directory — both classes
   * expose `withInnerType` so consumers can unify on a single duck-typed
   * check instead of branching on `instanceof`.
   */
  withInnerType(innerType: Type): EncryptedAttributeType {
    return new EncryptedAttributeType({
      scheme: this.scheme,
      castType: innerType,
      previousType: this._previousType,
      default: this._default,
    });
  }

  cast(value: unknown): unknown {
    return this.castType.cast(value);
  }

  deserialize(value: unknown): unknown {
    if (value === null || value === undefined) return value;
    if (isEncryptionDisabled()) return value;
    if (isProtectedMode()) return value;
    const decrypted = this.decrypt(value);
    return this.castType.deserialize?.(decrypted) ?? decrypted;
  }

  serialize(value: unknown): unknown {
    if (value === null || value === undefined) return null;
    if (isEncryptionDisabled()) return this.castType.serialize?.(value) ?? value;
    if (isProtectedMode() && !this.deterministic) {
      throw new EncryptionError("Can't write encrypted attribute in protected mode");
    }
    const casted = this.castType.serialize?.(value) ?? value;
    if (casted === null || casted === undefined) return null;
    const str = typeof casted === "string" ? casted : String(casted);
    const toEncrypt = this.scheme.downcase || this.scheme.ignoreCase ? str.toLowerCase() : str;
    return this.encrypt(toEncrypt);
  }

  changedInPlace(rawOldValue: unknown, newValue: unknown): boolean {
    const oldValue = rawOldValue === null ? null : this.deserialize(rawOldValue);
    return oldValue !== newValue;
  }

  encrypted(value: unknown): boolean {
    if (typeof value !== "string") return false;
    return this._encryptor.encrypted(value);
  }

  get deterministic(): boolean {
    return this.scheme.deterministic ?? false;
  }

  get previousTypes(): EncryptedAttributeType[] {
    if (!this._previousTypes) {
      this._previousTypes = (this.scheme.previousSchemes ?? []).map(
        (s: Scheme) =>
          new EncryptedAttributeType({
            scheme: s,
            castType: this.castType,
            previousType: true,
            default: this._default,
          }),
      );
    }
    return this._previousTypes;
  }

  private decrypt(value: unknown): unknown {
    if (value === null || value === undefined) return value;
    if (this._default !== undefined && this._default === value) return value;

    if (this.supportUnencryptedData && !this.encrypted(value)) {
      return value;
    }

    return this._encryptor.decrypt(String(value), this.decryptionOptions());
  }

  private encrypt(value: string): string {
    return this._encryptor.encrypt(value, this.encryptionOptions());
  }

  private encryptionOptions(): Record<string, unknown> {
    const opts: Record<string, unknown> = {
      deterministic: this.scheme.deterministic,
    };
    if (this.scheme.keyProvider) opts.keyProvider = this.scheme.keyProvider;
    if (this.scheme.key) opts.key = this.scheme.key;
    return opts;
  }

  private decryptionOptions(): Record<string, unknown> {
    const opts: Record<string, unknown> = {};
    if (this.scheme.keyProvider) opts.keyProvider = this.scheme.keyProvider;
    if (this.scheme.key) opts.key = this.scheme.key;
    return opts;
  }

  get supportUnencryptedData(): boolean {
    if (this._previousType) return false;
    return Configurable.config.supportUnencryptedData ?? false;
  }
}
