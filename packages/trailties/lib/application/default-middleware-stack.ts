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
      stack.use(HostAuthorization, config.hosts, config.hostAuthorization);
    }

    if (config.assumeSsl) {
      stack.use(AssumeSSL);
    }

    if (config.forceSsl) {
      stack.use(SSL, {
        ...config.sslOptions,
        sslDefaultRedirectStatus: config.actionDispatch.sslDefaultRedirectStatus,
      });
    }

    stack.use(Sendfile, config.actionDispatch.xSendfileHeader);

    if (config.publicFileServer.enabled) {
      const headers = config.publicFileServer.headers ?? {};
      stack.use(Static, this.paths.get("public")?.toAry()[0], {
        index: config.publicFileServer.indexName,
        headers,
      });
    }

    if (config.allowConcurrency === false) {
      stack.use(Lock);
    }

    stack.use(Executor, this.app.executor);

    if (config.serverTiming) stack.use(ServerTiming);
    stack.use(Runtime);
    if (!config.apiOnly) stack.use(MethodOverride);
    stack.use(RequestId, { header: config.actionDispatch.requestIdHeader });
    stack.use(
      RemoteIp,
      config.actionDispatch.ipSpoofingCheck,
      config.actionDispatch.trustedProxies,
    );

    const path = config.silenceHealthcheckPath;
    if (path != null) {
      stack.use(SilenceRequest, { path });
    }

    stack.use(Logger, { taggers: config.logTags });
    stack.use(ShowExceptions, this._showExceptionsApp());
    stack.use(DebugExceptions, this.app, config.debugExceptionResponseFormat);

    if (config.considerAllRequestsLocal) {
      stack.use(ActionableExceptions);
    }

    if (config.isReloadingEnabled()) {
      stack.use(Reloader, this.app.reloader);
    }

    stack.use(Callbacks);

    if (!config.apiOnly) {
      stack.use(Cookies);
    }

    if (!config.apiOnly && config.sessionStore() != null) {
      if (
        config.forceSsl &&
        (config.sslOptions.secureCookies ?? true) &&
        !("secure" in config.sessionOptions)
      ) {
        config.sessionOptions.secure = true;
      }
      stack.use(config.sessionStore()!, config.sessionOptions);
    }

    if (!config.apiOnly) {
      stack.use(Flash);
      stack.use(ContentSecurityPolicyMiddleware);
      stack.use(PermissionsPolicyMiddleware);
    }

    stack.use(Head);
    stack.use(ConditionalGet);
    stack.use(ETag, "no-cache");

    if (!config.apiOnly) stack.use(TempfileReaper);

    if (config.isRespondTo("activeRecord")) {
      const selectorOptions = config.activeRecord.databaseSelector;
      if (selectorOptions != null) {
        const resolver = config.activeRecord.databaseResolver;
        const context = config.activeRecord.databaseResolverContext;

        stack.use(DatabaseSelector, resolver, context, selectorOptions);
      }

      const shardResolver = config.activeRecord.shardResolver;
      if (shardResolver != null) {
        const options = config.activeRecord.shardSelector ?? {};

        stack.use(ShardSelector, shardResolver, options);
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
