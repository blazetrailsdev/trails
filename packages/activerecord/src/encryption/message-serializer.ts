/**
 * JSON serialization of encrypted messages.
 *
 * Mirrors: ActiveRecord::Encryption::MessageSerializer
 */

import { Message } from "./message.js";
import { Properties } from "./properties.js";
import { DecryptionError, ForbiddenClass } from "./errors.js";

export interface MessageSerializerLike {
  dump(message: Message): string;
  load(serialized: string): Message;
  isBinary(): boolean;
}

export class MessageSerializer implements MessageSerializerLike {
  dump(message: Message): string {
    if (!(message instanceof Message)) {
      throw new ForbiddenClass(`Can only serialize Message instances, got ${typeof message}`);
    }
    return JSON.stringify(this.messageToJson(message));
  }

  load(serialized: string): Message {
    if (typeof serialized !== "string") {
      throw new TypeError(`Expected string, got ${typeof serialized}`);
    }
    let data: unknown;
    try {
      data = JSON.parse(serialized);
    } catch {
      throw new DecryptionError("Failed to deserialize encrypted message");
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
    const headers = this.parseProperties(
      d["h"] as Record<string, unknown> | null | undefined,
      level,
    );
    // decodeIfNeeded returns a Buffer of raw bytes for a present payload; a
    // missing/non-string `p` decodes to a non-bytes value, which becomes a null
    // payload. Message accepts both string and Buffer payloads.
    const message = new Message(
      typeof payload === "string" || Buffer.isBuffer(payload) ? payload : null,
    );
    let nestedCount = 0;
    for (const [key, value] of headers.entries()) {
      if (value instanceof Message) {
        nestedCount++;
        if (nestedCount > 1) {
          throw new DecryptionError("Messages can only have one nested message in their headers");
        }
      }
      message.headers.set(key, value);
    }
    return message;
  }

  /** @internal */
  private validateMessageDataFormat(data: unknown, level: number): void {
    if (level > 2) {
      throw new DecryptionError("More than one level of hash nesting in headers is not supported");
    }
    if (typeof data !== "object" || data === null || Array.isArray(data)) {
      throw new DecryptionError("Invalid data format: hash without payload");
    }
    const d = data as Record<string, unknown>;
    if (!("p" in d) || typeof d["p"] !== "string") {
      throw new DecryptionError("Invalid data format: hash without payload");
    }
    if (
      "h" in d &&
      d["h"] !== null &&
      d["h"] !== undefined &&
      (typeof d["h"] !== "object" || Array.isArray(d["h"]))
    ) {
      throw new DecryptionError("Invalid data format: headers must be an object");
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
    // Mirrors Rails: Base64.strict_encode64(value) — a single base64 hop over the
    // value's bytes. Raw cipher bytes arrive as a Buffer (iv, at, payload) and are
    // encoded directly; genuine text headers arrive as a string and are encoded as
    // their UTF-8 bytes, exactly like Rails encodes a String's bytes. (Booleans and
    // numbers pass through untouched.)
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
          throw new DecryptionError("Invalid base64 encoding");
        }
        // Mirrors Rails: Base64.strict_decode64 returns the raw decoded bytes
        // (an ASCII-8BIT String). We return a Buffer so cipher payload/iv/at keep
        // lossless raw bytes AND text headers (e.g. UTF-8 public tags) stay
        // recoverable — the consumer decodes them (`.toString("utf-8")`) exactly
        // as Rails consumers re-interpret the binary string. Decoding everything
        // to latin1 here would mojibake non-ASCII text.
        return buf;
      } catch (e) {
        if (e instanceof DecryptionError) throw e;
        throw new DecryptionError("Invalid base64 encoding");
      }
    }
    return value;
  }
}
