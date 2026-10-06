import { MessagePack } from "@blazetrails/activesupport/message-pack";
import { isPlainObject } from "@blazetrails/activesupport";
import { RuntimeError, hasKey, type Bytes } from "@blazetrails/ruby-compat";
import { Message } from "./message.js";
import { Properties } from "./properties.js";
import { Decryption, ForbiddenClass } from "./errors.js";
import type { MessageSerializerLike } from "./message-serializer.js";

export class MessagePackMessageSerializer implements MessageSerializerLike {
  dump(message: Message): Bytes {
    if (!(message instanceof Message)) {
      throw new ForbiddenClass(`Can only serialize Message instances, got ${typeof message}`);
    }
    return MessagePack.dump(this.messageToHash(message));
  }

  load(serializedContent: string | Bytes): Message {
    try {
      const data = MessagePack.load(serializedContent);
      return this.hashToMessage(data, 1);
    } catch (e) {
      if (e instanceof RuntimeError) throw new Decryption();
      throw e;
    }
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
    headers.each((key, value) => {
      result[key] = value instanceof Message ? this.messageToHash(value) : value;
    });
    return result;
  }

  /** @internal */
  private hashToMessage(data: unknown, level: number): Message {
    this.validateMessageDataFormat(data, level);
    return new Message({
      payload: data["p"] as string,
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
      properties.set(key, isPlainObject(value) ? this.hashToMessage(value, level + 1) : value);
    }
    return properties;
  }
}
