import { describe, expect, it } from "vitest";
import { useInMemoryDatabaseUrl } from "./support/in-memory-database-url.js";
import { Trailtie as BaseTrailtie } from "./trailtie.js";
import { Trailtie as ActiveRecordTrailtie } from "./trailties/active-record.js";
import { Logger } from "@blazetrails/activesupport";
import { Dir, File, FileUtils, NameError, SecureRandom } from "@blazetrails/ruby-compat";
import { MockRequest, Utils } from "@blazetrails/rack";
import { Configuration } from "./application/configuration.js";
import { Application } from "./application.js";

describe("Application framework railtie initializers", () => {
  useInMemoryDatabaseUrl();

  it("runs a framework railtie initializer with the application as its argument", async () => {
    const seen: unknown[] = [];
    class RecordAppTrailtie extends BaseTrailtie {}
    BaseTrailtie.register(RecordAppTrailtie);
    RecordAppTrailtie.initializer("framework.record_app", (app: unknown) => {
      seen.push(app);
    });

    class RailtieBridgeApp extends Application {}
    Application.register(RailtieBridgeApp);
    const app = RailtieBridgeApp.instance();
    await app.initialize();

    expect(seen).toEqual([app]);
  });

  it("runs the app's own initializers first when railtiesOrder is [:all, :main_app]", async () => {
    const ran: string[] = [];
    class RecordOrderTrailtie extends BaseTrailtie {}
    BaseTrailtie.register(RecordOrderTrailtie);
    RecordOrderTrailtie.initializer("framework.record_order", () => {
      ran.push("framework");
    });

    class OrderedBridgeApp extends Application {
      static {
        this.initializer("app.record_order", () => {
          ran.push("app");
        });
      }
    }
    Application.register(OrderedBridgeApp);
    const app = OrderedBridgeApp.instance();
    app.config.railtiesOrder = [":all", ":main_app"];
    await app.initialize();

    expect(ran).toEqual(["app", "framework"]);
  });

  it("runs the ActiveRecord railtie initializers on boot", async () => {
    expect(BaseTrailtie.subclasses()).toContain(ActiveRecordTrailtie);

    class ActiveRecordBootApp extends Application {}
    Application.register(ActiveRecordBootApp);
    const app = ActiveRecordBootApp.instance();
    await app.initialize();

    expect(app.deprecators.get("activeRecord")).toBeDefined();
  });

  it("two applications do not share deprecators", async () => {
    class FirstDeprecatorApp extends Application {}
    Application.register(FirstDeprecatorApp);
    const first = FirstDeprecatorApp.instance();
    await first.initialize();

    class SecondDeprecatorApp extends Application {}
    Application.register(SecondDeprecatorApp);
    const second = SecondDeprecatorApp.instance();

    expect(first.deprecators.get("activeRecord")).toBeDefined();
    expect(second.deprecators.get("activeRecord")).toBeUndefined();
  });

  it("calls config.loadDefaults from the generated application's static block without a cast", () => {
    class GeneratedApplication extends Application {
      static {
        this.config.loadDefaults("8.0");
      }
    }

    expect(GeneratedApplication.config.loadedConfigVersion).toBe("8.0");
  });
});

function makeBasicApp<T extends typeof Application>(klass: T): InstanceType<T> {
  const app = new klass() as InstanceType<T>;
  app.config.secretKeyBase = "b3c631c314c0bbca50c1b2843150fe33";
  return app;
}

describe("Application#env_config", () => {
  it("maps config.action_dispatch.debug_exception_log_level to its Logger constant (application.rb:325)", () => {
    class LogLevelApp extends Application {}
    const app = makeBasicApp(LogLevelApp);
    app.config.actionDispatch.debugExceptionLogLevel = ":error";

    expect(app.envConfig()["action_dispatch.debug_exception_log_level"]).toBe(Logger.ERROR);
  });

  it("raises NameError for a level Logger has no constant for, as const_get does", () => {
    class BadLogLevelApp extends Application {}
    const app = makeBasicApp(BadLogLevelApp);
    const saved = app.config.actionDispatch.debugExceptionLogLevel;
    (app.config.actionDispatch as { debugExceptionLogLevel: string }).debugExceptionLogLevel =
      ":loud";

    try {
      expect(() => app.envConfig()).toThrow(
        new NameError("uninitialized constant Logger::LOUD", "LOUD"),
      );
    } finally {
      app.config.actionDispatch.debugExceptionLogLevel = saved;
    }
  });

  it("seeds a request env with the action_dispatch cookie keys a signed jar reads, and the content_security_policy keys (application.rb:333-346)", () => {
    class CookieApp extends Application {}
    const app = makeBasicApp(CookieApp);
    const policy = app.config.contentSecurityPolicy((p) => p.defaultSrc(":self"));
    const env = MockRequest.envFor("/");

    const request = app.buildRequest(env);

    expect(env["action_dispatch.key_generator"]).toBe(app.keyGenerator());
    expect(env["action_dispatch.content_security_policy"]).toBe(policy);
    const jar = request.cookieJar();
    jar.signed.set("user_id", "42");
    expect(jar.signed.get("user_id")).toBe("42");
  });
});

describe("Application#requireEnvironmentBang", () => {
  function tmpRoot(): string {
    const root = File.join(Dir.tmpdir(), `trails-require-environment-${SecureRandom.hex(8)}`);
    FileUtils.mkdirP(File.join(root, "config"));
    return root;
  }

  it("imports config/environment.ts when the application has one", async () => {
    const root = tmpRoot();
    const flag = `__trailsRequireEnvironment${SecureRandom.hex(4)}`;
    File.write(File.join(root, "config/environment.ts"), `globalThis.${flag} = true;\n`);
    try {
      class EnvironmentApp extends Application {}
      Application.register(EnvironmentApp);
      const app = EnvironmentApp.instance();
      app.config.setRoot(root);

      await app.requireEnvironmentBang();

      expect((globalThis as Record<string, unknown>)[flag]).toBe(true);
    } finally {
      FileUtils.rmRf(root);
    }
  });

  it("requires nothing when config/environment.ts does not exist", async () => {
    const root = tmpRoot();
    try {
      class NoEnvironmentApp extends Application {}
      Application.register(NoEnvironmentApp);
      const app = NoEnvironmentApp.instance();
      app.config.setRoot(root);

      await expect(app.requireEnvironmentBang()).resolves.toBeUndefined();
      expect(app.initialized()).toBe(false);
    } finally {
      FileUtils.rmRf(root);
    }
  });
});

describe("Configuration#loadDefaults 6.1", () => {
  it("seats cookiesSameSiteProtection in the spelling rack's setCookieHeader accepts", () => {
    const c = new Configuration();
    c.set("actionDispatch", {});

    c.loadDefaults("6.1");

    const sameSite = (c.get("actionDispatch") as Record<string, unknown>).cookiesSameSiteProtection;
    expect(sameSite).toBe("lax");
    expect(Utils.setCookieHeader("k", { value: "v", sameSite })).toBe("k=v; samesite=lax");
  });
});
