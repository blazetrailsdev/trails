import { describe, it, expect } from "vitest";
import { useInMemoryDatabaseUrl } from "../support/in-memory-database-url.js";
import { runTrailtieInitializers } from "../support/trailtie-initializers.js";
import { Trailtie } from "./active-record.js";
import {
  Deprecators,
  Logger,
  NotificationEvent,
  Notifications,
  resetLoadHooks,
  runLoadHooks,
} from "@blazetrails/activesupport";
import {
  ActionController,
  Callbacks,
  MiddlewareStack,
  Request,
  Response,
} from "@blazetrails/actionpack";
import {
  ActiveRecord,
  Base,
  LogSubscriber,
  Migration,
  RuntimeRegistry,
  disablePreparedStatements,
  generateSecureTokenOn,
  queryLogs,
  queryTransformers,
  setDisablePreparedStatements,
  setGenerateSecureTokenOn,
  setQueryTransformers,
  setVerboseQueryLogs,
} from "@blazetrails/activerecord";
import { Configuration } from "../application/configuration.js";
import { Configuration as TrailtieConfiguration } from "../trailtie/configuration.js";
import { MiddlewareStackProxy } from "../configuration.js";
import { Trails } from "../rails.js";
import type { ActiveRecordConfig } from "./active-record.js";

const blogApp = (): {
  config: { filterParameters: Array<string | RegExp> };
  deprecators: Deprecators;
} => ({
  deprecators: new Deprecators(),
  config: { filterParameters: [] },
});

describe("RailtieTest (trails-only)", () => {
  useInMemoryDatabaseUrl();

  it("runInitializers includes ControllerRuntime into ActionController::Base", async () => {
    await runTrailtieInitializers(Trailtie, blogApp());
    class LogRuntimeController extends ActionController.Base {}
    runLoadHooks("action_controller", LogRuntimeController);

    const events: Record<string, unknown>[] = [];
    const subscriber = Notifications.subscribe(
      "process_action.action_controller",
      (event: { payload: Record<string, unknown> }) => {
        events.push({ ...event.payload });
      },
    );

    class WidgetsController extends LogRuntimeController {
      static actions = ["index"];
      index(): void {
        RuntimeRegistry.setSqlRuntime(RuntimeRegistry.sqlRuntime() + 12.0);
        RuntimeRegistry.setQueriesCount(RuntimeRegistry.queriesCount() + 1);
        this.head(204);
      }
    }

    try {
      await new WidgetsController().dispatch(
        "index",
        new Request({ REQUEST_METHOD: "GET", PATH_INFO: "/widgets", HTTP_HOST: "localhost" }),
        new Response(),
      );
    } finally {
      Notifications.unsubscribe(subscriber);
    }

    expect(events).toHaveLength(1);
    expect(events[0].db_runtime).toBe(12.0);
    expect(events[0].queries_count).toBe(1);
    expect(events[0].cached_queries_count).toBe(0);
    expect(LogRuntimeController.logProcessAction(events[0])).toContain(
      "ActiveRecord: 12.0ms (1 query, 0 cached)",
    );
  });

  it("config.loadDefaults 7.1 makes generate_secure_token_on initialize on a booted app", async () => {
    const saved = Trailtie.config.get("activeRecord");
    try {
      const config = new Configuration();
      config.set("activeRecord", { encryption: {} });
      config.loadDefaults("7.1");

      await runTrailtieInitializers(Trailtie, blogApp());

      expect(generateSecureTokenOn()).toBe("initialize");
    } finally {
      Trailtie.config.set("activeRecord", saved);
      setGenerateSecureTokenOn("create");
    }
  });

  it("active_record.backtrace_cleaner points the verbose query log at the app frame", async () => {
    const saved = Trailtie.config.get("activeRecord");
    const savedCleaner = LogSubscriber.backtraceCleaner;
    const savedLogger = Base.logger;
    const debug: string[] = [];
    const logger = new Logger(null);
    logger.debug = (message?: string | (() => string)): boolean => {
      debug.push(typeof message === "function" ? message() : (message ?? ""));
      return true;
    };
    try {
      Trailtie.config.set("activeRecord", { ...(saved as object), verboseQueryLogs: true });
      Trails.backtraceCleaner.setRoot("/srv/blog");
      Base.logger = logger;

      await runTrailtieInitializers(Trailtie, blogApp());

      const event = new NotificationEvent("sql.active_record", null, null, "id", {
        sql: "SELECT 1",
      });
      const postsIndex = new Function(
        "subscriber",
        "event",
        "subscriber.sql(event);\n//# sourceURL=/srv/blog/app/models/post.js",
      ) as (subscriber: LogSubscriber, event: NotificationEvent) => void;
      postsIndex(new LogSubscriber(), event);

      expect(LogSubscriber.backtraceCleaner).toBe(Trails.backtraceCleaner);
      expect(debug[debug.length - 1]).toBe("  ↳ app/models/post.js:3:in 'eval'");
    } finally {
      Trailtie.config.set("activeRecord", saved);
      Trails.backtraceCleaner.setRoot(undefined);
      LogSubscriber.backtraceCleaner = savedCleaner;
      Base.logger = savedLogger;
      setVerboseQueryLogs(false);
    }
  });

  it("pushes the ActiveRecord namespace onto config.eagerLoadNamespaces", () => {
    expect(Trailtie.config.eagerLoadNamespaces).toContain(ActiveRecord);
  });

  describe("active_record.migration_error", () => {
    const mergedStack = async (migrationError: ActiveRecordConfig["migrationError"]) => {
      const saved = Trailtie.config.get("activeRecord") as ActiveRecordConfig;
      const savedProxy = TrailtieConfiguration._appMiddleware;
      TrailtieConfiguration._appMiddleware = new MiddlewareStackProxy();
      try {
        Trailtie.config.set("activeRecord", { ...saved, migrationError });
        const fileWatcher = class {};
        await runTrailtieInitializers(Trailtie, {
          ...blogApp(),
          config: { filterParameters: [], fileWatcher },
        });
        const stack = new MiddlewareStack();
        stack.use(Callbacks as never);
        Trailtie.config.appMiddleware().mergeInto(stack);
        return { stack, fileWatcher };
      } finally {
        Trailtie.config.set("activeRecord", saved);
        TrailtieConfiguration._appMiddleware = savedProxy;
      }
    };

    it("inserts CheckPending after ActionDispatch::Callbacks when set to page_load", async () => {
      const { stack, fileWatcher } = await mergedStack("page_load");

      expect(stack.middlewares.map((m) => m.klass)).toEqual([Callbacks, Migration.CheckPending]);
      expect(stack.middlewares[1].args).toEqual([{ fileWatcher }]);
    });

    it("does not insert CheckPending otherwise", async () => {
      const { stack } = await mergedStack(false);

      expect(stack.includes(Migration.CheckPending as never)).toBe(false);
    });
  });

  describe("active_record.query_log_tags_config", () => {
    const boot = async (cfg: Partial<ActiveRecordConfig>, loadDefaults?: string) => {
      const saved = Trailtie.config.get("activeRecord") as ActiveRecordConfig;
      const savedTransformers = queryTransformers();
      const savedDisable = disablePreparedStatements();
      const savedTags = queryLogs.tags;
      const savedFormatter = queryLogs.tagsFormatter;
      const savedTaggings = queryLogs.taggings;
      setQueryTransformers([]);
      resetLoadHooks();
      class BlogApplication {}
      Trails.application = new BlogApplication() as never;
      try {
        Trailtie.config.set("activeRecord", { ...saved, ...cfg });
        const config = new Configuration();
        if (loadDefaults) config.loadDefaults(loadDefaults);
        const app = { deprecators: new Deprecators(), config };
        await runTrailtieInitializers(Trailtie, app);
        runLoadHooks("after_initialize", app);
        return {
          transformers: [...queryTransformers()],
          disablePreparedStatements: disablePreparedStatements(),
          tagsFormatter: queryLogs.tagsFormatter,
          application: queryLogs.taggings.application,
          taggingKeys: Object.keys(queryLogs.taggings),
        };
      } finally {
        Trails.application = null;
        Trailtie.config.set("activeRecord", saved);
        setQueryTransformers(savedTransformers);
        setDisablePreparedStatements(savedDisable);
        queryLogs.tags = savedTags;
        queryLogs.tagsFormatter = savedFormatter;
        queryLogs.taggings = savedTaggings;
        resetLoadHooks();
      }
    };

    it("does not modify the query execution path by default", async () => {
      const booted = await boot({});

      expect(booted.transformers).not.toContain(queryLogs);
    });

    it("prepends the query execution path and disables prepared statements when enabled", async () => {
      const booted = await boot({ queryLogTagsEnabled: true });

      expect(booted.transformers).toContain(queryLogs);
      expect(booted.disablePreparedStatements).toBe(true);
      expect(booted.application).toBe("BlogApplication");
      expect(booted.taggingKeys).toEqual([
        "application",
        "pid",
        "socket",
        "db_host",
        "database",
        "source_location",
      ]);
    });

    it("config.loadDefaults 7.1 makes the tags formatter sqlcommenter on a booted app", async () => {
      const booted = await boot({ queryLogTagsEnabled: true }, "7.1");

      expect(booted.tagsFormatter).toBe("sqlcommenter");
    });
  });
});
