/**
 * ActionDispatch::TestResponse
 *
 * Integration test methods such as `Integration::RequestHelpers#get` and
 * `#post` return objects of class TestResponse, which represent the HTTP
 * response results of the requested controller actions.
 *
 * See {@link Response} for more information on controller response objects.
 */

import { Response } from "../http/response.js";
import { RequestEncoder, type ResponseParser } from "./request-encoder.js";

export class TestResponse extends Response {
  private _parsedBody?: unknown;
  private _responseParser?: ResponseParser;

  static fromResponse(response: Response): TestResponse {
    return new TestResponse(response.status, response.headers, [response.body]);
  }

  /**
   * Returns a parsed body depending on the response MIME type. When a parser
   * corresponding to the MIME type is not found, it returns the raw body.
   */
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
