import { Encryption } from "../namespaces.js";
import { isPlainObject } from "@blazetrails/activesupport";
import {
  ArgumentError,
  b,
  Base64,
  JSON,
  transformValues,
  type Bytes,
  type Hash,
} from "@blazetrails/ruby-compat";
import { Message } from "./message.js";
import { Properties } from "./properties.js";
import { Decryption, Encoding, ForbiddenClass } from "./errors.js";

export interface MessageSerializerLike {
  dump(message: Message): string | Bytes;
  load(serializedContent: string | Bytes): Message;
  isBinary(): boolean;
}

export class MessageSerializer implements MessageSerializerLike {
  dump(message: Message): string {
    if (!(message instanceof Message)) {
      throw new ForbiddenClass();
    }
    return JSON.dump(this.messageToJson(message));
  }

  load(serializedContent: string | Bytes): Message {
    let data: unknown;
    try {
      data = JSON.parse(serializedContent);
    } catch (e) {
      if (!(e instanceof SyntaxError)) throw e;
      throw new Encoding();
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

    if (!(isPlainObject(data) && "p" in data)) {
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
    return {
      p: this.encodeIfNeeded(message.payload),
      h: this.headersToJson(message.headers),
    };
  }

  /** @internal */
  private headersToJson(headers: Properties): Hash<string, unknown> {
    return transformValues(headers.toH(), (value) =>
      value instanceof Message ? this.messageToJson(value) : this.encodeIfNeeded(value),
    );
  }

  /**
   * @internal
   * @inventedArm b — PERMANENT
   */
  private encodeIfNeeded(value: unknown): unknown {
    if (typeof value === "string" || value instanceof Uint8Array) {
      value = b(value);
      return Base64.strictEncode64(value as string);
    } else {
      return value;
    }
  }

  /**
   * @internal
   * @inventedArm from — PERMANENT
   */
  private decodeIfNeeded(value: unknown): unknown {
    try {
      if (typeof value === "string") {
        return Buffer.from(Base64.strictDecode64(value), "latin1");
      } else {
        return value;
      }
    } catch (e) {
      if (!(e instanceof ArgumentError || e instanceof TypeError)) throw e;
      throw new Encoding();
    }
  }
}

Encryption.MessageSerializer = MessageSerializer;
