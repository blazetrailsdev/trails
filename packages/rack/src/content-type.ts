import type { RackHeaders } from "./index.js";
import { rbFSend } from "@blazetrails/ruby-compat";
import { CONTENT_TYPE, STATUS_WITH_NO_ENTITY_BODY } from "./constants.js";
import type { RackApp } from "./mock-request.js";

export class ContentType {
  private app: RackApp;
  private contentType: string;

  constructor(app: RackApp, contentType = "text/html") {
    this.app = app;
    this.contentType = contentType;
  }

  async call(env: Record<string, any>): Promise<[number, RackHeaders, any]> {
    const response = await (rbFSend(this.app, "call", env) as ReturnType<typeof this.app>);
    const [status, headers] = response;
    if (!Object.hasOwn(STATUS_WITH_NO_ENTITY_BODY, status)) {
      if (!headers[CONTENT_TYPE]) {
        headers[CONTENT_TYPE] = this.contentType;
      }
    }
    return response;
  }
}
