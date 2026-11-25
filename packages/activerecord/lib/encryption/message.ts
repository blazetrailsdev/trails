import { Encryption } from "../namespaces.js";
import type { Bytes } from "@blazetrails/ruby-compat";
import { Properties } from "./properties.js";
import { ForbiddenClass } from "./errors.js";

export class Message {
  payload: string | Bytes | null;
  headers: Properties;

  constructor({
    payload,
    headers = {},
  }: {
    payload?: string | Bytes | null;
    headers?: Record<string, unknown> | Properties;
  } = {}) {
    this.validatePayloadType(payload);
    this.payload = payload ?? null;
    this.headers = new Properties(headers);
  }

  equals(otherMessage: { payload: string | Bytes | null; headers: Properties | object }): boolean {
    const otherPayload = otherMessage.payload;
    return (
      (this.payload === null || otherPayload === null
        ? this.payload === otherPayload
        : Buffer.from(this.payload).equals(Buffer.from(otherPayload))) &&
      this.headers.equals(otherMessage.headers)
    );
  }

  /** @internal */
  private validatePayloadType(payload: unknown): void {
    if (
      payload !== undefined &&
      payload !== null &&
      typeof payload !== "string" &&
      !(payload instanceof Uint8Array)
    ) {
      throw new ForbiddenClass(`Payloads must be either nil or strings, not ${typeof payload}`);
    }
  }
}

Encryption.Message = Message;
