import { Application } from "@blazetrails/trailties";
import {
  ActionDispatch,
  ContentSecurityPolicyMiddleware,
  Cookies,
  Flash,
  RemoteIp,
  RequestId,
  Static,
} from "@blazetrails/actionpack";
import {
  ConditionalGet,
  ETag,
  MethodOverride,
  Runtime,
  Sendfile,
  TempfileReaper,
} from "@blazetrails/rack";

import "@blazetrails/trailties/all";

export class TwelveDollarServer extends Application {
  static {
    this.config.loadDefaults("8.0");

    this.config.x.bootedAt = performance.now() / 1000;
    this.config.x.jwtSecret = process.env.JWT_SECRET;

    for (const middleware of [
      Sendfile,
      Static,
      Runtime,
      MethodOverride,
      RequestId,
      RemoteIp,
      Cookies,
      ActionDispatch.Session.CookieStore,
      Flash,
      ContentSecurityPolicyMiddleware,
      ConditionalGet,
      ETag,
      TempfileReaper,
    ]) {
      this.config.middleware.delete(middleware as never);
    }
  }
}

Application.register(TwelveDollarServer, import.meta.dirname);

declare module "@blazetrails/trailties" {
  interface ApplicationRegistry {
    application: TwelveDollarServer;
  }
}
