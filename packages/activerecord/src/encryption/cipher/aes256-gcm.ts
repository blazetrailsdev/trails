import { getCrypto } from "@blazetrails/activesupport";
import { Configuration, Decryption, EncryptedContentIntegrity } from "../errors.js";
import { Message } from "../message.js";

const KEY_LENGTH = 32;
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;

function isBytes(value: unknown): value is string | Buffer {
  return typeof value === "string" || Buffer.isBuffer(value);
}

function toBytes(value: string | Buffer): Buffer {
  return Buffer.isBuffer(value) ? value : Buffer.from(value, "latin1");
}

export class Aes256Gcm {
  static readonly CIPHER_TYPE = "aes-256-gcm";
  static keyLength = KEY_LENGTH;
  static ivLength = IV_LENGTH;

  declare readonly secret: string;
  readonly deterministic: boolean;

  constructor(secret: string, options?: { deterministic?: boolean }) {
    Object.defineProperty(this, "secret", {
      value: secret,
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

  toJSON(): Record<string, unknown> {
    return { deterministic: this.deterministic };
  }

  /**
   * @missingRailsCall order:generateIv,constructor — PERMANENT
   * @missingRailsArgs generate_iv — PERMANENT
   */
  encrypt(clearText: string | Buffer): Message {
    this._validateKeyLength(this.secret);
    const keyBuf = Buffer.from(this.secret, "base64").subarray(0, KEY_LENGTH);
    if (typeof clearText === "string") clearText = Buffer.from(clearText, "utf-8");
    const iv = this.generateIv(this.deterministic, clearText);
    const cipher = getCrypto().createCipheriv(Aes256Gcm.CIPHER_TYPE, keyBuf, iv, {
      authTagLength: AUTH_TAG_LENGTH,
    });
    let encryptedData =
      clearText.length === 0 ? Buffer.from(clearText) : Buffer.from(cipher.update(clearText));
    encryptedData = Buffer.concat([encryptedData, Buffer.from(cipher.final())]);
    if (!cipher.getAuthTag) {
      throw new Configuration("Crypto adapter does not support GCM auth tags (getAuthTag)");
    }
    const authTag = Buffer.from(cipher.getAuthTag());

    const message = new Message({ payload: encryptedData });
    message.headers.iv = iv;
    message.headers.authTag = authTag;
    return message;
  }

  decrypt(message: Message): Buffer {
    const iv = message.headers.get("iv");
    const authTag = message.headers.get("at");
    if (!isBytes(iv) || !isBytes(authTag)) throw new EncryptedContentIntegrity();
    const keyBuf = Buffer.from(this.secret, "base64").subarray(0, KEY_LENGTH);

    const authTagBuf = toBytes(authTag);
    if (authTagBuf.length !== AUTH_TAG_LENGTH) throw new EncryptedContentIntegrity();

    try {
      const decipher = getCrypto().createDecipheriv(Aes256Gcm.CIPHER_TYPE, keyBuf, toBytes(iv), {
        authTagLength: AUTH_TAG_LENGTH,
      });
      if (!decipher.setAuthTag) {
        throw new Configuration("Crypto adapter does not support GCM auth tags (setAuthTag)");
      }
      decipher.setAuthTag(authTagBuf);
      const encryptedData = toBytes(message.payload);
      const decryptedData =
        encryptedData.length === 0
          ? Buffer.from(encryptedData)
          : Buffer.from(decipher.update(encryptedData));
      return Buffer.concat([decryptedData, Buffer.from(decipher.final())]);
    } catch (e) {
      if (e instanceof Configuration) throw e;
      throw new Decryption("The provided key could not decrypt the data");
    }
  }

  private _validateKeyLength(key: string): void {
    const keyBuf = Buffer.from(key, "base64");
    if (keyBuf.length < KEY_LENGTH) {
      throw new Configuration(
        `The provided key has length ${keyBuf.length} but must be at least ${KEY_LENGTH} bytes`,
      );
    }
  }

  /** @internal */
  private generateIv(deterministic: boolean, clearText: Buffer): Buffer {
    if (deterministic) {
      return this.generateDeterministicIv(clearText);
    }
    return getCrypto().randomBytes(IV_LENGTH);
  }

  /**
   * @internal
   * @missingRailsCall new — PERMANENT
   */
  private generateDeterministicIv(clearText: Buffer): Buffer {
    const keyBuf = Buffer.from(this.secret, "base64").subarray(0, KEY_LENGTH);
    return getCrypto()
      .createHmac("sha256", keyBuf)
      .update(clearText)
      .digest()
      .subarray(0, IV_LENGTH);
  }
}
