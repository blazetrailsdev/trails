import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { Trailtie as I18nTrailtie } from "../../lib/trailties/i18n.js";

beforeEach(() => {
  I18nTrailtie._i18nInited = true;
});

afterEach(() => {
  I18nTrailtie._i18nInited = false;
});
import {
  Deprecators,
  EncryptedConfiguration,
  resetLoadHooks,
  runLoadHooks,
} from "@blazetrails/activesupport";
import {
  disablePreparedStatements,
  QueryLogs,
  queryTransformers,
  setDisablePreparedStatements,
  setQueryTransformers,
} from "@blazetrails/activerecord";
import { runTrailtieInitializers } from "../support/trailtie-initializers.js";
import { Trailtie } from "../../lib/trailties/active-record.js";
import type { ActiveRecordConfig } from "../../lib/trailties/active-record.js";
import { Configuration } from "../../lib/application/configuration.js";
import { Trails } from "../../lib/trails.js";

const credentials = async (dir = "/nonexistent"): Promise<EncryptedConfiguration> => {
  const encrypted = new EncryptedConfiguration({
    configPath: `${dir}/credentials.yml.enc`,
    keyPath: `${dir}/master.key`,
    envKey: "TRAILS_MASTER_KEY",
    raiseIfMissingKey: false,
  });
  await encrypted.config();
  return encrypted;
};

describe("QueryLogsTest", () => {
  const boot = async (cfg: Partial<ActiveRecordConfig>, loadDefaults?: string) => {
    const saved = Trailtie.config.get("activeRecord") as ActiveRecordConfig;
    const savedTransformers = queryTransformers();
    const savedDisable = disablePreparedStatements();
    const savedTags = QueryLogs.tags;
    const savedFormatter = QueryLogs.tagsFormatter;
    const savedTaggings = QueryLogs.taggings;
    setQueryTransformers([]);
    resetLoadHooks();
    const config = new Configuration("/app");
    class BlogApplication {
      autoloaders = { main: { onUnload() {} } };
      config = config;
    }
    Trails.application = new BlogApplication() as never;
    try {
      Trailtie.config.set("activeRecord", { ...saved, ...cfg });
      if (loadDefaults) config.loadDefaults(loadDefaults);
      const app = {
        deprecators: new Deprecators(),
        config,
        credentials,
        executor: { toRun() {} },
      };
      await runTrailtieInitializers(Trailtie, app);
      await runLoadHooks("after_initialize", app);
      return {
        transformers: [...queryTransformers()],
        disablePreparedStatements: disablePreparedStatements(),
        tagsFormatter: QueryLogs.tagsFormatter,
        application: QueryLogs.taggings.application,
        taggingKeys: Object.keys(QueryLogs.taggings),
      };
    } finally {
      Trails.application = null;
      Trailtie.config.set("activeRecord", saved);
      setQueryTransformers(savedTransformers);
      setDisablePreparedStatements(savedDisable);
      QueryLogs.tags = savedTags;
      QueryLogs.tagsFormatter = savedFormatter as string;
      QueryLogs.taggings = savedTaggings;
      resetLoadHooks();
    }
  };

  it("does not modify the query execution path by default", async () => {
    const booted = await boot({});

    expect(booted.transformers).not.toContain(QueryLogs);
  });

  it("appends QueryLogs to the query transformers and disables prepared statements when enabled", async () => {
    const booted = await boot({ queryLogTagsEnabled: true });

    expect(booted.transformers).toContain(QueryLogs);
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
