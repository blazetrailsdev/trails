import { getCrypto, prepend } from "@blazetrails/ruby-compat";
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

type VerifyOptions = ExpectedMetadataOptions;

const SEPARATOR = "--";

export class MessageVerifier extends Codec {
  static override defaultSerializer: Format | MessageSerializer = "json";

  declare rotate: (...args: unknown[]) => this;
  declare onRotation: (callback: OnRotation) => this;
  /** Ruby's `fall_back_to(fallback)` takes any verifier, not one of the
   * receiver's own class (`messages/rotator.rb:23-26`); a `this`-typed
   * parameter would make a subclass — `GlobalID::Verifier` — unassignable to
   * `MessageVerifier`. */
  declare fallBackTo: (fallback: MessageVerifier) => this;

  private secret: string | Buffer;
  private digest: string;

  constructor(secret: string | Buffer, options: MessageVerifierOptions = {}) {
    // Ruby's `unless secret` rejects only nil and false; an empty secret is
    // truthy there, so this must not be a plain JS falsiness check.
    if (secret == null) throw new ArgumentError("Secret should not be nil.");
    super({
      serializer: options.serializer,
      urlSafe: options.url_safe,
      forceLegacyMetadataSerializer: options.forceLegacyMetadataSerializer,
    });
    this.secret = secret;
    this.digest = options.digest ?? "sha1";
    initializeRotator(this, [secret], options as Record<string, unknown>);
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
    return this.deserializeWithMetadata(
      this.decode(this.extractEncoded(message)).toString("latin1"),
      options,
    );
  }

  private signEncoded(encoded: string): string {
    return `${encoded}${SEPARATOR}${this.generateDigest(encoded)}`;
  }

  private extractEncoded(signed: string): string {
    if (!signed || typeof signed !== "string") {
      throw new Thrown("invalid_message_format", "invalid message string");
    }

    const parts = signed.split(SEPARATOR);
    const signature = parts.length < 2 ? undefined : parts[parts.length - 1];
    const encoded = parts.slice(0, -1).join(SEPARATOR);

    if (!encoded || !signature) {
      throw new Thrown("invalid_message_format", "missing message digest");
    }

    if (!this.digestMatches(encoded, signature)) {
      throw new Thrown("invalid_message_format", "mismatched digest");
    }

    return encoded;
  }

  private digestMatches(encoded: string, signature: string): boolean {
    try {
      const sigBuf = Buffer.from(signature, "hex");
      const expectedBuf = Buffer.from(this.generateDigest(encoded), "hex");
      if (sigBuf.length !== expectedBuf.length) return false;
      return getCrypto().timingSafeEqual(sigBuf, expectedBuf);
    } catch {
      return false;
    }
  }

  /**
   * @missingRailsCall hexdigest — PERMANENT: Rails calls `OpenSSL::HMAC.hexdigest`; trails
   *   routes every HMAC through the crypto adapter
   *   (`createHmac(...).digest("hex")`), which is the same digest by a different
   *   call.
   */
  private generateDigest(data: string): string {
    return getCrypto().createHmac(this.digest, this.secret).update(data).digest("hex");
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
prepend(MessageVerifier.prototype, { readMessage: readMessageWithRotations });
