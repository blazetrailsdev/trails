import { Encoding, forceEncoding, rbObjEncoding, type Bytes } from "@blazetrails/ruby-compat";
import { Autoload, extend, kernelArray as Array, type Extended } from "@blazetrails/activesupport";

import { Aes256Gcm as AesGcmCipher } from "./cipher/aes256-gcm.js";
import { Encryption } from "../namespaces.js";
import { Decryption } from "./errors.js";
import { Message } from "./message.js";

export class Cipher {
  static readonly DEFAULT_ENCODING = Encoding.UTF_8;

  encrypt(
    cleanText: string | Bytes,
    { key, deterministic = false }: { key: string; deterministic?: boolean },
  ): Message {
    const message = this.cipherFor(key, { deterministic }).encrypt(cleanText);
    if (rbObjEncoding(cleanText) !== Cipher.DEFAULT_ENCODING) {
      message.headers.encoding = rbObjEncoding(cleanText).name;
    }
    return message;
  }

  decrypt(
    encryptedMessage: Message,
    { key }: { key: string | string[]; [k: string]: unknown },
  ): string | Bytes {
    const decryptedText = this.tryToDecryptWithEach(encryptedMessage, { keys: Array(key) });
    return forceEncoding(
      decryptedText as Bytes,
      encryptedMessage.headers.encoding || Cipher.DEFAULT_ENCODING,
    );
  }

  keyLength(): number {
    return AesGcmCipher.keyLength;
  }

  ivLength(): number {
    return AesGcmCipher.ivLength;
  }

  /** @internal */
  private tryToDecryptWithEach(
    encryptedText: Message,
    { keys }: { keys: string[] },
  ): Bytes | string[] {
    for (const [index, key] of keys.entries()) {
      try {
        return this.cipherFor(key).decrypt(encryptedText);
      } catch (e) {
        if (!(e instanceof Decryption)) throw e;
        if (index === keys.length - 1) throw e;
      }
    }
    return keys;
  }

  /** @internal */
  private cipherFor(
    secret: string,
    { deterministic = false }: { deterministic?: boolean } = {},
  ): AesGcmCipher {
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
