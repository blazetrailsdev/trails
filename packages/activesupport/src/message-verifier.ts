import { getCrypto } from "./crypto-adapter.js";
import { Codec, Thrown, type MessageSerializer } from "./messages/codec.js";
import type { Format } from "./messages/serializer-with-fallback.js";
import { Temporal } from "./temporal.js";
import { currentTimeInstant } from "./time-travel.js";

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
}

interface GenerateOptions {
  expiresIn?: number; // seconds
  expiresAt?: Temporal.Instant;
  purpose?: string | null;
}

interface VerifyOptions {
  purpose?: string | null;
}

export class MessageVerifier extends Codec {
  static override defaultSerializer: Format | MessageSerializer = "json";

  private secret: string | Buffer;
  private digest: string;

  constructor(secret: string | Buffer, options: MessageVerifierOptions = {}) {
    super({ serializer: options.serializer, urlSafe: options.url_safe });
    this.secret = secret;
    this.digest = options.digest ?? "sha1";
  }

  generate(value: unknown, options: GenerateOptions = {}): string {
    const payload: Record<string, unknown> = { value };

    if (options.expiresAt) {
      payload._expiresAt = options.expiresAt.toString({ smallestUnit: "millisecond" });
    } else if (options.expiresIn !== undefined) {
      const milliseconds = Math.round(options.expiresIn * 1000);
      payload._expiresAt = currentTimeInstant()
        .add({ milliseconds })
        .toString({ smallestUnit: "millisecond" });
    }

    if (options.purpose) {
      payload._purpose = options.purpose;
    }

    const serialized = this.serialize(payload);
    const encoded = this.encode(serialized);
    const signature = this.sign(encoded);
    return `${encoded}--${signature}`;
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

  private readMessage(message: string, options: VerifyOptions): unknown {
    const encoded = this.extractEncoded(message);
    const parsed = this.deserialize(this.decode(encoded).toString("latin1"));
    return this.verifyMetadata(parsed, options);
  }

  private verifyMetadata(parsed: unknown, options: VerifyOptions): unknown {
    if (typeof parsed !== "object" || parsed === null || !("value" in parsed)) {
      throw new Thrown("invalid_message_content", "missing value key");
    }

    const payload = parsed as Record<string, unknown>;

    if (payload._expiresAt) {
      const expiresAt = Temporal.Instant.from(payload._expiresAt as string);
      if (Temporal.Instant.compare(expiresAt, currentTimeInstant()) <= 0) {
        throw new Thrown("invalid_message_content", "expired message");
      }
    }

    if (options.purpose && payload._purpose !== options.purpose) {
      throw new Thrown("invalid_message_content", "mismatched purpose");
    }

    return payload.value;
  }

  private extractEncoded(signed: string): string {
    if (!signed || typeof signed !== "string") {
      throw new Thrown("invalid_message_format", "invalid message string");
    }

    const parts = signed.split("--");
    const signature = parts.length < 2 ? undefined : parts[parts.length - 1];
    const encoded = parts.slice(0, -1).join("--");

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
      const expectedBuf = Buffer.from(this.sign(encoded), "hex");
      if (sigBuf.length !== expectedBuf.length) return false;
      return getCrypto().timingSafeEqual(sigBuf, expectedBuf);
    } catch {
      return false;
    }
  }

  private sign(data: string): string {
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
