import { describe, it, expect } from "vitest";
import {
  Callbacks,
  ContentSecurityPolicyMiddleware,
  Cookies,
  DebugExceptions,
  Executor,
  Flash,
  PermissionsPolicyMiddleware,
  RemoteIp,
  RequestId,
  ShowExceptions,
} from "@blazetrails/actionpack";
import {
  ConditionalGet,
  ETag,
  Head,
  MethodOverride,
  MockRequest,
  Runtime,
  Sendfile,
  TempfileReaper,
  bodyFromString,
} from "@blazetrails/rack";
import type { RackEnv } from "@blazetrails/rack";
import "../trailties/action-dispatch.js";
import { Application } from "../application.js";
import { Root } from "../paths.js";
import { Logger } from "../rack/logger.js";
import { Configuration } from "./configuration.js";
import { DefaultMiddlewareStack } from "./default-middleware-stack.js";

function defaultStack(mutate: (c: Configuration) => void = () => {}) {
  const paths = new Root("/app");
  paths.add("public");
  const config = new Configuration();
  config.publicFileServer.enabled = false;
  config.enableReloading = false;
  config.considerAllRequestsLocal = false;
  mutate(config);
  const app = new (class extends Application {})();
  return new DefaultMiddlewareStack(
    { config, executor: app.executor, reloader: app.reloader },
    config,
    paths,
  ).buildStack();
}

function buildStack(mutate?: (c: Configuration) => void): unknown[] {
  return [...defaultStack(mutate)].map((entry) => entry.klass);
}

describe("DefaultMiddlewareStack (trails)", () => {
  it("uses the content security policy and permissions policy middleware in Rails' order", () => {
    const klasses = buildStack();
    const csp = klasses.indexOf(ContentSecurityPolicyMiddleware);
    const permissions = klasses.indexOf(PermissionsPolicyMiddleware);

    expect(csp).toBeGreaterThanOrEqual(0);
    expect(permissions).toBe(csp + 1);
  });

  it("uses the Rack layer and Flash in default_middleware_stack.rb's order", () => {
    expect(buildStack((c) => c.sessionStore(":disabled"))).toEqual([
      Sendfile,
      Executor,
      Runtime,
      MethodOverride,
      RequestId,
      RemoteIp,
      Logger,
      ShowExceptions,
      DebugExceptions,
      Callbacks,
      Cookies,
      Flash,
      ContentSecurityPolicyMiddleware,
      PermissionsPolicyMiddleware,
      Head,
      ConditionalGet,
      ETag,
      TempfileReaper,
    ]);
  });

  it("omits MethodOverride, Flash and TempfileReaper when api_only", () => {
    const klasses = buildStack((c) => (c.apiOnly = true));
    expect(klasses).not.toContain(MethodOverride);
    expect(klasses).not.toContain(Flash);
    expect(klasses).not.toContain(TempfileReaper);
    expect(klasses).toEqual(expect.arrayContaining([Head, ConditionalGet, ETag]));
  });

  it("honours _method=patch on a POST", async () => {
    const stack = defaultStack((c) => c.sessionStore(":disabled"));
    let seen: unknown;
    const endpoint = async (env: RackEnv) => {
      seen = env["REQUEST_METHOD"];
      return [200, { "content-type": "text/plain" }, bodyFromString("ok")] as [
        number,
        Record<string, string>,
        AsyncIterable<string>,
      ];
    };
    const env = MockRequest.envFor("/posts/1", {
      ":method": "POST",
      ":params": { _method: "patch" },
    });
    await stack.build(endpoint)(env);
    expect(seen).toBe("PATCH");
  });
});
