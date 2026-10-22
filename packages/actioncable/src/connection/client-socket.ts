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

interface EventLoop {
  attach(io: never, stream: Stream): unknown;
  detach(io: never, stream: Stream): unknown;
}

type DriverInstance = ReturnType<typeof Driver.http>;

/**
 * @internal
 * @noRailsEquivalent PERMANENT
 */
export function driverRequest(env: Env): Parameters<typeof Driver.http>[0] {
  const headers: Record<string, string> = {};
  for (const [key, value] of Object.entries(env)) {
    if (key.startsWith("HTTP_")) {
      headers[key.slice(5).toLowerCase().replaceAll("_", "-")] = String(value);
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
  private eventTarget: EventTarget;
  private eventLoop: EventLoop;
  private driver: DriverInstance | null;
  private driverStarted: boolean | null;
  private closeParams: [string, number];
  private readyState: number;
  private stream: Stream;

  constructor(
    env: Env,
    eventTarget: EventTarget,
    eventLoop: EventLoop,
    protocols: readonly string[],
  ) {
    this.env = env;
    this.eventTarget = eventTarget;
    this.eventLoop = eventLoop;

    this.url = ClientSocket.determineUrl(this.env);

    this.driver = this.driverStarted = null;
    this.closeParams = ["", 1006];

    this.readyState = ClientSocket.CONNECTING;

    const driver = (this.driver = Driver.http(driverRequest(this.env), { protocols }));
    driver.io.on("data", (data) => this.write(data));

    driver.on("open", (_e) => this.open());
    driver.on("message", (e) => this.receiveMessage(e.data));
    driver.on("close", (e) => this.beginClose(e.reason, e.code));
    driver.on("error", (e) => this.emitError(e.message));

    this.stream = new Stream(this.eventLoop as never, this);
  }

  startDriver(): void {
    if (this.driver == null || this.driverStarted) return;
    this.stream.hijackRackSocket();

    const callback = this.env["async.callback"] as ((response: unknown) => unknown) | undefined;
    if (callback != null) {
      callback([101, {}, this.stream]);
    }

    this.driverStarted = true;
    this.driver.start();
  }

  rackResponse(): [number, Record<string, string>, unknown[]] {
    this.startDriver();
    return [-1, {}, []];
  }

  write(data: Data): unknown {
    try {
      return this.stream.write(data);
    } catch (e) {
      return this.emitError((e as Error).message);
    }
  }

  transmit(message: unknown): boolean {
    if (this.readyState > ClientSocket.OPEN) return false;
    if (typeof message === "number" || typeof message === "bigint") {
      return this.driver!.text(message.toString());
    } else if (typeof message === "string") {
      return this.driver!.text(message);
    } else if (Array.isArray(message)) {
      return this.driver!.binary(message);
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

    if (this.readyState !== ClientSocket.CLOSED) this.readyState = ClientSocket.CLOSING;
    return this.driver!.close(reason, code);
  }

  parse(data: Data): unknown {
    return this.driver!.parse(data as Uint8Array);
  }

  clientGone(): void {
    this.finalizeClose();
  }

  isAlive(): boolean {
    return this.readyState === ClientSocket.OPEN;
  }

  get protocol(): string | undefined {
    return this.driver!.protocol;
  }

  /** @internal */
  private open(): void {
    if (this.readyState !== ClientSocket.CONNECTING) return;
    this.readyState = ClientSocket.OPEN;

    this.eventTarget.onOpen();
  }

  /** @internal */
  private receiveMessage(data: Data): void {
    if (this.readyState !== ClientSocket.OPEN) return;

    this.eventTarget.onMessage(data);
  }

  /** @internal */
  private emitError(message: string): void {
    if (this.readyState >= ClientSocket.CLOSING) return;

    this.eventTarget.onError(message);
  }

  /** @internal */
  private beginClose(reason: string, code: number): void {
    if (this.readyState === ClientSocket.CLOSED) return;
    this.readyState = ClientSocket.CLOSING;
    this.closeParams = [reason, code];

    if (this.stream) this.stream.shutdown();
    this.finalizeClose();
  }

  /** @internal */
  private finalizeClose(): void {
    if (this.readyState === ClientSocket.CLOSED) return;
    this.readyState = ClientSocket.CLOSED;

    this.eventTarget.onClose(...this.closeParams);
  }
}

rbModConstSet(Connection, "ClientSocket", ClientSocket);
