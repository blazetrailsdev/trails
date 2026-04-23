/**
 * JSON serialization of encrypted messages.
 *
 * Mirrors: ActiveRecord::Encryption::MessageSerializer
 */

import { Message } from "./message.js";
import { DecryptionError, ForbiddenClass } from "./errors.js";

export class MessageSerializer {
  dump(message: Message): string {
    if (!(message instanceof Message)) {
      throw new ForbiddenClass(`Can only serialize Message instances, got ${typeof message}`);
    }
    const headers: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
    const data: Record<string, unknown> = {
      p: Buffer.from(message.payload, "utf-8").toString("base64"),
      h: headers,
    };
    for (const [key, value] of message.headers.entries()) {
      if (value instanceof Message) {
        headers[key] = JSON.parse(this.dump(value));
      } else {
        headers[key] = value;
      }
    }
    return JSON.stringify(data);
  }

  load(serialized: string): Message {
    if (typeof serialized !== "string") {
      throw new TypeError(`Expected string, got ${typeof serialized}`);
    }

    let data: any;
    try {
      data = JSON.parse(serialized);
    } catch {
      throw new DecryptionError("Failed to deserialize encrypted message");
    }

    if (typeof data !== "object" || data === null || Array.isArray(data)) {
      throw new DecryptionError("Invalid encrypted message format");
    }

    if (!("p" in data)) {
      throw new DecryptionError("Invalid encrypted message format: missing payload");
    }

    if (typeof data.p !== "string") {
      throw new DecryptionError("Invalid encrypted message format: payload not base64");
    }
    const payloadBuffer = Buffer.from(data.p, "base64");
    const reencoded = payloadBuffer.toString("base64").replace(/=+$/, "");
    const normalizedOriginal = data.p.replace(/=+$/, "");
    if (normalizedOriginal !== reencoded) {
      throw new DecryptionError("Invalid encrypted message format: payload not base64");
    }
    const payload = payloadBuffer.toString("utf-8");

    const message = new Message(payload);
    const headers = data.h;
    if (Array.isArray(headers)) {
      throw new DecryptionError("Invalid encrypted message format: headers must be a JSON object");
    }
    if (headers && typeof headers === "object") {
      const nestedMessages: string[] = [];
      for (const [key, value] of Object.entries(headers)) {
        if (
          typeof value === "object" &&
          value !== null &&
          !Array.isArray(value) &&
          "p" in (value as any)
        ) {
          nestedMessages.push(key);
          if (nestedMessages.length > 1) {
            throw new DecryptionError("Messages can only have one nested message in their headers");
          }
          const nested = this.load(JSON.stringify(value));
          message.headers.set(key, nested);
        } else {
          message.headers.set(key, value);
        }
      }
    }

    return message;
  }

  isBinary(): boolean {
    return false;
  }
}
