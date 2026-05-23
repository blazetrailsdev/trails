/**
 * ActionDispatch::RequestEncoder
 *
 * Registry of per-MIME-type request/response encoders. Maps a content-type
 * string (or registered MIME symbol) to a parser callable used by
 * {@link TestResponse#parsedBody}.
 */

import { MimeType } from "../http/mime-type.js";

export type ResponseParser = (body: string) => unknown;
export type ParamEncoder = (params: unknown) => unknown;

/** @internal */
export class IdentityEncoder {
  get contentType(): string | undefined {
    return undefined;
  }
  get acceptHeader(): string | undefined {
    return undefined;
  }
  encodeParams(params: unknown): unknown {
    return params;
  }
  get responseParser(): ResponseParser {
    return (body) => body;
  }
}

export class RequestEncoder {
  private static encoders: Map<string, RequestEncoder | IdentityEncoder> = new Map([
    ["identity", new IdentityEncoder()],
  ]);

  private readonly _mime: MimeType;
  private readonly _paramEncoder: ParamEncoder;
  readonly responseParser: ResponseParser;

  constructor(
    mimeName: string,
    paramEncoder: ParamEncoder | null,
    responseParser: ResponseParser | null,
  ) {
    if (!MimeType.isRegistered(mimeName)) {
      throw new Error(
        `Can't register a request encoder for unregistered MIME Type: ${mimeName}. ` +
          `See \`MimeType.register\`.`,
      );
    }
    this._mime = MimeType.lookup(mimeName);
    this.responseParser = responseParser ?? ((body) => body);
    this._paramEncoder = paramEncoder ?? ((params) => params);
  }

  get contentType(): string {
    return this._mime.toString();
  }

  get acceptHeader(): string {
    return this._mime.toString();
  }

  encodeParams(params: unknown): unknown {
    if (params == null) return undefined;
    return this._paramEncoder(params);
  }

  static parser(contentType: string | undefined): ResponseParser {
    const type =
      contentType && MimeType.isRegistered(contentType)
        ? MimeType.lookup(contentType).symbol
        : undefined;
    return RequestEncoder.encoder(type).responseParser;
  }

  static encoder(name: string | undefined): RequestEncoder | IdentityEncoder {
    return (name && RequestEncoder.encoders.get(name)) || RequestEncoder.encoders.get("identity")!;
  }

  static registerEncoder(
    mimeName: string,
    options: { paramEncoder?: ParamEncoder; responseParser?: ResponseParser } = {},
  ): void {
    RequestEncoder.encoders.set(
      mimeName,
      new RequestEncoder(mimeName, options.paramEncoder ?? null, options.responseParser ?? null),
    );
  }
}

RequestEncoder.registerEncoder("json", {
  responseParser: (body) => (body ? JSON.parse(body) : body),
});

RequestEncoder.registerEncoder("html", {
  responseParser: (body) => body,
});
