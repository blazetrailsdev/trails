import {
  ActionableExceptions,
  AssumeSSL,
  Callbacks,
  ContentSecurityPolicyMiddleware,
  PermissionsPolicyMiddleware,
  Cookies,
  DebugExceptions,
  Executor,
  Flash,
  HostAuthorization,
  MiddlewareStack,
  PublicExceptions,
  RemoteIp,
  Reloader,
  RequestId,
  ServerTiming,
  ShowExceptions,
  SSL,
  Static,
} from "@blazetrails/actionpack";
import type { ExecutorLike } from "@blazetrails/actionpack";
import {
  ConditionalGet,
  ETag,
  Head,
  Lock,
  MethodOverride,
  Runtime,
  Sendfile,
  TempfileReaper,
} from "@blazetrails/rack";
import { DatabaseSelector, ShardSelector } from "@blazetrails/activerecord";
import { Logger } from "../rack/logger.js";
import { SilenceRequest } from "../rack/silence-request.js";
import type { Configuration } from "./configuration.js";
import type { Root } from "../paths.js";

export interface DefaultStackHostApp {
  config: Configuration;
  executor: ExecutorLike;
  reloader: ExecutorLike;
}

export class DefaultMiddlewareStack {
  readonly app: DefaultStackHostApp;
  readonly config: Configuration;
  readonly paths: Root;

  constructor(app: DefaultStackHostApp, config: Configuration, paths: Root) {
    this.app = app;
    this.config = config;
    this.paths = paths;
  }

  buildStack(): MiddlewareStack {
    const stack = new MiddlewareStack();
    const config = this.config;

    if (config.hosts.length > 0) {
      stack.use(HostAuthorization as never, config.hosts, config.hostAuthorization);
    }

    if (config.assumeSsl) {
      stack.use(AssumeSSL as never);
    }

    if (config.forceSsl) {
      stack.use(SSL as never, config.sslOptions);
    }

    stack.use(Sendfile as never, config.actionDispatch.xSendfileHeader);

    if (config.publicFileServer.enabled) {
      const headers = config.publicFileServer.headers ?? {};
      stack.use(Static as never, this.paths.get("public")?.toAry()[0], {
        index: config.publicFileServer.indexName,
        headers,
      });
    }

    if (config.allowConcurrency === false) {
      stack.use(Lock as never);
    }

    stack.use(Executor as never, this.app.executor);

    if (config.serverTiming) stack.use(ServerTiming as never);
    stack.use(Runtime as never);
    if (!config.apiOnly) stack.use(MethodOverride as never);
    stack.use(RequestId as never, { header: config.actionDispatch.requestIdHeader });
    stack.use(
      RemoteIp as never,
      config.actionDispatch.ipSpoofingCheck,
      config.actionDispatch.trustedProxies,
    );

    const path = config.silenceHealthcheckPath;
    if (path != null) {
      stack.use(SilenceRequest as never, { path });
    }

    stack.use(Logger as never, { taggers: config.logTags });
    stack.use(ShowExceptions as never, this._showExceptionsApp());
    stack.use(DebugExceptions as never, { responseFormat: config.debugExceptionResponseFormat });

    if (config.considerAllRequestsLocal) {
      stack.use(ActionableExceptions as never);
    }

    if (config.isReloadingEnabled()) {
      stack.use(Reloader as never, this.app.reloader);
    }

    stack.use(Callbacks as never);

    if (!config.apiOnly) {
      stack.use(Cookies as never);
    }

    if (!config.apiOnly && config.sessionStore() != null) {
      if (
        config.forceSsl &&
        (config.sslOptions.secureCookies ?? true) &&
        !("secure" in config.sessionOptions)
      ) {
        config.sessionOptions.secure = true;
      }
      stack.use(config.sessionStore() as never, config.sessionOptions);
    }

    if (!config.apiOnly) {
      stack.use(Flash as never);
      stack.use(ContentSecurityPolicyMiddleware as never);
      stack.use(PermissionsPolicyMiddleware as never);
    }

    stack.use(Head as never);
    stack.use(ConditionalGet as never);
    stack.use(ETag as never, "no-cache");

    if (!config.apiOnly) stack.use(TempfileReaper as never);

    if (config.isRespondTo("activeRecord")) {
      const selectorOptions = config.activeRecord.databaseSelector;
      if (selectorOptions != null) {
        const resolver = config.activeRecord.databaseResolver;
        const context = config.activeRecord.databaseResolverContext;

        stack.use(DatabaseSelector as never, resolver, context, selectorOptions);
      }

      const shardResolver = config.activeRecord.shardResolver;
      if (shardResolver != null) {
        const options = config.activeRecord.shardSelector ?? {};

        stack.use(ShardSelector as never, shardResolver, options);
      }
    }

    return stack;
  }

  /** @internal */
  private _showExceptionsApp(): unknown {
    return (
      this.config.exceptionsApp ??
      new PublicExceptions(this.paths.get("public")?.toAry()[0] ?? "/public")
    );
  }
}
