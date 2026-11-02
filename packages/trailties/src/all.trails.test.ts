import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { useInMemoryDatabaseUrl } from "./support/in-memory-database-url.js";
import "./all.js";
import { Base } from "@blazetrails/activejob";
import { Base as RecordBase } from "@blazetrails/activerecord";
import { rbObjRespondTo } from "@blazetrails/ruby-compat";
import { Application } from "./application.js";
import { Trails } from "./rails.js";

describe("rails/all", () => {
  useInMemoryDatabaseUrl();

  it("types every framework's Configuration for a consumer that only imports all", () => {
    const root = fileURLToPath(new URL("..", import.meta.url));
    const dir = mkdtempSync(`${root}.all-consumer-`);
    try {
      writeFileSync(
        `${dir}/consumer.ts`,
        `import "../dist/all.js";
import { Application } from "../dist/index.js";
export function read(config: InstanceType<typeof Application>["config"]) {
  return [config.activeRecord, config.actionController, config.actionView, config.activeJob, config.i18n];
}
`,
      );
      writeFileSync(
        `${dir}/tsconfig.json`,
        JSON.stringify({
          extends: "../tsconfig.json",
          compilerOptions: {
            noEmit: true,
            composite: false,
            incremental: false,
            rootDir: "..",
            skipLibCheck: true,
          },
          include: [],
          files: ["consumer.ts"],
          references: [],
        }),
      );
      expect(() =>
        execFileSync("pnpm", ["exec", "tsc", "-p", dir], { cwd: root, encoding: "utf8" }),
      ).not.toThrow();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, 120_000);

  it("boots every framework trailtie an app that only imports all.ts", async () => {
    class AllBootApp extends Application {}
    Application.register(AllBootApp);
    const app = AllBootApp.instance();
    await app.initializeBang();

    for (const framework of [
      "activeSupport",
      "activeModel",
      "activeRecord",
      "activeJob",
      "actionDispatch",
      "actionController",
      "actionView",
    ]) {
      expect(app.deprecators.get(framework), framework).toBeDefined();
    }
    expect(app.config.activeJob).toBeDefined();
    expect(Base.queueAdapterName).toBe("test");
    expect(Base.logger).toBe(Trails.logger);
    expect(rbObjRespondTo(RecordBase, "hasOneAttached")).toBe(true);
  });
});
