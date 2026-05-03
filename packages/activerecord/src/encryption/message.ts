/**
 * Encryption message — a payload with headers (properties).
 *
 * Mirrors: ActiveRecord::Encryption::Message
 */

import { Properties } from "./properties.js";
import { ForbiddenClass } from "./errors.js";

export class Message {
  payload: string;
  headers: Properties;

  constructor(payload?: string | null) {
    this.validatePayloadType(payload);
    this.payload = payload ?? "";
    this.headers = new Properties();
  }

  addHeader(key: string, value: unknown): void {
    this.headers.set(key, value);
  }

  addHeaders(props: Record<string, unknown>): void {
    this.headers.add(props);
  }

  /** @internal */
  private validatePayloadType(payload: unknown): void {
    if (payload !== undefined && payload !== null && typeof payload !== "string") {
      throw new ForbiddenClass(`Payloads must be either nil or strings, not ${typeof payload}`);
    }
  }
}
