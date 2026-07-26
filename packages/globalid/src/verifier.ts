import { MessageVerifier } from "@blazetrails/activesupport/message-verifier";

export class Verifier extends MessageVerifier {
  protected override encode(data: string | Buffer): string {
    const buf = typeof data === "string" ? Buffer.from(data, "latin1") : data;
    return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
  }

  protected override decode(str: string): Buffer {
    const normalized = str.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
    return Buffer.from(padded, "base64");
  }
}
