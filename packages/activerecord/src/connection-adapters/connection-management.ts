import { methodMissingProxy } from "@blazetrails/activesupport";

import { Base } from "../base.js";

export type RackResponse = [number, Record<string, unknown>, RackBody];

export type RackBody = unknown;

export interface RackApp {
  call(env: Record<string, unknown>): RackResponse;
}

/** @internal */
function clearActiveConnections(): void {
  Base.connectionHandler.eachConnectionPool((pool) => {
    const connection = pool.activeConnection;
    if (!connection) return;
    const transaction =
      (
        connection as { currentTransaction?: () => { closed: boolean; joinable: boolean } }
      ).currentTransaction?.() ??
      (
        connection as {
          transactionManager?: { currentTransaction: { closed: boolean; joinable: boolean } };
        }
      ).transactionManager?.currentTransaction;
    if (transaction && (transaction.closed || !transaction.joinable)) {
      pool.releaseConnection();
    }
  });
}

export class BodyProxy {
  private _closed = false;

  constructor(
    private readonly originalCdr: (() => void) | null,
    private readonly body: RackBody,
  ) {}

  static wrap(originalCdr: (() => void) | null, body: RackBody): BodyProxy {
    const target = new BodyProxy(originalCdr, body);
    return methodMissingProxy(target, { delegate: (proxyTarget) => proxyTarget.body });
  }

  closedQ(): boolean {
    return this._closed;
  }

  respondTo(name: string): boolean {
    return name in this || name in Object(this.body);
  }

  each(callback: (bit: unknown) => void): void {
    const body = this.body as { each?: (cb: (bit: unknown) => void) => void };
    if (typeof body.each === "function") {
      body.each(callback);
    } else if (Array.isArray(this.body)) {
      this.body.forEach(callback);
    }
  }

  close(): void {
    if (this._closed) return;
    this._closed = true;
    try {
      const body = this.body as { close?: () => void };
      if (typeof body.close === "function") body.close();
    } finally {
      this.originalCdr?.();
    }
  }
}

export class ConnectionManagement {
  constructor(private readonly app: RackApp) {}

  call(env: Record<string, unknown>): RackResponse {
    const testing = Boolean(env["rack.test"]);
    try {
      const [status, headers, body] = this.app.call(env);
      const proxy = BodyProxy.wrap(testing ? null : clearActiveConnections, body);
      return [status, headers, proxy];
    } catch (error) {
      if (!testing) clearActiveConnections();
      throw error;
    }
  }
}
