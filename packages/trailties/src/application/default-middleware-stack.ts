import {
  ActionableExceptions,
  AssumeSSL,
  Callbacks,
  ContentSecurityPolicyMiddleware,
  PermissionsPolicyMiddleware,
  Cookies,
  DebugExceptions,
  Executor,
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

    if (config.publicFileServer.enabled) {
      const headers = config.publicFileServer.headers ?? {};
      stack.use(Static as never, this.paths.get("public")?.toAry()[0], {
        index: config.publicFileServer.indexName,
        headers,
      });
    }

    stack.use(Executor as never, this.app.executor);

    if (config.serverTiming) stack.use(ServerTiming as never);
    stack.use(RequestId as never);
    stack.use(RemoteIp as never);
    stack.use(ShowExceptions as never, this._showExceptionsApp());
    stack.use(DebugExceptions as never, this.app, config.debugExceptionResponseFormat);

    if (config.considerAllRequestsLocal) {
      stack.use(ActionableExceptions as never);
    }

    if (config.reloadingEnabled()) {
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
      stack.use(ContentSecurityPolicyMiddleware as never);
      stack.use(PermissionsPolicyMiddleware as never);
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
