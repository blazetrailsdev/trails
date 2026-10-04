import { isPresent } from "@blazetrails/activesupport";
import { EncodingError, rbObjClassname, type Bytes } from "@blazetrails/ruby-compat";
import { Message } from "./message.js";
import type { Properties } from "./properties.js";
import type { MessageSerializerLike } from "./message-serializer.js";
import { Decryption, EncryptedContentIntegrity, Encoding, ForbiddenClass } from "./errors.js";
import { type Compressor } from "./config.js";
import { Encryption } from "../namespaces.js";
import { normalizeEncoding, replaceUnencodable } from "./encoding-helpers.js";

const THRESHOLD_TO_JUSTIFY_COMPRESSION = 140;

export interface EncryptorOptions {
  compress?: boolean;
  compressor?: Compressor;
}

export interface EncryptorLike {
  encrypt(clearText: string, options?: Record<string, unknown>): string;
  decrypt(encryptedText: string, options?: Record<string, unknown>): string;
  isEncrypted(text: string): boolean;
  isBinary(): boolean;
}

export interface KeyProviderLike {
  encryptionKey(): { secret: string; publicTags: Record<string, unknown> | Properties };
  decryptionKeys(
    message: Message,
  ): Array<{ secret: string; publicTags: Record<string, unknown> | Properties }>;
}

export class Encryptor {
  private _compress: boolean;
  private _compressor: Compressor;

  constructor(options?: { compress?: boolean; compressor?: Compressor }) {
    this._compress = options?.compress ?? true;
    this._compressor = options?.compressor ?? Encryption.config.compressor;
  }

  encrypt(
    clearText: string,
    {
      keyProvider = this.defaultKeyProvider(),
      cipherOptions = {},
    }: { keyProvider?: KeyProviderLike; cipherOptions?: { deterministic?: boolean } } = {},
  ): string {
    if (cipherOptions.deterministic) clearText = this.forceEncodingIfNeeded(clearText);

    this.validatePayloadType(clearText);
    return this.serializeMessage(
      this.buildEncryptedMessage(clearText, { keyProvider, cipherOptions }),
    );
  }

  decrypt(
    encryptedText: string,
    {
      keyProvider = this.defaultKeyProvider(),
      cipherOptions = {},
    }: { keyProvider?: KeyProviderLike; cipherOptions?: Record<string, unknown> } = {},
  ): string {
    try {
      const message = this.deserializeMessage(encryptedText);
      const keys = keyProvider.decryptionKeys(message);
      if (!isPresent(keys)) throw new Decryption();
      return this.uncompressIfNeeded(
        this.cipher().decrypt(message, { key: keys.map((key) => key.secret), ...cipherOptions }),
        message.headers.compressed,
      );
    } catch (e) {
      if (
        !(
          e instanceof EncodingError ||
          e instanceof Encoding ||
          e instanceof EncryptedContentIntegrity ||
          e instanceof Decryption
        )
      ) {
        throw e;
      }
      throw new Decryption();
    }
  }

  isEncrypted(text: string): boolean {
    try {
      this.deserializeMessage(text);
      return true;
    } catch {
      return false;
    }
  }

  isBinary(): boolean {
    return this.serializer().isBinary();
  }

  /** @internal */
  private cipher() {
    return Encryption.cipher;
  }

  get compressor(): Compressor {
    return this._compressor;
  }

  isCompress(): boolean {
    return this._compress;
  }

  /** @internal */
  private defaultKeyProvider(): KeyProviderLike {
    return Encryption.keyProvider as KeyProviderLike;
  }

  /** @internal */
  private validatePayloadType(clearText: unknown): void {
    if (typeof clearText !== "string") {
      throw new ForbiddenClass(
        `The encryptor can only encrypt string values (${rbObjClassname(clearText)})`,
      );
    }
  }

  /** @internal */
  private serializeMessage(message: Message): string {
    return this.serializer().dump(message);
  }

  /** @internal */
  private deserializeMessage(message: string): Message {
    try {
      return this.serializer().load(message);
    } catch (e) {
      if (e instanceof ForbiddenClass || e instanceof TypeError) throw new Encoding();
      throw e;
    }
  }

  /** @internal */
  private serializer(): MessageSerializerLike {
    return Encryption.messageSerializer as MessageSerializerLike;
  }

  /** @internal */
  private buildEncryptedMessage(
    clearText: string,
    {
      keyProvider,
      cipherOptions,
    }: { keyProvider: KeyProviderLike; cipherOptions: { deterministic?: boolean } },
  ): Message {
    const key = keyProvider.encryptionKey();

    const [text, wasCompressed] = this.compressIfWorthIt(clearText);
    const message = this.cipher().encrypt(text, { key: key.secret, ...cipherOptions });
    message.headers.add(key.publicTags);
    if (wasCompressed) message.headers.compressed = true;
    return message;
  }

  /** @internal */
  private compressIfWorthIt(string: string): [string | Buffer, boolean] {
    if (
      this.isCompress() &&
      Buffer.byteLength(string, "utf-8") > THRESHOLD_TO_JUSTIFY_COMPRESSION
    ) {
      return [this.compress(string), true];
    }
    return [string, false];
  }

  /** @internal */
  private compress(data: string): Buffer {
    const result = this._compressor.deflate(data);
    return Buffer.isBuffer(result) ? result : Buffer.from(result);
  }

  /** @internal */
  private uncompressIfNeeded(data: Bytes, compressed: boolean | undefined): string {
    if (compressed) {
      return this.uncompress(data);
    }
    return data.toString("utf-8");
  }

  /** @internal */
  private uncompress(data: Buffer | Uint8Array): string {
    return this._compressor.inflate(data);
  }

  /** @internal */
  private forceEncodingIfNeeded(value: string): string {
    const enc = this.forcedEncodingForDeterministicEncryption();
    if (!enc) return value;
    const normalized = normalizeEncoding(enc);
    if (!normalized || normalized === "utf8") return value;
    return replaceUnencodable(value, normalized === "ascii" ? 0x7f : 0xff);
  }

  /** @internal */
  private forcedEncodingForDeterministicEncryption(): string {
    return Encryption.config.forcedEncodingForDeterministicEncryption;
  }
}

Encryption.Encryptor = Encryptor;
