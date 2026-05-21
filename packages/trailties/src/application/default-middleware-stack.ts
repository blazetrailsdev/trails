// Port of `Rails::Application::DefaultMiddlewareStack`.
import {
  ActionableExceptions,
  AssumeSSL,
  Callbacks,
  ContentSecurityPolicyMiddleware,
  Cookies,
  DebugExceptions,
  HostAuthorization,
  MiddlewareStack,
  PublicExceptions,
  RemoteIp,
  RequestId,
  ServerTiming,
  ShowExceptions,
  SSL,
  Static,
} from "@blazetrails/actionpack";
import type { Configuration } from "./configuration.js";

export interface DefaultStackHostApp {
  config: Configuration;
}

export interface DefaultStackPaths {
  public(): string | undefined;
}

export class DefaultMiddlewareStack {
  readonly app: DefaultStackHostApp;
  readonly config: Configuration;
  readonly paths: DefaultStackPaths;

  constructor(app: DefaultStackHostApp, config: Configuration, paths: DefaultStackPaths) {
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
      const root = this.paths.public();
      if (root) {
        stack.use(Static as never, root, {
          index: config.publicFileServer.indexName,
          headers: config.publicFileServer.headers ?? {},
        });
      }
    }

    if (config.serverTiming) stack.use(ServerTiming as never);
    stack.use(RequestId as never);
    stack.use(RemoteIp as never);
    stack.use(ShowExceptions as never, this._showExceptionsApp());
    stack.use(DebugExceptions as never, this.app, config.debugExceptionResponseFormat);

    if (config.considerAllRequestsLocal) {
      stack.use(ActionableExceptions as never);
    }

    stack.use(Callbacks as never);

    if (!config.apiOnly) {
      stack.use(Cookies as never);
    }

    if (!config.apiOnly && config.sessionStore) {
      if (
        config.forceSsl &&
        (config.sslOptions.secureCookies ?? true) &&
        !("secure" in config.sessionOptions)
      ) {
        config.sessionOptions.secure = true;
      }
      stack.use(config.sessionStore as never, config.sessionOptions);
    }

    if (!config.apiOnly) {
      stack.use(ContentSecurityPolicyMiddleware as never);
    }

    return stack;
  }

  /** @internal Rails' `exceptions_app || PublicExceptions.new(Rails.public_path)`. */
  private _showExceptionsApp(): unknown {
    return this.config.exceptionsApp ?? new PublicExceptions(this.paths.public() ?? "/public");
  }
}
