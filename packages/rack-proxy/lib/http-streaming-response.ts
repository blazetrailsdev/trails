import { Rack, type Headers } from "@blazetrails/rack";
import {
  EOFError,
  Fiber,
  IOError,
  Net,
  rbObjIvarDefined,
  rbObjIvarSet,
  rbObjRespondTo,
  StandardError,
  StringIO,
} from "@blazetrails/ruby-compat";

import { Proxy } from "./proxy.js";

type NetHTTP = InstanceType<typeof Net.HTTP>;
type NetHTTPRequest = InstanceType<typeof Net.HTTP.Get>;
type NetHTTPResponse = InstanceType<typeof Net.HTTPResponse>;

class ResponseTooLarge extends StandardError {}

class StreamAborted extends StandardError {}

export class HttpStreamingResponse {
  static ResponseTooLarge = ResponseTooLarge;
  static StreamAborted = StreamAborted;

  static readonly STATUSES_WITH_NO_ENTITY_BODY: Readonly<Record<number, boolean>> = Object.freeze({
    204: true,
    205: true,
    304: true,
  });

  useSsl: unknown;
  verifyMode: unknown;
  readTimeout: unknown;
  sslVersion: unknown;
  cert: unknown;
  key: unknown;
  logger: unknown;
  maxResponseLength: number | null = null;

  /** @internal */
  private readonly request: NetHTTPRequest;
  /** @internal */
  private readonly host: string;
  /** @internal */
  private readonly port: number | null;
  /** @internal */
  private readonly configure: ((http: NetHTTP) => unknown) | null;
  /** @internal */
  private connectionClosed: boolean = false;
  /** @internal */
  private fiber: Fiber<Promise<unknown>> | null = null;
  /** @internal */
  private _response: NetHTTPResponse | null = null;
  /** @internal */
  private _session: NetHTTP | null = null;
  /** @internal */
  private _toS: Uint8Array | null = null;

  constructor(
    request: NetHTTPRequest,
    host: string,
    port: number | null = null,
    configure: ((http: NetHTTP) => unknown) | null = null,
  ) {
    [this.request, this.host, this.port, this.configure] = [request, host, port, configure];

    if (rbObjIvarDefined(request, "@decode_content")) {
      rbObjIvarSet(request, "@decode_content", false);
    }
  }

  get body(): this {
    return this;
  }

  async code(): Promise<number> {
    const responseCode = Number.parseInt((await this.response()).code, 10);
    if (HttpStreamingResponse.STATUSES_WITH_NO_ENTITY_BODY[responseCode]) {
      await this.closeConnection();
    }
    return responseCode;
  }

  async status(): Promise<number> {
    return this.code();
  }

  async headers(): Promise<Headers> {
    return Proxy.buildHeaderHash(Object.entries((await this.response()).toHash()));
  }

  async each(block: (chunk: Uint8Array) => unknown): Promise<void> {
    try {
      if (this.connectionClosed) return;

      await this.response();

      let bytes = 0;
      while (this.fiber!.isAlive()) {
        const chunk = await this.fiber!.resume();
        if (!(chunk instanceof Uint8Array)) continue;

        if (this.maxResponseLength != null) {
          bytes += chunk.length;
          if (bytes > this.maxResponseLength) {
            throw new ResponseTooLarge(
              `backend response exceeded max_response_length=${this.maxResponseLength}`,
            );
          }
        }
        await block(chunk);
      }
    } catch (e) {
      if (!(e instanceof StandardError)) throw e;
      if (rbObjRespondTo(this.logger, "append")) {
        (this.logger as { append(str: string): unknown }).append(
          `rack-proxy: streaming backend read failed: ${e.constructor.name}: ${e.message}\n`,
        );
      }
      throw e;
    } finally {
      await this.closeConnection();
    }
  }

  async toS(): Promise<Uint8Array> {
    if (this._toS != null) return this._toS;
    const io = new StringIO<Uint8Array>(new Uint8Array(0));
    await this.each((line) => io.append(line));
    return (this._toS = io.string());
  }

  async close(): Promise<void> {
    await this.closeConnection();
  }

  /** @internal */
  protected async response(): Promise<NetHTTPResponse> {
    if (this._response != null) return this._response;

    if (this.connectionClosed) {
      throw new IOError("rack-proxy: backend response was closed before it was read");
    }

    this.fiber = new Fiber(async () => {
      await (
        await this.session()
      ).request(this.request, null, async (res: NetHTTPResponse) => {
        await Fiber.yield(res);
        let bytes = 0;
        await res.readBody(null, async (chunk) => {
          bytes += chunk.length;
          await Fiber.yield(chunk);
        });
        if (
          this.request.isResponseBodyPermitted() &&
          (res.constructor as typeof Net.HTTPResponse).isBodyPermitted() &&
          res.contentLength != null &&
          bytes !== res.contentLength
        ) {
          throw new EOFError("backend response is shorter than Content-Length");
        }
      });
      return "done";
    });
    return (this._response = (await this.fiber.resume()) as NetHTTPResponse);
  }

  /** @internal */
  protected async session(): Promise<NetHTTP> {
    return (this._session ??= await (async () => {
      const http = new Net.HTTP(this.host, this.port);
      if (this.configure != null) {
        this.configure(http);
      } else {
        http.useSsl = this.useSsl as boolean;
        http.verifyMode = this.verifyMode as number | null;
        http.readTimeout = this.readTimeout as number | null;
        if (this.sslVersion != null) http.sslVersion = this.sslVersion as NetHTTP["sslVersion"];
        if (this.cert != null) http.cert = this.cert as NetHTTP["cert"];
        if (this.key != null) http.key = this.key as NetHTTP["key"];
        if (this.logger != null) http.setDebugOutput(this.logger);
      }
      http.maxRetries = 0;
      await http.start();
      return http;
    })());
  }

  /** @internal */
  private async closeConnection(): Promise<void> {
    if (this.connectionClosed) return;

    this.connectionClosed = true;

    if (this.fiber?.isAlive()) {
      try {
        await this.fiber.raise(
          StreamAborted,
          "backend stream closed before the response was fully read",
        );
      } catch (e) {
        void e;
      }
    }

    try {
      if (this._session?.isStarted()) this._session.finish();
    } catch (e) {
      void e;
    }
  }
}

ResponseTooLarge.prototype.name = "Rack::HttpStreamingResponse::ResponseTooLarge";
StreamAborted.prototype.name = "Rack::HttpStreamingResponse::StreamAborted";

Rack.HttpStreamingResponse = HttpStreamingResponse;
