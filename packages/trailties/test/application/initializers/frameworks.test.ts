import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ActionController, Response, URL } from "@blazetrails/actionpack";
import { Base, ConnectionNotEstablished, ScopeRegistry } from "@blazetrails/activerecord";
import { Base as ActionMailerBase } from "@blazetrails/actionmailer";
import { Dependencies } from "@blazetrails/activesupport";
import { TestCase } from "@blazetrails/activesupport/test-case";
import { Isolation } from "@blazetrails/activesupport/testing/isolation";
import { registerSpecType } from "@blazetrails/activesupport/testing/autorun";
import {
  Dir,
  File,
  FileUtils,
  env as ENV,
  extend,
  include,
  rbEqual,
  rbObjRespondTo,
  setEnv,
  TopLevel,
} from "@blazetrails/ruby-compat";
import { Methods } from "@blazetrails/rack-test";
import { Trails } from "../../../lib/trails.js";
import { EnvHelpers } from "../../support/env-helpers.js";
import type { Generation, Rack } from "../../support/isolation/abstract-unit.js";
import "../../support/isolation/abstract-unit.js";

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging, @typescript-eslint/no-empty-object-type
interface FrameworksTest extends Generation {}
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
class FrameworksTest extends TestCase {}
include(FrameworksTest, Isolation);
registerSpecType(/^FrameworksTest$/, FrameworksTest);
include(FrameworksTest, EnvHelpers);

describe("FrameworksTest", { timeout: 120_000 }, () => {
  let t: FrameworksTest;

  beforeEach(async () => {
    t = new FrameworksTest("test");
    await t.buildApp();
    await FileUtils.rmRfAsync(`${await t.appPath()}/config/environments`);
  });

  afterEach(() => t.teardownApp());

  it("set load paths set only if action controller or action mailer are in use", async () => {
    await expect(
      (async () => {
        await t.addToConfig(`
          this.config.setRoot("${await t.appPath()}");
`);

        await t.useFrameworks([]);
        await (t as unknown as Rack).app("development");
      })(),
    ).resolves.not.toThrow();
  });

  it("sets action_controller and action_mailer load paths", async () => {
    await t.addToConfig(`
        this.config.setRoot("${await t.appPath()}");
`);

    await (t as unknown as Rack).app("development");

    const expandedPath = File.expandPath("app/views", await t.appPath());
    expect(String(ActionController.Base.viewPaths().at(0))).toBe(expandedPath);
    expect(String(ActionMailerBase.viewPaths().at(0))).toBe(expandedPath);
  });

  it("allows me to configure default URL options for ActionMailer", async () => {
    await t.appFile(
      "config/environments/development.ts",
      `
        import { Trails } from "@blazetrails/trailties";
        Trails.application.configure(function () {
          this.config.actionMailer.defaultUrlOptions = { host: "test.rails" };
        });
`,
    );

    await (t as unknown as Rack).app("development");
    expect(
      (ActionMailerBase as unknown as { defaultUrlOptions: { host: string } }).defaultUrlOptions
        .host,
    ).toBe("test.rails");
  });

  it("action_dispatch extensions are applied to ActionDispatch", async () => {
    await t.addToConfig("this.config.actionDispatch.tldLength = 2;");
    await (t as unknown as Rack).app("development");
    expect(URL.tldLength).toBe(2);
  });

  it("assignment config.encoding to default_charset", async () => {
    const charset = "Shift_JIS";
    await t.addToConfig(`this.config.encoding = "${charset}";`);
    await (t as unknown as Rack).app("development");
    expect(Response.defaultCharset).toBe(charset);
  });

  it("URL builder is configured to use HTTPS when force_ssl is on", async () => {
    await t.appFile(
      "config/environments/development.ts",
      `
        import { Trails } from "@blazetrails/trailties";
        Trails.application.configure(function () {
          this.config.forceSsl = true;
        });
`,
    );

    await (t as unknown as Rack).app("development");
    expect(URL.secureProtocol).toBe(true);
  });

  it("active_record extensions are applied to ActiveRecord", async () => {
    await t.addToConfig(`this.config.activeRecord.tableNamePrefix = "tbl_";`);
    await (t as unknown as Rack).app("development");
    expect(Base.tableNamePrefix).toBe("tbl_");
  });

  it("can boot with an unhealthy database", async () => {
    await t.trails("generate", "model", "post", "title:string");

    await t.withUnhealthyDatabase(() => (t as unknown as Rack).app("development"));
  });

  it("connections checked out during initialization are returned to the pool", async () => {
    await t.appFile(
      "config/initializers/active-record.ts",
      `
        import { Base } from "@blazetrails/activerecord";
        await Base.leaseConnection();
`,
    );
    await (t as unknown as Rack).app("development");
    expect(Base.connectionPool().isActiveConnection()).toBeFalsy();
  });

  it("includes URL helpers as action methods", async () => {
    await t.appFile(
      "config/routes.ts",
      `
        import { Trails } from "@blazetrails/trailties";
        Trails.application.routes().draw(function () {
          this.get("/foo", { to: (env) => [200, {}, []], as: "foo" });
        });
`,
    );

    await t.appFile(
      "app/mailers/foo.ts",
      `
        import { Base } from "@blazetrails/actionmailer";
        export class Foo extends Base {
          notify() {}
        }
`,
    );

    await (t as unknown as Rack).app("development");
    const Foo = (TopLevel as unknown as Record<string, unknown>).Foo as new () => object;
    expect(rbObjRespondTo(new Foo(), "fooUrl")).toBeTruthy();
    expect(rbObjRespondTo(new Foo(), "mainApp")).toBeTruthy();
  });

  it("allows to not load all helpers for controllers", async () => {
    await t.addToConfig("this.config.actionController.includeAllHelpers = false;");

    await t.appFile(
      "app/controllers/application-controller.ts",
      `
        import { ActionController } from "@blazetrails/actionpack";
        export class ApplicationController extends ActionController.Base {}
`,
    );

    await t.appFile(
      "app/controllers/foo-controller.ts",
      `
        import { ApplicationController } from "./application-controller.ts";
        export class FooController extends ApplicationController {
          async includedHelpers() {
            await this.render({ inline: "<%= fromAppHelper() -%> <%= fromFooHelper() %>" });
          }

          async notIncludedHelper() {
            await this.render({ inline: "<%= typeof this.fromBarHelper === 'function' -%>" });
          }
        }
`,
    );

    await t.appFile(
      "app/helpers/application-helper.ts",
      `
        export const ApplicationHelper = {
          fromAppHelper() {
            return "from_app_helper";
          },
        };
`,
    );

    await t.appFile(
      "app/helpers/foo-helper.ts",
      `
        export const FooHelper = {
          fromFooHelper() {
            return "from_foo_helper";
          },
        };
`,
    );

    await t.appFile(
      "app/helpers/bar-helper.ts",
      `
        export const BarHelper = {
          fromBarHelper() {
            return "from_bar_helper";
          },
        };
`,
    );

    await t.appFile(
      "config/routes.ts",
      `
        import { Trails } from "@blazetrails/trailties";
        Trails.application.routes().draw(function () {
          this.get("/:controller(/:action)");
        });
`,
    );

    extend(t, Methods);
    await (t as unknown as Rack).app();
    const rack = t as unknown as Omit<Rack, "get"> & {
      get(path: string): Promise<unknown>;
      lastResponse(): { body: string };
    };
    await rack.get("/foo/includedHelpers");
    expect(rack.lastResponse().body).toBe("from_app_helper from_foo_helper");

    await rack.get("/foo/notIncludedHelper");
    expect(rack.lastResponse().body).toBe("false");
  });

  it("action_controller api executes using all the middleware stack", async () => {
    await t.addToConfig("this.config.apiOnly = true;");

    await t.appFile(
      "app/controllers/application-controller.ts",
      `
        import { ActionController } from "@blazetrails/actionpack";
        export class ApplicationController extends ActionController.API {}
`,
    );

    await t.appFile(
      "app/controllers/omg-controller.ts",
      `
        import { ApplicationController } from "./application-controller.ts";
        export class OmgController extends ApplicationController {
          show() {
            this.render({ json: { omg: "omg" } });
          }
        }
`,
    );

    await t.appFile(
      "config/routes.ts",
      `
        import { Trails } from "@blazetrails/trailties";
        Trails.application.routes().draw(function () {
          this.get("/:controller(/:action)");
        });
`,
    );

    extend(t, Methods);
    await (t as unknown as Rack).app();

    const rt = t as unknown as {
      get(path: string): Promise<unknown>;
      lastResponse(): { body: string };
    };
    await rt.get("omg/show");
    expect(rt.lastResponse().body).toBe('{"omg":"omg"}');
  });

  it.skip("if there's no config.active_support.bare, all of ActiveSupport is required", () => {
    // BLOCKED: frameworks-test-use-frameworks-and-active-support-bare
  });

  it.skip("config.active_support.bare does not require all of ActiveSupport", () => {
    // BLOCKED: frameworks-test-use-frameworks-and-active-support-bare
  });

  it.skip("database middleware doesn't initialize when activerecord is not in frameworks", () => {
    // BLOCKED: frameworks-test-use-frameworks-and-active-support-bare
  });

  it("use schema cache dump", async () => {
    try {
      await t.trails("generate", "model", "post", "title:string");
      await t.trails("db:migrate", "db:schema:cache:dump");

      await t.addToConfig(`
          this.config.eagerLoad = true;
`);

      await Dir.chdir(await t.appPath(), async () => {
        await (t as unknown as Rack).app("development");

        expect(await Base.schemaCache().dataSources("posts")).toBeTruthy();
      });
    } finally {
      await (await Base.leaseConnection()).dropTable("posts", { ifExists: true });
    }
  });

  it("expire schema cache dump", async () => {
    await t.trails("generate", "model", "post", "title:string");
    await t.trails("db:migrate", "db:schema:cache:dump", "db:rollback");

    await t.addToConfig(`
        this.config.eagerLoad = true;
`);

    await Dir.chdir(await t.appPath(), async () => {
      const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
      await (t as unknown as Rack).app("development");

      try {
        expect(await Base.schemaCache().dataSources("posts")).toBeFalsy();
        expect(warn.mock.calls.flat().join("\n")).toMatch(
          /Ignoring db\/schema_cache\.yml because it has expired/,
        );
      } finally {
        warn.mockRestore();
      }
    });
  });

  it("expire schema cache dump if the version can't be checked because the database is unhealthy", async () => {
    await t.trails("generate", "model", "post", "title:string");
    await t.trails("db:migrate", "db:schema:cache:dump");

    await t.addToConfig(`
        this.config.eagerLoad = true;
`);

    await t.withUnhealthyDatabase(async () =>
      Dir.chdir(await t.appPath(), async () => {
        const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
        try {
          await (t as unknown as Rack).app("development");

          await expect(
            (async () => (await Base.leaseConnection()).execute("SELECT 1"))(),
          ).rejects.toThrow(ConnectionNotEstablished);

          await expect(Base.schemaCache().columns("posts")).rejects.toThrow(
            ConnectionNotEstablished,
          );
          expect(warn.mock.calls.flat().join("\n")).toMatch(
            /Failed to validate the schema cache because of ActiveRecord::(ConnectionNotEstablished|DatabaseConnectionError)/,
          );
        } finally {
          warn.mockRestore();
        }
      }),
    );
  });

  it("does not expire schema cache dump if check_schema_cache_dump_version is false", async () => {
    await t.trails("generate", "model", "post", "title:string");
    await t.trails("db:migrate", "db:schema:cache:dump", "db:rollback");

    await t.addToConfig(`
        this.config.eagerLoad = true;
        this.config.activeRecord.checkSchemaCacheDumpVersion = false;
`);

    await Dir.chdir(await t.appPath(), async () => {
      await (t as unknown as Rack).app("development");

      expect(
        await Base.connectionPool().schemaReflection.dataSources(null as never, "posts"),
      ).toBeTruthy();
    });
  });

  it("does not expire schema cache dump if check_schema_cache_dump_version is false and the database unhealthy", async () => {
    await t.trails("generate", "model", "post", "title:string");
    await t.trails("db:migrate", "db:schema:cache:dump", "db:rollback");

    await t.addToConfig(`
        this.config.eagerLoad = true;
        this.config.activeRecord.checkSchemaCacheDumpVersion = false;
`);

    await t.withUnhealthyDatabase(async () =>
      Dir.chdir(await t.appPath(), async () => {
        await (t as unknown as Rack).app("development");

        expect(
          await Base.connectionPool().schemaReflection.dataSources(null as never, "posts"),
        ).toBeTruthy();
        await expect(
          (async () => (await Base.leaseConnection()).execute("SELECT 1"))(),
        ).rejects.toThrow(ConnectionNotEstablished);
      }),
    );
  });

  // BLOCKED: port-active-record-define-attribute-methods-initializer
  it.skip("define attribute methods when schema cache is present and check_schema_cache_dump_version is false", async () => {
    await t.trails("generate", "model", "post", "title:string");
    await t.trails("db:migrate", "db:schema:cache:dump");

    await t.addToConfig(`
        this.config.eagerLoad = true;
        this.config.activeRecord.checkSchemaCacheDumpVersion = false;
`);

    await Dir.chdir(await t.appPath(), async () => {
      await (t as unknown as Rack).app();

      const Post = (
        TopLevel as unknown as Record<string, { isAttributeMethodsGenerated(): boolean }>
      ).Post;
      expect(Post.isAttributeMethodsGenerated()).toBe(true);
    });
  });

  it("active record establish_connection uses Trails.env if DATABASE_URL is not set", async () => {
    await (t as unknown as Rack).app("development");
    const origDatabaseUrl = ENV["DATABASE_URL"];
    setEnv("DATABASE_URL", undefined);
    const origTrailsEnv = Trails.env;
    Trails.env = "development";
    try {
      await Base.establishConnection();
      expect(await Base.leaseConnection()).toBeTruthy();
      expect(Base.connectionDbConfig().database).toMatch(
        new RegExp(
          Base.configurations().configsFor({ envName: String(Trails.env), name: "primary" })!
            .database!,
        ),
      );
      const dbConfig = Base.configurations().configsFor({
        envName: String(Trails.env),
        name: "primary",
      })!;
      expect(Base.connectionDbConfig().database).toMatch(new RegExp(dbConfig.database!));
    } finally {
      await Base.removeConnection();
      if (origDatabaseUrl != null) setEnv("DATABASE_URL", origDatabaseUrl);
      if (origTrailsEnv != null) Trails.env = origTrailsEnv;
    }
  });

  it.skip("active record establish_connection uses DATABASE_URL even if Trails.env is set", () => {
    // BLOCKED: establish-connection-reads-database-url-set-after-boot
  });

  it("Current scopes in AR models are reset on reloading", async () => {
    await t.trails("generate", "model", "post");
    await t.trails("db:migrate");

    await t.appFile("app/models/a.ts", "export const A = 1;");
    await t.appFile("app/models/m.ts", "export const M = {};");
    await t.appFile(
      "app/models/post.ts",
      `
        import { Base } from "@blazetrails/activerecord";
        export class Post extends Base {
          static [Symbol.hasInstance](_) {
            return false;
          }
        }
`,
    );

    await (t as unknown as Rack).app("development");

    expect((TopLevel as unknown as Record<string, unknown>).A).toBeTruthy();
    expect((TopLevel as unknown as Record<string, unknown>).M).toBeTruthy();
    const Post = (TopLevel as unknown as Record<string, unknown>).Post as typeof Base;
    Post.setCurrentScope(Post as never);
    expect(ScopeRegistry.currentScope(Post)).not.toBeNull();

    await Dependencies.clear();

    expect(ScopeRegistry.currentScope(Post)).toBeNull();
  });

  it.skip("filters for Active Record encrypted attributes are added to config.filter_parameters only once", () => {
    // BLOCKED: reload-autoloads-constant-on-first-reference
  });

  // BLOCKED: activerecord-port-message-pack-module
  it.skip("ActiveRecord::MessagePack extensions are installed when using ActiveSupport::MessagePack::CacheSerializer", async () => {
    await t.trails("generate", "model", "post", "title:string");
    await t.trails("db:migrate");

    await t.addToConfig(`
        this.config.cacheStore = [":file_store", ${JSON.stringify(await t.appPath("tmp/cache"))}, { serializer: ":message_pack" }];
`);

    await (t as unknown as Rack).app("development");

    const Post = (TopLevel as unknown as Record<string, typeof Base>).Post;
    const post = await Post.createBang({ title: "Hello World" });
    await TopLevel.Trails!.cache!.write("hello", post);
    expect(rbEqual(post, await TopLevel.Trails!.cache!.read("hello"))).toBe(true);
  });
});
