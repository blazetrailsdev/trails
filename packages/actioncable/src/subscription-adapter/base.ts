import { NotImplementedError, Process, rbModConstSet } from "@blazetrails/ruby-compat";
import { SubscriptionAdapter } from "../namespaces.js";

export interface AdapterServer {
  logger: unknown;
  config: { cable: Record<string, unknown> };
}

export class Base {
  readonly logger: unknown;
  readonly server: AdapterServer;

  constructor(server: AdapterServer) {
    this.server = server;
    this.logger = this.server.logger;
  }

  async broadcast(_channel: string, _payload: unknown): Promise<unknown> {
    throw new NotImplementedError();
  }

  async subscribe(
    _channel: string,
    _messageCallback: (message: unknown) => unknown,
    _successCallback: (() => unknown) | null = null,
  ): Promise<unknown> {
    throw new NotImplementedError();
  }

  async unsubscribe(
    _channel: string,
    _messageCallback: (message: unknown) => unknown,
  ): Promise<unknown> {
    throw new NotImplementedError();
  }

  async shutdown(): Promise<unknown> {
    throw new NotImplementedError();
  }

  identifier(): unknown {
    return (this.server.config.cable.id ??= `ActionCable-PID-${Process.pid}`);
  }
}

rbModConstSet(SubscriptionAdapter, "Base", Base);
