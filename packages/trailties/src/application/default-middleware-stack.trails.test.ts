import { describe, it, expect } from "vitest";
import {
  ContentSecurityPolicyMiddleware,
  PermissionsPolicyMiddleware,
} from "@blazetrails/actionpack";
import { Application } from "../application.js";
import { Root } from "../paths.js";
import { Configuration } from "./configuration.js";
import { DefaultMiddlewareStack } from "./default-middleware-stack.js";

function buildStack(): unknown[] {
  const paths = new Root("/app");
  paths.add("public");
  const config = new Configuration();
  config.publicFileServer.enabled = false;
  const app = new (class extends Application {})();
  const stack = new DefaultMiddlewareStack(
    { config, executor: app.executor, reloader: app.reloader },
    config,
    paths,
  ).buildStack();
  return [...stack].map((entry) => entry.klass);
}

describe("DefaultMiddlewareStack (trails)", () => {
  it("uses the content security policy and permissions policy middleware in Rails' order", () => {
    const klasses = buildStack();
    const csp = klasses.indexOf(ContentSecurityPolicyMiddleware);
    const permissions = klasses.indexOf(PermissionsPolicyMiddleware);

    expect(csp).toBeGreaterThanOrEqual(0);
    expect(permissions).toBe(csp + 1);
  });
});
