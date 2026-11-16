import { ActionDispatch } from "../../namespaces.js";
import { Response } from "../http/response.js";
import { Headers } from "@blazetrails/rack";
import type { HashWithIndifferentAccess } from "@blazetrails/activesupport";
import { RequestEncoder, type ResponseParser } from "./request-encoder.js";

export class TestResponse<ParsedBody = HashWithIndifferentAccess> extends Response {
  private _parsedBody?: ParsedBody;
  private _responseParser?: ResponseParser;

  static fromResponse(response: {
    status: number;
    headers: Headers | Record<string, unknown>;
    body: unknown;
  }): TestResponse {
    const headers =
      response.headers instanceof Headers
        ? (response.headers.toH() as Record<string, string>)
        : (response.headers as Record<string, string>);
    const body = Array.isArray(response.body)
      ? (response.body as string[])
      : [String(response.body)];
    return new TestResponse(response.status, headers, body);
  }

  get parsedBody(): ParsedBody {
    if (this._parsedBody === undefined) {
      this._parsedBody = this.responseParser.call(undefined, this.body) as ParsedBody;
    }
    return this._parsedBody;
  }

  get responseParser(): ResponseParser {
    this._responseParser ??= RequestEncoder.parser(this.mediaType);
    return this._responseParser;
  }
}
ActionDispatch.TestResponse = TestResponse;
