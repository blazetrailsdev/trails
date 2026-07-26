import { MessageVerifier } from "@blazetrails/activesupport/message-verifier";

class ArgumentError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ArgumentError";
  }
}

export class Verifier extends MessageVerifier {
  protected override encode(data: string | Buffer): string {
    const buf = typeof data === "string" ? Buffer.from(data, "latin1") : data;
    return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_");
  }

  protected override decode(encoded: string): Buffer {
    let str = encoded;
    if (!str.endsWith("=") && str.length % 4 !== 0) {
      str = str.padEnd((str.length + 3) & ~3, "=");
    }
    str = str.replace(/-/g, "+").replace(/_/g, "/");

    if (!/^[A-Za-z0-9+/]*={0,2}$/.test(str) || str.length % 4 !== 0) {
      throw new ArgumentError("invalid base64");
    }
    return Buffer.from(str, "base64");
  }
}
