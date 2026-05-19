/**
 * ActionController::Live
 *
 * Mix this module into your controller to stream data to the client.
 * @see https://api.rubyonrails.org/classes/ActionController/Live.html
 */

import { Response as DispatchResponse } from "../../action-dispatch/http/response.js";

export class ClientDisconnected extends Error {
  constructor(message?: string) {
    super(message ?? "client disconnected");
    this.name = "ClientDisconnected";
  }
}

interface LiveResponseLike {
  committed: boolean;
  headers: Record<string, string>;
  setHeader(key: string, value: string): void;
  deleteHeader(key: string): void;
  close?(): void;
}

type ErrorCallback = () => void;

/**
 * Action Controller Live Buffer.
 *
 * A producer/consumer queue that backs `response.stream` for live streaming
 * controllers. Writes push chunks onto an internal queue; `eachChunk` drains
 * it on the consumer side. Closing the stream pushes a sentinel `null`.
 *
 * Mirrors `ActionController::Live::Buffer`.
 */
export class Buffer {
  /**
   * Class-level cap on queued chunks. Rails defaults to 10; `null` means
   * unbounded. We don't enforce backpressure (no SizedQueue in JS), but
   * preserve the accessor so `Buffer.queueSize = n` is observable.
   */
  static queueSize: number | null = 10;

  /**
   * If `true`, writes after the client disconnects are silently dropped.
   * If `false` (default), they raise {@link ClientDisconnected}.
   */
  ignoreDisconnect = false;

  /** @internal */
  protected _response: LiveResponseLike;
  /** @internal */
  protected _buf: Array<string | null>;
  /** @internal */
  protected _aborted = false;
  /** @internal */
  protected _closed = false;
  /** @internal */
  protected _errorCallback: ErrorCallback = () => {};

  constructor(response: LiveResponseLike) {
    this._response = response;
    this._buf = this.buildQueue((this.constructor as typeof Buffer).queueSize);
  }

  write(string: string): void {
    if (this._closed) throw new Error("closed stream");

    if (!this._response.committed) {
      if (!this._response.headers["cache-control"] && !this._response.headers["Cache-Control"]) {
        this._response.setHeader("cache-control", "no-cache");
      }
      this._response.deleteHeader("content-length");
      this._response.deleteHeader("Content-Length");
    }

    this._buf.push(string);

    if (!this.isConnected) {
      this._buf.length = 0;
      if (!this.ignoreDisconnect) {
        throw new ClientDisconnected("client disconnected");
      }
    }
  }

  /** Same as `write` but appends a newline if one isn't already present. */
  writeln(string: string): void {
    this.write(string.endsWith("\n") ? string : `${string}\n`);
  }

  /**
   * Write a 'close' event to the buffer; the producer thread uses this to
   * notify the consumer it's finished supplying content.
   *
   * @see {@link abort}
   */
  close(): void {
    if (typeof (this._response as { close?: () => void }).close === "function") {
      (this._response as { close: () => void }).close();
    }
    this._closed = true;
    this._buf.push(null);
  }

  get closed(): boolean {
    return this._closed;
  }

  /**
   * Inform the producer that the client has disconnected; the consumer is no
   * longer interested in any further content.
   */
  abort(): void {
    this._aborted = true;
    this._buf.length = 0;
  }

  /** Is the client still connected and waiting for content? */
  get isConnected(): boolean {
    return !this._aborted;
  }

  /** Register a callback invoked if an error is raised while streaming. */
  onError(block: ErrorCallback): void {
    this._errorCallback = block;
  }

  callOnError(): void {
    this._errorCallback();
  }

  /**
   * Drain the queue, yielding each non-null chunk in order. Stops at the
   * sentinel `null` pushed by {@link close}.
   *
   * @internal
   */
  *eachChunk(): IterableIterator<string> {
    while (this._buf.length > 0) {
      const str = this._buf.shift();
      if (str === null || str === undefined) break;
      yield str;
    }
  }

  /**
   * Build the backing queue. Rails uses a SizedQueue when `queueSize` is set;
   * we approximate with a plain array since JS has no thread-blocking queues.
   *
   * @internal
   */
  protected buildQueue(_queueSize: number | null): Array<string | null> {
    return [];
  }
}

/**
 * Action Controller Live Server Sent Events.
 *
 * Writes Server-Sent Events to a {@link Buffer}-like stream. Accepts either a
 * pre-encoded string or any value JSON-serializable via `JSON.stringify`.
 *
 * Mirrors `ActionController::Live::SSE`.
 */
export class SSE {
  static readonly PERMITTED_OPTIONS = ["retry", "event", "id"] as const;

  private _stream: { write(s: string): void; close(): void };
  private _options: { retry?: number | string; event?: string; id?: string };

  constructor(
    stream: { write(s: string): void; close(): void },
    options: { retry?: number | string; event?: string; id?: string } = {},
  ) {
    this._stream = stream;
    this._options = options;
  }

  close(): void {
    this._stream.close();
  }

  write(
    object: unknown,
    options: { retry?: number | string; event?: string; id?: string } = {},
  ): void {
    if (typeof object === "string") {
      this.performWrite(object, options);
    } else {
      this.performWrite(JSON.stringify(object) ?? "null", options);
    }
  }

  /** @internal */
  private performWrite(
    json: string,
    options: { retry?: number | string; event?: string; id?: string },
  ): void {
    const current: Record<string, string | number | undefined> = {
      ...this._options,
      ...options,
    };

    for (const name of SSE.PERMITTED_OPTIONS) {
      const value = current[name];
      // Match Ruby truthiness: `if option_value` is true for "" — an empty
      // `id:` line resets the browser's Last-Event-ID, which is valid SSE.
      if (value !== undefined && value !== null) {
        this._stream.write(`${name}: ${value}\n`);
      }
    }

    const message = json.replace(/\n/g, "\ndata: ");
    this._stream.write(`data: ${message}\n\n`);
  }
}

/**
 * Live::Response — an {@link DispatchResponse} whose `stream` is a live
 * {@link Buffer}. Mirrors `ActionController::Live::Response`.
 */
export class Response extends DispatchResponse {
  stream: Buffer;

  constructor(status = 200, headers: Record<string, string> = {}, body: string[] = []) {
    super(status, headers, body);
    this.stream = new Buffer(this);
  }

  close(): void {
    this.beforeCommitted();
    super.close();
  }

  /**
   * Hook invoked before the response is committed. Mirrors Rails'
   * `before_committed`, which flushes the request's cookie jar onto the
   * response. We don't yet carry a `request.cookie_jar` collaborator, but
   * any cookies set directly via `setCookie` on this response are flattened
   * into a single `set-cookie` header here so they aren't lost.
   *
   * @internal
   */
  protected beforeCommitted(): void {
    if (this.committed) return;
    const cookies = this.cookies;
    const names = Object.keys(cookies);
    if (names.length === 0) return;
    if (this.headers["set-cookie"] !== undefined || this.headers["Set-Cookie"] !== undefined) {
      return;
    }
    this.setHeader("set-cookie", names.map((n) => `${n}=${cookies[n]}`).join("\n"));
  }

  /**
   * Wrap a synchronous body into a live Buffer by pushing each part. Mirrors
   * Rails' `build_buffer`, used when assigning `response_body=` directly.
   *
   * @internal
   */
  protected buildBuffer(response: LiveResponseLike, body: Iterable<string>): Buffer {
    const buf = new Buffer(response);
    for (const part of body) buf.write(part);
    return buf;
  }
}
