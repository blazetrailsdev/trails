import { DigestInstance, OpenSSL, prepend, type Bytes } from "@blazetrails/ruby-compat";
import { isPresent } from "./core-ext/object/blank.js";
import { SecurityUtils } from "./security-utils.js";
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
import { ArgumentError, Thrown, type Format } from "./messages/serializer-with-fallback.js";

export class InvalidSignature extends Error {
  constructor(message = "Invalid signature") {
    super(message);
    this.name = "InvalidSignature";
  }
}

interface MessageVerifierOptions extends RotatableOptions {
  digest?: string;
  serializer?: Format | MessageSerializer;
  url_safe?: boolean;
  forceLegacyMetadataSerializer?: boolean;
}

type GenerateOptions = MetadataOptions;

type VerifyOptions = ExpectedMetadataOptions & RotatableOptions;

const SEPARATOR = "--";
const SEPARATOR_LENGTH = SEPARATOR.length;

export class MessageVerifier extends Codec {
  static override defaultSerializer: Format | MessageSerializer = "json";

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
  declare fallBackTo: (fallback: MessageVerifier) => this;

  private secret: string | Bytes;
  private digest: string;

  /** @inlinedFrom ActiveSupport::Messages::Rotator#initialize rails/v8.0.2/activesupport/lib/active_support/messages/rotator.rb:6-12 */
  constructor(
    secret: string | Bytes,
    { onRotation = null, ...options }: MessageVerifierOptions = {},
  ) {
    if (secret == null) throw new ArgumentError("Secret should not be nil.");
    super({
      serializer: options.serializer,
      urlSafe: options.url_safe,
      forceLegacyMetadataSerializer: options.forceLegacyMetadataSerializer,
    });
    this.secret = secret;
    this.digest = options.digest ?? "sha1";
    this.args = [secret];
    this.options = options;
    this.rotations = [];
    this._onRotation = onRotation;
  }

  generate(value: unknown, options: GenerateOptions = {}): string {
    return this.createMessage(value, options);
  }

  createMessage(value: unknown, options: GenerateOptions = {}): string {
    return this.signEncoded(this.encode(this.serializeWithMetadata(value, options) as string));
  }

  verify(message: string, options: VerifyOptions = {}): unknown {
    return this.catchAndRaise("invalid_message_format", { as: InvalidSignature }, () =>
      this.catchAndRaise("invalid_message_serialization", {}, () =>
        this.catchAndRaise("invalid_message_content", { as: InvalidSignature }, () =>
          this.readMessage(message, options),
        ),
      ),
    );
  }

  verified(message: string, options: VerifyOptions = {}): unknown | null {
    return this.catchAndIgnore("invalid_message_format", () =>
      this.catchAndRaise("invalid_message_serialization", {}, () =>
        this.catchAndIgnore("invalid_message_content", () => this.readMessage(message, options)),
      ),
    );
  }

  validMessage(message: string): boolean {
    return !!this.catchAndIgnore("invalid_message_format", () => this.extractEncoded(message));
  }

  readMessage(message: string, options: VerifyOptions = {}): unknown {
    return this.deserializeWithMetadata(this.decode(this.extractEncoded(message)), options);
  }

  private signEncoded(encoded: string): string {
    return `${encoded}${SEPARATOR}${this.generateDigest(encoded)}`;
  }

  private extractEncoded(signed: string): string {
    if (signed == null || typeof signed !== "string" || /\p{Cs}/u.test(signed)) {
      throw new Thrown("invalid_message_format", "invalid message string");
    }

    let encoded: string | undefined;
    let digest: string | undefined;
    const separatorIndex = this.separatorIndexFor(signed);
    if (separatorIndex != null) {
      encoded = signed.slice(0, separatorIndex);
      digest = signed.slice(
        separatorIndex + SEPARATOR_LENGTH,
        separatorIndex + SEPARATOR_LENGTH + this.digestLengthInHex(),
      );
    }

    if (!this.isDigestMatchesData(digest, encoded)) {
      throw new Thrown("invalid_message_format", "mismatched digest");
    }

    return encoded!;
  }

  private generateDigest(data: string): string {
    return OpenSSL.HMAC.hexdigest(this.digest, this.secret, data);
  }

  private _digestLengthInHex?: number;

  private digestLengthInHex(): number {
    return (this._digestLengthInHex ??= new DigestInstance(this.digest).digestLength() * 2);
  }

  private isSeparatorAt(signedMessage: string, index: number): boolean {
    return signedMessage.slice(index, index + SEPARATOR_LENGTH) === SEPARATOR;
  }

  private separatorIndexFor(signedMessage: string): number | undefined {
    const index = signedMessage.length - this.digestLengthInHex() - SEPARATOR_LENGTH;
    if (!(index < 0 || !this.isSeparatorAt(signedMessage, index))) return index;
    return undefined;
  }

  private isDigestMatchesData(digest: string | undefined, data: string | undefined): boolean {
    return (
      isPresent(data) &&
      isPresent(digest) &&
      SecurityUtils.secureCompare(digest!, this.generateDigest(data!))
    );
  }

  protected override decode(
    encoded: string,
    { urlSafe = this.urlSafe }: { urlSafe?: boolean } = {},
  ): Buffer {
    try {
      return super.decode(encoded, { urlSafe });
    } catch (error) {
      if (error instanceof Thrown && error.tag === "invalid_message_format") {
        return super.decode(encoded, { urlSafe: !urlSafe });
      }
      throw error;
    }
  }
}

Object.assign(MessageVerifier.prototype, { rotate, onRotation, fallBackTo });
prepend(MessageVerifier, { readMessage: readMessageWithRotations });
