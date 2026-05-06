/**
 * Mirrors: ActiveRecord::Middleware::DatabaseSelector
 *
 * Provides automatic primary/replica switching based on request type and
 * recency of writes, using pluggable resolver and context classes.
 */

import { Notifications } from "@blazetrails/activesupport";
import { Resolver } from "./database-selector/resolver.js";
import type { ResolverContext } from "./database-selector/resolver.js";
import { Session } from "./database-selector/resolver/session.js";

export interface MiddlewareRequest {
  method: string;
  session: {
    get(key: string): unknown;
    set(key: string, value: unknown): void;
    delete(key: string): void;
  };
}

type ResolverClass = {
  call(context: ResolverContext, options: Record<string, unknown>): Resolver;
};

type ContextClass = {
  call(request: MiddlewareRequest): ResolverContext;
};

export class DatabaseSelector {
  /** @internal */
  readonly resolverKlass: ResolverClass;
  /** @internal */
  readonly contextKlass: ContextClass;
  /** @internal */
  readonly options: Record<string, unknown>;

  private readonly app: (request: MiddlewareRequest) => Promise<unknown>;

  constructor(
    app: (request: MiddlewareRequest) => Promise<unknown>,
    resolverKlass?: ResolverClass,
    contextKlass?: ContextClass,
    options: Record<string, unknown> = {},
  ) {
    this.app = app;
    this.resolverKlass = resolverKlass ?? (Resolver as unknown as ResolverClass);
    this.contextKlass = contextKlass ?? (Session as unknown as ContextClass);
    this.options = options;
  }

  async call(request: MiddlewareRequest): Promise<unknown> {
    return this.selectDatabase(request, () => this.app(request));
  }

  /** @internal */
  instrumenter(): typeof Notifications {
    return Notifications;
  }

  /** @internal */
  selectDatabase(request: MiddlewareRequest, blk: () => Promise<unknown>): Promise<unknown> {
    const context = this.contextKlass.call(request);
    const resolver = this.resolverKlass.call(context, this.options);

    const responseP = resolver.isReadingRequest(request) ? resolver.read(blk) : resolver.write(blk);

    return responseP.then((response) => {
      resolver.updateContext(response);
      return response;
    });
  }
}

export { Resolver };
export type { ResolverContext };
