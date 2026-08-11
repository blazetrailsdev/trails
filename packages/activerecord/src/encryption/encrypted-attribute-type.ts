import { Type, ValueType, StringType, BinaryData } from "@blazetrails/activemodel";
import { Serialized } from "../type/serialized.js";
import { Scheme } from "./scheme.js";
import type { EncryptorLike } from "./encryptor.js";
import { Contexts } from "./contexts.js";
import { Configurable } from "./configurable.js";
import { Encoding, Decryption, Base } from "./errors.js";
import { isRubyTruthy } from "../ruby-truthy.js";
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
export class EncryptedAttributeType extends ValueType {
  readonly name = "encrypted";
  readonly scheme: Scheme;
  readonly castType: Type;
  private _previousType: boolean;
  private _default?: unknown;
  private _previousTypes?: Map<boolean, EncryptedAttributeType[]>;
  private _previousTypesWithoutCleanText?: EncryptedAttributeType[];
  private _serializeWithOldest = false;

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
    const decrypted = this.decrypt(value);
    return this.castType.deserialize?.(decrypted) ?? decrypted;
  }

  serialize(value: unknown): unknown {
    if (value === null || value === undefined) return null;
    if (this.isSerializeWithOldest()) return this.serializeWithOldest(value);
    return this.serializeWithCurrent(value);
  }

  // Encryption must always run through serialize, not the cast-value shortcut.
  // insertAll prefers serializeCastValue; override so it always encrypts.
  override serializeCastValue(value: unknown): unknown {
    return this.serialize(value);
  }

  override isChangedInPlace(rawOldValue: unknown, newValue: unknown): boolean {
    const oldValue = rawOldValue === null ? null : this.deserialize(rawOldValue);
    return oldValue !== newValue;
  }

  isEncrypted(value: unknown): boolean {
    if (typeof value !== "string") return false;
    // Mirrors Rails encrypted?(value) → with_context { encryptor.encrypted? value }
    // (encrypted_attribute_type.rb:48): the encryptor is resolved from the current
    // context, so under a swapped NullEncryptor/EncryptingOnlyEncryptor this reports
    // false — same as the decrypt/encrypt text paths.
    return this.scheme.withContext(() => this.encryptor.isEncrypted(value));
  }

  // Delegate store accessor dispatch to the castType so store_accessor works
  // with encrypted JSON/hstore columns without needing a separate store() call.
  accessor(): unknown {
    return typeof (this.castType as any).accessor === "function"
      ? (this.castType as any).accessor()
      : undefined;
  }

  get deterministic(): boolean {
    return this.scheme.deterministic ?? false;
  }

  // Mirrors Rails' `delegate :key_provider, :downcase?, :previous_schemes,
  // :with_context, :fixed?, to: :scheme` (encrypted_attribute_type.rb:15).
  get keyProvider(): unknown {
    return this.scheme.keyProvider;
  }

  get isDowncase(): boolean {
    return this.scheme.downcase;
  }

  get previousSchemes(): Scheme[] {
    return this.scheme.previousSchemes;
  }

  withContext<T>(fn: () => T): T {
    return this.scheme.withContext(fn);
  }

  isFixed(): boolean {
    return this.scheme.isFixed();
  }

  get ignoreCase(): boolean {
    return this.scheme.ignoreCase;
  }

  override type(): string | undefined {
    return this.castType.type();
  }

  /** Memoizing on `support_unencrypted_data?` so that we can tweak it during tests. */
  get previousTypes(): EncryptedAttributeType[] {
    this._previousTypes ??= new Map();
    const supportUnencryptedData = this.supportUnencryptedData;
    let types = this._previousTypes.get(supportUnencryptedData);
    if (types === undefined) {
      types = this.buildPreviousTypesFor(this.previousSchemesIncludingCleanText());
      this._previousTypes.set(supportUnencryptedData, types);
    }
    return types;
  }

  get supportUnencryptedData(): boolean {
    return (
      Configurable.config.supportUnencryptedData &&
      this.scheme.isSupportUnencryptedData() &&
      !this._previousType
    );
  }

  /** @internal */
  private previousSchemesIncludingCleanText(): Scheme[] {
    const schemes = [...this.previousSchemes];
    if (this.supportUnencryptedData) schemes.push(this.cleanTextScheme());
    return schemes;
  }

  /** @internal */
  private previousTypesWithoutCleanText(): EncryptedAttributeType[] {
    return (this._previousTypesWithoutCleanText ??= this.buildPreviousTypesFor(
      this.previousSchemes,
    ));
  }

  /** @internal */
  private buildPreviousTypesFor(schemes: Scheme[]): EncryptedAttributeType[] {
    return schemes.map((scheme) => new EncryptedAttributeType({ scheme, previousType: true }));
  }

  /** @internal */
  private isPreviousType(): boolean {
    return this._previousType;
  }

  /** @internal */
  private decryptAsText(value: unknown): unknown {
    try {
      return this.scheme.withContext(() => {
        if (value === null || value === undefined) return value;
        // Rails' guard is `@default && @default == value` — a plain Ruby
        // truthiness check, so a falsey default (`nil`/`false`) is treated as
        // absent and does NOT short-circuit. Match that: only null/undefined/
        // false are falsey (note `""`/`0` are truthy in Ruby, so they DO guard).
        if (isRubyTruthy(this._default) && this._default === value) return value;

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

        return this.encryptor.decrypt(ciphertext, this.decryptionOptions());
      });
    } catch (error) {
      if (!(error instanceof Base)) throw error;
      if (this.previousTypesWithoutCleanText().length === 0)
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
        if (!(error instanceof Base)) throw error;
        if (i === prev.length - 1) return this.handleDeserializeError(error, value);
      }
    }
    return value;
  }

  /** @internal */
  private handleDeserializeError(error: Base, value: unknown): unknown {
    if (error instanceof Decryption && this.supportUnencryptedData) return value;
    throw error;
  }

  /** @internal */
  private isSerializeWithOldest(): boolean {
    return (this._serializeWithOldest ||=
      this.isFixed() && this.previousTypesWithoutCleanText().length > 0);
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
    // `BinaryType#serialize` yields a `BinaryData` (binary.rb:31) — its `toString`
    // UTF-8-decodes and would replace every byte >= 0x80 with U+FFFD, so unwrap to
    // bytes and decode latin1, which maps bytes 1:1.
    const bytes =
      casted instanceof BinaryData ? casted.bytes : casted instanceof Uint8Array ? casted : null;
    const str = bytes
      ? Buffer.from(bytes).toString("latin1")
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
    return this.scheme.withContext(() => {
      if (this.encryptor.isBinary() && !this.castType.isBinary()) {
        throw new Encoding("Binary encoded data can only be stored in binary columns");
      }
      return this.encryptor.encrypt(value, this.encryptionOptions());
    });
  }

  private encrypt(value: string): unknown {
    return this.textToDatabaseType(this.encryptAsText(value));
  }

  /** @internal */
  private get encryptor(): EncryptorLike {
    return Contexts.context.encryptor as EncryptorLike;
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
      // Rails: binary_cast_type = cast_type.serialized? ? cast_type.subtype : cast_type
      // For Serialized binary types, deserialize through the subtype only — the coder
      // (YAML/JSON) should not run on the raw binary ciphertext.
      const binaryCastType: Type =
        this.castType.isSerialized() && this.castType instanceof Serialized
          ? this.castType.subtype
          : this.castType;
      const raw = binaryCastType.deserialize?.(value) ?? value;
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
