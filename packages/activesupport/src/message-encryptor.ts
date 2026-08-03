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

  /** Given a cipher, returns the key length of the cipher in bytes. */
  static keyLen(cipher: string = this.defaultCipher()): number {
    const match = cipher.match(/(\d+)/);
    return match ? parseInt(match[1], 10) / 8 : 32;
  }

  declare rotate: (...args: unknown[]) => this;
  declare onRotation: (callback: OnRotation) => this;
  declare fallBackTo: (fallback: this) => this;

  private secret: Buffer;
  private signSecret: Buffer;
  private cipher: string;
  private digest: string;
  private aeadMode: boolean;
  private memoLengthOfEncodedIv?: number;
  private memoLengthOfEncodedAuthTag?: number;

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
    this.aeadMode = this.newCipher().authenticated;
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
    const encrypted = this.encrypt(this.serializeWithMetadata(value, options));
    if (this.aeadMode) return encrypted;
    return `${encrypted}${SEPARATOR}${this.sign(encrypted)}`;
  }

  readMessage(message: string, options: ExpectedMetadataOptions = {}): unknown {
    if (!message || typeof message !== "string") {
      throw new Thrown("invalid_message_format", "invalid message string");
    }

    let encrypted = message;

    if (!this.aeadMode) {
      const lastDash = message.lastIndexOf(SEPARATOR);
      if (lastDash === -1) {
        throw new Thrown("invalid_message_format", "missing message digest");
      }

      encrypted = message.slice(0, lastDash);
      const signature = message.slice(lastDash + SEPARATOR.length);

      if (!this.verify(encrypted, signature)) {
        throw new Thrown("invalid_message_format", "mismatched digest");
      }
    }

    return this.deserializeWithMetadata(this.decrypt(encrypted), options);
  }

  private encrypt(data: string): string {
    const spec = this.newCipher();
    const key = this.secret.slice(0, spec.keyLen);
    const iv = getCrypto().randomBytes(spec.ivLen);

    const cipher = getCrypto().createCipheriv(this.cipher, key, iv);
    if (this.aeadMode) cipher.setAAD?.(Buffer.alloc(0));

    const encryptedData = Buffer.concat([cipher.update(data, "latin1"), cipher.final()]);

    const parts = [encryptedData, iv];
    if (this.aeadMode) parts.push(cipher.getAuthTag!());

    return this.joinParts(parts);
  }

  private decrypt(encryptedMessage: string): string {
    const [encryptedData, iv, authTag] = this.extractParts(encryptedMessage);

    if (this.aeadMode && authTag.length !== AUTH_TAG_LENGTH) {
      throw new Thrown("invalid_message_format", "truncated auth_tag");
    }

    const key = this.secret.slice(0, this.newCipher().keyLen);

    try {
      const decipher = getCrypto().createDecipheriv(this.cipher, key, iv);
      if (this.aeadMode) decipher.setAuthTag?.(authTag);
      const decryptedData = Buffer.concat([decipher.update(encryptedData), decipher.final()]);
      return decryptedData.toString("latin1");
    } catch (error) {
      throw new Thrown("invalid_message_format", error);
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

  private lengthAfterEncode(lengthBeforeEncode: number): number {
    if (this.urlSafe) {
      return Math.ceil((4 * lengthBeforeEncode) / 3);
    } else {
      return 4 * Math.ceil(lengthBeforeEncode / 3);
    }
  }

  private lengthOfEncodedIv(): number {
    this.memoLengthOfEncodedIv ??= this.lengthAfterEncode(this.newCipher().ivLen);
    return this.memoLengthOfEncodedIv;
  }

  private lengthOfEncodedAuthTag(): number {
    this.memoLengthOfEncodedAuthTag ??= this.lengthAfterEncode(AUTH_TAG_LENGTH);
    return this.memoLengthOfEncodedAuthTag;
  }

  private joinParts(parts: Buffer[]): string {
    return parts.map((part) => this.encode(part)).join(SEPARATOR);
  }

  private extractPart(encryptedMessage: string, rindex: number, length: number): string {
    const index = rindex - length;

    if (encryptedMessage.slice(index - SEPARATOR.length, index) === SEPARATOR) {
      return encryptedMessage.slice(index, index + length);
    } else {
      throw new Thrown("invalid_message_format", "missing separator");
    }
  }

  private extractParts(encryptedMessage: string): Buffer[] {
    const parts: string[] = [];
    let rindex = encryptedMessage.length;

    if (this.aeadMode) {
      parts.push(this.extractPart(encryptedMessage, rindex, this.lengthOfEncodedAuthTag()));
      rindex -= SEPARATOR.length + this.lengthOfEncodedAuthTag();
    }

    parts.push(this.extractPart(encryptedMessage, rindex, this.lengthOfEncodedIv()));
    rindex -= SEPARATOR.length + this.lengthOfEncodedIv();

    parts.push(encryptedMessage.slice(0, rindex));

    return parts.reverse().map((part) => this.decode(part));
  }

  /**
   * Stands in for Ruby's `OpenSSL::Cipher.new(@cipher)`, which trails has no
   * analogue for. Reports only the three properties Rails reads off it.
   */
  private newCipher(): { keyLen: number; ivLen: number; authenticated: boolean } {
    const ctor = this.constructor as typeof MessageEncryptor;
    const authenticated = /gcm|ccm/i.test(this.cipher);
    return { keyLen: ctor.keyLen(this.cipher), ivLen: authenticated ? 12 : 16, authenticated };
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
