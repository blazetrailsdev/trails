import { getCrypto } from "./crypto-adapter.js";
import { MessageVerifier } from "./message-verifier.js";
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

export namespace NullSerializer {
  export function load(value: string): string {
    return value;
  }

  export function dump(value: unknown): unknown {
    return value;
  }
}

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
  url_safe?: boolean;
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

  /**
   * Given a cipher, returns the key length of the cipher in bytes.
   *
   * @missingRailsCall new — PERMANENT: Rails' key_len is
   *   `OpenSSL::Cipher.new(cipher).key_len`; trails has no OpenSSL::Cipher
   *   binding, so keyLen derives the byte length from the cipher name instead of
   *   instantiating a cipher.
   */
  static keyLen(cipher: string = this.defaultCipher()): number {
    const match = cipher.match(/(\d+)/);
    return match ? parseInt(match[1], 10) / 8 : 32;
  }

  declare rotate: (...args: unknown[]) => this;
  declare onRotation: (callback: OnRotation) => this;
  declare fallBackTo: (fallback: this) => this;

  private secret: Buffer;
  private cipher: string;
  private aeadMode: boolean;
  private verifier?: MessageVerifier;
  private memoLengthOfEncodedIv?: number;
  private memoLengthOfEncodedAuthTag?: number;

  constructor(
    secret: string | Buffer,
    signSecret?: string | Buffer | MessageEncryptorOptions,
    options?: MessageEncryptorOptions,
  ) {
    let resolvedSignSecret: string | Buffer | undefined;
    let opts: MessageEncryptorOptions;

    if (signSecret && typeof signSecret === "object" && !Buffer.isBuffer(signSecret)) {
      opts = signSecret;
    } else {
      resolvedSignSecret = signSecret;
      opts = options ?? {};
    }

    super({
      serializer: opts.serializer,
      urlSafe: opts.url_safe,
      forceLegacyMetadataSerializer: opts.forceLegacyMetadataSerializer,
    });

    this.secret = typeof secret === "string" ? Buffer.from(secret) : secret;
    this.cipher = opts.cipher ?? (this.constructor as typeof MessageEncryptor).defaultCipher();
    this.aeadMode = this.newCipher().authenticated;
    this.verifier = !this.aeadMode
      ? new MessageVerifier(resolvedSignSecret ?? secret, {
          ...opts,
          serializer: NullSerializer,
        })
      : undefined;

    initializeRotator(
      this,
      resolvedSignSecret === undefined ? [secret] : [secret, resolvedSignSecret],
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
    return this.sign(this.encrypt(this.serializeWithMetadata(value, options) as string));
  }

  readMessage(message: string, options: ExpectedMetadataOptions = {}): unknown {
    return this.deserializeWithMetadata(this.decrypt(this.verify(message)), options);
  }

  private sign(data: string): string {
    return this.verifier ? this.verifier.createMessage(data) : data;
  }

  private verify(data: string): string {
    return this.verifier ? (this.verifier.readMessage(data) as string) : data;
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
   *
   * @missingRailsCall new — PERMANENT: Same gap as `key_len` above: Rails' new_cipher is
   *   `OpenSSL::Cipher.new(@cipher)` (message_encryptor.rb:367-369) and trails
   *   has no OpenSSL::Cipher binding, so newCipher returns a spec derived from
   *   the cipher name instead of instantiating a cipher.
   */
  private newCipher(): { keyLen: number; ivLen: number; authenticated: boolean } {
    const ctor = this.constructor as typeof MessageEncryptor;
    const authenticated = /gcm|ccm/i.test(this.cipher);
    return { keyLen: ctor.keyLen(this.cipher), ivLen: authenticated ? 12 : 16, authenticated };
  }
}

Object.assign(MessageEncryptor.prototype, { rotate, onRotation, fallBackTo });
prepend(MessageEncryptor.prototype, { readMessage: readMessageWithRotations });
