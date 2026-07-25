import { MessageVerifier } from "@blazetrails/activesupport/message-verifier";

/**
 * Mirrors: GlobalID::Verifier — an `ActiveSupport::MessageVerifier` subclass
 * whose only declared surface is the URL-safe base64 `encode`/`decode` pair,
 * so SGIDs can be embedded directly in URLs. Everything else (`generate`,
 * `verify`, `verified`, the digest default) is inherited, as in Rails.
 */
export class Verifier extends MessageVerifier {
  /**
   * @internal Mirrors: GlobalID::Verifier#encode — Base64.urlsafe_encode64.
   * Padding is stripped so the token carries no `=` either.
   */
  protected encode(buf: Buffer): string {
    return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
  }

  /**
   * @internal Mirrors: GlobalID::Verifier#decode — Base64.urlsafe_decode64.
   * Tolerates both urlsafe and standard base64, so a token issued by a
   * non-urlsafe verifier with the same secret still verifies.
   */
  protected decode(str: string): Buffer {
    const normalized = str.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
    return Buffer.from(padded, "base64");
  }
}
