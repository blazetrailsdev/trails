/**
 * Encryption message — a payload with headers (properties).
 *
 * Mirrors: ActiveRecord::Encryption::Message
 */

import { Properties } from "./properties.js";
import { ForbiddenClass } from "./errors.js";

export class Message {
  payload: string | Buffer;
  headers: Properties;

  constructor(payload?: string | Buffer | null) {
    this.validatePayloadType(payload);
    this.payload = payload ?? "";
    this.headers = new Properties();
  }

  /**
   * Mirrors: Message#== (message.rb:21) —
   * `payload == other_message.payload && headers == other_message.headers`.
   *
   * Rails takes `other_message` untyped and would `NoMethodError` on anything
   * else; a `false` for a non-Message is the closer analogue of the `==` a
   * caller like `assert_equal` expects here.
   *
   * The payload is Ruby's one binary String, which trails splits into
   * `string` (text) and `Buffer` (raw cipher bytes) — both stand in for the
   * same Ruby value, so they compare on bytes rather than by JS type.
   */
  equals(other: unknown): boolean {
    if (!(other instanceof Message)) return false;
    return (
      Buffer.from(this.payload).equals(Buffer.from(other.payload)) &&
      this.headers.equals(other.headers)
    );
  }

  addHeader(key: string, value: unknown): void {
    this.headers.set(key, value);
  }

  addHeaders(props: Record<string, unknown> | Properties): void {
    this.headers.add(props);
  }

  /** @internal */
  private validatePayloadType(payload: unknown): void {
    // Rails payloads are binary Strings; in TS, raw cipher bytes are a Buffer and
    // text payloads a string. Both allowed; anything else isn't.
    if (
      payload !== undefined &&
      payload !== null &&
      typeof payload !== "string" &&
      !Buffer.isBuffer(payload)
    ) {
      throw new ForbiddenClass(`Payloads must be either nil or strings, not ${typeof payload}`);
    }
  }
}
