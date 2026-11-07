import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ActionController, Response, URL } from "@blazetrails/actionpack";
import { Base } from "@blazetrails/activerecord";
import { Base as ActionMailerBase } from "@blazetrails/actionmailer";
import { TestCase } from "@blazetrails/activesupport/test-case";
import { Isolation } from "@blazetrails/activesupport/testing/isolation";
import { registerSpecType } from "@blazetrails/activesupport/testing/autorun";
import { File, FileUtils, include } from "@blazetrails/ruby-compat";
import { EnvHelpers } from "../../test-helpers/env-helpers.js";
import type { Generation, Rack } from "../../test-helpers/isolation/abstract-unit.js";
import "../../test-helpers/isolation/abstract-unit.js";

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

  it(
    "URL builder is configured to use HTTPS when force_ssl is on",
    { timeout: 120_000 },
    async () => {
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
    },
  );

  it("active_record extensions are applied to ActiveRecord", async () => {
    await t.addToConfig(`this.config.activeRecord.tableNamePrefix = "tbl_";`);
    await (t as unknown as Rack).app("development");
    expect(Base.tableNamePrefix).toBe("tbl_");
  });

  it("can boot with an unhealthy database", async () => {
    await t.trails("generate", "model", "post", "title:string");

    await t.withUnhealthyDatabase(() => (t as unknown as Rack).app("development"));
  });

  it(
    "connections checked out during initialization are returned to the pool",
    { timeout: 120_000 },
    async () => {
      await t.appFile(
        "config/initializers/active-record.ts",
        `
        import { Base } from "@blazetrails/activerecord";
        await Base.leaseConnection();
`,
      );
      await (t as unknown as Rack).app("development");
      expect(Base.connectionPool().isActiveConnection()).toBeFalsy();
    },
  );
  it.skip("includes URL helpers as action methods", () => {
    // BLOCKED: trailties-port-application-initializers-frameworks-tests-remaining
  });

  it.skip("allows to not load all helpers for controllers", () => {
    // BLOCKED: trailties-port-application-initializers-frameworks-tests-remaining
  });

  it.skip("action_controller api executes using all the middleware stack", () => {
    // BLOCKED: trailties-port-application-initializers-frameworks-tests-remaining
  });

  it.skip("if there's no config.active_support.bare, all of ActiveSupport is required", () => {
    // BLOCKED: trailties-port-application-initializers-frameworks-tests-remaining
  });

  it.skip("config.active_support.bare does not require all of ActiveSupport", () => {
    // BLOCKED: trailties-port-application-initializers-frameworks-tests-remaining
  });

  it.skip("database middleware doesn't initialize when activerecord is not in frameworks", () => {
    // BLOCKED: trailties-port-application-initializers-frameworks-tests-remaining
  });

  it.skip("use schema cache dump", () => {
    // BLOCKED: trailties-port-application-initializers-frameworks-tests-remaining
  });

  it.skip("expire schema cache dump", () => {
    // BLOCKED: trailties-port-application-initializers-frameworks-tests-remaining
  });

  it.skip("expire schema cache dump if the version can't be checked because the database is unhealthy", () => {
    // BLOCKED: trailties-port-application-initializers-frameworks-tests-remaining
  });

  it.skip("does not expire schema cache dump if check_schema_cache_dump_version is false", () => {
    // BLOCKED: trailties-port-application-initializers-frameworks-tests-remaining
  });

  it.skip("does not expire schema cache dump if check_schema_cache_dump_version is false and the database unhealthy", () => {
    // BLOCKED: trailties-port-application-initializers-frameworks-tests-remaining
  });

  it.skip("define attribute methods when schema cache is present and check_schema_cache_dump_version is false", () => {
    // BLOCKED: trailties-port-application-initializers-frameworks-tests-remaining
  });

  it.skip("active record establish_connection uses Trails.env if DATABASE_URL is not set", () => {
    // BLOCKED: trailties-port-application-initializers-frameworks-tests-remaining
  });

  it.skip("active record establish_connection uses DATABASE_URL even if Trails.env is set", () => {
    // BLOCKED: trailties-port-application-initializers-frameworks-tests-remaining
  });

  it.skip("Current scopes in AR models are reset on reloading", () => {
    // BLOCKED: trailties-port-application-initializers-frameworks-tests-remaining
  });

  it.skip("filters for Active Record encrypted attributes are added to config.filter_parameters only once", () => {
    // BLOCKED: trailties-port-application-initializers-frameworks-tests-remaining
  });

  it.skip("ActiveRecord::MessagePack extensions are installed when using ActiveSupport::MessagePack::CacheSerializer", () => {
    // BLOCKED: trailties-port-application-initializers-frameworks-tests-remaining
  });
});
