/**
 * Main encryptor — encrypts/decrypts using cipher + message serializer.
 *
 * Mirrors: ActiveRecord::Encryption::Encryptor
 */

import { Cipher } from "./cipher/aes256-gcm.js";
import { Message } from "./message.js";
import { MessageSerializer } from "./message-serializer.js";
import { ConfigError, DecryptionError, ForbiddenClass } from "./errors.js";
import type { Compressor } from "./config.js";
import { defaultCompressor } from "./config.js";

export interface EncryptorOptions {
  compress?: boolean;
  compressor?: Compressor;
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

    let data = clearText;
    let compressed = false;
    if (this._compress) {
      const originalByteLength = Buffer.byteLength(data, "utf-8");
      const compressedBuf = this._compressor.deflate(data);
      const compressedBase64 = Buffer.from(compressedBuf).toString("base64");
      if (Buffer.byteLength(compressedBase64, "utf-8") < originalByteLength) {
        data = compressedBase64;
        compressed = true;
      }
    }

    const { payload, iv, authTag } = this._cipher.encrypt(data, key, {
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

    const decrypted = this._cipher.decrypt(message.payload, keys, iv, authTag);

    if (compressed) {
      const compressedBuf = Buffer.from(decrypted, "base64");
      return this._compressor.inflate(compressedBuf);
    }

    return decrypted;
  }

  encrypted(text: string): boolean {
    try {
      this._serializer.load(text);
      return true;
    } catch {
      return false;
    }
  }
}
