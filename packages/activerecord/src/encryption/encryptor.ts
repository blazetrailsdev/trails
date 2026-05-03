/**
 * Main encryptor — encrypts/decrypts using cipher + message serializer.
 *
 * Mirrors: ActiveRecord::Encryption::Encryptor
 */

import { Cipher } from "./cipher/aes256-gcm.js";
import { Message } from "./message.js";
import { MessageSerializer } from "./message-serializer.js";
import { Configurable } from "./configurable.js";
import { DerivedSecretKeyProvider } from "./derived-secret-key-provider.js";
import { ConfigError, DecryptionError, ForbiddenClass } from "./errors.js";
import type { Compressor } from "./config.js";
import { defaultCompressor } from "./config.js";

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
  encryptionKey(): { secret: string; publicTags?: Record<string, unknown> };
  decryptionKeys(message: Message): Array<{ secret: string; publicTags?: Record<string, unknown> }>;
}

export class Encryptor {
  private _compress: boolean;
  private _compressor: Compressor;

  constructor(options?: { compress?: boolean; compressor?: Compressor }) {
    this._compress = options?.compress ?? true;
    this._compressor = options?.compressor ?? defaultCompressor;
  }

  encrypt(
    clearText: string,
    options?: { keyProvider?: KeyProviderLike; key?: string; deterministic?: boolean },
  ): string {
    this.validatePayloadType(clearText);
    // Mirror Rails: force encoding before deterministic encryption.
    const text = options?.deterministic ? this.forceEncodingIfNeeded(clearText) : clearText;
    const keyProvider = options?.keyProvider ?? (this.defaultKeyProvider() as KeyProviderLike);
    const encKeyObj = options?.key
      ? { secret: options.key, publicTags: undefined }
      : keyProvider?.encryptionKey();
    const key = encKeyObj?.secret;
    if (!key) throw new ConfigError("No encryption key provided");

    let cipherInput: string | Buffer = text;
    let compressed = false;
    [cipherInput, compressed] = this.compressIfWorthIt(text);

    const cipherObj = this.cipher();
    const { payload, iv, authTag } = cipherObj.encrypt(cipherInput, key, {
      deterministic: options?.deterministic,
    });

    const message = new Message(payload);
    message.addHeaders({ iv, at: authTag });
    if (compressed) message.addHeader("c", true);
    if (encKeyObj?.publicTags) {
      for (const [k, v] of Object.entries(encKeyObj.publicTags)) {
        message.addHeader(k, v);
      }
    }

    return this.serializeMessage(message);
  }

  decrypt(
    encryptedText: string,
    options?: { keyProvider?: KeyProviderLike; key?: string },
  ): string {
    if (typeof encryptedText !== "string") {
      throw new DecryptionError(`Can only decrypt strings, got ${typeof encryptedText}`);
    }

    const message = this.deserializeMessage(encryptedText);
    const iv = message.headers.get("iv") as string;
    const authTag = message.headers.get("at") as string;
    const compressed = message.headers.get("c") === true;

    if (!iv || !authTag) throw new DecryptionError("Missing IV or auth tag");

    let keys: string[];
    if (options?.key) {
      keys = [options.key];
    } else if (options?.keyProvider) {
      keys = options.keyProvider.decryptionKeys(message).map((k) => k.secret);
    } else {
      const kp = this.defaultKeyProvider() as KeyProviderLike | undefined;
      if (!kp) throw new DecryptionError("No decryption key provided");
      keys = kp.decryptionKeys(message).map((k) => k.secret);
    }

    const decryptedBuf = this.cipher().decrypt(message.payload, keys, iv, authTag);
    return this.uncompressIfNeeded(decryptedBuf, compressed);
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

  get compressor(): Compressor {
    return this._compressor;
  }

  isCompress(): boolean {
    return this._compress;
  }

  /** @internal */
  private defaultKeyProvider(): KeyProviderLike | undefined {
    // Mirrors Rails: ActiveRecord::Encryption.key_provider, which is the
    // context override when set, otherwise a DerivedSecretKeyProvider from
    // config.primary_key. Falls back so new Encryptor().encrypt/decrypt works
    // after Configurable.configure(...) without an explicit keyProvider option.
    const ctxKp = Configurable.keyProvider as KeyProviderLike | undefined;
    if (ctxKp) return ctxKp;
    const primaryKey = Configurable.config.primaryKey;
    if (!primaryKey) return undefined;
    return new DerivedSecretKeyProvider(primaryKey) as unknown as KeyProviderLike;
  }

  /** @internal */
  private validatePayloadType(clearText: unknown): void {
    if (typeof clearText !== "string") {
      throw new ForbiddenClass(
        `The encryptor can only encrypt string values (${typeof clearText})`,
      );
    }
  }

  /** @internal */
  private cipher(): Cipher {
    return new Cipher();
  }

  /** @internal */
  private serializeMessage(message: Message): string {
    return this.serializer().dump(message);
  }

  /** @internal */
  private deserializeMessage(encryptedText: string): Message {
    return this.serializer().load(encryptedText);
  }

  /** @internal */
  private serializer(): MessageSerializer {
    return new MessageSerializer();
  }

  /** @internal */
  private compressIfWorthIt(string: string): [string | Buffer, boolean] {
    if (this._compress && Buffer.byteLength(string, "utf-8") > THRESHOLD_TO_JUSTIFY_COMPRESSION) {
      const deflated = this._compressor.deflate(string);
      const compressedBuf = Buffer.isBuffer(deflated) ? deflated : Buffer.from(deflated);
      if (compressedBuf.length < Buffer.byteLength(string, "utf-8")) {
        return [compressedBuf, true];
      }
    }
    return [string, false];
  }

  /** @internal */
  private compress(data: string): Buffer {
    const result = this._compressor.deflate(data);
    return Buffer.isBuffer(result) ? result : Buffer.from(result);
  }

  /** @internal */
  private uncompressIfNeeded(data: Buffer, compressed: boolean): string {
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
    return value;
  }

  /** @internal */
  private forcedEncodingForDeterministicEncryption(): string {
    return Configurable.config.forcedEncodingForDeterministicEncryption;
  }
}
