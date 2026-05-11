import { Type, ValueType, StringType, BinaryData } from "@blazetrails/activemodel";
import { Scheme } from "./scheme.js";
import type { EncryptorLike } from "./encryptor.js";
import type { WrappedType } from "./wrapped-type.js";
import { isEncryptionDisabled, isProtectedMode } from "./context.js";
import { Configurable } from "./configurable.js";
import {
  Encoding as EncodingError,
  Encryption as EncryptionError,
  Decryption as DecryptionError,
  Base as BaseEncryptionError,
} from "./errors.js";
import { NullEncryptor } from "./null-encryptor.js";
import {
  normalizeEncoding as _normalizeEncoding,
  replaceUnencodable as _replaceUnencodable,
} from "./encoding-helpers.js";

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
  private _serializeWithOldestMemo?: boolean;

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
    if (this.isSerializeWithOldest()) return this.serializeWithOldest(value);
    return this.serializeWithCurrent(value);
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

  get ignoreCase(): boolean {
    return this.scheme.ignoreCase;
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
      this._previousTypesMemo = this.buildPreviousTypesFor(
        this.previousSchemesIncludingCleanText(),
      );
      this._previousTypesMemoKey = key;
    }
    return this._previousTypesMemo;
  }

  get supportUnencryptedData(): boolean {
    if (this._previousType) return false;
    // Mirrors Rails' EncryptedAttributeType#support_unencrypted_data? which delegates
    // directly to scheme.support_unencrypted_data?. The scheme already handles the
    // per-attribute override vs global config fallback — no extra AND-gate needed here.
    return this.scheme.isSupportUnencryptedData();
  }

  /** @internal */
  private previousSchemesIncludingCleanText(): Scheme[] {
    const schemes = [...(this.scheme.previousSchemes ?? [])];
    if (this.supportUnencryptedData) schemes.push(this.cleanTextScheme());
    return schemes;
  }

  /** @internal */
  private previousTypesWithoutCleanText(): EncryptedAttributeType[] {
    return this.buildPreviousTypesFor(this.scheme.previousSchemes ?? []);
  }

  /** @internal */
  private buildPreviousTypesFor(schemes: Scheme[]): EncryptedAttributeType[] {
    return schemes.map(
      (s) =>
        new EncryptedAttributeType({
          scheme: s,
          castType: this.castType,
          previousType: true,
          default: this._default,
        }),
    );
  }

  /** @internal */
  private isPreviousType(): boolean {
    return this._previousType;
  }

  /** @internal */
  private decryptAsText(value: unknown): unknown {
    if (value === null || value === undefined) return value;
    if (this._default !== undefined && this._default === value) return value;

    // Adapters that use JSON/JSONB columns (e.g. PostgreSQL) return the stored value
    // as a parsed JS object rather than a raw string. Re-stringify so the encryptor
    // always receives the JSON string that was originally stored.
    let ciphertext: string;
    if (typeof value === "string") {
      ciphertext = value;
    } else {
      try {
        ciphertext = JSON.stringify(value) ?? String(value);
      } catch {
        ciphertext = String(value);
      }
    }

    try {
      return this._encryptor.decrypt(ciphertext, this.decryptionOptions());
    } catch (error) {
      if (!(error instanceof BaseEncryptionError)) throw error;
      if (this.scheme.previousSchemes.length === 0)
        return this.handleDeserializeError(error, value);
      return this.tryToDeserializeWithPreviousEncryptedTypes(value);
    }
  }

  private decrypt(value: unknown): unknown {
    return this.textToDatabaseType(this.decryptAsText(this.databaseTypeToText(value)));
  }

  /** @internal */
  private tryToDeserializeWithPreviousEncryptedTypes(value: unknown): unknown {
    const prev = this.previousTypes;
    for (let i = 0; i < prev.length; i++) {
      try {
        return prev[i].deserialize(value);
      } catch (error) {
        if (!(error instanceof BaseEncryptionError)) throw error;
        if (i === prev.length - 1) return this.handleDeserializeError(error, value);
      }
    }
    return value;
  }

  /** @internal */
  private handleDeserializeError(error: BaseEncryptionError, value: unknown): unknown {
    if (error instanceof DecryptionError && this.supportUnencryptedData) return value;
    throw error;
  }

  /** @internal */
  private isSerializeWithOldest(): boolean {
    this._serializeWithOldestMemo ??=
      this.scheme.isFixed() && this.scheme.previousSchemes.length > 0;
    return this._serializeWithOldestMemo;
  }

  /** @internal */
  private serializeWithOldest(value: unknown): unknown {
    // Mirrors Rails' previous_types.first — the first of the previous types (which are
    // built from previousSchemesIncludingCleanText, so the clean-text entry, if any, is
    // at the end and never selected here). Keeps ciphertexts stable across key rotations.
    return (this.previousTypes[0] ?? this).serialize(value);
  }

  /** @internal */
  private serializeWithCurrent(value: unknown): unknown {
    const casted = this.castType.serialize?.(value) ?? value;
    if (casted === null || casted === undefined) return null;
    // Binary columns: convert each byte to the matching Latin-1 code point so
    // the encryptor receives a valid string rather than "0,1,2,..." (Array#toString).
    const str =
      casted instanceof Uint8Array
        ? Buffer.from(casted).toString("latin1")
        : typeof casted === "string"
          ? casted
          : String(casted);
    const normalized = this.deterministic ? this._applyForcedEncoding(str) : str;
    const toEncrypt =
      this.scheme.downcase || this.scheme.ignoreCase ? normalized.toLowerCase() : normalized;
    return this.encrypt(toEncrypt);
  }

  /** @internal */
  private encryptAsText(value: string): string {
    if (this._encryptor.isBinary() && !this.castType.isBinary()) {
      throw new EncodingError("Binary encoded data can only be stored in binary columns");
    }
    return this._encryptor.encrypt(value, this.encryptionOptions());
  }

  private encrypt(value: string): unknown {
    return this.textToDatabaseType(this.encryptAsText(value));
  }

  /** @internal */
  private get encryptor(): EncryptorLike {
    return this._encryptor;
  }

  /** @internal */
  private encryptionOptions(): Record<string, unknown> {
    const opts: Record<string, unknown> = { deterministic: this.deterministic };
    const kp = this.scheme.keyProvider;
    if (kp != null) opts.keyProvider = kp;
    return opts;
  }

  private decryptionOptions(): Record<string, unknown> {
    const opts: Record<string, unknown> = {};
    const kp = this.scheme.keyProvider;
    if (kp != null) opts.keyProvider = kp;
    return opts;
  }

  /** @internal */
  private cleanTextScheme(): Scheme {
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

  /** @internal */
  private textToDatabaseType(value: unknown): unknown {
    if (value != null && this.castType.isBinary()) {
      if (typeof value === "string") {
        // Use Latin-1 so binary payload bytes > 127 round-trip correctly.
        // UTF-8 (TextEncoder) would expand bytes 128–255 to two-byte sequences.
        return new BinaryData(new Uint8Array(Buffer.from(value, "latin1")));
      }
      if (value instanceof Uint8Array) return new BinaryData(value);
      // Already a BinaryData wrapper (e.g. supportUnencryptedData pass-through).
      if (value instanceof BinaryData) return value;
      return new BinaryData(String(value));
    }
    return value;
  }

  /** @internal */
  private databaseTypeToText(value: unknown): unknown {
    if (value != null && this.castType.isBinary()) {
      const raw = this.castType.deserialize?.(value) ?? value;
      // Use Latin-1 (not UTF-8) so bytes 128–255 survive the round-trip. The
      // ciphertext is always ASCII so Latin-1 == UTF-8 for that path; for
      // supportUnencryptedData rows the plaintext bytes must also be Latin-1
      // decoded or they'll be corrupted before textToDatabaseType re-wraps them.
      return raw instanceof Uint8Array ? Buffer.from(raw).toString("latin1") : raw;
    }
    return value;
  }

  private _applyForcedEncoding(value: string): string {
    const forced = Configurable.config.forcedEncodingForDeterministicEncryption;
    if (!forced) return value;
    const enc = _normalizeEncoding(forced);
    if (enc === null || enc === "utf8") return value;
    return _replaceUnencodable(value, enc === "ascii" ? 0x7f : 0xff);
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
