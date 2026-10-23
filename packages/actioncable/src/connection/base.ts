import { Request } from "@blazetrails/actionpack";
import {
  ActiveSupportJSON,
  Rescuable,
  TopLevel,
  camelize,
  include,
  runLoadHooks,
  type Included,
} from "@blazetrails/activesupport";
import { Time } from "@blazetrails/date";
import { CONTENT_TYPE, Request as RackRequest } from "@blazetrails/rack";
import {
  rbEqq,
  rbFArray,
  rbInspect,
  rbModConstSet,
  rbModName,
  rbObjId,
  rbObjRespondTo,
  sprintf,
  toS,
} from "@blazetrails/ruby-compat";
import "../action-cable.js";
import { ActionCable, Connection } from "../namespaces.js";
import type { Base as ServerBase } from "../server/base.js";
import { Authorization } from "./authorization.js";
import { Callbacks } from "./callbacks.js";
import { Identification } from "./identification.js";
import { InternalChannel } from "./internal-channel.js";
import { MessageBuffer } from "./message-buffer.js";
import { Subscriptions } from "./subscriptions.js";
import { TaggedLoggerProxy } from "./tagged-logger-proxy.js";
import { WebSocket } from "./web-socket.js";

interface Coder {
  encode(message: unknown): string;
  decode(message: unknown): unknown;
}

type Env = Record<string, unknown>;

export class Base {
  declare connectionIdentifier: string;
  /** @internal */
  declare subscribeToInternalChannel: () => void;
  /** @internal */
  declare unsubscribeFromInternalChannel: () => void;
  declare rejectUnauthorizedConnection: () => never;
  declare runCallbacks: (kind: string, block?: () => unknown) => unknown;
  declare rescueWithHandler: Included<typeof Rescuable>["rescueWithHandler"];

  readonly server: ServerBase;
  readonly env: Env;
  readonly subscriptions: Subscriptions;
  readonly logger: TaggedLoggerProxy;
  readonly workerPool: ServerBase["workerPool"];
  private _protocol?: string;
  private _coder: Coder;
  private _websocket: WebSocket;
  private _messageBuffer: MessageBuffer;
  private _internalSubscriptions: unknown;
  private _startedAt: Time;
  private _request?: Request;

  get protocol(): string | undefined {
    return this._protocol;
  }

  get eventLoop(): ServerBase["eventLoop"] {
    return this.server.eventLoop;
  }

  get pubsub(): ServerBase["pubsub"] {
    return this.server.pubsub;
  }

  get config(): ServerBase["config"] {
    return this.server.config;
  }

  constructor(server: ServerBase, env: Env, { coder = ActiveSupportJSON }: { coder?: Coder } = {}) {
    this.server = server;
    this.env = env;
    this._coder = coder;

    this.workerPool = server.workerPool;
    this.logger = this.newTaggedLogger();

    this._websocket = new WebSocket(env as never, this as never, this.eventLoop as never);
    this.subscriptions = new Subscriptions(this as never);
    this._messageBuffer = new MessageBuffer(this);

    this._internalSubscriptions = null;
    this._startedAt = Time.now();
  }

  process(): unknown {
    this.logger.info(this.startedRequestMessage());

    if (this.websocket.isPossible() && this.isAllowRequestOrigin()) {
      return this.respondToSuccessfulRequest();
    } else {
      return this.respondToInvalidRequest();
    }
  }

  receive(websocketMessage: string): unknown {
    return this.sendAsync("dispatchWebsocketMessage", websocketMessage);
  }

  async dispatchWebsocketMessage(websocketMessage: string): Promise<unknown> {
    if (this.websocket.isAlive()) {
      return await this.handleChannelCommand(this.decode(websocketMessage));
    } else {
      return this.logger.error(
        `Ignoring message processed after the WebSocket was closed: ${rbInspect(websocketMessage)})`,
      );
    }
  }

  async handleChannelCommand(payload: unknown): Promise<unknown> {
    return await this.runCallbacks("command", () =>
      this.subscriptions.executeCommand(payload as Env),
    );
  }

  transmit(cableMessage: unknown): boolean | undefined {
    return this.websocket.transmit(this.encode(cableMessage));
  }

  close({ reason = null, reconnect = true }: { reason?: string | null; reconnect?: unknown } = {}):
    | boolean
    | undefined {
    this.transmit({
      type: ActionCable.INTERNAL.messageTypes.disconnect,
      reason,
      reconnect,
    });
    return this.websocket.close();
  }

  sendAsync(method: string, ...arguments_: unknown[]): unknown {
    return this.workerPool.asyncInvoke(this, method, ...arguments_);
  }

  get statistics(): Record<string, unknown> {
    return {
      identifier: this.connectionIdentifier,
      startedAt: this._startedAt,
      subscriptions: this.subscriptions.identifiers,
      requestId: this.env["action_dispatch.request_id"],
    };
  }

  beat(): boolean | undefined {
    return this.transmit({
      type: ActionCable.INTERNAL.messageTypes.ping,
      message: Time.now().toI(),
    });
  }

  onOpen(): unknown {
    return this.sendAsync("handleOpen");
  }

  onMessage(message: unknown): void {
    this.messageBuffer.append(message);
  }

  onError(message: string): unknown {
    return this.logger.error(`WebSocket error occurred: ${message}`);
  }

  onClose(_reason: string, _code: number): unknown {
    return this.sendAsync("handleClose");
  }

  /** @internal */
  private get websocket(): WebSocket {
    return this._websocket;
  }

  /** @internal */
  private get messageBuffer(): MessageBuffer {
    return this._messageBuffer;
  }

  /** @internal */
  protected get request(): Request {
    if (this._request === undefined) {
      let environment: Env | undefined;
      if (TopLevel.Trails?.application != null)
        environment = { ...TopLevel.Trails.application.envConfig(), ...this.env };
      this._request = new Request((environment || this.env) as never);
    }
    return this._request;
  }

  /** @internal */
  protected get cookies(): ReturnType<Request["cookieJar"]> {
    return this.request.cookieJar();
  }

  /** @internal */
  private encode(cableMessage: unknown): string {
    return this._coder.encode(cableMessage);
  }

  /** @internal */
  private decode(websocketMessage: unknown): unknown {
    return this._coder.decode(websocketMessage);
  }

  /** @internal */
  private async handleOpen(): Promise<unknown> {
    try {
      this._protocol = this.websocket.protocol;
      if (rbObjRespondTo(this, "connect"))
        await (this as unknown as { connect(): unknown }).connect();
      this.subscribeToInternalChannel();
      this.sendWelcomeMessage();

      this.messageBuffer.processBang();
      return this.server.addConnection(this as never);
    } catch (e) {
      if (
        !(
          e instanceof
          (Authorization as unknown as { UnauthorizedError: typeof Error }).UnauthorizedError
        )
      )
        throw e;
      if (this.websocket.isAlive())
        return this.close({
          reason: ActionCable.INTERNAL.disconnectReasons.unauthorized,
          reconnect: false,
        });
      return null;
    }
  }

  /** @internal */
  private async handleClose(): Promise<unknown> {
    this.logger.info(this.finishedRequestMessage());

    this.server.removeConnection(this as never);

    await this.subscriptions.unsubscribeFromAll();
    this.unsubscribeFromInternalChannel();

    if (rbObjRespondTo(this, "disconnect"))
      return await (this as unknown as { disconnect(): unknown }).disconnect();
    return null;
  }

  /** @internal */
  private sendWelcomeMessage(): boolean | undefined {
    return this.transmit({ type: ActionCable.INTERNAL.messageTypes.welcome });
  }

  /** @internal */
  private isAllowRequestOrigin(): boolean {
    if (this.server.config.disableRequestForgeryProtection) return true;

    const proto = new RackRequest(this.env).ssl ? "https" : "http";
    if (
      this.server.config.allowSameOriginAsHost &&
      this.env["HTTP_ORIGIN"] === `${proto}://${toS(this.env["HTTP_HOST"])}`
    ) {
      return true;
    } else if (
      rbFArray(this.server.config.allowedRequestOrigins).some((allowedOrigin) =>
        rbEqq(allowedOrigin, this.env["HTTP_ORIGIN"]),
      )
    ) {
      return true;
    } else {
      this.logger.error(`Request origin not allowed: ${toS(this.env["HTTP_ORIGIN"])}`);
      return false;
    }
  }

  /** @internal */
  private respondToSuccessfulRequest(): unknown {
    this.logger.info(this.successfulRequestMessage());
    return this.websocket.rackResponse();
  }

  /** @internal */
  private respondToInvalidRequest(): [number, Record<string, string>, string[]] {
    if (this.websocket.isAlive())
      this.close({ reason: ActionCable.INTERNAL.disconnectReasons.invalidRequest });

    this.logger.error(this.invalidRequestMessage());
    this.logger.info(this.finishedRequestMessage());
    return [404, { [CONTENT_TYPE]: "text/plain; charset=utf-8" }, ["Page not found"]];
  }

  /** @internal */
  private newTaggedLogger(): TaggedLoggerProxy {
    return new TaggedLoggerProxy(this.server.logger, {
      tags: this.server.config.logTags.map((tag) =>
        rbObjRespondTo(tag, "call")
          ? typeof tag === "function"
            ? (tag as (request: Request) => unknown)(this.request)
            : (tag as { call(request: Request): unknown }).call(this.request)
          : camelize(toS(tag)),
      ),
    });
  }

  /** @internal */
  private startedRequestMessage(): string {
    return sprintf(
      'Started %s "%s"%s for %s at %s',
      this.request.requestMethod,
      this.request.filteredPath(),
      this.websocket.isPossible() ? " [WebSocket]" : "[non-WebSocket]",
      this.request.ip,
      Time.now().toS(),
    );
  }

  /** @internal */
  private finishedRequestMessage(): string {
    return sprintf(
      'Finished "%s"%s for %s at %s',
      this.request.filteredPath(),
      this.websocket.isPossible() ? " [WebSocket]" : "[non-WebSocket]",
      this.request.ip,
      Time.now().toS(),
    );
  }

  /** @internal */
  private invalidRequestMessage(): string {
    return sprintf(
      "Failed to upgrade to WebSocket (REQUEST_METHOD: %s, HTTP_CONNECTION: %s, HTTP_UPGRADE: %s)",
      this.env["REQUEST_METHOD"],
      this.env["HTTP_CONNECTION"],
      this.env["HTTP_UPGRADE"],
    );
  }

  /** @internal */
  private successfulRequestMessage(): string {
    return sprintf(
      "Successfully upgraded to WebSocket (REQUEST_METHOD: %s, HTTP_CONNECTION: %s, HTTP_UPGRADE: %s)",
      this.env["REQUEST_METHOD"],
      this.env["HTTP_CONNECTION"],
      this.env["HTTP_UPGRADE"],
    );
  }

  inspect(): string {
    return `#<${rbModName(this.constructor) as string}:${sprintf("%#016x", rbObjId(this) << 1)}>`;
  }
}
include(Base, Identification);
include(Base, InternalChannel);
include(Base, Authorization);
include(Base, Callbacks);
include(Base, Rescuable);

rbModConstSet(Connection, "Base", Base);

runLoadHooks("action_cable_connection", Base);
