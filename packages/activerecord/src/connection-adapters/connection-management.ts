import { Base } from "../base.js";

/**
 * Rack-style response triple `[status, headers, body]`.
 */
export type RackResponse = [number, Record<string, unknown>, RackBody];

/**
 * Minimal Rack body contract. A body is iterable via `each` and may optionally
 * respond to `close` and arbitrary methods (e.g. `toPath`).
 */
export type RackBody = unknown;

/**
 * A Rack application: anything that responds to `call(env)` and returns a
 * response triple.
 */
export interface RackApp {
  call(env: Record<string, unknown>): RackResponse;
}

/**
 * Release every active connection whose transaction is closed or non-joinable.
 *
 * Mirrors the observable contract of `ActiveRecord::Base.clear_active_connections!`
 * as exercised through the request lifecycle: a connection with an open,
 * joinable transaction (i.e. one opened by an in-flight `Base.transaction`
 * block) is left checked out so the surrounding transaction survives the
 * body-close, matching `ConnectionPool::ExecutorHooks#complete`.
 *
 * @internal
 */
function clearActiveConnections(): void {
  Base.connectionHandler.eachConnectionPool(null, (pool) => {
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

/**
 * Wraps a Rack body so connections are cleared when the body is closed,
 * delegating every other method to the underlying body.
 *
 * Mirrors: ActiveRecord::ConnectionAdapters::ConnectionManagement::BodyProxy
 */
export class BodyProxy {
  private _closed = false;

  constructor(
    private readonly originalCdr: (() => void) | null,
    private readonly body: RackBody,
  ) {}

  /**
   * Wraps `body` in a {@link BodyProxy} and returns a JS Proxy that forwards
   * any unknown property access to the underlying body — the equivalent of
   * Ruby's `method_missing` delegation (so e.g. `toPath` reaches the body).
   */
  static wrap(originalCdr: (() => void) | null, body: RackBody): BodyProxy {
    const target = new BodyProxy(originalCdr, body);
    return new Proxy(target, {
      get(proxyTarget, prop, receiver) {
        if (prop in proxyTarget) return Reflect.get(proxyTarget, prop, receiver);
        const value = (body as Record<string | symbol, unknown>)?.[prop];
        return typeof value === "function" ? value.bind(body) : value;
      },
      has(proxyTarget, prop) {
        return prop in proxyTarget || prop in Object(body);
      },
    });
  }

  closedQ(): boolean {
    return this._closed;
  }

  respondTo(name: string): boolean {
    // `Object(body)` so the membership check never throws on a primitive body
    // (e.g. a string response body) — Ruby's `respond_to?` is total here.
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
    // Idempotent, matching `Rack::BodyProxy#close` (`return if @closed`) — the
    // proxy current Rails wraps response bodies in. Guards the clear callback
    // and the underlying close from running more than once.
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

/**
 * Rack middleware that clears active connections at the end of each request.
 *
 * After the wrapped app's response body is closed, active connections are
 * released back to their pools; if the app raises, connections are cleared
 * before the exception propagates. When the request is a test request
 * (the `rack.test` key is present in `env`), connections are left untouched.
 *
 * Mirrors: ActiveRecord::ConnectionAdapters::ConnectionManagement
 */
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
