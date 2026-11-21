import { Dir, FileUtils, Open3, getProcessAdapter } from "@blazetrails/ruby-compat";
import { Deprecators, EncryptedConfiguration, FileUpdateChecker } from "@blazetrails/activesupport";
import { useInMemoryDatabaseUrl } from "../support/in-memory-database-url.js";
import { runTrailtieInitializers } from "../support/trailtie-initializers.js";
import { Trailtie } from "../../lib/trailties/active-record.js";
import { Configuration } from "../../lib/application/configuration.js";
import { Configuration as TrailtieConfiguration } from "../../lib/trailtie/configuration.js";
import { describe, expect, it } from "vitest";

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

const blogApp = (): {
  config: Configuration;
  deprecators: Deprecators;
  credentials: typeof credentials;
} => ({
  deprecators: new Deprecators(),
  config: Object.assign(new Configuration("/nonexistent-app"), { filterParameters: [] }),
  credentials,
});

describe("the reloader drives the main autoloader", () => {
  it("reload constants on development", async () => {
    const script = decodeURIComponent(
      new URL("../fixtures/reload-app/serve-edited-controller.mjs", import.meta.url).pathname,
    );
    const [stdout] = await Open3.capture3(getProcessAdapter().execPath!(), script);
    expect(JSON.parse(String(stdout).trim().split("\n").at(-1)!)).toEqual({
      before: 1,
      after: 2,
      tracked: true,
      newClass: true,
      newParent: true,
      oldClassExcluded: true,
    });
  }, 60_000);
});

describe("ActiveRecord::Railtie active_record.add_watchable_files", () => {
  useInMemoryDatabaseUrl();

  it("added files (like db/schema.rb) also trigger reloading", async () => {
    const tmp = Dir.mktmpdir("add-watchable-files");
    const watchableFiles = new TrailtieConfiguration().watchableFiles;
    const before = watchableFiles.length;
    try {
      await runTrailtieInitializers(Trailtie, {
        ...blogApp(),
        config: Object.assign(new Configuration(tmp), { filterParameters: [] }),
      });
      expect(watchableFiles.slice(before)).toEqual([
        `${tmp}/db/schema.ts`,
        `${tmp}/db/structure.sql`,
      ]);

      const checker = new FileUpdateChecker(watchableFiles.slice(before), {}, () => {});
      expect(checker.isUpdated()).toBe(false);
      FileUtils.mkdirP(`${tmp}/db`);
      FileUtils.touch(`${tmp}/db/schema.ts`);
      expect(checker.isUpdated()).toBe(true);
    } finally {
      watchableFiles.splice(before);
      FileUtils.rmRf(tmp);
    }
  });
});
