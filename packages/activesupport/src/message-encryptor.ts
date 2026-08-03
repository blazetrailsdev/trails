import { getCrypto } from "./crypto-adapter.js";
import { Codec, type MessageSerializer } from "./messages/codec.js";
import type { ExpectedMetadataOptions, MetadataOptions } from "./messages/metadata.js";
import {
  fallBackTo,
  initialize as initializeRotator,
  onRotation,
  readMessage as readMessageWithRotations,
  rotate,
  type OnRotation,
  type RotatableOptions,
} from "./messages/rotator.js";
import { prepend } from "./prepend.js";
import { Thrown, type Format } from "./messages/serializer-with-fallback.js";

export class InvalidMessage extends Error {
  constructor(message = "Invalid message") {
    super(message);
    this.name = "InvalidMessage";
  }
}

interface MessageEncryptorOptions extends RotatableOptions {
  cipher?: string;
  digest?: string;
  serializer?: Format | MessageSerializer;
  forceLegacyMetadataSerializer?: boolean;
}

const AUTH_TAG_LENGTH = 16;
const SEPARATOR = "--";

export class MessageEncryptor extends Codec {
  static override defaultSerializer: Format | MessageSerializer = "json";

  static useAuthenticatedMessageEncryption = false;

  static defaultCipher(): string {
    return this.useAuthenticatedMessageEncryption ? "aes-256-gcm" : "aes-256-cbc";
  }

  declare rotate: (...args: unknown[]) => this;
  declare onRotation: (callback: OnRotation) => this;
  declare fallBackTo: (fallback: this) => this;


  private secret: Buffer;
  private signSecret: Buffer;
  private cipher: string;
  private digest: string;
  private aeadMode: boolean;

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

    super({
      serializer: opts.serializer,
      forceLegacyMetadataSerializer: opts.forceLegacyMetadataSerializer,
    });

    this.cipher = opts.cipher ?? (this.constructor as typeof MessageEncryptor).defaultCipher();
    this.aeadMode = /gcm|ccm/i.test(this.cipher);
    this.digest = opts.digest ?? "sha1";

    this.secret = typeof secret === "string" ? Buffer.from(secret) : secret;

    if (signSecret) {
      this.signSecret = typeof signSecret === "string" ? Buffer.from(signSecret) : signSecret;
    } else {
      this.signSecret = this.secret;
    }

    initializeRotator(
      this,
      signSecret === undefined ? [secret] : [secret, signSecret],
      opts as Record<string, unknown>,
    );
  }

  encryptAndSign(value: unknown, options: MetadataOptions = {}): string {
    return this.createMessage(value, options);
  }

  decryptAndVerify(message: string, options: ExpectedMetadataOptions = {}): unknown {
    return this.catchAndRaise("invalid_message_format", { as: InvalidMessage }, () =>
      this.catchAndRaise("invalid_message_serialization", { as: InvalidMessage }, () =>
        this.catchAndIgnore("invalid_message_content", () => this.readMessage(message, options)),
      ),
    );
  }

  createMessage(value: unknown, options: MetadataOptions = {}): string {
    return this.signMessage(this.encrypt(this.serializeWithMetadata(value, options)));
  }

  readMessage(message: string, options: ExpectedMetadataOptions = {}): unknown {
    if (!message || typeof message !== "string") {
      throw new Thrown("invalid_message_format", "invalid message string");
    }

    return this.deserializeWithMetadata(this.decrypt(this.verifyMessage(message)), options);
  }

  private signMessage(encrypted: string): string {
    if (this.aeadMode) return encrypted;
    return `${encrypted}${SEPARATOR}${this.sign(encrypted)}`;
  }

  private verifyMessage(message: string): string {
    if (this.aeadMode) return message;

    const lastDash = message.lastIndexOf(SEPARATOR);
    if (lastDash === -1) {
      throw new Thrown("invalid_message_format", "missing message digest");
    }

    const encrypted = message.slice(0, lastDash);
    const signature = message.slice(lastDash + SEPARATOR.length);

    if (!this.verify(encrypted, signature)) {
      throw new Thrown("invalid_message_format", "mismatched digest");
    }

    return encrypted;
  }

  private encrypt(plaintext: string): string {
    const keyLength = this.keyLength();
    const key = this.secret.slice(0, keyLength);
    const ivLength = this.ivLength();
    const iv = getCrypto().randomBytes(ivLength);

    const cipher = getCrypto().createCipheriv(this.cipher, key, iv);
    if (this.aeadMode) cipher.setAAD?.(Buffer.alloc(0));
    const encrypted = Buffer.concat([cipher.update(plaintext, "latin1"), cipher.final()]);

    const parts = [this.encode(encrypted), this.encode(iv)];
    if (this.aeadMode) parts.push(this.encode(cipher.getAuthTag!()));

    return parts.join(SEPARATOR);
  }

  private decrypt(encrypted: string): string {
    const parts = encrypted.split(SEPARATOR);
    if (parts.length !== (this.aeadMode ? 3 : 2) || parts.some((part) => !part)) {
      throw new Thrown("invalid_message_format", "invalid message format");
    }

    const encryptedBuf = this.decode(parts[0]);
    const iv = this.decode(parts[1]);
    const authTag = this.aeadMode ? this.decode(parts[2]) : undefined;

    // OpenSSL does not raise on a truncated auth_tag, which would let an
    // attacker forge it — Rails checks the length itself.
    if (authTag && authTag.length !== AUTH_TAG_LENGTH) {
      throw new Thrown("invalid_message_format", "truncated auth_tag");
    }

    const keyLength = this.keyLength();
    const key = this.secret.slice(0, keyLength);

    try {
      const decipher = getCrypto().createDecipheriv(this.cipher, key, iv);
      if (authTag) decipher.setAuthTag?.(authTag);
      const decrypted = Buffer.concat([decipher.update(encryptedBuf), decipher.final()]);
      return decrypted.toString("latin1");
    } catch {
      throw new Thrown("invalid_message_format", "decryption failed");
    }
  }

  private sign(data: string): string {
    return getCrypto().createHmac(this.digest, this.signSecret).update(data).digest("hex");
  }

  private verify(data: string, signature: string): boolean {
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

Object.assign(MessageEncryptor.prototype, { rotate, onRotation, fallBackTo });
prepend(MessageEncryptor.prototype, { readMessage: readMessageWithRotations });

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
