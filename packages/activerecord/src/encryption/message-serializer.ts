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
    const data: Record<string, unknown> = {
      p: Buffer.from(message.payload, "utf-8").toString("base64"),
      h: {} as Record<string, unknown>,
    };
    const headers = data.h as Record<string, unknown>;
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

    let payload: string;
    try {
      payload = Buffer.from(data.p, "base64").toString("utf-8");
    } catch {
      throw new DecryptionError("Invalid encrypted message format: payload not base64");
    }

    const message = new Message(payload);
    const headers = data.h;
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
}
