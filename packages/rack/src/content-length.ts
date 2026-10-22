import type { RackHeaders } from "./index.js";
import { rbCheckArrayType, rbFSend, rbObjRespondTo } from "@blazetrails/ruby-compat";
import { CONTENT_LENGTH, TRANSFER_ENCODING, STATUS_WITH_NO_ENTITY_BODY } from "./constants.js";
import type { RackApp } from "./mock-request.js";

export class ContentLength {
  private app: RackApp;

  constructor(app: RackApp) {
    this.app = app;
  }

  async call(env: Record<string, any>): Promise<[number, RackHeaders, any]> {
    const response = await (rbFSend(this.app, "call", env) as ReturnType<typeof this.app>);
    const [status, headers] = response;
    let [, , body] = response;

    if (
      !Object.hasOwn(STATUS_WITH_NO_ENTITY_BODY, status) &&
      !headers[CONTENT_LENGTH] &&
      !headers[TRANSFER_ENCODING] &&
      rbObjRespondTo(body, "toAry")
    ) {
      response[2] = body = rbCheckArrayType(body) as Array<string | Uint8Array>;
      const totalSize = body.reduce(
        (sum: number, chunk: string | Uint8Array) => sum + Buffer.byteLength(chunk),
        0,
      );
      headers[CONTENT_LENGTH] = String(totalSize);
    }

    return response;
  }
}
