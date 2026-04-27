/**
 * Main encryptor — encrypts/decrypts using cipher + message serializer.
 *
 * Mirrors: ActiveRecord::Encryption::Encryptor
 */

import { NotImplementedError } from "../errors.js";
import { Cipher } from "./cipher/aes256-gcm.js";
import { Message } from "./message.js";
import { MessageSerializer } from "./message-serializer.js";
import { ConfigError, DecryptionError, ForbiddenClass } from "./errors.js";
import type { Compressor } from "./config.js";
import { defaultCompressor } from "./config.js";

// Mirrors: ActiveRecord::Encryption::Encryptor::THRESHOLD_TO_JUSTIFY_COMPRESSION
const THRESHOLD_TO_JUSTIFY_COMPRESSION = 140;

export interface EncryptorOptions {
  compress?: boolean;
  compressor?: Compressor;
}

/**
 * Structural encryptor surface accepted by `Scheme.encryptor`. The
 * concrete `Encryptor` class satisfies this interface. Keeps the
 * scheme decoupled from any one implementation so a compatible
 * subtype (or test double) can be passed in without casting through
 * `never`.
 */
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
  private _cipher = new Cipher();
  private _serializer = new MessageSerializer();
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
    if (typeof clearText !== "string") {
      throw new ForbiddenClass(`Can only encrypt strings, got ${typeof clearText}`);
    }

    const encKeyObj = options?.keyProvider?.encryptionKey();
    const key = options?.key ?? encKeyObj?.secret;
    if (!key) {
      throw new ConfigError("No encryption key provided");
    }

    // Pass string or raw compressed Buffer to cipher — mirrors Rails which feeds
    // raw binary bytes from deflate directly into AES without base64 encoding.
    let cipherInput: string | Buffer = clearText;
    let compressed = false;
    if (this._compress) {
      const originalByteLength = Buffer.byteLength(clearText, "utf-8");
      if (originalByteLength > THRESHOLD_TO_JUSTIFY_COMPRESSION) {
        const deflated = this._compressor.deflate(clearText);
        const compressedBuf = Buffer.isBuffer(deflated) ? deflated : Buffer.from(deflated);
        if (compressedBuf.length < originalByteLength) {
          cipherInput = compressedBuf;
          compressed = true;
        }
      }
    }

    const { payload, iv, authTag } = this._cipher.encrypt(cipherInput, key, {
      deterministic: options?.deterministic,
    });

    const message = new Message(payload);
    message.addHeaders({ iv, at: authTag });
    if (compressed) {
      message.addHeader("c", true);
    }

    if (encKeyObj?.publicTags) {
      for (const [k, v] of Object.entries(encKeyObj.publicTags)) {
        message.addHeader(k, v);
      }
    }

    return this._serializer.dump(message);
  }

  decrypt(
    encryptedText: string,
    options?: { keyProvider?: KeyProviderLike; key?: string },
  ): string {
    if (typeof encryptedText !== "string") {
      throw new DecryptionError(`Can only decrypt strings, got ${typeof encryptedText}`);
    }

    const message = this._serializer.load(encryptedText);
    const iv = message.headers.get("iv") as string;
    const authTag = message.headers.get("at") as string;
    const compressed = message.headers.get("c") === true;

    if (!iv || !authTag) {
      throw new DecryptionError("Missing IV or auth tag");
    }

    let keys: string[];
    if (options?.key) {
      keys = [options.key];
    } else if (options?.keyProvider) {
      keys = options.keyProvider.decryptionKeys(message).map((k) => k.secret);
    } else {
      throw new DecryptionError("No decryption key provided");
    }

    // cipher.decrypt returns raw bytes — inflate directly for compressed payloads,
    // decode as UTF-8 for plain text. Mirrors Rails which passes raw bytes to/from cipher.
    const decryptedBuf = this._cipher.decrypt(message.payload, keys, iv, authTag);

    if (compressed) {
      return this._compressor.inflate(decryptedBuf);
    }

    return decryptedBuf.toString("utf-8");
  }

  isEncrypted(text: string): boolean {
    try {
      this._serializer.load(text);
      return true;
    } catch {
      return false;
    }
  }

  isBinary(): boolean {
    return this._serializer.isBinary();
  }

  get compressor(): Compressor {
    return this._compressor;
  }

  isCompress(): boolean {
    return this._compress;
  }
}

function defaultKeyProvider(): never {
  throw new NotImplementedError(
    "ActiveRecord::Encryption::Encryptor#default_key_provider is not implemented",
  );
}

function validatePayloadType(clearText: any): never {
  throw new NotImplementedError(
    "ActiveRecord::Encryption::Encryptor#validate_payload_type is not implemented",
  );
}

function cipher(): never {
  throw new NotImplementedError("ActiveRecord::Encryption::Encryptor#cipher is not implemented");
}

function buildEncryptedMessage(clearText: any, keyProvider?: any, cipherOptions?: any): never {
  throw new NotImplementedError(
    "ActiveRecord::Encryption::Encryptor#build_encrypted_message is not implemented",
  );
}

function serializeMessage(message: any): never {
  throw new NotImplementedError(
    "ActiveRecord::Encryption::Encryptor#serialize_message is not implemented",
  );
}

function deserializeMessage(message: any): never {
  throw new NotImplementedError(
    "ActiveRecord::Encryption::Encryptor#deserialize_message is not implemented",
  );
}

function serializer(): never {
  throw new NotImplementedError(
    "ActiveRecord::Encryption::Encryptor#serializer is not implemented",
  );
}

function compressIfWorthIt(string: any): never {
  throw new NotImplementedError(
    "ActiveRecord::Encryption::Encryptor#compress_if_worth_it is not implemented",
  );
}

function compress(data: any): never {
  throw new NotImplementedError("ActiveRecord::Encryption::Encryptor#compress is not implemented");
}

function uncompressIfNeeded(data: any, compressed: any): never {
  throw new NotImplementedError(
    "ActiveRecord::Encryption::Encryptor#uncompress_if_needed is not implemented",
  );
}

function uncompress(data: any): never {
  throw new NotImplementedError(
    "ActiveRecord::Encryption::Encryptor#uncompress is not implemented",
  );
}

function forceEncodingIfNeeded(value: any): never {
  throw new NotImplementedError(
    "ActiveRecord::Encryption::Encryptor#force_encoding_if_needed is not implemented",
  );
}

function forcedEncodingForDeterministicEncryption(): never {
  throw new NotImplementedError(
    "ActiveRecord::Encryption::Encryptor#forced_encoding_for_deterministic_encryption is not implemented",
  );
}
