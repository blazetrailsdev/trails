import { Message } from "./message.js";
import { Properties } from "./properties.js";
import { Decryption, ForbiddenClass } from "./errors.js";

export interface MessageSerializerLike {
  dump(message: Message): string;
  load(serializedContent: string): Message;
  isBinary(): boolean;
}

export class MessageSerializer implements MessageSerializerLike {
  dump(message: Message): string {
    if (!(message instanceof Message)) {
      throw new ForbiddenClass(`Can only serialize Message instances, got ${typeof message}`);
    }
    return JSON.stringify(this.messageToJson(message));
  }

  load(serializedContent: string): Message {
    if (typeof serializedContent !== "string") {
      throw new TypeError(`Expected string, got ${typeof serializedContent}`);
    }
    let data: unknown;
    try {
      data = JSON.parse(serializedContent);
    } catch {
      throw new Decryption("Failed to deserialize encrypted message");
    }
    return this.parseMessage(data, 1);
  }

  isBinary(): boolean {
    return false;
  }

  /** @internal */
  private parseMessage(data: unknown, level: number): Message {
    this.validateMessageDataFormat(data, level);
    const d = data as Record<string, unknown>;
    const payload = this.decodeIfNeeded(d["p"]);
    return new Message({
      payload: typeof payload === "string" || Buffer.isBuffer(payload) ? payload : null,
      headers: this.parseProperties(d["h"] as Record<string, unknown> | null | undefined, level),
    });
  }

  /** @internal */
  private validateMessageDataFormat(data: unknown, level: number): void {
    if (level > 2) {
      throw new Decryption("More than one level of hash nesting in headers is not supported");
    }
    if (typeof data !== "object" || data === null || Array.isArray(data)) {
      throw new Decryption("Invalid data format: hash without payload");
    }
    const d = data as Record<string, unknown>;
    if (!("p" in d) || typeof d["p"] !== "string") {
      throw new Decryption("Invalid data format: hash without payload");
    }
    if (
      "h" in d &&
      d["h"] !== null &&
      d["h"] !== undefined &&
      (typeof d["h"] !== "object" || Array.isArray(d["h"]))
    ) {
      throw new Decryption("Invalid data format: headers must be an object");
    }
  }

  /** @internal */
  private parseProperties(
    headers: Record<string, unknown> | null | undefined,
    level: number,
  ): Properties {
    const properties = new Properties();
    if (headers) {
      for (const [key, value] of Object.entries(headers)) {
        const decoded =
          typeof value === "object" && value !== null && !Array.isArray(value) && "p" in value
            ? this.parseMessage(value, level + 1)
            : this.decodeIfNeeded(value);
        properties.set(key, decoded);
      }
    }
    return properties;
  }

  /** @internal */
  private messageToJson(message: Message): Record<string, unknown> {
    return Object.assign(Object.create(null) as Record<string, unknown>, {
      p: this.encodeIfNeeded(message.payload),
      h: this.headersToJson(message.headers),
    });
  }

  /** @internal */
  private headersToJson(headers: Properties): Record<string, unknown> {
    const result: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
    for (const [key, value] of headers.entries()) {
      result[key] =
        value instanceof Message ? this.messageToJson(value) : this.encodeIfNeeded(value);
    }
    return result;
  }

  /** @internal */
  private encodeIfNeeded(value: unknown): unknown {
    if (Buffer.isBuffer(value)) {
      return value.toString("base64");
    }
    if (typeof value === "string") {
      return Buffer.from(value, "utf-8").toString("base64");
    }
    return value;
  }

  /** @internal */
  private decodeIfNeeded(value: unknown): unknown {
    if (typeof value === "string") {
      try {
        const buf = Buffer.from(value, "base64");
        const reencoded = buf.toString("base64").replace(/=+$/, "");
        const normalized = value.replace(/=+$/, "");
        if (normalized !== reencoded) {
          throw new Decryption("Invalid base64 encoding");
        }
        return buf;
      } catch (e) {
        if (e instanceof Decryption) throw e;
        throw new Decryption("Invalid base64 encoding");
      }
    }
    return value;
  }
}
