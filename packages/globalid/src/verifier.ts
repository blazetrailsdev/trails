import { MessageVerifier } from "@blazetrails/activesupport/message-verifier";
import type { Temporal } from "@blazetrails/activesupport/temporal";

/**
 * Mirrors: GlobalID::Verifier. Rails subclasses `ActiveSupport::MessageVerifier`
 * with SHA-256 + URL-safe base64 encoding so SGIDs can be embedded directly
 * in URLs. Our MessageVerifier already supports `url_safe: true` natively,
 * so Verifier here is a preset wrapper rather than a true subclass — TS
 * private fields make subclassing MessageVerifier's encode/decode hooks
 * impractical.
 */
export class Verifier {
  private readonly inner: MessageVerifier;

  constructor(secret: string) {
    this.inner = new MessageVerifier(secret, { digest: "sha256", url_safe: true });
  }

  /** Sign and serialize `data` into a URL-safe token. */
  generate(data: unknown, options?: { purpose?: string; expiresAt?: Temporal.Instant }): string {
    return this.inner.generate(data, options);
  }

  /** Verify a token and return the decoded payload, or null on invalid signature. */
  verified(message: string, options?: { purpose?: string }): unknown {
    return this.inner.verified(message, options);
  }

  /**
   * @internal Mirrors: GlobalID::Verifier#encode — Base64.urlsafe_encode64.
   * Not called from the verify/generate path (MessageVerifier handles
   * urlsafe encoding internally via `url_safe: true`); kept for api:compare
   * parity and as a primitive callers can use directly if they need
   * urlsafe encoding without the verifier signature.
   */
  private encode(data: Buffer | string): string {
    const buf = typeof data === "string" ? Buffer.from(data) : data;
    return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
  }

  /**
   * @internal Mirrors: GlobalID::Verifier#decode — Base64.urlsafe_decode64.
   * Tolerates both urlsafe and standard base64 (matches what
   * MessageVerifier does in its own decode).
   */
  private decode(data: string): Buffer {
    const normalized = data.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
    return Buffer.from(padded, "base64");
  }
}
