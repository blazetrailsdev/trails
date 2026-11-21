import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { TestCase } from "@blazetrails/activesupport/test-case";
import { Isolation } from "@blazetrails/activesupport/testing/isolation";
import { MemoryStore } from "@blazetrails/activesupport";
import { MockRequest, type RackEnv } from "@blazetrails/rack";
import { ActionController } from "@blazetrails/actionpack";
import { FileUtils, TopLevel, constSet, include, rbModName } from "@blazetrails/ruby-compat";
import type { Generation } from "../support/isolation/abstract-unit.js";
import "../support/isolation/abstract-unit.js";
import { Trails } from "../../lib/trails.js";
import "../../lib/trailties/action-dispatch.js";
import "../../lib/trailties/active-record.js";

type Rack = {
  get(path: string, params?: unknown, env?: Record<string, unknown>): Promise<unknown>;
  lastResponse(): { status: number; headers: Record<string, string | undefined>; body: string };
};

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging, @typescript-eslint/no-empty-object-type
interface MiddlewareTest extends Generation {}
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
class MiddlewareTest extends TestCase {
  bootBang(): Promise<void> {
    return this.bootTrails();
  }

  middleware(): string[] {
    return [...(Trails.application!.middleware as Iterable<{ klass: unknown }>)].map(
      (m) => rbModName(m.klass as object) ?? (m.klass as { name: string }).name,
    );
  }
}
include(MiddlewareTest, Isolation);

const rack = (expr: string) =>
  `await import("@blazetrails/rack").then(({ Config, Runtime, Sendfile }) => { void Config; void Runtime; void Sendfile; ${expr} });`;

describe("Trails::Command::MiddlewareTest", { timeout: 120_000 }, () => {
  let t: MiddlewareTest;

  beforeEach(async () => {
    t = new MiddlewareTest("test");
    await t.buildApp();
    await FileUtils.rmRfAsync(`${await t.appPath()}/config/environments`);
  });

  afterEach(() => t.teardownApp());

  const app = () => Trails.application!;

  // BLOCKED: isolation-harness-cache-store-is-mem-cache-store
  it.skip("default middleware stack", async () => {
    await t.addToConfig(`this.config.activeRecord.migrationError = "page_load";`);
    await t.addToConfig("this.config.serverTiming = true;");

    await t.bootBang();

    expect(t.middleware()).toEqual([
      "ActionDispatch::HostAuthorization",
      "Rack::Sendfile",
      "ActionDispatch::Static",
      "ActionDispatch::Executor",
      "ActionDispatch::ServerTiming",
      "ActiveSupport::Cache::Strategy::LocalCache",
      "Rack::Runtime",
      "Rack::MethodOverride",
      "ActionDispatch::RequestId",
      "ActionDispatch::RemoteIp",
      "Trails::Rack::Logger",
      "ActionDispatch::ShowExceptions",
      "ActionDispatch::DebugExceptions",
      "ActionDispatch::Reloader",
      "ActionDispatch::Callbacks",
      "ActiveRecord::Migration::CheckPending",
      "ActionDispatch::Cookies",
      "ActionDispatch::Session::CookieStore",
      "ActionDispatch::Flash",
      "ActionDispatch::ContentSecurityPolicy::Middleware",
      "ActionDispatch::PermissionsPolicy::Middleware",
      "Rack::Head",
      "Rack::ConditionalGet",
      "Rack::ETag",
      "Rack::TempfileReaper",
    ]);
  });

  // BLOCKED: isolation-harness-cache-store-is-mem-cache-store
  it.skip("default middleware stack when requests are local", async () => {
    await t.addToConfig("this.config.considerAllRequestsLocal = true;");
    await t.addToConfig(`this.config.activeRecord.migrationError = "page_load";`);
    await t.addToConfig("this.config.serverTiming = true;");

    await t.bootBang();

    expect(t.middleware()).toEqual([
      "ActionDispatch::HostAuthorization",
      "Rack::Sendfile",
      "ActionDispatch::Static",
      "ActionDispatch::Executor",
      "ActionDispatch::ServerTiming",
      "ActiveSupport::Cache::Strategy::LocalCache",
      "Rack::Runtime",
      "Rack::MethodOverride",
      "ActionDispatch::RequestId",
      "ActionDispatch::RemoteIp",
      "Trails::Rack::Logger",
      "ActionDispatch::ShowExceptions",
      "ActionDispatch::DebugExceptions",
      "ActionDispatch::ActionableExceptions",
      "ActionDispatch::Reloader",
      "ActionDispatch::Callbacks",
      "ActiveRecord::Migration::CheckPending",
      "ActionDispatch::Cookies",
      "ActionDispatch::Session::CookieStore",
      "ActionDispatch::Flash",
      "ActionDispatch::ContentSecurityPolicy::Middleware",
      "ActionDispatch::PermissionsPolicy::Middleware",
      "Rack::Head",
      "Rack::ConditionalGet",
      "Rack::ETag",
      "Rack::TempfileReaper",
    ]);
  });

  // BLOCKED: isolation-harness-cache-store-is-mem-cache-store
  it.skip("api middleware stack", async () => {
    await t.addToConfig("this.config.apiOnly = true;");

    await t.bootBang();

    expect(t.middleware()).toEqual([
      "ActionDispatch::HostAuthorization",
      "Rack::Sendfile",
      "ActionDispatch::Static",
      "ActionDispatch::Executor",
      "ActiveSupport::Cache::Strategy::LocalCache",
      "Rack::Runtime",
      "ActionDispatch::RequestId",
      "ActionDispatch::RemoteIp",
      "Trails::Rack::Logger",
      "ActionDispatch::ShowExceptions",
      "ActionDispatch::DebugExceptions",
      "ActionDispatch::Reloader",
      "ActionDispatch::Callbacks",
      "Rack::Head",
      "Rack::ConditionalGet",
      "Rack::ETag",
    ]);
  });

  it("middleware dependencies", async () => {
    await t.bootBang();

    const dependencies = [
      [
        "Trails::Rack::Logger",
        "Rack::MethodOverride",
        "ActionDispatch::RequestId",
        "ActionDispatch::RemoteIp",
      ],

      ["ActionDispatch::Executor", "ActionDispatch::Static"],

      [
        "ActionDispatch::Reloader",
        "ActionDispatch::ShowExceptions",
        "ActionDispatch::DebugExceptions",
      ],

      ["ActionDispatch::Static", "Rack::Sendfile"],
      ["ActionDispatch::Flash", "ActionDispatch::Session::CookieStore"],
      ["ActionDispatch::Session::CookieStore", "ActionDispatch::Cookies"],
    ];

    const middleware = t.middleware();
    const sorted: string[] = [];
    const visit = (n: string): void => {
      if (sorted.includes(n)) return;
      for (const [m, ...ds] of dependencies) if (m === n) ds.forEach(visit);
      sorted.push(n);
    };
    [...new Set([...middleware, ...dependencies.flat()])].forEach(visit);
    expect(middleware).toEqual(sorted);
  });

  it("ActionDispatch::HostAuthorization is not included if no hosts are configured", async () => {
    await t.addToConfig("this.config.hosts = [];");
    await t.bootBang();

    expect(t.middleware()).not.toContain("ActionDispatch::HostAuthorization");
  });

  it("ActionDispatch::HostAuthorization is not included if hosts is set to nil", async () => {
    await t.addToConfig("this.config.hosts = null!;");
    await t.bootBang();

    expect(t.middleware()).not.toContain("ActionDispatch::HostAuthorization");
  });

  it("ActionDispatch::HostAuthorization is included if hosts is set to IPAddr", async () => {
    await t.addToConfig(
      `await import("@blazetrails/ruby-compat").then(({ IPAddr }) => { AppTemplate.Application.config.hosts = new IPAddr("0.0.0.0/0") as never; });`,
    );
    await t.bootBang();

    expect(t.middleware()).toContain("ActionDispatch::HostAuthorization");
  });

  it("Rack::Cache is not included by default", async () => {
    await t.bootBang();

    expect(
      t.middleware(),
      "Rack::Cache is not included in the default stack unless you set config.action_dispatch.rack_cache",
    ).not.toContain("Rack::Cache");
  });

  // BLOCKED: default-middleware-stack-omits-rack-cache
  it.skip("Rack::Cache is present when action_dispatch.rack_cache is set", async () => {
    await t.addToConfig("this.config.actionDispatch.rackCache = true;");

    await t.bootBang();

    expect(t.middleware()).toContain("Rack::Cache");
  });

  it("ActiveRecord::Migration::CheckPending is present when active_record.migration_error is set to :page_load", async () => {
    await t.addToConfig(`this.config.activeRecord.migrationError = "page_load";`);

    await t.bootBang();

    expect(t.middleware()).toContain("ActiveRecord::Migration::CheckPending");
  });

  it("ActionDispatch::AssumeSSL is present when assume_ssl is set", async () => {
    await t.addToConfig("this.config.assumeSsl = true;");
    await t.bootBang();
    expect(t.middleware()).toContain("ActionDispatch::AssumeSSL");
  });

  it("ActionDispatch::SSL is present when force_ssl is set", async () => {
    await t.addToConfig("this.config.forceSsl = true;");
    await t.bootBang();
    expect(t.middleware()).toContain("ActionDispatch::SSL");
  });

  it("silence healthcheck", async () => {
    await t.addToConfig(`this.config.silenceHealthcheckPath = "/up";`);
    await t.bootBang();
    expect(t.middleware()).toContain("Trails::Rack::SilenceRequest");
  });

  it("ActionDispatch::SSL is configured with options when given", async () => {
    await t.addToConfig("this.config.forceSsl = true;");
    await t.addToConfig(`this.config.sslOptions = { redirect: { host: "example.com" } };`);
    await t.bootBang();

    expect(
      (app().middleware as unknown as { middlewares: { args: unknown[] }[] }).middlewares[1].args,
    ).toEqual([{ redirect: { host: "example.com" }, sslDefaultRedirectStatus: 308 }]);
  });

  it("removing Active Record omits its middleware", async () => {
    await t.useFrameworks([]);
    await t.bootBang();
    expect(t.middleware()).not.toContain("ActiveRecord::Migration::CheckPending");
  });

  it("includes executor", async () => {
    await t.bootBang();
    expect(t.middleware()).toContain("ActionDispatch::Executor");
  });

  it("does not include lock if reload is disabled and eager_load enabled", async () => {
    await t.addToConfig("this.config.enableReloading = false;");
    await t.addToConfig("this.config.eagerLoad = true;");
    await t.bootBang();
    expect(t.middleware()).not.toContain("Rack::Lock");
  });

  it("does not include lock if allow_concurrency is set to :unsafe", async () => {
    await t.addToConfig(`this.config.allowConcurrency = "unsafe";`);
    await t.bootBang();
    expect(t.middleware()).not.toContain("Rack::Lock");
  });

  it("includes lock if allow_concurrency is disabled", async () => {
    await t.addToConfig("this.config.allowConcurrency = false;");
    await t.bootBang();
    expect(t.middleware()).toContain("Rack::Lock");
  });

  it("removes static asset server if public_file_server.enabled is disabled", async () => {
    await t.addToConfig("this.config.publicFileServer.enabled = false;");
    await t.bootBang();
    expect(t.middleware()).not.toContain("ActionDispatch::Static");
  });

  it("can delete a middleware from the stack", async () => {
    await t.addToConfig(
      `await import("@blazetrails/actionpack").then(({ Static }) => AppTemplate.Application.config.middleware.delete(Static));`,
    );
    await t.bootBang();
    expect(t.middleware()).not.toContain("ActionDispatch::Static");
  });

  it("can delete a middleware from the stack even if insert_before is added after delete", async () => {
    await t.addToConfig(rack("AppTemplate.Application.config.middleware.delete(Runtime);"));
    await t.addToConfig(
      rack("AppTemplate.Application.config.middleware.insertBefore(Runtime, Config);"),
    );
    await t.bootBang();
    expect(t.middleware()).toContain("Rack::Config");
    expect(t.middleware().includes("Rack::Runtime")).toBeFalsy();
  });

  it("can delete a middleware from the stack even if insert_after is added after delete", async () => {
    await t.addToConfig(rack("AppTemplate.Application.config.middleware.delete(Runtime);"));
    await t.addToConfig(
      rack("AppTemplate.Application.config.middleware.insertAfter(Runtime, Config);"),
    );
    await t.bootBang();
    expect(t.middleware()).toContain("Rack::Config");
    expect(t.middleware().includes("Rack::Runtime")).toBeFalsy();
  });

  it("includes exceptions middlewares even if action_dispatch.show_exceptions is disabled", async () => {
    await t.addToConfig(`this.config.actionDispatch.showExceptions = ":none";`);
    await t.bootBang();
    expect(t.middleware()).toContain("ActionDispatch::ShowExceptions");
    expect(t.middleware()).toContain("ActionDispatch::DebugExceptions");
  });

  it("removes ActionDispatch::Reloader if reload is disabled", async () => {
    await t.addToConfig("this.config.enableReloading = false;");
    await t.bootBang();
    expect(t.middleware()).not.toContain("ActionDispatch::Reloader");
  });

  it("use middleware", async () => {
    await t.useFrameworks([]);
    await t.addToConfig(rack("AppTemplate.Application.config.middleware.use(Config);"));
    await t.bootBang();
    expect(t.middleware().at(-1)).toBe("Rack::Config");
  });

  it("insert middleware after", async () => {
    await t.addToConfig(
      rack("AppTemplate.Application.config.middleware.insertAfter(Sendfile, Config);"),
    );
    await t.bootBang();
    expect(t.middleware()[2]).toBe("Rack::Config");
  });

  it("unshift middleware", async () => {
    await t.addToConfig(rack("AppTemplate.Application.config.middleware.unshift(Config);"));
    await t.bootBang();
    expect(t.middleware()[0]).toBe("Rack::Config");
  });

  it("Trails.cache does not respond to middleware", async () => {
    await t.addToConfig(`this.config.cacheStore = [":memory_store", { timeout: 10 }];`);
    await t.bootBang();
    expect(t.middleware()[4]).toBe("Rack::Runtime");
    expect(Trails.cache).toBeInstanceOf(MemoryStore);
  });

  // BLOCKED: isolation-harness-cache-store-is-mem-cache-store
  it.skip("Trails.cache does respond to middleware", async () => {
    await t.bootBang();
    expect(t.middleware()[4]).toBe("ActiveSupport::Cache::Strategy::LocalCache");
    expect(t.middleware()[5]).toBe("Rack::Runtime");
  });

  it("insert middleware before", async () => {
    await t.addToConfig(
      rack("AppTemplate.Application.config.middleware.insertBefore(Sendfile, Config);"),
    );
    await t.bootBang();
    expect(t.middleware()[1]).toBe("Rack::Config");
  });

  it("can't change middleware after it's built", async () => {
    await t.bootBang();
    const { Config } = await import("@blazetrails/rack");
    expect(() => app().config.middleware.use(Config)).toThrow(TypeError);
  });

  // BLOCKED: rack-etag-digests-to-ary-response-bodies
  it.skip("conditional get + etag middlewares handle http caching based on body", async () => {
    const root = await t.appPath();
    await t.makeBasicApp((app) => {
      app.config.setRoot(root);
    });

    class OmgController extends ActionController.Base {
      async index(): Promise<void> {
        if (this.params.get("nothing") != null) {
          await this.render({ plain: "" });
        } else {
          await this.render({ plain: "OMG" });
        }
      }
    }
    constSet(TopLevel, "OmgController", OmgController);

    const etag = "W/" + JSON.stringify("c00862d1c6c1cf7c1b49388306e7b3c1");

    const r = t as unknown as Rack;
    await r.get("/");
    expect(r.lastResponse().status).toBe(200);
    expect(r.lastResponse().body).toBe("OMG");
    expect(r.lastResponse().headers["content-type"]).toBe("text/plain; charset=utf-8");
    expect(r.lastResponse().headers["cache-control"]).toBe("max-age=0, private, must-revalidate");
    expect(r.lastResponse().headers["etag"]).toBe(etag);

    await r.get("/", {}, { HTTP_IF_NONE_MATCH: etag });
    expect(r.lastResponse().status).toBe(304);
    expect(r.lastResponse().body).toBe("");
    expect(r.lastResponse().headers["content-type"]).toBeUndefined();
    expect(r.lastResponse().headers["cache-control"]).toBe("max-age=0, private, must-revalidate");
    expect(r.lastResponse().headers["etag"]).toBe(etag);

    await r.get("/?nothing=true");
    expect(r.lastResponse().status).toBe(200);
    expect(r.lastResponse().body).toBe("");
    expect(r.lastResponse().headers["content-type"]).toBe("text/plain; charset=utf-8");
    expect(r.lastResponse().headers["cache-control"]).toBe("no-cache");
    expect(r.lastResponse().headers["etag"]).toBeUndefined();
  });

  it("ORIGINAL_FULLPATH is passed to env", async () => {
    await t.bootBang();
    const env = MockRequest.envFor("/foo/?something") as RackEnv;
    await app().call(env);

    expect(env["ORIGINAL_FULLPATH"]).toBe("/foo/?something");
  });

  it("database selector middleware is installed from application.rb", async () => {
    await t.addToConfig("this.config.activeRecord.databaseSelector = { delay: 10 };");

    await t.bootBang();

    expect(t.middleware()).toContain("ActiveRecord::Middleware::DatabaseSelector");
  });

  it("database selector middleware is installed from config/initializers", async () => {
    await t.appFile(
      "config/initializers/multi-db.ts",
      `
      import { Duration } from "@blazetrails/activesupport";
      import { DatabaseSelectorResolver, DatabaseSelectorSession } from "@blazetrails/activerecord";
      import { Trails } from "@blazetrails/trailties";

      Trails.application!.configure(function () {
        this.config.activeRecord.databaseSelector = { delay: Duration.seconds(15) };
        this.config.activeRecord.databaseResolver = DatabaseSelectorResolver;
        this.config.activeRecord.databaseResolverContext = DatabaseSelectorSession;
      });
`,
    );

    await t.bootBang();

    expect(t.middleware()).toContain("ActiveRecord::Middleware::DatabaseSelector");
  });

  it("shard selector middleware is installed by config option", async () => {
    await t.addToConfig("this.config.activeRecord.shardResolver = () => {};");

    await t.bootBang();

    expect(t.middleware()).toContain("ActiveRecord::Middleware::ShardSelector");
  });

  it("shard selector middleware is installed from config/initializers", async () => {
    await t.appFile(
      "config/initializers/multi-db.ts",
      `
      import { Trails } from "@blazetrails/trailties";

      Trails.application!.configure(function () {
        this.config.activeRecord.shardSelector = { lock: true };
        this.config.activeRecord.shardResolver = (request: { host: string }) => request.host;
      });
`,
    );

    await t.bootBang();

    expect(t.middleware()).toContain("ActiveRecord::Middleware::ShardSelector");
  });
});
