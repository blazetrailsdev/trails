import { Pathname } from "@blazetrails/ruby-compat/pathname";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { TestCase } from "@blazetrails/activesupport/test-case";
import { Isolation } from "@blazetrails/activesupport/testing/isolation";
import { registerSpecType } from "@blazetrails/activesupport/testing/autorun";
import { include, rbObjClone } from "@blazetrails/ruby-compat/include";
import { Application } from "../../lib/application.js";
import { Configuration } from "../../lib/application/configuration.js";
import { Trails } from "../../lib/trails.js";
import type { Generation } from "../support/isolation/abstract-unit.js";
import "../support/isolation/abstract-unit.js";

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging, @typescript-eslint/no-empty-object-type
interface MultipleApplicationsTest extends Generation {}
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
class MultipleApplicationsTest extends TestCase {}
include(MultipleApplicationsTest, Isolation);
registerSpecType(/^MultipleApplicationsTest$/, MultipleApplicationsTest);

type Config = Configuration & Record<string, unknown>;

describe("MultipleApplicationsTest", { timeout: 120_000 }, () => {
  let t: MultipleApplicationsTest;
  let AppTemplate: typeof Application;

  beforeEach(async () => {
    t = new MultipleApplicationsTest("test");
    await t.buildApp({ initializers: true });
    await import(await t.appPath("config", "environment.ts"));
    (Trails.application!.config as Config).someSetting = "something_or_other";
    AppTemplate = Trails.application!.constructor as typeof Application;
  });

  afterEach(() => t.teardownApp());

  it("cloning an application makes a shallow copy of config", () => {
    const clone = rbObjClone(Trails.application!);

    expect(clone.config).toBe(Trails.application!.config);
    expect((clone.config as Config).someSetting).toBe(
      (Trails.application!.config as Config).someSetting,
    );
  });

  it("inheriting multiple times from application", () => {
    const newApplicationClass = class extends Application {};

    expect(newApplicationClass.instance()).not.toBe(Trails.application);
  });

  it("initialization of multiple copies of same application", () => {
    const application1 = new AppTemplate();
    const application2 = new AppTemplate();

    expect(application1).not.toBe(Trails.application);
    expect(application2).not.toBe(Trails.application);
  });

  it("initialization of application with previous config", () => {
    const application1 = AppTemplate.create({ config: Trails.application!.config });
    const application2 = AppTemplate.create();

    expect(application1.config).toBe(Trails.application!.config);
    expect(application2.config).not.toBe(Trails.application!.config);
  });

  it("initialization of application with previous railties", () => {
    const application1 = AppTemplate.create({ railties: Trails.application!.railties() });
    const application2 = AppTemplate.create();

    expect(application1.railties()).toBe(Trails.application!.railties());
    expect(application2.railties()).not.toBe(Trails.application!.railties());
  });

  it("initialize new application with all previous initialization variables", async () => {
    const app = Trails.application!;
    const application1 = AppTemplate.create({
      config: app.config,
      railties: app.railties(),
      routesReloader: app.routesReloader(),
      reloaders: app.reloaders,
      routes: app.routes(),
      helpers: await app.helpers(),
      appEnvConfig: app.envConfig(),
    });

    expect(application1.config).toBe(app.config);
    expect(application1.railties()).toBe(app.railties());
    expect(application1.routesReloader()).toBe(app.routesReloader());
    expect(application1.reloaders).toBe(app.reloaders);
    expect(application1.routes()).toBe(app.routes());
    expect(await application1.helpers()).toBe(await app.helpers());
    expect(application1.envConfig()).toBe(app.envConfig());
  });

  it("rake tasks defined on different applications go to the same class", async () => {
    let runCount = 0;

    const application1 = new AppTemplate();
    application1.rakeTasks(() => {
      runCount += 1;
    });

    const application2 = new AppTemplate();
    application2.rakeTasks(() => {
      runCount += 1;
    });

    expect(runCount).toBe(0);
    await Trails.application!.loadTasks();
    expect(runCount).toBe(2);
  });

  it("multiple applications can be initialized", () => {
    expect(() => new AppTemplate()).not.toThrow();
  });

  it("consoles run on different applications go to the same class", async () => {
    let runCount = 0;
    AppTemplate.console(() => {
      runCount += 1;
    });
    new AppTemplate().console(() => {
      runCount += 1;
    });

    expect(runCount).toBe(0);
    await Trails.application!.loadConsole();
    expect(runCount).toBe(2);
  });

  it("generators run on different applications go to the same class", async () => {
    let runCount = 0;
    AppTemplate.generators(() => {
      runCount += 1;
    });
    new AppTemplate().generators(() => {
      runCount += 1;
    });

    expect(runCount).toBe(0);
    await Trails.application!.loadGenerators();
    expect(runCount).toBe(2);
  });

  it("runners run on different applications go to the same class", () => {
    let runCount = 0;
    AppTemplate.runner(() => {
      runCount += 1;
    });
    new AppTemplate().runner(() => {
      runCount += 1;
    });

    expect(runCount).toBe(0);
    Trails.application!.loadRunner();
    expect(runCount).toBe(2);
  });

  it("inserting configuration into application", () => {
    const app = new AppTemplate({ config: Trails.application!.config });
    (app.config as Config).someSetting = "a_different_setting";
    expect((app.config as Config).someSetting).toBe("a_different_setting");

    const newConfig = new Configuration(new Pathname("root_of_application")) as Config;
    newConfig.someSetting = "some_setting_dude";
    app.config = newConfig;

    expect((app.config as Config).someSetting).toBe("some_setting_dude");
    expect(String(app.config.root)).toBe("root_of_application");
    expect(app.config).toBe(newConfig);
  });
});
