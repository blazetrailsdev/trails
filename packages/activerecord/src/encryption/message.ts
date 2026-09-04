import type { Bytes } from "@blazetrails/ruby-compat";
import { Properties } from "./properties.js";
import { ForbiddenClass } from "./errors.js";

export class Message {
  payload: string | Bytes;
  headers: Properties;

  constructor({
    payload,
    headers = {},
  }: {
    payload?: string | Bytes | null;
    headers?: Record<string, unknown> | Properties;
  } = {}) {
    this.validatePayloadType(payload);
    this.payload = payload ?? "";
    this.headers = new Properties(headers);
  }

  equals(otherMessage: { payload: string | Bytes; headers: Properties | object }): boolean {
    return (
      Buffer.from(this.payload).equals(Buffer.from(otherMessage.payload)) &&
      this.headers.equals(otherMessage.headers)
    );
  }

  /** @internal */
  private validatePayloadType(payload: unknown): void {
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
