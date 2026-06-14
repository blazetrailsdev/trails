/**
 * MessagePack serialization of encrypted messages.
 *
 * Mirrors: ActiveRecord::Encryption::MessagePackMessageSerializer
 *
 * The message is converted to the hash `{ "p" => payload, "h" => headers }`
 * and packed with MessagePack, byte-for-byte like MRI's
 * `ActiveSupport::MessagePack.dump` (a `128` signature value followed by the
 * packed hash). Binary payload/iv/at travel as msgpack `bin`, text headers as
 * `str`. The packed bytes are carried as a latin1 string (one char per byte)
 * so the binary form survives a string-typed serializer interface losslessly.
 */

import { MessagePack, MessagePackError } from "@blazetrails/activesupport/message-pack";
import { Message } from "./message.js";
import { Properties } from "./properties.js";
import { DecryptionError, ForbiddenClass } from "./errors.js";
import type { MessageSerializerLike } from "./message-serializer.js";

export class MessagePackMessageSerializer implements MessageSerializerLike {
  dump(message: Message): string {
    if (!(message instanceof Message)) {
      throw new ForbiddenClass(`Can only serialize Message instances, got ${typeof message}`);
    }
    return MessagePack.dump(this.messageToHash(message)).toString("latin1");
  }

  load(serialized: string): Message {
    if (typeof serialized !== "string") {
      throw new TypeError(`Expected string, got ${typeof serialized}`);
    }
    let data: unknown;
    try {
      data = MessagePack.load(Buffer.from(serialized, "latin1"));
    } catch (e) {
      // ActiveSupport::MessagePack raises MessagePackError on a missing/wrong
      // signature or malformed bytes — both mean an undecodable message.
      if (e instanceof MessagePackError)
        throw new DecryptionError("Failed to load MessagePack message");
      throw e;
    }
    return this.hashToMessage(data, 1);
  }

  isBinary(): boolean {
    return true;
  }

  /** @internal */
  private messageToHash(message: Message): Record<string, unknown> {
    return Object.assign(Object.create(null) as Record<string, unknown>, {
      p: message.payload,
      h: this.headersToHash(message.headers),
    });
  }

  /** @internal */
  private headersToHash(headers: Properties): Record<string, unknown> {
    const result: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
    for (const [key, value] of headers.entries()) {
      result[key] = value instanceof Message ? this.messageToHash(value) : value;
    }
    return result;
  }

  /** @internal */
  private hashToMessage(data: unknown, level: number): Message {
    this.validateMessageDataFormat(data, level);
    const d = data as Record<string, unknown>;
    const payload = d["p"];
    const message = new Message(
      typeof payload === "string" || Buffer.isBuffer(payload) ? payload : null,
    );
    const headers = this.parseProperties(d["h"] as Record<string, unknown> | null, level);
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
    if (typeof data !== "object" || data === null || Array.isArray(data) || Buffer.isBuffer(data)) {
      throw new DecryptionError("Invalid data format: hash without payload");
    }
    const d = data as Record<string, unknown>;
    if (!("p" in d)) {
      throw new DecryptionError("Invalid data format: hash without payload");
    }
    if (
      "h" in d &&
      d["h"] !== null &&
      d["h"] !== undefined &&
      (typeof d["h"] !== "object" || Array.isArray(d["h"]) || Buffer.isBuffer(d["h"]))
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
          typeof value === "object" &&
          value !== null &&
          !Array.isArray(value) &&
          !Buffer.isBuffer(value)
            ? this.hashToMessage(value, level + 1)
            : value;
        properties.set(key, decoded);
      }
    }
    return properties;
  }
}
