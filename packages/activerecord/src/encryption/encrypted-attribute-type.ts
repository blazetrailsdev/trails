import { ValueType, StringType, BinaryData } from "@blazetrails/activemodel";
import { isBlank } from "@blazetrails/activesupport";
import type { Serialized } from "../type/serialized.js";
import { Scheme } from "./scheme.js";
import type { EncryptorLike } from "./encryptor.js";
import { Encryption } from "../encryption.js";
import { Encoding, Decryption, Base } from "./errors.js";
import { first, rbObjAsString as toS, rtest, registerConstant } from "@blazetrails/ruby-compat";
import { NullEncryptor } from "./null-encryptor.js";

export class EncryptedAttributeType extends ValueType {
  readonly scheme: Scheme;
  readonly castType: ValueType;
  private _previousType: boolean;
  private _default?: unknown;
  private _previousTypes?: Record<string, EncryptedAttributeType[]>;
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
    return this.castType.cast(value);
  }

  deserialize(value: unknown): unknown {
    return this.castType.deserialize(this.decrypt(value));
  }

  serialize(value: unknown): unknown {
    if (this.isSerializeWithOldest()) {
      return this.serializeWithOldest(value);
    } else {
      return this.serializeWithCurrent(value);
    }
  }

  override isChangedInPlace(rawOldValue: unknown, newValue: unknown): boolean {
    const oldValue = rawOldValue === null ? null : this.deserialize(rawOldValue);
    return oldValue !== newValue;
  }

  isEncrypted(value: unknown): boolean {
    return this.withContext(() => this.encryptor.isEncrypted(value as string));
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

  override type(): string | undefined {
    return this.castType.type();
  }

  get previousTypes(): EncryptedAttributeType[] {
    this._previousTypes ||= {};
    return (this._previousTypes[`${this.supportUnencryptedData}`] ||= this.buildPreviousTypesFor(
      this.previousSchemesIncludingCleanText(),
    ));
  }

  get supportUnencryptedData(): boolean {
    return (
      Encryption.config.supportUnencryptedData &&
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
      return this.withContext(() => {
        if (value != null) {
          if (rtest(this._default) && this._default === value) {
            return value;
          } else {
            return this.encryptor.decrypt(value as string, this.decryptionOptions());
          }
        }
        return null;
      });
    } catch (error) {
      if (!(error instanceof Base)) throw error;
      if (isBlank(this.previousTypesWithoutCleanText())) {
        return this.handleDeserializeError(error, value);
      } else {
        return this.tryToDeserializeWithPreviousEncryptedTypes(value);
      }
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
    return first(this.previousTypes)!.serialize(value);
  }

  /**
   * @internal
   * @inventedArm if — CONVERGEABLE encryption-binary-clear-text-rides-as-bytes-with-encoding-header
   */
  private serializeWithCurrent(value: unknown): unknown {
    let castedValue = this.castType.serialize(value) as string | BinaryData | null;
    if (this.isDowncase) castedValue = (castedValue as string | null)?.toLowerCase() as string;
    if (castedValue != null) {
      const text = toS(castedValue);
      return this.encrypt(typeof text === "string" ? text : Buffer.from(text).toString("latin1"));
    }
    return null;
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
    return Encryption.context.encryptor as EncryptorLike;
  }

  /** @internal */
  private encryptionOptions(): Record<string, unknown> {
    const opts: Record<string, unknown> = { cipherOptions: { deterministic: this.deterministic } };
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

  /**
   * @internal
   * @inventedArm from — CONVERGEABLE encryption-binary-clear-text-rides-as-bytes-with-encoding-header
   */
  private textToDatabaseType(value: unknown): unknown {
    if (value != null && this.castType.isBinary()) {
      value = new Uint8Array(Buffer.from(value as string, "latin1"));
      return new BinaryData(value);
    } else {
      return value;
    }
  }

  /**
   * @internal
   * @inventedArm from — CONVERGEABLE encryption-binary-clear-text-rides-as-bytes-with-encoding-header
   */
  private databaseTypeToText(value: unknown): unknown {
    if (value != null && this.castType.isBinary()) {
      const binaryCastType = this.castType.isSerialized()
        ? (this.castType as Serialized).subtype!
        : this.castType;
      return Buffer.from(binaryCastType.deserialize(value) as string, "latin1").toString("latin1");
    } else {
      return value;
    }
  }
}

Encryption.EncryptedAttributeType = EncryptedAttributeType;

registerConstant("ActiveRecord::Encryption::EncryptedAttributeType", EncryptedAttributeType);
