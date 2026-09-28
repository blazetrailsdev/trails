import { ContentDisposition } from "../../action-dispatch/http/content-disposition.js";
import { MimeType } from "../../action-dispatch/http/mime-type.js";
import type { Request } from "../../action-dispatch/http/request.js";
import type { CookieResponse } from "../../action-dispatch/middleware/cookies.js";
import {
  Response as DispatchResponse,
  ResponseBuffer,
} from "../../action-dispatch/http/response.js";
import { RuntimeError, merge } from "@blazetrails/ruby-compat";

export class ClientDisconnected extends RuntimeError {}

type ErrorCallback = () => void;

export class Buffer extends ResponseBuffer {
  static queueSize: number | null = 10;

  ignoreDisconnect: boolean;

  /** @internal */
  protected _errorCallback: ErrorCallback;
  /** @internal */
  protected _aborted: boolean;

  constructor(response: DispatchResponse) {
    const klass = new.target;
    super(response, klass.prototype.buildQueue(klass.queueSize));
    this._errorCallback = () => {};
    this._aborted = false;
    this.ignoreDisconnect = false;
  }

  override write(string: string): void {
    if (!this._response.committed) {
      if (this._response.headers.get("Cache-Control") === undefined) {
        this._response.headers.set("Cache-Control", "no-cache");
      }
      this._response.deleteHeader("Content-Length");
    }

    super.write(string);

    if (!this.isConnected) {
      this._buf.length = 0;

      if (!this.ignoreDisconnect) {
        throw new ClientDisconnected("client disconnected");
      }
    }
  }

  writeln(string: string): void {
    this.write(string.endsWith("\n") ? string : `${string}\n`);
  }

  override close(): void {
    super.close();
    this._buf.push(null);
  }

  override abort(): void {
    this._aborted = true;
    this._buf.length = 0;
  }

  get isConnected(): boolean {
    return !this._aborted;
  }

  onError(block: ErrorCallback): void {
    this._errorCallback = block;
  }

  callOnError(): void {
    this._errorCallback();
  }

  /** @internal */
  protected override eachChunk(block: (chunk: unknown) => void): void {
    while (true) {
      const str = this._buf.shift() as string | null | undefined;
      if (str === null || str === undefined) break;
      block(str);
    }
  }

  /** @internal */
  protected buildQueue(_queueSize: number | null): Array<string | null> {
    return [];
  }
}

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
    const currentOptions: Record<string, string | number | undefined> = merge<
      string | number | undefined
    >(this._options, options);

    for (const name of SSE.PERMITTED_OPTIONS) {
      const optionValue = currentOptions[name];
      if (optionValue !== undefined && optionValue !== null) {
        this._stream.write(`${name}: ${optionValue}\n`);
      }
    }

    const message = json.replace(/\n/g, "\ndata: ");
    this._stream.write(`data: ${message}\n\n`);
  }
}

export class Response extends DispatchResponse {
  declare stream: Buffer;

  /** @internal */
  protected override beforeCommitted(): void {
    super.beforeCommitted();
    const jar = this.request!.cookieJar();
    if (!this.committed) jar.write(this as unknown as CookieResponse);
  }

  /** @internal */
  buildBuffer(response: DispatchResponse, body: unknown[]): Buffer {
    const buf = new Buffer(response);
    for (const part of body) buf.write(String(part));
    return buf;
  }
}

interface LoggerLike {
  fatal(message: string | (() => string)): void;
}

export interface LiveControllerHost {
  request: { getHeader?(name: string): string | undefined; format?: unknown };
  response: Response;
  logger?: LoggerLike;
}

export async function process(
  this: LiveControllerHost,
  name: string,
  runAction: (n: string) => void | Promise<void>,
): Promise<void> {
  let error: unknown = undefined;
  let errorSet = false;
  await newControllerThread.call(this, async () => {
    try {
      await runAction(name);
    } catch (e) {
      const resp = this.response;
      if (resp?.committed) {
        try {
          resp.stream.callOnError();
        } catch (inner) {
          logError.call(this, inner);
        } finally {
          logError.call(this, e);
          try {
            resp.stream.close();
          } catch {
            /** @empty */
          }
        }
      } else {
        error = e;
        errorSet = true;
      }
    } finally {
      cleanUpThreadLocals.call(this, [], null);
      if (!this.response.committed) this.response.close();
    }
  });
  if (errorSet) throw error;
}

export function responseBody(this: LiveControllerHost, body: string): void {
  this.response.body = body;
  this.response.close();
}

export interface SendStreamOptions {
  filename: string;
  disposition?: string;
  type?: string | symbol | null;
}

export async function sendStream(
  this: LiveControllerHost,
  options: SendStreamOptions,
  block: (stream: Buffer) => void | Promise<void>,
): Promise<void> {
  const { filename, type } = options;
  const disposition = options.disposition ?? "attachment";

  let resolved =
    typeof type === "string"
      ? type
      : typeof type === "symbol"
        ? (() => {
            const desc = type.description;
            return desc && MimeType.isRegistered(desc) ? MimeType.lookup(desc).toString() : null;
          })()
        : null;
  if (!resolved) {
    const dot = filename.lastIndexOf(".");
    const ext = dot >= 0 ? filename.slice(dot + 1).toLowerCase() : "";
    resolved = (ext && MimeType.lookupByExtension(ext)?.toString()) || "application/octet-stream";
  }

  const res = this.response;
  res.setHeader("content-type", resolved);
  res.setHeader("content-disposition", ContentDisposition.format({ disposition, filename }));

  try {
    await block(res.stream);
  } finally {
    res.stream.close();
  }
}

/** @internal */
export async function newControllerThread(
  this: LiveControllerHost,
  block: () => void | Promise<void>,
): Promise<void> {
  await liveThreadPoolExecutor().post(block);
}

/** @internal */
export function cleanUpThreadLocals(
  this: LiveControllerHost,
  _locals: unknown,
  _thread: unknown,
): void {}

export const originalNewControllerThread = newControllerThread;
export const originalCleanUpThreadLocals = cleanUpThreadLocals;

interface LiveExecutor {
  post(fn: () => void | Promise<void>): Promise<void>;
}
let _liveExecutor: LiveExecutor | undefined;

/** @internal */
export function liveThreadPoolExecutor(): LiveExecutor {
  return (_liveExecutor ??= {
    post: async (fn) => {
      await Promise.resolve();
      await fn();
    },
  });
}

export function makeResponseBang(
  request: Request,
  superFactory: () => DispatchResponse,
): DispatchResponse {
  const protocol = request.getHeader("SERVER_PROTOCOL") ?? request.getHeader("HTTP_VERSION");
  if (protocol === "HTTP/1.0") return superFactory();
  const res = new Response();
  res.request = request;
  return res;
}

/** @internal */
export function logError(this: { logger?: LoggerLike }, exception: unknown): void {
  const logger = this.logger;
  if (!logger) return;
  const err = exception as { name?: string; message?: string; stack?: string };
  const name = err?.name ?? "Error";
  const message = err?.message ?? String(exception);
  const stack = err?.stack ?? "";
  logger.fatal(() => `\n${name} (${message}):\n  ${stack}\n\n`);
}
