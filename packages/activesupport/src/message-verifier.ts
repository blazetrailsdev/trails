/**
 * MessageVerifier - signs and verifies messages using HMAC.
 * Mirrors ActiveSupport::MessageVerifier.
 */

import { getCrypto } from "./crypto-adapter.js";

export class InvalidSignature extends Error {
  constructor(message = "Invalid signature") {
    super(message);
    this.name = "InvalidSignature";
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

interface MessageVerifierOptions {
  digest?: string;
  serializer?: Serializer;
  url_safe?: boolean;
}

interface GenerateOptions {
  expiresIn?: number; // seconds
  expiresAt?: Date;
  purpose?: string;
}

interface VerifyOptions {
  purpose?: string;
}

export class MessageVerifier {
  private secret: string;
  private digest: string;
  private serializer: Serializer;
  private urlSafe: boolean;

  constructor(secret: string, options: MessageVerifierOptions = {}) {
    this.secret = secret;
    this.digest = options.digest ?? "sha1";
    this.serializer = options.serializer ?? JSONSerializer;
    this.urlSafe = options.url_safe ?? false;
  }

  generate(value: unknown, options: GenerateOptions = {}): string {
    const payload: Record<string, unknown> = { value };

    if (options.expiresAt) {
      payload._expiresAt = options.expiresAt.toISOString();
    } else if (options.expiresIn !== undefined) {
      payload._expiresAt = new Date(Date.now() + options.expiresIn * 1000).toISOString();
    }

    if (options.purpose) {
      payload._purpose = options.purpose;
    }

    const serialized = this.serializer.dump(payload);
    const encoded = this.encode(Buffer.from(serialized));
    const signature = this.sign(encoded);
    return `${encoded}--${signature}`;
  }

  verify(message: string, options: VerifyOptions = {}): unknown {
    const result = this.verified(message, options);
    if (result === null && !this.validMessage(message)) {
      throw new InvalidSignature();
    }
    // verified returns null both for invalid messages AND for null values
    // we need to distinguish between the two
    return this._verifiedOrThrow(message, options);
  }

  private _verifiedOrThrow(message: string, options: VerifyOptions = {}): unknown {
    if (!this.validMessage(message)) {
      throw new InvalidSignature();
    }

    try {
      const [encoded] = message.split("--");
      const decoded = this.decode(encoded);
      const parsed = this.serializer.load(decoded.toString());

      if (typeof parsed !== "object" || parsed === null || !("value" in (parsed as object))) {
        throw new InvalidSignature("Missing value key");
      }

      const payload = parsed as Record<string, unknown>;

      if (payload._expiresAt && new Date(payload._expiresAt as string) < new Date()) {
        throw new InvalidSignature("Expired message");
      }

      if (options.purpose && payload._purpose !== options.purpose) {
        throw new InvalidSignature("Purpose mismatch");
      }

      return payload.value;
    } catch (e) {
      if (e instanceof InvalidSignature) throw e;
      throw new InvalidSignature();
    }
  }

  verified(message: string, options: VerifyOptions = {}): unknown | null {
    try {
      return this._verifiedOrThrow(message, options);
    } catch {
      return null;
    }
  }

  validMessage(message: string): boolean {
    if (!message || typeof message !== "string") return false;

    const parts = message.split("--");
    if (parts.length < 2) return false;

    const signature = parts[parts.length - 1];
    const encoded = parts.slice(0, -1).join("--");

    if (!encoded || !signature) return false;

    try {
      const expectedSig = this.sign(encoded);
      const sigBuf = Buffer.from(signature, "hex");
      const expectedBuf = Buffer.from(expectedSig, "hex");

      if (sigBuf.length !== expectedBuf.length) return false;
      return getCrypto().timingSafeEqual(sigBuf, expectedBuf);
    } catch {
      return false;
    }
  }

  private sign(data: string): string {
    return getCrypto().createHmac(this.digest, this.secret).update(data).digest("hex");
  }

  private encode(buf: Buffer): string {
    if (this.urlSafe) {
      return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
    }
    return buf.toString("base64");
  }

  private decode(str: string): Buffer {
    // Support both url-safe and standard base64
    const normalized = str.replace(/-/g, "+").replace(/_/g, "/");
    // Add padding if needed
    const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
    return Buffer.from(padded, "base64");
  }
}
