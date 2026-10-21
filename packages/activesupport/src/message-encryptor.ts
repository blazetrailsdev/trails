import { Cipher, b, prepend, rbEqual, byteslice, type Bytes } from "@blazetrails/ruby-compat";
import { MessageVerifier } from "./message-verifier.js";
import { Codec, type MessageSerializer } from "./messages/codec.js";
import type { ExpectedMetadataOptions, MetadataOptions } from "./messages/metadata.js";
import {
  fallBackTo,
  onRotation,
  readMessage as readMessageWithRotations,
  rotate,
  type OnRotation,
  type Rotatable,
  type RotatableOptions,
} from "./messages/rotator.js";
import { Thrown, type Format } from "./messages/serializer-with-fallback.js";

export namespace NullSerializer {
  export function load(value: string | Uint8Array): string | Uint8Array {
    return value;
  }

  export function dump(value: unknown): unknown {
    return value;
  }
}

export class InvalidMessage extends Error {
  static toString(): string {
    return "ActiveSupport::MessageEncryptor::InvalidMessage";
  }

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
  static toString(): string {
    return "ActiveSupport::MessageEncryptor";
  }

  static override defaultSerializer: Format | MessageSerializer = "json";

  static useAuthenticatedMessageEncryption = false;

  static defaultCipher(): string {
    return this.useAuthenticatedMessageEncryption ? "aes-256-gcm" : "aes-256-cbc";
  }

  static keyLen(cipher: string = this.defaultCipher()): number {
    return new Cipher(cipher).keyLen;
  }

  /** @internal */
  declare protected args: unknown[];
  /** @internal */
  declare protected options: Record<string, unknown>;
  /** @internal */
  declare protected rotations: Rotatable[];
  /** @internal */
  declare protected _onRotation: OnRotation | null;

  declare rotate: (...args: unknown[]) => this;
  declare onRotation: (callback: OnRotation) => this;
  declare fallBackTo: (fallback: this) => this;

  private secret: Buffer;
  private cipher: string;
  private aeadMode: boolean;
  private verifier?: MessageVerifier;
  private memoLengthOfEncodedIv?: number;
  private memoLengthOfEncodedAuthTag?: number;

  /** @inlinedFrom ActiveSupport::Messages::Rotator#initialize rails/v8.0.2/activesupport/lib/active_support/messages/rotator.rb:6-12 */
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
    const { onRotation = null, ...rest } = opts;
    opts = rest;

    super({
      serializer: opts.serializer,
      urlSafe: opts.url_safe,
      forceLegacyMetadataSerializer: opts.forceLegacyMetadataSerializer,
    });

    this.secret = typeof secret === "string" ? Buffer.from(secret) : secret;
    this.cipher = opts.cipher ?? (this.constructor as typeof MessageEncryptor).defaultCipher();
    this.aeadMode = this.newCipher().authenticated();
    this.verifier = !this.aeadMode
      ? new MessageVerifier(resolvedSignSecret ?? secret, {
          ...opts,
          serializer: NullSerializer,
        })
      : undefined;

    this.args = resolvedSignSecret === undefined ? [secret] : [secret, resolvedSignSecret];
    this.options = opts as Record<string, unknown>;
    this.rotations = [];
    this._onRotation = onRotation;
  }

  encryptAndSign(value: unknown, options: MetadataOptions = {}): string {
    return this.createMessage(value, options);
  }

  decryptAndVerify(
    message: string,
    options: ExpectedMetadataOptions & RotatableOptions = {},
  ): unknown {
    return this.catchAndRaise("invalid_message_format", { as: InvalidMessage }, () =>
      this.catchAndRaise("invalid_message_serialization", { as: InvalidMessage }, () =>
        this.catchAndIgnore("invalid_message_content", () => this.readMessage(message, options)),
      ),
    );
  }

  createMessage(value: unknown, options: MetadataOptions = {}): string {
    return this.sign(
      this.encrypt(this.serializeWithMetadata(value, options) as string | Uint8Array),
    );
  }

  readMessage(message: string, options: ExpectedMetadataOptions = {}): unknown {
    return this.deserializeWithMetadata(this.decrypt(this.verify(message)), options);
  }

  private sign(data: string): string {
    return this.verifier ? this.verifier.createMessage(data) : data;
  }

  private verify(data: string): string | Uint8Array {
    return this.verifier ? (this.verifier.readMessage(data) as string | Uint8Array) : data;
  }

  private encrypt(data: string | Uint8Array): string {
    const cipher = this.newCipher();
    cipher.encrypt();
    cipher.key = this.secret;

    const iv = cipher.randomIv();
    if (this.aeadMode) cipher.authData = "";

    let encryptedData = cipher.update(typeof data === "string" ? b(data) : data);
    encryptedData = Buffer.concat([encryptedData, cipher.final()]);

    const parts: Bytes[] = [encryptedData, iv];
    if (this.aeadMode) parts.push(cipher.authTag);

    return this.joinParts(parts);
  }

  private decrypt(encryptedMessage: string | Uint8Array): Uint8Array {
    const cipher = this.newCipher();
    const [encryptedData, iv, authTag] = this.extractParts(encryptedMessage);

    if (this.aeadMode && authTag.length !== AUTH_TAG_LENGTH) {
      throw new Thrown("invalid_message_format", "truncated auth_tag");
    }

    try {
      cipher.decrypt();
      cipher.key = this.secret;
      cipher.iv = iv;
      if (this.aeadMode) {
        cipher.authTag = authTag;
        cipher.authData = "";
      }

      const decryptedData = Buffer.concat([cipher.update(encryptedData), cipher.final()]);
      return decryptedData;
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

  private joinParts(parts: Bytes[]): string {
    return parts.map((part) => this.encode(part)).join(SEPARATOR);
  }

  private extractPart(encryptedMessage: Uint8Array, rindex: number, length: number): Uint8Array {
    const index = rindex - length;

    if (
      rbEqual(byteslice(encryptedMessage, index - SEPARATOR.length, SEPARATOR.length), SEPARATOR)
    ) {
      return byteslice(encryptedMessage, index, length)!;
    } else {
      throw new Thrown("invalid_message_format", "missing separator");
    }
  }

  private extractParts(encryptedMessage: string | Uint8Array): Bytes[] {
    encryptedMessage = b(encryptedMessage);
    const parts: Uint8Array[] = [];
    let rindex = encryptedMessage.length;

    if (this.aeadMode) {
      parts.push(this.extractPart(encryptedMessage, rindex, this.lengthOfEncodedAuthTag()));
      rindex -= SEPARATOR.length + this.lengthOfEncodedAuthTag();
    }

    parts.push(this.extractPart(encryptedMessage, rindex, this.lengthOfEncodedIv()));
    rindex -= SEPARATOR.length + this.lengthOfEncodedIv();

    parts.push(byteslice(encryptedMessage, 0, rindex)!);

    return parts.reverse().map((part) => this.decode(part));
  }

  private newCipher(): Cipher {
    return new Cipher(this.cipher);
  }
}

Object.assign(MessageEncryptor.prototype, { rotate, onRotation, fallBackTo });
prepend(MessageEncryptor.prototype, { readMessage: readMessageWithRotations });
