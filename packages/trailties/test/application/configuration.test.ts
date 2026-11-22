import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  onTestFinished,
  vi,
} from "vitest";
import { constSet, rbModRemoveConst } from "@blazetrails/ruby-compat";
import { ActionDispatch, Session } from "@blazetrails/actionpack";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { OrderedOptions, runLoadHooks } from "@blazetrails/activesupport";
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
import * as ActiveRecord from "@blazetrails/activerecord";
import { Dependencies } from "@blazetrails/activesupport";
import { Numeric } from "@blazetrails/activesupport/core-ext/numeric/bytes";
import { File, LOAD_PATH, OpenSSL, StandardError } from "@blazetrails/ruby-compat";
import { Time } from "@blazetrails/date";
import { SQLite3Adapter } from "@blazetrails/activerecord/connection-adapters/sqlite3-adapter.js";
import { ActiveSupport } from "@blazetrails/activesupport";
import { Digest } from "@blazetrails/activesupport/digest";
import { KeyGenerator } from "@blazetrails/activesupport/key-generator";
import { MessageEncryptor } from "@blazetrails/activesupport/message-encryptor";
import { ActiveJob, Serializers } from "@blazetrails/activejob";
import { Trailtie as ActiveJobTrailtie } from "../../lib/trailties/active-job.js";
import { Configuration as TrailtieConfiguration } from "../../lib/trailtie/configuration.js";
import { DatabaseTasks } from "@blazetrails/activerecord";
import { Annotation } from "../../lib/source-annotation-extractor.js";
import "../../lib/trailties/active-record.js";
import { Trailtie as ActionMailerTrailtie } from "../../lib/trailties/action-mailer.js";
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
  let trailsApplication: Application | null;

  beforeAll(() => {
    trailsApplication = Trails.application;
  });

  afterAll(() => {
    Trails.application = trailsApplication;
  });

  let trailtieOptions: [Record<string, unknown>, Record<string, unknown>][];
  const frameworkDefaults = [
    [ActiveRecord.Base, "hasManyInversing"],
    [ActiveRecord.Base, "automaticScopeInversing"],
    [ActiveRecord.Base, "runCommitCallbacksOnFirstSavedInstancesInTransaction"],
    [MessageEncryptor, "useAuthenticatedMessageEncryption"],
    [Digest, "_hashDigestClass"],
    [KeyGenerator, "_hashDigestClass"],
    [ActiveSupport, "testParallelizationThreshold"],
    [ActiveJob.Base, "enqueueAfterTransactionCommit"],
    [SQLite3Adapter, "strictStringsByDefault"],
  ].map(([owner, key]) => [owner, key, (owner as Record<string, unknown>)[key as string]]) as [
    Record<string, unknown>,
    string,
    unknown,
  ][];
  const verifyForeignKeysForFixtures = ActiveRecord.verifyForeignKeysForFixtures();
  const verboseEnqueueLogs = ActiveJob.verboseEnqueueLogs();

  beforeEach(async () => {
    trailtieOptions = Object.values(TrailtieConfiguration._options)
      .filter(
        (options): options is Record<string, unknown> =>
          typeof options === "object" && options !== null && !(options instanceof OrderedOptions),
      )
      .map((options) => [options, { ...options }]);
    appPath = await mkdtemp(join(tmpdir(), "trails-config-for-"));
    await mkdir(join(appPath, "config"));
    await writeFile(join(appPath, "config", "storage.ts"), "export default {};\n");
    await writeFile(join(appPath, "config.ts"), "");
  });

  afterEach(async () => {
    for (const [owner, key, value] of frameworkDefaults) owner[key] = value;
    ActiveRecord.setVerifyForeignKeysForFixtures(verifyForeignKeysForFixtures);
    ActiveJob.setVerboseEnqueueLogs(verboseEnqueueLogs);
    ActiveJobTrailtie.config.activeJob.delete("verboseEnqueueLogs");
    ActiveJobTrailtie.config.activeJob.delete("enqueueAfterTransactionCommit");
    for (const [options, snapshot] of trailtieOptions) {
      for (const key of Object.keys(options)) if (!(key in snapshot)) delete options[key];
      Object.assign(options, snapshot);
    }
    Resolver.caching = true;
    SanitizeHelper.sanitizerVendor = sanitizerVendor;
    Application.appClass = null;
    delete ActionViewTrailtie.config.actionView.cacheTemplateLoading;
    ActionMailerTrailtie.config.actionMailer.showPreviews = null;
    Object.assign(ActionMailboxEngine.config.actionMailbox, actionMailbox);
    ActionMailboxEngine.config.actionMailbox.queues!.set(
      "incineration",
      "action_mailbox_incineration",
    );
    ActionMailboxEngine.config.actionMailbox.queues!.set("routing", "action_mailbox_routing");
    setEnv("TRAILS_ENV", trailsEnv);
    _resetTrailsEnv();
    await rm(appPath, { recursive: true, force: true });
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

  it("config.active_record.verbose_query_logs is false by default in development", async () => {
    await (await app("development")).initializeBang();

    expect(ActiveRecord.verboseQueryLogs()).toBeFalsy();
  });

  it("config.active_record.use_yaml_unsafe_load is false by default", async () => {
    const application = await app("production");
    application.config.secretKeyBase = "secret";
    await application.initializeBang();
    expect(ActiveRecord.useYamlUnsafeLoad()).toBeFalsy();
  });

  it("config.active_record.use_yaml_unsafe_load can be configured", async () => {
    const application = await app("production");
    application.config.secretKeyBase = "secret";
    application.config.activeRecord.useYamlUnsafeLoad = true;
    await application.initializeBang();
    expect(ActiveRecord.useYamlUnsafeLoad()).toBeTruthy();
  });

  it("config.active_record.raise_int_wider_than_64bit is true by default", async () => {
    const application = await app("production");
    application.config.secretKeyBase = "secret";
    await application.initializeBang();
    expect(ActiveRecord.raiseIntWiderThan64bit()).toBeTruthy();
  });

  it("config.active_record.raise_int_wider_than_64bit can be configured", async () => {
    const application = await app("production");
    application.config.secretKeyBase = "secret";
    application.config.activeRecord.raiseIntWiderThan64bit = false;
    await application.initializeBang();
    expect(ActiveRecord.raiseIntWiderThan64bit()).toBeFalsy();
  });

  it("config.active_record.yaml_column_permitted_classes is [Symbol] by default", async () => {
    const application = await app("production");
    application.config.secretKeyBase = "secret";
    await application.initializeBang();
    expect(ActiveRecord.yamlColumnPermittedClasses()).toEqual([Symbol]);
  });

  it("config.active_record.yaml_column_permitted_classes can be configured", async () => {
    const application = await app("production");
    application.config.secretKeyBase = "secret";
    application.config.activeRecord.yamlColumnPermittedClasses = [Symbol, Time];
    await application.initializeBang();
    expect(ActiveRecord.yamlColumnPermittedClasses()).toEqual([Symbol, Time]);
  });

  it("config.default_log_file returns a File instance", async () => {
    const application = await app("development");

    const defaultLogFile = await application.config.defaultLogFile();
    expect(defaultLogFile).toBeInstanceOf(File);
    expect(defaultLogFile.path()).toBe(Trails.application!.config.paths().get("log")!.first());
  });

  it("config.log_file_size returns a 100MB size number in development", async () => {
    const application = await app("development");
    application.config.loadDefaults(LOAD_DEFAULTS_VERSION);

    expect(application.config.logFileSize).toBe(Numeric.megabytes(100));
  });

  it("config.log_file_size returns a 100MB size number in test", async () => {
    const application = await app("test");
    application.config.loadDefaults(LOAD_DEFAULTS_VERSION);

    expect(application.config.logFileSize).toBe(Numeric.megabytes(100));
  });

  it("config.log_file_size returns no limit in production", async () => {
    const application = await app("production");

    assertNil(application.config.logFileSize);
  });

  it("rake_tasks block works at instance level", async () => {
    const application = await app("development");
    const config = application.config as unknown as { ranBlock: boolean };
    config.ranBlock = false;
    application.rakeTasks(() => {
      config.ranBlock = true;
    });
    await application.initializeBang();
    expect(config.ranBlock).toBeFalsy();

    await Trails.application!.loadTasks();
    expect(config.ranBlock).toBeTruthy();
  });

  it("generators block works at instance level", async () => {
    const application = await app("development");
    const config = application.config as unknown as { ranBlock: boolean };
    config.ranBlock = false;
    application.generators(() => {
      config.ranBlock = true;
    });
    await application.initializeBang();
    expect(config.ranBlock).toBeFalsy();

    await Trails.application!.loadGenerators();
    expect(config.ranBlock).toBeTruthy();
  });

  it("console block works at instance level", async () => {
    const application = await app("development");
    const config = application.config as unknown as { ranBlock: boolean };
    config.ranBlock = false;
    application.console(() => {
      config.ranBlock = true;
    });
    await application.initializeBang();
    expect(config.ranBlock).toBeFalsy();

    await Trails.application!.loadConsole();
    expect(config.ranBlock).toBeTruthy();
  });

  it("runner block works at instance level", async () => {
    const application = await app("development");
    const config = application.config as unknown as { ranBlock: boolean };
    config.ranBlock = false;
    application.runner(() => {
      config.ranBlock = true;
    });
    await application.initializeBang();
    expect(config.ranBlock).toBeFalsy();

    await Trails.application!.loadRunner();
    expect(config.ranBlock).toBeTruthy();
  });

  it("loading the first existing database configuration available", async () => {
    await writeFile(join(appPath, "config", "database.ts"), "export default {};\n");
    const application = await app("development");
    application.config.paths().add("config/database", { with: "config/nonexistent.ts" });
    application.config.paths().get("config/database")!.push("config/database.ts");

    expect(await Trails.application!.config.databaseConfiguration()).toBeInstanceOf(Object);
  });

  it("autoload paths do not include asset paths", async () => {
    await (await app("development")).initializeBang();
    for (const path of Dependencies.autoloadPaths) {
      expect(path.endsWith("app/assets")).toBeFalsy();
      expect(path.endsWith("app/javascript")).toBeFalsy();
    }
  });

  it("load_database_yaml returns blank hash if configuration file is blank", async () => {
    await writeFile(join(appPath, "config", "database.ts"), "");
    await app("development");
    expect(await Trails.application!.config.loadDatabaseYaml()).toEqual({});
  });

  it("load_database_yaml returns blank hash if no database configuration is found", async () => {
    await app("development");
    expect(await Trails.application!.config.loadDatabaseYaml()).toEqual({});
  });

  it("raises with proper error message if no database configuration found", async () => {
    const err = await envHelpers.switchEnv("DATABASE_URL", undefined, () =>
      assertRaises([RuntimeError], {}, async () => {
        await app("development");
        await Trails.application!.config.databaseConfiguration();
      }),
    );
    expect(err.message).toMatch("config/database");
  });

  it("loads database.yml using shared keys", async () => {
    await writeFile(
      join(appPath, "config", "database.ts"),
      `export default { shared: { username: "bobby", adapter: "sqlite3" }, development: { database: "dev_db" } };`,
    );

    await app("development");

    const arConfig = (await Trails.application!.config.databaseConfiguration()) as Record<
      string,
      Record<string, unknown>
    >;
    expect(arConfig["development"]["adapter"]).toBe("sqlite3");
    expect(arConfig["development"]["username"]).toBe("bobby");
    expect(arConfig["development"]["database"]).toBe("dev_db");
  });

  it("loads database.yml using shared keys for undefined environments", async () => {
    await writeFile(
      join(appPath, "config", "database.ts"),
      `export default { shared: { username: "bobby", adapter: "sqlite3", database: "dev_db" } };`,
    );

    await app("development");

    const arConfig = (await Trails.application!.config.databaseConfiguration()) as Record<
      string,
      Record<string, unknown>
    >;
    expect(arConfig["development"]["adapter"]).toBe("sqlite3");
    expect(arConfig["development"]["username"]).toBe("bobby");
    expect(arConfig["development"]["database"]).toBe("dev_db");
  });

  it("loads database.yml using shared keys with a 3-tier config", async () => {
    await writeFile(
      join(appPath, "config", "database.ts"),
      `export default { shared: { username: "bobby", adapter: "sqlite3" }, development: { primary: { database: "dev_db" } } };`,
    );

    await app("development");

    const arConfig = (await Trails.application!.config.databaseConfiguration()) as Record<
      string,
      Record<string, Record<string, unknown>>
    >;
    expect(arConfig["development"]["primary"]["adapter"]).toBe("sqlite3");
    expect(arConfig["development"]["primary"]["username"]).toBe("bobby");
    expect(arConfig["development"]["primary"]["database"]).toBe("dev_db");
  });

  it("loads database.yml using 3-tier shared keys with a 3-tier config", async () => {
    await writeFile(
      join(appPath, "config", "database.ts"),
      `export default { shared: { one: { migrations_path: "db/one" }, two: { migrations_path: "db/two" } }, development: { one: { adapter: "sqlite3" }, two: { adapter: "sqlite3" } } };`,
    );

    await app("development");

    const arConfig = (await Trails.configuration!.databaseConfiguration()) as Record<
      string,
      Record<string, Record<string, unknown>>
    >;
    expect(arConfig["development"]["one"]["migrations_path"]).toBe("db/one");
    expect(arConfig["development"]["two"]["migrations_path"]).toBe("db/two");
  });

  it("config.action_mailer.show_previews defaults to true in development", async () => {
    await (await app("development")).initializeBang();

    expect(Trails.application!.config.actionMailer.showPreviews).toBeTruthy();
  });

  it("config.action_mailer.show_previews defaults to false in production", async () => {
    const application = await app("production");
    application.config.secretKeyBase = "secret";
    await application.initializeBang();

    expect(Trails.application!.config.actionMailer.showPreviews).toBe(false);
  });

  it("config.action_mailer.show_previews can be set in the configuration file", async () => {
    const application = await app("production");
    application.config.secretKeyBase = "secret";
    application.config.actionMailer.showPreviews = true;
    await application.initializeBang();

    expect(Trails.application!.config.actionMailer.showPreviews).toBe(true);
  });

  it("config.annotations wrapping SourceAnnotationExtractor::Annotation class", async () => {
    const application = await app("development");
    application.config
      .annotations()
      .registerExtensions("coffee", (tag) => new RegExp(`#\\s*(${tag}):?\\s*(.*)$`));
    await application.initializeBang();

    assertNotNil(Annotation.extensions.get("\\.(coffee)$"));
  });

  it("autoload paths do not include custom config.javascript_paths", async () => {
    const application = await app("development");
    application.config.javascriptPath = "webpack";
    await mkdir(join(appPath, "app", "webpack"), { recursive: true });
    await application.initializeBang();

    for (const path of Dependencies.autoloadPaths) {
      expect(path.endsWith("app/assets")).toBeFalsy();
      expect(path.endsWith("app/webpack")).toBeFalsy();
    }
  });

  it("autoload paths are not added to $LOAD_PATH if opted-in", async () => {
    await mkdir(join(appPath, "lib"), { recursive: true });
    const application = await app("development");
    application.config.loadDefaults(LOAD_DEFAULTS_VERSION);
    application.config.addAutoloadPathsToLoadPath = true;
    await application.initializeBang();

    const autoloadPaths = Dependencies.autoloadPaths;
    const autoloadPathsFromAppAndEngines = autoloadPaths.filter(
      (path) => !path.endsWith("mailers/previews"),
    );
    expect(Trails.configuration!.addAutoloadPathsToLoadPath).toBe(true);
    expect(autoloadPathsFromAppAndEngines.filter((p) => !LOAD_PATH.includes(p))).toBeEmpty();

    expect(Trails.configuration!.paths().loadPaths()).not.toBeEmpty();
    expect(
      Trails.configuration!.paths()
        .loadPaths()
        .filter((p) => !LOAD_PATH.includes(p)),
    ).toBeEmpty();
  });

  it("autoload paths are not added to $LOAD_PATH by default, except for lib", async () => {
    await mkdir(join(appPath, "lib"), { recursive: true });
    const application = await app("development");
    application.config.loadDefaults(LOAD_DEFAULTS_VERSION);
    application.config.autoloadLib({ ignore: ["assets", "tasks"] });
    await application.initializeBang();
    onTestFinished(() => application.autoloaders.main.unload());

    expect(Dependencies.autoloadPaths.filter((p) => LOAD_PATH.includes(p))).toEqual([
      `${appPath}/lib`,
    ]);

    expect(Trails.configuration!.paths().loadPaths()).not.toBeEmpty();
    expect(
      Trails.configuration!.paths()
        .loadPaths()
        .filter((p) => !LOAD_PATH.includes(p)),
    ).toBeEmpty();
  });

  it("lib is added to $LOAD_PATH regardless of config.add_autoload_paths_to_load_path", async () => {
    await mkdir(join(appPath, "lib"), { recursive: true });
    const lib = File.join(appPath, "lib");

    const application = await app("development");
    application.config.loadDefaults(LOAD_DEFAULTS_VERSION);
    application.config.autoloadPaths.push(lib);
    await application.initializeBang();

    expect(Trails.configuration!.addAutoloadPathsToLoadPath).toBeFalsy();
    expect(LOAD_PATH).toContain(lib);
  });

  it("config.autoload_lib(...) is generated by default", async () => {
    await mkdir(join(appPath, "lib", "m"), { recursive: true });
    await mkdir(join(appPath, "lib", "assets"), { recursive: true });
    await mkdir(join(appPath, "lib", "tasks"), { recursive: true });
    await writeFile(join(appPath, "lib", "x.ts"), "export const X = true;\n");
    await writeFile(join(appPath, "lib", "m", "x.ts"), "export const X = true;\n");
    await writeFile(join(appPath, "lib", "assets", "x.ts"), "export const X = true;\n");
    await writeFile(join(appPath, "lib", "tasks", "x.ts"), "export const X = true;\n");

    const application = await app("development");
    application.config.autoloadLib({ ignore: ["assets", "tasks"] });
    await application.initializeBang();
    onTestFinished(() => application.autoloaders.main.unload());

    expect(Trails.application!.config.autoloadPaths).toContain(`${appPath}/lib`);
    expect(Trails.application!.config.eagerLoadPaths).toContain(`${appPath}/lib`);

    expect(constGet(TopLevel, "X")).toBeTruthy();
    expect(constGet(TopLevel, "M::X")).toBeTruthy();
    expect(() => constGet(TopLevel, "Assets")).toThrow(NameError);
    expect(() => constGet(TopLevel, "Tasks")).toThrow(NameError);
  });

  it("autoload paths can be set in the config file of the environment", async () => {
    await mkdir(join(appPath, "custom_autoload_path"));
    await mkdir(join(appPath, "custom_autoload_once_path"));
    await mkdir(join(appPath, "custom_eager_load_path"));

    const application = await app("development");
    application.config.autoloadPaths.push(`${appPath}/custom_autoload_path`);
    application.config.autoloadOncePaths.push(`${appPath}/custom_autoload_once_path`);
    application.config.eagerLoadPaths.push(`${appPath}/custom_eager_load_path`);
    await application.initializeBang();

    const config = Trails.application!.config;
    expect(config.autoloadPaths).toContain(`${appPath}/custom_autoload_path`);
    expect(config.autoloadOncePaths).toContain(`${appPath}/custom_autoload_once_path`);
    expect(config.eagerLoadPaths).toContain(`${appPath}/custom_eager_load_path`);
  });

  it("setup_initial_database_yaml does not print a warning", async () => {
    await writeFile(
      join(appPath, "config", "database.ts"),
      `import { Trails } from "@blazetrails/trailties";\nexport default { [Trails.env.toString()]: { username: "bobby", adapter: "sqlite3", database: "dev_db" } };\n`,
    );
    await app("development");

    const warn = vi.spyOn(console, "warn");
    const log = vi.spyOn(console, "log");
    onTestFinished(() => {
      vi.restoreAllMocks();
    });
    await DatabaseTasks.setupInitialDatabaseYaml();
    expect([...warn.mock.calls, ...log.mock.calls]).toEqual([]);
  });

  it("api_only is false by default", async () => {
    await (await app("development")).initializeBang();
    expect(Trails.application!.config.apiOnly).toBeFalsy();
  });

  it("api_only generator config is set when api_only is set", async () => {
    const application = await app("development");
    application.config.apiOnly = true;
    await application.initializeBang();

    await Trails.application!.loadGenerators();
    expect(Trails.configuration!.apiOnly).toBeTruthy();
  });

  it("debug_exception_response_format is :api by default if api_only is enabled", async () => {
    const application = await app("development");
    application.config.apiOnly = true;
    await application.initializeBang();

    expect(Trails.configuration!.debugExceptionResponseFormat).toBe("api");
  });

  it("debug_exception_response_format can be overridden", async () => {
    const application = await app("development");
    application.config.apiOnly = true;
    application.config.debugExceptionResponseFormat = "default";
    await application.initializeBang();

    expect(Trails.configuration!.debugExceptionResponseFormat).toBe("default");
  });

  it("debug_exception_log_level is :fatal by default for upgraded apps", async () => {
    const application = await app("development");
    await application.initializeBang();

    expect(String(application.envConfig()["action_dispatch.debug_exception_log_level"])).toBe("4");
  });

  it("debug_exception_log_level is :error for new apps", async () => {
    const application = await app("development");
    application.config.loadDefaults("7.1");
    await application.initializeBang();

    expect(String(application.envConfig()["action_dispatch.debug_exception_log_level"])).toBe("3");
  });

  it("ActiveRecord::Base.has_many_inversing is true by default for new apps", async () => {
    const application = await app("development");
    application.config.loadDefaults(LOAD_DEFAULTS_VERSION);
    await application.initializeBang();

    expect(ActiveRecord.Base.hasManyInversing).toBe(true);
  });

  it("ActiveRecord::Base.has_many_inversing is false by default for upgraded apps", async () => {
    await (await app("development")).initializeBang();

    expect(ActiveRecord.Base.hasManyInversing).toBe(false);
  });

  it("ActiveRecord::Base.has_many_inversing can be configured via config.active_record.has_many_inversing", async () => {
    const application = await app("development");
    application.config.activeRecord.hasManyInversing = true;
    await application.initializeBang();

    expect(ActiveRecord.Base.hasManyInversing).toBe(true);
  });

  it("ActiveRecord::Base.automatic_scope_inversing is true by default for new apps", async () => {
    const application = await app("development");
    application.config.loadDefaults(LOAD_DEFAULTS_VERSION);
    await application.initializeBang();

    expect(ActiveRecord.Base.automaticScopeInversing).toBe(true);
  });

  it("ActiveRecord::Base.automatic_scope_inversing is false by default for upgraded apps", async () => {
    await (await app("development")).initializeBang();

    expect(ActiveRecord.Base.automaticScopeInversing).toBe(false);
  });

  it("ActiveRecord::Base.automatic_scope_inversing can be configured via config.active_record.automatic_scope_inversing", async () => {
    const application = await app("development");
    application.config.activeRecord.automaticScopeInversing = true;
    await application.initializeBang();

    expect(ActiveRecord.Base.automaticScopeInversing).toBe(true);
  });

  it("ActiveRecord.verify_foreign_keys_for_fixtures is true by default for new apps", async () => {
    const application = await app("development");
    application.config.loadDefaults(LOAD_DEFAULTS_VERSION);
    await application.initializeBang();

    expect(ActiveRecord.verifyForeignKeysForFixtures()).toBe(true);
  });

  it("ActiveRecord.verify_foreign_keys_for_fixtures is false by default for upgraded apps", async () => {
    await (await app("development")).initializeBang();

    expect(ActiveRecord.verifyForeignKeysForFixtures()).toBe(false);
  });

  it("ActiveRecord.verify_foreign_keys_for_fixtures can be configured via config.active_record.verify_foreign_keys_for_fixtures", async () => {
    const application = await app("development");
    application.config.activeRecord.verifyForeignKeysForFixtures = true;
    await application.initializeBang();

    expect(ActiveRecord.verifyForeignKeysForFixtures()).toBe(true);
  });

  it("ActiveRecord::Base.run_commit_callbacks_on_first_saved_instances_in_transaction is false by default for new apps", async () => {
    const application = await app("development");
    application.config.loadDefaults(LOAD_DEFAULTS_VERSION);
    await application.initializeBang();

    expect(ActiveRecord.Base.runCommitCallbacksOnFirstSavedInstancesInTransaction).toBe(false);
  });

  it("ActiveRecord::Base.run_commit_callbacks_on_first_saved_instances_in_transaction is true by default for upgraded apps", async () => {
    await (await app("development")).initializeBang();

    expect(ActiveRecord.Base.runCommitCallbacksOnFirstSavedInstancesInTransaction).toBe(true);
  });

  it("ActiveRecord::Base.run_commit_callbacks_on_first_saved_instances_in_transaction can be configured via config.active_record.run_commit_callbacks_on_first_saved_instances_in_transaction", async () => {
    const application = await app("development");
    application.config.activeRecord.runCommitCallbacksOnFirstSavedInstancesInTransaction = false;
    await application.initializeBang();

    expect(ActiveRecord.Base.runCommitCallbacksOnFirstSavedInstancesInTransaction).toBe(false);
  });

  it("ActiveSupport::MessageEncryptor.use_authenticated_message_encryption is true by default for new apps", async () => {
    const application = await app("development");
    application.config.loadDefaults(LOAD_DEFAULTS_VERSION);
    await application.initializeBang();

    expect(MessageEncryptor.useAuthenticatedMessageEncryption).toBe(true);
  });

  it("ActiveSupport::MessageEncryptor.use_authenticated_message_encryption is false by default for upgraded apps", async () => {
    await (await app("development")).initializeBang();

    expect(MessageEncryptor.useAuthenticatedMessageEncryption).toBe(false);
  });

  it("ActiveSupport::MessageEncryptor.use_authenticated_message_encryption can be configured via config.active_support.use_authenticated_message_encryption", async () => {
    const application = await app("development");
    application.config.activeSupport.useAuthenticatedMessageEncryption = true;
    await application.initializeBang();

    expect(MessageEncryptor.useAuthenticatedMessageEncryption).toBe(true);
  });

  it("ActiveSupport::Digest.hash_digest_class is OpenSSL::Digest::SHA256 by default for new apps", async () => {
    const application = await app("development");
    application.config.loadDefaults(LOAD_DEFAULTS_VERSION);
    await application.initializeBang();

    expect(Digest.hashDigestClass).toBe(OpenSSL.Digest.SHA256);
  });

  it("ActiveSupport::Digest.hash_digest_class is OpenSSL::Digest::MD5 by default for upgraded apps", async () => {
    await (await app("development")).initializeBang();

    expect(Digest.hashDigestClass).toBe(OpenSSL.Digest.MD5);
  });

  it("ActiveSupport::Digest.hash_digest_class can be configured via config.active_support.hash_digest_class", async () => {
    const application = await app("development");
    application.config.activeSupport.hashDigestClass = OpenSSL.Digest.SHA256;
    await application.initializeBang();

    expect(Digest.hashDigestClass).toBe(OpenSSL.Digest.SHA256);
  });

  it("ActiveSupport::KeyGenerator.hash_digest_class is OpenSSL::Digest::SHA256 by default for new apps", async () => {
    const application = await app("development");
    application.config.loadDefaults(LOAD_DEFAULTS_VERSION);
    await application.initializeBang();

    expect(KeyGenerator.hashDigestClass).toBe(OpenSSL.Digest.SHA256);
  });

  it("ActiveSupport::KeyGenerator.hash_digest_class is OpenSSL::Digest::SHA1 by default for upgraded apps", async () => {
    await (await app("development")).initializeBang();

    expect(KeyGenerator.hashDigestClass).toBe(OpenSSL.Digest.SHA1);
  });

  it("ActiveSupport::KeyGenerator.hash_digest_class can be configured via config.active_support.key_generator_hash_digest_class", async () => {
    const application = await app("development");
    application.config.activeSupport.keyGeneratorHashDigestClass = OpenSSL.Digest.SHA256;
    await application.initializeBang();

    expect(KeyGenerator.hashDigestClass).toBe(OpenSSL.Digest.SHA256);
  });

  it("ActiveSupport.test_parallelization_threshold can be configured via config.active_support.test_parallelization_threshold", async () => {
    const application = await app("test");
    application.config.activeSupport.testParallelizationThreshold = 1234;
    await application.initializeBang();

    expect(ActiveSupport.testParallelizationThreshold).toBe(1234);
  });

  it("custom serializers should be able to set via config.active_job.custom_serializers in an initializer", async () => {
    class DummySerializer extends Serializers.ObjectSerializer {}

    const application = await app("development");
    application.config.activeJob.customSerializers.push(DummySerializer);
    await application.initializeBang();

    expect(Serializers.serializers()).toContain(DummySerializer);
  });

  it("config.active_job.verbose_enqueue_logs defaults to false in production", async () => {
    const application = await app("production");
    application.config.secretKeyBase = "secret";
    application.config.loadDefaults(LOAD_DEFAULTS_VERSION);
    await application.initializeBang();

    expect(ActiveJob.verboseEnqueueLogs()).toBeFalsy();
  });

  it("config.active_job.verbose_enqueue_logs defaults to true in development", async () => {
    await mkdir(join(appPath, "config", "environments"));
    await writeFile(
      join(appPath, "config", "environments", "development.ts"),
      `import { Trails } from "@blazetrails/trailties";
Trails.application!.configure(function () {
  this.config.activeJob.verboseEnqueueLogs = true;
});
`,
    );
    const application = await app("development");
    application.config.loadDefaults(LOAD_DEFAULTS_VERSION);
    await application.initializeBang();

    expect(ActiveJob.verboseEnqueueLogs()).toBeTruthy();
  });

  it("config.active_job.enqueue_after_transaction_commit is deprecated", async () => {
    const application = await app("production");
    application.config.secretKeyBase = "secret";
    application.config.activeJob.enqueueAfterTransactionCommit = ":always";
    await application.initializeBang();

    await assertNothingRaised(() => ActiveRecord.Base);

    expect(ActiveJob.Base.enqueueAfterTransactionCommit).toBe(true);
  });

  it("active record job queue is set", async () => {
    const application = await app("development");
    application.config.loadDefaults(LOAD_DEFAULTS_VERSION);
    await application.initializeBang();

    expect(ActiveRecord.queues()).toEqual({});
  });

  it("SQLite3Adapter.strict_strings_by_default is true by default for new apps", async () => {
    await mkdir(join(appPath, "config", "initializers"));
    await writeFile(
      join(appPath, "config", "initializers", "active_record.ts"),
      `import { Base } from "@blazetrails/activerecord";\nawait Base.establishConnection({ adapter: "sqlite3", database: ":memory:" });\n`,
    );

    const application = await app("development");
    application.config.loadDefaults(LOAD_DEFAULTS_VERSION);
    await application.initializeBang();

    expect(SQLite3Adapter.strictStringsByDefault).toBe(true);
  });

  it("SQLite3Adapter.strict_strings_by_default is false by default for upgraded apps", async () => {
    await mkdir(join(appPath, "config", "initializers"));
    await writeFile(
      join(appPath, "config", "initializers", "active_record.ts"),
      `import { Base } from "@blazetrails/activerecord";\nawait Base.establishConnection({ adapter: "sqlite3", database: ":memory:" });\n`,
    );

    await (await app("development")).initializeBang();

    expect(SQLite3Adapter.strictStringsByDefault).toBe(false);
  });

  it("SQLite3Adapter.strict_strings_by_default can be configured via config.active_record.sqlite3_adapter_strict_strings_by_default", async () => {
    await mkdir(join(appPath, "config", "initializers"));
    await writeFile(
      join(appPath, "config", "initializers", "active_record.ts"),
      `import { Base } from "@blazetrails/activerecord";\nawait Base.establishConnection({ adapter: "sqlite3", database: ":memory:" });\n`,
    );

    const application = await app("development");
    application.config.activeRecord.sqlite3AdapterStrictStringsByDefault = true;
    await application.initializeBang();

    expect(SQLite3Adapter.strictStringsByDefault).toBe(true);
  });

  it("SQLite3Adapter.strict_strings_by_default can be configured via config.active_record.sqlite3_adapter_strict_strings_by_default in an initializer", async () => {
    class Post extends ActiveRecord.Base {}
    await mkdir(join(appPath, "config", "initializers"));
    await writeFile(
      join(appPath, "config", "initializers", "new_framework_defaults_7_1.ts"),
      `import { Trails } from "@blazetrails/trailties";\nTrails.application!.config.activeRecord.sqlite3AdapterStrictStringsByDefault = true;\n`,
    );
    await writeFile(
      join(appPath, "config", "initializers", "active_record.ts"),
      `import { Base } from "@blazetrails/activerecord";\nawait Base.establishConnection({ adapter: "sqlite3", database: ":memory:" });\n`,
    );

    await (await app("development")).initializeBang();

    expect(SQLite3Adapter.strictStringsByDefault).toBe(true);

    await (await Post.leaseConnection()).createTable("posts");
    const error = await assertRaises([StandardError], {}, async () =>
      (await Post.leaseConnection()).addIndex("posts", "non_existent"),
    );

    expect(error.message).toMatch(/no such column: "?non_existent"?/);
  });
});
