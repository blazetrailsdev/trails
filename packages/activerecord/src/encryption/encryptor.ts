import { isPresent } from "@blazetrails/activesupport";
import {
  Encoding as RbEncoding,
  EncodingError,
  OpenSSL,
  forceEncoding,
  rbObjClassname,
  rbObjEncoding,
  type Bytes,
} from "@blazetrails/ruby-compat";
import { Message } from "./message.js";
import type { Properties } from "./properties.js";
import type { MessageSerializerLike } from "./message-serializer.js";
import { Decryption, EncryptedContentIntegrity, Encoding, ForbiddenClass } from "./errors.js";
import { type Compressor } from "./config.js";
import { Encryption } from "../namespaces.js";
import { encode } from "./encoding-helpers.js";

const THRESHOLD_TO_JUSTIFY_COMPRESSION = 140;

export interface EncryptorOptions {
  compress?: boolean;
  compressor?: Compressor;
}

export interface EncryptorLike {
  encrypt(clearText: string | Bytes, options?: Record<string, unknown>): string | Bytes;
  decrypt(encryptedText: string | Bytes, options?: Record<string, unknown>): string | Bytes;
  isEncrypted(text: string | Bytes): boolean;
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
    clearText: string | Bytes,
    {
      keyProvider = this.defaultKeyProvider(),
      cipherOptions = {},
    }: { keyProvider?: KeyProviderLike; cipherOptions?: { deterministic?: boolean } } = {},
  ): string | Bytes {
    if (cipherOptions.deterministic) clearText = this.forceEncodingIfNeeded(clearText);

    this.validatePayloadType(clearText);
    return this.serializeMessage(
      this.buildEncryptedMessage(clearText, { keyProvider, cipherOptions }),
    );
  }

  decrypt(
    encryptedText: string | Bytes,
    {
      keyProvider = this.defaultKeyProvider(),
      cipherOptions = {},
    }: { keyProvider?: KeyProviderLike; cipherOptions?: Record<string, unknown> } = {},
  ): string | Bytes {
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
          e instanceof OpenSSL.Cipher.CipherError ||
          e instanceof EncryptedContentIntegrity ||
          e instanceof Decryption
        )
      ) {
        throw e;
      }
      throw new Decryption();
    }
  }

  isEncrypted(text: string | Bytes): boolean {
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
    if (!(typeof clearText === "string" || clearText instanceof Uint8Array)) {
      throw new ForbiddenClass(
        `The encryptor can only encrypt string values (${rbObjClassname(clearText)})`,
      );
    }
  }

  /** @internal */
  private serializeMessage(message: Message): string | Bytes {
    return this.serializer().dump(message);
  }

  /** @internal */
  private deserializeMessage(message: string | Bytes): Message {
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
    clearText: string | Bytes,
    {
      keyProvider,
      cipherOptions,
    }: { keyProvider: KeyProviderLike; cipherOptions: { deterministic?: boolean } },
  ): Message {
    const key = keyProvider.encryptionKey();

    let wasCompressed: boolean;
    [clearText, wasCompressed] = this.compressIfWorthIt(clearText);
    const message = this.cipher().encrypt(clearText, { key: key.secret, ...cipherOptions });
    message.headers.add(key.publicTags);
    if (wasCompressed) message.headers.compressed = true;
    return message;
  }

  /** @internal */
  private compressIfWorthIt(string: string | Bytes): [string | Bytes, boolean] {
    if (this.isCompress() && Buffer.byteLength(string) > THRESHOLD_TO_JUSTIFY_COMPRESSION) {
      return [this.compress(string), true];
    } else {
      return [string, false];
    }
  }

  /** @internal */
  private compress(data: string | Bytes): string | Bytes {
    const compressedData = this._compressor.deflate(data);
    return forceEncoding(compressedData, rbObjEncoding(data));
  }

  /** @internal */
  private uncompressIfNeeded(
    data: string | Bytes,
    compressed: boolean | undefined,
  ): string | Bytes {
    if (compressed) {
      return this.uncompress(data);
    } else {
      return data;
    }
  }

  /** @internal */
  private uncompress(data: string | Bytes): string | Bytes {
    const uncompressedData = this._compressor.inflate(data);
    return forceEncoding(uncompressedData, rbObjEncoding(data));
  }

  /** @internal */
  private forceEncodingIfNeeded(value: string | Bytes): string | Bytes {
    if (
      this.forcedEncodingForDeterministicEncryption() &&
      value != null &&
      rbObjEncoding(value) !== RbEncoding.find(this.forcedEncodingForDeterministicEncryption())
    ) {
      return encode(value, this.forcedEncodingForDeterministicEncryption());
    } else {
      return value;
    }
  }

  /** @internal */
  private forcedEncodingForDeterministicEncryption(): string {
    return Encryption.config.forcedEncodingForDeterministicEncryption;
  }
}

Encryption.Encryptor = Encryptor;
