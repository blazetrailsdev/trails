import type { Bytes } from "@blazetrails/ruby-compat";
import { Autoload, extend, kernelArray as Array, type Extended } from "@blazetrails/activesupport";

import { Aes256Gcm as AesGcmCipher } from "./cipher/aes256-gcm.js";
import { Encryption } from "../namespaces.js";
import { Decryption } from "./errors.js";
import { Message } from "./message.js";

export class Cipher {
  encrypt(cleanText: string | Bytes, options: { key: string; deterministic?: boolean }): Message {
    return this.cipherFor(options.key, options.deterministic ?? false).encrypt(cleanText);
  }

  decrypt(
    encryptedMessage: Message,
    options: { key: string | string[]; [k: string]: unknown },
  ): Bytes {
    return this.tryToDecryptWithEach(encryptedMessage, { keys: Array(options.key) });
  }

  keyLength(): number {
    return AesGcmCipher.keyLength;
  }

  ivLength(): number {
    return AesGcmCipher.ivLength;
  }

  /** @internal */
  private tryToDecryptWithEach(encryptedText: Message, { keys }: { keys: string[] }): Bytes {
    if (keys.length === 0) throw new Decryption("No decryption keys provided");
    let lastError: unknown;
    for (let i = 0; i < keys.length; i++) {
      try {
        return this.cipherFor(keys[i]).decrypt(encryptedText);
      } catch (e) {
        if (!(e instanceof Decryption)) throw e;
        lastError = e;
      }
    }
    const msg = lastError instanceof Error ? lastError.message : String(lastError);
    throw new Decryption(msg);
  }

  /** @internal */
  private cipherFor(secret: string, deterministic: boolean = false): AesGcmCipher {
    return new AesGcmCipher(secret, { deterministic });
  }
}

// eslint-disable-next-line @typescript-eslint/no-namespace
export declare namespace Cipher {
  const loadPath: Autoload.Autoload["loadPath"];
  let Aes256Gcm: typeof AesGcmCipher;
  const autoload: Extended<typeof Autoload>["autoload"];
  const eagerAutoload: Extended<typeof Autoload>["eagerAutoload"];
  const eagerLoadBang: Extended<typeof Autoload>["eagerLoadBang"];
}
Object.defineProperty(Cipher, "name", { value: "ActiveRecord::Encryption::Cipher" });
Object.assign(Cipher, {
  loadPath: {
    "active_record/encryption/cipher/aes256_gcm": () => import("./cipher/aes256-gcm.js"),
  },
});
extend(Cipher, Autoload);

Cipher.eagerAutoload(() => {
  Cipher.autoload("Aes256Gcm");
});
Cipher.Aes256Gcm = AesGcmCipher;

Encryption.Cipher = Cipher;
