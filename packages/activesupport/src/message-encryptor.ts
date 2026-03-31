/**
 * MessageEncryptor - encrypts and signs messages.
 * Mirrors ActiveSupport::MessageEncryptor.
 */

import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  createHmac,
  timingSafeEqual,
} from "node:crypto";

export class InvalidMessage extends Error {
  constructor(message = "Invalid message") {
    super(message);
    this.name = "InvalidMessage";
  }
}

interface Serializer {
  dump(value: unknown): string;
  load(value: string): unknown;
}

const JSONSerializer: Serializer = {
  dump(v) {
    return JSON.stringify(v);
  },
  load(s) {
    return JSON.parse(s);
  },
};

interface MessageEncryptorOptions {
  cipher?: string;
  digest?: string;
  serializer?: Serializer;
}

export class MessageEncryptor {
  private secret: Buffer;
  private signSecret: Buffer;
  private cipher: string;
  private digest: string;
  private serializer: Serializer;

  constructor(
    secret: string | Buffer,
    signSecretOrOptions?: string | Buffer | MessageEncryptorOptions,
    options?: MessageEncryptorOptions,
  ) {
    let signSecret: string | Buffer | undefined;
    let opts: MessageEncryptorOptions = {};

    if (
      signSecretOrOptions &&
      typeof signSecretOrOptions === "object" &&
      !Buffer.isBuffer(signSecretOrOptions)
    ) {
      opts = signSecretOrOptions as MessageEncryptorOptions;
    } else if (signSecretOrOptions !== undefined) {
      signSecret = signSecretOrOptions as string | Buffer;
      opts = options ?? {};
    }

    this.cipher = opts.cipher ?? "aes-256-cbc";
    this.digest = opts.digest ?? "sha1";
    this.serializer = opts.serializer ?? JSONSerializer;

    this.secret = typeof secret === "string" ? Buffer.from(secret) : secret;

    if (signSecret) {
      this.signSecret = typeof signSecret === "string" ? Buffer.from(signSecret) : signSecret;
    } else {
      this.signSecret = this.secret;
    }
  }

  encryptAndSign(value: unknown): string {
    const serialized = this.serializer.dump(value);
    const encrypted = this.encrypt(serialized);
    const signature = this.sign(encrypted);
    return `${encrypted}--${signature}`;
  }

  decryptAndVerify(message: string): unknown {
    if (!message || typeof message !== "string") {
      throw new InvalidMessage();
    }

    const lastDash = message.lastIndexOf("--");
    if (lastDash === -1) throw new InvalidMessage();

    const encrypted = message.slice(0, lastDash);
    const signature = message.slice(lastDash + 2);

    if (!this.verifySignature(encrypted, signature)) {
      throw new InvalidMessage("Signature mismatch");
    }

    const decrypted = this.decrypt(encrypted);
    return this.serializer.load(decrypted);
  }

  private encrypt(plaintext: string): string {
    const keyLength = this.keyLength();
    const key = this.secret.slice(0, keyLength);
    const ivLength = this.ivLength();
    const iv = randomBytes(ivLength);

    const cipher = createCipheriv(this.cipher, key, iv);
    const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);

    const encryptedB64 = encrypted.toString("base64");
    const ivB64 = iv.toString("base64");

    return `${encryptedB64}--${ivB64}`;
  }

  private decrypt(encrypted: string): string {
    const parts = encrypted.split("--");
    if (parts.length !== 2) throw new InvalidMessage();

    const [encryptedB64, ivB64] = parts;

    if (!encryptedB64 || !ivB64) throw new InvalidMessage();

    // Validate strict base64 (no newlines or special chars)
    if (!/^[A-Za-z0-9+/=]+$/.test(encryptedB64) || !/^[A-Za-z0-9+/=]+$/.test(ivB64)) {
      throw new InvalidMessage("Invalid encoding");
    }

    const encryptedBuf = Buffer.from(encryptedB64, "base64");
    const iv = Buffer.from(ivB64, "base64");

    const keyLength = this.keyLength();
    const key = this.secret.slice(0, keyLength);

    try {
      const decipher = createDecipheriv(this.cipher, key, iv);
      const decrypted = Buffer.concat([decipher.update(encryptedBuf), decipher.final()]);
      return decrypted.toString("utf8");
    } catch {
      throw new InvalidMessage("Decryption failed");
    }
  }

  private sign(data: string): string {
    return createHmac(this.digest, this.signSecret).update(data).digest("hex");
  }

  private verifySignature(data: string, signature: string): boolean {
    try {
      const expected = this.sign(data);
      const expectedBuf = Buffer.from(expected, "hex");
      const sigBuf = Buffer.from(signature, "hex");
      if (sigBuf.length !== expectedBuf.length) return false;
      return timingSafeEqual(sigBuf, expectedBuf);
    } catch {
      return false;
    }
  }

  private keyLength(): number {
    // Extract key length from cipher name (e.g. aes-256-cbc -> 32 bytes)
    const match = this.cipher.match(/(\d+)/);
    if (match) return parseInt(match[1], 10) / 8;
    return 32;
  }

  private ivLength(): number {
    const name = this.cipher.toLowerCase();
    if (name.includes("gcm") || name.includes("ccm")) return 12;
    return 16;
  }
}

export namespace NullSerializer {
  export function dump(value: unknown): string {
    if (typeof value !== "string") {
      throw new TypeError("NullSerializer.dump expects a string value");
    }
    return value;
  }
  export function load(value: string): string {
    return value;
  }
}
