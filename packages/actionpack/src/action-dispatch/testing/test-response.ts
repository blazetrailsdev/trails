import { Response } from "../http/response.js";
import { Headers } from "@blazetrails/rack";
import { RequestEncoder, type ResponseParser } from "./request-encoder.js";

export class TestResponse extends Response {
  private _parsedBody?: unknown;
  private _responseParser?: ResponseParser;

  static fromResponse(response: {
    status: number;
    headers: Headers | Record<string, unknown>;
    body: unknown;
  }): TestResponse {
    const headers =
      response.headers instanceof Headers
        ? response.headers.toHash()
        : (Object.fromEntries(
            Object.entries(response.headers).map(([k, v]) => [k, String(v)]),
          ) as Record<string, string>);
    const body = Array.isArray(response.body)
      ? (response.body as string[])
      : [String(response.body)];
    return new TestResponse(response.status, headers, body);
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
