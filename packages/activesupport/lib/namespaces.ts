import { LoadError, warn, TopLevel, constSet } from "@blazetrails/ruby-compat";
import { extend, type Extended } from "@blazetrails/ruby-compat/include";
import * as Autoload from "./dependencies/autoload.js";
import type { BroadcastLogger } from "./broadcast-logger.js";
import type { CacheStore } from "./cache/index.js";
import type { CompletableExecution } from "./execution-wrapper.js";
import type { Duration } from "./duration.js";
import type { EnvironmentInquirer } from "./environment-inquirer.js";
import type { ErrorReporter } from "./error-reporter.js";
import type { HashWithIndifferentAccess } from "./hash-with-indifferent-access.js";
import type * as Inflector from "./inflector.js";
import type { Logger } from "./logger.js";
import type { MessagePack } from "./message-pack.js";

type AutoloadModule = Autoload.Autoload & Extended<typeof Autoload>;

const loadPath: Record<string, () => Promise<unknown>> = {
  "active_support/message_pack": async () => {
    try {
      return await import("./message-pack.js");
    } catch (error) {
      const { code, message } = error as { code?: unknown; message?: unknown };
      if (
        (code !== "ERR_MODULE_NOT_FOUND" && code !== "MODULE_NOT_FOUND") ||
        !String(message).includes("@blazetrails/msgpack")
      ) {
        throw error;
      }
      warn(
        "ActiveSupport::MessagePack requires the msgpack gem, version 1.7.0 or later. " +
          'Please add it to your Gemfile: `gem "msgpack", ">= 1.7.0"`',
      );
      throw new LoadError("cannot load such file -- msgpack", { cause: error });
    }
  },
};

export const ActiveSupport = {
  name: "ActiveSupport",
  loadPath,
  Cache: { name: "ActiveSupport::Cache" },
  Concurrency: { name: "ActiveSupport::Concurrency" },
  Messages: { name: "ActiveSupport::Messages" },
  Testing: { name: "ActiveSupport::Testing" },
} as AutoloadModule & {
  Cache: { name: string } & Partial<typeof import("./cache.js")>;
  Concurrency: { name: string };
  JSON: typeof import("./json.js");
  Messages: { name: string };
  Testing: {
    name: string;
    SetupAndTeardown?: typeof import("./testing/setup-and-teardown.js");
  };
  XmlMini: typeof import("./xml-mini.js");
  LazyLoadHooks: typeof import("./lazy-load-hooks.js");
  BroadcastLogger: typeof BroadcastLogger;
  Duration: typeof Duration;
  HashWithIndifferentAccess: typeof HashWithIndifferentAccess;
  Inflector: typeof Inflector;
  MessagePack?: typeof MessagePack;
};
extend(ActiveSupport, Autoload);

interface PolymorphicBuilder {
  handleStringCall(target: unknown, str: string): string;
  handleClassCall(target: unknown, klass: unknown): string;
  handleModelCall(target: unknown, record: unknown): string;
}

interface ParametersInstance {
  hasKey(key: string): boolean;
  get(key: string): unknown;
  set(key: string, value: unknown): void;
}

export { TopLevel } from "@blazetrails/ruby-compat";

declare module "@blazetrails/ruby-compat" {
  interface TrailsConfiguration {
    generators(): {
      options: { get(namespace: unknown): Record<string, unknown> | undefined };
      orm?(): unknown;
    };
  }

  interface TopLevelConstants {
    I18n?: typeof import("@blazetrails/i18n");
    ActiveSupport?: typeof ActiveSupport;
    ActionView?: { name: string };
    Trails?: {
      env: EnvironmentInquirer;
      logger: Logger | null;
      cache: CacheStore | null;
      error: ErrorReporter;
      application: {
        config: {
          considerAllRequestsLocal: boolean;
          root?: string | null;
          loadDatabaseYaml(): Promise<Record<string, unknown>>;
          paths(): {
            get(
              path: string,
            ):
              | { firstSync(): string | undefined; toAry(): string[]; toA(): Promise<string[]> }
              | undefined;
          };
        };
        initialized(): boolean;
        initializeBang(): Promise<unknown>;
        reloadRoutesUnlessLoaded(): Promise<boolean | null> | undefined;
        routes(): {
          namedRoutes: { helperNames(): string[] };
          urlHelpers(): Record<`${string}Url`, (...args: unknown[]) => string>;
        };
        envConfig(): Record<string, unknown>;
        credentials(): Promise<{ dig(key: string, ...identifiers: string[]): unknown }>;
        executor: {
          wrap<T>(block: () => T): T;
          runBang(): CompletableExecution | Promise<CompletableExecution>;
          perform<T>(block: () => T): T;
        };
        configFor(name: string): Promise<unknown>;
        loadSeed(): Promise<void>;
        migrationRailties(): Array<{
          railtieName: string;
          root(): string | null;
          paths?(): { get(path: string): { first(): Promise<string | undefined> } | undefined };
        }>;
        call(env: Record<string, unknown>): Promise<[number, Record<string, unknown>, unknown]>;
      } | null;
      Application: abstract new (...args: never[]) => unknown;
      Generators?: { configureBang(config: unknown): void };
      Engine: abstract new (...args: never[]) => unknown;
      Trailtie: abstract new (...args: never[]) => unknown;
      root(): string | null | undefined;
      configuration?: TrailsConfiguration | null;
    };
    ActionDispatch?: {
      Request: new (env: Record<string, unknown>) => {
        isGet(): boolean;
        isHead(): boolean;
        session: { get(key: string): unknown; set(key: string, value: unknown): unknown };
      };
      Routing: {
        PolymorphicRoutes: {
          HelperMethodBuilder: { path(): PolymorphicBuilder; url(): PolymorphicBuilder };
        };
        UrlFor?: object;
      };
    };
    ActionController?: { Parameters: new (...args: never[]) => ParametersInstance };
    ActiveRecord?: {
      Railties: { ControllerRuntime?: object };
      Base?: { logger: unknown };
      afterAllTransactionsCommit(block: () => unknown): unknown;
    };
    PG?: { Connection: abstract new (...args: never[]) => object };
    ActionCable?: { name?: string; Engine?: unknown; server?(): unknown };
    BCrypt?: {
      Engine: { readonly MIN_COST: number; readonly cost: number };
      Password: {
        create(secret: unknown, options?: { cost?: number | false | null }): object;
        new (rawHash: string): { readonly salt: string; isPassword(secret: unknown): boolean };
      };
    };
    AppBuilder?: new (generator: never) => object;
    PluginBuilder?: new (generator: never) => object;
  }
}

constSet(TopLevel, "ActiveSupport", ActiveSupport);
