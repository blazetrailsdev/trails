import { ContentDisposition } from "../../action-dispatch/http/content-disposition.js";
import { Mime, MimeType } from "../../action-dispatch/http/mime-type.js";
import type { Request } from "../../action-dispatch/http/request.js";
import type { CookieResponse } from "../../action-dispatch/middleware/cookies.js";
import {
  Response as DispatchResponse,
  Buffer as ResponseBuffer,
} from "../../action-dispatch/http/response.js";
import {
  CachedThreadPool,
  File,
  Queue,
  RuntimeError,
  SizedQueue,
  Thread,
  ThreadError,
  excBacktrace,
  isSymbol,
  merge,
  rbObjClassname,
  rbObjRespondTo,
  stringDelete,
  toEnum,
  toS,
} from "@blazetrails/ruby-compat";
import { Module } from "@blazetrails/ruby-compat/include";
import { Concern, IsolatedExecutionState, Notifications, extend } from "@blazetrails/activesupport";
import { Base as ActionViewBase } from "@blazetrails/actionview";
import { ActionController } from "../../namespaces.js";

export class ClientDisconnected extends RuntimeError {}

type ErrorCallback = () => unknown;

export class Buffer extends ResponseBuffer<Queue<string | null>> {
  static queueSize: number | null = 10;

  static {
    Object.defineProperty(this.prototype, "toAry", { value: undefined, configurable: true });
  }

  ignoreDisconnect: boolean;

  /** @internal */
  protected _errorCallback: ErrorCallback;
  /** @internal */
  protected _aborted: boolean;

  constructor(response: DispatchResponse | null) {
    const klass = new.target;
    super(response, klass.prototype.buildQueue(klass.queueSize));
    this._errorCallback = () => true;
    this._aborted = false;
    this.ignoreDisconnect = false;
  }

  override write(string: string): void {
    if (!this._response!.committed) {
      if (this._response!.headers.get("Cache-Control") === undefined) {
        this._response!.headers.set("Cache-Control", "no-cache");
      }
      this._response!.deleteHeader("Content-Length");
    }

    super.write(string);

    if (!this.isConnected) {
      this._buf.clear();

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
    void this._buf.push(null);
  }

  override abort(): void {
    this._aborted = true;
    this._buf.clear();
  }

  get isConnected(): boolean {
    return !this._aborted;
  }

  /** @noRailsEquivalent CONVERGEABLE response-async-each-and-bad-request-errinfo */
  override each(block?: (chunk: unknown) => unknown): unknown {
    if (this._strBody !== null) {
      if (!block) return toEnum(this, "each");

      return block(this._strBody);
    } else {
      const popped: string[] = [];
      try {
        while (true) {
          const str = this._buf.pop(true);
          if (str === null) break;
          popped.push(str);
        }
      } catch (e) {
        if (e instanceof ThreadError) for (const str of popped) void this._buf.push(str);
        throw e;
      }
      if (!block) return toEnum(popped, "each");

      popped.forEach(block);
    }
  }

  onError(block: ErrorCallback): void {
    this._errorCallback = block;
  }

  callOnError(): unknown {
    return this._errorCallback();
  }

  /** @internal */
  protected override async eachChunk(
    block: (chunk: unknown) => void | Promise<void>,
  ): Promise<void> {
    while (true) {
      const str = await this._buf.pop();
      if (str === null) break;
      await block(str);
    }
  }

  /** @internal */
  protected buildQueue(queueSize: number | null): Queue<string | null> {
    return queueSize ? new SizedQueue(queueSize) : new Queue();
  }
}

export class SSE {
  static readonly PERMITTED_OPTIONS = ["retry", "event", "id"] as const;

  private _stream: { write(s: string): void; close(): void };
  private _options: { retry?: number | string; event?: string; id?: number | string };

  constructor(
    stream: { write(s: string): void; close(): void },
    options: { retry?: number | string; event?: string; id?: number | string } = {},
  ) {
    this._stream = stream;
    this._options = options;
  }

  close(): void {
    this._stream.close();
  }

  write(
    object: unknown,
    options: { retry?: number | string; event?: string; id?: number | string } = {},
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
    options: { retry?: number | string; event?: string; id?: number | string },
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

export interface LiveControllerHost {
  request: { getHeader?(name: string): string | undefined; format?: unknown };
  response: Response;
  newControllerThread(block: () => void | Promise<void>): Promise<void>;
  cleanUpThreadLocals(locals: [string, unknown][], thread: Thread): void;
  logError(exception: Error): void;
}

export async function process(this: LiveControllerHost, name: string): Promise<void> {
  const t1 = Thread.current();
  const locals = t1.keys().map((key): [string, unknown] => [key, t1.get(key)]);

  let error: unknown = undefined;
  let errorSet = false;
  await this.newControllerThread(async () => {
    const t2 = Thread.current();

    locals.forEach(([k, v]) => t2.set(k, v));
    IsolatedExecutionState.shareWith(t1);

    try {
      await Live.superMethod(this, "process")!(name);
    } catch (e) {
      const resp = this.response;
      if (resp.committed) {
        try {
          if ((this.request.format as { symbol?: string } | undefined)?.symbol === ":html") {
            (resp.stream as Buffer).write(ActionViewBase.streamingCompletionOnException);
          }
          (resp.stream as Buffer).callOnError();
        } catch (exception) {
          this.logError(exception as Error);
        } finally {
          this.logError(e as Error);
          (resp.stream as Buffer).close();
        }
      } else {
        error = e;
        errorSet = true;
      }
    } finally {
      IsolatedExecutionState.clear();
      this.cleanUpThreadLocals(locals, t2);

      this.response.commitBang();
    }
  });

  await this.response.awaitCommit();

  if (errorSet) throw error;
}

export function responseBody(this: LiveControllerHost, body: unknown): void {
  Live.superMethod(this, "responseBody=")!(body);
  if (this.response) this.response.close();
}

export interface SendStreamOptions {
  filename: string;
  disposition?: string;
  type?: string | null;
}

export async function sendStream(
  this: LiveControllerHost,
  { filename, disposition = "attachment", type = null }: SendStreamOptions,
  block: (stream: Buffer) => void | Promise<void>,
): Promise<void> {
  try {
    const payload = { filename, disposition, type };
    await Notifications.instrument("send_stream.action_controller", payload, async () => {
      this.response.headers.set(
        "Content-Type",
        (isSymbol(type) ? (Mime.get(type.slice(1))?.toString() ?? "") : type) ??
          MimeType.lookupByExtension(
            stringDelete(File.extname(filename).toLowerCase(), "."),
          )?.toString() ??
          "application/octet-stream",
      );

      this.response.headers.set(
        "Content-Disposition",
        ContentDisposition.format({ disposition, filename }),
      );

      await block(this.response.stream as Buffer);
    });
  } finally {
    (this.response.stream as Buffer).close();
  }
}

/** @internal */
export async function newControllerThread(
  this: LiveControllerHost,
  block: () => void | Promise<void>,
): Promise<void> {
  return liveThreadPoolExecutor().post(() => {
    const t2 = Thread.current();
    t2.abortOnException = true;
    return block();
  });
}

/** @internal */
export function cleanUpThreadLocals(
  this: LiveControllerHost,
  locals: [string, unknown][],
  thread: Thread,
): void {
  locals.forEach(([k, _]) => thread.set(k, null));
}

let _liveThreadPoolExecutor: CachedThreadPool | undefined;

/** @internal */
export function liveThreadPoolExecutor(): CachedThreadPool {
  return (_liveThreadPoolExecutor ??= new CachedThreadPool({ name: "action_controller.live" }));
}

export function makeResponseBang(this: object, request: Request): DispatchResponse {
  if ((request.getHeader("SERVER_PROTOCOL") ?? request.getHeader("HTTP_VERSION")) === "HTTP/1.0") {
    return ClassMethods.superMethod(this, "makeResponseBang")!(request) as DispatchResponse;
  } else {
    const res = new Response();
    res.request = request;
    return res;
  }
}

export const ClassMethods: Module = new Module((mod) => {
  mod.defineMethod("makeResponseBang", makeResponseBang);
});

/** @internal */
export function logError(this: LiveControllerHost, exception: Error): void {
  const logger = ActionController.Base.logger;
  if (logger == null) return;

  logger.fatal(() => {
    let message = `\n${rbObjClassname(exception)} (${exception.message}):\n`;
    if (rbObjRespondTo(exception, "annotatedSourceCode")) {
      message += toS(
        (exception as Error & { annotatedSourceCode(): unknown }).annotatedSourceCode(),
      );
    }
    message += "  " + excBacktrace(exception)!.join("\n  ");
    return `${message}\n\n`;
  });
}

export const Live = new Module((mod) => {
  extend(mod, Concern);

  mod.defineMethod("process", process);
  mod.moduleEval((m) => {
    Object.defineProperty(m, "responseBody", {
      configurable: true,
      get(this: LiveControllerHost) {
        return mod.superMethod(this, "responseBody")!();
      },
      set: responseBody,
    });
  });
  mod.defineMethod("sendStream", sendStream);
  mod.defineMethod("newControllerThread", newControllerThread);
  mod.defineMethod("cleanUpThreadLocals", cleanUpThreadLocals);
  mod.defineMethod("logError", logError);
}) as Module & { ClassMethods: Module };
Live.ClassMethods = ClassMethods;
