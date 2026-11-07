import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Response, URL } from "@blazetrails/actionpack";
import { Base } from "@blazetrails/activerecord";
import { TestCase } from "@blazetrails/activesupport/test-case";
import { Isolation } from "@blazetrails/activesupport/testing/isolation";
import { registerSpecType } from "@blazetrails/activesupport/testing/autorun";
import { FileUtils, include } from "@blazetrails/ruby-compat";
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

describe("FrameworksTest", () => {
  let t: FrameworksTest;

  beforeEach(async () => {
    t = new FrameworksTest("test");
    await t.buildApp();
    await FileUtils.rmRfAsync(`${await t.appPath()}/config/environments`);
  });

  afterEach(() => t.teardownApp());

  it("action_dispatch extensions are applied to ActionDispatch", { timeout: 120_000 }, async () => {
    await t.addToConfig("this.config.actionDispatch.tldLength = 2;");
    await (t as unknown as Rack).app("development");
    expect(URL.tldLength).toBe(2);
  });

  it("assignment config.encoding to default_charset", { timeout: 120_000 }, async () => {
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

  it("active_record extensions are applied to ActiveRecord", { timeout: 120_000 }, async () => {
    await t.addToConfig(`this.config.activeRecord.tableNamePrefix = "tbl_";`);
    await (t as unknown as Rack).app("development");
    expect(Base.tableNamePrefix).toBe("tbl_");
  });

  it("can boot with an unhealthy database", { timeout: 120_000 }, async () => {
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
});
