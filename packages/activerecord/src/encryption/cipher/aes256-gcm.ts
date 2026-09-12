import { Cipher, OpenSSL, type Bytes } from "@blazetrails/ruby-compat";
import { Configurable } from "../configurable-slot.js";
import { Configuration, Decryption, EncryptedContentIntegrity } from "../errors.js";
import { Message } from "../message.js";

const KEY_LENGTH = 32;
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;

function isBytes(value: unknown): value is string | Bytes {
  return typeof value === "string" || value instanceof Uint8Array;
}

function toBytes(value: string | Bytes): Bytes {
  return typeof value === "string" ? Buffer.from(value, "latin1") : value;
}

export class Aes256Gcm {
  static readonly CIPHER_TYPE = "aes-256-gcm";
  static keyLength = KEY_LENGTH;
  static ivLength = IV_LENGTH;

  declare private readonly secret: Bytes;
  private readonly deterministic: boolean;

  constructor(secret: string, options?: { deterministic?: boolean }) {
    Object.defineProperty(this, "secret", {
      value: Buffer.from(secret, "base64"),
      writable: false,
      enumerable: false,
      configurable: false,
    });
    this.deterministic = options?.deterministic ?? false;
  }

  /** @noRailsEquivalent PERMANENT */
  [Symbol.for("nodejs.util.inspect.custom")](): string {
    return `Cipher {}`;
  }

  encrypt(clearText: string | Bytes): Message {
    this._validateKeyLength(this.secret);
    if (typeof clearText === "string") clearText = Buffer.from(clearText, "utf-8");

    const cipher = new Cipher(Aes256Gcm.CIPHER_TYPE);
    cipher.encrypt();
    cipher.key = this.secret;

    const iv = this.generateIv(cipher, clearText);
    cipher.iv = iv;

    let encryptedData = clearText.length === 0 ? clearText : cipher.update(clearText);
    encryptedData = Buffer.concat([encryptedData, cipher.final()]);

    const message = new Message({ payload: encryptedData });
    message.headers.iv = iv;
    message.headers.authTag = cipher.authTag;
    return message;
  }

  decrypt(encryptedMessage: Message): Bytes {
    const iv = encryptedMessage.headers.get("iv");
    const authTag = encryptedMessage.headers.get("at");
    if (!isBytes(iv) || !isBytes(authTag)) throw new EncryptedContentIntegrity();

    const authTagBuf = toBytes(authTag);
    if (authTagBuf.length !== AUTH_TAG_LENGTH) throw new EncryptedContentIntegrity();

    try {
      const cipher = new Cipher(Aes256Gcm.CIPHER_TYPE);

      cipher.decrypt();
      cipher.key = this.secret;
      cipher.iv = toBytes(iv);

      cipher.authTag = authTagBuf;
      cipher.authData = "";

      const encryptedData = toBytes(encryptedMessage.payload);
      const decryptedData =
        encryptedData.length === 0 ? encryptedData : cipher.update(encryptedData);
      return Buffer.concat([decryptedData, cipher.final()]);
    } catch {
      throw new Decryption("The provided key could not decrypt the data");
    }
  }

  private _validateKeyLength(key: Bytes): void {
    if (key.length < KEY_LENGTH) {
      throw new Configuration(
        `The provided key has length ${key.length} but must be at least ${KEY_LENGTH} bytes`,
      );
    }
  }

  /** @internal */
  private generateIv(cipher: Cipher, clearText: Bytes): Bytes {
    if (this.deterministic) {
      return this.generateDeterministicIv(clearText);
    }
    return cipher.randomIv();
  }

  /**
   * @internal
   * @missingRailsCall new — PERMANENT
   */
  private generateDeterministicIv(clearText: Bytes): Bytes {
    return OpenSSL.HMAC.digest(OpenSSL.Digest.SHA256.new(), this.secret, clearText).subarray(
      0,
      Configurable.cipher.ivLength(),
    ) as Bytes;
  }
}
