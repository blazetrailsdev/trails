import { Type, ValueType, StringType } from "@blazetrails/activemodel";
import { Scheme } from "./scheme.js";
import type { EncryptorLike } from "./encryptor.js";
import type { WrappedType } from "./wrapped-type.js";
import { isEncryptionDisabled, isProtectedMode } from "./context.js";
import { Configurable } from "./configurable.js";
import {
  Encryption as EncryptionError,
  Decryption as DecryptionError,
  Base as BaseEncryptionError,
} from "./errors.js";
import { NullEncryptor } from "./null-encryptor.js";

function _normalizeEncoding(encoding: string): "utf8" | "ascii" | "latin1" | null {
  switch (encoding.toLowerCase().replace(/[^a-z0-9]/g, "")) {
    case "utf8":
      return "utf8";
    case "ascii":
    case "usascii":
      return "ascii";
    case "latin1":
    case "iso88591":
    case "binary":
    case "ascii8bit":
      return "latin1";
    default:
      return null;
  }
}

function _replaceUnencodable(value: string, maxCodePoint: number): string {
  const out: string[] = [];
  for (const char of value) {
    const cp = char.codePointAt(0)!;
    out.push(cp > maxCodePoint || (cp >= 0xd800 && cp <= 0xdfff) ? "?" : char);
  }
  return out.join("");
}

/**
 * An ActiveModel type that encrypts/decrypts attribute values. This is
 * the central piece connecting the encryption system with `encrypts`
 * declarations in model classes.
 *
 * Mirrors: ActiveRecord::Encryption::EncryptedAttributeType
 */
export class EncryptedAttributeType extends ValueType implements WrappedType {
  readonly name = "encrypted";
  readonly scheme: Scheme;
  readonly castType: Type;
  private _previousType: boolean;
  private _default?: unknown;
  private _encryptor: EncryptorLike;
  private _previousTypesMemo?: EncryptedAttributeType[];
  private _previousTypesMemoKey?: boolean;

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
    // AdditionalValue instances must pass through cast unchanged so that
    // serialize() can unwrap them to their pre-computed ciphertext via
    // ExtendedEncryptableType. Without this, the default cast coerces
    // the AV to a string (via toString), which then gets re-encrypted
    // on serialize, producing a double-encrypted blob.
    if (isAdditionalValue(value)) return value;
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
    const normalized = this.deterministic ? this._applyForcedEncoding(str) : str;
    const toEncrypt =
      this.scheme.downcase || this.scheme.ignoreCase ? normalized.toLowerCase() : normalized;
    return this.encrypt(toEncrypt);
  }

  override isChangedInPlace(rawOldValue: unknown, newValue: unknown): boolean {
    const oldValue = rawOldValue === null ? null : this.deserialize(rawOldValue);
    return oldValue !== newValue;
  }

  isEncrypted(value: unknown): boolean {
    if (typeof value !== "string") return false;
    return this._encryptor.isEncrypted(value);
  }

  get deterministic(): boolean {
    return this.scheme.deterministic ?? false;
  }

  override type(): string {
    return this.castType.type();
  }

  get previousTypes(): EncryptedAttributeType[] {
    // Memoize on supportUnencryptedData so the clean-text scheme gets
    // recomputed if the config toggles at runtime (Rails does the same
    // via @previous_types[support_unencrypted_data?]).
    const key = this.supportUnencryptedData;
    if (!this._previousTypesMemo || this._previousTypesMemoKey !== key) {
      const schemes: Scheme[] = [...(this.scheme.previousSchemes ?? [])];
      if (this.supportUnencryptedData) {
        // Append a NullEncryptor-backed scheme so query expansion
        // produces a plaintext fallback (matches Rails' clean_text_scheme).
        schemes.push(this._cleanTextScheme());
      }
      this._previousTypesMemo = schemes.map(
        (s) =>
          new EncryptedAttributeType({
            scheme: s,
            castType: this.castType,
            previousType: true,
            default: this._default,
          }),
      );
      this._previousTypesMemoKey = key;
    }
    return this._previousTypesMemo;
  }

  private _cleanTextScheme(): Scheme {
    // Rails' clean_text_scheme passes `downcase: downcase?`, and Rails'
    // `Scheme` sets `@downcase = downcase || ignore_case` internally so
    // `downcase?` is true for either flag. Our Scheme keeps the flags
    // separate, so fold `ignoreCase` into `downcase` here to mirror
    // Rails' effective behavior. Without this, a scheme configured
    // `ignoreCase: true, downcase: false` would produce a non-lower-
    // casing clean-text fallback and miss normalized plaintext rows.
    return new Scheme({
      deterministic: this.scheme.deterministic,
      downcase: this.scheme.downcase || this.scheme.ignoreCase,
      encryptor: new NullEncryptor(),
    });
  }

  private decrypt(value: unknown): unknown {
    if (value === null || value === undefined) return value;
    if (this._default !== undefined && this._default === value) return value;

    try {
      return this._encryptor.decrypt(String(value), this.decryptionOptions());
    } catch (error) {
      if (!(error instanceof BaseEncryptionError)) throw error;
      if (this.scheme.previousSchemes.length === 0) {
        return this._handleDeserializeError(error, value);
      }
      return this._tryPreviousTypes(value);
    }
  }

  private _tryPreviousTypes(value: unknown): unknown {
    const prev = this.previousTypes;
    for (let i = 0; i < prev.length; i++) {
      try {
        return prev[i].deserialize(value);
      } catch (error) {
        if (!(error instanceof BaseEncryptionError)) throw error;
        if (i === prev.length - 1) {
          return this._handleDeserializeError(error, value);
        }
      }
    }
    return value;
  }

  private _handleDeserializeError(error: BaseEncryptionError, value: unknown): unknown {
    if (error instanceof DecryptionError && this.supportUnencryptedData) {
      return value;
    }
    throw error;
  }

  private _applyForcedEncoding(value: string): string {
    const forced = Configurable.config.forcedEncodingForDeterministicEncryption;
    if (!forced) return value;
    const enc = _normalizeEncoding(forced);
    if (enc === null || enc === "utf8") return value;
    return _replaceUnencodable(value, enc === "ascii" ? 0x7f : 0xff);
  }

  private encrypt(value: string): string {
    // When fixed (default for deterministic), use the oldest previous scheme so
    // existing ciphertexts remain stable across key rotations. When fixed: false,
    // use the current (newest) scheme. Mirrors Rails' Scheme#oldest_encryption_scheme.
    const encryptingScheme =
      this.scheme.isFixed() && this.scheme.previousSchemes.length > 0
        ? this.scheme.previousSchemes[this.scheme.previousSchemes.length - 1]
        : this.scheme;
    return encryptingScheme.encryptor.encrypt(value, this._encryptionOptionsFor(encryptingScheme));
  }

  private _encryptionOptionsFor(scheme: Scheme): Record<string, unknown> {
    const opts: Record<string, unknown> = {
      deterministic: scheme.deterministic,
    };
    const kp = scheme.keyProvider;
    if (kp != null) opts.keyProvider = kp;
    return opts;
  }

  private decryptionOptions(): Record<string, unknown> {
    const opts: Record<string, unknown> = {};
    const kp = this.scheme.keyProvider;
    if (kp != null) opts.keyProvider = kp;
    return opts;
  }

  get supportUnencryptedData(): boolean {
    if (this._previousType) return false;
    return (
      Configurable.config.supportUnencryptedData === true && this.scheme.isSupportUnencryptedData()
    );
  }
}

/**
 * Brand symbol set on every `AdditionalValue` instance. Checked by
 * `EncryptedAttributeType.cast` to let AVs pass through cast unchanged;
 * a direct `instanceof AdditionalValue` import would introduce a cycle
 * between this module and `extended-deterministic-queries.ts`.
 */
export const ADDITIONAL_VALUE_BRAND: symbol = Symbol.for("activerecord.encryption.AdditionalValue");

function isAdditionalValue(value: unknown): boolean {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as Record<symbol, unknown>)[ADDITIONAL_VALUE_BRAND] === true
  );
}
