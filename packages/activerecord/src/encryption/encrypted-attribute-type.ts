import { ValueType, StringType, BinaryData } from "@blazetrails/activemodel";
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

export class EncryptedAttributeType extends ValueType {
  readonly name = "encrypted";
  readonly scheme: Scheme;
  readonly castType: ValueType;
  private _previousType: boolean;
  private _default?: unknown;
  private _previousTypes?: Map<boolean, EncryptedAttributeType[]>;
  private _previousTypesWithoutCleanText?: EncryptedAttributeType[];
  private _cleanTextScheme?: Scheme;
  private _serializeWithOldest = false;

  constructor(options: {
    scheme: Scheme;
    castType?: ValueType;
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
    if (isAdditionalValue(value)) return value;
    return this.castType.cast(value);
  }

  deserialize(value: unknown): unknown {
    if (value === null || value === undefined) return value;
    return this.castType.deserialize(this.decrypt(value));
  }

  serialize(value: unknown): unknown {
    if (value === null || value === undefined) return null;
    if (this.isSerializeWithOldest()) return this.serializeWithOldest(value);
    return this.serializeWithCurrent(value);
  }

  override serializeCastValue(value: unknown): unknown {
    return this.serialize(value);
  }

  override isChangedInPlace(rawOldValue: unknown, newValue: unknown): boolean {
    const oldValue = rawOldValue === null ? null : this.deserialize(rawOldValue);
    return oldValue !== newValue;
  }

  isEncrypted(value: unknown): boolean {
    if (typeof value !== "string") return false;
    return this.scheme.withContext(() => this.encryptor.isEncrypted(value));
  }

  accessor(): unknown {
    return typeof (this.castType as any).accessor === "function"
      ? (this.castType as any).accessor()
      : undefined;
  }

  get deterministic(): boolean {
    return this.scheme.isDeterministic();
  }

  get keyProvider(): unknown {
    return this.scheme.keyProvider;
  }

  get isDowncase(): boolean {
    return this.scheme.downcase ?? false;
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
    return this.scheme.ignoreCase ?? false;
  }

  override type(): string | undefined {
    return this.castType.type();
  }

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
        if (isRubyTruthy(this._default) && this._default === value) return value;

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

  /**
   * @internal
   * @missingRailsCall first — PERMANENT
   */
  private serializeWithOldest(value: unknown): unknown {
    return (this.previousTypes[0] ?? this).serialize(value);
  }

  /** @internal */
  private serializeWithCurrent(value: unknown): unknown {
    const casted = this.castType.serialize?.(value) ?? value;
    if (casted === null || casted === undefined) return null;
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
    return (this._cleanTextScheme ??= new Scheme({
      downcase: this.isDowncase,
      encryptor: new NullEncryptor(),
    }));
  }

  /** @internal */
  private textToDatabaseType(value: unknown): unknown {
    if (value != null && this.castType.isBinary()) {
      if (typeof value === "string") {
        return new BinaryData(new Uint8Array(Buffer.from(value, "latin1")));
      }
      if (value instanceof Uint8Array) return new BinaryData(value);
      if (value instanceof BinaryData) return value;
      return new BinaryData(String(value));
    }
    return value;
  }

  /** @internal */
  private databaseTypeToText(value: unknown): unknown {
    if (value != null && this.castType.isBinary()) {
      const binaryCastType: ValueType =
        this.castType.isSerialized() && this.castType instanceof Serialized
          ? this.castType.subtype!
          : this.castType;
      const raw = binaryCastType.deserialize?.(value) ?? value;
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

export const ADDITIONAL_VALUE_BRAND: symbol = Symbol.for("activerecord.encryption.AdditionalValue");

function isAdditionalValue(value: unknown): boolean {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as Record<symbol, unknown>)[ADDITIONAL_VALUE_BRAND] === true
  );
}
