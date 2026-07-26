import { getCrypto } from "./crypto-adapter.js";
import { Codec, Thrown, type MessageSerializer } from "./messages/codec.js";
import type { Format } from "./messages/serializer-with-fallback.js";

export class InvalidMessage extends Error {
  constructor(message = "Invalid message") {
    super(message);
    this.name = "InvalidMessage";
  }
}

interface MessageEncryptorOptions {
  cipher?: string;
  digest?: string;
  serializer?: Format | MessageSerializer;
}

export class MessageEncryptor extends Codec {
  static override defaultSerializer: Format | MessageSerializer = "json";

  private secret: Buffer;
  private signSecret: Buffer;
  private cipher: string;
  private digest: string;

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
      opts = signSecretOrOptions;
    } else if (signSecretOrOptions !== undefined) {
      signSecret = signSecretOrOptions;
      opts = options ?? {};
    }

    super({ serializer: opts.serializer });

    this.cipher = opts.cipher ?? "aes-256-cbc";
    this.digest = opts.digest ?? "sha1";

    this.secret = typeof secret === "string" ? Buffer.from(secret) : secret;

    if (signSecret) {
      this.signSecret = typeof signSecret === "string" ? Buffer.from(signSecret) : signSecret;
    } else {
      this.signSecret = this.secret;
    }
  }

  encryptAndSign(value: unknown): string {
    const serialized = this.serialize(value);
    const encrypted = this.encrypt(serialized);
    const signature = this.sign(encrypted);
    return `${encrypted}--${signature}`;
  }

  decryptAndVerify(message: string): unknown {
    return this.catchAndRaise("invalid_message_format", { as: InvalidMessage }, () =>
      this.catchAndRaise("invalid_message_serialization", { as: InvalidMessage }, () =>
        this.catchAndIgnore("invalid_message_content", () => this.readMessage(message)),
      ),
    );
  }

  private readMessage(message: string): unknown {
    if (!message || typeof message !== "string") {
      throw new Thrown("invalid_message_format", "invalid message string");
    }

    const lastDash = message.lastIndexOf("--");
    if (lastDash === -1) {
      throw new Thrown("invalid_message_format", "missing message digest");
    }

    const encrypted = message.slice(0, lastDash);
    const signature = message.slice(lastDash + 2);

    if (!this.verifySignature(encrypted, signature)) {
      throw new Thrown("invalid_message_format", "mismatched digest");
    }

    return this.deserialize(this.decrypt(encrypted));
  }

  private encrypt(plaintext: string): string {
    const keyLength = this.keyLength();
    const key = this.secret.slice(0, keyLength);
    const ivLength = this.ivLength();
    const iv = getCrypto().randomBytes(ivLength);

    const cipher = getCrypto().createCipheriv(this.cipher, key, iv);
    const encrypted = Buffer.concat([cipher.update(plaintext, "latin1"), cipher.final()]);

    const encryptedB64 = this.encode(encrypted);
    const ivB64 = this.encode(iv);

    return `${encryptedB64}--${ivB64}`;
  }

  private decrypt(encrypted: string): string {
    const parts = encrypted.split("--");
    if (parts.length !== 2) {
      throw new Thrown("invalid_message_format", "invalid message format");
    }

    const [encryptedB64, ivB64] = parts;

    if (!encryptedB64 || !ivB64) {
      throw new Thrown("invalid_message_format", "invalid message format");
    }

    const encryptedBuf = this.decode(encryptedB64);
    const iv = this.decode(ivB64);

    const keyLength = this.keyLength();
    const key = this.secret.slice(0, keyLength);

    try {
      const decipher = getCrypto().createDecipheriv(this.cipher, key, iv);
      const decrypted = Buffer.concat([decipher.update(encryptedBuf), decipher.final()]);
      return decrypted.toString("latin1");
    } catch {
      throw new Thrown("invalid_message_format", "decryption failed");
    }
  }

  private sign(data: string): string {
    return getCrypto().createHmac(this.digest, this.signSecret).update(data).digest("hex");
  }

  private verifySignature(data: string, signature: string): boolean {
    try {
      const expected = this.sign(data);
      const expectedBuf = Buffer.from(expected, "hex");
      const sigBuf = Buffer.from(signature, "hex");
      if (sigBuf.length !== expectedBuf.length) return false;
      return getCrypto().timingSafeEqual(sigBuf, expectedBuf);
    } catch {
      return false;
    }
  }

  private keyLength(): number {
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
