import { Encryption } from "../namespaces.js";
import { isPlainObject } from "@blazetrails/activesupport";
import { hasKey } from "@blazetrails/ruby-compat";
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

  /**
   * @inventedArm if — CONVERGEABLE encryption-serializer-load-and-decode-arms-need-stdlib-raises
   * @inventedArm throw — CONVERGEABLE encryption-serializer-load-and-decode-arms-need-stdlib-raises
   */
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
    return new Message({
      payload: this.decodeIfNeeded(data["p"]) as string,
      headers: this.parseProperties(data["h"] as Record<string, unknown> | null, level),
    });
  }

  /** @internal */
  private validateMessageDataFormat(
    data: unknown,
    level: number,
  ): asserts data is Record<string, unknown> {
    if (level > 2) {
      throw new Decryption("More than one level of hash nesting in headers is not supported");
    }

    if (!(isPlainObject(data) && hasKey(data, "p"))) {
      throw new Decryption("Invalid data format: hash without payload");
    }
  }

  /** @internal */
  private parseProperties(
    headers: Record<string, unknown> | null | undefined,
    level: number,
  ): Properties {
    const properties = new Properties();
    for (const [key, value] of Object.entries(headers ?? {})) {
      properties.set(
        key,
        isPlainObject(value) ? this.parseMessage(value, level + 1) : this.decodeIfNeeded(value),
      );
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
    headers.each((key, value) => {
      result[key] =
        value instanceof Message ? this.messageToJson(value) : this.encodeIfNeeded(value);
    });
    return result;
  }

  /** @internal */
  private encodeIfNeeded(value: unknown): unknown {
    if (typeof value === "string" || Buffer.isBuffer(value)) {
      return Buffer.from(value as string).toString("base64");
    } else {
      return value;
    }
  }

  /**
   * @internal
   * @inventedArm if — CONVERGEABLE encryption-serializer-load-and-decode-arms-need-stdlib-raises
   * @inventedArm throw — CONVERGEABLE encryption-serializer-load-and-decode-arms-need-stdlib-raises
   */
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

Encryption.MessageSerializer = MessageSerializer;
