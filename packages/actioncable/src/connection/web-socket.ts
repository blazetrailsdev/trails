import Driver from "websocket-driver";
import { INTERNAL } from "../action-cable.js";
import { ClientSocket, driverRequest } from "./client-socket.js";

type ClientSocketArgs = ConstructorParameters<typeof ClientSocket>;

export class WebSocket {
  private _websocket: ClientSocket | null;

  constructor(
    env: ClientSocketArgs[0],
    eventTarget: ClientSocketArgs[1],
    eventLoop: ClientSocketArgs[2],
    { protocols = INTERNAL.protocols }: { protocols?: readonly string[] } = {},
  ) {
    this._websocket = Driver.isWebSocket(driverRequest(env))
      ? new ClientSocket(env, eventTarget, eventLoop, protocols)
      : null;
  }

  isPossible(): ClientSocket | null {
    return this.websocket;
  }

  isAlive(): boolean | undefined {
    return this.websocket?.isAlive();
  }

  transmit(...args: Parameters<ClientSocket["transmit"]>): boolean | undefined {
    return this.websocket?.transmit(...args);
  }

  close(...args: Parameters<ClientSocket["close"]>): boolean | undefined {
    return this.websocket?.close(...args);
  }

  get protocol(): string | undefined {
    return this.websocket?.protocol;
  }

  rackResponse(): ReturnType<ClientSocket["rackResponse"]> | undefined {
    return this.websocket?.rackResponse();
  }

  /** @internal */
  private get websocket(): ClientSocket | null {
    return this._websocket;
  }
}
