import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  onTestFinished,
} from "vitest";
import { constSet, rbModRemoveConst } from "@blazetrails/ruby-compat";
import { ActionDispatch, Session } from "@blazetrails/actionpack";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  Deprecators,
  MessageVerifiers,
  OrderedOptions,
  ParameterFilter,
  runLoadHooks,
} from "@blazetrails/activesupport";
import {
  assertNothingRaised,
  assertRaises,
  assertNil,
  assertNotNil,
} from "@blazetrails/activesupport/testing/assertions";
import { Base, Resolver, SanitizeHelper } from "@blazetrails/actionview";
import { HTML, HTML4 } from "@blazetrails/html-sanitizer";
import * as Nokogiri from "@blazetrails/nokogiri";
import { Trailtie as ActionViewTrailtie } from "../../lib/trailties/action-view.js";
import "@blazetrails/actioncable/engine";
import { Engine as ActionMailboxEngine } from "@blazetrails/actionmailbox/engine";
import { ActionMailbox } from "@blazetrails/actionmailbox";
import { ActionCable } from "@blazetrails/actioncable";
import type { Base as CableServer } from "@blazetrails/actioncable/server/base";
import { days, Logger } from "@blazetrails/activesupport";
import {
  ArgumentError,
  constGet,
  NameError,
  TopLevel,
  env,
  getFs,
  Pathname,
  RuntimeError,
  setEnv,
} from "@blazetrails/ruby-compat";
import * as FormTagHelper from "@blazetrails/actionview/helpers/form-tag-helper";
import * as UrlHelper from "@blazetrails/actionview/helpers/url-helper";
import * as AssetTagHelper from "@blazetrails/actionview/helpers/asset-tag-helper";
import "@blazetrails/activestorage/engine";
import { ActiveStorage } from "@blazetrails/activestorage";
import { Base as ActiveJobBase } from "@blazetrails/activejob";
import { Base as ActionMailerBase } from "@blazetrails/actionmailer";
import { Base as ActiveRecordBase, SchemaReflection } from "@blazetrails/activerecord";
import { DestroyAssociationAsyncJob } from "@blazetrails/activerecord/destroy-association-async-job";
import { CacheRequest } from "@blazetrails/actionpack";
import {
  ActiveSupport,
  setUtcToLocalReturnsUtcOffsetTimes,
  utcToLocalReturnsUtcOffsetTimes,
} from "@blazetrails/activesupport";
import { Trailtie as ActionMailerTrailtie } from "../../lib/trailties/action-mailer.js";
import { Trailtie as ActiveRecordTrailtie } from "../../lib/trailties/active-record.js";
import { Trailtie as ActiveJobTrailtie } from "../../lib/trailties/active-job.js";
import { Trailtie as ActionDispatchTrailtie } from "../../lib/trailties/action-dispatch.js";
import { Application } from "../../lib/application.js";
import { LOAD_DEFAULTS_VERSION } from "../../lib/application/configuration.js";
import { Trails, _resetTrailsEnv } from "../../lib/trails.js";
import { EnvHelpers } from "../support/env-helpers.js";
import { useInMemoryDatabaseUrl } from "../support/in-memory-database-url.js";

const envHelpers = new EnvHelpers();

let appPath: string;

async function setCustomConfig(contents: string): Promise<void> {
  await writeFile(join(appPath, "config", "custom.ts"), contents);
}

async function app(trailsEnv: string): Promise<Application> {
  setEnv("TRAILS_ENV", trailsEnv);
  _resetTrailsEnv();
  class A extends Application {}
  Application.register(A, appPath);
  const application = A.instance();
  Trails.application = application;
  await application.root();
  return application;
}

describe("ConfigurationTest", () => {
  useInMemoryDatabaseUrl();
  const trailsEnv = env.TRAILS_ENV;
  const sanitizerVendor = SanitizeHelper.sanitizerVendor;
  const actionMailbox = { ...ActionMailboxEngine.config.actionMailbox };
  const actionView = { ...ActionViewTrailtie.config.actionView };
  const smtpSettings = ActionMailerBase.smtpSettings;
  const actionDispatch = { ...ActionDispatchTrailtie.config.actionDispatch };
  const activeRecord = { ...ActiveRecordTrailtie.config.activeRecord };
  const { checkSchemaCacheDumpVersion, useSchemaCacheDump } = SchemaReflection;
  const activeJob = (ActiveJobTrailtie.config.activeJob as unknown as OrderedOptions).toH();
  const actionMailer = (
    ActionMailerTrailtie.config.actionMailer as unknown as OrderedOptions
  ).toH();
  let trailsApplication: Application | null;

  beforeAll(() => {
    trailsApplication = Trails.application;
  });

  afterAll(() => {
    Trails.application = trailsApplication;
  });

  beforeEach(async () => {
    appPath = await mkdtemp(join(tmpdir(), "trails-config-for-"));
    await mkdir(join(appPath, "config"));
    await writeFile(join(appPath, "config", "storage.ts"), "export default {};\n");
    await writeFile(join(appPath, "config.ts"), "");
  });

  afterEach(async () => {
    Resolver.caching = true;
    SanitizeHelper.sanitizerVendor = sanitizerVendor;
    Application.appClass = null;
    delete ActionViewTrailtie.config.actionView.cacheTemplateLoading;
    Object.assign(ActionMailboxEngine.config.actionMailbox, actionMailbox);
    ActionMailboxEngine.config.actionMailbox.queues!.set(
      "incineration",
      "action_mailbox_incineration",
    );
    ActionMailboxEngine.config.actionMailbox.queues!.set("routing", "action_mailbox_routing");
    FormTagHelper.setDefaultEnforceUtf8(true);
    UrlHelper.setButtonToGeneratesButtonTag(false);
    Object.assign(ActionViewTrailtie.config.actionView, actionView);
    ActiveJobBase.retryJitter = 0.0;
    Object.assign(ActionDispatchTrailtie.config.actionDispatch, actionDispatch);
    Object.assign(ActiveRecordTrailtie.config.activeRecord, activeRecord);
    Object.assign(SchemaReflection, { checkSchemaCacheDumpVersion, useSchemaCacheDump });
    for (const [config, snapshot] of [
      [ActiveJobTrailtie.config.activeJob, activeJob],
      [ActionMailerTrailtie.config.actionMailer, actionMailer],
    ] as const) {
      (config as unknown as OrderedOptions).clear().update(snapshot);
    }
    setUtcToLocalReturnsUtcOffsetTimes(false);
    ActionMailerBase.smtpSettings = smtpSettings;
    setEnv("TRAILS_ENV", trailsEnv);
    _resetTrailsEnv();
    await rm(appPath, { recursive: true, force: true });
  });

  it("Rails.env does not set the RAILS_ENV environment variable which would leak out into rake tasks", async () => {
    await envHelpers.switchEnv("TRAILS_ENV", undefined, async () => {
      Trails.env = "development";
      expect(Trails.env.toString()).toBe("development");
      assertNil(env.TRAILS_ENV);
    });
  });

  it("Rails.groups returns available groups", async () => {
    Trails.env = "development";
    expect(Trails.groups()).toEqual(["default", "development"]);
    expect(Trails.groups({ assets: ["development"] })).toEqual([
      "default",
      "development",
      "assets",
    ]);
    expect(Trails.groups("another", { assets: ["development"] })).toEqual([
      "default",
      "development",
      "another",
      "assets",
    ]);

    Trails.env = "test";
    expect(Trails.groups({ assets: ["development"] })).toEqual(["default", "test"]);

    await envHelpers.switchEnv("TRAILS_GROUPS", "javascripts,stylesheets", async () => {
      expect(Trails.groups()).toEqual(["default", "test", "javascripts", "stylesheets"]);
    });
  });

  it("Rails.application is nil until app is initialized", async () => {
    Trails.application = null;
    assertNil(Trails.application);
    const application = await app("development");
    expect(Trails.application).toBe((application.constructor as typeof Application).instance());
  });

  it("Rails.application responds to all instance methods", async () => {
    const application = await app("development");
    const AppTemplate = application.constructor as unknown as { routesReloader(): unknown };
    expect(Trails.application!.routesReloader()).toBe(AppTemplate.routesReloader());
    expect(Trails.application!.messageVerifiers()).toBeInstanceOf(MessageVerifiers);
    expect(Trails.application!.deprecators).toBeInstanceOf(Deprecators);
  });

  it("Rails::Application responds to paths", async () => {
    const application = await app("development");
    const AppTemplate = application.constructor as unknown as Pick<Application, "paths">;
    expect(AppTemplate.paths().get("app/views")!.expanded()).toEqual([join(appPath, "app/views")]);
  });

  it("the application root is set correctly", async () => {
    await app("development");
    expect(Trails.application!.root()).toBe(appPath);
  });

  it("the application root can be seen from the application singleton", async () => {
    const application = await app("development");
    const AppTemplate = application.constructor as unknown as Pick<Application, "root">;
    expect(AppTemplate.root()).toBe(appPath);
  });

  it("filter_parameters should be able to set via config.filter_parameters", async () => {
    await assertNothingRaised(async () => {
      const application = await app("development");
      application.config.filterParameters.push("foo", "bar", (key: string, value: unknown) =>
        /baz/.test(key) ? String(value).split("").reverse().join("") : value,
      );
      await application.initializeBang();
    });
  });

  it("filter_parameters should be able to set via config.filter_parameters in an initializer", async () => {
    const application = await app("development");
    Trails.application!.config.filterParameters.push("password", "foo", "bar");
    await application.initializeBang();

    expect(Trails.application!.envConfig()["action_dispatch.parameter_filter"]).toEqual([
      "password",
      "foo",
      "bar",
    ]);
  });

  it("filter_parameters is precompiled when config.precompile_filter_parameters is true", async () => {
    const filters = [/foo/, "bar", "baz.qux"];

    const application = await app("development");
    application.config.filterParameters.push(...filters);
    application.config.precompileFilterParameters = true;
    await application.initializeBang();

    expect(Trails.application!.envConfig()["action_dispatch.parameter_filter"]).toEqual(
      ParameterFilter.precompileFilters(filters),
    );
  });

  it("filter_parameters is not precompiled when config.precompile_filter_parameters is false", async () => {
    const filters = [/foo/, "bar", "baz.qux"];

    const application = await app("development");
    application.config.filterParameters.push(...filters);
    application.config.precompileFilterParameters = false;
    await application.initializeBang();

    expect(Trails.application!.envConfig()["action_dispatch.parameter_filter"]).toEqual(filters);
  });

  it("filter_parameters reflects changes to config.filter_parameters after being precompiled", async () => {
    const application = await app("development");
    application.config.filterParameters.push(/foo/, "bar");
    application.config.precompileFilterParameters = true;
    await application.initializeBang();

    expect(Trails.application!.envConfig()["action_dispatch.parameter_filter"]).not.toHaveLength(0);

    Trails.application!.config.filterParameters.push("baz.qux");

    expect(Trails.application!.envConfig()["action_dispatch.parameter_filter"]).toContain(
      "baz.qux",
    );
  });

  it("config.precompile_filter_parameters is true by default for new apps", async () => {
    const application = await app("development");
    application.config.loadDefaults(LOAD_DEFAULTS_VERSION);

    expect(Trails.application!.config.precompileFilterParameters).toBe(true);
  });

  it("config.precompile_filter_parameters is false by default for upgraded apps", async () => {
    const application = await app("development");
    application.config.loadDefaults("7.0");

    expect(Trails.application!.config.precompileFilterParameters).toBeFalsy();
  });

  it("application is always added to eager_load namespaces", async () => {
    const application = await app("development");
    expect(Trails.application!.config.eagerLoadNamespaces).toContain(application.constructor);
  });

  it("propagates check_schema_cache_dump_version=true to ActiveRecord::ConnectionAdapters::SchemaReflection", async () => {
    const application = await app("development");
    application.config.activeRecord.checkSchemaCacheDumpVersion = true;
    await application.initializeBang();

    expect(SchemaReflection.checkSchemaCacheDumpVersion).toBe(true);
  });

  it("propagates check_schema_cache_dump_version=false to ActiveRecord::ConnectionAdapters::SchemaReflection", async () => {
    const application = await app("development");
    application.config.activeRecord.checkSchemaCacheDumpVersion = false;
    await application.initializeBang();

    expect(SchemaReflection.checkSchemaCacheDumpVersion).toBe(false);
  });

  it("propagates use_schema_cache_dump=true to ActiveRecord::ConnectionAdapters::SchemaReflection", async () => {
    const application = await app("development");
    application.config.activeRecord.useSchemaCacheDump = true;
    await application.initializeBang();

    expect(SchemaReflection.useSchemaCacheDump).toBe(true);
  });

  it("propagates use_schema_cache_dump=false to ActiveRecord::ConnectionAdapters::SchemaReflection", async () => {
    const application = await app("development");
    application.config.activeRecord.useSchemaCacheDump = false;
    await application.initializeBang();

    expect(SchemaReflection.useSchemaCacheDump).toBe(false);
  });

  it("config.enable_reloading is !config.cache_classes", async () => {
    await app("development");

    const config = Trails.application!.config;

    expect(config.enableReloading).toBe(!config.cacheClasses);

    for (const enabled of [true, false]) {
      config.enableReloading = enabled;
      expect(config.enableReloading).toBe(enabled);
      expect(config.isReloadingEnabled()).toBe(enabled);
      expect(!config.cacheClasses).toBe(enabled);
    }

    for (const enabled of [true, false]) {
      config.cacheClasses = enabled;
      expect(!config.enableReloading).toBe(enabled);
      expect(!config.isReloadingEnabled()).toBe(enabled);
      expect(config.cacheClasses).toBe(enabled);
    }
  });

  it("config.session_store with custom custom stores search for it inside the ActionDispatch::Session namespace", async () => {
    try {
      await assertNothingRaised(async () => {
        const application = await app("development");
        constSet(ActionDispatch.Session, "MyCustomStore", class extends Session.CookieStore {});
        application.config.sessionStore(":my_custom_store");
        application.config.sessionStore();
      });
    } finally {
      rbModRemoveConst(ActionDispatch.Session, "MyCustomStore");
    }
  });

  it("config.session_store with unknown store raises helpful error", async () => {
    const application = await app("development");
    application.config.sessionStore(":unknown_store");
    const e = await assertRaises([RuntimeError], {}, () => application.config.sessionStore());

    expect(e.message).toMatch(/Unable to resolve session store :unknown_store/);
  });

  it("config.autoload_lib adds lib to the expected paths (array ignore)", async () => {
    await mkdir(join(appPath, "lib", "tasks"), { recursive: true });
    await writeFile(join(appPath, "lib", "x.ts"), "export const X = true;\n");
    await writeFile(join(appPath, "lib", "tasks", "x.ts"), "export const X = true;\n");
    await mkdir(join(appPath, "lib", "generators"), { recursive: true });
    await writeFile(join(appPath, "lib", "generators", "x.ts"), "export const X = true;\n");
    const application = await app("development");
    application.config.autoloadLib({ ignore: ["tasks", "generators"] });
    await application.initializeBang();
    onTestFinished(() => application.autoloaders.main.unload());

    const config = Trails.application!.config;
    expect(config.autoloadPaths).toContain(`${appPath}/lib`);
    expect(config.eagerLoadPaths).toContain(`${appPath}/lib`);

    expect(constGet(TopLevel, "X")).toBeTruthy();
    expect(() => constGet(TopLevel, "Tasks")).toThrow(NameError);
    expect(() => constGet(TopLevel, "Generators")).toThrow(NameError);
  });

  it("config.autoload_lib adds lib to the expected paths (empty array ignore)", async () => {
    await mkdir(join(appPath, "lib", "tasks"), { recursive: true });
    await writeFile(join(appPath, "lib", "x.ts"), "export const X = true;\n");
    await writeFile(join(appPath, "lib", "tasks", "x.ts"), "export const X = true;\n");

    const application = await app("development");
    application.config.autoloadLib({ ignore: [] });
    await application.initializeBang();
    onTestFinished(() => application.autoloaders.main.unload());

    const config = Trails.application!.config;
    expect(config.autoloadPaths).toContain(`${appPath}/lib`);
    expect(config.eagerLoadPaths).toContain(`${appPath}/lib`);

    expect(constGet(TopLevel, "X")).toBeTruthy();
    expect(constGet(TopLevel, "Tasks::X")).toBeTruthy();
  });

  it("config.autoload_lib adds lib to the expected paths (scalar ignore)", async () => {
    await mkdir(join(appPath, "lib", "tasks"), { recursive: true });
    await writeFile(join(appPath, "lib", "x.ts"), "export const X = true;\n");
    await writeFile(join(appPath, "lib", "tasks", "x.ts"), "export const X = true;\n");

    const application = await app("development");
    application.config.autoloadLib({ ignore: "tasks" });
    await application.initializeBang();
    onTestFinished(() => application.autoloaders.main.unload());

    const config = Trails.application!.config;
    expect(config.autoloadPaths).toContain(`${appPath}/lib`);
    expect(config.eagerLoadPaths).toContain(`${appPath}/lib`);

    expect(constGet(TopLevel, "X")).toBeTruthy();
    expect(() => constGet(TopLevel, "Tasks")).toThrow(NameError);
  });

  it("Trails.env falls back to development if TRAILS_ENV is blank and RACK_ENV is nil", async () => {
    await envHelpers.withTrailsEnv("", () => {
      expect(Trails.env.toString()).toBe("development");
    });
  });

  it("Trails.env falls back to development if RACK_ENV is blank and TRAILS_ENV is nil", async () => {
    await envHelpers.withRackEnv("", () => {
      expect(Trails.env.toString()).toBe("development");
    });
  });

  it("config_for loads custom configuration from YAML accessible as symbol or string", async () => {
    await setCustomConfig(`export default { development: { foo: "bar" } };`);
    const myCustomConfig = (await (await app("development")).configFor("custom")) as OrderedOptions;
    expect(myCustomConfig.get("foo")).toBe("bar");
    expect(myCustomConfig.get("foo")).toBe("bar");
  });

  it("config_for loads nested custom configuration from YAML as symbol keys", async () => {
    await setCustomConfig(`export default { development: { foo: { bar: { baz: 1 } } } };`);
    const myCustomConfig = (await (await app("development")).configFor("custom")) as OrderedOptions;
    expect((myCustomConfig.get("foo") as { bar: { baz: number } }).bar.baz).toBe(1);
  });

  it("config_for does not assume config is a hash", async () => {
    await setCustomConfig(`export default { development: ["foo", "bar"] };`);
    expect(await (await app("development")).configFor("custom")).toEqual(["foo", "bar"]);
  });

  it("config_for works with only a shared root array", async () => {
    await setCustomConfig(`export default { shared: ["foo", "bar"] };`);
    expect(await (await app("development")).configFor("custom")).toEqual(["foo", "bar"]);
  });

  it("config_for returns only the env array when shared is an array", async () => {
    await setCustomConfig(`export default { development: ["baz"], shared: ["foo", "bar"] };`);
    expect(await (await app("development")).configFor("custom")).toEqual(["baz"]);
  });

  it("config_for uses the Pathname object if it is provided", async () => {
    await setCustomConfig(`export default { development: { key: "custom key" } };`);
    const myCustomConfig = (await (
      await app("development")
    ).configFor(new Pathname(join(appPath, "config", "custom.ts")))) as OrderedOptions;
    expect(myCustomConfig.get("key")).toBe("custom key");
  });

  it("config_for raises an exception if the file does not exist", async () => {
    const application = await app("development");
    const exception = await assertRaises([RuntimeError], {}, () => application.configFor("custom"));
    expect(exception.message).toBe(
      `Could not load configuration. No such file - ${appPath}/config/custom.ts`,
    );
  });

  it("config_for without the environment configured returns nil", async () => {
    await setCustomConfig(`export default { test: { key: "custom key" } };`);
    assertNil(await (await app("development")).configFor("custom"));
  });

  it("config_for shared config is overridden", async () => {
    await setCustomConfig(
      `export default { shared: { foo: ":from_shared" }, test: { foo: ":from_env" } };`,
    );
    const myCustomConfig = (await (await app("test")).configFor("custom")) as OrderedOptions;
    expect(myCustomConfig.get("foo")).toBe(":from_env");
  });

  it("config_for shared config is returned when environment is missing", async () => {
    await setCustomConfig(
      `export default { shared: { foo: ":from_shared" }, test: { foo: ":from_env" } };`,
    );
    const myCustomConfig = (await (await app("development")).configFor("custom")) as OrderedOptions;
    expect(myCustomConfig.get("foo")).toBe(":from_shared");
  });

  it("config_for merges shared configuration deeply", async () => {
    await setCustomConfig(
      `export default { shared: { foo: { bar: { baz: 1 } } }, development: { foo: { bar: { qux: 2 } } } };`,
    );
    const myCustomConfig = (await (await app("development")).configFor("custom")) as OrderedOptions;
    expect((myCustomConfig.get("foo") as { bar: unknown }).bar).toEqual({ baz: 1, qux: 2 });
  });

  it("config_for with empty file returns nil", async () => {
    await setCustomConfig("");
    assertNil(await (await app("development")).configFor("custom"));
  });

  it("config_for allows overriding the environment", async () => {
    await setCustomConfig(
      `export default { test: { key: "walrus" }, production: { key: "unicorn" } };`,
    );
    const myCustomConfig = (await (
      await app("test")
    ).configFor("custom", { env: "production" })) as OrderedOptions;
    expect(myCustomConfig.get("key")).toBe("unicorn");
  });

  it("config_for returns a ActiveSupport::OrderedOptions", async () => {
    await setCustomConfig(
      `export default { shared: { some_key: "default" }, development: { some_key: "value" }, test: null };`,
    );
    const application = await app("development");
    let config = (await application.configFor("custom")) as OrderedOptions;
    expect(config).toBeInstanceOf(OrderedOptions);
    expect(config.get("some_key")).toBe("value");
    config = (await application.configFor("custom", { env: "test" })) as OrderedOptions;
    expect(config).toBeInstanceOf(OrderedOptions);
    expect(config.get("some_key")).toBe("default");
  });

  it("config_for makes all hash methods available", async () => {
    await setCustomConfig(`export default { development: { foo: 0, bar: { baz: 1 } } };`);
    const actual = (await (await app("development")).configFor("custom")) as OrderedOptions;
    expect(actual.toH()).toEqual({ foo: 0, bar: { baz: 1 } });
    expect(actual.keys()).toEqual(["foo", "bar"]);
    expect(actual.values()).toEqual([0, { baz: 1 }]);
    expect(actual.toH()).toEqual({ foo: 0, bar: { baz: 1 } });
    expect(actual.get("foo")).toBe(0);
    expect(actual.get("bar")).toEqual({ baz: 1 });
  });

  it("config.action_view.cache_template_loading with config.enable_reloading default", async () => {
    const application = await app("development");
    application.config.enableReloading = false;
    await application.initializeBang();
    runLoadHooks("action_view", Base);

    expect(Resolver.isCaching()).toBe(true);
  });

  it("config.action_view.cache_template_loading without config.enable_reloading default", async () => {
    const application = await app("development");
    application.config.enableReloading = true;
    await application.initializeBang();
    runLoadHooks("action_view", Base);

    expect(Resolver.isCaching()).toBe(false);
  });

  it("config.action_view.cache_template_loading = false", async () => {
    const application = await app("development");
    application.config.enableReloading = false;
    application.config.actionView.cacheTemplateLoading = false;
    await application.initializeBang();
    runLoadHooks("action_view", Base);

    expect(Resolver.isCaching()).toBe(false);
  });

  it("config.action_view.cache_template_loading = true", async () => {
    const application = await app("development");
    application.config.enableReloading = true;
    application.config.actionView.cacheTemplateLoading = true;
    await application.initializeBang();
    runLoadHooks("action_view", Base);

    expect(Resolver.isCaching()).toBe(true);
  });

  it("application will generate secret_key_base in tmp file if blank in development", async () => {
    const application = await app("development");
    application.config.secretKeyBase = null;

    assertNotNil(application.secretKeyBase());
    expect(await getFs().exists(join(appPath, "tmp/local_secret.txt"))).toBeTruthy();
  });

  it("application will generate secret_key_base in tmp file if blank in test", async () => {
    const application = await app("test");
    application.config.secretKeyBase = null;

    assertNotNil(application.secretKeyBase());
    expect(await getFs().exists(join(appPath, "tmp/local_secret.txt"))).toBeTruthy();
  });

  it("application will use ENV['SECRET_KEY_BASE'] if present in local env", async () => {
    const envVarSecret = "env_var_secret";
    setEnv("SECRET_KEY_BASE", envVarSecret);
    try {
      const application = await app("development");

      expect(application.secretKeyBase()).toBe(envVarSecret);
    } finally {
      setEnv("SECRET_KEY_BASE", undefined);
    }
  });

  it("always use tmp file secret when dummy secret_key_base is used in production", async () => {
    const secret = "tmp_file_secret";
    setEnv("SECRET_KEY_BASE_DUMMY", "1");
    setEnv("SECRET_KEY_BASE", "env_secret");
    try {
      await mkdir(join(appPath, "tmp"));
      await writeFile(join(appPath, "tmp/local_secret.txt"), secret);

      const application = await app("production");

      expect(application.secretKeyBase()).toBe(secret);
    } finally {
      setEnv("SECRET_KEY_BASE_DUMMY", undefined);
      setEnv("SECRET_KEY_BASE", undefined);
    }
  });

  it("sanitizer_vendor is set to best supported vendor in new apps", async () => {
    const application = await app("development");
    application.config.loadDefaults(LOAD_DEFAULTS_VERSION);
    await application.initializeBang();

    expect(SanitizeHelper.sanitizerVendor).toBe(HTML.Sanitizer.bestSupportedVendor());
  });

  it("sanitizer_vendor is set to HTML4 in upgraded apps", async () => {
    const application = await app("development");
    application.config.loadDefaults("7.0");
    await application.initializeBang();

    expect(SanitizeHelper.sanitizerVendor).toBe(HTML4.Sanitizer);
  });

  it("sanitizer_vendor is set to a specific vendor", async () => {
    const MySanitizerVendor = {
      fullSanitizer: HTML4.FullSanitizer,
      linkSanitizer: HTML4.LinkSanitizer,
      safeListSanitizer: HTML4.SafeListSanitizer,
    };
    const application = await app("development");
    application.config.loadDefaults(LOAD_DEFAULTS_VERSION);
    application.config.actionView.sanitizerVendor = MySanitizerVendor;
    await application.initializeBang();

    expect(SanitizeHelper.sanitizerVendor).toBe(MySanitizerVendor);
  });

  it("dom testing uses the HTML5 parser in new apps if it is supported", async () => {
    const application = await app("development");
    application.config.loadDefaults(LOAD_DEFAULTS_VERSION);
    const expected = "HTML5" in Nokogiri ? ":html5" : ":html4";

    expect(application.config.domTestingDefaultHtmlVersion).toBe(expected);
  });

  it("dom testing uses the HTML4 parser in upgraded apps", async () => {
    const application = await app("development");
    application.config.loadDefaults("7.0");

    expect(application.config.domTestingDefaultHtmlVersion).toBe(":html4");
  });

  it("action_dispatch.log_rescued_responses is true by default", async () => {
    const application = await app("development");

    expect(application.envConfig()["action_dispatch.log_rescued_responses"]).toBe(true);
  });

  it("action_dispatch.log_rescued_responses can be configured", async () => {
    const application = await app("development");
    application.config.actionDispatch.logRescuedResponses = false;

    expect(application.envConfig()["action_dispatch.log_rescued_responses"]).toBe(false);
  });

  it("ActionCable.server.config.cable is set when missing configuration for the current environment", async () => {
    await writeFile(join(appPath, "config", "cable.ts"), "export default { test: {} };\n");
    const application = await app("missing");
    application.config.secretKeyBase = "secret";
    await application.initializeBang();

    expect((ActionCable.server() as CableServer).config.cable).toBeInstanceOf(Object);
  });

  it("ActionMailbox.logger is Rails.logger by default", async () => {
    await (await app("development")).initializeBang();

    expect(ActionMailbox.logger).toBe(Trails.logger);
  });

  it("ActionMailbox.logger can be configured", async () => {
    class MyLogger extends Logger {}
    const application = await app("development");
    application.config.actionMailbox.logger = new MyLogger(null);
    await application.initializeBang();

    expect(ActionMailbox.logger!.constructor.name).toBe("MyLogger");
  });

  it("ActionMailbox.incinerate_after is 30.days by default", async () => {
    await (await app("development")).initializeBang();

    expect(ActionMailbox.incinerateAfter).toEqual(days(30));
  });

  it("ActionMailbox.incinerate_after can be configured", async () => {
    const application = await app("development");
    application.config.actionMailbox.incinerateAfter = days(14);
    await application.initializeBang();

    expect(ActionMailbox.incinerateAfter).toEqual(days(14));
  });

  it("ActionMailbox.queues[:incineration] is :action_mailbox_incineration by default in 6.0", async () => {
    const application = await app("development");
    application.config.loadDefaults("6.0");
    await application.initializeBang();

    expect(ActionMailbox.queues.incineration).toBe("action_mailbox_incineration");
  });

  it("ActionMailbox.queues[:incineration] is nil by default in 6.1", async () => {
    const application = await app("development");
    application.config.loadDefaults("6.1");
    await application.initializeBang();

    expect(ActionMailbox.queues.incineration).toBeNull();
  });

  it("ActionMailbox.queues[:incineration] can be configured", async () => {
    const application = await app("development");
    application.config.actionMailbox.queues!.set("incineration", "another_queue");
    await application.initializeBang();

    expect(ActionMailbox.queues.incineration).toBe("another_queue");
  });

  it("ActionMailbox.queues[:routing] is :action_mailbox_routing by default in 6.0", async () => {
    const application = await app("development");
    application.config.loadDefaults("6.0");
    await application.initializeBang();

    expect(ActionMailbox.queues.routing).toBe("action_mailbox_routing");
  });

  it("ActionMailbox.queues[:routing] is nil by default in 6.1", async () => {
    const application = await app("development");
    application.config.loadDefaults("6.1");
    await application.initializeBang();

    expect(ActionMailbox.queues.routing).toBeNull();
  });

  it("ActionMailbox.queues[:routing] can be configured", async () => {
    const application = await app("development");
    application.config.actionMailbox.queues!.set("routing", "another_queue");
    await application.initializeBang();

    expect(ActionMailbox.queues.routing).toBe("another_queue");
  });

  it("ActionMailbox.storage_service is nil by default (default service)", async () => {
    await (await app("development")).initializeBang();
    expect(ActionMailbox.storageService).toBeNull();
  });

  it("ActionMailbox.storage_service can be configured", async () => {
    const application = await app("development");
    application.config.activeStorage.serviceConfigurations = {
      email: { root: join(appPath, "email"), service: "Disk" },
    };
    application.config.actionMailbox.storageService = "email";
    await application.initializeBang();
    expect(ActionMailbox.storageService).toBe("email");
  });
  it("valid beginning of week is setup correctly", async () => {
    const application = await app("development");
    application.config.beginningOfWeek = ":wednesday";
    await application.initializeBang();

    expect(Trails.application!.config.beginningOfWeek).toBe(":wednesday");
  });

  it("raises when an invalid beginning of week is defined in the config", async () => {
    const application = await app("development");
    application.config.beginningOfWeek = ":invalid" as typeof application.config.beginningOfWeek;

    await assertRaises([ArgumentError], {}, () => application.initializeBang());
  });
  it("destroy association async job should be loaded in configs", async () => {
    await (await app("development")).initializeBang();

    expect(ActiveRecordBase.destroyAssociationAsyncJob).toBe(DestroyAssociationAsyncJob);
  });

  it("ActiveRecord::Base.destroy_association_async_job can be configured via config.active_record.destroy_association_async_job", async () => {
    class DummyDestroyAssociationAsyncJob {}
    constSet(TopLevel, "DummyDestroyAssociationAsyncJob", DummyDestroyAssociationAsyncJob);
    onTestFinished(() => {
      rbModRemoveConst(TopLevel, "DummyDestroyAssociationAsyncJob");
    });
    const application = await app("test");
    application.config.activeRecord.destroyAssociationAsyncJob = "DummyDestroyAssociationAsyncJob";
    await application.initializeBang();

    expect(ActiveRecordBase.destroyAssociationAsyncJob).toBe(DummyDestroyAssociationAsyncJob);
  });

  it("destroy association async batch size is nil by default", async () => {
    await (await app("development")).initializeBang();

    expect(ActiveRecordBase.destroyAssociationAsyncBatchSize).toBeNull();
  });

  it("destroy association async batch size can be set in configs", async () => {
    const application = await app("development");
    application.config.activeRecord.destroyAssociationAsyncBatchSize = 100;
    await application.initializeBang();

    expect(ActiveRecordBase.destroyAssociationAsyncBatchSize).toBe(100);
  });

  it("ActionView::Helpers::FormTagHelper.default_enforce_utf8 is false by default", async () => {
    const application = await app("development");
    application.config.loadDefaults(LOAD_DEFAULTS_VERSION);
    await application.initializeBang();
    expect(FormTagHelper.defaultEnforceUtf8).toBe(false);
  });

  it("ActionView::Helpers::FormTagHelper.default_enforce_utf8 is true in an upgraded app", async () => {
    const application = await app("development");
    application.config.loadDefaults("5.2");
    await application.initializeBang();

    expect(FormTagHelper.defaultEnforceUtf8).toBe(true);
  });

  it("ActionView::Helpers::FormTagHelper.default_enforce_utf8 can be configured via config.action_view.default_enforce_utf8", async () => {
    const application = await app("development");
    application.config.actionView.defaultEnforceUtf8 = true;
    await application.initializeBang();

    expect(FormTagHelper.defaultEnforceUtf8).toBe(true);
  });

  it("ActionView::Helpers::UrlHelper.button_to_generates_button_tag is true by default", async () => {
    const application = await app("development");
    application.config.loadDefaults(LOAD_DEFAULTS_VERSION);
    await application.initializeBang();
    expect(UrlHelper.buttonToGeneratesButtonTag).toBe(true);
  });

  it("ActionView::Helpers::UrlHelper.button_to_generates_button_tag is false by default for upgraded apps", async () => {
    const application = await app("development");
    application.config.loadDefaults("6.1");
    await application.initializeBang();

    expect(UrlHelper.buttonToGeneratesButtonTag).toBe(false);
  });

  it("ActionView::Helpers::UrlHelper.button_to_generates_button_tag can be configured via config.action_view.button_to_generates_button_tag", async () => {
    const application = await app("development");
    application.config.actionView.buttonToGeneratesButtonTag = true;
    await application.initializeBang();

    expect(UrlHelper.buttonToGeneratesButtonTag).toBe(true);
  });

  it("ActionView::Helpers::AssetTagHelper.image_loading is nil by default", async () => {
    const application = await app("development");
    application.config.loadDefaults(LOAD_DEFAULTS_VERSION);
    await application.initializeBang();
    expect(AssetTagHelper.imageLoading).toBeNull();
  });

  it("ActionView::Helpers::AssetTagHelper.image_loading can be configured via config.action_view.image_loading", async () => {
    const application = await app("development");
    application.config.loadDefaults(LOAD_DEFAULTS_VERSION);
    application.config.actionView.imageLoading = "lazy";
    await application.initializeBang();

    expect(AssetTagHelper.imageLoading).toBe("lazy");
  });

  it("ActionView::Helpers::AssetTagHelper.image_decoding is nil by default", async () => {
    const application = await app("development");
    application.config.loadDefaults(LOAD_DEFAULTS_VERSION);
    await application.initializeBang();
    expect(AssetTagHelper.imageDecoding).toBeNull();
  });

  it("ActionView::Helpers::AssetTagHelper.image_decoding can be configured via config.action_view.image_decoding", async () => {
    const application = await app("development");
    application.config.loadDefaults(LOAD_DEFAULTS_VERSION);
    application.config.actionView.imageDecoding = "async";
    await application.initializeBang();

    expect(AssetTagHelper.imageDecoding).toBe("async");
  });

  it("ActionView::Helpers::AssetTagHelper.preload_links_header is true by default", async () => {
    const application = await app("development");
    application.config.loadDefaults(LOAD_DEFAULTS_VERSION);
    await application.initializeBang();
    expect(AssetTagHelper.preloadLinksHeader).toBe(true);
  });

  it("ActionView::Helpers::AssetTagHelper.preload_links_header is nil by default for upgraded apps", async () => {
    const application = await app("development");
    application.config.loadDefaults("6.0");
    await application.initializeBang();

    expect(AssetTagHelper.preloadLinksHeader).toBeNull();
  });

  it("ActionView::Helpers::AssetTagHelper.preload_links_header can be configured via config.action_view.preload_links_header", async () => {
    const application = await app("development");
    application.config.loadDefaults(LOAD_DEFAULTS_VERSION);
    application.config.actionView.preloadLinksHeader = false;
    await application.initializeBang();

    expect(AssetTagHelper.preloadLinksHeader).toBe(false);
  });

  it("ActionView::Helpers::AssetTagHelper.apply_stylesheet_media_default is true by default for upgraded apps", async () => {
    await (await app("development")).initializeBang();

    expect(AssetTagHelper.applyStylesheetMediaDefault).toBe(true);
  });

  it("ActionView::Helpers::AssetTagHelper.apply_stylesheet_media_default can be configured via config.action_view.apply_stylesheet_media_default", async () => {
    const application = await app("development");
    application.config.actionView.applyStylesheetMediaDefault = false;
    await application.initializeBang();

    expect(AssetTagHelper.applyStylesheetMediaDefault).toBe(false);
  });

  it("ActiveJob::Base.retry_jitter is 0.15 by default for new apps", async () => {
    const application = await app("development");
    application.config.loadDefaults(LOAD_DEFAULTS_VERSION);
    await application.initializeBang();

    expect(ActiveJobBase.retryJitter).toBe(0.15);
  });

  it("ActiveJob::Base.retry_jitter is 0.0 by default for upgraded apps", async () => {
    await (await app("development")).initializeBang();

    expect(ActiveJobBase.retryJitter).toBe(0.0);
  });

  it("Rails.application.config.action_dispatch.cookies_same_site_protection is :lax by default", async () => {
    const application = await app("production");
    application.config.loadDefaults(LOAD_DEFAULTS_VERSION);

    expect(Trails.application!.config.actionDispatch.cookiesSameSiteProtection).toBe(":lax");
  });

  it("Rails.application.config.action_dispatch.cookies_same_site_protection is :lax can be overridden", async () => {
    const application = await app("production");
    application.config.loadDefaults(LOAD_DEFAULTS_VERSION);
    application.config.actionDispatch.cookiesSameSiteProtection = ":strict";

    expect(Trails.application!.config.actionDispatch.cookiesSameSiteProtection).toBe(":strict");
  });

  it("Rails.application.config.action_dispatch.cookies_same_site_protection is :lax in 6.1 defaults", async () => {
    const application = await app("development");
    application.config.loadDefaults("6.1");

    expect(Trails.application!.config.actionDispatch.cookiesSameSiteProtection).toBe(":lax");
  });

  it("Rails.application.config.action_dispatch.ssl_default_redirect_status is 308 in 6.1 defaults", async () => {
    const application = await app("production");
    application.config.loadDefaults("6.1");

    expect(Trails.application!.config.actionDispatch.sslDefaultRedirectStatus).toBe(308);
  });

  it("Rails.application.config.action_dispatch.ssl_default_redirect_status can be configured in an initializer", async () => {
    const application = await app("production");
    application.config.loadDefaults("6.0");
    application.config.actionDispatch.sslDefaultRedirectStatus = 308;

    expect(Trails.application!.config.actionDispatch.sslDefaultRedirectStatus).toBe(308);
  });

  it("Rails.application.config.action_dispatch.strict_freshness is false by default for older applications", async () => {
    await app("development");

    expect(Trails.application!.config.actionDispatch.strictFreshness).toBe(false);
  });

  it("Rails.application.config.action_dispatch.strict_freshness can be configured in an initializer", async () => {
    const application = await app("development");
    application.config.actionDispatch.strictFreshness = true;
    await application.initializeBang();

    expect(CacheRequest.strictFreshness).toBe(true);
  });

  it("Rails.application.config.active_support.to_time_preserves_timezone can be configured in an initializer", async () => {
    const application = await app("development");
    application.config.loadDefaults("7.2");
    application.config.activeSupport.toTimePreservesTimezone = ":zone";
    await application.initializeBang();

    expect(ActiveSupport.toTimePreservesTimezone()).toBe(":zone");
  });

  it("Rails.application.config.action_mailer.smtp_settings have open_timeout and read_timeout defined as 5 in 7.0 defaults", async () => {
    const application = await app("development");
    application.config.actionMailer.smtpSettings = { domain: "example.com" };
    application.config.loadDefaults("7.0");
    await application.initializeBang();

    const smtpSettings = { domain: "example.com", openTimeout: 5, readTimeout: 5 };

    expect(ActionMailerBase.smtpSettings).toEqual(smtpSettings);
    expect(Trails.configuration!.actionMailer.smtpSettings).toEqual(smtpSettings);
  });

  it("Rails.application.config.action_mailer.smtp_settings does not have open_timeout and read_timeout configured on other versions", async () => {
    const application = await app("development");
    application.config.actionMailer.smtpSettings = { domain: "example.com" };
    await application.initializeBang();

    const smtpSettings = { domain: "example.com" };

    expect(ActionMailerBase.smtpSettings).toEqual(smtpSettings);
  });

  it("Rails.application.config.action_mailer.smtp_settings = nil fallback to ActionMailer::Base.smtp_settings", async () => {
    const application = await app("development");
    ActionMailerBase.smtpSettings = { domain: "example.com" };
    application.config.loadDefaults("7.0");
    await application.initializeBang();

    const smtpSettings = { domain: "example.com", openTimeout: 5, readTimeout: 5 };

    expect(ActionMailerBase.smtpSettings).toEqual(smtpSettings);
    assertNil(Trails.configuration!.actionMailer.smtpSettings);
  });

  it("Rails.application.config.action_mailer.smtp_settings = nil and ActionMailer::Base.smtp_settings = nil do not configure smtp_timeout", async () => {
    ActionMailerBase.smtpSettings = null;

    const application = await app("development");
    application.config.actionMailer.smtpSettings = null;
    application.config.loadDefaults("7.0");
    await application.initializeBang();

    assertNil(Trails.configuration!.actionMailer.smtpSettings);
    expect(ActionMailerBase.smtpSettings).toBeNull();
  });

  it("ActiveSupport.utc_to_local_returns_utc_offset_times is true in 6.1 defaults", async () => {
    const application = await app("development");
    application.config.loadDefaults("6.1");
    await application.initializeBang();

    expect(utcToLocalReturnsUtcOffsetTimes()).toBe(true);
  });

  it("ActiveSupport.utc_to_local_returns_utc_offset_times is false in 6.0 defaults", async () => {
    const application = await app("development");
    application.config.loadDefaults("6.0");
    await application.initializeBang();

    expect(utcToLocalReturnsUtcOffsetTimes()).toBe(false);
  });

  it("ActiveSupport.utc_to_local_returns_utc_offset_times can be configured in an initializer", async () => {
    const application = await app("development");
    application.config.loadDefaults("6.0");
    await application.initializeBang();
    setUtcToLocalReturnsUtcOffsetTimes(true);

    expect(utcToLocalReturnsUtcOffsetTimes()).toBe(true);
  });

  it("ActiveStorage.queues[:analysis] is :active_storage_analysis by default in 6.0", async () => {
    const application = await app("development");
    application.config.loadDefaults("6.0");
    await application.initializeBang();

    expect(ActiveStorage.queues.analysis).toBe("active_storage_analysis");
  });

  it("ActiveStorage.queues[:analysis] is nil by default in 6.1", async () => {
    const application = await app("development");
    application.config.loadDefaults("6.1");
    await application.initializeBang();

    assertNil(ActiveStorage.queues.analysis);
  });

  it("ActiveStorage.queues[:analysis] is nil without Rails 6 defaults", async () => {
    await (await app("development")).initializeBang();

    assertNil(ActiveStorage.queues.analysis);
  });
});
