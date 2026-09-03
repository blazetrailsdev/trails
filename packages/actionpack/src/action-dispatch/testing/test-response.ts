import { Response } from "../http/response.js";
import { RequestEncoder, type ResponseParser } from "./request-encoder.js";

export class TestResponse extends Response {
  private _parsedBody?: unknown;
  private _responseParser?: ResponseParser;

  static fromResponse(response: Response): TestResponse {
    return new TestResponse(response.status, response.headers.toHash(), [response.body]);
  }

  get parsedBody(): unknown {
    if (this._parsedBody === undefined) {
      this._parsedBody = this.responseParser(this.body);
    }
    return this._parsedBody;
  }

  get responseParser(): ResponseParser {
    this._responseParser ??= RequestEncoder.parser(this.contentType);
    return this._responseParser;
  }
}
