import Driver from "websocket-driver";
import { ArgumentError, rbModConstSet } from "@blazetrails/ruby-compat";
import { Connection } from "../namespaces.js";
import { Stream } from "./stream.js";

type Env = Record<string, unknown>;
type Data = string | Uint8Array;

interface EventTarget {
  onOpen(): unknown;
  onMessage(data: Data): unknown;
  onError(message: string): unknown;
  onClose(reason: string, code: number): unknown;
}

type EventLoop = ConstructorParameters<typeof Stream>[0];

type DriverInstance = ReturnType<typeof Driver.http>;

/** @noRailsEquivalent PERMANENT */
export function driverRequest(env: Env): Parameters<typeof Driver.http>[0] {
  const headers: Record<string, string> = {};
  for (const [key, value] of Object.entries(env)) {
    if (key.startsWith("HTTP_") || key === "CONTENT_TYPE" || key === "CONTENT_LENGTH") {
      headers[
        key
          .replace(/^HTTP_/, "")
          .toLowerCase()
          .replaceAll("_", "-")
      ] = String(value);
    }
  }
  return {
    method: String(env["REQUEST_METHOD"]),
    url: String(env["REQUEST_URI"] ?? ""),
    headers,
  };
}

export class ClientSocket {
  static determineUrl(env: Env): string {
    const scheme = ClientSocket.isSecureRequest(env) ? "wss:" : "ws:";
    return `${scheme}//${(env["HTTP_HOST"] as string | undefined) ?? ""}${(env["REQUEST_URI"] as string | undefined) ?? ""}`;
  }

  static isSecureRequest(env: Env): boolean {
    if (env["HTTPS"] === "on") return true;
    if (env["HTTP_X_FORWARDED_SSL"] === "on") return true;
    if (env["HTTP_X_FORWARDED_SCHEME"] === "https") return true;
    if (env["HTTP_X_FORWARDED_PROTO"] === "https") return true;
    if (env["rack.url_scheme"] === "https") return true;

    return false;
  }

  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSING = 2;
  static readonly CLOSED = 3;

  readonly env: Env;
  readonly url: string;
  private _eventTarget: EventTarget;
  private _eventLoop: EventLoop;
  private _driver: DriverInstance | null;
  private _driverStarted: boolean | null;
  private _closeParams: [string, number];
  private _readyState: number;
  private _stream: Stream;

  constructor(
    env: Env,
    eventTarget: EventTarget,
    eventLoop: EventLoop,
    protocols: readonly string[],
  ) {
    this.env = env;
    this._eventTarget = eventTarget;
    this._eventLoop = eventLoop;

    this.url = ClientSocket.determineUrl(this.env);

    this._driver = this._driverStarted = null;
    this._closeParams = ["", 1006];

    this._readyState = ClientSocket.CONNECTING;

    const driver = (this._driver = Driver.http(driverRequest(this.env), { protocols }));
    driver.io.on("data", (data) => this.write(data));

    driver.on("open", (_e) => this.open());
    driver.on("message", (e) => this.receiveMessage(e.data));
    driver.on("close", (e) => this.beginClose(e.reason, e.code));
    driver.on("error", (e) => this.emitError(e.message));

    this._stream = new Stream(eventLoop, this);
  }

  startDriver(): void {
    if (this._driver == null || this._driverStarted) return;
    this._stream.hijackRackSocket();

    const callback = this.env["async.callback"] as ((response: unknown) => unknown) | undefined;
    if (callback != null) {
      callback([101, {}, this._stream]);
    }

    this._driverStarted = true;
    this._driver.start();
  }

  rackResponse(): [number, Record<string, string>, unknown[]] {
    this.startDriver();
    return [-1, {}, []];
  }

  write(data: Data): unknown {
    try {
      return this._stream.write(data);
    } catch (e) {
      return this.emitError((e as Error).message);
    }
  }

  transmit(message: unknown): boolean {
    if (this._readyState > ClientSocket.OPEN) return false;
    if (typeof message === "number" || typeof message === "bigint") {
      return this._driver!.text(message.toString());
    } else if (typeof message === "string") {
      return this._driver!.text(message);
    } else if (Array.isArray(message)) {
      return this._driver!.binary(message);
    } else {
      return false;
    }
  }

  close(code: number | null = null, reason: string | null = null): boolean {
    code ??= 1000;
    reason ??= "";

    if (!(code === 1000 || (code >= 3000 && code <= 4999))) {
      throw new ArgumentError(
        "Failed to execute 'close' on WebSocket: " +
          "The code must be either 1000, or between 3000 and 4999. " +
          `${code} is neither.`,
      );
    }

    if (this._readyState !== ClientSocket.CLOSED) this._readyState = ClientSocket.CLOSING;
    return this._driver!.close(reason, code);
  }

  parse(data: Uint8Array): unknown {
    return this._driver!.parse(data);
  }

  clientGone(): void {
    this.finalizeClose();
  }

  isAlive(): boolean {
    return this._readyState === ClientSocket.OPEN;
  }

  get protocol(): string | undefined {
    return this._driver!.protocol;
  }

  /** @internal */
  private open(): void {
    if (this._readyState !== ClientSocket.CONNECTING) return;
    this._readyState = ClientSocket.OPEN;

    this._eventTarget.onOpen();
  }

  /** @internal */
  private receiveMessage(data: Data): void {
    if (this._readyState !== ClientSocket.OPEN) return;

    this._eventTarget.onMessage(data);
  }

  /** @internal */
  private emitError(message: string): void {
    if (this._readyState >= ClientSocket.CLOSING) return;

    this._eventTarget.onError(message);
  }

  /** @internal */
  private beginClose(reason: string, code: number): void {
    if (this._readyState === ClientSocket.CLOSED) return;
    this._readyState = ClientSocket.CLOSING;
    this._closeParams = [reason, code];

    if (this._stream) this._stream.shutdown();
    this.finalizeClose();
  }

  /** @internal */
  private finalizeClose(): void {
    if (this._readyState === ClientSocket.CLOSED) return;
    this._readyState = ClientSocket.CLOSED;

    this._eventTarget.onClose(...this._closeParams);
  }
}

rbModConstSet(Connection, "ClientSocket", ClientSocket);
