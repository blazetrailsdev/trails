import { CONTENT_LENGTH, TRANSFER_ENCODING, STATUS_WITH_NO_ENTITY_BODY } from "./constants.js";
import type { RackApp } from "./mock-request.js";

export class ContentLength {
  private app: RackApp;

  constructor(app: RackApp) {
    this.app = app;
  }

  async call(env: Record<string, any>): Promise<[number, Record<string, string>, any]> {
    const response = await this.app(env);
    const [status, headers, body] = response;

    if (!STATUS_WITH_NO_ENTITY_BODY[status] &&
        !headers[CONTENT_LENGTH] &&
        !headers[TRANSFER_ENCODING] &&
        Array.isArray(body)) {
      const totalSize = body.reduce((sum: number, chunk: string) => sum + Buffer.byteLength(String(chunk)), 0);
      headers[CONTENT_LENGTH] = String(totalSize);
    }

    return response;
  }
}
