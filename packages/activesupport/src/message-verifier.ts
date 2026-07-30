import { getCrypto } from "./crypto-adapter.js";
import { Codec, type MessageSerializer } from "./messages/codec.js";
import type { ExpectedMetadataOptions, MetadataOptions } from "./messages/metadata.js";
import { Thrown, type Format } from "./messages/serializer-with-fallback.js";

export class InvalidSignature extends Error {
  constructor(message = "Invalid signature") {
    super(message);
    this.name = "InvalidSignature";
  }
}

interface MessageVerifierOptions {
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

  private secret: string | Buffer;
  private digest: string;

  constructor(secret: string | Buffer, options: MessageVerifierOptions = {}) {
    super({
      serializer: options.serializer,
      urlSafe: options.url_safe,
      forceLegacyMetadataSerializer: options.forceLegacyMetadataSerializer,
    });
    this.secret = secret;
    this.digest = options.digest ?? "sha1";
  }

  generate(value: unknown, options: GenerateOptions = {}): string {
    return this.createMessage(value, options);
  }

  createMessage(value: unknown, options: GenerateOptions = {}): string {
    return this.signEncoded(this.encode(this.serializeWithMetadata(value, options)));
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

  private generateDigest(data: string): string {
    return getCrypto().createHmac(this.digest, this.secret).update(data).digest("hex");
  }

  protected override decode(encoded: string, urlSafe: boolean = this.urlSafe): Buffer {
    try {
      return super.decode(encoded, urlSafe);
    } catch (error) {
      if (error instanceof Thrown && error.tag === "invalid_message_format") {
        return super.decode(encoded, !urlSafe);
      }
      throw error;
    }
  }
}
