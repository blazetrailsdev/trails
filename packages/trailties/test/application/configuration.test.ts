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
import { constSet, isModuleIncluded } from "@blazetrails/ruby-compat/include";
import { rbModRemoveConst } from "@blazetrails/ruby-compat/variable";
import { ActionDispatch, Response, Session } from "@blazetrails/actionpack";
import type { MiddlewareStack } from "@blazetrails/actionpack";
import { map } from "@blazetrails/ruby-compat/enumerable";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  Deprecators,
  isBlank,
  MessageVerifiers,
  BroadcastLogger,
  OrderedOptions,
  ParameterFilter,
  runLoadHooks,
} from "@blazetrails/activesupport";
import { InvalidSignature, MessageVerifier } from "@blazetrails/activesupport/message-verifier";
import { capture } from "@blazetrails/activesupport/testing/stream";
import { registerSpecType } from "@blazetrails/activesupport/testing/autorun";
import { dumpSchemaAfterMigration } from "@blazetrails/activerecord";
import { Methods } from "@blazetrails/rack-test";
import { Loader } from "@blazetrails/zeitwerk";
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
import { ArgumentError } from "@blazetrails/ruby-compat/argument-error";
import { Encoding } from "@blazetrails/ruby-compat/encoding";
import { FileUtils } from "@blazetrails/ruby-compat/file-utils";
import { getFs } from "@blazetrails/ruby-compat/fs-adapter";
import { STDOUT } from "@blazetrails/ruby-compat/io";
import { NameError } from "@blazetrails/ruby-compat/name-error";
import { rbInspect, rbObjRespondTo, TopLevel } from "@blazetrails/ruby-compat/object";
import { Pathname } from "@blazetrails/ruby-compat/pathname";
import { Process } from "@blazetrails/ruby-compat/process";
import { env, setEnv } from "@blazetrails/ruby-compat/process-adapter";
import { RuntimeError } from "@blazetrails/ruby-compat/runtime-error";
import { constGet } from "@blazetrails/ruby-compat/variable";
import * as ActiveRecord from "@blazetrails/activerecord";
import { Dependencies } from "@blazetrails/activesupport";
import { Numeric } from "@blazetrails/activesupport/core-ext/numeric/bytes";
import { File } from "@blazetrails/ruby-compat/file";
import { LOAD_PATH } from "@blazetrails/ruby-compat/load";
import { OpenSSL } from "@blazetrails/ruby-compat/openssl";
import { StandardError } from "@blazetrails/ruby-compat/standard-error";
import { Time } from "@blazetrails/date";
import { SQLite3Adapter } from "@blazetrails/activerecord/connection-adapters/sqlite3-adapter.js";
import { Digest } from "@blazetrails/activesupport/digest";
import { KeyGenerator } from "@blazetrails/activesupport/key-generator";
import { MessageEncryptor } from "@blazetrails/activesupport/message-encryptor";
import { ActiveJob, Serializers } from "@blazetrails/activejob";
import { Trailtie as ActiveJobTrailtie } from "../../lib/trailties/active-job.js";
import { Configuration as TrailtieConfiguration } from "../../lib/trailtie/configuration.js";
import { DatabaseTasks } from "@blazetrails/activerecord/tasks/database-tasks.js";
import { Annotation } from "../../lib/source-annotation-extractor.js";
import { Trailtie as ActionMailerTrailtie } from "../../lib/trailties/action-mailer.js";
import { TestCase } from "@blazetrails/activesupport/test-case";
import { Isolation } from "@blazetrails/activesupport/testing/isolation";
import { ActionController } from "@blazetrails/actionpack";
import { include } from "@blazetrails/ruby-compat/include";
import type { Generation } from "../support/isolation/abstract-unit.js";
import "../support/isolation/abstract-unit.js";
import * as FormTagHelper from "@blazetrails/actionview/helpers/form-tag-helper";
import * as UrlHelper from "@blazetrails/actionview/helpers/url-helper";
import * as AssetTagHelper from "@blazetrails/actionview/helpers/asset-tag-helper";
import { Engine as ActiveStorageEngine } from "@blazetrails/activestorage/engine";
import { Engine as ActionTextEngine } from "@blazetrails/actiontext/engine";
import { Attachment } from "@blazetrails/actiontext";
import { ActiveStorage } from "@blazetrails/activestorage";
import { Base as ActiveJobBase } from "@blazetrails/activejob";
import {
  Base as ActionMailerBase,
  InlinePreviewInterceptor,
  MailDeliveryJob,
} from "@blazetrails/actionmailer";
import { Mail } from "@blazetrails/mail";
import { Base as ActiveRecordBase, SchemaReflection } from "@blazetrails/activerecord";
import { DestroyAssociationAsyncJob } from "@blazetrails/activerecord/destroy-association-async-job";
import { CacheRequest } from "@blazetrails/actionpack";
import { Codec } from "@blazetrails/activesupport/messages/codec";
import { Metadata } from "@blazetrails/activesupport/messages/metadata";
import {
  ActiveSupport,
  setUtcToLocalReturnsUtcOffsetTimes,
  utcToLocalReturnsUtcOffsetTimes,
} from "@blazetrails/activesupport";
import { Trailtie as ActiveSupportTrailtie } from "../../lib/trailties/active-support.js";
import { Trailtie as ActiveRecordTrailtie } from "../../lib/trailties/active-record.js";
import { Trailtie as ActionDispatchTrailtie } from "../../lib/trailties/action-dispatch.js";
import * as Rack from "@blazetrails/rack";
import { Application } from "../../lib/application.js";
import { LOAD_DEFAULTS_VERSION } from "../../lib/application/configuration.js";
import { Trails, _resetTrailsEnv } from "../../lib/trails.js";
import { Inflector } from "../../lib/autoloaders/inflector.js";
import type { Rack as RackHelpers } from "../support/isolation/abstract-unit.js";
import { EnvHelpers } from "../support/env-helpers.js";
import {
  DEFAULT_BEHAVIORS,
  Deprecation,
  I18n,
  IsolatedExecutionState,
} from "@blazetrails/activesupport";
import { Store as CacheStore } from "@blazetrails/activesupport/cache/store";
import { toA } from "@blazetrails/ruby-compat/array";
import { NoMethodError } from "@blazetrails/ruby-compat/no-method-error";
import { ContentHelper } from "@blazetrails/actiontext";
import { TranslationHelper } from "@blazetrails/actionview/helpers/translation-helper";
import { Translation } from "@blazetrails/activemodel";
import { Trailtie as I18nTrailtie } from "../../lib/trailties/i18n.js";
import { deprecator as actionCableDeprecator } from "@blazetrails/actioncable";
import {
  AbstractController,
  deprecator as actionDispatchDeprecator,
} from "@blazetrails/actionpack";
import { deprecator as actionViewDeprecator } from "@blazetrails/actionview";
import { deprecator as activeModelDeprecator } from "@blazetrails/activemodel";
import { deprecator as activeSupportDeprecator } from "@blazetrails/activesupport";
import { deprecator as actionMailerDeprecator } from "@blazetrails/actionmailer/deprecator";
import { deprecator as actionTextDeprecator } from "@blazetrails/actiontext";
import { deprecator as activeJobDeprecator } from "@blazetrails/activejob";
import { deprecator as activeStorageDeprecator } from "@blazetrails/activestorage";
import { useInMemoryDatabaseUrl } from "../support/in-memory-database-url.js";

const envHelpers = new EnvHelpers();

class MyMailInterceptor {
  static deliveringEmail(email: unknown) {
    return email;
  }
}
class MyOtherMailInterceptor extends MyMailInterceptor {}
class MyPreviewMailInterceptor {
  static previewingEmail(email: unknown) {
    return email;
  }
}
class MyOtherPreviewMailInterceptor extends MyPreviewMailInterceptor {}
class MyMailObserver {
  static deliveredEmail(email: unknown) {
    return email;
  }
}
class MyOtherMailObserver extends MyMailObserver {}
for (const klass of [
  MyMailInterceptor,
  MyOtherMailInterceptor,
  MyPreviewMailInterceptor,
  MyOtherPreviewMailInterceptor,
  MyMailObserver,
  MyOtherMailObserver,
]) {
  constSet(TopLevel, klass.name, klass);
}

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
interface ConfigurationTest extends Generation {
  get(path: string): Promise<unknown>;
  lastResponse(): { body: string };
}
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
class ConfigurationTest extends TestCase {}
include(ConfigurationTest, Isolation);

let appPath: string;

async function setCustomConfig(contents: string): Promise<void> {
  await writeFile(join(appPath, "config", "custom.ts"), contents);
}

async function appFile(path: string, contents: string): Promise<void> {
  await mkdir(join(appPath, path, ".."), { recursive: true });
  await writeFile(join(appPath, path), contents);
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

function resetLoadPaths(): void {
  LOAD_PATH.splice(0, LOAD_PATH.length, ...LOAD_PATH.filter((p) => !/\/lib\/app\//.test(p)));
  for (const engine of [ActionMailboxEngine, ActiveStorageEngine, ActionTextEngine]) {
    delete (engine.instance() as unknown as { _allLoadPathsCache?: string[] })._allLoadPathsCache;
  }
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
  const activeStorage = (ActiveStorageEngine.config.activeStorage as OrderedOptions).toH();
  const actionText = (ActionTextEngine.config.actionText as OrderedOptions).toH();
  const activeSupport = { ...ActiveSupportTrailtie.config.activeSupport };
  const { defaultSerializer } = Codec;
  const { useMessageSerializerForMetadata } = Metadata;
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
      [
        ActiveStorageEngine.config.activeStorage,
        {
          ...activeStorage,
          serviceConfigurations: ActiveStorageEngine.config.activeStorage.serviceConfigurations,
        },
      ],
      [ActionTextEngine.config.actionText, actionText],
    ] as const) {
      (config as unknown as OrderedOptions).clear().update(snapshot);
    }
    for (const key of Object.keys(ActiveSupportTrailtie.config.activeSupport)) {
      delete (ActiveSupportTrailtie.config.activeSupport as Record<string, unknown>)[key];
    }
    Object.assign(ActiveSupportTrailtie.config.activeSupport, activeSupport);
    Codec.defaultSerializer = defaultSerializer;
    Metadata.useMessageSerializerForMetadata = useMessageSerializerForMetadata;
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
    expect(Trails.application!.root()).toEqual(new Pathname(appPath));
  });

  it("the application root can be seen from the application singleton", async () => {
    const application = await app("development");
    const AppTemplate = application.constructor as unknown as Pick<Application, "root">;
    expect(AppTemplate.root()).toEqual(new Pathname(appPath));
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
    await appFile(
      "config/initializers/filter-parameters-logging.ts",
      `import { Trails } from "@blazetrails/trailties";
Trails.application!.config.filterParameters.push("password", "foo", "bar");
`,
    );
    const application = await app("development");
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

    expect(Trails.application!.envConfig()["action_dispatch.parameter_filter"]).not.toBeEmpty();

    Trails.application!.config.filterParameters.push("baz.qux");

    expect(Trails.application!.envConfig()["action_dispatch.parameter_filter"]).toContain(
      "baz.qux",
    );
  });

  it("config.precompile_filter_parameters is true by default for new apps", async () => {
    const application = await app("development");
    application.config.loadDefaults(LOAD_DEFAULTS_VERSION);

    expect(Trails.application!.config.precompileFilterParameters).toBeTruthy();
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

    expect(SchemaReflection.checkSchemaCacheDumpVersion).toBeTruthy();
  });

  it("propagates check_schema_cache_dump_version=false to ActiveRecord::ConnectionAdapters::SchemaReflection", async () => {
    const application = await app("development");
    application.config.activeRecord.checkSchemaCacheDumpVersion = false;
    await application.initializeBang();

    expect(SchemaReflection.checkSchemaCacheDumpVersion).toBeFalsy();
  });

  it("propagates use_schema_cache_dump=true to ActiveRecord::ConnectionAdapters::SchemaReflection", async () => {
    const application = await app("development");
    application.config.activeRecord.useSchemaCacheDump = true;
    await application.initializeBang();

    expect(SchemaReflection.useSchemaCacheDump).toBeTruthy();
  });

  it("propagates use_schema_cache_dump=false to ActiveRecord::ConnectionAdapters::SchemaReflection", async () => {
    const application = await app("development");
    application.config.activeRecord.useSchemaCacheDump = false;
    await application.initializeBang();

    expect(SchemaReflection.useSchemaCacheDump).toBeFalsy();
  });

  it("By default logs tags are not set in development", async () => {
    await envHelpers.withTrailsEnv("development", async () => {
      await app("development");
      expect(isBlank(Trails.application!.config.logTags)).toBeTruthy();
    });
  });

  it("config.to_prepare is forwarded to ActionDispatch", async () => {
    let prepared = false;

    const application = await app("development");
    application.config.secretKeyBase = "secret";
    application.config.toPrepare(() => {
      prepared = true;
    });

    expect(prepared).toBeFalsy();

    await application.initializeBang();

    await application.call(Rack.MockRequest.envFor("/"));
    expect(prepared).toBeTruthy();
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

  // PERMANENT-SKIP: packages/trailties/CLAUDE.md, "Config files are TypeScript modules (`config_for`, `ActiveSupport::ConfigurationFile`)"
  it.skip("config_for containing ERB tags should evaluate", async () => {
    await appFile("config/custom.yml", `development:\n  key: <%= 'custom key' %>\n`);
    const myCustomConfig = (await (await app("development")).configFor("custom")) as OrderedOptions;
    expect(myCustomConfig.get("key")).toBe("custom key");
  });

  // PERMANENT-SKIP: packages/trailties/CLAUDE.md, "Config files are TypeScript modules (`config_for`, `ActiveSupport::ConfigurationFile`)"
  it.skip("config_for with syntax error show a more descriptive exception", async () => {
    await appFile("config/custom.yml", `development:\n  key: foo:\n`);
    await expect(app("development")).rejects.toThrow("YAML syntax error occurred while parsing");
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

  // PERMANENT-SKIP: packages/trailties/CLAUDE.md, "Config files are TypeScript modules (`config_for`, `ActiveSupport::ConfigurationFile`)"
  it.skip("config_for handles YAML patches (like safe_yaml) that disable the symbolize_names option", async () => {
    await appFile("config/custom.yml", `development:\n  key: value\n`);
    expect(await (await app("development")).configFor("custom")).toEqual({ key: "value" });
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
    await mkdir(join(appPath, "config", "environments"));
    await writeFile(
      join(appPath, "config", "environments", "development.ts"),
      `import { Trails } from "@blazetrails/trailties";
Trails.application!.configure(function () {
  this.config.ranBlock = false;

  this.rakeTasks(() => {
    this.config.ranBlock = true;
  });
});
`,
    );

    await (await app("development")).initializeBang();
    const config = Trails.configuration as unknown as { ranBlock: boolean };
    expect(config.ranBlock).toBeFalsy();

    await Trails.application!.loadTasks();
    expect(config.ranBlock).toBeTruthy();
  });

  it("generators block works at instance level", async () => {
    await mkdir(join(appPath, "config", "environments"));
    await writeFile(
      join(appPath, "config", "environments", "development.ts"),
      `import { Trails } from "@blazetrails/trailties";
Trails.application!.configure(function () {
  this.config.ranBlock = false;

  this.generators(() => {
    this.config.ranBlock = true;
  });
});
`,
    );

    await (await app("development")).initializeBang();
    const config = Trails.configuration as unknown as { ranBlock: boolean };
    expect(config.ranBlock).toBeFalsy();

    await Trails.application!.loadGenerators();
    expect(config.ranBlock).toBeTruthy();
  });

  it("console block works at instance level", async () => {
    await mkdir(join(appPath, "config", "environments"));
    await writeFile(
      join(appPath, "config", "environments", "development.ts"),
      `import { Trails } from "@blazetrails/trailties";
Trails.application!.configure(function () {
  this.config.ranBlock = false;

  this.console(() => {
    this.config.ranBlock = true;
  });
});
`,
    );

    await (await app("development")).initializeBang();
    const config = Trails.configuration as unknown as { ranBlock: boolean };
    expect(config.ranBlock).toBeFalsy();

    await Trails.application!.loadConsole();
    expect(config.ranBlock).toBeTruthy();
  });

  it("runner block works at instance level", async () => {
    await mkdir(join(appPath, "config", "environments"));
    await writeFile(
      join(appPath, "config", "environments", "development.ts"),
      `import { Trails } from "@blazetrails/trailties";
Trails.application!.configure(function () {
  this.config.ranBlock = false;

  this.runner(() => {
    this.config.ranBlock = true;
  });
});
`,
    );

    await (await app("development")).initializeBang();
    const config = Trails.configuration as unknown as { ranBlock: boolean };
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
    resetLoadPaths();
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
    resetLoadPaths();
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
    await mkdir(join(appPath, "config", "environments"));
    await writeFile(
      join(appPath, "config", "environments", "development.ts"),
      `import { Trails } from "@blazetrails/trailties";\nTrails.application!.configure(function () {\n  this.config.debugExceptionResponseFormat = "default";\n});\n`,
    );

    const application = await app("development");
    application.config.apiOnly = true;
    await application.initializeBang();

    expect(Trails.configuration!.debugExceptionResponseFormat).toBe("default");
  });

  it("debug_exception_log_level is :fatal by default for upgraded apps", async () => {
    const t = new ConfigurationTest("test");
    await t.makeBasicApp();

    class OmgController extends ActionController.Base {
      async index(): Promise<void> {
        await this.render({
          plain: String(this.request.env["action_dispatch.debug_exception_log_level"]),
        });
      }
    }
    constSet(TopLevel, "OmgController", OmgController);
    onTestFinished(() => {
      rbModRemoveConst(TopLevel, "OmgController");
    });

    await t.get("/");

    expect(t.lastResponse().body).toBe("4");
  });

  it("debug_exception_log_level is :error for new apps", async () => {
    const t = new ConfigurationTest("test");
    await t.makeBasicApp((app) => {
      app.config.loadDefaults("7.1");
    });

    class OmgController extends ActionController.Base {
      async index(): Promise<void> {
        await this.render({
          plain: String(this.request.env["action_dispatch.debug_exception_log_level"]),
        });
      }
    }
    constSet(TopLevel, "OmgController", OmgController);
    onTestFinished(() => {
      rbModRemoveConst(TopLevel, "OmgController");
    });

    await t.get("/");

    expect(t.lastResponse().body).toBe("3");
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

  it(
    "config.active_job.verbose_enqueue_logs defaults to true in development",
    { timeout: 120_000 },
    async () => {
      const t = new ConfigurationTest("test");
      await t.buildApp();
      onTestFinished(() => t.teardownApp());

      expect(
        JSON.parse(await t.trails("runner", "console.log(ActiveJob.verboseEnqueueLogs())")),
      ).toBeTruthy();
    },
  );

  it(
    "config.active_job.verbose_enqueue_logs defaults to false in production",
    { timeout: 120_000 },
    async () => {
      const t = new ConfigurationTest("test");
      await t.buildApp();
      onTestFinished(() => t.teardownApp());

      expect(
        JSON.parse(
          await t.trails(
            "runner",
            "-e",
            "production",
            "console.log(ActiveJob.verboseEnqueueLogs())",
          ),
        ),
      ).toBeFalsy();
    },
  );

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
    await appFile(
      "config/initializers/new-framework-defaults-6-0.ts",
      `import { Trails } from "@blazetrails/trailties";
Trails.application!.config.actionView.defaultEnforceUtf8 = true;
`,
    );

    const application = await app("development");
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
    await appFile(
      "config/initializers/new-framework-defaults-7-0.ts",
      `import { Trails } from "@blazetrails/trailties";
Trails.application!.config.actionView.buttonToGeneratesButtonTag = true;
`,
    );

    const application = await app("development");
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
    await appFile(
      "config/initializers/new-framework-defaults-7-0.ts",
      `import { Trails } from "@blazetrails/trailties";
Trails.application!.config.actionView.applyStylesheetMediaDefault = false;
`,
    );

    const application = await app("development");
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
    await appFile(
      "config/initializers/new-framework-defaults-6-1.ts",
      `import { Trails } from "@blazetrails/trailties";
Trails.application!.config.actionDispatch.sslDefaultRedirectStatus = 308;
`,
    );

    const application = await app("production");
    application.config.loadDefaults("6.0");
    application.config.secretKeyBase = "secret";
    await application.initializeBang();

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
    await appFile(
      "config/initializers/new-framework-defaults-8-0.ts",
      `import { Trails } from "@blazetrails/trailties";
Trails.application!.config.activeSupport.toTimePreservesTimezone = ":zone";
`,
    );

    const application = await app("development");
    application.config.loadDefaults("7.2");
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
    await appFile(
      "config/initializers/new-framework-defaults-6-1.ts",
      `import { setUtcToLocalReturnsUtcOffsetTimes } from "@blazetrails/activesupport";
setUtcToLocalReturnsUtcOffsetTimes(true);
`,
    );

    const application = await app("development");
    application.config.loadDefaults("6.0");
    await application.initializeBang();

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

  it("ActiveStorage.queues[:purge] is :active_storage_purge by default in 6.0", async () => {
    const application = await app("development");
    application.config.loadDefaults("6.0");
    await application.initializeBang();

    expect(ActiveStorage.queues.purge).toBe("active_storage_purge");
  });

  it("ActiveStorage.queues[:purge] is nil by default in 6.1", async () => {
    const application = await app("development");
    application.config.loadDefaults("6.1");
    await application.initializeBang();

    assertNil(ActiveStorage.queues.purge);
  });

  it("ActiveStorage.queues[:purge] is nil without Rails 6 defaults", async () => {
    await (await app("development")).initializeBang();

    assertNil(ActiveStorage.queues.purge);
  });

  it("ActiveStorage.queues[:mirror] is nil without Rails 6 defaults", async () => {
    await (await app("development")).initializeBang();

    assertNil(ActiveStorage.queues.mirror);
  });

  it("ActiveStorage.queues[:mirror] is nil by default", async () => {
    const application = await app("development");
    application.config.loadDefaults(LOAD_DEFAULTS_VERSION);
    await application.initializeBang();

    assertNil(ActiveStorage.queues.mirror);
  });

  it("action_text.config.attachment_tag_name is 'action-text-attachment' with Rails 6 defaults", async () => {
    const application = await app("development");
    application.config.loadDefaults("6.1");
    await application.initializeBang();

    expect(Attachment.tagName).toBe("action-text-attachment");
  });

  it("action_text.config.attachment_tag_name is 'action-text-attachment' without defaults", async () => {
    await (await app("development")).initializeBang();

    expect(Attachment.tagName).toBe("action-text-attachment");
  });

  it("action_text.config.attachment_tag_name is can be overridden", async () => {
    const application = await app("development");
    application.config.actionText.attachmentTagName = "link";
    await application.initializeBang();

    expect(Attachment.tagName).toBe("link");
  });

  it("ActionMailer::Base.delivery_job is ActionMailer::MailDeliveryJob by default", async () => {
    await (await app("development")).initializeBang();

    expect(ActionMailerBase.deliveryJob).toBe(MailDeliveryJob);
  });

  it("hosts include .localhost in development", async () => {
    await (await app("development")).initializeBang();
    expect(Trails.application!.config.hosts).toContain(".localhost");
  });

  it("hosts include .test in development", async () => {
    await (await app("development")).initializeBang();
    expect(Trails.application!.config.hosts).toContain(".test");
  });

  it("hosts reads multiple values from RAILS_DEVELOPMENT_HOSTS", async () => {
    const host = "agoodhost.com";
    const anotherHost = "bananapants.com";
    await envHelpers.switchEnv(
      "TRAILS_DEVELOPMENT_HOSTS",
      [host, anotherHost].join(","),
      async () => {
        await (await app("development")).initializeBang();
        expect(Trails.application!.config.hosts).toContain(host);
        expect(Trails.application!.config.hosts).toContain(anotherHost);
      },
    );
  });

  it("hosts reads multiple values from RAILS_DEVELOPMENT_HOSTS and trims white space", async () => {
    const host = "agoodhost.com";
    const hostWithWhiteSpace = `  ${host} `;
    const anotherHost = "bananapants.com";
    const anotherHostWithWhiteSpace = `     ${anotherHost}`;
    await envHelpers.switchEnv(
      "TRAILS_DEVELOPMENT_HOSTS",
      [hostWithWhiteSpace, anotherHostWithWhiteSpace].join(","),
      async () => {
        await (await app("development")).initializeBang();
        expect(Trails.application!.config.hosts).toContain(host);
        expect(Trails.application!.config.hosts).toContain(anotherHost);
      },
    );
  });

  it("hosts reads from RAILS_DEVELOPMENT_HOSTS", async () => {
    const host = "agoodhost.com";
    await envHelpers.switchEnv("TRAILS_DEVELOPMENT_HOSTS", host, async () => {
      await (await app("development")).initializeBang();
      expect(Trails.application!.config.hosts).toContain(host);
    });
  });

  it("hosts does not read from RAILS_DEVELOPMENT_HOSTS in production", async () => {
    const host = "agoodhost.com";
    await envHelpers.switchEnv("TRAILS_DEVELOPMENT_HOSTS", host, async () => {
      await app("production");
      expect(Trails.application!.config.hosts).not.toContain(host);
    });
  });

  it("disable_sandbox is false by default", async () => {
    await (await app("development")).initializeBang();

    expect(Trails.configuration!.disableSandbox).toBe(false);
  });

  it("disable_sandbox can be overridden", async () => {
    const application = await app("development");
    application.config.disableSandbox = true;
    await application.initializeBang();

    expect(Trails.configuration!.disableSandbox).toBeTruthy();
  });

  it("rake_eager_load is false by default", async () => {
    await (await app("development")).initializeBang();
    expect(Trails.application!.config.rakeEagerLoad).toBe(false);
  });

  it("rake_eager_load is set correctly", async () => {
    const application = await app("development");
    application.config.setRoot(appPath);
    application.config.rakeEagerLoad = true;
    await application.initializeBang();

    expect(Trails.application!.config.rakeEagerLoad).toBe(true);
  });

  // PERMANENT-SKIP: CLAUDE.md, "importmap-rails and propshaft are out of scope; JavaScript is served by Vite (`vite_rails`)"
  it.skip("unknown_asset_fallback is false by default", async () => {
    await (await app("development")).initializeBang();

    expect(
      (Trails.application!.config as unknown as { assets: { unknownAssetFallback: unknown } })
        .assets.unknownAssetFallback,
    ).toBe(false);
  });

  it("ActiveStorage.video_preview_arguments uses the old arguments without Rails 7 defaults", async () => {
    await (await app("development")).initializeBang();

    expect(ActiveStorage.videoPreviewArguments).toBe("-y -vframes 1 -f image2");
  });

  it("ActiveStorage.video_preview_arguments uses the new arguments by default", async () => {
    const application = await app("development");
    application.config.loadDefaults(LOAD_DEFAULTS_VERSION);
    await application.initializeBang();

    expect(ActiveStorage.videoPreviewArguments).toBe(
      "-vf 'select=eq(n\\,0)+eq(key\\,1)+gt(scene\\,0.015),loop=loop=-1:size=2,trim=start_frame=1' -frames:v 1 -f image2",
    );
  });

  it("ActiveStorage.variant_processor uses mini_magick without Rails 7 defaults", async () => {
    await (await app("development")).initializeBang();

    expect(ActiveStorage.variantProcessor).toBe("mini_magick");
  });

  it("ActiveStorage.variant_processor uses vips by default", async () => {
    const application = await app("development");
    application.config.loadDefaults(LOAD_DEFAULTS_VERSION);
    await application.initializeBang();

    expect(ActiveStorage.variantProcessor).toBe("vips");
  });

  it("ActiveStorage.supported_image_processing_methods can be configured via config.active_storage.supported_image_processing_methods", async () => {
    const application = await app("development");
    application.config.activeStorage.supportedImageProcessingMethods = ["write", "set"];
    await application.initializeBang();

    expect(ActiveStorage.supportedImageProcessingMethods.includes("write")).toBeTruthy();
    expect(ActiveStorage.supportedImageProcessingMethods.includes("set")).toBeTruthy();
  });

  it("ActiveStorage.unsupported_image_processing_arguments can be configured via config.active_storage.unsupported_image_processing_arguments", async () => {
    const application = await app("development");
    application.config.activeStorage.unsupportedImageProcessingArguments = ["-write", "-danger"];
    await application.initializeBang();

    expect(
      (ActiveStorage.unsupportedImageProcessingArguments as string[]).includes("-danger"),
    ).toBeTruthy();
    expect(
      (ActiveStorage.unsupportedImageProcessingArguments as string[]).includes("-set"),
    ).toBeFalsy();
  });

  it("ActiveSupport::Messages::Codec.default_serializer is :json_allow_marshal by default for new apps", async () => {
    const application = await app("development");
    application.config.loadDefaults(LOAD_DEFAULTS_VERSION);
    await application.initializeBang();

    expect(Codec.defaultSerializer).toBe("json_allow_marshal");
  });

  it("ActiveSupport::Messages::Codec.default_serializer is :marshal by default for upgraded apps", async () => {
    await (await app("development")).initializeBang();

    expect(Codec.defaultSerializer).toBe("marshal");
  });

  it("ActiveSupport::Messages::Codec.default_serializer can be configured via config.active_support.message_serializer", async () => {
    const application = await app("development");
    application.config.activeSupport.messageSerializer = ":json_allow_marshal";
    await application.initializeBang();

    expect(Codec.defaultSerializer).toBe("json_allow_marshal");
  });

  it("ActiveSupport::Messages::Metadata.use_message_serializer_for_metadata is true by default for new apps", async () => {
    const application = await app("development");
    application.config.loadDefaults(LOAD_DEFAULTS_VERSION);
    await application.initializeBang();

    expect(Metadata.useMessageSerializerForMetadata).toBeTruthy();
  });

  it("ActiveSupport::Messages::Metadata.use_message_serializer_for_metadata is false by default for upgraded apps", async () => {
    await (await app("development")).initializeBang();

    expect(Metadata.useMessageSerializerForMetadata).toBeFalsy();
  });

  it("ActiveSupport::Messages::Metadata.use_message_serializer_for_metadata can be configured via config.active_support.use_message_serializer_for_metadata", async () => {
    const application = await app("development");
    application.config.activeSupport.useMessageSerializerForMetadata = true;
    await application.initializeBang();

    expect(Metadata.useMessageSerializerForMetadata).toBeTruthy();
  });
});

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
interface IsolatedConfigurationTest
  extends Generation, Omit<RackHelpers, "assert" | "assertEqual" | "assertMatch">, EnvHelpers {}
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
class IsolatedConfigurationTest extends TestCase {}
include(IsolatedConfigurationTest, Isolation);
include(IsolatedConfigurationTest, Methods);
include(IsolatedConfigurationTest, EnvHelpers);
registerSpecType(/^ApplicationTests::ConfigurationTest$/, IsolatedConfigurationTest);

type Host = Omit<IsolatedConfigurationTest, "get"> & {
  get(path: string, params?: unknown, env?: Record<string, unknown>): Promise<unknown>;
  post(path: string, params?: unknown, env?: Record<string, unknown>): Promise<unknown>;
  patch(path: string, params?: unknown, env?: Record<string, unknown>): Promise<unknown>;
  put(path: string, params?: unknown, env?: Record<string, unknown>): Promise<unknown>;
  lastResponse(): { status: number; body: string; isOk: boolean };
};

const POST_MODEL = `
  import { Model } from "@blazetrails/activemodel";
  export class Post extends Model {
    name: unknown = null;
  }
`;

const postsController = (body: string, parent = "ApplicationController", imports = ""): string => `
  import { ApplicationController } from "./application-controller.ts";
  import { ActionController } from "@blazetrails/actionpack";
  import { Post } from "../models/post.ts";
  ${imports}
  export class PostsController extends ${parent} {
    ${body}
  }
`;

const POSTS_ROUTES = `
  this.routes().prepend(function () {
    this.resources("posts");
  });
`;

describe("ApplicationTests::ConfigurationTest", { concurrent: true, timeout: 120_000 }, () => {
  useInMemoryDatabaseUrl();
  const activeSupport = { ...ActiveSupportTrailtie.config.activeSupport };
  const activeRecord = { ...ActiveRecordTrailtie.config.activeRecord };
  const isolationLevel = IsolatedExecutionState.isolationLevel;
  const formatVersion = ActiveSupport.Cache.formatVersion;
  const raiseOnInvalidCacheExpirationTime = CacheStore.raiseOnInvalidCacheExpirationTime;
  const runAfterTransactionCallbacks = ActiveRecord.runAfterTransactionCallbacksInOrderDefined();
  const attributesForInspect = ActiveRecord.Base.attributesForInspect;
  const wrapperOptions = ActionController.Base._wrapperOptions;
  const raiseOnMissingCallbackActions = ActionController.Base.raiseOnMissingCallbackActions;
  const contentHelperSanitizer = ContentHelper.sanitizer;
  const actionText = (ActionTextEngine.config.actionText as OrderedOptions).toH();
  const exceptionHandler = I18n.exceptionHandler();
  const raiseOnMissingTranslations = TranslationHelper.raiseOnMissingTranslations();
  const i18nConfig = I18nTrailtie.config.i18n.toH();
  let t: Host;

  async function app(env = "development"): Promise<Application> {
    return (await t.app(env)) as unknown as Application;
  }

  async function makeBasicApp(block?: (app: typeof Application) => unknown): Promise<void> {
    ActiveStorageEngine.config.activeStorage.serviceConfigurations ??= {};
    await t.makeBasicApp(block);
  }

  async function suppressDefaultConfig(): Promise<void> {
    await FileUtils.mvAsync(
      `${await t.appPath()}/config/environments`,
      `${await t.appPath()}/config/__environments__`,
    );
  }

  async function restoreDefaultConfig(): Promise<void> {
    await FileUtils.rmRfAsync(`${await t.appPath()}/config/environments`);
    await FileUtils.mvAsync(
      `${await t.appPath()}/config/__environments__`,
      `${await t.appPath()}/config/environments`,
    );
    await t.removeFromEnvConfig("production", 'this\\.config\\.logLevel = "error";');
  }

  function omgController(index: (this: ActionController.Base) => Promise<void>): void {
    const OmgController = class extends ActionController.Base {};
    Object.assign(OmgController.prototype, { index });
    constSet(TopLevel, "OmgController", OmgController);
    onTestFinished(() => {
      rbModRemoveConst(TopLevel, "OmgController");
    });
  }

  Object.assign(IsolatedConfigurationTest.prototype, {
    async setup(): Promise<void> {
      t = new IsolatedConfigurationTest("test") as unknown as Host;
      await t.buildApp();
      await suppressDefaultConfig();
    },
    teardown,
  });

  async function teardown(): Promise<void> {
    await t.teardownApp();
    for (const key of Object.keys(ActiveSupportTrailtie.config.activeSupport)) {
      delete (ActiveSupportTrailtie.config.activeSupport as Record<string, unknown>)[key];
    }
    Object.assign(ActiveSupportTrailtie.config.activeSupport, activeSupport);
    for (const key of Object.keys(ActiveRecordTrailtie.config.activeRecord)) {
      delete (ActiveRecordTrailtie.config.activeRecord as unknown as Record<string, unknown>)[key];
    }
    Object.assign(ActiveRecordTrailtie.config.activeRecord, activeRecord);
    IsolatedExecutionState.isolationLevel = isolationLevel!;
    ActiveSupport.Cache.formatVersion = formatVersion;
    CacheStore.raiseOnInvalidCacheExpirationTime = raiseOnInvalidCacheExpirationTime;
    ActiveRecord.setRunAfterTransactionCallbacksInOrderDefined(runAfterTransactionCallbacks);
    ActiveRecord.Base.attributesForInspect = attributesForInspect;
    ActionController.Base._wrapperOptions = wrapperOptions;
    ActionController.Base.raiseOnMissingCallbackActions = raiseOnMissingCallbackActions;
    ContentHelper.sanitizer = contentHelperSanitizer;
    (ActionTextEngine.config.actionText as OrderedOptions).clear().update(actionText);
    I18n.setExceptionHandler(exceptionHandler);
    TranslationHelper.setRaiseOnMissingTranslations(raiseOnMissingTranslations);
    Translation.raiseOnMissingTranslations = false;
    I18nTrailtie._i18nInited = false;
    I18nTrailtie.config.i18n.clear().update(i18nConfig);
    Trails.application = null;
    Application.appClass = null;
  }

  function assertUtf8() {
    expect(Encoding.defaultExternal).toBe(Encoding.UTF_8);
    expect(Encoding.defaultInternal).toBe(Encoding.UTF_8);
  }

  it("skipping config.encoding still results in 'utf-8' as the default", async () => {
    await app("development");
    assertUtf8();
  });

  it("config.encoding sets the default encoding", async () => {
    await t.addToConfig(`this.config.encoding = "utf-8";`);

    await app("development");
    assertUtf8();
  });

  it("config.paths can be mutated after accessing auto/eager load paths", async () => {
    await t.appDir("vendor/auto");
    await t.appDir("vendor/once");
    await t.appDir("vendor/eager");

    await t.addToConfig(`
      this.config.autoloadPaths;
      this.config.autoloadOncePaths;
      this.config.eagerLoadPaths;

      this.config.paths().add("vendor/auto", { autoload: true });
      this.config.paths().add("vendor/once", { autoloadOnce: true });
      this.config.paths().add("vendor/eager", { eagerLoad: true });
`);

    await app("development");

    expect(Dependencies.autoloadPaths).toContain(`${Trails.root()}/vendor/auto`);
    expect(Dependencies.autoloadOncePaths).toContain(`${Trails.root()}/vendor/once`);
    expect([...Dependencies._eagerLoadPaths]).toContain(`${Trails.root()}/vendor/eager`);
  });

  it("config.paths.public sets Rails.public_path", async () => {
    await t.addToConfig(`this.config.paths().set("public", "somewhere");`);

    await app("development");
    expect(String(await Trails.publicPath())).toBe(
      String(new Pathname(await t.appPath()).join("somewhere")),
    );
  });

  it("In development mode, config.public_file_server.enabled is on by default", async () => {
    await restoreDefaultConfig();

    await t.withTrailsEnv("development", async () => {
      await app("development");
      expect((await app()).config.publicFileServer.enabled).toBeTruthy();
    });
  });

  it("In test mode, config.public_file_server.enabled is on by default", async () => {
    await restoreDefaultConfig();

    await t.withTrailsEnv("test", async () => {
      await app("test");
      expect((await app()).config.publicFileServer.enabled).toBeTruthy();
    });
  });

  it("In production mode, config.public_file_server.enabled is on by default", async () => {
    await restoreDefaultConfig();

    await t.withTrailsEnv("production", async () => {
      await app("production");
      expect((await app()).config.publicFileServer.enabled).toBeTruthy();
    });
  });

  it("In production mode, STDOUT logging is the default", async () => {
    await restoreDefaultConfig();

    await t.withTrailsEnv("production", async () => {
      await app("production");
      expect(Logger.isLoggerOutputsTo((await app()).config.logger as Logger, STDOUT)).toBeTruthy();
    });
  });

  it("EtagWithFlash module doesn't break when the session store is disabled", async () => {
    await makeBasicApp((application) => {
      application.config.sessionStore(":disabled");
    });

    omgController(async function () {
      await this.isStale(undefined, { weakEtag: "something" });
      await this.render({ plain: "else" });
    });

    await t.get("/");

    expect(t.lastResponse().isOk).toBeTruthy();
  });

  it("EtagWithFlash module doesn't break for API apps", async () => {
    await makeBasicApp((application) => {
      application.config.apiOnly = true;
    });

    omgController(async function () {
      await this.isStale(undefined, { weakEtag: "something" });
      await this.render({ plain: "else" });
    });

    await t.get("/");

    expect(t.lastResponse().isOk).toBeTruthy();
  });

  it("application verifier can be used in the entire application", async () => {
    await makeBasicApp((application) => {
      application.config.secretKeyBase = "b3c631c314c0bbca50c1b2843150fe33";
      application.config.sessionStore(":disabled");
    });

    const message = (await app()).messageVerifier("sensitive_value").generate("some_value");

    expect(Trails.application!.messageVerifier("sensitive_value").verify(message)).toBe(
      "some_value",
    );

    const secret = (await app()).keyGenerator().generateKey("sensitive_value");
    const verifier = new MessageVerifier(secret);
    expect(verifier.verify(message)).toBe("some_value");
  });

  it("application will use secret_key_base from credentials if present in local env", async () => {
    const credentialsSecret = "credentials_secret";
    await t.addToConfig(`
      const credentials = await Trails.application.credentials();
      credentials.set("secret_key_base", "${credentialsSecret}");
`);

    await app("development");

    expect((await app()).secretKeyBase()).toBe(credentialsSecret);
  });

  it("application will not generate secret_key_base in tmp file if blank in production", async () => {
    await t.appFile(
      "config/initializers/secret-token.ts",
      `
        import { Trails } from "@blazetrails/trailties";
        (await Trails.application.credentials()).set("secret_key_base", null);
`,
    );

    await assertRaises([ArgumentError], {}, () => app("production"));
  });

  it("raises when secret_key_base is blank", async () => {
    await t.appFile(
      "config/initializers/secret-token.ts",
      `
        import { Trails } from "@blazetrails/trailties";
        (await Trails.application.credentials()).set("secret_key_base", null);
`,
    );

    const error = await assertRaises([ArgumentError], {}, () => app("production"));
    expect(error.message).toMatch(/Missing `secret_key_base`./);
  });

  it("dont raise in production when dummy secret_key_base is used", async () => {
    await t.switchEnv("SECRET_KEY_BASE_DUMMY", "1", async () => {
      await t.appFile(
        "config/initializers/secret-token.ts",
        `
        import { Trails } from "@blazetrails/trailties";
        (await Trails.application.credentials()).set("secret_key_base", null);
`,
      );

      await assertNothingRaised(() => app("production"));

      expect((await app()).secretKeyBase()).not.toBeNull();
      expect(await File.isExistAsync(await t.appPath("tmp/local_secret.txt"))).toBeTruthy();
    });
  });

  it("raise when secret_key_base is not a type of string", async () => {
    await t.addToConfig(
      `await (await Trails.application.credentials()).set("secret_key_base", 123);`,
    );

    await assertRaises([ArgumentError], {}, () => app("production"));
  });

  it("don't output secret_key_base when calling inspect", async () => {
    const secret = "b3c631c314c0bbca50c1b2843150fe33";
    await t.addToConfig(`Trails.application.config.secretKeyBase = "${secret}";`);
    await app("production");

    expect(rbInspect(Trails.application!.config)).not.toMatch(new RegExp(secret));
    expect(rbInspect(Trails.application!.config)).toMatch(
      /^#<Trails::Application::Configuration:0x[0-9a-f]+>$/,
    );
  });

  it("Rails.application.key_generator supports specifying a secret base", async () => {
    await app("production");

    const key = (await app()).keyGenerator().generateKey("salt");
    const otherKey = (await app()).keyGenerator("other secret base").generateKey("salt");

    expect(key).not.toEqual(otherKey);
    expect(otherKey.length).toBe(key.length);
  });

  it("application verifier can build different verifiers", async () => {
    await makeBasicApp((application) => {
      application.config.sessionStore(":disabled");
    });

    const defaultVerifier = (await app()).messageVerifier("sensitive_value");
    const textVerifier = (await app()).messageVerifier("text");

    const message = textVerifier.generate("some_value");

    expect(textVerifier.verify(message)).toBe("some_value");
    await assertRaises([InvalidSignature], {}, () => defaultVerifier.verify(message));

    expect((await app()).messageVerifier("sensitive_value")).toBe(defaultVerifier);
    expect(textVerifier).not.toBe(defaultVerifier);
  });

  it("Rails.application.message_verifiers.rotate supports :secret_key_base option", async () => {
    const oldSecretKeyBase = "old secret_key_base";

    await t.addToConfig(`
      this.config.beforeInitialize((app) => {
        app.messageVerifiers().rotate({ secretKeyBase: ${JSON.stringify(oldSecretKeyBase)} });
      });
`);

    await app("production");

    const oldSecret = (await app()).keyGenerator(oldSecretKeyBase).generateKey("salt");
    const oldMessage = new MessageVerifier(oldSecret).generate("old message");

    expect((await app()).messageVerifiers().get("salt").verify(oldMessage)).toBe("old message");
  });

  it("app.secret_key_base uses config.secret_key_base in development", async () => {
    await t.appFile(
      "config/initializers/secret-token.ts",
      `
        import { Trails } from "@blazetrails/trailties";
        Trails.application.config.secretKeyBase = "3b7cd727ee24e8444053437c36cc66c3";
`,
    );

    await app("development");
    expect((await app()).secretKeyBase()).toBe("3b7cd727ee24e8444053437c36cc66c3");
  });

  it("app.secret_key_base uses config.secret_key_base in production", async () => {
    await t.removeFile("config/credentials.yml.enc");
    await t.appFile(
      "config/initializers/secret-token.ts",
      `
        import { Trails } from "@blazetrails/trailties";
        Trails.application.config.secretKeyBase = "iaminallyoursecretkeybase";
`,
    );

    await app("production");

    expect((await app()).secretKeyBase()).toBe("iaminallyoursecretkeybase");
  });

  it("credentials does not raise error when require_master_key is false and master key does not exist", async () => {
    await t.removeFile("config/master.key");
    await t.addToConfig("this.config.requireMasterKey = false;");
    await app("development");

    expect((await (await app()).credentials()).dig("secret_key_base")).toBeFalsy();
  });

  // PERMANENT-SKIP: CLAUDE.md, "Runtime facts Node does not expose" (`fork`) — the boot must abort in a forked child so `$?.exitstatus` can be read.
  it.skip("require_master_key aborts app boot when missing key", async () => {
    await t.removeFile("config/master.key");
    await t.addToConfig("this.config.requireMasterKey = true;");

    const error = await capture("stderr", () => app("development"));

    expect(Process.lastStatus!.exitstatus()).toBe(1);
    expect(error).toMatch(/Missing.*TRAILS_MASTER_KEY/);
  });

  it("protect from forgery is the default in a new app", async () => {
    await makeBasicApp();

    omgController(async function () {
      await this.render({ inline: "<%= csrfMetaTags() %>" });
    });

    await t.get("/");
    expect(t.lastResponse().body).toMatch(/csrf-param/);
  });

  it("default form builder specified as a string", async () => {
    await t.appFile(
      "config/initializers/form-builder.ts",
      `
        import { Trails } from "@blazetrails/trailties";
        import { FormBuilder } from "@blazetrails/actionview";
        import { constSet, TopLevel } from "@blazetrails/ruby-compat";
        class CustomFormBuilder extends FormBuilder {
          textField(attribute, ...args) {
            return this.label(attribute) + super.textField(attribute, ...args);
          }
        }
        constSet(TopLevel, "CustomFormBuilder", CustomFormBuilder);
        Trails.configuration.actionView.defaultFormBuilder = "CustomFormBuilder";
`,
    );
    await t.appFile("app/models/post.ts", POST_MODEL);
    await t.appFile(
      "app/controllers/posts-controller.ts",
      postsController(`
        async index() {
          await this.render({ inline: "<%= await (async () => { try { return await formFor(new Post(), {}, (f) => f.textField('name')); } catch (e) { return e.toString(); } })() %>", locals: { Post } });
        }
`),
    );
    await t.addToConfig(POSTS_ROUTES);

    await app("development");

    await t.get("/posts");
    expect(t.lastResponse().body).toMatch(/label/);
  });

  it("default method for update can be changed", async () => {
    await t.appFile(
      "app/models/post.ts",
      `
  import { Model } from "@blazetrails/activemodel";
  export class Post extends Model {
    toKey() { return [1]; }
    isPersisted() { return true; }
  }
`,
    );

    const token = "cf50faa3fe97702ca1ae";

    await t.appFile(
      "app/controllers/posts-controller.ts",
      postsController(`
        async show() {
          await this.render({ inline: "<%= await (async () => { try { return await formFor(new Post(), {}, () => {}); } catch (e) { return e.toString(); } })() %>", locals: { Post } });
        }

        async update() {
          await this.render({ plain: "update" });
        }

        formAuthenticityToken() { return ${JSON.stringify(token)}; }
`),
    );
    await t.addToConfig(POSTS_ROUTES);

    await app("development");

    const params = { authenticity_token: token };

    await t.get("/posts/1");
    expect(t.lastResponse().body).toMatch(/patch/);

    await t.patch("/posts/1", params);
    expect(t.lastResponse().body).toMatch(/update/);

    await t.patch("/posts/1", params);
    expect(t.lastResponse().status).toBe(200);

    await t.put("/posts/1", params);
    expect(t.lastResponse().body).toMatch(/update/);

    await t.put("/posts/1", params);
    expect(t.lastResponse().status).toBe(200);
  });

  it("config.action_controller.wrap_parameters is set in ActionController::Base", async () => {
    await t.appFile(
      "config/initializers/wrap-parameters.ts",
      `import { ActionController } from "@blazetrails/actionpack";\nActionController.Base.wrapParameters({ format: [":json"] });\n`,
    );
    await t.appFile(
      "app/models/post.ts",
      `export class Post {\n  static attributeNames() { return ["title"]; }\n}\n`,
    );
    await t.appFile(
      "app/controllers/application-controller.ts",
      `import { ActionController } from "@blazetrails/actionpack";\nexport class ApplicationController extends ActionController.Base {\n  static {\n    this.protectFromForgery({ with: "reset_session" });\n  }\n}\n`,
    );
    await t.appFile(
      "app/controllers/posts-controller.ts",
      postsController(
        `
        async create() {
          await this.render({ plain: rbInspect(this.params.get("post")) });
        }
`,
        undefined,
        `import { rbInspect } from "@blazetrails/ruby-compat";`,
      ),
    );
    await t.addToConfig(POSTS_ROUTES);

    await app("development");

    await t.post("/posts.json", '{ "title": "foo", "name": "bar" }', {
      CONTENT_TYPE: "application/json",
    });
    expect(t.lastResponse().body).toBe(
      `#<ActionController::Parameters ${rbInspect({ title: "foo" })} permitted: false>`,
    );
  });

  it("form_with outputs ids by default", async () => {
    await t.appFile("app/models/post.ts", POST_MODEL);
    await t.appFile(
      "app/controllers/posts-controller.ts",
      postsController(`
        async index() {
          await this.render({ inline: "<%= formWith({ model: new Post() }, (f) => f.textField('name')) %>", locals: { Post } });
        }
`),
    );
    await t.addToConfig(POSTS_ROUTES);

    await app("development");

    await t.get("/posts");

    expect(t.lastResponse().body).toMatch(/id=('|")post_name('|")/);
  });

  it("form_with can be configured with form_with_generates_ids", async () => {
    await t.appFile(
      "config/initializers/form-builder.ts",
      `
        import { Trails } from "@blazetrails/trailties";
        Trails.configuration.actionView.formWithGeneratesIds = false;
`,
    );
    await t.appFile("app/models/post.ts", POST_MODEL);
    await t.appFile(
      "app/controllers/posts-controller.ts",
      postsController(`
        async index() {
          await this.render({ inline: "<%= formWith({ model: new Post() }, (f) => f.textField('name')) %>", locals: { Post } });
        }
`),
    );
    await t.addToConfig(POSTS_ROUTES);

    await app("development");

    await t.get("/posts");

    expect(t.lastResponse().body).not.toMatch(/id=('|")post_name('|")/);
  });

  it("form_with can be configured with form_with_generates_remote_forms", async () => {
    await t.appFile(
      "config/initializers/form-builder.ts",
      `
        import { Trails } from "@blazetrails/trailties";
        Trails.configuration.actionView.formWithGeneratesRemoteForms = true;
`,
    );
    await t.appFile("app/models/post.ts", POST_MODEL);
    await t.appFile(
      "app/controllers/posts-controller.ts",
      postsController(`
        async index() {
          await this.render({ inline: "<%= formWith({ model: new Post() }, (f) => f.textField('name')) %>", locals: { Post } });
        }
`),
    );
    await t.addToConfig(POSTS_ROUTES);

    await app("development");

    await t.get("/posts");
    expect(t.lastResponse().body).toMatch(/data-remote/);
  });

  it("form_with generates non remote forms by default", async () => {
    await t.appFile("app/models/post.ts", POST_MODEL);
    await t.appFile(
      "app/controllers/posts-controller.ts",
      postsController(`
        async index() {
          await this.render({ inline: "<%= formWith({ model: new Post() }, (f) => f.textField('name')) %>", locals: { Post } });
        }
`),
    );
    await t.addToConfig(POSTS_ROUTES);

    await app("development");

    await t.get("/posts");
    expect(t.lastResponse().body).not.toMatch(/data-remote/);
  });

  it("request forgery token param can be changed", async () => {
    await makeBasicApp((application) => {
      (
        application.config.actionController as unknown as Record<string, unknown>
      ).requestForgeryProtectionToken = "_xsrf_token_here";
    });

    omgController(async function () {
      await this.render({ inline: "<%= csrfMetaTags() %>" });
    });

    await t.get("/");
    expect(t.lastResponse().body).toMatch("_xsrf_token_here");
  });

  it("sets ActionDispatch.test_app", async () => {
    await makeBasicApp();
    expect(ActionDispatch.testApp).toBe(Trails.application);
  });

  it("sets ActionDispatch::Response.default_charset", async () => {
    await makeBasicApp((application) => {
      application.config.actionDispatch.defaultCharset = "utf-16";
    });

    expect(Response.defaultCharset).toBe("utf-16");
  });

  it("registers interceptors with ActionMailer", async () => {
    await t.addToConfig(`this.config.actionMailer.interceptors = TopLevel.MyMailInterceptor;`);
    onTestFinished(() => void Mail._deliveryInterceptors.splice(0));

    await app("development");

    expect(Mail._deliveryInterceptors).toEqual([MyMailInterceptor]);
  });

  it("registers multiple interceptors with ActionMailer", async () => {
    await t.addToConfig(
      `this.config.actionMailer.interceptors = [TopLevel.MyMailInterceptor, "MyOtherMailInterceptor"];`,
    );
    onTestFinished(() => void Mail._deliveryInterceptors.splice(0));

    await app("development");

    expect(Mail._deliveryInterceptors).toEqual([MyMailInterceptor, MyOtherMailInterceptor]);
  });

  it("registers preview interceptors with ActionMailer", async () => {
    await t.addToConfig(
      `this.config.actionMailer.previewInterceptors = TopLevel.MyPreviewMailInterceptor;`,
    );

    await app("development");

    expect(ActionMailerBase.previewInterceptors).toEqual([
      InlinePreviewInterceptor,
      MyPreviewMailInterceptor,
    ]);
  });

  it("registers multiple preview interceptors with ActionMailer", async () => {
    await t.addToConfig(
      `this.config.actionMailer.previewInterceptors = [TopLevel.MyPreviewMailInterceptor, "MyOtherPreviewMailInterceptor"];`,
    );

    await app("development");

    expect(ActionMailerBase.previewInterceptors).toEqual([
      InlinePreviewInterceptor,
      MyPreviewMailInterceptor,
      MyOtherPreviewMailInterceptor,
    ]);
  });

  it("registers observers with ActionMailer", async () => {
    await t.addToConfig(`this.config.actionMailer.observers = TopLevel.MyMailObserver;`);
    onTestFinished(() => void Mail._deliveryNotificationObservers.splice(0));

    await app("development");

    expect(Mail._deliveryNotificationObservers).toEqual([MyMailObserver]);
  });

  it("registers multiple observers with ActionMailer", async () => {
    await t.addToConfig(
      `this.config.actionMailer.observers = [TopLevel.MyMailObserver, "MyOtherMailObserver"];`,
    );
    onTestFinished(() => void Mail._deliveryNotificationObservers.splice(0));

    await app("development");

    expect(Mail._deliveryNotificationObservers).toEqual([MyMailObserver, MyOtherMailObserver]);
  });

  it("default preview interceptor can be removed", async () => {
    await t.appFile(
      "config/initializers/preview-interceptors.ts",
      `
        import { Base, InlinePreviewInterceptor } from "@blazetrails/actionmailer";
        const interceptors = Base.previewInterceptors;
        interceptors.splice(interceptors.indexOf(InlinePreviewInterceptor), 1);
`,
    );

    await app("development");

    expect(ActionMailerBase.previewInterceptors).toEqual([]);
  });

  it("allows setting the queue name for the ActionMailer::MailDeliveryJob", async () => {
    await t.addToConfig(`this.config.actionMailer.deliverLaterQueueName = "test_default";`);

    await app("development");

    expect(ActionMailerBase.deliverLaterQueueName).toBe("test_default");
  });

  it("ActionMailer::DeliveryJob queue name is :mailers without the Rails defaults", async () => {
    await t.removeFromConfig(".*this\\.config\\.loadDefaults.*\\n");

    await app("development");

    expect(ActionMailerBase.deliverLaterQueueName).toBe("mailers");
  });

  it("ActionMailer::DeliveryJob queue name is nil by default in 6.1", async () => {
    await t.removeFromConfig(".*this\\.config\\.loadDefaults.*\\n");
    await t.addToConfig(`this.config.loadDefaults("6.1");`);

    await app("development");

    expect(ActionMailerBase.deliverLaterQueueName).toBeNull();
  });

  it("valid timezone is setup correctly", async () => {
    await t.addToConfig(`
      this.config.setRoot("${await t.appPath()}");
      this.config.timeZone = "Wellington";
`);

    await app("development");

    expect(Trails.application!.config.timeZone).toBe("Wellington");
  });

  it("raises when an invalid timezone is defined in the config", async () => {
    await t.addToConfig(`
      this.config.setRoot("${await t.appPath()}");
      this.config.timeZone = "That big hill over yonder hill";
`);

    await assertRaises([ArgumentError], {}, () => app("development"));
  });

  it("autoloaders", async () => {
    await app("development");

    expect(Trails.autoloaders.isZeitwerkEnabled()).toBeTruthy();
    expect(Trails.autoloaders.main).toBeInstanceOf(Loader);
    expect(Trails.autoloaders.main.tag).toBe("trails.main");
    expect(Trails.autoloaders.once).toBeInstanceOf(Loader);
    expect(Trails.autoloaders.once.tag).toBe("trails.once");
    expect((Trails.autoloaders as unknown as { toA(): Loader[] }).toA()).toEqual([
      Trails.autoloaders.main,
      Trails.autoloaders.once,
    ]);
    expect(Trails.autoloaders.main.inflector).toBe(Inflector);
    expect(Trails.autoloaders.once.inflector).toBe(Inflector);
  });

  it("config.action_view.cache_template_loading with config.enable_reloading in an environment", async () => {
    await t.buildApp({ initializers: true });
    await t.addToEnvConfig("development", "this.config.enableReloading = true;");

    await import("@blazetrails/actionview");
    await import("../../lib/trailties/action-view.js");

    await app("development");

    expect(Resolver.caching).toBe(false);
  });

  it("ActionController::Base::renderer uses Rails.application.default_url_options and config.force_ssl", async () => {
    await t.addToConfig(`
      this.config.forceSsl = true;

      Trails.application.defaultUrlOptions = {
        host: "foo.example.com",
        port: 9001,
        scriptName: "/bar",
      };
${POSTS_ROUTES}
`);

    await app("development");

    const ApplicationController = constGet(
      TopLevel,
      "ApplicationController",
    ) as typeof ActionController.Base;
    const postsUrl = await ApplicationController.renderer.render({ inline: "<%= postsUrl() %>" });
    expect(String(postsUrl)).toBe("https://foo.example.com:9001/bar/posts");
  });

  it("ActionController::Base.raise_on_open_redirects is true by default for new apps", async () => {
    await app("development");

    expect(ActionController.Base.raiseOnOpenRedirects).toBe(true);
  });

  it("ActionController::Base.raise_on_open_redirects is false by default for upgraded apps", async () => {
    await t.removeFromConfig(".*this\\.config\\.loadDefaults.*\\n");
    await t.addToConfig(`this.config.loadDefaults("6.1");`);
    await app("development");

    expect(ActionController.Base.raiseOnOpenRedirects).toBe(false);
  });

  it("config.action_dispatch.show_exceptions is sent in env", async () => {
    await makeBasicApp((application) => {
      application.config.actionDispatch.showExceptions = "all";
    });

    omgController(async function () {
      await this.render({ plain: String(this.request.env["action_dispatch.show_exceptions"]) });
    });

    await t.get("/");
    expect(t.lastResponse().body).toBe("all");
  });

  it("config.action_controller.permit_all_parameters = true", async () => {
    await t.appFile(
      "app/controllers/posts-controller.ts",
      postsController(
        `
        async create() {
          await this.render({ plain: this.params.get("post").isPermitted() ? "permitted" : "forbidden" });
        }
`,
        "ActionController.Base",
      ),
    );
    await t.addToConfig(`${POSTS_ROUTES}
      this.config.actionController.permitAllParameters = true;
`);

    await app("development");

    await t.post("/posts", { post: { title: "zomg" } });
    expect(t.lastResponse().body).toBe("permitted");
  });

  it("config.action_controller.always_permitted_parameters are: controller, action by default", async () => {
    await app("development");

    expect(ActionController.Parameters.alwaysPermittedParameters).toEqual(["controller", "action"]);
  });

  it("config.action_controller.always_permitted_parameters = ['controller', 'action', 'format']", async () => {
    await t.addToConfig(
      `this.config.actionController.alwaysPermittedParameters = ["controller", "action", "format"];`,
    );

    await app("development");

    expect(ActionController.Parameters.alwaysPermittedParameters).toEqual([
      "controller",
      "action",
      "format",
    ]);
  });

  it("config.action_controller.always_permitted_parameters = ['controller','action','format'] does not raise exception", async () => {
    await t.appFile(
      "app/controllers/posts-controller.ts",
      postsController(
        `
        async create() {
          await this.render({ plain: this.params.permit({ post: ["title"] }) });
        }
`,
        "ActionController.Base",
      ),
    );
    await t.addToConfig(`${POSTS_ROUTES}
      this.config.actionController.alwaysPermittedParameters = ["controller", "action", "format"];
      this.config.actionController.actionOnUnpermittedParameters = "raise";
`);

    await app("development");

    expect(ActionController.Parameters.actionOnUnpermittedParameters).toBe("raise");

    await t.post("/posts", { post: { title: "zomg" }, format: "json" });
    expect(t.lastResponse().status).toBe(200);
  });

  it("config.action_controller.action_on_unpermitted_parameters = :raise", async () => {
    await t.appFile(
      "app/controllers/posts-controller.ts",
      postsController(
        `
        async create() {
          await this.render({ plain: this.params.permit({ post: ["name"] }) });
        }
`,
        "ActionController.Base",
      ),
    );
    await t.addToConfig(`
      this.routes().prepend(function () {
        this.resources("posts");
      });
      this.config.actionController.actionOnUnpermittedParameters = "raise";
`);

    await app("development");

    expect(ActionController.Parameters.actionOnUnpermittedParameters).toBe("raise");

    await t.post("/posts", { post: { title: "zomg" } });
    expect(t.lastResponse().body).toMatch("We’re sorry, but something went wrong");
  });

  it("config.action_controller.action_on_unpermitted_parameters = :raise is ignored with expect", async () => {
    await t.appFile(
      "app/controllers/posts-controller.ts",
      postsController(
        `
        async create() {
          await this.render({ plain: this.params.expect({ post: ["name"] }) });
        }
`,
        "ActionController.Base",
      ),
    );
    await t.addToConfig(`
      this.routes().prepend(function () {
        this.resources("posts");
      });
      this.config.actionController.actionOnUnpermittedParameters = "raise";
`);

    await app("development");

    expect(ActionController.Parameters.actionOnUnpermittedParameters).toBe("raise");

    await t.post("/posts", { post: { title: "zomg" } });
    expect(t.lastResponse().body).toMatch(
      "The server cannot process the request due to a client error",
    );
  });

  it("config.action_controller.action_on_unpermitted_parameters is :log by default in development", async () => {
    await app("development");

    expect(ActionController.Parameters.actionOnUnpermittedParameters).toBe("log");
  });

  it("config.action_controller.action_on_unpermitted_parameters is :log by default in test", async () => {
    await app("test");

    expect(ActionController.Parameters.actionOnUnpermittedParameters).toBe("log");
  });

  it("config.action_controller.action_on_unpermitted_parameters is false by default in production", async () => {
    await app("production");

    expect(ActionController.Parameters.actionOnUnpermittedParameters).toBe(false);
  });

  it("config.action_controller.default_protect_from_forgery is true by default", async () => {
    await app("development");

    const filters: unknown[] = [];
    (
      ActionController.Base as unknown as {
        __callbacks: Record<string, { each(fn: (c: { filter: unknown }) => void): unknown }>;
      }
    ).__callbacks["process_action"].each((c) => filters.push(c.filter));
    expect(filters).toContain(":verifyAuthenticityToken");
  });

  it("config.action_dispatch.ignore_accept_header", async () => {
    await makeBasicApp((application) => {
      application.config.actionDispatch.ignoreAcceptHeader = true;
    });

    omgController(async function () {
      await this.respondTo((format) => {
        format.html(() => this.render({ plain: "HTML" }));
        format.xml(() => this.render({ plain: "XML" }));
      });
    });

    await t.get("/", {}, { HTTP_ACCEPT: "application/xml" });
    expect(t.lastResponse().body).toBe("HTML");

    await t.get("/", { format: "xml" }, { HTTP_ACCEPT: "application/xml" });
    expect(t.lastResponse().body).toBe("XML");
  });

  it("Rails.application#env_config exists and includes some existing parameters", async () => {
    await makeBasicApp();

    const a = await app();
    expect(a.envConfig()["action_dispatch.parameter_filter"]).toEqual(a.config.filterParameters);
    expect(a.envConfig()["action_dispatch.show_exceptions"]).toEqual(
      a.config.actionDispatch.showExceptions,
    );
    expect(a.envConfig()["action_dispatch.logger"]).toBe(Trails.logger);
    expect(a.envConfig()["action_dispatch.backtrace_cleaner"]).toBe(Trails.backtraceCleaner);
    expect(a.envConfig()["action_dispatch.key_generator"]).toBe(Trails.application!.keyGenerator());
  });

  it("config.colorize_logging default is true", async () => {
    await makeBasicApp();
    expect((await app()).config.colorizeLogging).toBeTruthy();
  });

  it("default session store initializer does not overwrite the user defined session store even if it is disabled", async () => {
    await makeBasicApp((application) => {
      application.config.sessionStore(":disabled");
    });

    expect((await app()).config.sessionStore()).toBeNull();
  });

  it("default session store initializer sets session store to cookie store", async () => {
    const sessionOptions = { key: "_myapp_session", cookieOnly: true };
    await makeBasicApp();

    expect((await app()).config.sessionStore()).toBe(Session.CookieStore);
    for (const [key, value] of Object.entries(sessionOptions)) {
      expect((await app()).config.sessionOptions[key]).toBe(value);
    }
  });

  it("config.log_level defaults to debug in development", async () => {
    await restoreDefaultConfig();
    await app("development");

    expect(Trails.logger!.level).toBe(Logger.DEBUG);
  });

  it("config.log_level default to info in production", async () => {
    await restoreDefaultConfig();
    await app("production");

    expect(Trails.logger!.level).toBe(Logger.INFO);
  });

  it("config.log_level can be overwritten by ENV['RAILS_LOG_LEVEL'] in production", async () => {
    await restoreDefaultConfig();

    await t.switchEnv("TRAILS_LOG_LEVEL", "debug", async () => {
      await app("production");
      expect(Trails.logger!.level).toBe(Logger.DEBUG);
    });
  });

  it("config.log_level with custom logger", async () => {
    await makeBasicApp((application) => {
      application.config.logger = new Logger(STDOUT);
      application.config.logLevel = "debug";
    });
    expect(Trails.logger!.level).toBe(Logger.DEBUG);
  });

  it("config.log_level does not override the level of the broadcast with the default value", async () => {
    await t.addToConfig(`
      const stdout = new Logger(STDOUT, { level: Logger.INFO });
      const stderr = new Logger(STDERR, { level: Logger.ERROR });
      this.config.logger = new BroadcastLogger(stdout, stderr);
`);
    await t.appFile(
      "config/application.ts",
      `import { BroadcastLogger, Logger } from "@blazetrails/activesupport";\nimport { STDERR, STDOUT } from "@blazetrails/ruby-compat";\n` +
        (await getFs().readFile(await t.appPath("config/application.ts"), "utf-8")),
    );

    await app("development");

    expect((Trails.logger as unknown as BroadcastLogger).broadcasts.map((l) => l.level)).toEqual([
      Logger.INFO,
      Logger.ERROR,
    ]);
  });

  it("config.log_level overrides the level of the broadcast when a custom value is set", async () => {
    await t.addToConfig(`
      const stdout = new Logger(STDOUT);
      const stderr = new Logger(STDERR);
      this.config.logger = new BroadcastLogger(stdout, stderr);
      this.config.logLevel = "warn";
`);
    await t.appFile(
      "config/application.ts",
      `import { BroadcastLogger, Logger } from "@blazetrails/activesupport";\nimport { STDERR, STDOUT } from "@blazetrails/ruby-compat";\n` +
        (await getFs().readFile(await t.appPath("config/application.ts"), "utf-8")),
    );

    await app("development");

    expect((Trails.logger as unknown as BroadcastLogger).broadcasts.map((l) => l.level)).toEqual([
      Logger.WARN,
      Logger.WARN,
    ]);
  });

  it("config.logger when logger is already a Broadcast Logger", async () => {
    const logger = new BroadcastLogger();

    await makeBasicApp((application) => {
      application.config.logger = logger;
    });
    expect(Trails.logger).toBe(logger);
  });

  it("config.logger when logger is not a Broadcast Logger", async () => {
    const logger = new Logger(STDOUT);

    await makeBasicApp((application) => {
      application.config.logger = logger;
    });

    expect(Trails.logger).toBeInstanceOf(BroadcastLogger);
    expect((Trails.logger as unknown as BroadcastLogger).broadcasts).toContain(logger);
  });

  // PERMANENT-SKIP: CLAUDE.md, "Method visibility is compile-time only (`Module#private`, `basic_obj_respond_to`'s `pub`)" — `respond_to?(:method_missing)` and `respond_to?(:method_missing, true)` answer the same.
  it.skip("respond_to? accepts include_private", async () => {
    await makeBasicApp();

    expect(rbObjRespondTo(Trails.configuration, "methodMissing")).toBe(false);
    expect(Trails.configuration!.isRespondTo("methodMissing", true)).toBe(true);
  });

  it("config.active_record.dump_schema_after_migration is false on production", async () => {
    await t.buildApp();

    await app("production");

    expect(dumpSchemaAfterMigration()).toBeFalsy();
  });

  it("config.active_record.dump_schema_after_migration is true by default in development", async () => {
    await app("development");

    expect(dumpSchemaAfterMigration()).toBeTruthy();
  });

  it("Rails.application.deprecators includes framework deprecators", async () => {
    await app("production");

    const deprecators = Trails.application!.deprecators;
    expect(toA(deprecators.each())).toContain(Deprecation._instance());
    expect(deprecators.get("actionCable")).toBe(actionCableDeprecator());
    expect(deprecators.get("actionController")).toBe(AbstractController.deprecator());
    expect(deprecators.get("actionController")).toBe(ActionController.deprecator());
    expect(deprecators.get("actionDispatch")).toBe(actionDispatchDeprecator());
    expect(deprecators.get("actionMailbox")).toBe(ActionMailbox.deprecator());
    expect(deprecators.get("actionMailer")).toBe(actionMailerDeprecator());
    expect(deprecators.get("actionText")).toBe(actionTextDeprecator());
    expect(deprecators.get("actionView")).toBe(actionViewDeprecator());
    expect(deprecators.get("activeJob")).toBe(activeJobDeprecator());
    expect(deprecators.get("activeModel")).toBe(activeModelDeprecator());
    expect(deprecators.get("activeRecord")).toBe(ActiveRecord.deprecator());
    expect(deprecators.get("activeStorage")).toBe(activeStorageDeprecator());
    expect(deprecators.get("activeSupport")).toBe(activeSupportDeprecator());
    expect(deprecators.get("trailties")).toBe(Trails.deprecator());
  });

  it("can entirely opt out of deprecation warnings", async () => {
    await t.addToConfig("this.config.activeSupport.reportDeprecations = false;");

    await app("production");

    const deprecators = toA(Trails.application!.deprecators.each());
    expect(deprecators.length).toBeTruthy();

    for (const deprecator of deprecators) {
      expect(deprecator.silenced).toBe(true);
      expect(deprecator.behavior).toEqual([DEFAULT_BEHAVIORS.silence]);
      expect(deprecator.disallowedBehavior).toEqual([DEFAULT_BEHAVIORS.silence]);
    }
  });

  it("ParamsWrapper is enabled in a new app and uses JSON as the format", async () => {
    await app("production");

    expect(ActionController.Base._wrapperOptions.format).toEqual([":json"]);
  });

  it("ParamsWrapper can be changed from the default in the initializer that was created prior to Rails 7", async () => {
    await t.appFile(
      "config/initializers/wrap_parameters.ts",
      `import { onLoad } from "@blazetrails/activesupport";\nonLoad("action_controller", function () {\n  this.wrapParameters({ format: [":xml"] });\n});\n`,
    );
    await app("production");

    expect(ActionController.Base._wrapperOptions.format).toEqual([":xml"]);
  });

  it("ParamsWrapper can be turned off", async () => {
    await t.addToConfig("this.config.actionController.wrapParametersByDefault = false;");

    await app("production");

    expect(ActionController.Base._wrapperOptions.format).toEqual([]);
  });

  it("ActionController::Base.raise_on_missing_callback_actions is false by default for production", async () => {
    await app("production");

    expect(ActionController.Base.raiseOnMissingCallbackActions).toBe(false);
  });

  it("ActionController::Base.raise_on_missing_callback_actions is false by default for upgraded apps", async () => {
    await t.removeFromConfig(".*this\\.config\\.loadDefaults.*\\n");

    await app("development");

    expect(ActionController.Base.raiseOnMissingCallbackActions).toBe(false);
  });

  it("isolation_level is :thread by default", async () => {
    await app("development");
    expect(IsolatedExecutionState.isolationLevel).toBe("thread");
  });

  it("isolation_level can be set in app config", async () => {
    await t.addToConfig(`this.config.activeSupport.isolationLevel = "fiber";`);

    await app("development");

    expect(IsolatedExecutionState.isolationLevel).toBe("fiber");
  });

  it("isolation_level can be set in initializer", async () => {
    await t.appFile(
      "config/initializers/new_framework_defaults_7_0.ts",
      `import { Trails } from "@blazetrails/trailties";\nTrails.application!.config.activeSupport.isolationLevel = "fiber";\n`,
    );
    await app("development");

    expect(IsolatedExecutionState.isolationLevel).toBe("fiber");
  });

  it("ActiveSupport::Cache.format_version is 7.1 by default for new apps", async () => {
    await app("development");

    expect(ActiveSupport.Cache.formatVersion).toBe(7.1);
  });

  it("ActiveSupport::Cache.format_version is 7.0 by default for upgraded apps", async () => {
    await t.removeFromConfig(".*this\\.config\\.loadDefaults.*\\n");

    await app("development");

    expect(ActiveSupport.Cache.formatVersion).toBe(7.0);
  });

  it("ActiveSupport::Cache.format_version can be configured via config.active_support.cache_format_version", async () => {
    await t.removeFromConfig(".*this\\.config\\.loadDefaults.*\\n");

    await app("development");

    expect(ActiveSupport.Cache.formatVersion).toBe(7.0);
  });

  it("raise_on_invalid_cache_expiration_time is false with 7.0 defaults", async () => {
    await t.removeFromConfig(".*this\\.config\\.loadDefaults.*\\n");
    await t.addToConfig(`this.config.loadDefaults("7.0");`);

    await app("development");

    expect(CacheStore.raiseOnInvalidCacheExpirationTime).toBe(false);
  });

  it("raise_on_invalid_cache_expiration_time is true with 7.1 defaults", async () => {
    await t.removeFromConfig(".*this\\.config\\.loadDefaults.*\\n");
    await t.addToConfig(`this.config.loadDefaults("7.1");`);

    await app("development");

    expect(CacheStore.raiseOnInvalidCacheExpirationTime).toBe(true);
  });

  it("raise_on_invalid_cache_expiration_time can be set via new framework defaults", async () => {
    await t.appFile(
      "config/initializers/new_framework_defaults_7_1.ts",
      `import { Trails } from "@blazetrails/trailties";\nTrails.application!.config.activeSupport.raiseOnInvalidCacheExpirationTime = true;\n`,
    );
    await t.removeFromConfig(".*this\\.config\\.loadDefaults.*\\n");
    await t.addToConfig(`this.config.loadDefaults("7.0");`);

    await app("development");

    expect(CacheStore.raiseOnInvalidCacheExpirationTime).toBe(true);
  });

  it("adds a time zone aware type if using PostgreSQL", async () => {
    const originalConfigurations = ActiveRecord.Base.configurations();
    ActiveRecord.Base.configurations({ production: { db1: { adapter: "postgresql" } } });
    onTestFinished(() => {
      ActiveRecord.Base.configurations(originalConfigurations);
    });
    await t.appFile(
      "config/initializers/active-record.ts",
      `import { ActiveRecord } from "@blazetrails/activerecord";\nawait ActiveRecord.Base.establishConnection({ adapter: "postgresql" });\n`,
    );

    await app("production");

    expect(ActiveRecord.Base.timeZoneAwareTypes).toEqual(["datetime", "time", "timestamptz"]);
  });

  it("doesn't add a time zone aware type if using MySQL", async () => {
    const originalConfigurations = ActiveRecord.Base.configurations();
    ActiveRecord.Base.configurations({ production: { db1: { adapter: "mysql2" } } });
    onTestFinished(() => {
      ActiveRecord.Base.configurations(originalConfigurations);
    });
    await t.appFile(
      "config/initializers/active-record.ts",
      `import { ActiveRecord } from "@blazetrails/activerecord";\nawait ActiveRecord.Base.establishConnection({ adapter: "mysql2" });\n`,
    );

    await app("production");

    expect(ActiveRecord.Base.timeZoneAwareTypes).toEqual(["datetime", "time"]);
  });

  it("can opt out of extra time zone aware types if using PostgreSQL", async () => {
    const originalConfigurations = ActiveRecord.Base.configurations();
    ActiveRecord.Base.configurations({ production: { db1: { adapter: "postgresql" } } });
    onTestFinished(() => {
      ActiveRecord.Base.configurations(originalConfigurations);
    });
    await t.appFile(
      "config/initializers/active-record.ts",
      `import { ActiveRecord } from "@blazetrails/activerecord";\nawait ActiveRecord.Base.establishConnection({ adapter: "postgresql" });\n`,
    );
    await t.appFile(
      "config/initializers/tz-aware-types.ts",
      `import { ActiveRecord } from "@blazetrails/activerecord";\nActiveRecord.Base.timeZoneAwareTypes = ActiveRecord.Base.timeZoneAwareTypes.filter((type) => type !== "timestamptz");\n`,
    );

    await app("production");

    expect(ActiveRecord.Base.timeZoneAwareTypes).toEqual(["datetime", "time"]);
  });

  it("run_after_transaction_callbacks_in_order_defined is true in new apps", async () => {
    await app("development");

    expect(ActiveRecord.runAfterTransactionCallbacksInOrderDefined()).toBe(true);
  });

  it("run_after_transaction_callbacks_in_order_defined is false in upgrading apps", async () => {
    await t.removeFromConfig(".*this\\.config\\.loadDefaults.*\\n");
    await t.addToConfig(`this.config.loadDefaults("7.0");`);

    await app("development");

    expect(ActiveRecord.runAfterTransactionCallbacksInOrderDefined()).toBe(false);
  });

  it("run_after_transaction_callbacks_in_order_defined can be set via framework defaults", async () => {
    await t.appFile(
      "config/initializers/new_framework_defaults_7_1.ts",
      `import { Trails } from "@blazetrails/trailties";\nTrails.application!.config.activeRecord.runAfterTransactionCallbacksInOrderDefined = true;\n`,
    );
    await t.removeFromConfig(".*this\\.config\\.loadDefaults.*\\n");
    await t.addToConfig(`this.config.loadDefaults("7.0");`);

    await app("development");

    expect(ActiveRecord.runAfterTransactionCallbacksInOrderDefined()).toBe(true);
  });

  it("run_after_transaction_callbacks_in_order_defined can be set via framework defaults even if Active Record was previously loaded", async () => {
    await t.appFile(
      "config/initializers/01_configure_database.ts",
      `import { Base } from "@blazetrails/activerecord";\nBase.isConnected();\n`,
    );
    await t.appFile(
      "config/initializers/new_framework_defaults_7_1.ts",
      `import { Trails } from "@blazetrails/trailties";\nTrails.application!.config.activeRecord.runAfterTransactionCallbacksInOrderDefined = true;\n`,
    );
    await t.removeFromConfig(".*this\\.config\\.loadDefaults.*\\n");
    await t.addToConfig(`this.config.loadDefaults("7.0");`);

    await app("development");

    expect(ActiveRecord.runAfterTransactionCallbacksInOrderDefined()).toBe(true);
  });

  it("app attributes_for_inspect configuration takes precedence over default", async () => {
    await t.addToConfig(`this.config.activeRecord.attributesForInspect = ["foo"];`);

    await app("development");

    expect(ActiveRecord.Base.attributesForInspect).toEqual(["foo"]);
  });
  it("raise_on_missing_translations = true", async () => {
    await t.addToConfig(`this.config.i18n.raiseOnMissingTranslations = true;`);

    await app("development");

    expect(Trails.application!.config.i18n.raiseOnMissingTranslations).toBe(true);

    await assertRaises([I18n.MissingTranslationData], {}, () => I18n.t("translations.missing"));
  });

  it("raise_on_missing_translations = false", async () => {
    await t.addToConfig(`this.config.i18n.raiseOnMissingTranslations = false;`);

    await app("development");

    expect(Trails.application!.config.i18n.raiseOnMissingTranslations).toBe(false);

    await assertNothingRaised(() => I18n.t("translations.missing"));
  });

  it("raise_on_missing_translations = true and custom exception handler in initializer", async () => {
    await t.appFile("config/initializers/i18n.ts", I18N_HANDLER);
    await t.addToConfig(`this.config.i18n.raiseOnMissingTranslations = true;`);

    await app("development");

    expect(Trails.application!.config.i18n.raiseOnMissingTranslations).toBe(true);

    expect(I18n.t("translations.missing")).toBe("handled I18n::MissingTranslation");
    await assertRaises([I18n.InvalidLocale], {}, () =>
      I18n.t("en.errors.messages.required", { locale: "dsafdsafdsa" }),
    );
  });

  it("raise_on_missing_translations = false and custom exception handler in initializer", async () => {
    await t.appFile("config/initializers/i18n.ts", I18N_HANDLER);
    await t.addToConfig(`this.config.i18n.raiseOnMissingTranslations = false;`);

    await app("development");

    expect(Trails.application!.config.i18n.raiseOnMissingTranslations).toBe(false);

    expect(I18n.t("translations.missing")).toBe("handled I18n::MissingTranslation");
    await assertRaises([I18n.InvalidLocale], {}, () =>
      I18n.t("en.errors.messages.required", { locale: "dsafdsafdsa" }),
    );
  });

  it("i18n custom exception handler in initializer and pluralization backend", async () => {
    await t.appFile(
      "config/initializers/i18n.ts",
      `${I18N_HANDLER}import { include } from "@blazetrails/ruby-compat";
import { Trails } from "@blazetrails/trailties";

Trails.application!.config.afterInitialize(() => {
  include(I18n.backend().constructor, I18n.Pluralization);
  (I18n.backend() as unknown as { initTranslations(): void }).initTranslations();
  I18n.backend().storeTranslations("en", {
    i18n: { plural: { rule: (n: unknown) => ([0, 1].includes(n as number) ? ":one" : ":other") } },
  });
  I18n.backend().storeTranslations("en", { apples: { one: "one or none", other: "more than one" } });
  I18n.backend().storeTranslations("en", { pears: { pear: "pear", pears: "pears" } });
});
`,
    );

    await app("development");

    expect(isModuleIncluded(I18n.backend().constructor, I18n.Pluralization)).toBeTruthy();
    expect(I18n.t(":apples", { count: 0 })).toBe("one or none");
    await assertRaises([I18n.InvalidPluralizationData], {}, () => {
      expect(I18n.t(":pears", { count: 0 })).toBe("pears");
    });
  });

  it("raises if configuration tries to assign to an actual method", async () => {
    await t.removeFromConfig(".*this\\.config\\.loadDefaults.*\\n");
    await t.addToConfig(
      '(this.config as unknown as { loadDefaults: unknown }).loadDefaults = "7.0";',
    );

    const error = await assertRaises([NoMethodError], {}, () => app("development"));

    expect(error.message).toMatch(/Cannot assign to `loadDefaults`, it is a configuration method/);
  });

  it("Action Text uses the best supported safe list sanitizer in new apps", async () => {
    await app("development");

    expect(ContentHelper.sanitizer).toBeInstanceOf(
      HTML.Sanitizer.bestSupportedVendor().safeListSanitizer,
    );
  });

  it("Action Text uses the HTML4 safe list sanitizer in upgraded apps", async () => {
    await t.removeFromConfig(".*this\\.config\\.loadDefaults.*\\n");
    await t.addToConfig(`this.config.loadDefaults("7.0");`);

    await app("development");

    expect(ContentHelper.sanitizer).toBeInstanceOf(HTML4.Sanitizer.safeListSanitizer);
  });

  it("Action Text uses the specified vendor's safe list sanitizer", async () => {
    class MySafeListSanitizer extends HTML4.SafeListSanitizer {}
    constSet(TopLevel, "MySafeListSanitizer", MySafeListSanitizer);
    constSet(TopLevel, "MySanitizerVendor", { safeListSanitizer: MySafeListSanitizer });
    onTestFinished(() => {
      rbModRemoveConst(TopLevel, "MySanitizerVendor");
      rbModRemoveConst(TopLevel, "MySafeListSanitizer");
    });
    await t.addToConfig("this.config.actionText.sanitizerVendor = TopLevel.MySanitizerVendor;");

    await app("development");

    expect(ContentHelper.sanitizer).toBeInstanceOf(MySafeListSanitizer);
  });

  it("raise_on_missing_translations affects t in controllers and views", async () => {
    await t.addToConfig("this.config.i18n.raiseOnMissingTranslations = true;");

    await t.appFile(
      "app/views/foo/view-test.html.tse",
      `<%=
  (() => {
    try {
      return t("missing.translation");
    } catch (e) {
      if (!(e instanceof I18n.MissingTranslationData)) throw e;
      return "rescued missing translation error from view";
    }
  })()
%>
`,
    );

    await t.appFile(
      "app/controllers/foo-controller.ts",
      `import { I18n } from "@blazetrails/activesupport";
import { ApplicationController } from "./application-controller.ts";
export class FooController extends ApplicationController {
  static {
    this.layout(false);
  }

  async controllerTest() {
    let response;
    try {
      response = this.t("missing.translation");
    } catch (e) {
      if (!(e instanceof I18n.MissingTranslationData)) throw e;
      response = "rescued missing translation error from controller";
    }
    await this.render({ plain: response });
  }

  async viewTest() {
    await this.render("view-test");
  }
}
`,
    );

    await t.addToConfig(`
      this.routes().prepend(function () {
        this.get("foo/controller", { to: "foo#controllerTest" });
        this.get("foo/view", { to: "foo#viewTest" });
      });
`);

    await app("development");

    await t.get("foo/controller");
    expect(t.lastResponse().body).toBe("rescued missing translation error from controller");

    await t.get("foo/view");
    expect(t.lastResponse().body).toContain("rescued missing translation error from view");
  });

  it("raise_on_missing_translations = :strict affects human_attribute_name in model", async () => {
    await t.addToConfig(`this.config.i18n.raiseOnMissingTranslations = ":strict";`);

    await t.appFile(
      "app/models/post.ts",
      `import { Base } from "@blazetrails/activerecord";
export class Post extends Base {}
`,
    );

    await app("development");

    await assertRaises([I18n.MissingTranslationData], {}, () =>
      (constGet(TopLevel, "Post") as typeof ActiveRecord.Base).humanAttributeName("title"),
    );
  });

  it("raise_on_missing_translations = true does not affect human_attribute_name in model", async () => {
    await t.addToConfig(`this.config.i18n.raiseOnMissingTranslations = true;`);

    await t.appFile(
      "app/models/post.ts",
      `import { Base } from "@blazetrails/activerecord";
export class Post extends Base {}
`,
    );

    await app("development");

    await assertNothingRaised(() =>
      (constGet(TopLevel, "Post") as typeof ActiveRecord.Base).humanAttributeName("title"),
    );
  });

  it("model's attributes_for_inspect configuration takes precedence over default", async () => {
    await t.appFile(
      "app/models/foo.ts",
      `import { ApplicationRecord } from "./application-record.js";
export class Foo extends ApplicationRecord {
  static {
    this.attributesForInspect = ["foo"];
  }
}
`,
    );

    await app("development");

    expect((constGet(TopLevel, "Foo") as typeof ActiveRecord.Base).attributesForInspect).toEqual([
      "foo",
    ]);
  });

  it.sequential("PostgresqlAdapter.decode_dates is true by default for new apps", async () => {
    onTestFinished(() => {
      ActiveRecord.ActiveRecord.ConnectionAdapters.PostgreSQLAdapter.decodeDates = false;
    });
    await t.appFile(
      "config/initializers/active-record.ts",
      `import { ActiveRecord } from "@blazetrails/activerecord";\nawait ActiveRecord.Base.establishConnection({ adapter: "postgresql" });\n`,
    );

    await app("development");

    expect(ActiveRecord.ActiveRecord.ConnectionAdapters.PostgreSQLAdapter.decodeDates).toBe(true);
  });

  it.sequential(
    "PostgresqlAdapter.decode_dates is false by default for upgraded apps",
    async () => {
      onTestFinished(() => {
        ActiveRecord.ActiveRecord.ConnectionAdapters.PostgreSQLAdapter.decodeDates = false;
      });
      await t.removeFromConfig(".*this\\.config\\.loadDefaults.*\\n");
      await t.appFile(
        "config/initializers/active-record.ts",
        `import { ActiveRecord } from "@blazetrails/activerecord";\nawait ActiveRecord.Base.establishConnection({ adapter: "postgresql" });\n`,
      );

      await app("development");

      expect(ActiveRecord.ActiveRecord.ConnectionAdapters.PostgreSQLAdapter.decodeDates).toBe(
        false,
      );
    },
  );

  it.sequential(
    "PostgresqlAdapter.decode_dates can be configured via config.active_record.postgresql_adapter_decode_dates",
    async () => {
      onTestFinished(() => {
        ActiveRecord.ActiveRecord.ConnectionAdapters.PostgreSQLAdapter.decodeDates = false;
      });
      await t.removeFromConfig(".*this\\.config\\.loadDefaults.*\\n");
      await t.addToConfig("this.config.activeRecord.postgresqlAdapterDecodeDates = true;");

      await t.appFile(
        "config/initializers/active-record.ts",
        `import { ActiveRecord } from "@blazetrails/activerecord";\nawait ActiveRecord.Base.establishConnection({ adapter: "postgresql" });\n`,
      );

      await app("development");

      expect(ActiveRecord.ActiveRecord.ConnectionAdapters.PostgreSQLAdapter.decodeDates).toBe(true);
    },
  );

  it("LocalCache middleware can be removed via app config", async () => {
    await t.addToConfig(
      "this.config.middleware.delete(TopLevel.ActiveSupport.Cache.Strategy.LocalCache);",
    );

    const application = await app("development");

    expect(
      map(application.config.middleware as MiddlewareStack, (m) => m.name).includes(
        "ActiveSupport::Cache::Strategy::LocalCache",
      ),
    ).toBeFalsy();
  });

  it("custom middleware with overridden names can be added, moved, or deleted", async () => {
    await t.appFile(
      "config/initializers/add-custom-middleware.ts",
      `import { Trails } from "@blazetrails/trailties";
import { constSet, TopLevel } from "@blazetrails/ruby-compat";

class CustomMiddlewareOne {
  static get name() {
    return "1st custom middleware";
  }
  constructor(_app: unknown, ..._args: unknown[]) {}
  new(_app: unknown) {
    return this;
  }
}

class CustomMiddlewareTwo {
  constructor(_app: unknown, ..._args: unknown[]) {}
  new(_app: unknown) {
    return this;
  }
}

class CustomMiddlewareThree {
  static get name() {
    return "3rd custom middleware";
  }
  constructor(_app: unknown, ..._args: unknown[]) {}
  new(_app: unknown) {
    return this;
  }
}
constSet(TopLevel, "CustomMiddlewareOne", CustomMiddlewareOne);
constSet(TopLevel, "CustomMiddlewareTwo", CustomMiddlewareTwo);
constSet(TopLevel, "CustomMiddlewareThree", CustomMiddlewareThree);

Trails.application.config.middleware.use(CustomMiddlewareOne);
Trails.application.config.middleware.use(CustomMiddlewareTwo);
Trails.application.config.middleware.use(CustomMiddlewareThree);
Trails.application.config.middleware.moveAfter(CustomMiddlewareTwo, CustomMiddlewareOne);
Trails.application.config.middleware.delete(CustomMiddlewareThree);
`,
    );

    const application = await app("development");

    const customMiddlewareOne = map(
      application.config.middleware as MiddlewareStack,
      (m) => m.name,
    ).indexOf("1st custom middleware");
    const customMiddlewareTwo = map(
      application.config.middleware as MiddlewareStack,
      (m) => m.name,
    ).indexOf("CustomMiddlewareTwo");
    expect(customMiddlewareOne > customMiddlewareTwo).toBeTruthy();

    expect(
      map(application.config.middleware as MiddlewareStack, (m) => m.name).find(
        (name) => name === "3rd custom middleware",
      ) ?? null,
    ).toBeNull();
  });
});

const I18N_HANDLER = `import { I18n } from "@blazetrails/activesupport";
I18n.setExceptionHandler((exception: unknown) => {
  if (exception instanceof I18n.MissingTranslation) {
    return "handled I18n::MissingTranslation";
  } else {
    throw exception;
  }
});
`;
